import {
  FilesetResolver,
  PoseLandmarker,
  type PoseLandmarkerResult,
} from "@mediapipe/tasks-vision";

import {
  analyzeJumpForm,
  type FormAnalysisResult,
} from "./formAnalyzer";

export type PoseAnalysisResult = {
  bestFrame: number | null;
  bestTime: number | null;
  confidence: number;
  message: string;
};

export type JumpFormAnalysisResult = {
  frame: number | null;
  time: number | null;
  confidence: number;
  message: string;
  form: FormAnalysisResult | null;
};

export type PoseOverlayPoint = {
  x: number;
  y: number;
};

let poseLandmarker: PoseLandmarker | null = null;

const POSE_MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task";

async function getPoseLandmarker() {
  if (poseLandmarker) return poseLandmarker;

  const vision = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
  );

  poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: POSE_MODEL_URL,
      delegate: "GPU",
    },
    runningMode: "VIDEO",
    numPoses: 4,
  });

  return poseLandmarker;
}

function waitSeeked(video: HTMLVideoElement) {
  return new Promise<void>((resolve) => {
    const handler = () => {
      video.removeEventListener("seeked", handler);
      resolve();
    };
    video.addEventListener("seeked", handler);
  });
}

function getBodyHeightScore(result: PoseLandmarkerResult): number | null {
  const landmarks = result.landmarks[0];
  if (!landmarks) return null;

  const leftWrist = landmarks[15];
  const rightWrist = landmarks[16];
  const leftHip = landmarks[23];
  const rightHip = landmarks[24];

  if (!leftWrist || !rightWrist || !leftHip || !rightHip) return null;

  const wristY = Math.min(leftWrist.y, rightWrist.y);
  const hipY = (leftHip.y + rightHip.y) / 2;

  return wristY * 0.75 + hipY * 0.25;
}

function calculateAngle(
  a: { x: number; y: number },
  b: { x: number; y: number },
  c: { x: number; y: number }
): number {
  const ab = { x: a.x - b.x, y: a.y - b.y };
  const cb = { x: c.x - b.x, y: c.y - b.y };

  const dot = ab.x * cb.x + ab.y * cb.y;
  const abLength = Math.sqrt(ab.x * ab.x + ab.y * ab.y);
  const cbLength = Math.sqrt(cb.x * cb.x + cb.y * cb.y);

  if (abLength === 0 || cbLength === 0) return 0;

  const cos = dot / (abLength * cbLength);
  const safeCos = Math.max(-1, Math.min(1, cos));

  return (Math.acos(safeCos) * 180) / Math.PI;
}

function analyzeFormFromPose(
  result: PoseLandmarkerResult
): FormAnalysisResult | null {
  const landmarks = result.landmarks[0];
  if (!landmarks) return null;

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

    if (score === null) continue;

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

  if (!landmarks) return [];

  return landmarks.map((landmark) => ({
    x: landmark.x * video.videoWidth,
    y: landmark.y * video.videoHeight,
  }));
}

export type TrackedLandmark = {
  x: number;
  y: number;
  z?: number;
  visibility?: number;
};

export type TrackedCrop = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type TrackedFrame = {
  frameIndex: number;
  time: number;

  landmarks: TrackedLandmark[];

  crop: TrackedCrop;

  centerX: number;
  centerY: number;

  leftKneeAngle: number | null;
  rightKneeAngle: number | null;

  hipAngle: number | null;
  shoulderTilt: number | null;

  leftHipAngle: number | null;
  rightHipAngle: number | null;

  leftElbowAngle: number | null;
  rightElbowAngle: number | null;

  leftShoulderAngle: number | null;
  rightShoulderAngle: number | null;
};

export type MotionTrackingResult = {
  frames: TrackedFrame[];
  detectedFrameCount: number;
  checkedFrameCount: number;
  confidence: number;
  message: string;
};

function getPoseCenter(
  landmarks: { x: number; y: number; visibility?: number }[]
): { x: number; y: number } | null {
  const visible = landmarks.filter(
    (p) => p.visibility === undefined || p.visibility > 0.35
  );

  if (visible.length === 0) return null;

  return {
    x: visible.reduce((s, p) => s + p.x, 0) / visible.length,
    y: visible.reduce((s, p) => s + p.y, 0) / visible.length,
  };
}

function selectPoseByPoint(
  poses: TrackedLandmark[][],
  selectedPoint?: { x: number; y: number } | null
): TrackedLandmark[] | null {

  if (poses.length === 0) return null;

  if (!selectedPoint) {
    return poses[0];
  }

  let best = poses[0];
  let bestDistance = Number.MAX_VALUE;

  for (const pose of poses) {

    const center = getPoseCenter(pose);

    if (!center) continue;

    const dx = center.x - selectedPoint.x;
    const dy = center.y - selectedPoint.y;

    const distance = dx * dx + dy * dy;

    if (distance < bestDistance) {
      bestDistance = distance;
      best = pose;
    }
  }

  return best;
}

