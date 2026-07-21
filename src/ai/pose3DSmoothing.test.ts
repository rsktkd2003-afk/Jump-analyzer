import { describe, expect, it } from "vitest";

import { smoothPose3DSequence } from "./pose3DSmoothing";
import type { PoseWorldLandmark } from "./poseTypes";

function frame(x: number): PoseWorldLandmark[] {
  return Array.from({ length: 33 }, () => ({ x, y: 0, z: 0, visibility: 1 }));
}

describe("smoothPose3DSequence", () => {
  it("フレーム数0の場合は空配列を返す", () => {
    const result = smoothPose3DSequence([], []);
    expect(result.landmarksByFrame).toEqual([]);
    expect(result.interpolatedFrameIndexes.size).toBe(0);
  });

  it("全フレーム有効な場合はすべて出力され、補間フレームは0件", () => {
    const frames = [frame(0), frame(0.01), frame(0.02), frame(0.03)];
    const times = [0, 0.1, 0.2, 0.3];
    const result = smoothPose3DSequence(frames, times);

    expect(result.landmarksByFrame).toHaveLength(4);
    expect(result.landmarksByFrame.every((f) => f !== undefined)).toBe(true);
    expect(result.interpolatedFrameIndexes.size).toBe(0);
  });

  it("3フレーム以下の短い欠損は補間で埋められる", () => {
    // 欠損区間は2フレーム（index1,2）で、MAX_INTERPOLATION_GAP_FRAMES(3)以下
    const frames = [frame(0), undefined, undefined, frame(0.3)];
    const times = [0, 0.1, 0.2, 0.3];
    const result = smoothPose3DSequence(frames, times);

    expect(result.interpolatedFrameIndexes).toEqual(new Set([1, 2]));
    expect(result.landmarksByFrame[1]).toBeDefined();
    expect(result.landmarksByFrame[2]).toBeDefined();
    // 補間値は前後の間の値になっているはず
    expect(result.landmarksByFrame[1]?.[0].x).toBeGreaterThan(0);
    expect(result.landmarksByFrame[1]?.[0].x).toBeLessThan(0.3);
  });

  it("4フレームを超える長い欠損は補間されずundefinedのまま残る", () => {
    // 欠損区間は4フレーム（index1〜4）で、MAX_INTERPOLATION_GAP_FRAMES(3)を超える
    const frames = [frame(0), undefined, undefined, undefined, undefined, frame(0.5)];
    const times = [0, 0.1, 0.2, 0.3, 0.4, 0.5];
    const result = smoothPose3DSequence(frames, times);

    expect(result.interpolatedFrameIndexes.size).toBe(0);
    expect(result.landmarksByFrame[1]).toBeUndefined();
    expect(result.landmarksByFrame[2]).toBeUndefined();
    expect(result.landmarksByFrame[3]).toBeUndefined();
    expect(result.landmarksByFrame[4]).toBeUndefined();
    expect(result.landmarksByFrame[0]).toBeDefined();
    expect(result.landmarksByFrame[5]).toBeDefined();
  });

  it("先頭・末尾の欠損は前後どちらか一方にしか有効フレームがないため補間されない", () => {
    const frames = [undefined, frame(0.1), frame(0.2), undefined];
    const times = [0, 0.1, 0.2, 0.3];
    const result = smoothPose3DSequence(frames, times);

    expect(result.interpolatedFrameIndexes.size).toBe(0);
    expect(result.landmarksByFrame[0]).toBeUndefined();
    expect(result.landmarksByFrame[3]).toBeUndefined();
    expect(result.landmarksByFrame[1]).toBeDefined();
    expect(result.landmarksByFrame[2]).toBeDefined();
  });

  it("急激な単一フレームのノイズを平滑化で低減する", () => {
    const frames = [frame(0), frame(0), frame(1), frame(0), frame(0)];
    const times = [0, 0.1, 0.2, 0.3, 0.4];
    const result = smoothPose3DSequence(frames, times);

    // 平滑化により、突出した1フレーム目の値は生の1より小さくなる
    const spikeX = result.landmarksByFrame[2]?.[0].x ?? 0;
    expect(spikeX).toBeLessThan(1);
    expect(spikeX).toBeGreaterThan(0);
  });

  it("全フレームが常に静止している場合、平滑化後もほぼ元の値を維持する", () => {
    const frames = [frame(0.5), frame(0.5), frame(0.5), frame(0.5)];
    const times = [0, 0.1, 0.2, 0.3];
    const result = smoothPose3DSequence(frames, times);

    for (const f of result.landmarksByFrame) {
      expect(f?.[0].x).toBeCloseTo(0.5, 6);
    }
  });
});
