import { describe, expect, it } from "vitest";

import { calculatePose3DQualitySignals } from "./pose3DQualitySignals";

describe("calculatePose3DQualitySignals", () => {
  it("フレームが0件の場合はすべて0を返す", () => {
    const result = calculatePose3DQualitySignals([], new Set());
    expect(result).toEqual({
      availableFrameRatio: 0,
      lowConfidenceFrameRatio: 0,
      interpolatedFrameRatio: 0,
      abnormalMotionFrameRatio: 0,
      meanVisibility: 0,
    });
  });

  it("全フレーム有効・高visibilityの場合はavailableFrameRatio=1、lowConfidenceFrameRatio=0", () => {
    const result = calculatePose3DQualitySignals(
      [
        { valid: true, visibility: 0.9 },
        { valid: true, visibility: 0.95 },
      ],
      new Set()
    );
    expect(result.availableFrameRatio).toBe(1);
    expect(result.lowConfidenceFrameRatio).toBe(0);
    expect(result.meanVisibility).toBeCloseTo(0.925, 10);
  });

  it("interpolatedFrameIndexesはavailableFrameRatioに加算され、interpolatedFrameRatioにも反映される", () => {
    const result = calculatePose3DQualitySignals(
      [
        { valid: true, visibility: 0.9 },
        { valid: false, reason: "missing" },
        { valid: false, reason: "missing" },
        { valid: true, visibility: 0.9 },
      ],
      new Set([1, 2])
    );
    // 有効2件 + 補間2件 = 4件 / 全4件 = 1
    expect(result.availableFrameRatio).toBe(1);
    expect(result.interpolatedFrameRatio).toBe(0.5);
  });

  it("低visibilityフレームの割合は有効フレーム数を分母に計算する", () => {
    const result = calculatePose3DQualitySignals(
      [
        { valid: true, visibility: 0.5 }, // 低信頼(<0.7)
        { valid: true, visibility: 0.9 },
        { valid: false, reason: "low-visibility" },
      ],
      new Set()
    );
    // 有効フレーム2件のうち1件が低信頼 -> 0.5
    expect(result.lowConfidenceFrameRatio).toBe(0.5);
  });

  it("abnormal-motion理由のフレーム割合を全フレーム数を分母に計算する", () => {
    const result = calculatePose3DQualitySignals(
      [
        { valid: true, visibility: 0.9 },
        { valid: false, reason: "abnormal-motion" },
        { valid: false, reason: "missing" },
        { valid: false, reason: "abnormal-motion" },
      ],
      new Set()
    );
    expect(result.abnormalMotionFrameRatio).toBe(0.5);
  });

  it("有効フレームが0件の場合、meanVisibilityとlowConfidenceFrameRatioは0", () => {
    const result = calculatePose3DQualitySignals(
      [
        { valid: false, reason: "missing" },
        { valid: false, reason: "insufficient-points" },
      ],
      new Set()
    );
    expect(result.meanVisibility).toBe(0);
    expect(result.lowConfidenceFrameRatio).toBe(0);
    expect(result.availableFrameRatio).toBe(0);
  });
});
