import type { TrackedFrame } from "./trackingAnalyzer";
import { runJumpPhaseEngine } from "./jumpPhaseEngine";
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
import { buildSpikeFormEvaluationResult, formatMetricValue } from "./spikeFormEvaluationResult";

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
  formatMetricValue,
};
export type { StarRating };
export type {
  SpikeArmForm,
  EvaluationCategoryId,
  EvaluationMetric,
  EvaluationCategory,
  SpikeFormEvaluationResult,
};

export function evaluateSpikeForm(frames: TrackedFrame[], selectedForm: SpikeArmForm): SpikeFormEvaluationResult | null {
  if (frames.length < 8) return null;
  const engine = runJumpPhaseEngine(frames);
  if (!engine) return null;

  const metrics = evaluateSpikeFormMetrics(frames, engine, selectedForm);
  return buildSpikeFormEvaluationResult(frames, engine, metrics, selectedForm);
}
