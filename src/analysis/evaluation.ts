// =============================================================
// 競技評価モジュール。
// 1) 特徴量（数値）→ ★1〜5 + 改善コメント への変換
// 2) 身長・指高を使ったcm換算（推定ジャンプ高・最高到達点・
//    沈み込み深さ・水平移動）
//
// しきい値はバレーボールのスパイクジャンプを想定した目安であり、
// カメラ画角・骨格推定誤差の影響を受けるため「傾向の評価」として使う。
// =============================================================

import type { TrackedFrame } from "../ai/poseAnalyzer";
import type { JumpEvents } from "../ai/groundContact";
import type { Feature } from "./types";

export type StarRating = 1 | 2 | 3 | 4 | 5;

export type FeatureEvaluation = {
  stars: StarRating;
  starsText: string;
  comment: string;
};

const NOSE = 0;

/** 「小さいほど良い」指標：値が閾値の何番目に収まるかで★を決める */
function starsLowerIsBetter(
  value: number,
  thresholds: [number, number, number, number]
): StarRating {
  if (value <= thresholds[0]) return 5;
  if (value <= thresholds[1]) return 4;
  if (value <= thresholds[2]) return 3;
  if (value <= thresholds[3]) return 2;
  return 1;
}

/** 「大きいほど良い」指標 */
function starsHigherIsBetter(
  value: number,
  thresholds: [number, number, number, number]
): StarRating {
  if (value >= thresholds[0]) return 5;
  if (value >= thresholds[1]) return 4;
  if (value >= thresholds[2]) return 3;
  if (value >= thresholds[3]) return 2;
  return 1;
}

/** 「範囲内が良い」指標：中心からのズレで評価 */
function starsInRange(
  value: number,
  center: number,
  tolerances: [number, number, number, number]
): StarRating {
  const diff = Math.abs(value - center);
  return starsLowerIsBetter(diff, tolerances);
}

function starsText(stars: StarRating): string {
  return "★".repeat(stars) + "☆".repeat(5 - stars);
}

function build(stars: StarRating, comment: string): FeatureEvaluation {
  return { stars, starsText: starsText(stars), comment };
}

/**
 * 特徴量を★評価+コメントへ変換する。
 * 未対応のkeyはnull（数値のみ表示）。
 */
