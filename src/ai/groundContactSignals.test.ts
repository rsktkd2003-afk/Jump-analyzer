import { describe, expect, it } from "vitest";
import type { TrackedFrame, TrackedLandmark } from "./poseTypes";
import {
  buildMotionSignals,
  clampEventOrder,
  computeGroundAndBaseline,
  computeGrounded,
  correctImplausibleAirTime,
  estimateTorsoPx,
  findFallbackLandingIndex,
  findLandingEndIndex,
  findPeakIndex,
  findPrimaryLandingIndex,
  findSinkEvents,
  findTakeoffIndex,
} from "./groundContactSignals";

function makeFrame(
  frameIndex: number,
  verticalOffset: number,
  visibility = 1
): TrackedFrame {
  const landmarks: TrackedLandmark[] = Array.from({ length: 33 }, () => ({
    x: 100,
    y: 300 + verticalOffset,
    visibility,
  }));

  for (const index of [11, 12]) {
    landmarks[index] = {
      x: index === 11 ? 80 : 120,
      y: 200 + verticalOffset,
      visibility,
    };
  }
  for (const index of [23, 24]) {
    landmarks[index] = {
      x: index === 23 ? 85 : 115,
      y: 300 + verticalOffset,
      visibility,
    };
  }
  for (const index of [27, 28, 29, 30, 31, 32]) {
    landmarks[index] = {
      x: index % 2 === 1 ? 85 : 115,
      y: 400 + verticalOffset,
      visibility,
    };
  }

  return {
    frameIndex,
    time: frameIndex * 0.1,
    landmarks,
    crop: { x: 0, y: 0, width: 200, height: 500 },
    centerX: 100,
    centerY: 300 + verticalOffset,
    leftKneeAngle: null,
    rightKneeAngle: null,
    hipAngle: null,
    shoulderTilt: null,
    leftHipAngle: null,
    rightHipAngle: null,
    leftElbowAngle: null,
    rightElbowAngle: null,
    leftShoulderAngle: null,
    rightShoulderAngle: null,
  };
}

describe("estimateTorsoPx", () => {
  it("肩中点と腰中点の距離の中央値を返す", () => {
    const frames = [makeFrame(0, 0), makeFrame(1, 0)];

    expect(estimateTorsoPx(frames)).toBeCloseTo(100);
  });

  it("肩・腰のいずれも欠測なら空配列の中央値でnullを返す", () => {
    const frames = [makeFrame(0, 0, 0.1)];

    expect(estimateTorsoPx(frames)).toBeNull();
  });
});

describe("buildMotionSignals", () => {
  it("visibility十分なフレーム列から信号を構築する", () => {
    const times = Array.from({ length: 10 }, (_, i) => i * 0.1);
    const frames = Array.from({ length: 10 }, (_, i) => makeFrame(i, 0));

    const result = buildMotionSignals(frames, times);

    expect(result).not.toBeNull();
    expect(result?.comY.length).toBe(10);
    expect(result?.comX.length).toBe(10);
    expect(result?.footY.length).toBe(10);
    expect(result?.lowConfidenceFrames.size).toBe(0);
    expect(result?.interpolatedRatio).toBe(0);
  });

  it("全区間低信頼の場合は信号を構築できずnull", () => {
    const times = Array.from({ length: 10 }, (_, i) => i * 0.1);
    const frames = Array.from({ length: 10 }, (_, i) => makeFrame(i, 0, 0.1));

    expect(buildMotionSignals(frames, times)).toBeNull();
  });
});

describe("computeGroundAndBaseline", () => {
  it("groundYは足Yの90%分位、baselineComYは先頭15%区間の中央値", () => {
    const footY = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
    const comY = Array(10).fill(100);

    const result = computeGroundAndBaseline(footY, comY, 10);

    expect(result.groundY).toBeCloseTo(91);
    expect(result.baselineComY).toBe(100);
  });
});

