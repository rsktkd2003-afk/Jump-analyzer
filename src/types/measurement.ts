import type { Point } from "./point";

export type MeasurementMode = "jump" | "spike";

export type MarkerTarget =
  | "calibA"
  | "calibB"
  | "ring"
  | "finger"
  | "ballA"
  | "ballB";

export type Markers = {
  calibA: Point | null;
  calibB: Point | null;
  ring: Point | null;
  finger: Point | null;
  ballA: Point | null;
  ballB: Point | null;
};