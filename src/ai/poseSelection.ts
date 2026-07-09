// =============================================================
// 複数人物から対象人物を選択する。
// 今後の複数人物対応（人物ID追跡など）はこのモジュールを拡張する。
// =============================================================

import { averagePoint, distanceSquared } from "./poseMath";
import { filterVisibleLandmarks } from "./poseLandmarks";
import type { Point2D, TrackedLandmark } from "./poseTypes";

/** 可視骨格点の平均座標を人物の中心とみなす */
export function getPoseCenter(landmarks: TrackedLandmark[]): Point2D | null {
  return averagePoint(filterVisibleLandmarks(landmarks));
}

/**
 * ユーザーが指定した座標に最も近い人物を選ぶ。
 * 指定がない場合は先頭の人物を返す。
 */
export function selectPoseByPoint(
  poses: TrackedLandmark[][],
  selectedPoint?: Point2D | null
): TrackedLandmark[] | null {
  if (poses.length === 0) {
    return null;
  }

  if (!selectedPoint) {
    return poses[0];
  }

  let bestPose = poses[0];
  let bestDistance = Number.MAX_VALUE;

  for (const pose of poses) {
    const center = getPoseCenter(pose);

    if (!center) {
      continue;
    }

    const currentDistance = distanceSquared(center, selectedPoint);

    if (currentDistance < bestDistance) {
      bestDistance = currentDistance;
      bestPose = pose;
    }
  }

  return bestPose;
}