// =============================================================
// 動画全体の人物トラッキング。
// フレームループ → 人物選択 → TrackedFrame生成 → 左右補正 → 平滑化 の流れ。
// 外れ値除去・Kalman平滑化そのものは poseTrackingSmoothing.ts に分離している。
//
// Phase1で追加した2ステップ:
//  - 左右入れ替わり補正（lateralityCorrection.ts）: フレーム収集直後、
//    Kalman平滑化より前の生ランドマーク段階で適用する。Kalmanは
//    ランドマークインデックスごとにフィルタ状態を保持するため、
//    左右入れ替わりを未補正のまま渡すと「左肩用フィルタ」が突然
//    右肩の位置を測定値として受け取ることになり、フィルタ状態が壊れる。
//  - 軽量人物トラッカー（personTracker.ts）: detectFrame内の人物選択を
//    差し替える。フラグOFF・トラッカーが対象を確定できない場合は
//    既存のselectPoseByPointへ安全にフォールバックする。
// =============================================================

import type { PoseLandmarker } from "@mediapipe/tasks-vision";
import { getPoseLandmarker } from "./poseLandmarkerClient";
import { createTrackedFrame, recreateTrackedFrameFromLandmarks } from "./poseFrameFactory";
import { selectPoseByPoint } from "./poseSelection";
import { createPersonTracker, type PersonTracker } from "./personTracker";
import { seekVideo } from "./poseVideo";
import { removeCenterOutliers, smoothFramesWithKalman } from "./poseTrackingSmoothing";
import { correctLateralityForSequence } from "./lateralityCorrection";
import { ENABLE_LATERALITY_CORRECTION, ENABLE_TEMPORAL_TRACKER } from "./featureFlags";
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

/**
 * 左右入れ替わり補正を、収集済みフレーム列全体に対して適用する。
 * Kalman平滑化（poseTrackingSmoothing.ts）より前で行う必要がある。
 * フラグOFF時は何もしない（既存挙動を維持）。
 */
function applyLateralityCorrection(
  frames: TrackedFrame[],
  videoWidth: number,
  videoHeight: number
): TrackedFrame[] {
  if (!ENABLE_LATERALITY_CORRECTION || frames.length === 0) {
    return frames;
  }

  const corrected = correctLateralityForSequence(frames.map((frame) => frame.landmarks));

  return frames.map((frame, index) => {
    const { landmarks, result } = corrected[index];

    if (!result.corrected) {
      return { ...frame, lateralityCorrection: result };
    }

    const rebuilt = recreateTrackedFrameFromLandmarks(frame, landmarks, videoWidth, videoHeight);
    return { ...rebuilt, lateralityCorrection: result };
  });
}

function detectFrame(
  landmarker: PoseLandmarker,
  video: HTMLVideoElement,
  time: number,
  fps: number,
  selectedPoint?: Point2D | null,
  tracker?: PersonTracker | null
): TrackedFrame | null {
  const result = landmarker.detectForVideo(video, performance.now());

  const poses = toPixelPoses(
    result.landmarks,
    video.videoWidth,
    video.videoHeight
  );

  // トラッカーが有効な場合は予測+マッチングで対象を選ぶ。
  // 無効時・トラッカーが対象を確定できない場合は、既存の
  // 「クリック位置に最も近い人物」方式にそのままフォールバックする。
  const { pose, quality } = tracker
    ? tracker.update(poses, time)
    : { pose: selectPoseByPoint(poses, selectedPoint), quality: undefined };

  if (!pose) {
    return null;
  }

  const frame = createTrackedFrame(
    pose,
    Math.round(time * fps),
    time,
    video.videoWidth,
    video.videoHeight
  );

  if (frame && quality) {
    return { ...frame, trackingQuality: quality };
  }

  return frame;
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

  // analyzeTrackedMotionの呼び出しごとに新しいインスタンスを生成するため、
  // 前回（別の動画・別の解析）のトラッカー状態が引き継がれることはない。
  const tracker = ENABLE_TEMPORAL_TRACKER
    ? createPersonTracker(selectedPoint)
    : null;

  for (let time = 0; time <= duration; time += 1 / fps) {
    await seekVideo(video, Math.min(time, duration));

    checkedFrameCount += 1;

    const frame = detectFrame(landmarker, video, time, fps, selectedPoint, tracker);

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

  const lateralityCorrectedFrames = applyLateralityCorrection(
    frames,
    video.videoWidth,
    video.videoHeight
  );

  const smoothingEnabled = shouldApplySmoothing(options);
  const smoothedFrames = smoothFrames(
    lateralityCorrectedFrames,
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
