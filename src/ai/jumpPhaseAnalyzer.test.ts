import { describe, expect, it } from "vitest";
import type { TrackedFrame } from "./poseTypes";
import { analyzeJumpPhases } from "./jumpPhaseAnalyzer";

function frame(index: number, centerY: number): TrackedFrame {
  return {
    frameIndex: index,
    time: index * 0.1,
    landmarks: [],
    crop: { x: 0, y: 0, width: 0, height: 0 },
    centerX: 0,
    centerY,
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

describe("analyzeJumpPhases", () => {
  it("8フレーム未満はnull", () => {
    const frames = Array.from({ length: 7 }, (_, i) => frame(i, 100 - i));

    expect(analyzeJumpPhases(frames)).toBeNull();
  });

  it("8フレームちょうどは解析を開始する", () => {
    const frames = Array.from({ length: 8 }, (_, i) => frame(i, 100));

    expect(analyzeJumpPhases(frames)).not.toBeNull();
  });

  it("centerYが最小のフレームをpeakIndexにする", () => {
    const centerYs = [100, 90, 80, 50, 70, 85, 95, 100];
    const frames = centerYs.map((y, i) => frame(i, y));

    const result = analyzeJumpPhases(frames);

    expect(result?.peakIndex).toBe(3);
  });

  it("centerYが同点の場合は先に現れたフレームを維持する", () => {
    const centerYs = [100, 90, 50, 90, 50, 100, 100, 100];
    const frames = centerYs.map((y, i) => frame(i, y));

    const result = analyzeJumpPhases(frames);

    expect(result?.peakIndex).toBe(2);
  });

  it("25%・15%をMath.roundして空中・踏切・助走の境界を計算する", () => {
    // frames.length=10 → 10*0.25=2.5→3(空中の半幅), 10*0.15=1.5→2(踏切の遡り幅)
    const centerYs = [100, 100, 100, 100, 100, 10, 100, 100, 100, 100];
    const frames = centerYs.map((y, i) => frame(i, y));

    const result = analyzeJumpPhases(frames);

    expect(result?.peakIndex).toBe(5);

    const approach = result?.phases.find((p) => p.name === "助走");
    const takeoff = result?.phases.find((p) => p.name === "踏切");
    const air = result?.phases.find((p) => p.name === "空中");
    const landing = result?.phases.find((p) => p.name === "着地");

    // takeoffIndex = 5 - round(2.5) = 5 - 3 = 2, landingIndex = 5 + 3 = 8
    expect(air?.startIndex).toBe(2);
    expect(air?.endIndex).toBe(8);
    // takeoffStart = 2 - round(1.5) = 2 - 2 = 0
    expect(takeoff?.startIndex).toBe(0);
    expect(takeoff?.endIndex).toBe(2);
    expect(approach?.startIndex).toBe(0);
    expect(approach?.endIndex).toBe(0);
    expect(landing?.startIndex).toBe(8);
    expect(landing?.endIndex).toBe(9);
  });

  it("peakが先頭付近にある場合は開始側のインデックスを0にクランプする", () => {
    const centerYs = [10, 100, 100, 100, 100, 100, 100, 100];
    const frames = centerYs.map((y, i) => frame(i, y));

    const result = analyzeJumpPhases(frames);

    expect(result?.peakIndex).toBe(0);
    for (const phase of result?.phases ?? []) {
      expect(phase.startIndex).toBeGreaterThanOrEqual(0);
      expect(phase.endIndex).toBeLessThanOrEqual(frames.length - 1);
      expect(phase.startIndex).toBeLessThanOrEqual(phase.endIndex);
    }

    const approach = result?.phases.find((p) => p.name === "助走");
    expect(approach?.startIndex).toBe(0);
    expect(approach?.endIndex).toBe(0);
  });

  it("peakが末尾付近にある場合は終了側のインデックスを末尾にクランプする", () => {
    const centerYs = [100, 100, 100, 100, 100, 100, 100, 10];
    const frames = centerYs.map((y, i) => frame(i, y));

    const result = analyzeJumpPhases(frames);

    expect(result?.peakIndex).toBe(7);
    for (const phase of result?.phases ?? []) {
      expect(phase.startIndex).toBeGreaterThanOrEqual(0);
      expect(phase.endIndex).toBeLessThanOrEqual(frames.length - 1);
      expect(phase.startIndex).toBeLessThanOrEqual(phase.endIndex);
    }

    const landing = result?.phases.find((p) => p.name === "着地");
    expect(landing?.startIndex).toBe(7);
    expect(landing?.endIndex).toBe(7);
  });

  it("4フェーズの名前と開始・終了時刻を返す", () => {
    const centerYs = [100, 100, 100, 100, 100, 10, 100, 100, 100, 100];
    const frames = centerYs.map((y, i) => frame(i, y));

    const result = analyzeJumpPhases(frames);

    expect(result?.phases.map((p) => p.name)).toEqual([
      "助走",
      "踏切",
      "空中",
      "着地",
    ]);

    for (const phase of result?.phases ?? []) {
      expect(phase.startTime).toBe(frames[phase.startIndex].time);
      expect(phase.endTime).toBe(frames[phase.endIndex].time);
    }
  });

  it("隣接フェーズの境界indexは共有される(包含的。jumpPhaseEngineの排他的分割とは異なる)", () => {
    const centerYs = [100, 100, 100, 100, 100, 10, 100, 100, 100, 100];
    const frames = centerYs.map((y, i) => frame(i, y));

    const result = analyzeJumpPhases(frames);
    const [approach, takeoff, air, landing] = result?.phases ?? [];

    expect(approach.endIndex).toBe(takeoff.startIndex);
    expect(takeoff.endIndex).toBe(air.startIndex);
    expect(air.endIndex).toBe(landing.startIndex);
  });

  it("peakFrameは選択したpeakIndexの元フレーム参照と一致する", () => {
    const centerYs = [100, 90, 50, 90, 100, 100, 100, 100];
    const frames = centerYs.map((y, i) => frame(i, y));

    const result = analyzeJumpPhases(frames);

    expect(result).not.toBeNull();
    expect(result?.peakFrame).toBe(frames[result!.peakIndex]);
  });
});
