import { describe, expect, it } from "vitest";
import type { TrackedFrame, TrackedLandmark } from "./poseTypes";
import { detectJumpEvents } from "./groundContact";

function createFrame(
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
  for (const index of [25, 26]) {
    landmarks[index] = {
      x: index === 25 ? 85 : 115,
      y: 350 + verticalOffset,
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
    leftKneeAngle: frameIndex >= 14 ? 100 : 160,
    rightKneeAngle: frameIndex >= 14 ? 100 : 160,
    hipAngle: 160,
    shoulderTilt: 0,
    leftHipAngle: 160,
    rightHipAngle: 160,
    leftElbowAngle: 150,
    rightElbowAngle: 150,
    leftShoulderAngle: 90,
    rightShoulderAngle: 90,
  };
}

describe("detectJumpEvents", () => {
  it("8フレーム未満は解析不能にする", () => {
    const frames = Array.from({ length: 7 }, (_, index) =>
      createFrame(index, 0)
    );

    expect(detectJumpEvents(frames)).toBeNull();
  });

  it("静止区間をジャンプとして扱わない", () => {
    const frames = Array.from({ length: 16 }, (_, index) =>
      createFrame(index, 0)
    );

    const result = detectJumpEvents(frames);

    expect(result).not.toBeNull();
    expect(result?.valid).toBe(false);
    expect(result?.airTimeSec).toBeNull();
  });

  it("主要骨格点が全区間低信頼の場合は解析不能にする", () => {
    const frames = Array.from({ length: 16 }, (_, index) =>
      createFrame(index, 0, 0.1)
    );

    expect(detectJumpEvents(frames)).toBeNull();
  });

  it("上昇と下降を含む系列ではイベント順序を保証する", () => {
    const offsets = [
      0,
      0,
      0,
      0,
      10,
      0,
      -30,
      -60,
      -90,
      -110,
      -90,
      -60,
      -30,
      0,
      0,
      0,
      0,
      0,
    ];
    const frames = offsets.map((offset, index) => createFrame(index, offset));

    const result = detectJumpEvents(frames);

    expect(result).not.toBeNull();
    expect(result?.valid).toBe(true);
    expect(result?.sinkStartIndex).toBeLessThanOrEqual(
      result?.sinkBottomIndex ?? -1
    );
    expect(result?.sinkBottomIndex).toBeLessThanOrEqual(
      result?.takeoffIndex ?? -1
    );
    expect(result?.takeoffIndex).toBeLessThan(result?.peakIndex ?? -1);
    expect(result?.peakIndex).toBeLessThan(result?.landingIndex ?? -1);
    expect(result?.landingIndex).toBeLessThanOrEqual(
      result?.landingEndIndex ?? -1
    );
    expect(result?.airTimeSec).not.toBeNull();
    expect(result?.airTimeSec ?? 0).toBeGreaterThan(0);
    expect(result?.airTimeSec ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(
      1.2
    );
  });
});
