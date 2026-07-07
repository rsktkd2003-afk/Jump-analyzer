import type { TrackedFrame, TrackedLandmark } from "../ai/poseAnalyzer";

export type SeriesPoint = {
  frameIndex: number;
  time: number;
  value: number;
};

export type SeriesStats = {
  min: SeriesPoint;
  max: SeriesPoint;
  range: number;
  maxSlope: number;
  peakTime: number;
};

const LEFT_SHOULDER = 11;
const RIGHT_SHOULDER = 12;
const LEFT_HIP = 23;
const RIGHT_HIP = 24;

function isNumber(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function average(values: number[]): number | null {
  const valid = values.filter(isNumber);
  if (valid.length === 0) return null;
  return valid.reduce((sum, value) => sum + value, 0) / valid.length;
}

export function toSeries(
  frames: TrackedFrame[],
  selector: (frame: TrackedFrame) => number | null | undefined
): SeriesPoint[] {
  return frames
    .map((frame) => {
      const value = selector(frame);
      if (!isNumber(value)) return null;

      return {
        frameIndex: frame.frameIndex,
        time: frame.time,
        value,
      };
    })
    .filter((point): point is SeriesPoint => point !== null);
}

export function getSeriesStats(points: SeriesPoint[]): SeriesStats | null {
  if (points.length === 0) return null;

  let min = points[0];
  let max = points[0];
  let maxSlope = 0;

  for (let i = 0; i < points.length; i += 1) {
    const point = points[i];

    if (point.value < min.value) min = point;
    if (point.value > max.value) max = point;

    if (i > 0) {
      const previous = points[i - 1];
      const dt = point.time - previous.time;

      if (dt > 0) {
        const slope = Math.abs((point.value - previous.value) / dt);
        if (slope > maxSlope) maxSlope = slope;
      }
    }
  }

  return {
    min,
    max,
    range: max.value - min.value,
    maxSlope,
    peakTime: min.time,
  };
}

export function findFrameAtOrNearestTime(
  frames: TrackedFrame[],
  time: number
): TrackedFrame | null {
  if (frames.length === 0) return null;

  let nearest = frames[0];
  let minDiff = Math.abs(nearest.time - time);

  for (const frame of frames) {
    const diff = Math.abs(frame.time - time);

    if (diff < minDiff) {
      nearest = frame;
      minDiff = diff;
    }
  }

  return nearest;
}

export function getFramesInSegment(
  frames: TrackedFrame[],
  segment: { startTime: number; endTime: number }
): TrackedFrame[] {
  return frames.filter(
    (frame) => frame.time >= segment.startTime && frame.time <= segment.endTime
  );
}

export function getSegmentFrames(
  frames: TrackedFrame[],
  startIndex: number,
  endIndex: number
): TrackedFrame[] {
  return frames.slice(Math.max(0, startIndex), Math.max(0, endIndex) + 1);
}

export function makeSegment(
  phase: import("./types").Phase,
  frames: TrackedFrame[],
  startIndex: number,
  endIndex: number
) {
  const safeStart = Math.max(0, Math.min(startIndex, frames.length - 1));
  const safeEnd = Math.max(safeStart, Math.min(endIndex, frames.length - 1));
  const start = frames[safeStart];
  const end = frames[safeEnd];

  return {
    phase,
    startTime: start.time,
    endTime: end.time,
    startFrame: start.frameIndex,
    endFrame: end.frameIndex,
  };
}

export function calculateVisibilityConfidence(
  frames: TrackedFrame[],
  landmarkIndexes?: number[]
): number {
  if (frames.length === 0) return 0;

  const values: number[] = [];

  for (const frame of frames) {
    const landmarks = landmarkIndexes
      ? landmarkIndexes
          .map((index) => frame.landmarks[index])
          .filter((point): point is TrackedLandmark => Boolean(point))
      : frame.landmarks;

    for (const landmark of landmarks) {
      values.push(landmark.visibility ?? 1);
    }
  }

  const result = average(values);
  return result === null ? 0 : clamp01(result);
}

export function getBodyScale(frame: TrackedFrame): number | null {
  const leftShoulder = frame.landmarks[LEFT_SHOULDER];
  const rightShoulder = frame.landmarks[RIGHT_SHOULDER];
  const leftHip = frame.landmarks[LEFT_HIP];
  const rightHip = frame.landmarks[RIGHT_HIP];

  if (!leftShoulder || !rightShoulder || !leftHip || !rightHip) return null;

  const shoulderX = (leftShoulder.x + rightShoulder.x) / 2;
  const shoulderY = (leftShoulder.y + rightShoulder.y) / 2;
  const hipX = (leftHip.x + rightHip.x) / 2;
  const hipY = (leftHip.y + rightHip.y) / 2;

  const dx = shoulderX - hipX;
  const dy = shoulderY - hipY;
  const distance = Math.sqrt(dx * dx + dy * dy);

  return distance > 0 ? distance : null;
}

export function normalizeByBody(frames: TrackedFrame[], distancePx: number): number {
  const scales = frames
    .map(getBodyScale)
    .filter((value): value is number => isNumber(value) && value > 0);

  const scale = average(scales);

  if (scale === null || scale <= 0) {
    return distancePx;
  }

  return distancePx / scale;
}

export function findIndexByFrameIndex(
  frames: TrackedFrame[],
  frameIndex: number
): number {
  return frames.findIndex((frame) => frame.frameIndex === frameIndex);
}