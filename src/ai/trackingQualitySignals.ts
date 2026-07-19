// =============================================================
// 信頼度算出v2（Phase1）向けに、トラッキング済みフレーム列から
// 「品質シグナル」を抽出する。ここでは信頼度スコアそのものは計算せず、
// 素材となる比率・平均値だけを算出する。実際のスコアへの反映は
// src/utils/analysisConfidence.ts が既存スコアに対する追加の
// 減点・警告として行う（既存スコアの全面置き換えではない）。
// =============================================================

import { detectJumpEvents } from "./groundContact";
import type { TrackedFrame } from "./poseTypes";

export type ConfidenceQualitySignals = {
  /** 欠測（visibility不足）を線形補間したフレームの割合（groundContact.ts 由来） */
  interpolatedRatio: number | null;
  /** 主要関節の平均visibilityが低かったフレームの割合（groundContact.ts 由来） */
  lowConfidenceFrameRatio: number | null;
  /** 軽量トラッカーの平均マッチスコア（トラッカー未使用の解析ではnull） */
  averageTrackerMatchScore: number | null;
  /** 遮蔽等で予測のみに頼った(coasting)フレームの割合 */
  coastingFrameRatio: number | null;
  /** 左右入れ替わり補正が発生したフレームの割合 */
  lateralityCorrectionRatio: number | null;
  /** 左右入れ替わり補正が発生したフレームの平均確信度（発生時のみ対象） */
  averageLateralityCorrectionConfidence: number | null;
  /** フレーム間で身体スケールに対して不自然に大きい移動が検出された割合 */
  abnormalJumpRatio: number | null;
};

/** 異常ジャンプ判定のしきい値（クロップ高さに対する比率）。適応的にするため固定px値は使わない */
const ABNORMAL_JUMP_CROP_HEIGHT_RATIO = 0.4;
/** クロップ高さが極端に小さい場合のゼロ割防止用の下限（px） */
const MIN_CROP_HEIGHT_PX = 40;

function ratioOrNull(count: number, total: number): number | null {
  return total > 0 ? count / total : null;
}

function computeAbnormalJumpRatio(frames: TrackedFrame[]): number | null {
  if (frames.length < 2) return null;

  let abnormalCount = 0;
  for (let i = 1; i < frames.length; i += 1) {
    const prev = frames[i - 1];
    const curr = frames[i];
    const jump = Math.hypot(curr.centerX - prev.centerX, curr.centerY - prev.centerY);
    const scale = Math.max(
      (prev.crop.height + curr.crop.height) / 2,
      MIN_CROP_HEIGHT_PX
    );
    if (jump > scale * ABNORMAL_JUMP_CROP_HEIGHT_RATIO) {
      abnormalCount += 1;
    }
  }

  return abnormalCount / (frames.length - 1);
}

/**
 * トラッキング済みフレーム列から品質シグナルを抽出する。
 * groundContact.ts の detectJumpEvents を独自に呼び出すため、
 * analysis/skills/spikeJump.ts 側の計算とは独立している
 * （既存の分析ロジックには一切手を入れない）。
 */
export function deriveQualitySignalsFromFrames(frames: TrackedFrame[]): ConfidenceQualitySignals {
  const events = detectJumpEvents(frames);

  const interpolatedRatio = events ? events.interpolatedRatio : null;
  const lowConfidenceFrameRatio = events
    ? ratioOrNull(events.lowConfidenceFrames.size, frames.length)
    : null;

  const trackedFramesWithQuality = frames.filter((f) => f.trackingQuality);
  const averageTrackerMatchScore =
    trackedFramesWithQuality.length > 0
      ? trackedFramesWithQuality.reduce((sum, f) => sum + (f.trackingQuality?.matchScore ?? 0), 0) /
        trackedFramesWithQuality.length
      : null;
  const coastingFrameRatio =
    trackedFramesWithQuality.length > 0
      ? ratioOrNull(
          trackedFramesWithQuality.filter((f) => f.trackingQuality?.isCoasting).length,
          trackedFramesWithQuality.length
        )
      : null;

  const framesWithLaterality = frames.filter((f) => f.lateralityCorrection);
  const correctedFrames = framesWithLaterality.filter((f) => f.lateralityCorrection?.corrected);
  const lateralityCorrectionRatio =
    framesWithLaterality.length > 0
      ? ratioOrNull(correctedFrames.length, framesWithLaterality.length)
      : null;
  const averageLateralityCorrectionConfidence =
    correctedFrames.length > 0
      ? correctedFrames.reduce((sum, f) => sum + (f.lateralityCorrection?.confidence ?? 0), 0) /
        correctedFrames.length
      : null;

  return {
    interpolatedRatio,
    lowConfidenceFrameRatio,
    averageTrackerMatchScore,
    coastingFrameRatio,
    lateralityCorrectionRatio,
    averageLateralityCorrectionConfidence,
    abnormalJumpRatio: computeAbnormalJumpRatio(frames),
  };
}
