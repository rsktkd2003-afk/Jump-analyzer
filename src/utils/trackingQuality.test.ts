import { describe, expect, it } from "vitest";

import {
  analyzeJumpFromPoseFrames,
  detectJumpEvent,
  estimateJumpHeightFromFlightTime,
  smoothPoseFrames,
  type SmoothedFrame,
} from "./trackingQuality";

function smoothedFrame(
  index: number,
  overrides: Partial<SmoothedFrame> = {}
): SmoothedFrame {
  return {
    timestamp: index * 100,
    hipY: 1,
    kneeY: 1,
    ankleY: 1,
    hipVelocity: 0,
    kneeVelocity: 0,
    ankleVelocity: 0,
    ...overrides,
  };
}

function jumpFrames(
  takeoffOverrides: Partial<SmoothedFrame> = {},
  landingOverrides: Partial<SmoothedFrame> = {}
): SmoothedFrame[] {
  const frames = Array.from({ length: 20 }, (_, index) =>
    smoothedFrame(index)
  );

  frames[15] = smoothedFrame(15, {
    hipY: 0.9,
    ankleY: 0.9,
    hipVelocity: -0.2,
    ankleVelocity: -0.2,
    ...takeoffOverrides,
  });
  frames[16] = smoothedFrame(16, {
    hipY: 0.9,
    ankleY: 0.9,
    hipVelocity: 0,
  });
  frames[17] = smoothedFrame(17, {
    hipY: 0.9,
    ankleY: 0.9,
    hipVelocity: 0,
  });
  frames[18] = smoothedFrame(18, {
    ankleY: 0.99,
    hipVelocity: -0.05,
    ...landingOverrides,
  });

  return frames;
}

describe("trackingQuality: 骨格座標の平滑化", () => {
  it("5点の対称移動平均と秒単位の速度を計算する", () => {
    const frames = [0, 1, 2, 3, 4].map((y, index) => ({
      timestamp: index * 1000,
      leftHip: { x: 0, y, visibility: 1 },
      rightHip: { x: 1, y, visibility: 1 },
      leftKnee: { x: 0, y, visibility: 1 },
      rightKnee: { x: 1, y, visibility: 1 },
      leftAnkle: { x: 0, y, visibility: 1 },
      rightAnkle: { x: 1, y, visibility: 1 },
    }));

    const result = smoothPoseFrames(frames);

    expect(result.map((frame) => frame.hipY)).toEqual([1, 1.5, 2, 2.5, 3]);
    expect(result.map((frame) => frame.hipVelocity)).toEqual([
      null,
      0.5,
      0.5,
      0.5,
      0.5,
    ]);
  });

  it("visibility 0.5未満を除外し、未定義の点は有効として平均する", () => {
    const result = smoothPoseFrames([
      {
        timestamp: 0,
        leftHip: { x: 0, y: 100, visibility: 0.49 },
        rightHip: { x: 0, y: 3 },
      },
    ]);

    expect(result[0].hipY).toBe(3);
    expect(result[0].kneeY).toBeNull();
    expect(result[0].ankleY).toBeNull();
  });

  it("時刻差が0以下なら速度を計測不能にする", () => {
    const result = smoothPoseFrames([
      { timestamp: 1000, leftHip: { x: 0, y: 1 } },
      { timestamp: 1000, leftHip: { x: 0, y: 2 } },
    ]);

    expect(result[0].hipVelocity).toBeNull();
    expect(result[1].hipVelocity).toBeNull();
  });
});

describe("trackingQuality: ジャンプ区間検出", () => {
  it("離地と着地を検出し、フレーム時刻差を滞空時間にする", () => {
    const result = detectJumpEvent(jumpFrames());

    expect(result).toEqual({
      takeoffIndex: 15,
      landingIndex: 18,
      flightTimeMs: 300,
      flightTimeSec: 0.3,
    });
  });

  it.each([
    ["腰の上昇量", { hipY: 0.985 }],
    ["足首の上昇量", { ankleY: 0.99 }],
    ["腰の上向き速度", { hipVelocity: -0.15 }],
  ])("離地判定の%sがしきい値と等しい場合は離地にしない", (_, overrides) => {
    expect(detectJumpEvent(jumpFrames(overrides))).toBeNull();
  });

  it("着地判定は足首位置と腰速度がしきい値と等しい場合を含む", () => {
    const result = detectJumpEvent(jumpFrames());

    expect(result?.landingIndex).toBe(18);
  });

  it("10フレーム未満、基準座標なし、着地なしは計測不能", () => {
    expect(detectJumpEvent(jumpFrames().slice(0, 9))).toBeNull();

    const noBaseline = jumpFrames().map((frame) => ({
      ...frame,
      hipY: null,
    }));
    expect(detectJumpEvent(noBaseline)).toBeNull();

    const noLanding = jumpFrames().map((frame, index) =>
      index >= 16
        ? { ...frame, ankleY: 0.9, hipVelocity: -0.1 }
        : frame
    );
    expect(detectJumpEvent(noLanding)).toBeNull();
  });
});

describe("trackingQuality: 滞空時間法", () => {
  it("重力加速度9.80665の既存式でジャンプ高をcm換算する", () => {
    expect(estimateJumpHeightFromFlightTime(0.5)).toBeCloseTo(
      (9.80665 * 0.5 * 0.5 * 100) / 8
    );
  });

  it("ジャンプ区間がない入力は解析失敗として返す", () => {
    expect(analyzeJumpFromPoseFrames([])).toEqual({
      success: false,
      smoothedFrames: [],
      jumpEvent: null,
      jumpHeightCm: null,
    });
  });
});
