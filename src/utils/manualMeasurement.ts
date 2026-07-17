// =============================================================
// 手動計測（マーカー・離地/着地時刻・コマ送り・座標変換）のための
// テスト可能な純粋関数。Reactに依存しない。
// 既存の計算式（jumpCalculator / speedCalculator / ANALYSIS_SPEC.md）は
// ここでは変更せず、useManualMeasurement フックが別途呼び出す。
// =============================================================
import type { MarkerTarget, Markers } from "../types/measurement";
import type { Point } from "../types/point";

export const INITIAL_MARKERS: Markers = {
  calibA: null,
  calibB: null,
  ring: null,
  finger: null,
  ballA: null,
  ballB: null,
};

export type MeasurementLabel = "takeoff" | "landing";

export type TimeFrame = { time: number; frame: number } | null;

export type ManualMeasurementData = {
  markers: Markers;
  takeoff: TimeFrame;
  landing: TimeFrame;
};

export const INITIAL_MANUAL_MEASUREMENT_DATA: ManualMeasurementData = {
  markers: INITIAL_MARKERS,
  takeoff: null,
  landing: null,
};

export function placeMarker(
  data: ManualMeasurementData,
  target: MarkerTarget,
  point: Point
): ManualMeasurementData {
  return { ...data, markers: { ...data.markers, [target]: point } };
}

export function clearMarker(
  data: ManualMeasurementData,
  target: MarkerTarget
): ManualMeasurementData {
  return { ...data, markers: { ...data.markers, [target]: null } };
}

export function saveMeasurementTime(
  data: ManualMeasurementData,
  label: MeasurementLabel,
  time: number,
  frame: number
): ManualMeasurementData {
  if (label === "takeoff") {
    return { ...data, takeoff: { time, frame } };
  }
  return { ...data, landing: { time, frame } };
}

/** マーカー・離地・着地だけを初期状態に戻す（タップ対象は含まない） */
export function resetManualMeasurementData(): ManualMeasurementData {
  return INITIAL_MANUAL_MEASUREMENT_DATA;
}

// --- 派生値の計算式（旧 JumpAnalyzer.tsx のインライン式をそのまま移設） ---

export function computeAirTimeSec(
  takeoffTime: number | null,
  landingTime: number | null
): number | null {
  if (takeoffTime === null || landingTime === null) return null;
  const diff = Math.abs(landingTime - takeoffTime);
  return diff > 0 ? diff : null;
}

export function computeAirFrameCount(
  takeoffFrame: number | null,
  landingFrame: number | null
): number | null {
  if (takeoffFrame === null || landingFrame === null) return null;
  const diff = Math.abs(landingFrame - takeoffFrame);
  return diff > 0 ? diff : null;
}

export function computeEstimatedJumpHeightCm(
  airTimeSec: number | null
): number | null {
  if (!airTimeSec) return null;
  return ((9.81 * airTimeSec * airTimeSec) / 8) * 100;
}

// --- 動画座標変換（表示座標 → 動画の自然座標） ---

export type DisplayRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type NaturalSize = {
  width: number;
  height: number;
};

export function toNaturalPoint(
  clientPoint: Point,
  displayRect: DisplayRect,
  naturalSize: NaturalSize
): Point {
  return {
    x: ((clientPoint.x - displayRect.left) / displayRect.width) * naturalSize.width,
    y: ((clientPoint.y - displayRect.top) / displayRect.height) * naturalSize.height,
  };
}

// --- コマ送り時刻計算 ---

export type SteppedTimeParams = {
  currentTime: number;
  duration: number;
  fps: number;
  direction: -1 | 1;
};

/**
 * -1F/+1F後の時刻を [0, duration] へクランプして返す。
 * fpsが非有限・0以下の場合は時刻を変化させず、現在時刻をクランプしたものを返す
 * （NaN/Infinityを生成しないため）。
 */
export function computeSteppedTime({
  currentTime,
  duration,
  fps,
  direction,
}: SteppedTimeParams): number {
  const safeCurrentTime = Number.isFinite(currentTime) ? currentTime : 0;
  const safeDuration = Number.isFinite(duration) ? duration : 0;

  if (!Number.isFinite(fps) || fps <= 0) {
    return Math.max(0, Math.min(safeDuration, safeCurrentTime));
  }

  const nextTime = safeCurrentTime + direction / fps;
  return Math.max(0, Math.min(safeDuration, nextTime));
}
