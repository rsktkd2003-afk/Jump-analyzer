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
});
