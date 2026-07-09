// =============================================================
// ジャンプ最高到達点の解析と、最高点フレームのフォーム解析。
// 今後の追加予定：最高到達点補正 / 身長補正 / AIフォーム採点。
// =============================================================

import type { PoseLandmarkerResult } from "@mediapipe/tasks-vision";
import { getPoseLandmarker } from "./poseLandmarkerClient";
import { getBodyJoints } from "./poseLandmarks";
import { calculateAngle } from "./poseMath";
import { hasValidDuration, seekVideo } from "./poseVideo";
import type {
  FormAnalysisResult,
  JumpFormAnalysisResult,
  PoseAnalysisResult,
  PoseOverlayPoint,
} from "./poseTypes";

// 体の高さスコア＝手首と腰の高さの重み付き平均（yが小さいほど高い）
const WRIST_HEIGHT_WEIGHT = 0.75;
const HIP_HEIGHT_WEIGHT = 0.25;

// 最高点探索では2フレームおきにスキャンする
const PEAK_SCAN_FRAME_STRIDE = 2;

// ---------------------------------------------------------
// スコア計算
// ---------------------------------------------------------

/** 体の高さスコア。小さいほど高い位置にいる。骨格点が欠けていればnull */
function getBodyHeightScore(result: PoseLandmarkerResult): number | null {
  const landmarks = result.landmarks[0];

  if (!landmarks) {
    return null;
  }

  const joints = getBodyJoints(landmarks);
  const { leftWrist, rightWrist, leftHip, rightHip } = joints;

  if (!leftWrist || !rightWrist || !leftHip || !rightHip) {
    return null;
  }

  const wristY = Math.min(leftWrist.y, rightWrist.y);
  const hipY = (leftHip.y + rightHip.y) / 2;

  return wristY * WRIST_HEIGHT_WEIGHT + hipY * HIP_HEIGHT_WEIGHT;
}

// ---------------------------------------------------------
// フォーム解析
// ---------------------------------------------------------

/** 骨格の相対位置と膝角度からフォーム評価テキストを生成する */
export function analyzeJumpForm(params: {
  shoulderY: number;
  elbowY: number;
  hipY: number;
  kneeAngle: number;
}): FormAnalysisResult {
  const { shoulderY, elbowY, hipY, kneeAngle } = params;

  const elbowDiff = elbowY - shoulderY;
  const hipDiff = hipY - shoulderY;

  const elbowText =
    elbowDiff > 0
      ? `肘の位置は肩より下にあります。差分：約 ${elbowDiff.toFixed(3)}`
      : elbowDiff < 0
      ? `肘の位置は肩より上にあります。差分：約 ${Math.abs(elbowDiff).toFixed(3)}`
      : "肘の位置は肩とほぼ同じ高さです。";

  const postureText =
    hipDiff > 0
      ? `腰の位置は肩より下にあります。差分：約 ${hipDiff.toFixed(3)}`
      : hipDiff < 0
      ? `腰の位置は肩より上にあります。差分：約 ${Math.abs(hipDiff).toFixed(3)}`
      : "腰の位置は肩とほぼ同じ高さです。";

  const kneeText = `膝角度：約 ${kneeAngle.toFixed(1)}°`;

  const summary = [
    "最高点候補フレームにおける骨格情報です。",
    `肘-肩の高さ差：${elbowDiff.toFixed(3)}`,
    `腰-肩の高さ差：${hipDiff.toFixed(3)}`,
    `膝角度：${kneeAngle.toFixed(1)}°`,
  ].join("\n");

  return {
    elbowText,
    postureText,
    kneeText,
    summary,
  };
}

/** 検出結果からフォーム解析を行う。必要な骨格点が欠けていればnull */
function analyzeFormFromPose(
  result: PoseLandmarkerResult
): FormAnalysisResult | null {
  const landmarks = result.landmarks[0];

  if (!landmarks) {
    return null;
  }

  const joints = getBodyJoints(landmarks);
  const {
    leftShoulder,
    rightShoulder,
    leftElbow,
    rightElbow,
    leftHip,
    rightHip,
    leftKnee,
    rightKnee,
    leftAnkle,
    rightAnkle,
  } = joints;

  if (
    !leftShoulder ||
    !rightShoulder ||
    !leftElbow ||
    !rightElbow ||
    !leftHip ||
    !rightHip ||
    !leftKnee ||
    !rightKnee ||
    !leftAnkle ||
    !rightAnkle
  ) {
    return null;
  }

  const shoulderY = Math.min(leftShoulder.y, rightShoulder.y);
  const elbowY = Math.min(leftElbow.y, rightElbow.y);
  const hipY = (leftHip.y + rightHip.y) / 2;

  const leftKneeAngle = calculateAngle(leftHip, leftKnee, leftAnkle);
  const rightKneeAngle = calculateAngle(rightHip, rightKnee, rightAnkle);
  const kneeAngle = Math.max(leftKneeAngle, rightKneeAngle);

  return analyzeJumpForm({
    shoulderY,
    elbowY,
    hipY,
    kneeAngle,
  });
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

export async function analyzeJumpPeakFrame(
  video: HTMLVideoElement,
  fps: number
): Promise<PoseAnalysisResult> {
  const landmarker = await getPoseLandmarker();

  if (!hasValidDuration(video)) {
    return createPeakFailure("動画の長さを取得できませんでした。", 0);
  }

  const originalTime = video.currentTime;
  const duration = video.duration;

  let bestTime: number | null = null;
  let bestFrame: number | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  let detectedCount = 0;
  let checkedCount = 0;

  const step = PEAK_SCAN_FRAME_STRIDE / fps;

  for (let time = 0; time <= duration; time += step) {
    await seekVideo(video, time);

    const result = landmarker.detectForVideo(video, performance.now());
    const score = getBodyHeightScore(result);

    checkedCount += 1;

    if (score === null) {
      continue;
    }

    detectedCount += 1;

    if (score < bestScore) {
      bestScore = score;
      bestTime = time;
      bestFrame = Math.round(time * fps);
    }
  }

  video.currentTime = originalTime;

  const confidence =
    checkedCount === 0 ? 0 : Math.round((detectedCount / checkedCount) * 100);

  if (bestTime === null || bestFrame === null) {
    return createPeakFailure("人体を検出できませんでした。", confidence);
  }

  return {
    bestFrame,
    bestTime,
    confidence,
    message: `最高点候補：${bestFrame}F / ${bestTime.toFixed(
      3
    )}秒 / 検出率 ${confidence}%`,
  };
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
  const landmarker = await getPoseLandmarker();
  const originalTime = video.currentTime;
  const peak = await analyzeJumpPeakFrame(video, fps);

  if (peak.bestTime === null || peak.bestFrame === null) {
    return createFormResult(peak, peak.message, null);
  }

  await seekVideo(video, peak.bestTime);

  const poseResult = landmarker.detectForVideo(video, performance.now());
  const form = analyzeFormFromPose(poseResult);

  video.currentTime = originalTime;

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