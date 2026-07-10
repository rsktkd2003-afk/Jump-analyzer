// =============================================================
// 接地判定とジャンプイベント（離地・最高点・着地）の検出。
//
// 従来は重心Y（バウンディングボックス中心）のみで判定していたが、
// 腕振り等でボックスが変形して誤検出するため、以下を組み合わせる。
//  - 足の最下点Y（足首27/28・踵29/30・つま先31/32、visibility >= 0.5のみ）
//  - 足の垂直速度
//  - 重心（腰中点）のY・速度
// 着地開始は「最高点から十分に下降した後」+「足が地面高さに戻り、
// 足の速度が小さい」条件を満たす最初のフレームに限定する。
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

const LEFT_HIP = 23;
const RIGHT_HIP = 24;
const LEFT_ANKLE = 27;
const RIGHT_ANKLE = 28;
const LEFT_HEEL = 29;
const RIGHT_HEEL = 30;
const LEFT_FOOT_INDEX = 31;
const RIGHT_FOOT_INDEX = 32;
const LEFT_SHOULDER = 11;
const RIGHT_SHOULDER = 12;

const FOOT_LANDMARKS = [
  LEFT_ANKLE,
  RIGHT_ANKLE,
  LEFT_HEEL,
  RIGHT_HEEL,
  LEFT_FOOT_INDEX,
  RIGHT_FOOT_INDEX,
];

const CORE_LANDMARKS = [LEFT_SHOULDER, RIGHT_SHOULDER, LEFT_HIP, RIGHT_HIP];

const MIN_FRAMES = 8;
/** 人間のジャンプ滞空時間としてあり得る上限（秒）。世界レベルでも約1.0秒 */
const MAX_PLAUSIBLE_AIR_TIME_SEC = 1.2;
/** 接地とみなす、地面高さからの許容ズレ（体幹長比） */
const CONTACT_TOLERANCE_TORSO_RATIO = 0.15;
/** 接地とみなす足の垂直速度上限（体幹長/秒） */
const CONTACT_FOOT_SPEED_TORSO_PER_SEC = 1.6;
/** 着地探索を開始する下降量（最高点からの上昇量に対する比率） */
const LANDING_MIN_DESCENT_RATIO = 0.5;
/** ジャンプと判定する最小上昇量（体幹長比） */
const MIN_RISE_TORSO_RATIO = 0.2;

export type JumpEvents = {
  valid: boolean;
  /** 立ち姿勢（序盤）の重心Y基準値 */
  baselineComY: number;
  /** 地面の推定Y（足の最下点の高分位点） */
  groundY: number;
  /** 沈み込み開始 */
  sinkStartIndex: number;
  /** 沈み込み最下点 */
  sinkBottomIndex: number;
  /** 離地（最後の接地フレーム） */
  takeoffIndex: number;
  /** 重心最高点 */
  peakIndex: number;
  /** 着地（最高点から十分下降後、最初に接地したフレーム） */
  landingIndex: number;
  /** 着地衝撃吸収の終わり（膝屈曲の底） */
  landingEndIndex: number;
  airTimeSec: number | null;
  /** 重心の上昇量（基準姿勢→最高点, px） */
  risePx: number;
  /** 沈み込み深さ（基準姿勢→最下点, px） */
  sinkPx: number;
  /** 体幹長（px, スケール基準） */
  torsoPx: number | null;
  /** フレームごとの接地判定 */
  grounded: boolean[];
  /** 平滑化済み重心Y（腰中点） */
  comY: number[];
  /** 重心の垂直速度（px/秒, +は下向き） */
  comVelocity: Array<number | null>;
  /** 重心の垂直加速度（px/秒^2） */
  comAcceleration: Array<number | null>;
  /** 平滑化済み重心X */
  comX: number[];
  /** 足の最下点Y（平滑化済み） */
  footY: number[];
  /** 足の垂直速度（px/秒） */
  footVelocity: Array<number | null>;
  /** visibility不足で補間されたフレームの割合（0〜1） */
  interpolatedRatio: number;
  /** 低信頼（主要点のvisibility平均 < 0.5）フレームのインデックス集合 */
  lowConfidenceFrames: Set<number>;
};

