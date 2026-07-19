// =============================================================
// 撮影条件・骨格検出品質から解析結果の信頼度を判定するレイヤー。
// 既存の analysis/evaluation.ts・formSummary.ts のロジック（★評価・
// スコア計算式）はそのまま再利用し、このモジュールは
// 「その評価をそのまま使ってよいか（信頼度）」だけを追加で判定する。
//
// 各特徴量には既に landmark visibility ベースの confidence(0〜1)が
// 付与されている（analysis/skills/spikeJump.ts の calculateVisibilityConfidence）。
// これに撮影条件（カメラ距離・画角・方向）による補正を掛け合わせ、
// カテゴリごとに「正常に測定 / 参考値 / 評価不能 / 未計測」を判定する。
//
// 撮影条件×評価カテゴリの相関テーブルを持つ src/ai/captureConfidence.ts も
// 既に存在するが、そちらは ai/spikeFormEvaluation.ts 用の評価カテゴリ体系
// （EvaluationCategoryId）に基づいており、ここで使う
// FormCategoryKey（助走/踏切/空中姿勢/スイング/着地）とは分類が異なるため、
// 無理に接続せず、CaptureSettings由来の簡易な補正係数をこのファイル内で
// 新たに定義する。
// =============================================================
import type { CaptureSettings } from "../ai/captureSettings";
import {
  FORM_CATEGORY_LABELS,
  getEvaluatedFeatures,
  isOverallScoreCategory,
  rankFromScore,
  scoreFromStars,
  type EvaluatedFeature,
  type FormCategoryKey,
  type FormCategorySummary,
  type FormSummary,
} from "./formSummary";
import type { Feature } from "../analysis/types";
import type { ConfidenceQualitySignals } from "../ai/trackingQualitySignals";
import { ENABLE_CONFIDENCE_V2 } from "../ai/featureFlags";

export type MeasurementStatus =
  | "measured"
  | "reference"
  | "unavailable"
  | "notMeasured";

export type ConfidenceLevel = "high" | "medium" | "low" | "unknown";

/** 平均confidenceがこの値以上なら「正常に測定」 */
const MEASURED_MIN_CONFIDENCE = 0.55;
/** 平均confidenceがこの値以上なら「参考値」、未満なら「評価不能」 */
const REFERENCE_MIN_CONFIDENCE = 0.32;
/** トラッキングされたフレーム数がこれ未満なら警告を出す目安 */
const LOW_FRAME_COUNT_WARNING = 30;

function captureSettingsFactor(settings: CaptureSettings): number {
  let factor = 1;

  if (settings.distance === "far") factor *= 0.78;
  else if (settings.distance === "unknown") factor *= 0.92;

  if (settings.framing === "far") factor *= 0.75;
  else if (settings.framing === "wide") factor *= 0.88;
  else if (settings.framing === "unknown") factor *= 0.92;

  if (settings.cameraView === "unknown") factor *= 0.95;

  return Math.max(0.3, Math.min(1, factor));
}

export type CategoryStatusSummary = FormCategorySummary & {
  status: MeasurementStatus;
  /** 撮影条件補正後の平均confidence（0〜1）。データがない場合はnull */
  confidence: number | null;
};

export type ConfidenceAwareFormSummary = {
  categories: CategoryStatusSummary[];
  overallStars: number | null;
  overallScore: number | null;
  rank: FormSummary["rank"];
  strengths: EvaluatedFeature[];
  improvements: EvaluatedFeature[];
  confidenceLevel: ConfidenceLevel;
  confidenceOverall: number | null;
  confidenceWarnings: string[];
  /** 信頼度算出方式のバージョン。2 = 品質シグナルによる追加減点あり（Phase1）、1 = 従来方式 */
  confidenceVersion: 1 | 2;
};

function classifyByConfidence(confidence: number): MeasurementStatus {
  if (confidence >= MEASURED_MIN_CONFIDENCE) return "measured";
  if (confidence >= REFERENCE_MIN_CONFIDENCE) return "reference";
  return "unavailable";
}

// =============================================================
// 信頼度算出v2（Phase1）: 既存のvisibilityベース信頼度・着地除外の
// 集計方法（isOverallScoreCategory）は変更せず、トラッキング品質の
// 追加シグナルによる「小さな減点」だけを上乗せする。既存スコアの
// 全面置き換えではないため、最大減点幅は MAX_QUALITY_PENALTY_RATIO に
// 固定してある（既存の解析結果を大きく崩さないため）。
// ENABLE_CONFIDENCE_V2 が false、または qualitySignals が渡されない
// 場合は、この節は一切作動せず従来（v1）の挙動と完全に一致する。
// =============================================================

