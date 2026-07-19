// =============================================================
// 3D処理（worldLandmarks）の品質シグナル算出。
//
// 既存の2D信頼度算出（utils/analysisConfidence.ts）とは完全に独立しており、
// Phase2Aでは総合スコアに一切反映しない（デバッグ・検証・将来のPhase向けの
// 可視化用シグナル）。フレームごとの検証結果（pose3DValidation.ts）と、
// 平滑化時にどのフレームを補間で埋めたか（pose3DSmoothing.ts）を集計するだけで、
// 新しい判定ロジックは持たない。
// =============================================================

import type { Pose3DValidationReason } from "./pose3DValidation";
import type { Pose3DQualitySignals } from "./poseTypes";

/** 主要関節の平均visibilityがこれ未満のフレームを「低信頼」として数える */
const LOW_VISIBILITY_THRESHOLD = 0.7;

export type Pose3DFrameQualityInput = {
  /** このフレームのworldLandmarks3Dが検証に通ったか（pose3DValidation.tsの結果） */
  valid: boolean;
  /** 無効だった場合の理由 */
  reason?: Pose3DValidationReason;
  /** 有効だった場合の、主要関節（肩・腰）の平均visibility */
  visibility?: number;
};

export function calculatePose3DQualitySignals(
  frameInputs: Pose3DFrameQualityInput[],
  interpolatedFrameIndexes: ReadonlySet<number>
): Pose3DQualitySignals {
  const totalFrames = frameInputs.length;

  if (totalFrames === 0) {
    return {
      availableFrameRatio: 0,
      lowConfidenceFrameRatio: 0,
      interpolatedFrameRatio: 0,
      abnormalMotionFrameRatio: 0,
      meanVisibility: 0,
    };
  }

  const validInputs = frameInputs.filter((f) => f.valid);
  const validCount = validInputs.length;
  const availableCount = validCount + interpolatedFrameIndexes.size;

  const visibilityValues = validInputs
    .map((f) => f.visibility)
    .filter((v): v is number => v !== undefined);

  const lowConfidenceCount = visibilityValues.filter((v) => v < LOW_VISIBILITY_THRESHOLD).length;
  const abnormalMotionCount = frameInputs.filter((f) => f.reason === "abnormal-motion").length;

  const meanVisibility =
    visibilityValues.length === 0
      ? 0
      : visibilityValues.reduce((sum, v) => sum + v, 0) / visibilityValues.length;

  return {
    availableFrameRatio: availableCount / totalFrames,
    lowConfidenceFrameRatio:
      visibilityValues.length === 0 ? 0 : lowConfidenceCount / visibilityValues.length,
    interpolatedFrameRatio: interpolatedFrameIndexes.size / totalFrames,
    abnormalMotionFrameRatio: abnormalMotionCount / totalFrames,
    meanVisibility,
  };
}
