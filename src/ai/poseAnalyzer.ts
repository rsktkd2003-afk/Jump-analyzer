// =============================================================
// AI解析層の外部公開API。
// src/ai の外からは原則このファイル（または trackingAnalyzer）経由でimportする。
// 内部モジュール（poseTracking / poseFrameFactory など）を直接importしない。
// =============================================================

export {
  analyzeJumpPeakFrame,
  analyzeJumpFormAtPeak,
  detectPosePointsAtCurrentFrame,
  analyzeJumpForm,
} from "./jumpPeakAnalyzer";

export {
  analyzeTrackedMotion,
} from "./poseTracking";

export type {
  PoseAnalysisResult,
  JumpFormAnalysisResult,
  FormAnalysisResult,
  PoseOverlayPoint,
  Point2D,
  TrackedFrame,
  TrackedLandmark,
  TrackedCrop,
  MotionTrackingResult,
  MotionTrackingOptions,
  LandmarkSmoothingOptions,
} from "./poseTypes";