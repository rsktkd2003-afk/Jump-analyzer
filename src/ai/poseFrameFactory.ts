// =============================================================
// 1フレーム分の骨格点から TrackedFrame を生成する。
// Visibility判定 → バウンディングボックス → Crop → 関節角度 の順に処理する。
// =============================================================

import { angleOrNull, calculateTiltDegrees } from "./poseMath";
import { filterVisibleLandmarks, getBodyJoints } from "./poseLandmarks";
import type { TrackedFrame, TrackedLandmark } from "./poseTypes";

const MIN_AVERAGE_VISIBILITY = 0.6;
const MIN_VISIBLE_POINT_COUNT = 8;

const CROP_PADDING_RATIO_X = 0.45;
const CROP_PADDING_RATIO_Y = 0.35;

type Bounds = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
};

function hasEnoughVisibility(visibleLandmarks: TrackedLandmark[]): boolean {
  if (visibleLandmarks.length < MIN_VISIBLE_POINT_COUNT) {
    return false;
  }

  const averageVisibility =
    visibleLandmarks.reduce((sum, point) => sum + (point.visibility ?? 1), 0) /
    visibleLandmarks.length;

  return averageVisibility >= MIN_AVERAGE_VISIBILITY;
}

function calculateBounds(
  visibleLandmarks: TrackedLandmark[],
  videoWidth: number,
  videoHeight: number
): Bounds | null {
  const xs = visibleLandmarks.map((point) => point.x);
  const ys = visibleLandmarks.map((point) => point.y);

  const bounds: Bounds = {
    minX: Math.max(0, Math.min(...xs)),
    maxX: Math.min(videoWidth, Math.max(...xs)),
    minY: Math.max(0, Math.min(...ys)),
    maxY: Math.min(videoHeight, Math.max(...ys)),
  };

  if (bounds.maxX - bounds.minX <= 0 || bounds.maxY - bounds.minY <= 0) {
    return null;
  }

  return bounds;
}

function createCrop(
  bounds: Bounds,
  videoWidth: number,
  videoHeight: number
): TrackedFrame["crop"] {
  const rawWidth = bounds.maxX - bounds.minX;
  const rawHeight = bounds.maxY - bounds.minY;

  const paddingX = rawWidth * CROP_PADDING_RATIO_X;
  const paddingY = rawHeight * CROP_PADDING_RATIO_Y;

  const cropX = Math.max(0, bounds.minX - paddingX);
  const cropY = Math.max(0, bounds.minY - paddingY);

  return {
    x: cropX,
    y: cropY,
    width: Math.min(videoWidth - cropX, rawWidth + paddingX * 2),
    height: Math.min(videoHeight - cropY, rawHeight + paddingY * 2),
  };
}

type JointAngles = Pick<
  TrackedFrame,
  | "leftKneeAngle"
  | "rightKneeAngle"
  | "hipAngle"
  | "shoulderTilt"
  | "leftHipAngle"
  | "rightHipAngle"
  | "leftElbowAngle"
  | "rightElbowAngle"
  | "leftShoulderAngle"
  | "rightShoulderAngle"
>;

function calculateJointAngles(landmarks: TrackedLandmark[]): JointAngles {
  const joints = getBodyJoints(landmarks);

  const leftHipAngle = angleOrNull(
    joints.leftShoulder,
    joints.leftHip,
    joints.leftKnee
  );

  const shoulderTilt =
    joints.leftShoulder && joints.rightShoulder
      ? calculateTiltDegrees(joints.leftShoulder, joints.rightShoulder)
      : null;

  return {
    leftKneeAngle: angleOrNull(joints.leftHip, joints.leftKnee, joints.leftAnkle),
    rightKneeAngle: angleOrNull(
      joints.rightHip,
      joints.rightKnee,
      joints.rightAnkle
    ),
    hipAngle: leftHipAngle,
    shoulderTilt,
    leftHipAngle,
    rightHipAngle: angleOrNull(
      joints.rightShoulder,
      joints.rightHip,
      joints.rightKnee
    ),
    leftElbowAngle: angleOrNull(
      joints.leftShoulder,
      joints.leftElbow,
      joints.leftWrist
    ),
    rightElbowAngle: angleOrNull(
      joints.rightShoulder,
      joints.rightElbow,
      joints.rightWrist
    ),
    leftShoulderAngle: angleOrNull(
      joints.leftElbow,
      joints.leftShoulder,
      joints.leftHip
    ),
    rightShoulderAngle: angleOrNull(
      joints.rightElbow,
      joints.rightShoulder,
      joints.rightHip
    ),
  };
}

export function recreateTrackedFrameFromLandmarks(
  baseFrame: TrackedFrame,
  landmarks: TrackedLandmark[],
  videoWidth: number,
  videoHeight: number
): TrackedFrame {
  const visibleLandmarks = filterVisibleLandmarks(landmarks);
  const bounds = calculateBounds(visibleLandmarks, videoWidth, videoHeight);

  if (!bounds) {
    return {
      ...baseFrame,
      landmarks,
      ...calculateJointAngles(landmarks),
    };
  }

  return {
    ...baseFrame,
    landmarks,
    crop: createCrop(bounds, videoWidth, videoHeight),
    centerX: (bounds.minX + bounds.maxX) / 2,
    centerY: (bounds.minY + bounds.maxY) / 2,
    ...calculateJointAngles(landmarks),
  };
}

export function createTrackedFrame(
  landmarks: TrackedLandmark[],
  frameIndex: number,
  time: number,
  videoWidth: number,
  videoHeight: number
): TrackedFrame | null {
  if (landmarks.length === 0) {
    return null;
  }

  const visibleLandmarks = filterVisibleLandmarks(landmarks);

  if (!hasEnoughVisibility(visibleLandmarks)) {
    return null;
  }

  const bounds = calculateBounds(visibleLandmarks, videoWidth, videoHeight);

  if (!bounds) {
    return null;
  }

  return {
    frameIndex,
    time,
    landmarks,
    crop: createCrop(bounds, videoWidth, videoHeight),
    centerX: (bounds.minX + bounds.maxX) / 2,
    centerY: (bounds.minY + bounds.maxY) / 2,
    ...calculateJointAngles(landmarks),
  };
}