describe("computeGrounded", () => {
  it("足が地面付近かつ低速のフレームのみ接地とみなす（torsoPxあり）", () => {
    const footY = [95, 95, 50, 95, 95];
    const footVelocity = [0, 0, 0, 0, 0];

    const grounded = computeGrounded(5, footY, footVelocity, 100, 100);

    expect(grounded).toEqual([true, true, false, true, true]);
  });

  it("torsoPxがnullの場合は既定のtolerance/speedLimitにフォールバックする", () => {
    const footY = [90, 60];
    const footVelocity = [0, 0];

    // groundY=100, torsoPx=null -> tolerance=18 -> nearGround: footY>=82
    const grounded = computeGrounded(2, footY, footVelocity, 100, null);

    expect(grounded).toEqual([true, false]);
  });
});

describe("findPeakIndex", () => {
  it("comYが最小のインデックスを返す", () => {
    const comY = [100, 90, 80, 50, 70, 85, 95, 100];

    expect(findPeakIndex(comY)).toBe(3);
  });

  it("同点の場合は先に現れたインデックスを維持する", () => {
    const comY = [100, 90, 50, 90, 50, 100];

    expect(findPeakIndex(comY)).toBe(2);
  });
});

describe("findTakeoffIndex", () => {
  it("最高点から遡って最後に接地していたフレームを返す", () => {
    const grounded = [true, true, false, false, false, false, false, false];

    expect(findTakeoffIndex(grounded, 5)).toBe(1);
  });

  it("接地フレームが見つからない場合はpeakIndex-1にフォールバックする", () => {
    const grounded = [false, false, false];

    expect(findTakeoffIndex(grounded, 1)).toBe(0);
  });
});

describe("findPrimaryLandingIndex / findFallbackLandingIndex", () => {
  it("十分に下降し、かつ接地している最初のフレームを返す", () => {
    const comY = [50, 50, 50, 80, 90, 100, 100];
    const grounded = [true, true, true, false, false, true, true];

    expect(findPrimaryLandingIndex(comY, grounded, 90, 0, 7)).toBe(5);
  });

  it("接地条件を満たす点がなければnullを返す", () => {
    const comY = [50, 50, 50, 80, 90, 100, 100];
    const grounded = [true, false, false, false, false, false, false];

    expect(findPrimaryLandingIndex(comY, grounded, 90, 0, 7)).toBeNull();
  });

  it("基準姿勢の75%回復点を返す", () => {
    const comY = [50, 60, 70, 80, 90, 100];

    expect(findFallbackLandingIndex(comY, 85, 0, 6)).toBe(4);
  });

  it("回復点が見つからなければnullを返す", () => {
    const comY = [50, 60, 70, 80, 90, 100];

    expect(findFallbackLandingIndex(comY, 200, 0, 6)).toBeNull();
  });
});