export function evaluateFeature(feature: Feature): FeatureEvaluation | null {
  const v = feature.value;

  switch (feature.key) {
    case "takeoff.kneeMinAngle": {
      // スパイクの沈み込みは膝約90〜110°が目安。深すぎ・浅すぎ両方減点
      const stars = starsInRange(v, 100, [15, 25, 35, 50]);
      if (v < 70) return build(stars, "沈み込みが深すぎる可能性があります。切り返しが遅れないか確認してください。");
      if (v <= 115) return build(stars, "十分沈み込めています。");
      if (v <= 135) return build(stars, "やや沈み込みが浅めです。もう少し膝を曲げると力を伝えやすくなります。");
      return build(stars, "沈み込みが浅く、脚の力を使い切れていない可能性があります。");
    }

    case "takeoff.hipMinAngle": {
      const stars = starsInRange(v, 95, [15, 25, 40, 55]);
      if (v <= 120) return build(stars, "股関節をしっかり使えています。");
      return build(stars, "股関節の屈曲が浅めです。お尻を引く意識で沈み込むと改善する可能性があります。");
    }

    case "takeoff.contactTimeSec": {
      // 踏切接地時間：0.25〜0.40秒程度が目安。長すぎると力が逃げる
      const stars = starsLowerIsBetter(v, [0.35, 0.45, 0.6, 0.8]);
      if (v <= 0.35) return build(stars, "素早い踏切ができています。");
      if (v <= 0.6) return build(stars, "踏切がやや長めです。沈み込みから切り返しをより素早く。");
      return build(stars, "踏切に時間がかかっています。助走の勢いを上方向へ素早く変換する練習が有効です。");
    }

    case "takeoff.sinkDurationSec": {
      const stars = starsLowerIsBetter(v, [0.25, 0.35, 0.5, 0.7]);
      if (v <= 0.35) return build(stars, "沈み込みから切り返しまでが速く、伸張反射を使えています。");
      return build(stars, "沈み込みに時間がかかり、反動を活かしきれていない可能性があります。");
    }

    case "takeoff.maxExtensionVelocity": {
      // 膝伸展角速度：400deg/s以上で良好（30fps推定の目安）
      const stars = starsHigherIsBetter(v, [500, 400, 300, 200]);
      if (stars >= 4) return build(stars, "膝の伸展が速く、爆発的に踏み切れています。");
      if (stars === 3) return build(stars, "膝の伸展速度は標準的です。");
      return build(stars, "膝の伸展がゆっくりです。素早く伸び上がる意識やジャンプトレーニングが有効です。");
    }

    case "symmetry.kneeDiff": {
      const stars = starsLowerIsBetter(v, [5, 10, 15, 25]);
      if (stars === 5) return build(stars, "左右対称です。");
      if (stars >= 3) return build(stars, "左右差はわずかです。疲労時に開かないか確認してください。");
      return build(stars, "左右の膝の使い方に差があります。片脚への負担が偏っている可能性があります。");
    }

    case "peak.shoulderTilt": {
      const stars = starsLowerIsBetter(v, [5, 8, 12, 18]);
      if (stars >= 4) return build(stars, "空中で体幹が安定しています。");
      return build(stars, "最高点で肩が傾いています。体幹を締めてまっすぐ跳ぶ意識を持ちましょう。");
    }

    case "air.postureStability": {
      const stars = starsLowerIsBetter(v, [3, 5, 8, 12]);
      if (stars >= 4) return build(stars, "空中姿勢のブレが小さく安定しています。");
      return build(stars, "空中で姿勢が揺れています。踏切時の体幹の締めを意識してください。");
    }

    case "air.timeSec": {
      const stars = starsHigherIsBetter(v, [0.6, 0.5, 0.42, 0.35]);
      if (stars >= 4) return build(stars, "滞空時間が長く、高いジャンプです。");
      if (stars === 3) return build(stars, "標準的な滞空時間です。");
      return build(stars, "滞空時間が短めです。踏切の強化で改善が見込めます。");
    }

    case "contact.wristPeakToBodyPeakTimeDiff": {
      // 打点は身体最高点の直前〜直後（±0.1秒以内）が理想
      const stars = starsInRange(v, 0, [0.05, 0.1, 0.15, 0.25]);
      if (stars >= 4) return build(stars, "最高点付近で打ててタイミングが良好です。");
      if (v > 0) return build(stars, "腕振り開始がやや遅く、下降し始めてから打っています。腕の振り上げを早めましょう。");
      return build(stars, "身体が最高点に達する前に打っています。ジャンプと腕振りの同調を確認してください。");
    }

    case "arm.swingVelocity": {
      // 体幹長/秒。5以上で強い振り上げ
      const stars = starsHigherIsBetter(v, [6, 5, 3.5, 2.5]);
      if (stars >= 4) return build(stars, "腕振りが力強く、ジャンプに貢献しています。");
      return build(stars, "腕の振り上げが弱めです。両腕を大きく速く振り上げるとジャンプ高が伸びます。");
    }

    case "approach.speed": {
      // 体幹長/秒。3以上で十分な助走スピード
      const stars = starsHigherIsBetter(v, [4, 3, 2, 1]);
      if (stars >= 4) return build(stars, "十分な助走スピードがあります。");
      if (stars === 3) return build(stars, "助走スピードは標準的です。");
      return build(stars, "助走がゆっくりです。最後の2歩を大きく速くすると勢いを活かせます。");
    }

    case "landing.impactIndex": {
      // 体幹長/秒。下降速度そのものは高さに比例するため広めに許容
      const stars = starsLowerIsBetter(v, [4.5, 6, 7.5, 9]);
      if (stars >= 4) return build(stars, "着地の衝撃は許容範囲です。");
      return build(stars, "着地衝撃が大きめです。膝と股関節を柔らかく使って吸収してください。");
    }

    case "landing.kneeAbsorption": {
      const stars = starsHigherIsBetter(v, [30, 20, 12, 6]);
      if (stars >= 4) return build(stars, "膝でしっかり衝撃を吸収できています。");
      return build(stars, "着地時の膝の曲げが浅く、衝撃を吸収しきれていない可能性があります。");
    }

    case "air.horizontalDrift": {
      const stars = starsLowerIsBetter(v, [0.3, 0.6, 1.0, 1.5]);
      if (stars >= 4) return build(stars, "空中での流れが小さく、力を上方向へ伝えられています。");
      return build(stars, "空中で横に流れています。踏切で勢いを上方向へ変換しきれていない可能性があります。");
    }

    default:
      return null;
  }
}

// -------------------------------------------------------------
// cm換算（身長・指高ベース）
// -------------------------------------------------------------

