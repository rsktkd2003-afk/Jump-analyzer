// =============================================================
// worldLandmarks（3D）の欠損・不正値検証。
//
// MediaPipeのworldLandmarksは常に信頼できる値を返すとは限らない
// （検出が不安定なフレーム、遮蔽、人物選択の一瞬のブレ等）。
// このモジュールは「この3Dデータをそのまま使ってよいか」だけを判定する。
// 無効と判定した場合、呼び出し側（pose3DPipeline.ts）はそのフレームの
// worldLandmarks3Dをundefinedのままにし、2D解析へ安全にフォールバックする。
// =============================================================

import { POSE_LANDMARK } from "./poseLandmarks";
import type { PoseWorldLandmark } from "./poseTypes";

/** MediaPipe Poseの全ランドマーク数。これ未満なら明らかに不完全なデータ */
const EXPECTED_LANDMARK_COUNT = 33;

/** 回旋角・傾き計算に使う主要関節。ここのvisibilityが低いと指標が信頼できない */
const KEY_JOINTS = [
  POSE_LANDMARK.LEFT_SHOULDER,
  POSE_LANDMARK.RIGHT_SHOULDER,
  POSE_LANDMARK.LEFT_HIP,
  POSE_LANDMARK.RIGHT_HIP,
] as const;

/** 主要関節の平均visibilityがこれ未満なら無効とする */
const MIN_KEY_JOINT_VISIBILITY = 0.5;

/** 体幹長（肩中点-腰中点、メートル）がこれ未満なら、スケールが破綻した
 *  不正値とみなす（実際の成人の体幹長はおおよそ0.4〜0.6m程度） */
const MIN_TORSO_LENGTH_M = 0.15;

/** 肩幅（メートル）がこれ未満なら不正値とみなす */
const MIN_SHOULDER_WIDTH_M = 0.1;

/** 前フレーム（有効な直近フレーム）の腰中点からの移動量がこれを超えたら、
 *  現実的にあり得ない移動として無効化する（メートル/フレーム）。
 *  fpsに依存せず安全側に大きめの値にしてある。 */
const MAX_PLAUSIBLE_HIP_MOTION_M = 1.5;

export type Pose3DValidationReason =
  | "missing"
  | "insufficient-points"
  | "non-finite-values"
  | "low-visibility"
  | "degenerate-scale"
  | "abnormal-motion";

export type Pose3DValidationResult = {
  valid: boolean;
  reason?: Pose3DValidationReason;
};

function isFiniteLandmark(landmark: PoseWorldLandmark): boolean {
  return (
    Number.isFinite(landmark.x) &&
    Number.isFinite(landmark.y) &&
    Number.isFinite(landmark.z)
  );
}

function distance3D(a: PoseWorldLandmark, b: PoseWorldLandmark): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

function midpoint3D(a: PoseWorldLandmark, b: PoseWorldLandmark): PoseWorldLandmark {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 };
}

/**
 * 3Dランドマークの構造的な妥当性（点数・数値・visibility・スケール）だけを検証する。
 * 前フレームとの連続性（移動量）はここでは見ない（validatePose3DMotionを使う）。
 */
export function validatePose3DStructure(
  landmarks: PoseWorldLandmark[] | undefined
): Pose3DValidationResult {
  if (!landmarks) {
    return { valid: false, reason: "missing" };
  }

  if (landmarks.length < EXPECTED_LANDMARK_COUNT) {
    return { valid: false, reason: "insufficient-points" };
  }

  if (!landmarks.every(isFiniteLandmark)) {
    return { valid: false, reason: "non-finite-values" };
  }

  const keyPoints = KEY_JOINTS.map((index) => landmarks[index]).filter(
    (p): p is PoseWorldLandmark => !!p
  );
  if (keyPoints.length < KEY_JOINTS.length) {
    return { valid: false, reason: "insufficient-points" };
  }

  const meanVisibility =
    keyPoints.reduce((sum, p) => sum + (p.visibility ?? 1), 0) / keyPoints.length;
  if (meanVisibility < MIN_KEY_JOINT_VISIBILITY) {
    return { valid: false, reason: "low-visibility" };
  }

  const [leftShoulder, rightShoulder, leftHip, rightHip] = keyPoints;
  const shoulderMid = midpoint3D(leftShoulder, rightShoulder);
  const hipMid = midpoint3D(leftHip, rightHip);
  const torsoLength = distance3D(shoulderMid, hipMid);
  const shoulderWidth = distance3D(leftShoulder, rightShoulder);

  if (torsoLength < MIN_TORSO_LENGTH_M || shoulderWidth < MIN_SHOULDER_WIDTH_M) {
    return { valid: false, reason: "degenerate-scale" };
  }

  return { valid: true };
}

/**
 * 直前の有効フレームからの腰中点の移動量が現実的かを検証する。
 * previousValidがnull（先頭フレーム等で比較対象がない）場合は常に有効とする。
 */
export function validatePose3DMotion(
  landmarks: PoseWorldLandmark[],
  previousValid: PoseWorldLandmark[] | null
): Pose3DValidationResult {
  if (!previousValid) {
    return { valid: true };
  }

  const leftHip = landmarks[POSE_LANDMARK.LEFT_HIP];
  const rightHip = landmarks[POSE_LANDMARK.RIGHT_HIP];
  const prevLeftHip = previousValid[POSE_LANDMARK.LEFT_HIP];
  const prevRightHip = previousValid[POSE_LANDMARK.RIGHT_HIP];

  if (!leftHip || !rightHip || !prevLeftHip || !prevRightHip) {
    // 構造検証で弾かれているはずだが、念のため安全側に倒す
    return { valid: false, reason: "insufficient-points" };
  }

  const hipMid = midpoint3D(leftHip, rightHip);
  const prevHipMid = midpoint3D(prevLeftHip, prevRightHip);
  const motion = distance3D(hipMid, prevHipMid);

  if (motion > MAX_PLAUSIBLE_HIP_MOTION_M) {
    return { valid: false, reason: "abnormal-motion" };
  }

  return { valid: true };
}

/**
 * 構造検証と連続性検証をあわせて行う。
 * このフレームの3Dデータをそのまま使ってよいかを最終判定する。
 */
export function validatePose3D(
  landmarks: PoseWorldLandmark[] | undefined,
  previousValid: PoseWorldLandmark[] | null
): Pose3DValidationResult {
  const structural = validatePose3DStructure(landmarks);
  if (!structural.valid) {
    return structural;
  }

  // landmarksはこの時点でPoseWorldLandmark[]であることが構造検証で保証されている
  return validatePose3DMotion(landmarks as PoseWorldLandmark[], previousValid);
}
