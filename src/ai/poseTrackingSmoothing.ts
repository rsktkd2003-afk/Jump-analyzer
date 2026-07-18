// =============================================================
// poseTracking.tsから抽出した、フレーム列の中心外れ値除去とKalman平滑化。
// DOM/MediaPipeに依存しない純粋処理。
// =============================================================

import { KalmanFilter1D } from "../utils/kalmanFilter";
import { recreateTrackedFrameFromLandmarks } from "./poseFrameFactory";
import { isVisibleLandmark } from "./poseLandmarks";
import type { TrackedFrame, TrackedLandmark } from "./poseTypes";

const MAX_CENTER_JUMP_PX = 120;

const KALMAN_INITIAL_ERROR_ESTIMATE = 1;
const KALMAN_ERROR_MEASURE = 9;
const KALMAN_PROCESS_NOISE = 0.08;
const KALMAN_BLEND_RATIO = 0.35;
const MAX_SMOOTHING_OFFSET_PX = 8;

type LandmarkFilters = {
  x: KalmanFilter1D;
  y: KalmanFilter1D;
};

export function removeCenterOutliers(frames: TrackedFrame[]): TrackedFrame[] {
  const filteredFrames: TrackedFrame[] = [];

  for (const current of frames) {
    if (filteredFrames.length === 0) {
      filteredFrames.push(current);
      continue;
    }

    const previous = filteredFrames[filteredFrames.length - 1];

    const centerJump = Math.hypot(
      current.centerX - previous.centerX,
      current.centerY - previous.centerY
    );

    if (centerJump < MAX_CENTER_JUMP_PX) {
      filteredFrames.push(current);
    }
  }

  return filteredFrames;
}

function createLandmarkFilter(initialPoint: TrackedLandmark): LandmarkFilters {
  return {
    x: new KalmanFilter1D(
      initialPoint.x,
      KALMAN_INITIAL_ERROR_ESTIMATE,
      KALMAN_ERROR_MEASURE,
      KALMAN_PROCESS_NOISE
    ),
    y: new KalmanFilter1D(
      initialPoint.y,
      KALMAN_INITIAL_ERROR_ESTIMATE,
      KALMAN_ERROR_MEASURE,
      KALMAN_PROCESS_NOISE
    ),
  };
}

function blendWithOriginal(original: number, filtered: number): number {
  const blended =
    original * (1 - KALMAN_BLEND_RATIO) + filtered * KALMAN_BLEND_RATIO;
  const offset = blended - original;

  if (Math.abs(offset) <= MAX_SMOOTHING_OFFSET_PX) {
    return blended;
  }

  return original + Math.sign(offset) * MAX_SMOOTHING_OFFSET_PX;
}

function smoothVisibleLandmark(
  landmark: TrackedLandmark,
  filters: LandmarkFilters
): TrackedLandmark {
  const filteredX = filters.x.update(landmark.x);
  const filteredY = filters.y.update(landmark.y);

  return {
    ...landmark,
    x: blendWithOriginal(landmark.x, filteredX),
    y: blendWithOriginal(landmark.y, filteredY),
  };
}

function smoothLandmarks(
  landmarks: TrackedLandmark[],
  filtersByLandmarkIndex: Map<number, LandmarkFilters>
): TrackedLandmark[] {
  return landmarks.map((landmark, landmarkIndex) => {
    if (!isVisibleLandmark(landmark)) {
      return landmark;
    }

    const existingFilters = filtersByLandmarkIndex.get(landmarkIndex);

    if (existingFilters) {
      return smoothVisibleLandmark(landmark, existingFilters);
    }

    const filters = createLandmarkFilter(landmark);
    filtersByLandmarkIndex.set(landmarkIndex, filters);

    return landmark;
  });
}

export function smoothFramesWithKalman(
  frames: TrackedFrame[],
  videoWidth: number,
  videoHeight: number
): TrackedFrame[] {
  const filtersByLandmarkIndex = new Map<number, LandmarkFilters>();

  return frames.map((frame) => {
    const landmarks = smoothLandmarks(frame.landmarks, filtersByLandmarkIndex);

    return recreateTrackedFrameFromLandmarks(
      frame,
      landmarks,
      videoWidth,
      videoHeight
    );
  });
}
