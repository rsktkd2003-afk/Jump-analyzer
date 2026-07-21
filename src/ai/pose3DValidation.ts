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

/**
 * 移動量検証で比較する主要関節。骨盤（左右股関節の中点）は正規化の原点として
 * 使うため、比較対象には含めない（含めても常に変化量0になり無意味なため）。
 * PRレビュー指摘: MediaPipeのworldLandmarksは人物中心（股関節中点が常に原点付近）の
 * 座標系のため、絶対位置の移動量では人物乗り換え・3D推定破綻を検出できない。
 * 代わりに、骨盤中心・体幹長で正規化した上での主要関節の「形状」の変化を見る。
 */
const MOTION_CHECK_JOINTS = [
  POSE_LANDMARK.LEFT_SHOULDER,
  POSE_LANDMARK.RIGHT_SHOULDER,
  POSE_LANDMARK.LEFT_ELBOW,
  POSE_LANDMARK.RIGHT_ELBOW,
  POSE_LANDMARK.LEFT_WRIST,
  POSE_LANDMARK.RIGHT_WRIST,
  POSE_LANDMARK.LEFT_KNEE,
  POSE_LANDMARK.RIGHT_KNEE,
  POSE_LANDMARK.LEFT_ANKLE,
  POSE_LANDMARK.RIGHT_ANKLE,
] as const;

/** 移動量比較に使う関節のvisibilityがこれ未満なら、その関節は比較から除外する */
const MIN_JOINT_VISIBILITY_FOR_MOTION_CHECK = 0.5;

/** 比較に使える関節数がこれ未満なら、可視性不足として判定を見送る（valid扱いにする） */
const MIN_JOINTS_FOR_MOTION_CHECK = 4;

/**
 * 前フレームとの「正規化空間（体幹長=1相当）における主要関節位置の変化量」の
 * 中央値がこれを超えたら異常移動とみなす（メートルではなく体幹長比の無次元値）。
 * 中央値を使うことで、腕1本の高速スイングのような少数関節だけの大きな変化では
 * 発火せず（半数以上の関節が変化しないと中央値は上がらない）、人物乗り換え・
 * 3D推定破綻のように大半の関節が同時に大きく変化した場合だけ検出できる。
 * 実動画での発火頻度未検証のため、Phase 2B以降の実データで再調整が必要。
 */
const MAX_PLAUSIBLE_MEDIAN_SHAPE_CHANGE = 0.9;

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

/** 骨盤中点を原点、体幹長をスケールとして正規化するための基準点を求める。
 *  肩・腰のいずれかが欠けている場合はnull（構造検証で弾かれているはずだが念のため）。 */
function poseOriginAndScale(
  landmarks: PoseWorldLandmark[]
): { origin: PoseWorldLandmark; scale: number } | null {
  const leftShoulder = landmarks[POSE_LANDMARK.LEFT_SHOULDER];
  const rightShoulder = landmarks[POSE_LANDMARK.RIGHT_SHOULDER];
  const leftHip = landmarks[POSE_LANDMARK.LEFT_HIP];
  const rightHip = landmarks[POSE_LANDMARK.RIGHT_HIP];
  if (!leftShoulder || !rightShoulder || !leftHip || !rightHip) return null;

  const origin = midpoint3D(leftHip, rightHip);
  const shoulderMid = midpoint3D(leftShoulder, rightShoulder);
  // 構造検証(validatePose3DStructure)で体幹長 >= MIN_TORSO_LENGTH_M が既に
  // 保証されているはずだが、床値として同じ定数を再利用し安全側に倒す。
  const scale = Math.max(distance3D(shoulderMid, origin), MIN_TORSO_LENGTH_M);
  return { origin, scale };
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * 直前の有効フレームとの「姿勢形状」の変化が現実的かを検証する。
 * previousValidがnull（先頭フレーム等で比較対象がない）場合は常に有効とする。
 *
 * MediaPipeのworldLandmarksは股関節中点付近を原点とする人物中心座標のため、
 * 単純な絶対位置（例: 腰中点）の移動量では判定できない（常にほぼ0になり、
 * 人物乗り換え・3D推定破綻を検出できない）。そこで両フレームをそれぞれ
 * 骨盤中心原点・体幹長スケールで正規化した上で、主要関節（肩・肘・手首・膝・
 * 足首）位置の変化量の中央値を見る。中央値を使うことで、腕1本の高速スイング
 * のような少数関節だけの変化では発火せず、大半の関節が同時に大きく変化した
 * 場合だけを異常とみなせる。
 */
export function validatePose3DMotion(
  landmarks: PoseWorldLandmark[],
  previousValid: PoseWorldLandmark[] | null
): Pose3DValidationResult {
  if (!previousValid) {
    return { valid: true };
  }

  const current = poseOriginAndScale(landmarks);
  const previous = poseOriginAndScale(previousValid);

  if (!current || !previous) {
    // 構造検証で弾かれているはずだが、念のため安全側に倒す
    return { valid: false, reason: "insufficient-points" };
  }

  const displacements: number[] = [];
  for (const jointIndex of MOTION_CHECK_JOINTS) {
    const currentPoint = landmarks[jointIndex];
    const previousPoint = previousValid[jointIndex];
    if (!currentPoint || !previousPoint) continue;
    if (
      (currentPoint.visibility ?? 1) < MIN_JOINT_VISIBILITY_FOR_MOTION_CHECK ||
      (previousPoint.visibility ?? 1) < MIN_JOINT_VISIBILITY_FOR_MOTION_CHECK
    ) {
      continue;
    }

    const normalizedCurrent = {
      x: (currentPoint.x - current.origin.x) / current.scale,
      y: (currentPoint.y - current.origin.y) / current.scale,
      z: (currentPoint.z - current.origin.z) / current.scale,
    };
    const normalizedPrevious = {
      x: (previousPoint.x - previous.origin.x) / previous.scale,
      y: (previousPoint.y - previous.origin.y) / previous.scale,
      z: (previousPoint.z - previous.origin.z) / previous.scale,
    };

    displacements.push(
      Math.hypot(
        normalizedCurrent.x - normalizedPrevious.x,
        normalizedCurrent.y - normalizedPrevious.y,
        normalizedCurrent.z - normalizedPrevious.z
      )
    );
  }

  if (displacements.length < MIN_JOINTS_FOR_MOTION_CHECK) {
    // 比較に使える関節が少なすぎる場合は判定を見送る（可視性不足による誤検出を避ける）
    return { valid: true };
  }

  if (median(displacements) > MAX_PLAUSIBLE_MEDIAN_SHAPE_CHANGE) {
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
