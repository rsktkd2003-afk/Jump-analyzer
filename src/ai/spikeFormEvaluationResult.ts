// =============================================================
// スパイクフォーム評価: カテゴリ集計・総合スコア・結果組み立て。
// spikeFormEvaluation.ts から分離した、51指標(EvaluationMetric[])を
// カテゴリ集計し、overallScore・priorityMetrics・aerialPostureScore/星評価を
// 算出して最終的なSpikeFormEvaluationResultを組み立てる専用モジュール。
// 51指標自体の測定処理(spikeFormMetrics.ts)や、runJumpPhaseEngineの実行
// (spikeFormEvaluation.ts)はこのファイルの責務ではない。
// =============================================================

import type { TrackedFrame } from "./trackingAnalyzer";
import type { JumpPhaseEngineResult } from "./jumpPhaseEngine";
import { scoreToStars, type StarRating } from "./aerialPostureScoring";
import type {
  EvaluationCategory,
  EvaluationCategoryId,
  EvaluationMetric,
  SpikeArmForm,
  SpikeFormEvaluationResult,
} from "./spikeFormEvaluationTypes";

const FORM_LABELS: Record<SpikeArmForm, string> = {
  straightArm: "ストレートアーム",
  bowAndArrow: "ボーアンドアロー",
  circularArm: "サーキュラーアーム",
};

const CATEGORY_LABELS: Record<EvaluationCategoryId, string> = {
  approach: "助走",
  takeoff: "踏切",
  flight: "ジャンプ",
  takeback: "テイクバック",
  hit: "打撃",
  airPosture: "空中姿勢",
  followThrough: "フォロースルー",
  landing: "着地",
  efficiency: "ジャンプ効率",
};

const CATEGORY_WEIGHTS: Record<EvaluationCategoryId, number> = {
  approach: 1.0,
  takeoff: 1.25,
  flight: 1.0,
  takeback: 1.05,
  hit: 1.25,
  airPosture: 0.9,
  followThrough: 0.65,
  landing: 0.85,
  efficiency: 1.1,
};

/**
 * 総合スコア・改善優先順位の算出から除外するカテゴリ。
 * 着地は安全性・参考評価として表示は維持しつつ、スパイクの総合評価には含めない。
 */
const SCORE_EXCLUDED_CATEGORIES: EvaluationCategoryId[] = ["landing"];

function weightedScore(items: Array<{ score: number | null; weight: number; confidence?: number }>): number | null {
  let total = 0;
  let weightSum = 0;
  for (const item of items) {
    if (item.score === null) continue;
    const w = item.weight * (item.confidence ?? 1);
    total += item.score * w;
    weightSum += w;
  }
  return weightSum > 0 ? total / weightSum : null;
}

/**
 * 開発環境専用のデバッグ出力。40°が星1になるような回帰を早期発見できるよう、
 * 測定値→スコア→星評価までの内訳を一括で確認できるようにする。
 * 本番ビルド（import.meta.env.DEV === false）では何も出力しない。
 */
function logAerialPostureDebug(
  frames: TrackedFrame[],
  engine: JumpPhaseEngineResult,
  airPostureCategory: EvaluationCategory | null,
  aerialPostureScore: number | null,
  aerialPostureStars: StarRating | null
): void {
  if (!import.meta.env.DEV) return;
  if (!airPostureCategory) return;

  const peakFrame = frames[engine.events.peakIndex] ?? null;
  const byId = (id: string) => airPostureCategory.metrics.find((m) => m.id === id) ?? null;

  console.debug("[airPosture]", {
    peakFrameIndex: engine.events.peakIndex,
    peakFrameTime: peakFrame?.time ?? null,
    lineAngleDeg: byId("aerialLineAngle")?.value ?? null,
    lineAngleScore: byId("aerialLineAngle")?.score ?? null,
    alignmentRatio: byId("aerialLineAlignment")?.value ?? null,
    alignmentScore: byId("aerialLineAlignment")?.score ?? null,
    extraMotionReversalCount: byId("aerialExtraMotion")?.value ?? null,
    extraMotionScore: byId("aerialExtraMotion")?.score ?? null,
    aerialPostureScore,
    aerialPostureStars,
  });
}

/**
 * 51指標(EvaluationMetric[])をカテゴリ集計し、overallScore・confidence・
 * priorityMetrics・aerialPostureScore/星評価まで含めた最終結果を組み立てる。
 * frames/engineはピーク周辺のデバッグログ(logAerialPostureDebug)にのみ使う。
 */
export function buildSpikeFormEvaluationResult(
  frames: TrackedFrame[],
  engine: JumpPhaseEngineResult,
  metrics: EvaluationMetric[],
  selectedForm: SpikeArmForm
): SpikeFormEvaluationResult {
  const categories = (Object.keys(CATEGORY_LABELS) as EvaluationCategoryId[]).map((id) => {
    const categoryMetrics = metrics.filter((m) => m.category === id);
    const score = weightedScore(categoryMetrics);
    return {
      id,
      label: CATEGORY_LABELS[id],
      score,
      weight: CATEGORY_WEIGHTS[id],
      metrics: categoryMetrics,
    };
  });

  // 着地は安全性・参考評価として扱い、スパイクの総合スコアには影響させない。
  const overallScore = weightedScore(
    categories
      .filter((c) => !SCORE_EXCLUDED_CATEGORIES.includes(c.id))
      .map((c) => ({ score: c.score, weight: c.weight, confidence: 1 }))
  );
  const validMetrics = metrics.filter((m) => m.score !== null);
  const confidence = validMetrics.length / metrics.length;
  const priorityMetrics = [...validMetrics]
    .filter((m) => !SCORE_EXCLUDED_CATEGORIES.includes(m.category))
    .filter((m) => (m.score ?? 100) < 78)
    .sort((a, b) => (a.score ?? 100) - (b.score ?? 100))
    .slice(0, 5);

  // 空中姿勢スコア・星評価は airPosture カテゴリの score をそのまま使う（別箇所での再計算はしない）。
  const airPostureCategory = categories.find((c) => c.id === "airPosture") ?? null;
  const aerialPostureScore = airPostureCategory?.score ?? null;
  const aerialPostureStars = aerialPostureScore === null ? null : scoreToStars(aerialPostureScore);

  logAerialPostureDebug(frames, engine, airPostureCategory, aerialPostureScore, aerialPostureStars);

  return {
    selectedForm,
    selectedFormLabel: FORM_LABELS[selectedForm],
    overallScore,
    confidence,
    categories,
    priorityMetrics,
    note: "この評価は通常動画の2D姿勢推定から数値化できる項目だけで採点しています。力感・力み・指先への力伝達などの感覚項目は含めていません。",
    aerialPostureScore,
    aerialPostureStars,
  };
}

export function formatMetricValue(metric: EvaluationMetric): string {
  if (metric.value === null) return "未計測";
  if (metric.unit === "deg") return `${metric.value.toFixed(1)}°`;
  if (metric.unit === "ms") return `${metric.value.toFixed(0)}ms`;
  if (metric.unit === "ratio") return `${(metric.value * 100).toFixed(0)}%`;
  if (metric.unit === "pxPerSec") return `${metric.value.toFixed(0)}px/s`;
  if (metric.unit === "px") return `${metric.value.toFixed(0)}px`;
  return metric.value.toFixed(2);
}
