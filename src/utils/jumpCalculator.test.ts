import { describe, expect, it } from "vitest";
import type { Markers } from "../types/measurement";
import {
  calculateCmPerPx,
  calculateMaxReach,
  calculateReachError,
} from "./jumpCalculator";

const markers: Markers = {
  calibA: { x: 0, y: 0 },
  calibB: { x: 0, y: 100 },
  ring: { x: 100, y: 200 },
  finger: { x: 100, y: 180 },
  ballA: null,
  ballB: null,
};

describe("jumpCalculator", () => {
  it("基準距離からcm/pxを計算する", () => {
    expect(calculateCmPerPx(markers, 50)).toBeCloseTo(0.5);
  });

  it("基準点が不足している場合は計測不能にする", () => {
    expect(calculateCmPerPx({ ...markers, calibB: null }, 50)).toBeNull();
  });

  it("指先とリングの差から最高到達点を計算する", () => {
    expect(
      calculateMaxReach({ markers, knownCm: 50, ringHeight: 305 })
    ).toBeCloseTo(315);
  });

  it("マーカー誤差を±3px相当の全幅で返す", () => {
    expect(calculateReachError(markers, 50)).toBeCloseTo(3);
  });
});
