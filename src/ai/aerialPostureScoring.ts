// =============================================================
// 空中姿勢（airPosture）評価の純粋なスコア計算・方向反転検出。
// spikeFormEvaluation.ts から分離した、React/DOM/フレーム列に依存しない
// 純粋関数群。呼び出し順序・境界値・比較演算子は分離前の実装と
// 完全に同一（数値的に等価）であることを前提とする。
//
// ALIGNMENT_FAIR_MAX / ANGLE_IDEAL_DEG / ANGLE_FAIR_TOLERANCE_DEG /
// WOBBLE_SCORE_BY_REVERSAL_COUNT は、このファイル内のスコア計算だけでなく
// spikeFormEvaluation.ts の metricDefinitions（測定項目の目標値定義）からも
// 同じ値が参照されるため、値の重複（将来のズレ）を避けるためにエクスポートする。
// ただし分離前は非公開の内部定数だったため、spikeFormEvaluation.ts側では
// 再エクスポートしない（importして内部利用のみ）。
// =============================================================

import { clamp } from "./poseMath";

/** スコア(0〜100)から星評価への変換結果。空中姿勢スコアの表示に使う */
export type StarRating = 1 | 2 | 3 | 4 | 5;

/**
 * 「余計な動き（揺り戻し）」＝体幹軸・左右足先それぞれの方向反転回数を
 * カウントする際のノイズ除去フィルタ。MediaPipeの1フレーム単位のブレを
 * 反転として誤検出しないための閾値をここへ集約する。
 */
export const WOBBLE_SMOOTHING_WINDOW = 3; // 移動平均ウィンドウ（フレーム数）
export const WOBBLE_MIN_FRAME_GAP = 2; // 反転とみなす、直前の反転からの最低継続フレーム数
export const TRUNK_WOBBLE_MIN_AMPLITUDE_DEG = 3; // 体幹の反転とみなす最小振れ幅（度）
export const FOOT_WOBBLE_MIN_AMPLITUDE_RATIO = 0.03; // 足の反転とみなす最小振れ幅（体幹長比）

/** 反転回数（0, 1, 2, 3, 4以上）ごとのスコア。回数が多いほど下げる */
export const WOBBLE_SCORE_BY_REVERSAL_COUNT = [100, 80, 55, 30, 10] as const;

/** 空中姿勢スコアの内訳比率（一直線性45% + 45°評価35% + 揺り戻し20%） */
export const AERIAL_ALIGNMENT_WEIGHT = 0.45;
export const AERIAL_ANGLE_WEIGHT = 0.35;
export const AERIAL_EXTRA_MOTION_WEIGHT = 0.2;

/** 一直線性（正規化した垂直距離）の評価バンド境界。仮の評価基準を定数化したもの */
const ALIGNMENT_EXCELLENT_MAX = 0.04;
const ALIGNMENT_GOOD_MAX = 0.08;
/** metricDefinitionsのaerialLineAlignmentのtoleranceとしても参照されるため公開する */
export const ALIGNMENT_FAIR_MAX = 0.13;
const ALIGNMENT_POOR_SPAN = 0.09;

/** 45°評価：ネット水平基準に対する理想角度と許容偏差バンド（度）。40〜50°を必ず理想（>=90点）に含める */
/** metricDefinitionsのaerialLineAngleのidealおよびdescribeAerialAngleからも参照されるため公開する */
export const ANGLE_IDEAL_DEG = 45;
const ANGLE_IDEAL_TOLERANCE_DEG = 5;
const ANGLE_GOOD_TOLERANCE_DEG = 10;
/** metricDefinitionsのaerialLineAngleのtoleranceとしても参照されるため公開する */
export const ANGLE_FAIR_TOLERANCE_DEG = 20;
const ANGLE_POOR_SPAN_DEG = 20;

/** スコア(0〜100)→星評価(1〜5)への変換しきい値。空中姿勢の星表示はここだけで決める */
const STAR_SCORE_THRESHOLDS: Record<Exclude<StarRating, 1>, number> = {
  5: 90,
  4: 75,
  3: 60,
  2: 40,
};

/**
 * スコア(0〜100)を星評価(1〜5)へ変換する唯一の関数。
 * アプリ内の他の星評価（analysis/evaluation.ts）とは独立した空中姿勢専用の変換で、
 * 呼び出し側はこの関数の戻り値だけを画面に表示すること（別のscore/ratingを混在させない）。
 */
export function scoreToStars(score: number): StarRating {
  if (score >= STAR_SCORE_THRESHOLDS[5]) return 5;
  if (score >= STAR_SCORE_THRESHOLDS[4]) return 4;
  if (score >= STAR_SCORE_THRESHOLDS[3]) return 3;
  if (score >= STAR_SCORE_THRESHOLDS[2]) return 2;
  return 1;
}

type TurningPoint = { index: number; value: number; type: "peak" | "trough" };

