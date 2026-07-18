import { beforeEach, describe, expect, it, vi } from "vitest";
import type { JumpEvents } from "./groundContact";
import { detectJumpEvents } from "./groundContact";
import {
  findEnginePhase,
  getImpactWindowFrames,
  runJumpPhaseEngine,
} from "./jumpPhaseEngine";
import type { TrackedFrame } from "./poseTypes";

vi.mock("./groundContact", () => ({
  detectJumpEvents: vi.fn(),
}));

const mockedDetectJumpEvents = vi.mocked(detectJumpEvents);

function createFrames(count: number): TrackedFrame[] {
  return Array.from({ length: count }, (_, frameIndex) => {
    const landmarks = Array.from({ length: 33 }, () => ({
      x: 100,
      y: 200,
      visibility: 1,
    }));
    landmarks[15] = { x: 90, y: frameIndex === 7 ? 80 : 120, visibility: 1 };
    landmarks[16] = { x: 110, y: frameIndex === 7 ? 75 : 125, visibility: 1 };

    return {
      frameIndex,
      time: frameIndex * 0.2,
      landmarks,
      crop: { x: 0, y: 0, width: 200, height: 400 },
      centerX: 100,
      centerY: 200,
      leftKneeAngle: 150,
      rightKneeAngle: 150,
      hipAngle: 150,
      shoulderTilt: 0,
      leftHipAngle: 150,
      rightHipAngle: 150,
      leftElbowAngle: 150,
      rightElbowAngle: 150,
      leftShoulderAngle: 90,
      rightShoulderAngle: 90,
    };
  });
}

/** 手首(15/16)のvisibilityを指定フレームだけ変えられるフレーム列 */
function createFramesWithWristVisibility(
  count: number,
  peakVisibility: number
): TrackedFrame[] {
  return Array.from({ length: count }, (_, frameIndex) => {
    const landmarks = Array.from({ length: 33 }, () => ({
      x: 100,
      y: 200,
      visibility: 1,
    }));
    const isPeakFrame = frameIndex === 7;
    landmarks[15] = {
      x: 90,
      y: isPeakFrame ? 80 : 120,
      visibility: isPeakFrame ? peakVisibility : 1,
    };
    landmarks[16] = {
      x: 110,
      y: isPeakFrame ? 75 : 125,
      visibility: isPeakFrame ? peakVisibility : 1,
    };

    return {
      frameIndex,
      time: frameIndex * 0.2,
      landmarks,
      crop: { x: 0, y: 0, width: 200, height: 400 },
      centerX: 100,
      centerY: 200,
      leftKneeAngle: 150,
      rightKneeAngle: 150,
      hipAngle: 150,
      shoulderTilt: 0,
      leftHipAngle: 150,
      rightHipAngle: 150,
      leftElbowAngle: 150,
      rightElbowAngle: 150,
      leftShoulderAngle: 90,
      rightShoulderAngle: 90,
    };
  });
}

/** 手首Yを一律にし、指定インデックスだけ最も高い(y最小)タイの候補にする */
function createFramesWithTiedWristPeaks(
  count: number,
  tiedIndexes: number[]
): TrackedFrame[] {
  return Array.from({ length: count }, (_, frameIndex) => {
    const landmarks = Array.from({ length: 33 }, () => ({
      x: 100,
      y: 200,
      visibility: 1,
    }));
    const isPeakCandidate = tiedIndexes.includes(frameIndex);
    landmarks[15] = { x: 90, y: isPeakCandidate ? 50 : 120, visibility: 1 };
    landmarks[16] = { x: 110, y: isPeakCandidate ? 50 : 125, visibility: 1 };

    return {
      frameIndex,
      time: frameIndex * 0.1,
      landmarks,
      crop: { x: 0, y: 0, width: 200, height: 400 },
      centerX: 100,
      centerY: 200,
      leftKneeAngle: 150,
      rightKneeAngle: 150,
      hipAngle: 150,
      shoulderTilt: 0,
      leftHipAngle: 150,
      rightHipAngle: 150,
      leftElbowAngle: 150,
      rightElbowAngle: 150,
      leftShoulderAngle: 90,
      rightShoulderAngle: 90,
    };
  });
}