describe("correctImplausibleAirTime", () => {
  it("airTimeSecが1.2秒以内なら何もしない", () => {
    const result = correctImplausibleAirTime({
      comY: [0, 0, 0],
      comVelocity: [0, 0, 0],
      times: [0, 0.5, 1.0],
      frameCount: 3,
      peakIndex: 0,
      takeoffIndex: 0,
      landingIndex: 2,
      airTimeSec: 0.5,
      descentThresholdY: 50,
    });

    expect(result).toEqual({ landingIndex: 2, airTimeSec: 0.5 });
  });

  it("airTimeSecがnullなら何もしない", () => {
    const result = correctImplausibleAirTime({
      comY: [0, 0, 0],
      comVelocity: [0, 0, 0],
      times: [0, 0.5, 1.0],
      frameCount: 3,
      peakIndex: 0,
      takeoffIndex: 0,
      landingIndex: 2,
      airTimeSec: null,
      descentThresholdY: 50,
    });

    expect(result).toEqual({ landingIndex: 2, airTimeSec: null });
  });

  it("下降速度が止まった点まで着地を引き戻し、1.2秒以内なら採用する", () => {
    const comY = [0, 0, 0, 0, 60, 65, 68, 69, 70, 70];
    const comVelocity = [0, 0, 0, 0, 10, 2, 0, 0, 0, 0];
    const times = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 1.3, 1.3];

    const result = correctImplausibleAirTime({
      comY,
      comVelocity,
      times,
      frameCount: 10,
      peakIndex: 0,
      takeoffIndex: 0,
      landingIndex: 9,
      airTimeSec: 1.3,
      descentThresholdY: 50,
    });

    expect(result.landingIndex).toBe(5);
    expect(result.airTimeSec).toBeCloseTo(0.5);
  });

  it("補正点が見つからない、または補正後も1.2秒超ならairTimeSecをnullにする", () => {
    const comY = Array(10).fill(0);
    const comVelocity = Array(10).fill(0);
    const times = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 1.3, 1.3];

    const result = correctImplausibleAirTime({
      comY,
      comVelocity,
      times,
      frameCount: 10,
      peakIndex: 0,
      takeoffIndex: 0,
      landingIndex: 9,
      airTimeSec: 1.3,
      descentThresholdY: 50,
    });

    expect(result.landingIndex).toBe(9);
    expect(result.airTimeSec).toBeNull();
  });
});

describe("findSinkEvents", () => {
  it("沈み込みがない場合はsinkPx<=0でtakeoffIndex-1をsinkStartにする", () => {
    const comY = [100, 90, 80, 70, 60];

    const result = findSinkEvents(comY, 100, 4);

    expect(result).toEqual({ sinkBottomIndex: 0, sinkStartIndex: 3, sinkPx: 0 });
  });

  it("沈み込みがある場合は最下点と基準姿勢近くまでの開始点を返す", () => {
    const comY = [100, 110, 120, 90, 80];

    const result = findSinkEvents(comY, 100, 4);

    expect(result).toEqual({ sinkBottomIndex: 2, sinkStartIndex: 0, sinkPx: 20 });
  });
});

describe("findLandingEndIndex", () => {
  it("着地後0.4秒以内で膝角度が最小のフレームを返す", () => {
    const times = [0, 0.1, 0.2, 0.3, 0.4, 0.5];
    const frames = times.map((_, i) => {
      const frame = makeFrame(i, 0);
      frame.leftKneeAngle = i === 2 ? 80 : 160;
      frame.rightKneeAngle = i === 2 ? 80 : 160;
      return frame;
    });

    expect(findLandingEndIndex(frames, times, 0)).toBe(2);
  });

  it("膝角度が全て取得できない場合は+0.3秒にフォールバックする", () => {
    const times = [0, 0.1, 0.2, 0.3, 0.4, 0.5];
    const frames = times.map((_, i) => makeFrame(i, 0));

    expect(findLandingEndIndex(frames, times, 0)).toBe(3);
  });
});

describe("clampEventOrder", () => {
  it("既に順序が正しい場合は変更しない", () => {
    const result = clampEventOrder({
      sinkStartIndex: 0,
      sinkBottomIndex: 2,
      takeoffIndex: 4,
      peakIndex: 6,
      landingIndex: 8,
      landingEndIndex: 8,
      lastIndex: 10,
    });

    expect(result).toEqual({
      sinkStartIndex: 0,
      sinkBottomIndex: 2,
      takeoffIndex: 4,
      landingIndex: 8,
      landingEndIndex: 8,
    });
  });

  it("順序が崩れている場合は境界にクランプする", () => {
    const result = clampEventOrder({
      sinkStartIndex: 5,
      sinkBottomIndex: 1,
      takeoffIndex: 0,
      peakIndex: 2,
      landingIndex: 1,
      landingEndIndex: 0,
      lastIndex: 10,
    });

    expect(result).toEqual({
      sinkStartIndex: 5,
      sinkBottomIndex: 5,
      takeoffIndex: 5,
      landingIndex: 3,
      landingEndIndex: 3,
    });
  });
});
