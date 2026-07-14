// =============================================================
// 角度・ベクトル・距離などの純粋な数学処理。
// DOMや動画には依存しない（動画操作は poseVideo.ts）。
// =============================================================

import type { Point2D } from "./poseTypes";

const RADIANS_TO_DEGREES = 180 / Math.PI;

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function distance(a: Point2D, b: Point2D): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** 大小比較だけが目的の場合はsqrtを省いたこちらを使う */
export function distanceSquared(a: Point2D, b: Point2D): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

export function averagePoint(points: Point2D[]): Point2D | null {
  if (points.length === 0) {
    return null;
  }

  return {
    x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
    y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
  };
}

/** 3点a-b-cのなす角（deg）。bが頂点 */
export function calculateAngle(a: Point2D, b: Point2D, c: Point2D): number {
  const ab = { x: a.x - b.x, y: a.y - b.y };
  const cb = { x: c.x - b.x, y: c.y - b.y };

  const dot = ab.x * cb.x + ab.y * cb.y;
  const abLength = Math.hypot(ab.x, ab.y);
  const cbLength = Math.hypot(cb.x, cb.y);

  if (abLength === 0 || cbLength === 0) {
    return 0;
  }

  const safeCos = clamp(dot / (abLength * cbLength), -1, 1);

  return Math.acos(safeCos) * RADIANS_TO_DEGREES;
}

/** いずれかの点が欠けている場合はnullを返す角度計算 */
export function angleOrNull(
  a: Point2D | undefined,
  b: Point2D | undefined,
  c: Point2D | undefined
): number | null {
  if (!a || !b || !c) {
    return null;
  }

  return calculateAngle(a, b, c);
}

/** fromからtoへの傾き（deg）。肩の傾きなどに使う */
export function calculateTiltDegrees(from: Point2D, to: Point2D): number {
  return Math.atan2(to.y - from.y, to.x - from.x) * RADIANS_TO_DEGREES;
}

/**
 * 2点を結ぶ直線と「基準線」がなす角度を、0〜90°へ正規化して返す。
 * referenceDeg は基準線の画面水平に対する傾き（deg）。省略時は画面水平（0°）。
 * ネットの上端など、画面水平と一致しない基準を使いたい場合はここへ渡す。
 * MediaPipeはY座標が下方向へ増加する座標系のため、Math.atan2(dy, dx) で
 * 得られる角度をそのまま使わず、鋭角（0〜90°）へ畳み込む。
 * 左右反転（利き手やカメラの向き）や上下反転の影響を受けない。
 */
export function calculateLineAngleFromReference(from: Point2D, to: Point2D, referenceDeg = 0): number {
  const deltaX = to.x - from.x;
  const deltaY = to.y - from.y;
  const radians = Math.atan2(deltaY, deltaX);
  const degrees = Math.abs(radians * RADIANS_TO_DEGREES - referenceDeg);
  return degrees > 90 ? 180 - degrees : degrees;
}

/** 画面水平（0°）を基準とする従来版。calculateLineAngleFromReferenceの薄いラッパー */
export function calculateLineAngleFromHorizontal(from: Point2D, to: Point2D): number {
  return calculateLineAngleFromReference(from, to);
}

/**
 * 単純移動平均。MediaPipeの1フレーム単位の微小な座標ブレを吸収するために使う。
 * 端では利用可能な範囲だけでウィンドウを縮めて計算する（対称ウィンドウ）。
 */
export function movingAverage(values: number[], windowSize: number): number[] {
  if (windowSize <= 1 || values.length === 0) return values;

  const half = Math.floor(windowSize / 2);
  return values.map((_, i) => {
    const start = Math.max(0, i - half);
    const end = Math.min(values.length, i + half + 1);
    const slice = values.slice(start, end);
    return slice.reduce((sum, v) => sum + v, 0) / slice.length;
  });
}