function estimateTorsoPx(frames: TrackedFrame[]): number | null {
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
 * ジャンプイベントを検出する。
 * 検出不能（ジャンプなし・データ不足）の場合は valid=false を返す。
 */
export function detectJumpEvents(frames: TrackedFrame[]): JumpEvents | null {
  if (frames.length < MIN_FRAMES) return null;

  const times = frames.map((f) => f.time);
  const torsoPx = estimateTorsoPx(frames);

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

  // --- 地面と基準姿勢 ---
  // 地面Y：足の最下点の90%分位（外れ値に頑健。yは下向きに大きい）
  const groundY = quantileOf(footY, 0.9) ?? Math.max(...footY);

  const baselineCount = Math.max(3, Math.floor(frames.length * 0.15));
  const baselineComY =
    medianOf(comY.slice(0, baselineCount)) ?? comY[0];

  // --- 接地判定：足の高さ + 足の速度 の複合条件 ---
  const contactTolerance = torsoPx
    ? torsoPx * CONTACT_TOLERANCE_TORSO_RATIO
    : 18;
  const footSpeedLimit = torsoPx
    ? torsoPx * CONTACT_FOOT_SPEED_TORSO_PER_SEC
    : 200;

  const grounded = frames.map((_, i) => {
    const nearGround = footY[i] >= groundY - contactTolerance;
    const velocity = footVelocity[i];
    const slowFoot = velocity === null || Math.abs(velocity) <= footSpeedLimit;
    return nearGround && slowFoot;
  });

  // --- 最高点（重心Yが最小） ---
  let peakIndex = 0;
  for (let i = 1; i < comY.length; i += 1) {
    if (comY[i] < comY[peakIndex]) peakIndex = i;
  }

  const risePx = baselineComY - comY[peakIndex];
  const minRise = torsoPx ? torsoPx * MIN_RISE_TORSO_RATIO : 20;

  if (risePx < minRise) {
    // 明確なジャンプなし
    return buildInvalid(
      frames,
      baselineComY,
      groundY,
      peakIndex,
      torsoPx,
      grounded,
      comY,
      comVelocity,
      comAcceleration,
      comX,
      footY,
      footVelocity,
      interpolatedCount,
      lowConfidenceFrames
    );
  }

  // --- 離地：最高点から遡って「最後に接地していた」フレーム ---
  let takeoffIndex = -1;
  for (let i = peakIndex; i >= 0; i -= 1) {
    if (grounded[i]) {
      takeoffIndex = i;
      break;
    }
  }
  if (takeoffIndex === -1) takeoffIndex = Math.max(0, peakIndex - 1);

  // --- 着地：最高点から「十分に下降した後」+ 接地条件 ---
  // 十分な下降 = 上昇量の LANDING_MIN_DESCENT_RATIO 以上戻っていること。
  const descentThresholdY =
    comY[peakIndex] + risePx * LANDING_MIN_DESCENT_RATIO;

  let landingIndex = -1;
  for (let i = peakIndex + 1; i < frames.length; i += 1) {
    const descendedEnough = comY[i] >= descentThresholdY;
    if (descendedEnough && grounded[i]) {
      landingIndex = i;
      break;
    }
  }

  // フォールバック1：接地条件を満たす点がない場合、
  // 重心が基準姿勢の75%高さまで戻った点
  if (landingIndex === -1) {
    const fallbackY = baselineComY - risePx * 0.25;
    for (let i = peakIndex + 1; i < frames.length; i += 1) {
      if (comY[i] >= fallbackY) {
        landingIndex = i;
        break;
      }
    }
  }
  if (landingIndex === -1) landingIndex = frames.length - 1;

  // --- 妥当性チェック：滞空時間が物理的にあり得るか ---
  let airTimeSec: number | null =
    landingIndex > takeoffIndex
      ? times[landingIndex] - times[takeoffIndex]
      : null;

  if (airTimeSec !== null && airTimeSec > MAX_PLAUSIBLE_AIR_TIME_SEC) {
    // 着地判定が遅すぎる。最高点以降で重心下降速度が止まる
    // （下向き速度→ほぼゼロ/上向きに転じる）最初の点へ引き戻す。
    let corrected = -1;
    for (let i = peakIndex + 2; i < frames.length - 1; i += 1) {
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
  }

  // --- 沈み込み最下点：離地前で重心Yが最大 ---
  let sinkBottomIndex = 0;
  for (let i = 1; i <= takeoffIndex; i += 1) {
    if (comY[i] > comY[sinkBottomIndex]) sinkBottomIndex = i;
  }
  const sinkPx = comY[sinkBottomIndex] - baselineComY;

  // --- 沈み込み開始：最下点から遡り、基準姿勢に近い最後のフレーム ---
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

  // --- 着地終了：着地後の膝屈曲の底（衝撃吸収の終わり）。なければ+0.3秒 ---
  let landingEndIndex = landingIndex;
  {
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
  }

  // --- 順序保証：sinkStart <= sinkBottom <= takeoff < peak < landing <= landingEnd ---
  sinkBottomIndex = Math.max(sinkStartIndex, Math.min(sinkBottomIndex, takeoffIndex));
  takeoffIndex = Math.max(sinkBottomIndex, Math.min(takeoffIndex, peakIndex - 1));
  landingIndex = Math.max(peakIndex + 1, Math.min(landingIndex, frames.length - 1));
  landingEndIndex = Math.max(landingIndex, Math.min(landingEndIndex, frames.length - 1));

  return {
    valid: true,
    baselineComY,
    groundY,
    sinkStartIndex,
    sinkBottomIndex,
    takeoffIndex,
    peakIndex,
    landingIndex,
    landingEndIndex,
    airTimeSec,
    risePx,
    sinkPx: Math.max(0, sinkPx),
    torsoPx,
    grounded,
    comY,
    comVelocity,
    comAcceleration,
    comX,
    footY,
    footVelocity,
    interpolatedRatio: interpolatedCount / frames.length,
    lowConfidenceFrames,
  };
}

function buildInvalid(
  frames: TrackedFrame[],
  baselineComY: number,
  groundY: number,
  peakIndex: number,
  torsoPx: number | null,
  grounded: boolean[],
  comY: number[],
  comVelocity: Array<number | null>,
  comAcceleration: Array<number | null>,
  comX: number[],
  footY: number[],
  footVelocity: Array<number | null>,
  interpolatedCount: number,
  lowConfidenceFrames: Set<number>
): JumpEvents {
  const last = frames.length - 1;
  return {
    valid: false,
    baselineComY,
    groundY,
    sinkStartIndex: 0,
    sinkBottomIndex: 0,
    takeoffIndex: 0,
    peakIndex,
    landingIndex: last,
    landingEndIndex: last,
    airTimeSec: null,
    risePx: baselineComY - comY[peakIndex],
    sinkPx: 0,
    torsoPx,
    grounded,
    comY,
    comVelocity,
    comAcceleration,
    comX,
    footY,
    footVelocity,
    interpolatedRatio: interpolatedCount / frames.length,
    lowConfidenceFrames,
  };
}
