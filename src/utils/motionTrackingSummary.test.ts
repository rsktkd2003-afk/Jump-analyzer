import { describe, expect, it, vi } from "vitest";

import type { TrackedFrame } from "../ai/trackingAnalyzer";
import { analyzeJumpFromPoseFrames } from "./trackingQuality";
import {
  createImprovedTrackingMessage,
  findNearestTrackedFrame,
  toPoseFrames,
} from "./motionTrackingSummary";

vi.mock("./trackingQuality", () => ({
  analyzeJumpFromPoseFrames: vi.fn(),
}));

const mockedAnalyzeJumpFromPoseFrames = vi.mocked(analyzeJumpFromPoseFrames);

function frame(overrides: Partial<TrackedFrame> = {}): TrackedFrame {
  return {
    frameIndex: 0,
    time: 0,
    landmarks: [],
    crop: { x: 0, y: 0, width: 0, height: 0 },
    centerX: 0,
    centerY: 0,
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
    ...overrides,
  };
}

describe("motionTrackingSummary: 現在時刻に最も近いフレームの選択", () => {
  it("最も時刻が近いフレームを返す", () => {
    const frames = [frame({ time: 0 }), frame({ time: 1 }), frame({ time: 2 })];

    expect(findNearestTrackedFrame(frames, 0.9)).toBe(frames[1]);
  });

  it("同距離の場合は先に現れたフレームを維持する", () => {
    const frames = [frame({ time: 0 }), frame({ time: 2 })];

    expect(findNearestTrackedFrame(frames, 1)).toBe(frames[0]);
  });

  it("フレームがなければnull", () => {
    expect(findNearestTrackedFrame([], 0)).toBeNull();
  });
});

describe("motionTrackingSummary: PoseFrame変換", () => {
  it("MediaPipeの腰・膝・足首インデックス(23-28)をPoseFrameへ写す", () => {
    const landmarks = Array.from({ length: 33 }, (_, index) => ({
      x: index,
      y: index * 2,
    }));
    const frames = [frame({ time: 1.5, landmarks })];

    const poseFrames = toPoseFrames(frames);

    expect(poseFrames).toEqual([
      {
        timestamp: 1500,
        leftHip: { x: 23, y: 46 },
        rightHip: { x: 24, y: 48 },
        leftKnee: { x: 25, y: 50 },
        rightKnee: { x: 26, y: 52 },
        leftAnkle: { x: 27, y: 54 },
        rightAnkle: { x: 28, y: 56 },
      },
    ]);
  });

  it("frameIndexが0のtimestampは0になる", () => {
    const frames = [frame({ time: 0, landmarks: [] })];

    expect(toPoseFrames(frames)[0].timestamp).toBe(0);
  });
});

describe("motionTrackingSummary: 精度改善メッセージ", () => {
  it("ジャンプ区間を検出できた場合は滞空時間とジャンプ高を付加する", () => {
    mockedAnalyzeJumpFromPoseFrames.mockReturnValue({
      success: true,
      smoothedFrames: [],
      jumpEvent: {
        takeoffIndex: 5,
        landingIndex: 10,
        flightTimeMs: 450,
        flightTimeSec: 0.45,
      },
      jumpHeightCm: 24.8,
    });

    const message = createImprovedTrackingMessage("元のメッセージ", []);

    expect(message).toBe(
      "元のメッセージ\n精度改善解析：滞空時間 0.450秒\n推定ジャンプ高 24.8cm"
    );
  });

  it("ジャンプ高を計算できない場合は専用テキストにする", () => {
    mockedAnalyzeJumpFromPoseFrames.mockReturnValue({
      success: true,
      smoothedFrames: [],
      jumpEvent: {
        takeoffIndex: 5,
        landingIndex: 10,
        flightTimeMs: 450,
        flightTimeSec: 0.45,
      },
      jumpHeightCm: null,
    });

    const message = createImprovedTrackingMessage("元のメッセージ", []);

    expect(message).toBe(
      "元のメッセージ\n精度改善解析：滞空時間 0.450秒\n推定ジャンプ高を計算できませんでした。"
    );
  });

  it("ジャンプ区間を検出できない場合は専用メッセージを付加する", () => {
    mockedAnalyzeJumpFromPoseFrames.mockReturnValue({
      success: false,
      smoothedFrames: [],
      jumpEvent: null,
      jumpHeightCm: null,
    });

    const message = createImprovedTrackingMessage("元のメッセージ", []);

    expect(message).toBe(
      "元のメッセージ\n精度改善解析：ジャンプ区間を特定できませんでした。"
    );
  });
});
