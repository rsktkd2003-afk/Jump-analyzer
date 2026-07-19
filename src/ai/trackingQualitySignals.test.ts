import { describe, expect, it } from "vitest";

import { deriveQualitySignalsFromFrames } from "./trackingQualitySignals";
import type { PersonTrackerStats, TrackedFrame, TrackedLandmark } from "./poseTypes";

function landmark(x: number, y: number, visibility = 1): TrackedLandmark {
  return { x, y, visibility };
}

/** groundContact.detectJumpEventsが有効な結果を返せる、最低限の跳躍フレーム列を作る */
function makeFrames(count: number): TrackedFrame[] {
  return Array.from({ length: count }, (_, i) => {
    const landmarks: TrackedLandmark[] = new Array(33).fill(null).map(() => landmark(100, 300));
    landmarks[11] = landmark(80, 200);
    landmarks[12] = landmark(120, 200);
    landmarks[23] = landmark(85, 300);
    landmarks[24] = landmark(115, 300);
    landmarks[25] = landmark(85, 350);
    landmarks[26] = landmark(115, 350);
    for (const idx of [27, 28, 29, 30, 31, 32]) {
      landmarks[idx] = landmark(idx % 2 === 1 ? 85 : 115, 400);
    }

    return {
      frameIndex: i,
      time: i * 0.1,
      landmarks,
      crop: { x: 0, y: 0, width: 200, height: 500 },
      centerX: 100,
      centerY: 300,
      leftKneeAngle: 160,
      rightKneeAngle: 160,
      hipAngle: 160,
      shoulderTilt: 0,
      leftHipAngle: 160,
      rightHipAngle: 160,
      leftElbowAngle: 150,
      rightElbowAngle: 150,
      leftShoulderAngle: 90,
      rightShoulderAngle: 90,
    };
  });
}

function makeTrackerStats(overrides: Partial<PersonTrackerStats> = {}): PersonTrackerStats {
  return {
    updateCount: 0,
    matchedFrameCount: 0,
    coastingFrameCount: 0,
    reacquiredCount: 0,
    rejectedCandidateCount: 0,
    matchScoreSum: 0,
    matchScoreCount: 0,
    ...overrides,
  };
}

describe("trackingQualitySignals: trackerStatsの有無による挙動の違い", () => {
  it("trackerStatsを渡すと、実測のcoastingFrameCount/updateCountからcoastingFrameRatioを算出する", () => {
    const frames = makeFrames(10);
    const stats = makeTrackerStats({ updateCount: 20, coastingFrameCount: 5 });

    const signals = deriveQualitySignalsFromFrames(frames, stats);

    expect(signals.coastingFrameRatio).toBeCloseTo(0.25, 10);
  });

  it("trackerStatsを渡すと、実測のmatchScoreSum/matchScoreCountからaverageTrackerMatchScoreを算出する", () => {
    const frames = makeFrames(10);
    const stats = makeTrackerStats({
      updateCount: 10,
      matchedFrameCount: 10,
      matchScoreSum: 8,
      matchScoreCount: 10,
    });

    const signals = deriveQualitySignalsFromFrames(frames, stats);

    expect(signals.averageTrackerMatchScore).toBeCloseTo(0.8, 10);
  });

  it("trackerStats未指定でもエラーにならず、動作する（旧経路へのフォールバック）", () => {
    const frames = makeFrames(10);
    expect(() => deriveQualitySignalsFromFrames(frames)).not.toThrow();
    const signals = deriveQualitySignalsFromFrames(frames);
    expect(signals).toBeDefined();
  });

  it("updateCount=0（一度もトラッカーが呼ばれていない）の場合、coastingFrameRatioはNaNではなくnullになる", () => {
    const frames = makeFrames(10);
    const stats = makeTrackerStats({ updateCount: 0, coastingFrameCount: 0 });

    const signals = deriveQualitySignalsFromFrames(frames, stats);

    expect(signals.coastingFrameRatio).toBeNull();
    expect(Number.isNaN(signals.coastingFrameRatio ?? 0)).toBe(false);
  });

  it("matchScoreCount=0の場合、averageTrackerMatchScoreはNaNではなくnullになる", () => {
    const frames = makeFrames(10);
    const stats = makeTrackerStats({ updateCount: 5, coastingFrameCount: 5, matchScoreCount: 0 });

    const signals = deriveQualitySignalsFromFrames(frames, stats);

    expect(signals.averageTrackerMatchScore).toBeNull();
  });

  it("空のフレーム列・空の統計でも例外を投げない", () => {
    expect(() => deriveQualitySignalsFromFrames([], makeTrackerStats())).not.toThrow();
  });
});
