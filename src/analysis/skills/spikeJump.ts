import type { TrackedFrame } from "../../ai/poseAnalyzer";
import type { Feature, PhaseSegment, SkillDefinition } from "../types";
import {
  average,
  calculateVisibilityConfidence,
  findFrameAtOrNearestTime,
  findIndexByFrameIndex,
  getFramesInSegment,
  getSegmentFrames,
  getSeriesStats,
  makeSegment,
  normalizeByBody,
  toSeries,
} from "../utils";

const LEFT_WRIST = 15;
const RIGHT_WRIST = 16;
const LOWER_BODY_LANDMARKS = [23, 24, 25, 26, 27, 28];
const TRUNK_LANDMARKS = [11, 12, 23, 24];
const ARM_LANDMARKS = [11, 12, 13, 14, 15, 16];

function getAverageKneeAngle(frame: TrackedFrame): number | null {
  const values = [frame.leftKneeAngle, frame.rightKneeAngle].filter(
    (value): value is number => typeof value === "number"
  );

  return average(values);
}

function getAverageHipAngle(frame: TrackedFrame): number | null {
  const values = [frame.leftHipAngle, frame.rightHipAngle].filter(
    (value): value is number => typeof value === "number"
  );

  return average(values);
}

function findKneeExtensionStart(
  frames: TrackedFrame[],
  takeoffIndex: number,
  peakIndex: number
): TrackedFrame | null {
  const range = getSegmentFrames(frames, takeoffIndex, peakIndex);

  for (let i = 1; i < range.length; i += 1) {
    const previous = getAverageKneeAngle(range[i - 1]);
    const current = getAverageKneeAngle(range[i]);

    if (previous === null || current === null) continue;

    if (current > previous) {
      return range[i];
    }
  }

  return range[0] ?? null;
}

function getWristPeakTime(frames: TrackedFrame[]): number | null {
  let bestTime: number | null = null;
  let bestY = Number.POSITIVE_INFINITY;

  for (const frame of frames) {
    const leftWrist = frame.landmarks[LEFT_WRIST];
    const rightWrist = frame.landmarks[RIGHT_WRIST];

    const wristCandidates = [leftWrist, rightWrist].filter(Boolean);

    for (const wrist of wristCandidates) {
      if (!wrist) continue;

      if (wrist.y < bestY) {
        bestY = wrist.y;
        bestTime = frame.time;
      }
    }
  }

  return bestTime;
}

function pushFeature(features: Feature[], feature: Feature | null) {
  if (!feature) return;
  if (!Number.isFinite(feature.value)) return;
  features.push(feature);
}

function findSegment(
  segments: PhaseSegment[],
  phase: PhaseSegment["phase"]
): PhaseSegment | null {
  return segments.find((segment) => segment.phase === phase) ?? null;
}

function segmentSpikeJump(frames: TrackedFrame[]): PhaseSegment[] {
  if (frames.length < 3) return [];

  const centerYStats = getSeriesStats(toSeries(frames, (frame) => frame.centerY));
  const kneeStats = getSeriesStats(toSeries(frames, getAverageKneeAngle));

  if (!centerYStats || !kneeStats) return [];

  const peakIndex = findIndexByFrameIndex(frames, centerYStats.min.frameIndex);
  const takeoffIndex = findIndexByFrameIndex(frames, kneeStats.min.frameIndex);

  if (peakIndex < 0 || takeoffIndex < 0) return [];

  const segments: PhaseSegment[] = [];

  const approachEnd = Math.max(0, takeoffIndex - 1);
  if (approachEnd > 0) {
    segments.push(makeSegment("approach", frames, 0, approachEnd));
  }

  segments.push(makeSegment("takeoff", frames, takeoffIndex, takeoffIndex));

  if (peakIndex > takeoffIndex) {
    segments.push(makeSegment("ascent", frames, takeoffIndex, peakIndex));
  }

  segments.push(makeSegment("peak", frames, peakIndex, peakIndex));

  const contactEnd = Math.min(frames.length - 1, peakIndex + 2);
  if (contactEnd >= peakIndex) {
    segments.push(makeSegment("contact", frames, peakIndex, contactEnd));
  }

  if (frames.length - 1 > peakIndex) {
    segments.push(makeSegment("landing", frames, peakIndex, frames.length - 1));
  }

  return segments;
}