/**
 * 平滑化済みの系列から「短時間の方向反転（揺り戻し）」の回数を数える。
 * 一定方向への変化（単調増加・単調減少）は反転として数えない。
 *
 * フィルタは2段階：
 *  1) 同じ種類（山どうし／谷どうし）の転換点が minFrameGap 未満の間隔で連続する場合は
 *     1回のブレとみなして、より極端な値の方だけを残す（MediaPipeの単発ジッター対策）。
 *  2) 山→谷／谷→山のように種類が交互に切り替わる転換点は、直前に採用した転換点との
 *     振れ幅が minAmplitude 未満なら小さすぎるブレとして無視する。
 * これにより「5→15→2→18→6」のような連続フレームでの乱高下は正しく複数回の反転として
 * 検出しつつ、1フレームだけの微小なブレはノイズとして無視できる。
 */
export function countDirectionReversals(
  smoothedSeries: number[],
  minAmplitude: number,
  minFrameGap: number
): number {
  if (smoothedSeries.length < 3) return 0;

  // 1. 隣接3点の大小関係から極大・極小の候補（＝方向転換点）を抽出する
  const candidates: TurningPoint[] = [];
  for (let i = 1; i < smoothedSeries.length - 1; i += 1) {
    const prev = smoothedSeries[i - 1];
    const curr = smoothedSeries[i];
    const next = smoothedSeries[i + 1];
    if (curr >= prev && curr >= next && (curr > prev || curr > next)) {
      candidates.push({ index: i, value: curr, type: "peak" });
    } else if (curr <= prev && curr <= next && (curr < prev || curr < next)) {
      candidates.push({ index: i, value: curr, type: "trough" });
    }
  }
  if (candidates.length === 0) return 0;

  // 2. 同じ種類の転換点がminFrameGap未満で連続する場合は、より極端な値へ統合する
  const merged: TurningPoint[] = [];
  for (const candidate of candidates) {
    const last = merged[merged.length - 1];
    if (last && last.type === candidate.type && candidate.index - last.index < minFrameGap) {
      const moreExtreme =
        candidate.type === "peak" ? candidate.value > last.value : candidate.value < last.value;
      if (moreExtreme) merged[merged.length - 1] = candidate;
      continue;
    }
    merged.push(candidate);
  }

  // 3. 種類が交互に切り替わる転換点どうしの振れ幅がminAmplitude未満なら無視する
  const accepted: TurningPoint[] = [merged[0]];
  for (let i = 1; i < merged.length; i += 1) {
    const last = accepted[accepted.length - 1];
    const candidate = merged[i];
    if (Math.abs(candidate.value - last.value) >= minAmplitude) {
      accepted.push(candidate);
    }
  }

  // 転換点がN個 → 方向反転はN-1回（開始点は反転ではなく基準点のため）
  return Math.max(0, accepted.length - 1);
}

/** 一直線性（0が理想、大きいほど崩れている）を0〜100へ区分線形変換する */
export function scoreAerialAlignment(value: number): number {
  if (value <= ALIGNMENT_EXCELLENT_MAX) {
    return 100 - (value / ALIGNMENT_EXCELLENT_MAX) * 10;
  }
  if (value <= ALIGNMENT_GOOD_MAX) {
    const t = (value - ALIGNMENT_EXCELLENT_MAX) / (ALIGNMENT_GOOD_MAX - ALIGNMENT_EXCELLENT_MAX);
    return 90 - t * 20;
  }
  if (value <= ALIGNMENT_FAIR_MAX) {
    const t = (value - ALIGNMENT_GOOD_MAX) / (ALIGNMENT_FAIR_MAX - ALIGNMENT_GOOD_MAX);
    return 70 - t * 25;
  }
  const t = clamp((value - ALIGNMENT_FAIR_MAX) / ALIGNMENT_POOR_SPAN, 0, 1);
  return 45 - t * 45;
}

/**
 * 45°からの偏差を0〜100へ区分線形変換する。
 * 40°・50°は境界値として必ず理想帯（deviation<=5 → 90点以上）に含まれる（<=を使用）。
 */
export function scoreAerialAngle(normalizedAngleDeg: number): number {
  const deviation = Math.abs(normalizedAngleDeg - ANGLE_IDEAL_DEG);
  if (deviation <= ANGLE_IDEAL_TOLERANCE_DEG) {
    const t = deviation / ANGLE_IDEAL_TOLERANCE_DEG;
    return 100 - t * 10;
  }
  if (deviation <= ANGLE_GOOD_TOLERANCE_DEG) {
    const t = (deviation - ANGLE_IDEAL_TOLERANCE_DEG) / (ANGLE_GOOD_TOLERANCE_DEG - ANGLE_IDEAL_TOLERANCE_DEG);
    return 90 - t * 20;
  }
  if (deviation <= ANGLE_FAIR_TOLERANCE_DEG) {
    const t = (deviation - ANGLE_GOOD_TOLERANCE_DEG) / (ANGLE_FAIR_TOLERANCE_DEG - ANGLE_GOOD_TOLERANCE_DEG);
    return 70 - t * 30;
  }
  const t = clamp((deviation - ANGLE_FAIR_TOLERANCE_DEG) / ANGLE_POOR_SPAN_DEG, 0, 1);
  return 40 - t * 40;
}

/** 反転回数（0〜4以上）を0〜100へ変換する。回数が多いほど下げる */
export function scoreExtraMotion(reversalCount: number): number {
  const index = clamp(Math.round(reversalCount), 0, WOBBLE_SCORE_BY_REVERSAL_COUNT.length - 1);
  return WOBBLE_SCORE_BY_REVERSAL_COUNT[index];
}
