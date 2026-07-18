// =============================================================
// 動画全体の人物トラッキング。
// フレームループ → 人物選択 → TrackedFrame生成 → 平滑化 の流れ。
// 外れ値除去・Kalman平滑化そのものは poseTrackingSmoothing.ts に分離している。
// =============================================================

import type { PoseLandmarker } from "@mediapipe/tasks-vision";
import { getPoseLandmarker } from "./poseLandmarkerClient";
import { createTrackedFrame } from "./poseFrameFactory";
import { selectPoseByPoint } from "./poseSelection";
import { seekVideo } from "./poseVideo";
import { removeCenterOutliers, smoothFramesWithKalman } from "./poseTrackingSmoothing";
import type {
  MotionTrackingOptions,
  MotionTrackingResult,
  Point2D,
  TrackedFrame,
  TrackedLandmark,
} from "./poseTypes";

const PROGRESS_MAX_PERCENT = 100;
const DEFAULT_SMOOTHING_ENABLED = true;

const INVALID_FPS_MESSAGE = "FPSは0より大きい有限値を指定してください。";
const INVALID_DURATION_MESSAGE = "動画時間を取得できませんでした。";

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

/** fpsが0以下・NaN・±Infinityの場合はループが終了しないため、開始前に弾く */
function isValidFps(fps: number): boolean {
  return Number.isFinite(fps) && fps > 0;
}

/** durationがNaN・±Infinity・負数の場合は計測を開始できない。0は既存仕様どおり許可する */
function isValidDuration(duration: number): boolean {
  return Number.isFinite(duration) && duration >= 0;
}

function buildInvalidResult(message: string): MotionTrackingResult {
  return {
    frames: [],
    detectedFrameCount: 0,
    checkedFrameCount: 0,
    confidence: 0,
    message,
  };
}

export async function analyzeTrackedMotion(
  video: HTMLVideoElement,
  fps: number,
  onProgress?: (progress: number) => void,
  selectedPoint?: Point2D | null,
  options?: MotionTrackingOptions
): Promise<MotionTrackingResult> {
  if (!isValidFps(fps)) {
    return buildInvalidResult(INVALID_FPS_MESSAGE);
  }

  if (!isValidDuration(video.duration)) {
    return buildInvalidResult(INVALID_DURATION_MESSAGE);
  }

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
