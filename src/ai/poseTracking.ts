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

import type { Landmark, PoseLandmarker } from "@mediapipe/tasks-vision";
import { getPoseLandmarker } from "./poseLandmarkerClient";
import { createTrackedFrame, recreateTrackedFrameFromLandmarks } from "./poseFrameFactory";
import { selectPoseByPoint } from "./poseSelection";
import { createPersonTracker, type PersonTracker } from "./personTracker";
import { seekVideo } from "./poseVideo";
import { removeCenterOutliers, smoothFramesWithKalman } from "./poseTrackingSmoothing";
import { correctLateralityForSequence, LATERAL_LANDMARK_INDEX_PAIRS } from "./lateralityCorrection";
import { runPose3DPipeline } from "./pose3DPipeline";
import {
  ENABLE_LATERALITY_CORRECTION,
  ENABLE_TEMPORAL_TRACKER,
  ENABLE_WORLD_LANDMARKS_3D,
} from "./featureFlags";
import type {
  MotionTrackingOptions,
  MotionTrackingResult,
  Point2D,
  PoseWorldLandmark,
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
 * 3D worldLandmarksに対して、2D側と同じ左右対インデックスで入れ替えを行う。
 * 2D/3Dで別々に左右判定を行わないよう、判定結果（swapするか否か）は
 * 呼び出し側（2D側のLateralityCorrectionResult.corrected）にのみ従い、
 * ここではインデックス対応（LATERAL_LANDMARK_INDEX_PAIRS）だけを使う。
 */
function swapWorldLandmarks3D(landmarks: PoseWorldLandmark[]): PoseWorldLandmark[] {
  const result = [...landmarks];

  for (const [left, right] of LATERAL_LANDMARK_INDEX_PAIRS) {
    const leftPoint = landmarks[left];
    const rightPoint = landmarks[right];
    if (!leftPoint || !rightPoint) continue;
    result[left] = rightPoint;
    result[right] = leftPoint;
  }

  return result;
}

/**
 * 左右入れ替わり補正を、収集済みフレーム列全体に対して適用する。
 * Kalman平滑化（poseTrackingSmoothing.ts）より前で行う必要がある。
 * フラグOFF時は何もしない（既存挙動を維持）。
 * 2D側で入れ替えが発生したフレームは、そのフレームのworldLandmarks3Dが
 * あれば同じ左右対を入れ替える（2Dと3Dが別人の関節を指す状態を防ぐ）。
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
    const worldLandmarks3D = frame.worldLandmarks3D
      ? swapWorldLandmarks3D(frame.worldLandmarks3D)
      : undefined;

    return {
      ...rebuilt,
      lateralityCorrection: result,
      ...(worldLandmarks3D ? { worldLandmarks3D } : {}),
    };
  });
}

function toPoseWorldLandmarks(landmarks: Landmark[]): PoseWorldLandmark[] {
  return landmarks.map((point) => ({
    x: point.x,
    y: point.y,
    z: point.z,
    visibility: point.visibility,
  }));
}

/**
 * 選択された2Dランドマークと同じ人物の3D worldLandmarksを取得する。
 * `poses`（toPixelPosesの出力）とtracker.update/selectPoseByPointが返す`pose`は
 * 同じ配列要素を参照で共有しているため、poses.indexOf(pose)で元の検出順
 * インデックスを復元でき、そのインデックスでresult.worldLandmarksを引ける
 * （landmarksとworldLandmarksはMediaPipe側で同じ人物順序に揃っている）。
 * この時点では欠損・不正値の検証は行わない（検証はpose3DPipeline.tsで
 * フレーム列全体に対して行う）。
 * worldLandmarksByPoseは型定義上は必須だが、テスト用モック等で欠落する
 * ケースに備えoptionalとして扱う。
 */
function extractWorldLandmarks3D(
  poses: TrackedLandmark[][],
  pose: TrackedLandmark[],
  worldLandmarksByPose: Landmark[][] | undefined
): PoseWorldLandmark[] | undefined {
  if (!ENABLE_WORLD_LANDMARKS_3D) {
    return undefined;
  }

  const poseIndex = poses.indexOf(pose);
  const rawWorldLandmarks =
    poseIndex >= 0 ? worldLandmarksByPose?.[poseIndex] : undefined;

  if (!rawWorldLandmarks) {
    return undefined;
  }

  return toPoseWorldLandmarks(rawWorldLandmarks);
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

  const worldLandmarks3D = extractWorldLandmarks3D(poses, pose, result.worldLandmarks);

  const frame = createTrackedFrame(
    pose,
    Math.round(time * fps),
    time,
    video.videoWidth,
    video.videoHeight
  );

  if (!frame) {
    return null;
  }

  return {
    ...frame,
    ...(quality ? { trackingQuality: quality } : {}),
    ...(worldLandmarks3D ? { worldLandmarks3D } : {}),
  };
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

  const pose3DResult = ENABLE_WORLD_LANDMARKS_3D
    ? runPose3DPipeline(lateralityCorrectedFrames)
    : { frames: lateralityCorrectedFrames, qualitySignals: undefined };

  const smoothingEnabled = shouldApplySmoothing(options);
  const smoothedFrames = smoothFrames(
    pose3DResult.frames,
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
    trackerStats: tracker?.getStats(),
    pose3DQuality: pose3DResult.qualitySignals,
  };
}
