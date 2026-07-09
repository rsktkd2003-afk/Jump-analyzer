// =============================================================
// AI解析層のすべての型定義。
// このファイルは他のsrc/aiモジュールに依存しない（依存方向の終点）。
// =============================================================

/** 2次元座標。数学処理・人物選択などで共用する */
export type Point2D = {
  x: number;
  y: number;
};

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

export type LandmarkSmoothingOptions = {
  enabled?: boolean;
};

export type MotionTrackingOptions = {
  smoothing?: LandmarkSmoothingOptions;
};

export type MotionTrackingResult = {
  frames: TrackedFrame[];
  detectedFrameCount: number;
  checkedFrameCount: number;
  confidence: number;
  message: string;
};

export type PoseAnalysisResult = {
  bestFrame: number | null;
  bestTime: number | null;
  confidence: number;
  message: string;
};

export type FormAnalysisResult = {
  elbowText: string;
  postureText: string;
  kneeText: string;
  summary: string;
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