/** 品質シグナルによる減点の合計上限（相対比）。既存スコアを大きく崩さないための上限 */
const MAX_QUALITY_PENALTY_RATIO = 0.25;

type QualityPenaltyRule = {
  /** signals から評価対象の値を取り出す */
  read: (signals: ConfidenceQualitySignals) => number | null;
  /** true の場合「値が閾値を下回ったら」トリガー、falseなら「上回ったら」トリガー */
  triggerWhenBelow: boolean;
  /** この値を超えた/下回ったら警告・減点の対象とする */
  threshold: number;
  /** 加算する減点比率 */
  penalty: number;
  /** ユーザー向けの日本語メッセージ（技術用語は使わない） */
  message: string;
};

const QUALITY_PENALTY_RULES: QualityPenaltyRule[] = [
  {
    read: (s) => s.averageTrackerMatchScore,
    triggerWhenBelow: true, // マッチスコアは高いほど良いため、閾値未満で発火
    threshold: 0.55,
    penalty: 0.08,
    message: "人物追跡が一部不安定でした",
  },
  {
    read: (s) => s.coastingFrameRatio,
    triggerWhenBelow: false,
    threshold: 0.15,
    penalty: 0.05,
    message: "人物追跡が一部不安定でした",
  },
  {
    read: (s) => s.interpolatedRatio,
    triggerWhenBelow: false,
    threshold: 0.2,
    penalty: 0.07,
    message: "ランドマークの補間が多くなっています",
  },
  {
    read: (s) => s.lowConfidenceFrameRatio,
    triggerWhenBelow: false,
    threshold: 0.2,
    penalty: 0.07,
    message: "一部の関節の認識精度が低くなっています",
  },
  {
    read: (s) => s.lateralityCorrectionRatio,
    triggerWhenBelow: false,
    threshold: 0.05,
    penalty: 0.06,
    message: "左右の関節位置の補正が複数回発生しました",
  },
  {
    read: (s) => s.abnormalJumpRatio,
    triggerWhenBelow: false,
    threshold: 0.08,
    penalty: 0.05,
    message: "人物追跡が一部不安定でした",
  },
];

function computeQualityPenalty(signals: ConfidenceQualitySignals): {
  penaltyRatio: number;
  reasons: string[];
} {
  let penaltyRatio = 0;
  const reasons = new Set<string>();

  for (const rule of QUALITY_PENALTY_RULES) {
    const value = rule.read(signals);
    if (value === null || !Number.isFinite(value)) continue;

    const triggered = rule.triggerWhenBelow ? value < rule.threshold : value > rule.threshold;

    if (triggered) {
      penaltyRatio += rule.penalty;
      reasons.add(rule.message);
    }
  }

  return {
    penaltyRatio: Math.min(penaltyRatio, MAX_QUALITY_PENALTY_RATIO),
    reasons: Array.from(reasons),
  };
}

/**
 * 特徴量・撮影条件から、既存のformSummaryと同じ★/スコア計算式を使いつつ
 * カテゴリごとの測定可否ステータスを追加した集計を作る。
 * 評価不能(unavailable)・未計測(notMeasured)のカテゴリは
 * 総合スコアの計算対象から除外する（0点扱いにはしない）。
 */
