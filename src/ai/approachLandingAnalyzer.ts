import type { TrackedFrame, TrackedLandmark } from "./trackingAnalyzer";
import { analyzeJumpPhases, type JumpPhase } from "./jumpPhaseAnalyzer";

export type TrendLevel = "低" | "中" | "高";
export type DifferenceLevel = "小" | "中" | "大";
export type BalanceLevel = "安定" | "やや不安定" | "不安定";

export type ApproachLandingAnalysisResult = {
  approach: {
    horizontalMovePx: number | null;
    speedLevel: TrendLevel;
    decelerationLevel: DifferenceLevel;
    stabilityLevel: TrendLevel;
    takeoffCenterText: string;
    comments: string[];
  };
  landing: {
    footTimingDiffSec: number | null;
    sideDiffLevel: DifferenceLevel;
    kneeBendLevel: DifferenceLevel;
    singleLegLandingTendency: TrendLevel;
    balanceLevel: BalanceLevel;
    comments: string[];
  };
};

const LEFT_HIP = 23;
const RIGHT_HIP = 24;
const LEFT_ANKLE = 27;
const RIGHT_ANKLE = 28;

const MIN_FRAMES_FOR_ANALYSIS = 8;
const MIN_VISIBILITY = 0.35;
const LOW_SPEED_PX_PER_SEC = 80;
const HIGH_SPEED_PX_PER_SEC = 180;
const SMALL_DECELERATION_RATIO = 0.15;
const LARGE_DECELERATION_RATIO = 0.4;
const SMALL_STABILITY_RATIO = 0.08;
const LARGE_STABILITY_RATIO = 0.18;
const SMALL_SIDE_DIFF_PX = 12;
const LARGE_SIDE_DIFF_PX = 32;
const SMALL_TIMING_DIFF_SEC = 0.04;
const LARGE_TIMING_DIFF_SEC = 0.09;
const SMALL_KNEE_BEND_DEG = 25;
const LARGE_KNEE_BEND_DEG = 55;
const SINGLE_LEG_LOW_SCORE = 1;
const SINGLE_LEG_HIGH_SCORE = 2;