export type BodyProfile = {
  heightCm: number | null;
  standingReachCm: number | null;
};

export type CmMetric = {
  label: string;
  valueCm: number;
  note?: string;
};

export type CmMetricsResult = {
  cmPerPx: number | null;
  metrics: CmMetric[];
  note: string;
};

/** 鼻〜足裏の長さは身長の約93%（人体計測の目安） */
const NOSE_TO_SOLE_HEIGHT_RATIO = 0.93;
const FOOT_LANDMARKS = [27, 28, 29, 30, 31, 32];
const GRAVITY = 9.80665;

/**
 * 立ち姿勢フレーム（接地中）から人物のピクセル身長を測り、cm/pxを推定する。
 * キャリブレーションマーカーがない場合のフォールバック。
 */
export function estimateCmPerPxFromHeight(
  frames: TrackedFrame[],
  events: JumpEvents,
  heightCm: number | null
): number | null {
  if (heightCm === null || heightCm <= 0) return null;

  const heights: number[] = [];
  const limit = Math.min(events.sinkStartIndex + 1, frames.length);

  for (let i = 0; i < limit; i += 1) {
    if (!events.grounded[i]) continue;

    const frame = frames[i];
    const nose = frame.landmarks[NOSE];
    if (!nose || (nose.visibility ?? 1) < 0.5) continue;

    let footYMax: number | null = null;
    for (const index of FOOT_LANDMARKS) {
      const point = frame.landmarks[index];
      if (!point || (point.visibility ?? 1) < 0.5) continue;
      if (footYMax === null || point.y > footYMax) footYMax = point.y;
    }
    if (footYMax === null) continue;

    const px = footYMax - nose.y;
    if (px > 0) heights.push(px);
  }

  if (heights.length === 0) return null;

  const sorted = heights.sort((a, b) => a - b);
  const medianPx = sorted[Math.floor(sorted.length / 2)];
  if (medianPx <= 0) return null;

  return (heightCm * NOSE_TO_SOLE_HEIGHT_RATIO) / medianPx;
}

/**
 * 身長・指高と検出イベントから、競技者に意味のあるcm指標を組み立てる。
 */
export function buildCmMetrics(
  frames: TrackedFrame[],
  events: JumpEvents,
  profile: BodyProfile
): CmMetricsResult {
  const cmPerPx = estimateCmPerPxFromHeight(frames, events, profile.heightCm);
  const metrics: CmMetric[] = [];

  // 滞空時間からのジャンプ高（h = g t^2 / 8）：スケール不要で頑健
  let flightJumpCm: number | null = null;
  if (events.airTimeSec !== null) {
    flightJumpCm = ((GRAVITY * events.airTimeSec * events.airTimeSec) / 8) * 100;
    metrics.push({
      label: "推定ジャンプ高（滞空時間法）",
      valueCm: flightJumpCm,
      note: `滞空 ${events.airTimeSec.toFixed(2)}秒 から算出`,
    });
  }

  // 重心変位からのジャンプ高（身長スケール）
  let comJumpCm: number | null = null;
  if (cmPerPx !== null) {
    comJumpCm = events.risePx * cmPerPx;
    metrics.push({
      label: "推定ジャンプ高（重心変位法）",
      valueCm: comJumpCm,
      note: "身長からのスケール推定に基づく",
    });
  }

  // 最高到達点 = 指高 + ジャンプ高（滞空時間法を優先）
  const jumpForReach = flightJumpCm ?? comJumpCm;
  if (profile.standingReachCm !== null && jumpForReach !== null) {
    metrics.push({
      label: "推定最高到達点",
      valueCm: profile.standingReachCm + jumpForReach,
      note: `指高 ${profile.standingReachCm}cm + ジャンプ高`,
    });
  }

  if (cmPerPx !== null) {
    metrics.push({
      label: "沈み込み深さ",
      valueCm: events.sinkPx * cmPerPx,
    });

    const horizontalPx = Math.abs(
      events.comX[events.landingIndex] - events.comX[events.sinkStartIndex]
    );
    metrics.push({
      label: "水平移動（踏切→着地）",
      valueCm: horizontalPx * cmPerPx,
    });
  }

  const note =
    cmPerPx !== null
      ? "身長と骨格推定からcm換算した推定値です。カメラ画角・奥行きの影響を受けます。"
      : "身長が未入力または立ち姿勢を検出できないため、一部のcm換算を表示できません。";

  return { cmPerPx, metrics, note };
}
