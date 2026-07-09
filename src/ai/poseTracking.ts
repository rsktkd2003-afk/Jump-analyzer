// =============================================================
// 動画全体の人物トラッキング。
// フレームループ → 人物選択 → TrackedFrame生成 → 平滑化 の流れ。
// =============================================================

import type { PoseLandmarker } from "@mediapipe/tasks-vision";
import { KalmanFilter1D } from "../utils/kalmanFilter";
import { getPoseLandmarker } from "./poseLandmarkerClient";
import {
  createTrackedFrame,
  recreateTrackedFrameFromLandmarks,
} from "./poseFrameFactory";
import { isVisibleLandmark } from "./poseLandmarks";
import { selectPoseByPoint } from "./poseSelection";
import { seekVideo } from "./poseVideo";
import type {
  MotionTrackingOptions,
  MotionTrackingResult,
  Point2D,
  TrackedFrame,
  TrackedLandmark,
} from "./poseTypes";

const MAX_CENTER_JUMP_PX = 120;
const PROGRESS_MAX_PERCENT = 100;
const DEFAULT_SMOOTHING_ENABLED = true;

const KALMAN_INITIAL_ERROR_ESTIMATE = 1;
const KALMAN_ERROR_MEASURE = 9;
const KALMAN_PROCESS_NOISE = 0.08;
const KALMAN_BLEND_RATIO = 0.35;
const MAX_SMOOTHING_OFFSET_PX = 8;

type LandmarkFilters = {
  x: KalmanFilter1D;
  y: KalmanFilter1D;
};

function toPixelPoses(
  normalizedPoses: TrackedLandmark[][],
  videoWidth: number,
  videoHeight: number
): TrackedLandmark[][] {
  return normalizedPoses.map((pose) =>
    pose.map((point) => ({
      x: point.x * videoWidth,
      y: point.y * videoHeight,
      z: point.z,
      visibility: point.visibility,
    }))
  );
}

function removeCenterOutliers(frames: TrackedFrame[]): TrackedFrame[] {
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

function smoothFramesWithKalman(
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

function shouldApplySmoothing(options?: MotionTrackingOptions): boolean {
  return options?.smoothing?.enabled ?? DEFAULT_SMOOTHING_ENABLED;
}

function smoothFrames(
  frames: TrackedFrame[],
  videoWidth: number,
  videoHeight: number,
  options?: MotionTrackingOptions
): TrackedFrame[] {
  const filteredFrames = removeCenterOutliers(frames);

  if (!shouldApplySmoothing(options)) {
    return filteredFrames;
  }

  return smoothFramesWithKalman(filteredFrames, videoWidth, videoHeight);
}

function detectFrame(
  landmarker: PoseLandmarker,
  video: HTMLVideoElement,
  time: number,
  fps: number,
  selectedPoint?: Point2D | null
): TrackedFrame | null {
  const result = landmarker.detectForVideo(video, performance.now());

  const poses = toPixelPoses(
    result.landmarks,
    video.videoWidth,
    video.videoHeight
  );

  const pose = selectPoseByPoint(poses, selectedPoint);

  if (!pose) {
    return null;
  }

  return createTrackedFrame(
    pose,
    Math.round(time * fps),
    time,
    video.videoWidth,
    video.videoHeight
  );
}

function buildResultMessage(
  frames: TrackedFrame[],
  confidence: number,
  smoothingEnabled: boolean
): string {
  if (frames.length === 0) {
    return "人体を検出できませんでした。";
  }

  const smoothingText = smoothingEnabled ? "ON" : "OFF";

  return `トラッキング完了：${frames.length}フレーム / 検出率 ${confidence}% / 平滑化 ${smoothingText}`;
}

export async function analyzeTrackedMotion(
  video: HTMLVideoElement,
  fps: number,
  onProgress?: (progress: number) => void,
  selectedPoint?: Point2D | null,
  options?: MotionTrackingOptions
): Promise<MotionTrackingResult> {
  const landmarker = await getPoseLandmarker();

  const originalTime = video.currentTime;
  const duration = video.duration;

  const frames: TrackedFrame[] = [];
  let checkedFrameCount = 0;
  let detectedFrameCount = 0;

  for (let time = 0; time <= duration; time += 1 / fps) {
    await seekVideo(video, Math.min(time, duration));

    checkedFrameCount += 1;

    const frame = detectFrame(landmarker, video, time, fps, selectedPoint);

    if (frame) {
      frames.push(frame);
      detectedFrameCount += 1;
    }

    if (duration > 0) {
      onProgress?.(
        Math.min(PROGRESS_MAX_PERCENT, Math.round((time / duration) * 100))
      );
    }
  }

  await seekVideo(video, originalTime);

  const smoothingEnabled = shouldApplySmoothing(options);
  const smoothedFrames = smoothFrames(
    frames,
    video.videoWidth,
    video.videoHeight,
    options
  );

  const confidence =
    checkedFrameCount === 0
      ? 0
      : Math.round((detectedFrameCount / checkedFrameCount) * 100);

  return {
    frames: smoothedFrames,
    detectedFrameCount,
    checkedFrameCount,
    confidence,
    message: buildResultMessage(smoothedFrames, confidence, smoothingEnabled),
  };
}