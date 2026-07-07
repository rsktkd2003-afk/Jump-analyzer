import type { TrackedFrame } from "./trackingAnalyzer";

export type JumpPhase = {
  name: "助走" | "踏切" | "空中" | "着地";
  startIndex: number;
  endIndex: number;
  startTime: number;
  endTime: number;
};

export type JumpPhaseResult = {
  phases: JumpPhase[];
  peakIndex: number;
  peakFrame: TrackedFrame;
};

export function analyzeJumpPhases(frames: TrackedFrame[]): JumpPhaseResult | null {
  if (frames.length < 8) return null;

  let peakIndex = 0;
  let minY = frames[0].centerY;

  frames.forEach((frame, index) => {
    if (frame.centerY < minY) {
      minY = frame.centerY;
      peakIndex = index;
    }
  });

  const takeoffIndex = Math.max(0, peakIndex - Math.round(frames.length * 0.25));
  const landingIndex = Math.min(frames.length - 1, peakIndex + Math.round(frames.length * 0.25));

  const approachStart = 0;
  const takeoffStart = Math.max(0, takeoffIndex - Math.round(frames.length * 0.15));
  const airStart = takeoffIndex;
  const landingStart = landingIndex;

  const phases: JumpPhase[] = [
    createPhase("助走", frames, approachStart, Math.max(takeoffStart, approachStart)),
    createPhase("踏切", frames, takeoffStart, airStart),
    createPhase("空中", frames, airStart, landingStart),
    createPhase("着地", frames, landingStart, frames.length - 1),
  ];

  return {
    phases,
    peakIndex,
    peakFrame: frames[peakIndex],
  };
}

function createPhase(
  name: JumpPhase["name"],
  frames: TrackedFrame[],
  startIndex: number,
  endIndex: number
): JumpPhase {
  const safeStart = Math.max(0, Math.min(startIndex, frames.length - 1));
  const safeEnd = Math.max(safeStart, Math.min(endIndex, frames.length - 1));

  return {
    name,
    startIndex: safeStart,
    endIndex: safeEnd,
    startTime: frames[safeStart].time,
    endTime: frames[safeEnd].time,
  };
}