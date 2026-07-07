import { calculateAngle } from "./poseMath";
import type {
  TrackedFrame,
  TrackedLandmark,
} from "./poseTypes";

const MIN_POINT_VISIBILITY = 0.35;
const MIN_AVERAGE_VISIBILITY = 0.6;
const MIN_VISIBLE_POINT_COUNT = 8;

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

  const visible = landmarks.filter(
    (point) =>
      point.visibility === undefined || point.visibility > MIN_POINT_VISIBILITY
  );

  if (visible.length < MIN_VISIBLE_POINT_COUNT) {
    return null;
  }

  const averageVisibility =
    visible.reduce((sum, point) => sum + (point.visibility ?? 1), 0) /
    visible.length;

  if (averageVisibility < MIN_AVERAGE_VISIBILITY) {
    return null;
  }

  const xs = visible.map((point) => point.x);
  const ys = visible.map((point) => point.y);

  const minX = Math.max(0, Math.min(...xs));
  const maxX = Math.min(videoWidth, Math.max(...xs));
  const minY = Math.max(0, Math.min(...ys));
  const maxY = Math.min(videoHeight, Math.max(...ys));

  const rawWidth = maxX - minX;
  const rawHeight = maxY - minY;

  if (rawWidth <= 0 || rawHeight <= 0) {
    return null;
  }

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