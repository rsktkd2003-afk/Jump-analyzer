import type { MeasurementMode } from "./measurement";

export type MeasurementHistoryItem = {
  id: string;
  createdAt: string;
  mode: MeasurementMode;

  maxReach: number | null;
  jumpHeight: number | null;
  airTime: number | null;
  airFrameCount: number | null;
  estimatedJumpHeight: number | null;

  peakTime: number | null;
  peakFrame: number | null;

  reachError: number | null;
  ballSpeed: number | null;
  speedError: number | null;
};