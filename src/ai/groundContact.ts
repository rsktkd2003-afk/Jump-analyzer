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
//
// 信号構築・接地判定・離着地探索などの純粋処理は groundContactSignals.ts
// に分離されている。このファイルは detectJumpEvents を公開APIの入口として、
// それらを正しい順序で呼び出し結果を組み立てる。
// =============================================================

import type { TrackedFrame } from "./poseTypes";
import {
  buildMotionSignals,
  clampEventOrder,
  computeGroundAndBaseline,
  computeGrounded,
  correctImplausibleAirTime,
  estimateTorsoPx,
  findFallbackLandingIndex,
  findLandingEndIndex,
  findPeakIndex,
  findPrimaryLandingIndex,
  findSinkEvents,
  findTakeoffIndex,
} from "./groundContactSignals";

const MIN_FRAMES = 8;
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

/**
 * ジャンプイベントを検出する。
 * 検出不能（ジャンプなし・データ不足）の場合は valid=false を返す。
 */
export function detectJumpEvents(frames: TrackedFrame[]): JumpEvents | null {
  if (frames.length < MIN_FRAMES) return null;

  const times = frames.map((f) => f.time);
  const torsoPx = estimateTorsoPx(frames);

  const signals = buildMotionSignals(frames, times);
  if (!signals) return null;

  const {
    comY,
    comX,
    footY,
    comVelocity,
    comAcceleration,
    footVelocity,
    interpolatedRatio,
    lowConfidenceFrames,
  } = signals;

  const { groundY, baselineComY } = computeGroundAndBaseline(
    footY,
    comY,
    frames.length
  );

  const grounded = computeGrounded(
    frames.length,
    footY,
    footVelocity,
    groundY,
    torsoPx
  );

  const peakIndex = findPeakIndex(comY);

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
      interpolatedRatio,
      lowConfidenceFrames
    );
  }

  const takeoffIndex = findTakeoffIndex(grounded, peakIndex);

  // 十分な下降 = 上昇量の LANDING_MIN_DESCENT_RATIO 以上戻っていること。
  const descentThresholdY = comY[peakIndex] + risePx * LANDING_MIN_DESCENT_RATIO;

  const fallbackY = baselineComY - risePx * 0.25;
  let landingIndex =
    findPrimaryLandingIndex(comY, grounded, descentThresholdY, peakIndex, frames.length) ??
    findFallbackLandingIndex(comY, fallbackY, peakIndex, frames.length) ??
    frames.length - 1;

  // --- 妥当性チェック：滞空時間が物理的にあり得るか ---
  let airTimeSec: number | null =
    landingIndex > takeoffIndex
      ? times[landingIndex] - times[takeoffIndex]
      : null;

  ({ landingIndex, airTimeSec } = correctImplausibleAirTime({
    comY,
    comVelocity,
    times,
    frameCount: frames.length,
    peakIndex,
    takeoffIndex,
    landingIndex,
    airTimeSec,
    descentThresholdY,
  }));

  const { sinkBottomIndex, sinkStartIndex, sinkPx } = findSinkEvents(
    comY,
    baselineComY,
    takeoffIndex
  );

  const landingEndIndex = findLandingEndIndex(frames, times, landingIndex);

  const clamped = clampEventOrder({
    sinkStartIndex,
    sinkBottomIndex,
    takeoffIndex,
    peakIndex,
    landingIndex,
    landingEndIndex,
    lastIndex: frames.length - 1,
  });

  return {
    valid: true,
    baselineComY,
    groundY,
    sinkStartIndex: clamped.sinkStartIndex,
    sinkBottomIndex: clamped.sinkBottomIndex,
    takeoffIndex: clamped.takeoffIndex,
    peakIndex,
    landingIndex: clamped.landingIndex,
    landingEndIndex: clamped.landingEndIndex,
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
    interpolatedRatio,
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
  interpolatedRatio: number,
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
    interpolatedRatio,
    lowConfidenceFrames,
  };
}
