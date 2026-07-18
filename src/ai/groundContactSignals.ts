// =============================================================
// groundContact（接地判定・ジャンプイベント検出）の純粋処理単位。
// React/DOMに依存しない、frames配列から値を計算するだけの関数群。
// 呼び出し順序・境界値・比較演算子は groundContact.ts の元実装と
// 完全に同一（数値的に等価）であることを前提とする。
// =============================================================

import type { TrackedFrame } from "./poseTypes";
import {
  differentiate,
  interpolateNulls,
  isLowConfidenceFrame,
  medianOf,
  movingAverage,
  quantileOf,
  reliableAverageX,
  reliableAverageY,
} from "./signalProcessing";

export const LEFT_HIP = 23;
export const RIGHT_HIP = 24;
export const LEFT_ANKLE = 27;
export const RIGHT_ANKLE = 28;
export const LEFT_HEEL = 29;
export const RIGHT_HEEL = 30;
export const LEFT_FOOT_INDEX = 31;
export const RIGHT_FOOT_INDEX = 32;
export const LEFT_SHOULDER = 11;
export const RIGHT_SHOULDER = 12;

export const FOOT_LANDMARKS = [
  LEFT_ANKLE,
  RIGHT_ANKLE,
  LEFT_HEEL,
  RIGHT_HEEL,
  LEFT_FOOT_INDEX,
  RIGHT_FOOT_INDEX,
];

export const CORE_LANDMARKS = [LEFT_SHOULDER, RIGHT_SHOULDER, LEFT_HIP, RIGHT_HIP];

/** 人間のジャンプ滞空時間としてあり得る上限（秒）。世界レベルでも約1.0秒 */
export const MAX_PLAUSIBLE_AIR_TIME_SEC = 1.2;
/** 接地とみなす、地面高さからの許容ズレ（体幹長比） */
export const CONTACT_TOLERANCE_TORSO_RATIO = 0.15;
/** 接地とみなす足の垂直速度上限（体幹長/秒） */
export const CONTACT_FOOT_SPEED_TORSO_PER_SEC = 1.6;

export type MotionSignals = {
  comY: number[];
  comX: number[];
  footY: number[];
  comVelocity: Array<number | null>;
  comAcceleration: Array<number | null>;
  footVelocity: Array<number | null>;
  interpolatedRatio: number;
  lowConfidenceFrames: Set<number>;
};

/** 体幹長（肩中点—腰中点の距離）の中央値（px） */
export function estimateTorsoPx(frames: TrackedFrame[]): number | null {
  const values: number[] = [];

  for (const frame of frames) {
    const sy = reliableAverageY(frame, [LEFT_SHOULDER, RIGHT_SHOULDER]);
    const hy = reliableAverageY(frame, [LEFT_HIP, RIGHT_HIP]);
    const sx = reliableAverageX(frame, [LEFT_SHOULDER, RIGHT_SHOULDER]);
    const hx = reliableAverageX(frame, [LEFT_HIP, RIGHT_HIP]);

    if (sy === null || hy === null || sx === null || hx === null) continue;
    values.push(Math.hypot(sx - hx, sy - hy));
  }

  return medianOf(values);
}