export function buildConfidenceAwareSummary(
  features: Feature[],
  captureSettings: CaptureSettings,
  trackedFrameCount?: number,
  qualitySignals?: ConfidenceQualitySignals
): ConfidenceAwareFormSummary {
  const evaluated = getEvaluatedFeatures(features);
  const settingsFactor = captureSettingsFactor(captureSettings);

  const qualityPenalty =
    ENABLE_CONFIDENCE_V2 && qualitySignals
      ? computeQualityPenalty(qualitySignals)
      : { penaltyRatio: 0, reasons: [] as string[] };
  const confidenceVersion: 1 | 2 = ENABLE_CONFIDENCE_V2 && qualitySignals ? 2 : 1;

  const categories: CategoryStatusSummary[] = (
    Object.keys(FORM_CATEGORY_LABELS) as FormCategoryKey[]
  ).map((key) => {
    const items = evaluated.filter((item) => item.category === key);

    if (items.length === 0) {
      return {
        key,
        label: FORM_CATEGORY_LABELS[key],
        stars: null,
        score: null,
        featureCount: 0,
        status: "notMeasured",
        confidence: null,
      };
    }

    const rawConfidence =
      items.reduce((sum, item) => sum + item.feature.confidence, 0) / items.length;
    const confidence = Math.max(
      0,
      Math.min(1, rawConfidence * settingsFactor * (1 - qualityPenalty.penaltyRatio))
    );
    const status = classifyByConfidence(confidence);

    if (status === "unavailable") {
      return {
        key,
        label: FORM_CATEGORY_LABELS[key],
        stars: null,
        score: null,
        featureCount: items.length,
        status,
        confidence,
      };
    }

    const avgStars =
      items.reduce((sum, item) => sum + item.evaluation.stars, 0) / items.length;

    return {
      key,
      label: FORM_CATEGORY_LABELS[key],
      stars: avgStars,
      score: scoreFromStars(avgStars),
      featureCount: items.length,
      status,
      confidence,
    };
  });

  // 評価不能・未計測に加え、表示専用の着地カテゴリも総合スコアから除外する。
  const scoredCategories = categories.filter(
    (c) => c.stars !== null && isOverallScoreCategory(c.key)
  );
  const overallStars =
    scoredCategories.length > 0
      ? scoredCategories.reduce((sum, c) => sum + (c.stars ?? 0), 0) / scoredCategories.length
      : null;
  const overallScore = overallStars !== null ? scoreFromStars(overallStars) : null;
  const rank = overallScore !== null ? rankFromScore(overallScore) : null;

  // 強み・改善点は評価不能カテゴリの特徴量を含めない（低精度データを断定的なコメントにしないため）。
  const reliableCategoryKeys = new Set(
    categories.filter((c) => c.status === "measured" || c.status === "reference").map((c) => c.key)
  );
  const reliableEvaluated = evaluated.filter((item) => reliableCategoryKeys.has(item.category));

  const strengths = [...reliableEvaluated]
    .filter((item) => item.evaluation.stars >= 4)
    .sort((a, b) => b.evaluation.stars - a.evaluation.stars)
    .slice(0, 4);

  const improvements = [...reliableEvaluated]
    .filter((item) => item.evaluation.stars <= 3)
    .sort((a, b) => a.evaluation.stars - b.evaluation.stars)
    .slice(0, 4);

  const confidenceValues = categories
    .map((c) => c.confidence)
    .filter((v): v is number => v !== null);
  const confidenceOverall =
    confidenceValues.length > 0
      ? confidenceValues.reduce((sum, v) => sum + v, 0) / confidenceValues.length
      : null;

  const confidenceLevel: ConfidenceLevel =
    confidenceOverall === null
      ? "unknown"
      : confidenceOverall >= MEASURED_MIN_CONFIDENCE
      ? "high"
      : confidenceOverall >= REFERENCE_MIN_CONFIDENCE
      ? "medium"
      : "low";

  const confidenceWarnings = [
    ...buildConfidenceWarnings({
      captureSettings,
      categories,
      trackedFrameCount,
    }),
    ...qualityPenalty.reasons,
  ];

  return {
    categories,
    overallStars,
    overallScore,
    rank,
    strengths,
    improvements,
    confidenceLevel,
    confidenceOverall,
    confidenceWarnings,
    confidenceVersion,
  };
}

export function buildConfidenceWarnings(args: {
  captureSettings: CaptureSettings;
  categories: CategoryStatusSummary[];
  trackedFrameCount?: number;
}): string[] {
  const warnings: string[] = [];
  const { captureSettings, categories } = args;

  if (captureSettings.distance === "far") {
    warnings.push("撮影距離が遠いため、関節角度の精度が低い可能性があります");
  }
  if (captureSettings.framing === "far" || captureSettings.framing === "wide") {
    warnings.push("画角が広く選手が小さく映っているため、関節検出の精度が低下している可能性があります");
  }
  if (captureSettings.cameraView === "unknown") {
    warnings.push("撮影方向が未入力のため、評価の精度に影響する可能性があります");
  }

  const unavailableCategories = categories.filter((c) => c.status === "unavailable");
  if (unavailableCategories.length > 0) {
    warnings.push(
      `骨格検出が不安定なため、${unavailableCategories.map((c) => c.label).join("・")}は評価対象から除外しました`
    );
  }

  const referenceCategories = categories.filter((c) => c.status === "reference");
  if (referenceCategories.length > 0) {
    warnings.push(
      `${referenceCategories.map((c) => c.label).join("・")}は精度がやや低いため参考値として扱っています`
    );
  }

  if (typeof args.trackedFrameCount === "number" && args.trackedFrameCount < LOW_FRAME_COUNT_WARNING) {
    warnings.push("トラッキングされたフレーム数が少なく、精度が低下している可能性があります");
  }

  return warnings;
}

export function measurementStatusLabel(status: MeasurementStatus): string {
  switch (status) {
    case "measured":
      return "正常に測定";
    case "reference":
      return "参考値";
    case "unavailable":
      return "評価不能";
    case "notMeasured":
      return "未計測";
  }
}

export function confidenceLevelLabel(level: ConfidenceLevel): string {
  switch (level) {
    case "high":
      return "高";
    case "medium":
      return "中";
    case "low":
      return "低";
    case "unknown":
      return "判定不能";
  }
}
