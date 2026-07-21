// =============================================================
// 3D指標（Phase2A初期5指標）の算出。
//
// 入力は pose3DNormalization.ts が返す NormalizedPose3D
// （骨盤中心原点・体幹長スケールに正規化済み）を使う。
// 生のworldLandmarksを直接使わないのは、カメラからの距離や
// 体格差によるスケールの影響を受けないようにするため。
//
// x/y軸の絶対的な正方向はMediaPipe側で未確認（poseTypes.tsの
// PoseWorldLandmarkコメント参照）。ここで算出する回旋角・傾き角は
// いずれも同一フレーム内の相対的なベクトル計算であるため、符号の
// 絶対的な意味（例: 正の値が右回旋か左回旋か）は実動画で要確認だが、
// フレーム間の相対比較・時系列変化の把握には軸の向きが未確認でも使える。
//
// Feature Flag ENABLE_3D_METRICS が false の間は、この算出結果は
// どこからも呼び出されず、既存の2D採点にも一切影響しない。
// =============================================================

import { POSE_LANDMARK } from "./poseLandmarks";
import type { NormalizedPose3D, PoseWorldLandmark } from "./poseTypes";

const RAD_TO_DEG = 180 / Math.PI;

export type Pose3DMetrics = {
  /** 肩の回旋量（度）。肩ラインをx-z平面（水平面）に投影し、x軸からの角度で表す */
  shoulderRotationDeg: number;
  /** 骨盤の回旋量（度）。腰ラインをx-z平面（水平面）に投影し、x軸からの角度で表す */
  pelvisRotationDeg: number;
  /** 肩と骨盤の回旋角の差（度、-180〜180に正規化）。いわゆるX-factor（体幹の捻れ）に相当 */
  shoulderPelvisSeparationDeg: number;
  /** 体幹の前後傾き（度）。骨盤中心→肩中点ベクトルを、垂直軸(y)からy-z平面内でどれだけ
   *  傾いているかで表す。前後どちらが正かは未確認（PoseWorldLandmarkのコメント参照） */
  trunkForwardTiltDeg: number;
  /** 体幹の左右傾き（度）。骨盤中心→肩中点ベクトルを、垂直軸(y)からx-y平面内でどれだけ
   *  傾いているかで表す。左右どちらが正かは未確認（PoseWorldLandmarkのコメント参照） */
  trunkLateralTiltDeg: number;
};

function normalizeAngleDeg(deg: number): number {
  let normalized = deg % 360;
  if (normalized > 180) normalized -= 360;
  if (normalized < -180) normalized += 360;
  return normalized;
}

/** 2点を結ぶベクトルを、水平面(x-z平面)に投影しx軸からの角度(度)を返す */
function horizontalRotationDeg(from: PoseWorldLandmark, to: PoseWorldLandmark): number {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  return Math.atan2(dz, dx) * RAD_TO_DEG;
}

export function calculatePose3DMetrics(pose: NormalizedPose3D): Pose3DMetrics | null {
  const landmarks = pose.landmarks;
  const leftShoulder = landmarks[POSE_LANDMARK.LEFT_SHOULDER];
  const rightShoulder = landmarks[POSE_LANDMARK.RIGHT_SHOULDER];
  const leftHip = landmarks[POSE_LANDMARK.LEFT_HIP];
  const rightHip = landmarks[POSE_LANDMARK.RIGHT_HIP];

  if (!leftShoulder || !rightShoulder || !leftHip || !rightHip) {
    return null;
  }

  const shoulderRotationDeg = horizontalRotationDeg(leftShoulder, rightShoulder);
  const pelvisRotationDeg = horizontalRotationDeg(leftHip, rightHip);
  const shoulderPelvisSeparationDeg = normalizeAngleDeg(shoulderRotationDeg - pelvisRotationDeg);

  const hipMid = {
    x: (leftHip.x + rightHip.x) / 2,
    y: (leftHip.y + rightHip.y) / 2,
    z: (leftHip.z + rightHip.z) / 2,
  };
  const shoulderMid = {
    x: (leftShoulder.x + rightShoulder.x) / 2,
    y: (leftShoulder.y + rightShoulder.y) / 2,
    z: (leftShoulder.z + rightShoulder.z) / 2,
  };

  const trunkDx = shoulderMid.x - hipMid.x;
  const trunkDy = shoulderMid.y - hipMid.y;
  const trunkDz = shoulderMid.z - hipMid.z;
  const verticalMagnitude = Math.abs(trunkDy);

  const trunkForwardTiltDeg = Math.atan2(trunkDz, verticalMagnitude) * RAD_TO_DEG;
  const trunkLateralTiltDeg = Math.atan2(trunkDx, verticalMagnitude) * RAD_TO_DEG;

  return {
    shoulderRotationDeg,
    pelvisRotationDeg,
    shoulderPelvisSeparationDeg,
    trunkForwardTiltDeg,
    trunkLateralTiltDeg,
  };
}