function averageKneeAngle(frame: TrackedFrame): number | null {
  const values = [frame.leftKneeAngle, frame.rightKneeAngle].filter(
    (v): v is number => typeof v === "number" && Number.isFinite(v)
  );
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/**
 * 低信頼フレーム判定＋comX/comY/footY信号構築＋補間・平滑化・速度・加速度。
 * 信号を構築できない（全区間欠測など）場合はnull。
 */
export function buildMotionSignals(
  frames: TrackedFrame[],
  times: number[]
): MotionSignals | null {
  const lowConfidenceFrames = new Set<number>();
  frames.forEach((frame, i) => {
    if (isLowConfidenceFrame(frame, CORE_LANDMARKS)) {
      lowConfidenceFrames.add(i);
    }
  });

  // --- 信号の構築（visibility < 0.5 は欠測→補間） ---
  const rawComY = frames.map((frame, i) =>
    lowConfidenceFrames.has(i)
      ? null
      : reliableAverageY(frame, [LEFT_HIP, RIGHT_HIP])
  );
  const rawComX = frames.map((frame, i) =>
    lowConfidenceFrames.has(i)
      ? null
      : reliableAverageX(frame, [LEFT_HIP, RIGHT_HIP])
  );
  const rawFootY = frames.map((frame) =>
    reliableAverageY(frame, FOOT_LANDMARKS)
  );

  const interpolatedCount = rawComY.filter((v) => v === null).length;

  const comYSeries = movingAverage(interpolateNulls(rawComY), 5);
  const comXSeries = movingAverage(interpolateNulls(rawComX), 5);
  const footYSeries = movingAverage(interpolateNulls(rawFootY), 5);

  if (
    comYSeries.some((v) => v === null) ||
    footYSeries.some((v) => v === null) ||
    comXSeries.some((v) => v === null)
  ) {
    // 全区間欠測など、信号を構築できない
    return null;
  }

  const comY = comYSeries as number[];
  const comX = comXSeries as number[];
  const footY = footYSeries as number[];

  const comVelocity = differentiate(comY, times);
  const comAcceleration = differentiate(comVelocity, times);
  const footVelocity = differentiate(footY, times);

  return {
    comY,
    comX,
    footY,
    comVelocity,
    comAcceleration,
    footVelocity,
    interpolatedRatio: interpolatedCount / frames.length,
    lowConfidenceFrames,
  };
}

/** 地面Y（足の最下点の90%分位）と基準姿勢の重心Y（先頭15%区間の中央値） */
export function computeGroundAndBaseline(
  footY: number[],
  comY: number[],
  frameCount: number
): { groundY: number; baselineComY: number } {
  const groundY = quantileOf(footY, 0.9) ?? Math.max(...footY);

  const baselineCount = Math.max(3, Math.floor(frameCount * 0.15));
  const baselineComY = medianOf(comY.slice(0, baselineCount)) ?? comY[0];

  return { groundY, baselineComY };
}

/** フレームごとの接地判定：足の高さ + 足の速度 の複合条件 */
export function computeGrounded(
  frameCount: number,
  footY: number[],
  footVelocity: Array<number | null>,
  groundY: number,
  torsoPx: number | null
): boolean[] {
  const contactTolerance = torsoPx
    ? torsoPx * CONTACT_TOLERANCE_TORSO_RATIO
    : 18;
  const footSpeedLimit = torsoPx
    ? torsoPx * CONTACT_FOOT_SPEED_TORSO_PER_SEC
    : 200;

  return Array.from({ length: frameCount }, (_, i) => {
    const nearGround = footY[i] >= groundY - contactTolerance;
    const velocity = footVelocity[i];
    const slowFoot = velocity === null || Math.abs(velocity) <= footSpeedLimit;
    return nearGround && slowFoot;
  });
}

/** 最高点（重心Yが最小）のインデックス */
export function findPeakIndex(comY: number[]): number {
  let peakIndex = 0;
  for (let i = 1; i < comY.length; i += 1) {
    if (comY[i] < comY[peakIndex]) peakIndex = i;
  }
  return peakIndex;
}

/** 離地：最高点から遡って「最後に接地していた」フレーム */
export function findTakeoffIndex(grounded: boolean[], peakIndex: number): number {
  for (let i = peakIndex; i >= 0; i -= 1) {
    if (grounded[i]) return i;
  }
  return Math.max(0, peakIndex - 1);
}

/** 着地：最高点から「十分に下降した後」+ 接地条件を満たす最初のフレーム */
export function findPrimaryLandingIndex(
  comY: number[],
  grounded: boolean[],
  descentThresholdY: number,
  peakIndex: number,
  frameCount: number
): number | null {
  for (let i = peakIndex + 1; i < frameCount; i += 1) {
    const descendedEnough = comY[i] >= descentThresholdY;
    if (descendedEnough && grounded[i]) return i;
  }
  return null;
}

/** フォールバック：接地条件を満たす点がない場合、重心が基準姿勢の75%高さまで戻った点 */
export function findFallbackLandingIndex(
  comY: number[],
  fallbackY: number,
  peakIndex: number,
  frameCount: number
): number | null {
  for (let i = peakIndex + 1; i < frameCount; i += 1) {
    if (comY[i] >= fallbackY) return i;
  }
  return null;
}

export type CorrectImplausibleAirTimeParams = {
  comY: number[];
  comVelocity: Array<number | null>;
  times: number[];
  frameCount: number;
  peakIndex: number;
  takeoffIndex: number;
  landingIndex: number;
  airTimeSec: number | null;
  descentThresholdY: number;
};

/** 滞空時間が1.2秒を超える場合の着地インデックス補正（1.2秒超問題データはnull化） */
export function correctImplausibleAirTime(
  params: CorrectImplausibleAirTimeParams
): { landingIndex: number; airTimeSec: number | null } {
  const { comY, comVelocity, times, frameCount, peakIndex, takeoffIndex, descentThresholdY } =
    params;
  let { landingIndex, airTimeSec } = params;

  if (airTimeSec === null || airTimeSec <= MAX_PLAUSIBLE_AIR_TIME_SEC) {
    return { landingIndex, airTimeSec };
  }

  // 着地判定が遅すぎる。最高点以降で重心下降速度が止まる
  // （下向き速度→ほぼゼロ/上向きに転じる）最初の点へ引き戻す。
  let corrected = -1;
  for (let i = peakIndex + 2; i < frameCount - 1; i += 1) {
    const v = comVelocity[i];
    const vNext = comVelocity[i + 1];
    const descendedEnough = comY[i] >= descentThresholdY;
    if (
      descendedEnough &&
      v !== null &&
      vNext !== null &&
      v > 0 &&
      vNext <= v * 0.3
    ) {
      corrected = i + 1;
      break;
    }
  }
  if (corrected !== -1 && corrected < landingIndex) {
    landingIndex = corrected;
    airTimeSec = times[landingIndex] - times[takeoffIndex];
  }
  if (airTimeSec !== null && airTimeSec > MAX_PLAUSIBLE_AIR_TIME_SEC) {
    // それでも異常なら信頼できないためnull（UI側で「計測不能」扱い）
    airTimeSec = null;
  }

  return { landingIndex, airTimeSec };
}

/** 沈み込み最下点（離地前で重心Yが最大）・沈み込み開始・沈み込み深さ */
export function findSinkEvents(
  comY: number[],
  baselineComY: number,
  takeoffIndex: number
): { sinkBottomIndex: number; sinkStartIndex: number; sinkPx: number } {
  let sinkBottomIndex = 0;
  for (let i = 1; i <= takeoffIndex; i += 1) {
    if (comY[i] > comY[sinkBottomIndex]) sinkBottomIndex = i;
  }
  const sinkPx = comY[sinkBottomIndex] - baselineComY;

  let sinkStartIndex = 0;
  if (sinkPx > 0) {
    const threshold = baselineComY + Math.max(sinkPx * 0.15, 2);
    for (let i = sinkBottomIndex; i >= 0; i -= 1) {
      if (comY[i] <= threshold) {
        sinkStartIndex = i;
        break;
      }
    }
  } else {
    sinkStartIndex = Math.max(0, takeoffIndex - 1);
  }

  return { sinkBottomIndex, sinkStartIndex, sinkPx };
}

/** 着地終了：着地後の膝屈曲の底（衝撃吸収の終わり）。なければ+0.3秒 */
export function findLandingEndIndex(
  frames: TrackedFrame[],
  times: number[],
  landingIndex: number
): number {
  let landingEndIndex = landingIndex;
  const limitTime = times[landingIndex] + 0.4;
  let minKnee = Number.POSITIVE_INFINITY;
  for (
    let i = landingIndex;
    i < frames.length && times[i] <= limitTime;
    i += 1
  ) {
    const knee = averageKneeAngle(frames[i]);
    if (knee !== null && knee < minKnee) {
      minKnee = knee;
      landingEndIndex = i;
    }
  }
  if (landingEndIndex === landingIndex) {
    const fallbackTime = times[landingIndex] + 0.3;
    while (
      landingEndIndex < frames.length - 1 &&
      times[landingEndIndex + 1] <= fallbackTime
    ) {
      landingEndIndex += 1;
    }
  }
  return landingEndIndex;
}

export type ClampEventOrderParams = {
  sinkStartIndex: number;
  sinkBottomIndex: number;
  takeoffIndex: number;
  peakIndex: number;
  landingIndex: number;
  landingEndIndex: number;
  lastIndex: number;
};

/**
 * 順序保証：sinkStart <= sinkBottom <= takeoff < peak < landing <= landingEnd。
 * 元実装の4行の逐次代入と同じ順序（sink/takeoffチェーン→landing/landingEndチェーン）で
 * 再代入する。sinkStartIndexはこのブロックでは読み取りのみのためconstで素通しする。
 */
export function clampEventOrder(
  params: ClampEventOrderParams
): {
  sinkStartIndex: number;
  sinkBottomIndex: number;
  takeoffIndex: number;
  landingIndex: number;
  landingEndIndex: number;
} {
  const { sinkStartIndex, peakIndex, lastIndex } = params;
  let { sinkBottomIndex, takeoffIndex, landingIndex, landingEndIndex } = params;

  sinkBottomIndex = Math.max(sinkStartIndex, Math.min(sinkBottomIndex, takeoffIndex));
  takeoffIndex = Math.max(sinkBottomIndex, Math.min(takeoffIndex, peakIndex - 1));
  landingIndex = Math.max(peakIndex + 1, Math.min(landingIndex, lastIndex));
  landingEndIndex = Math.max(landingIndex, Math.min(landingEndIndex, lastIndex));

  return { sinkStartIndex, sinkBottomIndex, takeoffIndex, landingIndex, landingEndIndex };
}