function isVisible(point: TrackedLandmark | undefined): point is TrackedLandmark {
  return !!point && (point.visibility ?? 1) >= MIN_VISIBILITY;
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function phaseByName(
  phases: JumpPhase[],
  name: JumpPhase["name"]
): JumpPhase | null {
  return phases.find((phase) => phase.name === name) ?? null;
}

function frameRange(
  frames: TrackedFrame[],
  phase: JumpPhase | null
): TrackedFrame[] {
  if (!phase) return [];
  return frames.slice(phase.startIndex, phase.endIndex + 1);
}

function levelFromSpeed(speedPxPerSec: number | null): TrendLevel {
  if (speedPxPerSec === null) return "低";
  if (speedPxPerSec < LOW_SPEED_PX_PER_SEC) return "低";
  if (speedPxPerSec < HIGH_SPEED_PX_PER_SEC) return "中";
  return "高";
}

function levelFromDifference(
  value: number,
  small: number,
  large: number
): DifferenceLevel {
  if (value < small) return "小";
  if (value < large) return "中";
  return "大";
}

function stabilityLevelFromRatio(ratio: number | null): TrendLevel {
  if (ratio === null) return "低";
  if (ratio < SMALL_STABILITY_RATIO) return "高";
  if (ratio < LARGE_STABILITY_RATIO) return "中";
  return "低";
}

function speedBetween(start: TrackedFrame, end: TrackedFrame): number | null {
  const dt = end.time - start.time;
  if (dt <= 0) return null;
  return Math.abs(end.centerX - start.centerX) / dt;
}

function horizontalMove(frames: TrackedFrame[]): number | null {
  if (frames.length < 2) return null;
  return frames[frames.length - 1].centerX - frames[0].centerX;
}

function approachStabilityRatio(frames: TrackedFrame[]): number | null {
  if (frames.length < 3) return null;

  const first = frames[0];
  const last = frames[frames.length - 1];
  const dx = last.centerX - first.centerX;
  const dy = last.centerY - first.centerY;
  const lineLength = Math.hypot(dx, dy);

  if (lineLength <= 0) return null;

  const deviations = frames.map((frame) => {
    const numerator = Math.abs(
      dy * frame.centerX -
        dx * frame.centerY +
        last.centerX * first.centerY -
        last.centerY * first.centerX
    );

    return numerator / lineLength;
  });

  const avgDeviation = average(deviations);
  if (avgDeviation === null) return null;

  return avgDeviation / lineLength;
}

function decelerationLevel(approachFrames: TrackedFrame[]): DifferenceLevel {
  if (approachFrames.length < 6) return "小";

  const midpoint = Math.floor(approachFrames.length / 2);
  const early = approachFrames.slice(0, midpoint);
  const late = approachFrames.slice(midpoint);

  const earlySpeed = speedBetween(early[0], early[early.length - 1]);
  const lateSpeed = speedBetween(late[0], late[late.length - 1]);

  if (earlySpeed === null || lateSpeed === null || earlySpeed <= 0) return "小";

  const decreaseRatio = Math.max(0, (earlySpeed - lateSpeed) / earlySpeed);

  return levelFromDifference(
    decreaseRatio,
    SMALL_DECELERATION_RATIO,
    LARGE_DECELERATION_RATIO
  );
}

function takeoffCenterText(
  frames: TrackedFrame[],
  takeoffPhase: JumpPhase | null
): string {
  if (!takeoffPhase) return "踏切位置を特定できませんでした。";

  const start = frames[0];
  const takeoff = frames[takeoffPhase.endIndex];
  const dx = takeoff.centerX - start.centerX;

  if (Math.abs(dx) < SMALL_SIDE_DIFF_PX) {
    return "開始位置に近い位置で踏み切っています。";
  }

  const direction = dx >= 0 ? "画面右" : "画面左";
  return `開始位置より${direction}側で踏み切っています。`;
}

function ankleY(frame: TrackedFrame, ankleIndex: number): number | null {
  const point = frame.landmarks[ankleIndex];
  if (!isVisible(point)) return null;
  return point.y;
}

function estimateFootContactIndex(
  frames: TrackedFrame[],
  ankleIndex: number,
  startIndex: number
): number | null {
  const values = frames
    .map((frame) => ankleY(frame, ankleIndex))
    .filter((value): value is number => value !== null);

  if (values.length === 0) return null;

  const baseline = Math.max(...values);
  const threshold = baseline - SMALL_SIDE_DIFF_PX;

  for (let i = startIndex; i < frames.length; i += 1) {
    const y = ankleY(frames[i], ankleIndex);
    if (y !== null && y >= threshold) return i;
  }

  return null;
}

function ankleHeightDiff(frame: TrackedFrame): number | null {
  const left = frame.landmarks[LEFT_ANKLE];
  const right = frame.landmarks[RIGHT_ANKLE];

  if (!isVisible(left) || !isVisible(right)) return null;

  return Math.abs(left.y - right.y);
}

function hipCenterX(frame: TrackedFrame): number | null {
  const left = frame.landmarks[LEFT_HIP];
  const right = frame.landmarks[RIGHT_HIP];

  if (!isVisible(left) || !isVisible(right)) return null;

  return (left.x + right.x) / 2;
}

function ankleCenterX(frame: TrackedFrame): number | null {
  const left = frame.landmarks[LEFT_ANKLE];
  const right = frame.landmarks[RIGHT_ANKLE];

  if (!isVisible(left) || !isVisible(right)) return null;

  return (left.x + right.x) / 2;
}

function landingSideDiffPx(frame: TrackedFrame): number | null {
  const hipX = hipCenterX(frame);
  const feetX = ankleCenterX(frame);

  if (hipX === null || feetX === null) return null;

  return Math.abs(hipX - feetX);
}

function averageLandingKneeBend(frames: TrackedFrame[]): number | null {
  const bends: number[] = [];

  for (const frame of frames) {
    if (frame.leftKneeAngle !== null) {
      bends.push(Math.max(0, 180 - frame.leftKneeAngle));
    }

    if (frame.rightKneeAngle !== null) {
      bends.push(Math.max(0, 180 - frame.rightKneeAngle));
    }
  }

  return average(bends);
}

function balanceLevel(
  sideDiffLevel: DifferenceLevel,
  singleLegLevel: TrendLevel
): BalanceLevel {
  if (sideDiffLevel === "小" && singleLegLevel === "低") return "安定";
  if (sideDiffLevel === "大" || singleLegLevel === "高") return "不安定";
  return "やや不安定";
}

function singleLegTendency(
  timingDiffSec: number | null,
  ankleDiffPx: number | null
): TrendLevel {
  let score = 0;

  if (timingDiffSec !== null) {
    if (timingDiffSec >= LARGE_TIMING_DIFF_SEC) {
      score += 2;
    } else if (timingDiffSec >= SMALL_TIMING_DIFF_SEC) {
      score += 1;
    }
  }

  if (ankleDiffPx !== null) {
    if (ankleDiffPx >= LARGE_SIDE_DIFF_PX) {
      score += 2;
    } else if (ankleDiffPx >= SMALL_SIDE_DIFF_PX) {
      score += 1;
    }
  }

  if (score <= SINGLE_LEG_LOW_SCORE) return "低";
  if (score <= SINGLE_LEG_HIGH_SCORE) return "中";
  return "高";
}

function createApproachComments(params: {
  speedLevel: TrendLevel;
  decelerationLevel: DifferenceLevel;
  stabilityLevel: TrendLevel;
}): string[] {
  const comments: string[] = [];

  comments.push(`助走速度は${params.speedLevel}めです。`);

  if (params.decelerationLevel !== "小") {
    comments.push(
      `踏切前の減速が${params.decelerationLevel}めです。最後の一歩で勢いが落ちていないか確認してください。`
    );
  }

  if (params.stabilityLevel === "低") {
    comments.push(
      "助走中の重心ラインにばらつきがあります。踏切までの進入方向を一定にできるか確認してください。"
    );
  }

  if (comments.length === 1) {
    comments.push("助走から踏切までの流れは大きく崩れていません。");
  }

  return comments;
}

function createLandingComments(params: {
  sideDiffLevel: DifferenceLevel;
  singleLegLevel: TrendLevel;
  balanceLevel: BalanceLevel;
  kneeBendLevel: DifferenceLevel;
}): string[] {
  const comments: string[] = [];

  if (params.sideDiffLevel !== "小") {
    comments.push(`着地時の左右差が${params.sideDiffLevel}めです。`);
  }

  if (params.singleLegLevel !== "低") {
    comments.push(
      `片足着地傾向が${params.singleLegLevel}めです。左右の足が近いタイミングで接地しているか確認してください。`
    );
  }

  comments.push(`着地バランスは「${params.balanceLevel}」です。`);
  comments.push(`着地時の膝の曲がりは${params.kneeBendLevel}めです。`);

  return comments;
}

export function analyzeApproachAndLanding(
  frames: TrackedFrame[]
): ApproachLandingAnalysisResult | null {
  if (frames.length < MIN_FRAMES_FOR_ANALYSIS) return null;

  const phaseResult = analyzeJumpPhases(frames);
  if (!phaseResult) return null;

  const approachPhase = phaseByName(phaseResult.phases, "助走");
  const takeoffPhase = phaseByName(phaseResult.phases, "踏切");
  const landingPhase = phaseByName(phaseResult.phases, "着地");

  const approachFrames = frameRange(frames, approachPhase);
  const landingFrames = frameRange(frames, landingPhase);

  const approachMovePx = horizontalMove(approachFrames);
  const approachSpeed =
    approachFrames.length >= 2
      ? speedBetween(approachFrames[0], approachFrames[approachFrames.length - 1])
      : null;

  const speedLevel = levelFromSpeed(approachSpeed);
  const approachStability = stabilityLevelFromRatio(
    approachStabilityRatio(approachFrames)
  );
  const approachDeceleration = decelerationLevel(approachFrames);

  const landingStartIndex = landingPhase?.startIndex ?? phaseResult.peakIndex;

  const leftContactIndex = estimateFootContactIndex(
    frames,
    LEFT_ANKLE,
    landingStartIndex
  );

  const rightContactIndex = estimateFootContactIndex(
    frames,
    RIGHT_ANKLE,
    landingStartIndex
  );

  const footTimingDiffSec =
    leftContactIndex !== null && rightContactIndex !== null
      ? Math.abs(frames[leftContactIndex].time - frames[rightContactIndex].time)
      : null;

  const landingFrame = frames[landingStartIndex] ?? frames[frames.length - 1];
  const ankleDiff = ankleHeightDiff(landingFrame);
  const singleLegLevel = singleLegTendency(footTimingDiffSec, ankleDiff);

  const sideDiffPx = landingSideDiffPx(landingFrame);
  const sideDiffLevel = levelFromDifference(
    sideDiffPx ?? 0,
    SMALL_SIDE_DIFF_PX,
    LARGE_SIDE_DIFF_PX
  );

  const kneeBend = averageLandingKneeBend(landingFrames);
  const kneeBendLevel = levelFromDifference(
    kneeBend ?? 0,
    SMALL_KNEE_BEND_DEG,
    LARGE_KNEE_BEND_DEG
  );

  const landingBalanceLevel = balanceLevel(sideDiffLevel, singleLegLevel);

  return {
    approach: {
      horizontalMovePx: approachMovePx,
      speedLevel,
      decelerationLevel: approachDeceleration,
      stabilityLevel: approachStability,
      takeoffCenterText: takeoffCenterText(frames, takeoffPhase),
      comments: createApproachComments({
        speedLevel,
        decelerationLevel: approachDeceleration,
        stabilityLevel: approachStability,
      }),
    },
    landing: {
      footTimingDiffSec,
      sideDiffLevel,
      kneeBendLevel,
      singleLegLandingTendency: singleLegLevel,
      balanceLevel: landingBalanceLevel,
      comments: createLandingComments({
        sideDiffLevel,
        singleLegLevel,
        balanceLevel: landingBalanceLevel,
        kneeBendLevel,
      }),
    },
  };
}