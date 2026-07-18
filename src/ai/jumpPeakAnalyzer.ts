// =============================================================
// ジャンプ最高到達点の解析と、最高点フレームのフォーム解析。
// 体の高さスコア・最高点比較・フォーム計算は jumpPeakAnalysis.ts に分離している。
// 今後の追加予定：最高到達点補正 / 身長補正 / AIフォーム採点。
// =============================================================

import type { PoseLandmarker } from "@mediapipe/tasks-vision";
import { getPoseLandmarker } from "./poseLandmarkerClient";
import { hasValidDuration, seekVideo } from "./poseVideo";
import {
  PEAK_SCAN_FRAME_STRIDE,
  analyzeFormFromPose,
  getBodyHeightScore,
  selectBetterPeak,
  type PeakSelection,
} from "./jumpPeakAnalysis";
import type {
  FormAnalysisResult,
  JumpFormAnalysisResult,
  PoseAnalysisResult,
  PoseOverlayPoint,
} from "./poseTypes";

// poseAnalyzer.ts / formAnalyzer.ts の既存importを維持するための再export
export { analyzeJumpForm } from "./jumpPeakAnalysis";

const INVALID_FPS_MESSAGE = "FPSは0より大きい有限値を指定してください。";
const INVALID_DURATION_MESSAGE = "動画の長さを取得できませんでした。";

/** fpsが0以下・NaN・±Infinityの場合はループが終了しないため、開始前に弾く */
function isValidFps(fps: number): boolean {
  return Number.isFinite(fps) && fps > 0;
}

function validatePeakInputs(video: HTMLVideoElement, fps: number): string | null {
  if (!isValidFps(fps)) {
    return INVALID_FPS_MESSAGE;
  }

  if (!hasValidDuration(video)) {
    return INVALID_DURATION_MESSAGE;
  }

  return null;
}

// ---------------------------------------------------------
// 最高到達点解析
// ---------------------------------------------------------

function createPeakFailure(
  message: string,
  confidence: number
): PoseAnalysisResult {
  return {
    bestFrame: null,
    bestTime: null,
    confidence,
    message,
  };
}

async function scanForPeak(
  landmarker: PoseLandmarker,
  video: HTMLVideoElement,
  fps: number
): Promise<PoseAnalysisResult> {
  const originalTime = video.currentTime;
  const duration = video.duration;

  let bestPeak: PeakSelection = null;
  let detectedCount = 0;
  let checkedCount = 0;

  const step = PEAK_SCAN_FRAME_STRIDE / fps;

  try {
    for (let time = 0; time <= duration; time += step) {
      await seekVideo(video, time);

      const result = landmarker.detectForVideo(video, performance.now());
      const score = getBodyHeightScore(result);

      checkedCount += 1;

      if (score === null) {
        continue;
      }

      detectedCount += 1;
      bestPeak = selectBetterPeak(bestPeak, { time, score });
    }
  } finally {
    video.currentTime = originalTime;
  }

  const confidence =
    checkedCount === 0 ? 0 : Math.round((detectedCount / checkedCount) * 100);

  if (!bestPeak) {
    return createPeakFailure("人体を検出できませんでした。", confidence);
  }

  const bestFrame = Math.round(bestPeak.time * fps);

  return {
    bestFrame,
    bestTime: bestPeak.time,
    confidence,
    message: `最高点候補：${bestFrame}F / ${bestPeak.time.toFixed(
      3
    )}秒 / 検出率 ${confidence}%`,
  };
}

export async function analyzeJumpPeakFrame(
  video: HTMLVideoElement,
  fps: number
): Promise<PoseAnalysisResult> {
  const invalidMessage = validatePeakInputs(video, fps);

  if (invalidMessage) {
    return createPeakFailure(invalidMessage, 0);
  }

  const landmarker = await getPoseLandmarker();

  return scanForPeak(landmarker, video, fps);
}

// ---------------------------------------------------------
// 最高点フレームのフォーム解析
// ---------------------------------------------------------

function createFormResult(
  peak: PoseAnalysisResult,
  message: string,
  form: FormAnalysisResult | null
): JumpFormAnalysisResult {
  return {
    frame: peak.bestFrame,
    time: peak.bestTime,
    confidence: peak.confidence,
    message,
    form,
  };
}

export async function analyzeJumpFormAtPeak(
  video: HTMLVideoElement,
  fps: number
): Promise<JumpFormAnalysisResult> {
  const invalidMessage = validatePeakInputs(video, fps);

  if (invalidMessage) {
    return createFormResult(
      createPeakFailure(invalidMessage, 0),
      invalidMessage,
      null
    );
  }

  // 最高点探索とフォーム検出で同一landmarkerを共有し、モデルの重複取得を避ける
  const landmarker = await getPoseLandmarker();
  const originalTime = video.currentTime;

  const peak = await scanForPeak(landmarker, video, fps);

  if (peak.bestTime === null || peak.bestFrame === null) {
    // scanForPeak内のfinallyで既に元の時刻へ復元済み
    return createFormResult(peak, peak.message, null);
  }

  try {
    await seekVideo(video, peak.bestTime);

    const poseResult = landmarker.detectForVideo(video, performance.now());
    const form = analyzeFormFromPose(poseResult);

    if (!form) {
      return createFormResult(
        peak,
        "最高点候補は見つかりましたが、フォーム解析に必要な骨格点を検出できませんでした。",
        null
      );
    }

    return createFormResult(
      peak,
      `フォーム解析完了：${peak.bestFrame}F / ${peak.bestTime.toFixed(3)}秒`,
      form
    );
  } finally {
    video.currentTime = originalTime;
  }
}

// ---------------------------------------------------------
// 現在フレームの骨格点検出（オーバーレイ表示用）
// ---------------------------------------------------------

export async function detectPosePointsAtCurrentFrame(
  video: HTMLVideoElement
): Promise<PoseOverlayPoint[]> {
  const landmarker = await getPoseLandmarker();
  const result = landmarker.detectForVideo(video, performance.now());
  const landmarks = result.landmarks[0];

  if (!landmarks) {
    return [];
  }

  return landmarks.map((landmark) => ({
    x: landmark.x * video.videoWidth,
    y: landmark.y * video.videoHeight,
  }));
}
