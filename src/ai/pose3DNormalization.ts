// =============================================================
// 3Dランドマークの骨盤中心正規化。
//
// 評価・指標算出には生のworldLandmarksを直接使わず、原点を左右股関節の
// 中点へ、スケールを体幹長へ揃えた正規化ビュー（NormalizedPose3D）を使う。
// MediaPipeのworldLandmarks自体も股関節中点を原点として返す仕様だが、
// 実データのズレに対して頑健にするため、実測値から自前で原点を
// 再計算する（MediaPipe側の原点をそのまま信頼しない）。
// =============================================================

import { POSE_LANDMARK } from "./poseLandmarks";
import type { NormalizedPose3D, PoseWorldLandmark } from "./poseTypes";

/** スケール（体幹長）がこれ未満の場合に使う下限値（メートル）。ゼロ割・過大な正規化値を防ぐ */
const MIN_SCALE_M = 0.1;

function midpoint3D(a: PoseWorldLandmark, b: PoseWorldLandmark): PoseWorldLandmark {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 };
}

function distance3D(a: PoseWorldLandmark, b: PoseWorldLandmark): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

function averageVisibility(landmarks: PoseWorldLandmark[], indexes: readonly number[]): number {
  const points = indexes.map((i) => landmarks[i]).filter((p): p is PoseWorldLandmark => !!p);
  if (points.length === 0) return 0;
  return points.reduce((sum, p) => sum + (p.visibility ?? 1), 0) / points.length;
}

/**
 * 骨盤中心（左右股関節の中点）を原点、体幹長（肩中点-腰中点距離）を
 * スケールとして正規化した3D姿勢を作る。
 * 呼び出し前に pose3DValidation.ts で構造検証済みであることを前提とする
 * （33点・有限値・主要関節visibilityが保証されている状態）。
 */
export function normalizePose3D(landmarks: PoseWorldLandmark[]): NormalizedPose3D {
  const leftShoulder = landmarks[POSE_LANDMARK.LEFT_SHOULDER];
  const rightShoulder = landmarks[POSE_LANDMARK.RIGHT_SHOULDER];
  const leftHip = landmarks[POSE_LANDMARK.LEFT_HIP];
  const rightHip = landmarks[POSE_LANDMARK.RIGHT_HIP];

  const origin = midpoint3D(leftHip, rightHip);
  const shoulderMid = midpoint3D(leftShoulder, rightShoulder);
  const torsoLength = distance3D(shoulderMid, origin);
  const scale = Math.max(torsoLength, MIN_SCALE_M);

  const normalizedLandmarks = landmarks.map((point) => ({
    x: (point.x - origin.x) / scale,
    y: (point.y - origin.y) / scale,
    z: (point.z - origin.z) / scale,
    visibility: point.visibility,
  }));

  const quality = averageVisibility(landmarks, [
    POSE_LANDMARK.LEFT_SHOULDER,
    POSE_LANDMARK.RIGHT_SHOULDER,
    POSE_LANDMARK.LEFT_HIP,
    POSE_LANDMARK.RIGHT_HIP,
  ]);

  return {
    landmarks: normalizedLandmarks,
    origin,
    scale,
    quality,
  };
}
