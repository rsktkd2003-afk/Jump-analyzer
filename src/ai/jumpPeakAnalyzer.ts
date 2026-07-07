import type { PoseLandmarkerResult } from "@mediapipe/tasks-vision";
import { analyzeJumpForm } from "./formAnalyzer";
import { getPoseLandmarker } from "./poseLandmarkerClient";
import { calculateAngle, waitSeeked } from "./poseMath";
import type {
  JumpFormAnalysisResult,
  PoseAnalysisResult,
  PoseOverlayPoint,
} from "./poseTypes";

function getBodyHeightScore(result: PoseLandmarkerResult): number | null {
  const landmarks = result.landmarks[0];

  if (!landmarks) {
    return null;
  }

  const leftWrist = landmarks[15];
  const rightWrist = landmarks[16];
  const leftHip = landmarks[23];
  const rightHip = landmarks[24];

  if (!leftWrist || !rightWrist || !leftHip || !rightHip) {
    return null;
  }

  const wristY = Math.min(leftWrist.y, rightWrist.y);
  const hipY = (leftHip.y + rightHip.y) / 2;

  return wristY * 0.75 + hipY * 0.25;
}

function analyzeFormFromPose(
  result: PoseLandmarkerResult
): ReturnType<typeof analyzeJumpForm> | null {
  const landmarks = result.landmarks[0];

  if (!landmarks) {
    return null;
  }

  const leftShoulder = landmarks[11];
  const rightShoulder = landmarks[12];
  const leftElbow = landmarks[13];
  const rightElbow = landmarks[14];
  const leftHip = landmarks[23];
  const rightHip = landmarks[24];
  const leftKnee = landmarks[25];
  const rightKnee = landmarks[26];
  const leftAnkle = landmarks[27];
  const rightAnkle = landmarks[28];

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

export async function analyzeJumpPeakFrame(
  video: HTMLVideoElement,
  fps: number
): Promise<PoseAnalysisResult> {
  const landmarker = await getPoseLandmarker();

  if (!video.duration || Number.isNaN(video.duration)) {
    return {
      bestFrame: null,
      bestTime: null,
      confidence: 0,
      message: "動画の長さを取得できませんでした。",
    };
  }

  const originalTime = video.currentTime;
  const duration = video.duration;

  let bestTime: number | null = null;
  let bestFrame: number | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  let detectedCount = 0;
  let checkedCount = 0;

  const step = Math.max(1 / fps, 2 / fps);

  for (let time = 0; time <= duration; time += step) {
    video.currentTime = time;
    await waitSeeked(video);

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
    return {
      bestFrame: null,
      bestTime: null,
      confidence,
      message: "人体を検出できませんでした。",
    };
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

export async function analyzeJumpFormAtPeak(
  video: HTMLVideoElement,
  fps: number
): Promise<JumpFormAnalysisResult> {
  const landmarker = await getPoseLandmarker();
  const originalTime = video.currentTime;
  const peak = await analyzeJumpPeakFrame(video, fps);

  if (peak.bestTime === null || peak.bestFrame === null) {
    return {
      frame: null,
      time: null,
      confidence: peak.confidence,
      message: peak.message,
      form: null,
    };
  }

  video.currentTime = peak.bestTime;
  await waitSeeked(video);

  const poseResult = landmarker.detectForVideo(video, performance.now());
  const form = analyzeFormFromPose(poseResult);

  video.currentTime = originalTime;

  if (!form) {
    return {
      frame: peak.bestFrame,
      time: peak.bestTime,
      confidence: peak.confidence,
      message:
        "最高点候補は見つかりましたが、フォーム解析に必要な骨格点を検出できませんでした。",
      form: null,
    };
  }

  return {
    frame: peak.bestFrame,
    time: peak.bestTime,
    confidence: peak.confidence,
    message: `フォーム解析完了：${peak.bestFrame}F / ${peak.bestTime.toFixed(
      3
    )}秒`,
    form,
  };
}

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