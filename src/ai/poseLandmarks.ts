// =============================================================
// MediaPipe Pose の骨格点定義と、骨格点へのアクセス共通処理。
// インデックスのマジックナンバーと可視性しきい値はここに集約する。
// =============================================================

import type { Point2D } from "./poseTypes";

/** MediaPipe Pose の骨格点インデックス */
export const POSE_LANDMARK = {
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13,
  RIGHT_ELBOW: 14,
  LEFT_WRIST: 15,
  RIGHT_WRIST: 16,
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
  LEFT_KNEE: 25,
  RIGHT_KNEE: 26,
  LEFT_ANKLE: 27,
  RIGHT_ANKLE: 28,
} as const;

/** この値以下のvisibilityの骨格点は「見えていない」として扱う */
export const MIN_POINT_VISIBILITY = 0.35;

type VisibilityPoint = Point2D & { visibility?: number };

/** visibility未定義（MediaPipeが値を返さない場合）は可視とみなす */
export function isVisibleLandmark(point: VisibilityPoint): boolean {
  return point.visibility === undefined || point.visibility > MIN_POINT_VISIBILITY;
}

export function filterVisibleLandmarks<T extends VisibilityPoint>(
  landmarks: T[]
): T[] {
  return landmarks.filter(isVisibleLandmark);
}

/** 解析で使う主要関節の骨格点セット。存在しない点はundefined */
export type BodyJoints<T> = {
  leftShoulder: T | undefined;
  rightShoulder: T | undefined;
  leftElbow: T | undefined;
  rightElbow: T | undefined;
  leftWrist: T | undefined;
  rightWrist: T | undefined;
  leftHip: T | undefined;
  rightHip: T | undefined;
  leftKnee: T | undefined;
  rightKnee: T | undefined;
  leftAnkle: T | undefined;
  rightAnkle: T | undefined;
};

/** 骨格点配列から主要関節を名前付きで取り出す（正規化座標・ピクセル座標どちらでも可） */
export function getBodyJoints<T extends Point2D>(landmarks: T[]): BodyJoints<T> {
  return {
    leftShoulder: landmarks[POSE_LANDMARK.LEFT_SHOULDER],
    rightShoulder: landmarks[POSE_LANDMARK.RIGHT_SHOULDER],
    leftElbow: landmarks[POSE_LANDMARK.LEFT_ELBOW],
    rightElbow: landmarks[POSE_LANDMARK.RIGHT_ELBOW],
    leftWrist: landmarks[POSE_LANDMARK.LEFT_WRIST],
    rightWrist: landmarks[POSE_LANDMARK.RIGHT_WRIST],
    leftHip: landmarks[POSE_LANDMARK.LEFT_HIP],
    rightHip: landmarks[POSE_LANDMARK.RIGHT_HIP],
    leftKnee: landmarks[POSE_LANDMARK.LEFT_KNEE],
    rightKnee: landmarks[POSE_LANDMARK.RIGHT_KNEE],
    leftAnkle: landmarks[POSE_LANDMARK.LEFT_ANKLE],
    rightAnkle: landmarks[POSE_LANDMARK.RIGHT_ANKLE],
  };
}