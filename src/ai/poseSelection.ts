import type { TrackedLandmark } from "./poseTypes";

function getPoseCenter(
  landmarks: { x: number; y: number; visibility?: number }[]
): { x: number; y: number } | null {
  const visible = landmarks.filter(
    (point) => point.visibility === undefined || point.visibility > 0.35
  );

  if (visible.length === 0) {
    return null;
  }

  return {
    x: visible.reduce((sum, point) => sum + point.x, 0) / visible.length,
    y: visible.reduce((sum, point) => sum + point.y, 0) / visible.length,
  };
}

export function selectPoseByPoint(
  poses: TrackedLandmark[][],
  selectedPoint?: { x: number; y: number } | null
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

    const dx = center.x - selectedPoint.x;
    const dy = center.y - selectedPoint.y;
    const distance = dx * dx + dy * dy;

    if (distance < bestDistance) {
      bestDistance = distance;
      bestPose = pose;
    }
  }

  return bestPose;
}