import type { MeasurementMode } from "./measurement";

export type ReachEstimateMethod =
  | "calibration"
  | "known-max-reach"
  | "flight-time";

export type ReachEstimateConfidence = "高" | "中" | "低";

export type MeasurementHistoryItem = {
  id: string;
  createdAt: string;
  mode: MeasurementMode;

  maxReach: number | null;
  jumpHeight: number | null;
  airTime: number | null;
  airFrameCount: number | null;
  estimatedJumpHeight: number | null;

  estimatedMaxReach?: number | null;
  estimatedReachJumpHeight?: number | null;
  reachEstimateMethod?: ReachEstimateMethod | null;
  reachEstimateConfidence?: ReachEstimateConfidence | null;
  heightCm?: number | null;
  standingReach?: number | null;
  knownMaxReach?: number | null;

  peakTime: number | null;
  peakFrame: number | null;

  reachError: number | null;
  ballSpeed: number | null;
  speedError: number | null;
};