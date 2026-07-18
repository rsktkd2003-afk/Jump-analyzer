import type { TrackedFrame } from "./trackingAnalyzer";
import { runJumpPhaseEngine, type JumpPhaseEngineResult } from "./jumpPhaseEngine";
import {
  AERIAL_ALIGNMENT_WEIGHT,
  AERIAL_ANGLE_WEIGHT,
  AERIAL_EXTRA_MOTION_WEIGHT,
  countDirectionReversals,
  FOOT_WOBBLE_MIN_AMPLITUDE_RATIO,
  scoreAerialAlignment,
  scoreAerialAngle,
  scoreExtraMotion,
  scoreToStars,
  TRUNK_WOBBLE_MIN_AMPLITUDE_DEG,
  WOBBLE_MIN_FRAME_GAP,
  WOBBLE_SMOOTHING_WINDOW,
  type StarRating,
} from "./aerialPostureScoring";
import {
  type EvaluationCategory,
  type EvaluationCategoryId,
  type EvaluationMetric,
  type SpikeArmForm,
  type SpikeFormEvaluationResult,
} from "./spikeFormEvaluationTypes";
import { evaluateSpikeFormMetrics } from "./spikeFormMetrics";

export {
  AERIAL_ALIGNMENT_WEIGHT,
  AERIAL_ANGLE_WEIGHT,
  AERIAL_EXTRA_MOTION_WEIGHT,
  countDirectionReversals,
  FOOT_WOBBLE_MIN_AMPLITUDE_RATIO,
  scoreAerialAlignment,
  scoreAerialAngle,
  scoreExtraMotion,
  scoreToStars,
  TRUNK_WOBBLE_MIN_AMPLITUDE_DEG,
  WOBBLE_MIN_FRAME_GAP,
  WOBBLE_SMOOTHING_WINDOW,
};
export type { StarRating };
export type {
  SpikeArmForm,
  EvaluationCategoryId,
  EvaluationMetric,
  EvaluationCategory,
  SpikeFormEvaluationResult,
};

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

export function evaluateSpikeForm(frames: TrackedFrame[], selectedForm: SpikeArmForm): SpikeFormEvaluationResult | null {
  if (frames.length < 8) return null;
  const engine = runJumpPhaseEngine(frames);
  if (!engine) return null;

  const metrics = evaluateSpikeFormMetrics(frames, engine, selectedForm);

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

export function formatMetricValue(metric: EvaluationMetric): string {
  if (metric.value === null) return "未計測";
  if (metric.unit === "deg") return `${metric.value.toFixed(1)}°`;
  if (metric.unit === "ms") return `${metric.value.toFixed(0)}ms`;
  if (metric.unit === "ratio") return `${(metric.value * 100).toFixed(0)}%`;
  if (metric.unit === "pxPerSec") return `${metric.value.toFixed(0)}px/s`;
  if (metric.unit === "px") return `${metric.value.toFixed(0)}px`;
  return metric.value.toFixed(2);
}