/** 手首Yを一律にし、任意の時刻を指定できるフレーム列（contact境界のテスト用） */
function createTimedFrames(times: number[]): TrackedFrame[] {
  return times.map((time, frameIndex) => {
    const landmarks = Array.from({ length: 33 }, () => ({
      x: 100,
      y: 200,
      visibility: 1,
    }));

    return {
      frameIndex,
      time,
      landmarks,
      crop: { x: 0, y: 0, width: 200, height: 400 },
      centerX: 100,
      centerY: 200,
      leftKneeAngle: 150,
      rightKneeAngle: 150,
      hipAngle: 150,
      shoulderTilt: 0,
      leftHipAngle: 150,
      rightHipAngle: 150,
      leftElbowAngle: 150,
      rightElbowAngle: 150,
      leftShoulderAngle: 90,
      rightShoulderAngle: 90,
    };
  });
}

function createEvents(frameCount: number): JumpEvents {
  return {
    valid: true,
    baselineComY: 200,
    groundY: 300,
    sinkStartIndex: 2,
    sinkBottomIndex: 3,
    takeoffIndex: 4,
    peakIndex: 6,
    landingIndex: 10,
    landingEndIndex: 11,
    airTimeSec: 1.2,
    risePx: 80,
    sinkPx: 10,
    torsoPx: 100,
    grounded: Array.from({ length: frameCount }, (_, index) =>
      index <= 4 || index >= 10
    ),
    comY: Array(frameCount).fill(200),
    comVelocity: Array(frameCount).fill(0),
    comAcceleration: Array(frameCount).fill(0),
    comX: Array(frameCount).fill(100),
    footY: Array(frameCount).fill(300),
    footVelocity: Array(frameCount).fill(0),
    interpolatedRatio: 0,
    lowConfidenceFrames: new Set<number>(),
  };
}