function createTrackedFrame(
  landmarks: TrackedLandmark[],
  frameIndex: number,
  time: number,
  videoWidth: number,
  videoHeight: number
): TrackedFrame | null {
  if (landmarks.length === 0) return null;

  const visible = landmarks.filter(
    (p) => p.visibility === undefined || p.visibility > 0.35
  );

  if (visible.length < 8) return null;

  const xs = visible.map((p) => p.x);
  const ys = visible.map((p) => p.y);

  const minX = Math.max(0, Math.min(...xs));
  const maxX = Math.min(videoWidth, Math.max(...xs));
  const minY = Math.max(0, Math.min(...ys));
  const maxY = Math.min(videoHeight, Math.max(...ys));

  const rawWidth = maxX - minX;
  const rawHeight = maxY - minY;

  if (rawWidth <= 0 || rawHeight <= 0) return null;

  const paddingX = rawWidth * 0.45;
  const paddingY = rawHeight * 0.35;

  const cropX = Math.max(0, minX - paddingX);
  const cropY = Math.max(0, minY - paddingY);
  const cropW = Math.min(videoWidth - cropX, rawWidth + paddingX * 2);
  const cropH = Math.min(videoHeight - cropY, rawHeight + paddingY * 2);

  const leftShoulder = landmarks[11];
const rightShoulder = landmarks[12];

const leftElbow = landmarks[13];
const rightElbow = landmarks[14];

const leftWrist = landmarks[15];
const rightWrist = landmarks[16];

const leftHip = landmarks[23];
const rightHip = landmarks[24];

const leftKnee = landmarks[25];
const rightKnee = landmarks[26];

const leftAnkle = landmarks[27];
const rightAnkle = landmarks[28];

  return {
    frameIndex,
    time,
    landmarks,
    crop: {
      x: cropX,
      y: cropY,
      width: cropW,
      height: cropH,
    },
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2,
    leftKneeAngle:
      leftHip && leftKnee && leftAnkle
        ? calculateAngle(leftHip, leftKnee, leftAnkle)
        : null,
    rightKneeAngle:
      rightHip && rightKnee && rightAnkle
        ? calculateAngle(rightHip, rightKnee, rightAnkle)
        : null,
    hipAngle:
      leftShoulder && leftHip && leftKnee
        ? calculateAngle(leftShoulder, leftHip, leftKnee)
        : null,
    shoulderTilt:
      leftShoulder && rightShoulder
        ? Math.atan2(
            rightShoulder.y - leftShoulder.y,
            rightShoulder.x - leftShoulder.x
          ) *
          (180 / Math.PI)
        : null,

        leftHipAngle:
  leftShoulder && leftHip && leftKnee
    ? calculateAngle(leftShoulder, leftHip, leftKnee)
    : null,

rightHipAngle:
  rightShoulder && rightHip && rightKnee
    ? calculateAngle(rightShoulder, rightHip, rightKnee)
    : null,

leftElbowAngle:
  leftShoulder && leftElbow && leftWrist
    ? calculateAngle(leftShoulder, leftElbow, leftWrist)
    : null,

rightElbowAngle:
  rightShoulder && rightElbow && rightWrist
    ? calculateAngle(rightShoulder, rightElbow, rightWrist)
    : null,

leftShoulderAngle:
  leftElbow && leftShoulder && leftHip
    ? calculateAngle(leftElbow, leftShoulder, leftHip)
    : null,

rightShoulderAngle:
  rightElbow && rightShoulder && rightHip
    ? calculateAngle(rightElbow, rightShoulder, rightHip)
    : null,
  };
}

export async function analyzeTrackedMotion(
  video: HTMLVideoElement,
  fps: number,
  onProgress?: (progress: number) => void,
  selectedPoint?: { x: number; y: number } | null
): Promise<MotionTrackingResult> {

  const landmarker = await getPoseLandmarker();

  const originalTime = video.currentTime;
  const duration = video.duration;

  const frames: TrackedFrame[] = [];
  let checkedFrameCount = 0;
  let detectedFrameCount = 0;

  for (let time = 0; time <= duration; time += 1 / fps) {
    video.currentTime = Math.min(time, duration);
    await waitSeeked(video);

    const result = landmarker.detectForVideo(video, performance.now());
    checkedFrameCount += 1;

    const poses: TrackedLandmark[][] = result.landmarks.map((pose) =>
  pose.map((p) => ({
    x: p.x * video.videoWidth,
    y: p.y * video.videoHeight,
    z: p.z,
    visibility: p.visibility,
  }))
);

const pose = selectPoseByPoint(poses, selectedPoint);

if (pose) {
  const landmarks = pose;

  const frame = createTrackedFrame(
    landmarks,
    Math.round(time * fps),
    time,
    video.videoWidth,
    video.videoHeight
  );

      if (frame) {
        frames.push(frame);
        detectedFrameCount += 1;
      }
    }

    onProgress?.(Math.min(100, Math.round((time / duration) * 100)));
  }

  video.currentTime = originalTime;
  await waitSeeked(video);

  const confidence =
    checkedFrameCount === 0
      ? 0
      : Math.round((detectedFrameCount / checkedFrameCount) * 100);

  return {
    frames,
    detectedFrameCount,
    checkedFrameCount,
    confidence,
    message:
      frames.length > 0
        ? `トラッキング完了：${frames.length}フレーム / 検出率 ${confidence}%`
        : "人体を検出できませんでした。",
  };
}