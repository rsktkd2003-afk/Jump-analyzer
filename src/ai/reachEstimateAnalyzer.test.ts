import { describe, expect, it } from "vitest";
import {
  estimateReachFromInputs,
  type ReachEstimateInput,
} from "./reachEstimateAnalyzer";

const baseInput: ReachEstimateInput = {
  standingReachCm: 214,
  heightCm: 170,
  calibrationMaxReachCm: null,
  flightTimeJumpHeightCm: null,
  knownMaxReachCm: null,
  calibrationErrorCm: null,
};

describe("estimateReachFromInputs", () => {
  it("キャリブレーション値を既知値・滞空時間より優先する", () => {
    const result = estimateReachFromInputs({
      ...baseInput,
      calibrationMaxReachCm: 305,
      knownMaxReachCm: 300,
      flightTimeJumpHeightCm: 80,
      calibrationErrorCm: 4,
    });

    expect(result.method).toBe("calibration");
    expect(result.estimatedMaxReachCm).toBe(305);
    expect(result.estimatedJumpHeightCm).toBe(91);
    expect(result.confidence).toBe("高");
  });

  it.each([
    { errorCm: 5, expected: "高" },
    { errorCm: 5.1, expected: "中" },
    { errorCm: 12, expected: "中" },
    { errorCm: 12.1, expected: "低" },
  ] as const)(
    "キャリブレーション誤差$errorCm cmを信頼度$expectedに分類する",
    ({ errorCm, expected }) => {
      const result = estimateReachFromInputs({
        ...baseInput,
        calibrationMaxReachCm: 305,
        calibrationErrorCm: errorCm,
      });

      expect(result.confidence).toBe(expected);
    }
  );

  it("キャリブレーションがない場合は既知の最高到達点を使う", () => {
    const result = estimateReachFromInputs({
      ...baseInput,
      knownMaxReachCm: 303,
      flightTimeJumpHeightCm: 80,
    });

    expect(result.method).toBe("known-max-reach");
    expect(result.estimatedMaxReachCm).toBe(303);
    expect(result.estimatedJumpHeightCm).toBe(89);
    expect(result.confidence).toBe("高");
  });

  it("滞空時間法では指高に推定ジャンプ高を加算する", () => {
    const result = estimateReachFromInputs({
      ...baseInput,
      flightTimeJumpHeightCm: 76.5,
    });

    expect(result.method).toBe("flight-time");
    expect(result.estimatedMaxReachCm).toBeCloseTo(290.5);
    expect(result.estimatedJumpHeightCm).toBeCloseTo(76.5);
    expect(result.confidence).toBe("低");
  });

  it.each([99, 301, null])(
    "指高が有効範囲外の場合は他の入力があっても算出しない: %s",
    (standingReachCm) => {
      const result = estimateReachFromInputs({
        ...baseInput,
        standingReachCm,
        calibrationMaxReachCm: 305,
      });

      expect(result.method).toBeNull();
      expect(result.estimatedMaxReachCm).toBeNull();
      expect(result.estimatedJumpHeightCm).toBeNull();
      expect(result.confidence).toBeNull();
    }
  );

  it("換算材料がない場合は未算出を返す", () => {
    const result = estimateReachFromInputs(baseInput);

    expect(result.method).toBeNull();
    expect(result.methodLabel).toBe("未算出");
    expect(result.estimatedMaxReachCm).toBeNull();
    expect(result.confidenceText).toContain("未算出");
  });
});
