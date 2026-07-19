// =============================================================
// 3D処理（Phase2A）の統合パイプライン。
// 検証（pose3DValidation.ts）→ 時系列平滑化（pose3DSmoothing.ts）→
// 骨盤中心正規化（pose3DNormalization.ts）→ 品質シグナル集計
// （pose3DQualitySignals.ts）の順に、フレーム列全体へ適用する。
//
// 左右入れ替わり補正の3D同期（poseTracking.ts側でLATERAL_LANDMARK_INDEX_PAIRSを
// 使って実施済み）より後、Kalmanによる2D平滑化（poseTrackingSmoothing.ts）とは
// 独立して実行する。2D側のcenterOutlier除去・Kalman平滑化は
// recreateTrackedFrameFromLandmarksでフレームを再構築するが、その際
// baseFrameをスプレッドするためworldLandmarks3D/normalizedPose3Dは
// そのまま引き継がれる。
//
// Feature Flag OFF時はフレームを一切変更せず、品質シグナルもundefinedを返す
// （Phase1互換）。
// =============================================================

import { POSE_LANDMARK } from "./poseLandmarks";
import { validatePose3D } from "./pose3DValidation";
import { smoothPose3DSequence } from "./pose3DSmoothing";
import { normalizePose3D } from "./pose3DNormalization";
import {
  calculatePose3DQualitySignals,
  type Pose3DFrameQualityInput,
} from "./pose3DQualitySignals";
import { ENABLE_3D_SMOOTHING, ENABLE_WORLD_LANDMARKS_3D } from "./featureFlags";
import type { Pose3DQualitySignals, PoseWorldLandmark, TrackedFrame } from "./poseTypes";

const KEY_JOINTS_FOR_VISIBILITY = [
  POSE_LANDMARK.LEFT_SHOULDER,
  POSE_LANDMARK.RIGHT_SHOULDER,
  POSE_LANDMARK.LEFT_HIP,
  POSE_LANDMARK.RIGHT_HIP,
] as const;

export type Pose3DPipelineResult = {
  frames: TrackedFrame[];
  qualitySignals: Pose3DQualitySignals | undefined;
};

function averageKeyJointVisibility(landmarks: PoseWorldLandmark[]): number {
  const points = KEY_JOINTS_FOR_VISIBILITY.map((index) => landmarks[index]).filter(
    (p): p is PoseWorldLandmark => !!p
  );
  if (points.length === 0) return 0;
  return points.reduce((sum, p) => sum + (p.visibility ?? 1), 0) / points.length;
}

/**
 * フレーム列全体に対して3D検証・平滑化・正規化を行い、
 * 各フレームのworldLandmarks3D/normalizedPose3Dを更新した新しい配列と、
 * 解析全体を通じた品質シグナルを返す。
 * ENABLE_WORLD_LANDMARKS_3D OFF時は何もせずそのまま返す。
 */
export function runPose3DPipeline(frames: TrackedFrame[]): Pose3DPipelineResult {
  if (!ENABLE_WORLD_LANDMARKS_3D || frames.length === 0) {
    return { frames, qualitySignals: undefined };
  }

  const frameInputs: Pose3DFrameQualityInput[] = [];
  const rawValidatedLandmarks: Array<PoseWorldLandmark[] | undefined> = [];

  let previousValid: PoseWorldLandmark[] | null = null;
  for (const frame of frames) {
    const result = validatePose3D(frame.worldLandmarks3D, previousValid);

    if (result.valid && frame.worldLandmarks3D) {
      rawValidatedLandmarks.push(frame.worldLandmarks3D);
      previousValid = frame.worldLandmarks3D;
      frameInputs.push({
        valid: true,
        visibility: averageKeyJointVisibility(frame.worldLandmarks3D),
      });
    } else {
      rawValidatedLandmarks.push(undefined);
      frameInputs.push({ valid: false, reason: result.reason });
    }
  }

  const times = frames.map((frame) => frame.time);

  const smoothingResult = ENABLE_3D_SMOOTHING
    ? smoothPose3DSequence(rawValidatedLandmarks, times)
    : { landmarksByFrame: rawValidatedLandmarks, interpolatedFrameIndexes: new Set<number>() };

  const outputFrames = frames.map((frame, index) => {
    const landmarks = smoothingResult.landmarksByFrame[index];

    if (!landmarks) {
      if (frame.worldLandmarks3D === undefined && frame.normalizedPose3D === undefined) {
        return frame;
      }
      const rest: TrackedFrame = { ...frame };
      delete rest.worldLandmarks3D;
      delete rest.normalizedPose3D;
      return rest;
    }

    return {
      ...frame,
      worldLandmarks3D: landmarks,
      normalizedPose3D: normalizePose3D(landmarks),
    };
  });

  const qualitySignals = calculatePose3DQualitySignals(
    frameInputs,
    smoothingResult.interpolatedFrameIndexes
  );

  return { frames: outputFrames, qualitySignals };
}
