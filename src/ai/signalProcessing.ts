// =============================================================
// 解析用の信号処理共通ユーティリティ。
// - Visibilityが低い骨格点の除外（ゲーティング）
// - 欠測（null）の線形補間
// - 移動平均・速度・加速度
// フェーズ検出（jumpPhaseEngine / groundContact）から利用される。
// =============================================================

import type { TrackedFrame, TrackedLandmark } from "./poseTypes";

/** これ未満のvisibilityの骨格点は解析から除外し、補間対象とする */
export const ANALYSIS_MIN_VISIBILITY = 0.5;

export function isReliableLandmark(
  point: TrackedLandmark | undefined
): point is TrackedLandmark {
  return !!point && (point.visibility ?? 1) >= ANALYSIS_MIN_VISIBILITY;
}

/**
 * 指定インデックスの骨格点のうち、visibilityが十分な点のY平均を返す。
 * 全滅ならnull（呼び出し側で補間する）。
 */
export function reliableAverageY(
  frame: TrackedFrame,
  landmarkIndexes: number[]
): number | null {
  const values: number[] = [];

  for (const index of landmarkIndexes) {
    const point = frame.landmarks[index];
    if (isReliableLandmark(point)) values.push(point.y);
  }

  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/** 同上のX平均 */
export function reliableAverageX(
  frame: TrackedFrame,
  landmarkIndexes: number[]
): number | null {
  const values: number[] = [];

  for (const index of landmarkIndexes) {
    const point = frame.landmarks[index];
    if (isReliableLandmark(point)) values.push(point.x);
  }

  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/**
 * null（欠測）区間を前後の有効値から線形補間する。
 * 先頭・末尾の欠測は最近傍の有効値で埋める。全滅ならnullのまま返す。
 */
export function interpolateNulls(
  values: Array<number | null>
): Array<number | null> {
  const result = [...values];
  const firstValid = result.findIndex((v) => v !== null);

  if (firstValid === -1) return result;

  // 先頭の欠測を埋める
  for (let i = 0; i < firstValid; i += 1) {
    result[i] = result[firstValid];
  }

  let lastValidIndex = firstValid;

  for (let i = firstValid + 1; i < result.length; i += 1) {
    const value = result[i];
    if (value === null) continue;

    const gap = i - lastValidIndex;
    if (gap > 1) {
      const startValue = result[lastValidIndex] as number;
      const step = (value - startValue) / gap;
      for (let j = 1; j < gap; j += 1) {
        result[lastValidIndex + j] = startValue + step * j;
      }
    }
    lastValidIndex = i;
  }

  // 末尾の欠測を埋める
  for (let i = lastValidIndex + 1; i < result.length; i += 1) {
    result[i] = result[lastValidIndex];
  }

  return result;
}

/** 中心移動平均（null安全）。欠測は補間後に呼ぶこと */
export function movingAverage(
  values: Array<number | null>,
  windowSize = 5
): Array<number | null> {
  const half = Math.floor(windowSize / 2);

  return values.map((_, index) => {
    const start = Math.max(0, index - half);
    const end = Math.min(values.length, index + half + 1);

    const window = values
      .slice(start, end)
      .filter((v): v is number => v !== null && Number.isFinite(v));

    if (window.length === 0) return null;
    return window.reduce((sum, v) => sum + v, 0) / window.length;
  });
}

/** 中心差分による速度（単位: 値/秒）。端は片側差分 */
export function differentiate(
  values: Array<number | null>,
  times: number[]
): Array<number | null> {
  return values.map((value, i) => {
    if (value === null) return null;

    const prevIndex = Math.max(0, i - 1);
    const nextIndex = Math.min(values.length - 1, i + 1);

    const prev = values[prevIndex];
    const next = values[nextIndex];
    if (prev === null || next === null) return null;

    const dt = times[nextIndex] - times[prevIndex];
    if (dt <= 0) return null;

    return (next - prev) / dt;
  });
}

/** 中央値（空配列はnull） */
export function medianOf(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

/** 分位点（0〜1）。空配列はnull */
export function quantileOf(values: number[], q: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const pos = Math.min(sorted.length - 1, Math.max(0, (sorted.length - 1) * q));
  const base = Math.floor(pos);
  const rest = pos - base;
  if (base + 1 < sorted.length) {
    return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
  }
  return sorted[base];
}

/** 標準偏差（有効値が2未満ならnull） */
export function stdDevOf(values: Array<number | null>): number | null {
  const valid = values.filter((v): v is number => v !== null && Number.isFinite(v));
  if (valid.length < 2) return null;

  const mean = valid.reduce((sum, v) => sum + v, 0) / valid.length;
  const variance =
    valid.reduce((sum, v) => sum + (v - mean) * (v - mean), 0) / valid.length;

  return Math.sqrt(variance);
}

/** フレームの主要骨格点の平均visibilityが低い（解析除外対象）か */
export function isLowConfidenceFrame(
  frame: TrackedFrame,
  landmarkIndexes: number[]
): boolean {
  const points = landmarkIndexes
    .map((index) => frame.landmarks[index])
    .filter((p): p is TrackedLandmark => Boolean(p));

  if (points.length === 0) return true;

  const avg =
    points.reduce((sum, p) => sum + (p.visibility ?? 1), 0) / points.length;

  return avg < ANALYSIS_MIN_VISIBILITY;
}