describe("runJumpPhaseEngine", () => {
  beforeEach(() => {
    mockedDetectJumpEvents.mockReset();
  });

  it("全フレームを重複なく連続したフェーズへ分割する", () => {
    const frames = createFrames(14);
    mockedDetectJumpEvents.mockReturnValue(createEvents(frames.length));

    const result = runJumpPhaseEngine(frames);

    expect(result).not.toBeNull();
    expect(result?.phases.map((phase) => phase.name)).toEqual([
      "approach",
      "takeoff",
      "ascent",
      "peak",
      "contact",
      "descent",
      "landing",
      "finish",
    ]);

    const coveredIndexes = result?.phases.flatMap((phase) =>
      Array.from(
        { length: phase.endIndex - phase.startIndex + 1 },
        (_, offset) => phase.startIndex + offset
      )
    );
    expect(coveredIndexes).toEqual(
      Array.from({ length: frames.length }, (_, index) => index)
    );

    for (let index = 1; index < (result?.phases.length ?? 0); index += 1) {
      expect(result?.phases[index].startIndex).toBe(
        (result?.phases[index - 1].endIndex ?? -1) + 1
      );
    }
  });

  it("打点前後の窓を離地以降かつcontact終了までに限定する", () => {
    const frames = createFrames(14);
    mockedDetectJumpEvents.mockReturnValue(createEvents(frames.length));
    const result = runJumpPhaseEngine(frames);

    expect(result).not.toBeNull();
    if (!result) return;

    expect(getImpactWindowFrames(frames, result).map((frame) => frame.frameIndex)).toEqual([
      4,
      5,
      6,
      7,
      8,
    ]);
    expect(findEnginePhase(result, "peak")?.startIndex).toBe(6);
  });

  it("ジャンプイベントが無効な場合はフェーズを作らない", () => {
    const frames = createFrames(14);
    mockedDetectJumpEvents.mockReturnValue({
      ...createEvents(frames.length),
      valid: false,
    });

    expect(runJumpPhaseEngine(frames)).toBeNull();
  });

  it("detectJumpEventsがnullを返す場合もフェーズを作らない", () => {
    const frames = createFrames(14);
    mockedDetectJumpEvents.mockReturnValue(null);

    expect(runJumpPhaseEngine(frames)).toBeNull();
  });

  it("空になるフェーズ(approach)は安全にスキップされ、残りは連続性を保つ", () => {
    const frames = createFrames(14);
    mockedDetectJumpEvents.mockReturnValue({
      ...createEvents(frames.length),
      sinkStartIndex: 0,
    });

    const result = runJumpPhaseEngine(frames);

    expect(result).not.toBeNull();
    expect(result?.phases.map((phase) => phase.name)).not.toContain(
      "approach"
    );

    const coveredIndexes = result?.phases.flatMap((phase) =>
      Array.from(
        { length: phase.endIndex - phase.startIndex + 1 },
        (_, offset) => phase.startIndex + offset
      )
    );
    expect(coveredIndexes).toEqual(
      Array.from({ length: frames.length }, (_, index) => index)
    );

    for (let index = 1; index < (result?.phases.length ?? 0); index += 1) {
      expect(result?.phases[index].startIndex).toBe(
        (result?.phases[index - 1].endIndex ?? -1) + 1
      );
    }
  });

  it("findEnginePhase: 存在するフェーズは返し、除外されたフェーズはnullを返す", () => {
    const frames = createFrames(14);
    mockedDetectJumpEvents.mockReturnValue({
      ...createEvents(frames.length),
      sinkStartIndex: 0,
    });

    const result = runJumpPhaseEngine(frames);

    expect(result).not.toBeNull();
    if (!result) return;

    expect(findEnginePhase(result, "takeoff")).not.toBeNull();
    expect(findEnginePhase(result, "approach")).toBeNull();
  });

  it("手首visibility 0.5は打点候補として採用する", () => {
    const frames = createFramesWithWristVisibility(14, 0.5);
    mockedDetectJumpEvents.mockReturnValue(createEvents(frames.length));

    const result = runJumpPhaseEngine(frames);

    expect(result).not.toBeNull();
    if (!result) return;

    expect(
      getImpactWindowFrames(frames, result).map((frame) => frame.frameIndex)
    ).toEqual([4, 5, 6, 7, 8]);
  });

  it("手首visibility 0.49は打点候補から除外する", () => {
    const frames = createFramesWithWristVisibility(14, 0.49);
    mockedDetectJumpEvents.mockReturnValue(createEvents(frames.length));

    const result = runJumpPhaseEngine(frames);

    expect(result).not.toBeNull();
    if (!result) return;

    expect(
      getImpactWindowFrames(frames, result).map((frame) => frame.frameIndex)
    ).toEqual([4, 5, 6, 7]);
  });

  it("手首の最高点が同点の場合は先に見つかったフレームを維持する", () => {
    const frames = createFramesWithTiedWristPeaks(12, [4, 6]);
    mockedDetectJumpEvents.mockReturnValue({
      ...createEvents(frames.length),
      sinkStartIndex: 0,
      takeoffIndex: 0,
      peakIndex: 2,
      landingIndex: 9,
      landingEndIndex: 10,
    });

    const result = runJumpPhaseEngine(frames);

    expect(result).not.toBeNull();
    if (!result) return;

    // 先に見つかったindex4を採用するため、contact終了はmin(4+1,landingIndex-1)=5になる
    expect(findEnginePhase(result, "contact")?.endIndex).toBe(5);
  });

  it("contact区間は打点+0.12秒ちょうどまで延長する（等号側は含む）", () => {
    const times = [0, 0.1, 0.5, 0.55, 0.62, 0.9, 1.0, 1.1];
    const frames = createTimedFrames(times);
    mockedDetectJumpEvents.mockReturnValue({
      ...createEvents(frames.length),
      sinkStartIndex: 1,
      takeoffIndex: 1,
      peakIndex: 2,
      landingIndex: 6,
      landingEndIndex: 7,
    });

    const result = runJumpPhaseEngine(frames);

    expect(result).not.toBeNull();
    if (!result) return;

    expect(findEnginePhase(result, "contact")?.endIndex).toBe(4);
  });

  it("contact区間は打点+0.12秒を超えたフレームは含めない", () => {
    const times = [0, 0.1, 0.5, 0.55, 0.621, 0.9, 1.0, 1.1];
    const frames = createTimedFrames(times);
    mockedDetectJumpEvents.mockReturnValue({
      ...createEvents(frames.length),
      sinkStartIndex: 1,
      takeoffIndex: 1,
      peakIndex: 2,
      landingIndex: 6,
      landingEndIndex: 7,
    });

    const result = runJumpPhaseEngine(frames);

    expect(result).not.toBeNull();
    if (!result) return;

    expect(findEnginePhase(result, "contact")?.endIndex).toBe(3);
  });

  it("landingがpeak直後にある場合、contactは空になり安全にスキップされる", () => {
    const times = [0, 0.1, 0.5, 0.6, 0.7, 0.8];
    const frames = createTimedFrames(times);
    mockedDetectJumpEvents.mockReturnValue({
      ...createEvents(frames.length),
      sinkStartIndex: 0,
      takeoffIndex: 0,
      peakIndex: 2,
      landingIndex: 3,
      landingEndIndex: 4,
    });

    const result = runJumpPhaseEngine(frames);

    expect(result).not.toBeNull();
    expect(result?.phases.map((phase) => phase.name)).not.toContain(
      "contact"
    );
    expect(findEnginePhase(result!, "peak")).not.toBeNull();

    const coveredIndexes = result?.phases.flatMap((phase) =>
      Array.from(
        { length: phase.endIndex - phase.startIndex + 1 },
        (_, offset) => phase.startIndex + offset
      )
    );
    expect(coveredIndexes).toEqual(
      Array.from({ length: frames.length }, (_, index) => index)
    );

    for (let index = 1; index < (result?.phases.length ?? 0); index += 1) {
      expect(result?.phases[index].startIndex).toBe(
        (result?.phases[index - 1].endIndex ?? -1) + 1
      );
    }
  });

  it("getImpactWindowFrames: contactフェーズが存在しない場合はpeak終了までを返す", () => {
    const times = [0, 0.1, 0.5, 0.6, 0.7, 0.8];
    const frames = createTimedFrames(times);
    mockedDetectJumpEvents.mockReturnValue({
      ...createEvents(frames.length),
      sinkStartIndex: 0,
      takeoffIndex: 0,
      peakIndex: 2,
      landingIndex: 3,
      landingEndIndex: 4,
    });

    const result = runJumpPhaseEngine(frames);

    expect(result).not.toBeNull();
    if (!result) return;

    expect(findEnginePhase(result, "contact")).toBeNull();
    expect(
      getImpactWindowFrames(frames, result).map((frame) => frame.frameIndex)
    ).toEqual([0, 1, 2]);
  });

  it("getImpactWindowFrames: peakフェーズが存在しない場合は空配列", () => {
    const frames = createFrames(14);
    mockedDetectJumpEvents.mockReturnValue({
      ...createEvents(frames.length),
      sinkStartIndex: 0,
      takeoffIndex: 2,
      peakIndex: 2,
    });

    const result = runJumpPhaseEngine(frames);

    expect(result).not.toBeNull();
    if (!result) return;

    expect(findEnginePhase(result, "peak")).toBeNull();
    expect(getImpactWindowFrames(frames, result)).toEqual([]);
  });
});
