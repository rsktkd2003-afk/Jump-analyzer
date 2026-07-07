import type { Point } from "../types/point";

export const distancePx = (a: Point, b: Point): number => {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
};