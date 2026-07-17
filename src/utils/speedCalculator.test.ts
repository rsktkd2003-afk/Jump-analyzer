import { describe, expect, it } from "vitest";
import type { Markers } from "../types/measurement";
import { calculateBallSpeed, calculateSpeedError } from "./speedCalculator";

const markers: Markers = {
  calibA: { x: 0, y: 0 },
  calibB: { x: 0, y: 100 },
  ring: null,
  finger: null,
  ballA: { x: 0, y: 0 },
  ballB: { x: 100, y: 0 },
};

describe("speedCalculator", () => {
  it("移動距離と時間からkm/hを計算する", () => {
    expect(
      calculateBallSpeed({ markers, knownCm: 100, timeA: 1, timeB: 2 })
    ).toBeCloseTo(3.6);
  });

  it("同一時刻やマーカー不足は計測不能にする", () => {
    expect(
      calculateBallSpeed({ markers, knownCm: 100, timeA: 1, timeB: 1 })
    ).toBeNull();
    expect(
      calculateBallSpeed({
        markers: { ...markers, ballB: null },
        knownCm: 100,
        timeA: 1,
        timeB: 2,
      })
    ).toBeNull();
  });

  it("速度誤差を速度の12%として返す", () => {
    expect(calculateSpeedError(100)).toBeCloseTo(12);
    expect(calculateSpeedError(null)).toBeNull();
  });
});