function extractSpikeJump(
  frames: TrackedFrame[],
  segments: PhaseSegment[]
): Feature[] {
  if (frames.length === 0) return [];

  const features: Feature[] = [];

  const takeoffSegment = findSegment(segments, "takeoff");
  const ascentSegment = findSegment(segments, "ascent");
  const peakSegment = findSegment(segments, "peak");
  const contactSegment = findSegment(segments, "contact");

  const centerXStats = getSeriesStats(toSeries(frames, (frame) => frame.centerX));
  const centerYStats = getSeriesStats(toSeries(frames, (frame) => frame.centerY));
  const kneeStats = getSeriesStats(toSeries(frames, getAverageKneeAngle));

  if (takeoffSegment && kneeStats) {
    const takeoffFrames = getFramesInSegment(frames, takeoffSegment);

    pushFeature(features, {
      key: "takeoff.kneeMinAngle",
      label: "沈み込み時の膝角度",
      phase: "takeoff",
      region: "lowerBody",
      value: kneeStats.min.value,
      unit: "deg",
      confidence: calculateVisibilityConfidence(
        takeoffFrames.length > 0 ? takeoffFrames : frames,
        LOWER_BODY_LANDMARKS
      ),
    });
  }

  if (ascentSegment && kneeStats) {
    const takeoffFrame = findFrameAtOrNearestTime(frames, ascentSegment.startTime);
    const peakFrame = findFrameAtOrNearestTime(frames, ascentSegment.endTime);

    if (takeoffFrame && peakFrame) {
      const takeoffIndex = frames.indexOf(takeoffFrame);
      const peakIndex = frames.indexOf(peakFrame);
      const extensionFrame = findKneeExtensionStart(frames, takeoffIndex, peakIndex);

      if (extensionFrame) {
        const ascentDuration = ascentSegment.endTime - ascentSegment.startTime;
        const relativeTime =
          ascentDuration > 0
            ? (extensionFrame.time - ascentSegment.startTime) / ascentDuration
            : 0;

        pushFeature(features, {
          key: "ascent.kneeExtensionStartRatio",
          label: "伸展開始タイミング",
          phase: "ascent",
          region: "lowerBody",
          value: relativeTime,
          unit: "ratio",
          confidence: calculateVisibilityConfidence(
            getFramesInSegment(frames, ascentSegment),
            LOWER_BODY_LANDMARKS
          ),
        });
      }
    }
  }

  if (centerYStats) {
    pushFeature(features, {
      key: "center.verticalRange",
      label: "垂直方向の移動量",
      phase: "ascent",
      region: "centerOfMass",
      value: normalizeByBody(frames, Math.abs(centerYStats.range)),
      unit: "normPx",
      confidence: calculateVisibilityConfidence(frames),
    });
  }

  if (centerXStats) {
    pushFeature(features, {
      key: "center.horizontalRange",
      label: "水平方向の移動量",
      phase: "ascent",
      region: "centerOfMass",
      value: normalizeByBody(frames, Math.abs(centerXStats.range)),
      unit: "normPx",
      confidence: calculateVisibilityConfidence(frames),
    });
  }

  if (peakSegment) {
    const peakFrame = findFrameAtOrNearestTime(frames, peakSegment.startTime);

    if (peakFrame && typeof peakFrame.shoulderTilt === "number") {
      pushFeature(features, {
        key: "peak.shoulderTilt",
        label: "最高点付近の肩の傾き",
        phase: "peak",
        region: "trunk",
        value: peakFrame.shoulderTilt,
        unit: "deg",
        confidence: calculateVisibilityConfidence([peakFrame], TRUNK_LANDMARKS),
      });
    }

    if (
      peakFrame &&
      typeof peakFrame.leftKneeAngle === "number" &&
      typeof peakFrame.rightKneeAngle === "number"
    ) {
      pushFeature(features, {
        key: "peak.kneeSymmetryDiff",
        label: "最高点付近の左右膝角度差",
        phase: "peak",
        region: "symmetry",
        value: Math.abs(peakFrame.leftKneeAngle - peakFrame.rightKneeAngle),
        unit: "deg",
        confidence: calculateVisibilityConfidence([peakFrame], LOWER_BODY_LANDMARKS),
      });
    }
  }

  if (contactSegment && centerYStats) {
    const wristPeakTime = getWristPeakTime(frames);

    if (wristPeakTime !== null) {
      pushFeature(features, {
        key: "contact.wristPeakToBodyPeakTimeDiff",
        label: "打腕最高点と身体最高点の時間差",
        phase: "contact",
        region: "arm",
        value: wristPeakTime - centerYStats.min.time,
        unit: "sec",
        confidence: calculateVisibilityConfidence(
          getFramesInSegment(frames, contactSegment),
          ARM_LANDMARKS
        ),
      });
    }
  }

  const hipStats = getSeriesStats(toSeries(frames, getAverageHipAngle));

  if (hipStats) {
    pushFeature(features, {
      key: "takeoff.hipMinAngle",
      label: "股関節角度の最小値",
      phase: "takeoff",
      region: "lowerBody",
      value: hipStats.min.value,
      unit: "deg",
      confidence: calculateVisibilityConfidence(frames, LOWER_BODY_LANDMARKS),
    });
  }

  return features;
}

export const spikeJumpDefinition: SkillDefinition = {
  id: "spikeJump",
  segment: segmentSpikeJump,
  extract: extractSpikeJump,
};