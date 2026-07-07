export type Keypoint = {
  x: number;
  y: number;
  z?: number;
  visibility?: number;
};

export type PoseFrame = {
  timestamp: number;
  leftHip?: Keypoint;
  rightHip?: Keypoint;
  leftKnee?: Keypoint;
  rightKnee?: Keypoint;
  leftAnkle?: Keypoint;
  rightAnkle?: Keypoint;
};

export type SmoothedFrame = {
  timestamp: number;
  hipY: number | null;
  kneeY: number | null;
  ankleY: number | null;
  hipVelocity: number | null;
  kneeVelocity: number | null;
  ankleVelocity: number | null;
};

export type JumpEvent = {
  takeoffIndex: number;
  landingIndex: number;
  flightTimeMs: number;
  flightTimeSec: number;
};

export type JumpAnalysisResult = {
  success: boolean;
  smoothedFrames: SmoothedFrame[];
  jumpEvent: JumpEvent | null;
  jumpHeightCm: number | null;
};

const MIN_VISIBILITY = 0.5;
const SMOOTH_WINDOW = 5;

function isValidPoint(point?: Keypoint): point is Keypoint {
  return !!point && (point.visibility ?? 1) >= MIN_VISIBILITY;
}

function averageY(points: Array<Keypoint | undefined>): number | null {
  const validPoints = points.filter(isValidPoint);

  if (validPoints.length === 0) {
    return null;
  }

  return validPoints.reduce((sum, point) => sum + point.y, 0) / validPoints.length;
}

function movingAverage(
  values: Array<number | null>,
  windowSize = SMOOTH_WINDOW
): Array<number | null> {
  const half = Math.floor(windowSize / 2);

  return values.map((_, index) => {
    const start = Math.max(0, index - half);
    const end = Math.min(values.length, index + half + 1);

    const windowValues = values
      .slice(start, end)
      .filter((value): value is number => value !== null);

    if (windowValues.length === 0) {
      return null;
    }

    return windowValues.reduce((sum, value) => sum + value, 0) / windowValues.length;
  });
}

function calcVelocity(
  values: Array<number | null>,
  timestamps: number[]
): Array<number | null> {
  return values.map((value, index) => {
    if (index === 0) {
      return null;
    }

    const previousValue = values[index - 1];

    if (value === null || previousValue === null) {
      return null;
    }

    const dt = (timestamps[index] - timestamps[index - 1]) / 1000;

    if (dt <= 0) {
      return null;
    }

    return (value - previousValue) / dt;
  });
}

function averageFirstValues(values: Array<number | null>, count = 15): number | null {
  const validValues = values
    .slice(0, count)
    .filter((value): value is number => value !== null);

  if (validValues.length === 0) {
    return null;
  }

  return validValues.reduce((sum, value) => sum + value, 0) / validValues.length;
}

export function smoothPoseFrames(frames: PoseFrame[]): SmoothedFrame[] {
  const timestamps = frames.map((frame) => frame.timestamp);

  const rawHipY = frames.map((frame) =>
    averageY([frame.leftHip, frame.rightHip])
  );

  const rawKneeY = frames.map((frame) =>
    averageY([frame.leftKnee, frame.rightKnee])
  );

  const rawAnkleY = frames.map((frame) =>
    averageY([frame.leftAnkle, frame.rightAnkle])
  );

  const hipY = movingAverage(rawHipY);
  const kneeY = movingAverage(rawKneeY);
  const ankleY = movingAverage(rawAnkleY);

  const hipVelocity = calcVelocity(hipY, timestamps);
  const kneeVelocity = calcVelocity(kneeY, timestamps);
  const ankleVelocity = calcVelocity(ankleY, timestamps);

  return frames.map((frame, index) => ({
    timestamp: frame.timestamp,
    hipY: hipY[index],
    kneeY: kneeY[index],
    ankleY: ankleY[index],
    hipVelocity: hipVelocity[index],
    kneeVelocity: kneeVelocity[index],
    ankleVelocity: ankleVelocity[index],
  }));
}

export function detectJumpEvent(frames: SmoothedFrame[]): JumpEvent | null {
  if (frames.length < 10) {
    return null;
  }

  const baseHipY = averageFirstValues(frames.map((frame) => frame.hipY));
  const baseAnkleY = averageFirstValues(frames.map((frame) => frame.ankleY));

  if (baseHipY === null || baseAnkleY === null) {
    return null;
  }

  let takeoffIndex = -1;
  let landingIndex = -1;

  for (let i = 1; i < frames.length; i++) {
    const frame = frames[i];

    if (
      frame.hipY === null ||
      frame.ankleY === null ||
      frame.hipVelocity === null ||
      frame.ankleVelocity === null
    ) {
      continue;
    }

    const hipRaised = frame.hipY < baseHipY - 0.015;
    const ankleRaised = frame.ankleY < baseAnkleY - 0.01;
    const bodyMovingUp = frame.hipVelocity < -0.15;

    if (hipRaised && ankleRaised && bodyMovingUp) {
      takeoffIndex = i;
      break;
    }
  }

  if (takeoffIndex === -1) {
    return null;
  }

  for (let i = takeoffIndex + 3; i < frames.length; i++) {
    const frame = frames[i];

    if (
      frame.hipY === null ||
      frame.ankleY === null ||
      frame.hipVelocity === null
    ) {
      continue;
    }

    const ankleReturned = frame.ankleY >= baseAnkleY - 0.01;
    const bodyNoLongerMovingUp = frame.hipVelocity >= -0.05;

    if (ankleReturned && bodyNoLongerMovingUp) {
      landingIndex = i;
      break;
    }
  }

  if (landingIndex === -1) {
    return null;
  }

  const flightTimeMs =
    frames[landingIndex].timestamp - frames[takeoffIndex].timestamp;

  return {
    takeoffIndex,
    landingIndex,
    flightTimeMs,
    flightTimeSec: flightTimeMs / 1000,
  };
}

export function estimateJumpHeightFromFlightTime(flightTimeSec: number): number {
  const gravity = 9.80665;
  const heightMeters = (gravity * flightTimeSec * flightTimeSec) / 8;

  return heightMeters * 100;
}

export function analyzeJumpFromPoseFrames(frames: PoseFrame[]): JumpAnalysisResult {
  const smoothedFrames = smoothPoseFrames(frames);
  const jumpEvent = detectJumpEvent(smoothedFrames);

  if (!jumpEvent) {
    return {
      success: false,
      smoothedFrames,
      jumpEvent: null,
      jumpHeightCm: null,
    };
  }

  return {
    success: true,
    smoothedFrames,
    jumpEvent,
    jumpHeightCm: estimateJumpHeightFromFlightTime(jumpEvent.flightTimeSec),
  };
}