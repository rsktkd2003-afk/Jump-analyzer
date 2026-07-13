import type { TrackedFrame, TrackedLandmark } from "./trackingAnalyzer";
import {
  findEnginePhase,
  runJumpPhaseEngine,
  type EnginePhaseName,
} from "./jumpPhaseEngine";
import {
  calculateAngle,
  calculateLineAngleFromHorizontal,
  calculateTiltDegrees,
  clamp,
  distance,
} from "./poseMath";

export type SpikeArmForm = "straightArm" | "bowAndArrow" | "circularArm";

/** スコア(0〜100)から星評価への変換結果。空中姿勢スコアの表示に使う */
export type StarRating = 1 | 2 | 3 | 4 | 5;

export type EvaluationCategoryId =
  | "approach"
  | "takeoff"
  | "flight"
  | "takeback"
  | "hit"
  | "airPosture"
  | "followThrough"
  | "landing"
  | "efficiency";

export type EvaluationMetric = {
  id: string;
  label: string;
  category: EvaluationCategoryId;
  value: number | null;
  unit: "deg" | "ms" | "px" | "ratio" | "pxPerSec" | "index";
  score: number | null;
  weight: number;
  confidence: number;
  description: string;
};

export type EvaluationCategory = {
  id: EvaluationCategoryId;
  label: string;
  score: number | null;
  weight: number;
  metrics: EvaluationMetric[];
};

export type SpikeFormEvaluationResult = {
  selectedForm: SpikeArmForm;
  selectedFormLabel: string;
  overallScore: number | null;
  confidence: number;
  categories: EvaluationCategory[];
  priorityMetrics: EvaluationMetric[];
  note: string;
  /** 空中姿勢カテゴリのスコア（airPostureカテゴリのscoreと同一の値。二重計算はしない） */
  aerialPostureScore: number | null;
  /** 空中姿勢スコアを星評価へ変換したもの。画面の星表示は必ずこの値を参照する */
  aerialPostureStars: StarRating | null;
};

type Target = {
  ideal: number;
  tolerance: number;
  direction?: "higher" | "lower" | "range";
};

type MetricDefinition = {
  id: string;
  label: string;
  category: EvaluationCategoryId;
  unit: EvaluationMetric["unit"];
  weight: number;
  phase: EnginePhaseName;
  description: string;
  targetByForm: Record<SpikeArmForm, Target>;
  measure: (ctx: EvaluationContext) => number | null;
  /** 未指定時は標準の scoreValue（ideal/tolerance/directionベース）を使う */
  score?: (value: number, target: Target) => number;
  /** 判定理由を値に応じて動的に生成する。未指定時は静的な description を使う */
  describe?: (value: number, score: number) => string;
};

type EvaluationContext = {
  frames: TrackedFrame[];
  engine: NonNullable<ReturnType<typeof runJumpPhaseEngine>>;
  bodyScale: number;
  fps: number;
};

const FORM_LABELS: Record<SpikeArmForm, string> = {
  straightArm: "ストレートアーム",
  bowAndArrow: "ボーアンドアロー",
  circularArm: "サーキュラーアーム",
};

const CATEGORY_LABELS: Record<EvaluationCategoryId, string> = {
  approach: "助走",
  takeoff: "踏切",
  flight: "ジャンプ",
  takeback: "テイクバック",
  hit: "打撃",
  airPosture: "空中姿勢",
  followThrough: "フォロースルー",
  landing: "着地",
  efficiency: "ジャンプ効率",
};

const CATEGORY_WEIGHTS: Record<EvaluationCategoryId, number> = {
  approach: 1.0,
  takeoff: 1.25,
  flight: 1.0,
  takeback: 1.05,
  hit: 1.25,
  airPosture: 0.9,
  followThrough: 0.65,
  landing: 0.85,
  efficiency: 1.1,
};

const L = {
  leftEar: 7,
  rightEar: 8,
  leftShoulder: 11,
  rightShoulder: 12,
  leftElbow: 13,
  rightElbow: 14,
  leftWrist: 15,
  rightWrist: 16,
  leftHip: 23,
  rightHip: 24,
  leftKnee: 25,
  rightKnee: 26,
  leftAnkle: 27,
  rightAnkle: 28,
  leftHeel: 29,
  rightHeel: 30,
  leftFoot: 31,
  rightFoot: 32,
} as const;

const MIN_VISIBILITY = 0.35;

function visible(point: TrackedLandmark | undefined): point is TrackedLandmark {
  return !!point && (point.visibility ?? 1) >= MIN_VISIBILITY;
}

function landmark(frame: TrackedFrame, index: number): TrackedLandmark | null {
  const point = frame.landmarks[index];
  return visible(point) ? point : null;
}

function midpoint(a: TrackedLandmark | null, b: TrackedLandmark | null) {
  if (!a || !b) return null;
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function hipCenter(frame: TrackedFrame) {
  return midpoint(landmark(frame, L.leftHip), landmark(frame, L.rightHip));
}

function shoulderCenter(frame: TrackedFrame) {
  return midpoint(landmark(frame, L.leftShoulder), landmark(frame, L.rightShoulder));
}

function ankleCenter(frame: TrackedFrame) {
  return midpoint(landmark(frame, L.leftAnkle), landmark(frame, L.rightAnkle));
}

function headCenter(frame: TrackedFrame) {
  return midpoint(landmark(frame, L.leftEar), landmark(frame, L.rightEar)) ?? shoulderCenter(frame);
}

function bodyScale(frame: TrackedFrame): number | null {
  const shoulder = shoulderCenter(frame);
  const hip = hipCenter(frame);
  if (!shoulder || !hip) return null;
  return Math.max(1, distance(shoulder, hip));
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function avg(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function framesOf(ctx: EvaluationContext, phase: EnginePhaseName): TrackedFrame[] {
  const p = findEnginePhase(ctx.engine, phase);
  if (!p) return [];
  return ctx.frames.slice(p.startIndex, p.endIndex + 1);
}

function eventFrame(ctx: EvaluationContext, key: "takeoffIndex" | "peakIndex" | "landingIndex" | "landingEndIndex") {
  return ctx.frames[ctx.engine.events[key]] ?? null;
}

function horizontalSpeed(start: TrackedFrame, end: TrackedFrame): number | null {
  const dt = end.time - start.time;
  if (dt <= 0) return null;
  return Math.abs(end.centerX - start.centerX) / dt;
}

function velocity(from: TrackedFrame, to: TrackedFrame) {
  const dt = to.time - from.time;
  if (dt <= 0) return null;
  return { x: (to.centerX - from.centerX) / dt, y: (to.centerY - from.centerY) / dt };
}

function maxBy<T>(items: T[], score: (item: T) => number | null): T | null {
  let best: T | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;
  for (const item of items) {
    const s = score(item);
    if (s !== null && s > bestScore) {
      best = item;
      bestScore = s;
    }
  }
  return best;
}

function minBy<T>(items: T[], score: (item: T) => number | null): T | null {
  let best: T | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const item of items) {
    const s = score(item);
    if (s !== null && s < bestScore) {
      best = item;
      bestScore = s;
    }
  }
  return best;
}

function angleAt(frame: TrackedFrame, a: number, b: number, c: number): number | null {
  const pa = landmark(frame, a);
  const pb = landmark(frame, b);
  const pc = landmark(frame, c);
  if (!pa || !pb || !pc) return null;
  return calculateAngle(pa, pb, pc);
}

function lineTilt(frame: TrackedFrame, a: number, b: number): number | null {
  const pa = landmark(frame, a);
  const pb = landmark(frame, b);
  if (!pa || !pb) return null;
  return calculateTiltDegrees(pa, pb);
}

function angleDiff(a: number, b: number): number {
  let diff = Math.abs(a - b) % 360;
  if (diff > 180) diff = 360 - diff;
  return diff;
}

function range(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.max(...values) - Math.min(...values);
}

function scoreValue(value: number, target: Target): number {
  const tolerance = Math.max(0.0001, target.tolerance);
  if (target.direction === "higher") {
    return clamp((value / target.ideal) * 100, 0, 100);
  }
  if (target.direction === "lower") {
    return clamp(100 - (Math.max(0, value - target.ideal) / tolerance) * 100, 0, 100);
  }
  return clamp(100 - (Math.abs(value - target.ideal) / tolerance) * 100, 0, 100);
}

function formTargets(base: Target, overrides: Partial<Record<SpikeArmForm, Partial<Target>>> = {}) {
  return {
    straightArm: { ...base, ...overrides.straightArm },
    bowAndArrow: { ...base, ...overrides.bowAndArrow },
    circularArm: { ...base, ...overrides.circularArm },
  } satisfies Record<SpikeArmForm, Target>;
}


function lineDeviationRatio(frames: TrackedFrame[]): number | null {
  if (frames.length < 3) return null;
  const first = frames[0];
  const last = frames[frames.length - 1];
  const dx = last.centerX - first.centerX;
  const dy = last.centerY - first.centerY;
  const len = Math.hypot(dx, dy);
  if (len <= 0) return null;
  const deviations = frames.map((f) => Math.abs(dy * f.centerX - dx * f.centerY + last.centerX * first.centerY - last.centerY * first.centerX) / len);
  const value = avg(deviations);
  return value === null ? null : value / len;
}

function wristHeightFrame(ctx: EvaluationContext): TrackedFrame | null {
  return minBy(ctx.frames.slice(ctx.engine.events.takeoffIndex, ctx.engine.events.landingIndex + 1), (f) => {
    const left = landmark(f, L.leftWrist);
    const right = landmark(f, L.rightWrist);
    const y = Math.min(left?.y ?? Number.POSITIVE_INFINITY, right?.y ?? Number.POSITIVE_INFINITY);
    return Number.isFinite(y) ? y : null;
  });
}

function hittingWrist(frame: TrackedFrame): TrackedLandmark | null {
  const left = landmark(frame, L.leftWrist);
  const right = landmark(frame, L.rightWrist);
  if (!left) return right;
  if (!right) return left;
  return right.y <= left.y ? right : left;
}

function hittingSide(frame: TrackedFrame): "left" | "right" | null {
  const left = landmark(frame, L.leftWrist);
  const right = landmark(frame, L.rightWrist);
  if (!left && !right) return null;
  if (!left) return "right";
  if (!right) return "left";
  return right.y <= left.y ? "right" : "left";
}

function jointForSide(side: "left" | "right") {
  return side === "right"
    ? { shoulder: L.rightShoulder, elbow: L.rightElbow, wrist: L.rightWrist, otherWrist: L.leftWrist }
    : { shoulder: L.leftShoulder, elbow: L.leftElbow, wrist: L.leftWrist, otherWrist: L.rightWrist };
}

function wristSpeeds(ctx: EvaluationContext, index: number): Array<{ frame: TrackedFrame; speed: number }> {
  const values: Array<{ frame: TrackedFrame; speed: number }> = [];
  for (let i = 1; i < ctx.frames.length; i += 1) {
    const a = landmark(ctx.frames[i - 1], index);
    const b = landmark(ctx.frames[i], index);
    const dt = ctx.frames[i].time - ctx.frames[i - 1].time;
    if (!a || !b || dt <= 0) continue;
    values.push({ frame: ctx.frames[i], speed: distance(a, b) / dt });
  }
  return values;
}

// ---------------------------------------------------------------
// 空中姿勢（airPosture）評価専用のヘルパー。
// 「体幹の垂直度」ではなく、最高点付近における
//   1) 「打つ側の肩→反対側の足先」の全身ラインの一直線性（45%）
//   2) そのラインが水平線に対して理想角度45°に近いか（35%）
//   3) 最高点付近で体軸（肩中心-腰中心）の角度がどれだけ安定しているか（20%）
// の3要素だけで評価する。体幹・肩の「絶対的な傾き」自体は減点しない。
// ---------------------------------------------------------------

type Side = "left" | "right";

/** 最高点フレームを中心に、前後どれだけの時間幅を評価対象とするか（秒）。固定フレーム数にしないことでfpsの違いを吸収する */
const AERIAL_POSTURE_WINDOW_SEC = 0.12;
/** これ未満のサンプル数しか取れない場合は低信頼度として評価しない */
const AERIAL_POSTURE_MIN_SAMPLES = 2;

/** 一直線性（正規化した垂直距離）の評価バンド境界。仮の評価基準を定数化したもの */
const ALIGNMENT_EXCELLENT_MAX = 0.04;
const ALIGNMENT_GOOD_MAX = 0.08;
const ALIGNMENT_FAIR_MAX = 0.13;
const ALIGNMENT_POOR_SPAN = 0.09;

/** 45°評価：水平線に対する理想角度と許容偏差バンド（度）。40〜50°を必ず理想（>=90点）に含める */
const ANGLE_IDEAL_DEG = 45;
const ANGLE_IDEAL_TOLERANCE_DEG = 5;
const ANGLE_GOOD_TOLERANCE_DEG = 10;
const ANGLE_FAIR_TOLERANCE_DEG = 20;
const ANGLE_POOR_SPAN_DEG = 20;

/** 体幹安定性：最高点付近の連続フレーム間の体軸角度変化量（中央値, deg）の評価バンド境界 */
const TRUNK_STABILITY_EXCELLENT_MAX_DEG = 4;
const TRUNK_STABILITY_GOOD_MAX_DEG = 8;
const TRUNK_STABILITY_FAIR_MAX_DEG = 13;
const TRUNK_STABILITY_POOR_SPAN_DEG = 15;

/** 空中姿勢スコアの内訳比率（一直線性45% + 45°評価35% + 体幹安定性20%） */
export const AERIAL_ALIGNMENT_WEIGHT = 0.45;
export const AERIAL_ANGLE_WEIGHT = 0.35;
export const AERIAL_TRUNK_STABILITY_WEIGHT = 0.2;

/** コメント切り替えのスコア閾値 */
const AERIAL_GOOD_SCORE = 80;
const AERIAL_POOR_SCORE = 50;

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

/** 利き手（打つ側）に応じた「肩→対角の腰・膝・足先／足首」のランドマーク */
function aerialOppositeLandmarks(side: Side) {
  return side === "right"
    ? { shoulder: L.rightShoulder, hip: L.leftHip, knee: L.leftKnee, footPrimary: L.leftFoot, footFallback: L.leftAnkle }
    : { shoulder: L.leftShoulder, hip: L.rightHip, knee: L.rightKnee, footPrimary: L.rightFoot, footFallback: L.rightAnkle };
}

type AerialLineSample = {
  /** 基準線（肩→対角足先）からの腰・膝の垂直距離の平均を、基準線の長さで正規化した値。小さいほど一直線 */
  alignmentRatio: number;
  /** 基準線と水平線のなす角（0〜90deg）。45が理想 */
  angleDeg: number;
};

/**
 * 区間内で最も高く上がった手首から打つ側を判定する（1フレームのブレに依存しない）。
 * 既存コードに利き手の明示的な入力はないため、この推定値をそのまま利用する。
 */
function dominantHittingSide(frames: TrackedFrame[]): Side | null {
  let best: Side | null = null;
  let bestY = Number.POSITIVE_INFINITY;
  for (const frame of frames) {
    const left = landmark(frame, L.leftWrist);
    const right = landmark(frame, L.rightWrist);
    if (right && right.y < bestY) {
      bestY = right.y;
      best = "right";
    }
    if (left && left.y < bestY) {
      bestY = left.y;
      best = "left";
    }
  }
  return best;
}

/**
 * 最高点フレームを中心に、フレームレートに関わらず一定時間幅（前後 AERIAL_POSTURE_WINDOW_SEC 秒）
 * だけを対象にする。takeoff/landingの範囲外や、助走・テイクバック・フォロースルー後は含まれない。
 * 一直線性・45°評価・体幹安定性の3指標はすべてこの同じウィンドウを使う（評価対象のズレを防ぐ）。
 */
function aerialPostureWindowFrames(ctx: EvaluationContext): TrackedFrame[] {
  const peakFrame = eventFrame(ctx, "peakIndex");
  if (!peakFrame) return [];
  const { takeoffIndex, landingIndex } = ctx.engine.events;
  return ctx.frames.filter(
    (frame, index) =>
      index >= takeoffIndex &&
      index <= landingIndex &&
      Math.abs(frame.time - peakFrame.time) <= AERIAL_POSTURE_WINDOW_SEC
  );
}

/** 1フレーム分の「打つ側肩→反対側足先」ラインに対する一直線性・角度を求める */
function computeAerialLineSample(frame: TrackedFrame, side: Side): AerialLineSample | null {
  const j = aerialOppositeLandmarks(side);
  const shoulder = landmark(frame, j.shoulder);
  const hip = landmark(frame, j.hip);
  const knee = landmark(frame, j.knee);
  // 足先が取得できない場合は同じ側の足首を代替として使う。どちらも無ければ評価しない
  const foot = landmark(frame, j.footPrimary) ?? landmark(frame, j.footFallback);
  if (!shoulder || !hip || !knee || !foot) return null;

  const baselineLength = distance(shoulder, foot);
  if (baselineLength <= 0) return null;

  const dx = foot.x - shoulder.x;
  const dy = foot.y - shoulder.y;

  const perpendicularDistance = (point: TrackedLandmark) =>
    Math.abs(dy * point.x - dx * point.y + foot.x * shoulder.y - foot.y * shoulder.x) / baselineLength;

  const alignmentRatio = (perpendicularDistance(hip) + perpendicularDistance(knee)) / 2 / baselineLength;

  // 水平線との角度は共通ユーティリティ（0〜90°へ正規化済み）を使い、重複実装しない。
  const angleDeg = calculateLineAngleFromHorizontal(shoulder, foot);

  return { alignmentRatio, angleDeg };
}

/** 打点（最高点）前後のウィンドウから、利き手を1回だけ判定してサンプル列を作る */
function aerialPostureSamples(ctx: EvaluationContext): AerialLineSample[] {
  const frames = aerialPostureWindowFrames(ctx);
  if (frames.length === 0) return [];
  const side = dominantHittingSide(frames);
  if (!side) return [];
  return frames
    .map((frame) => computeAerialLineSample(frame, side))
    .filter((s): s is AerialLineSample => s !== null);
}

/**
 * 最高点付近（aerialPostureWindowFramesと同じ区間）の体軸角度（肩中心-腰中心の傾き, deg）の列。
 * 絶対角度そのものではなく、後続で「連続フレーム間の変化量」を見るための系列。
 */
function trunkAxisAngleSeries(ctx: EvaluationContext): number[] {
  const frames = aerialPostureWindowFrames(ctx);
  return frames
    .map((frame) => {
      const s = shoulderCenter(frame);
      const h = hipCenter(frame);
      return s && h ? calculateTiltDegrees(h, s) : null;
    })
    .filter((v): v is number => v !== null);
}

/**
 * 体幹安定性の指標＝連続フレーム間の体軸角度変化量の中央値（deg）。
 * 外れ値（1フレームだけの検出ブレ）の影響を抑えつつ、
 * 「40°傾いたまま維持」なら差分はほぼ0（高評価）、
 * 「短時間で乱高下」すれば差分の中央値が大きくなる（低評価）ように設計している。
 * 体軸の絶対角度（40°など）自体はこの値に一切影響しない。
 */
function trunkStabilityVariation(ctx: EvaluationContext): number | null {
  const series = trunkAxisAngleSeries(ctx);
  if (series.length < AERIAL_POSTURE_MIN_SAMPLES) return null;
  const diffs: number[] = [];
  for (let i = 1; i < series.length; i += 1) {
    diffs.push(Math.abs(series[i] - series[i - 1]));
  }
  return median(diffs);
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

/** 体幹安定性（角度変化量の中央値。0が理想、大きいほど不安定）を0〜100へ区分線形変換する */
export function scoreTrunkStability(variationDeg: number): number {
  if (variationDeg <= TRUNK_STABILITY_EXCELLENT_MAX_DEG) {
    return 100 - (variationDeg / TRUNK_STABILITY_EXCELLENT_MAX_DEG) * 10;
  }
  if (variationDeg <= TRUNK_STABILITY_GOOD_MAX_DEG) {
    const t =
      (variationDeg - TRUNK_STABILITY_EXCELLENT_MAX_DEG) /
      (TRUNK_STABILITY_GOOD_MAX_DEG - TRUNK_STABILITY_EXCELLENT_MAX_DEG);
    return 90 - t * 15;
  }
  if (variationDeg <= TRUNK_STABILITY_FAIR_MAX_DEG) {
    const t =
      (variationDeg - TRUNK_STABILITY_GOOD_MAX_DEG) / (TRUNK_STABILITY_FAIR_MAX_DEG - TRUNK_STABILITY_GOOD_MAX_DEG);
    return 75 - t * 30;
  }
  const t = clamp((variationDeg - TRUNK_STABILITY_FAIR_MAX_DEG) / TRUNK_STABILITY_POOR_SPAN_DEG, 0, 1);
  return 45 - t * 45;
}

function describeAerialAlignment(_value: number, score: number): string {
  if (score >= AERIAL_GOOD_SCORE) {
    return "打つ側の肩から反対側の足先までが一直線に近く、理想的な空中姿勢です。";
  }
  if (score <= AERIAL_POOR_SCORE) {
    return "打つ側の肩から反対側の足先までのラインが途中で崩れています。腰または膝が全身の基準ラインから外れています。";
  }
  return "全身のラインはおおむね保てていますが、腰または膝がやや基準ラインから外れています。";
}

function describeAerialAngle(rawAngleDeg: number, score: number): string {
  if (score >= AERIAL_GOOD_SCORE) {
    return "全身のラインが約45°となっており、最高点付近の姿勢が良好です。";
  }
  if (rawAngleDeg < ANGLE_IDEAL_DEG) {
    return "全身のラインが水平に近く、理想とする45°より浅い姿勢です。";
  }
  return "全身のラインが立ちすぎており、理想とする45°より大きくなっています。";
}

function describeTrunkStability(_value: number, score: number): string {
  if (score >= AERIAL_GOOD_SCORE) {
    return "最高点付近で体軸が安定しています。傾き自体は減点していません。";
  }
  if (score <= AERIAL_POOR_SCORE) {
    return "最高点付近で体軸の角度が短時間で大きく変化しており、姿勢が不安定です。";
  }
  return "最高点付近の体軸はおおむね安定していますが、やや変化が見られます。";
}

const metricDefinitions: MetricDefinition[] = [
  {
    id: "approachSpeed",
    label: "助走速度",
    category: "approach",
    unit: "pxPerSec",
    weight: 0.9,
    phase: "approach",
    description: "助走区間の重心水平速度。",
    targetByForm: formTargets({ ideal: 260, tolerance: 180, direction: "higher" }),
    measure: (ctx) => {
      const f = framesOf(ctx, "approach");
      return f.length >= 2 ? horizontalSpeed(f[0], f[f.length - 1]) : null;
    },
  },
  {
    id: "approachSpeedRetention",
    label: "最後2歩の速度維持率",
    category: "approach",
    unit: "ratio",
    weight: 1.15,
    phase: "approach",
    description: "助走前半に対して後半でどれだけ速度を保てたか。",
    targetByForm: formTargets({ ideal: 0.9, tolerance: 0.35 }),
    measure: (ctx) => {
      const f = framesOf(ctx, "approach");
      if (f.length < 6) return null;
      const mid = Math.floor(f.length / 2);
      const early = horizontalSpeed(f[0], f[mid - 1]);
      const late = horizontalSpeed(f[mid], f[f.length - 1]);
      if (early === null || late === null || early <= 0) return null;
      return late / early;
    },
  },
  {
    id: "approachRhythm",
    label: "助走リズムの安定",
    category: "approach",
    unit: "index",
    weight: 0.75,
    phase: "approach",
    description: "助走中の重心速度変動。小さいほど一定リズム。",
    targetByForm: formTargets({ ideal: 0.18, tolerance: 0.32, direction: "lower" }),
    measure: (ctx) => {
      const f = framesOf(ctx, "approach");
      const speeds: number[] = [];
      for (let i = 1; i < f.length; i += 1) {
        const v = horizontalSpeed(f[i - 1], f[i]);
        if (v !== null) speeds.push(v);
      }
      const mean = avg(speeds);
      if (mean === null || mean <= 0) return null;
      const sd = Math.sqrt(avg(speeds.map((s) => (s - mean) ** 2)) ?? 0);
      return sd / mean;
    },
  },
  {
    id: "approachDirection",
    label: "助走方向の直線性",
    category: "approach",
    unit: "deg",
    weight: 0.75,
    phase: "approach",
    description: "助走開始から踏切までの進行角度。横へ流れすぎていないか。",
    targetByForm: formTargets({ ideal: 0, tolerance: 22, direction: "lower" }),
    measure: (ctx) => {
      const f = framesOf(ctx, "approach");
      if (f.length < 2) return null;
      const dx = f[f.length - 1].centerX - f[0].centerX;
      const dy = f[f.length - 1].centerY - f[0].centerY;
      return Math.abs(Math.atan2(dy, dx) * 180 / Math.PI);
    },
  },
  {
    id: "approachLateralDeviation",
    label: "助走中の左右ブレ",
    category: "approach",
    unit: "ratio",
    weight: 0.8,
    phase: "approach",
    description: "助走軌道からの平均ズレ。",
    targetByForm: formTargets({ ideal: 0.06, tolerance: 0.18, direction: "lower" }),
    measure: (ctx) => lineDeviationRatio(framesOf(ctx, "approach")),
  },
  {
    id: "contactTime",
    label: "接地時間",
    category: "takeoff",
    unit: "ms",
    weight: 1.2,
    phase: "takeoff",
    description: "沈み込み開始から離地までの時間。",
    targetByForm: formTargets({ ideal: 220, tolerance: 180, direction: "lower" }),
    measure: (ctx) => {
      const p = findEnginePhase(ctx.engine, "takeoff");
      return p ? Math.max(0, p.endTime - p.startTime) * 1000 : null;
    },
  },
  {
    id: "kneeValgus",
    label: "膝の内側倒れ",
    category: "takeoff",
    unit: "ratio",
    weight: 1.2,
    phase: "takeoff",
    description: "膝が股関節・足首ラインから内側へ外れる量。",
    targetByForm: formTargets({ ideal: 0.08, tolerance: 0.2, direction: "lower" }),
    measure: (ctx) => {
      const f = eventFrame(ctx, "takeoffIndex");
      if (!f) return null;
      const values: number[] = [];
      for (const side of ["left", "right"] as const) {
        const hip = landmark(f, side === "left" ? L.leftHip : L.rightHip);
        const knee = landmark(f, side === "left" ? L.leftKnee : L.rightKnee);
        const ankle = landmark(f, side === "left" ? L.leftAnkle : L.rightAnkle);
        if (!hip || !knee || !ankle) continue;
        const leg = distance(hip, ankle);
        if (leg <= 0) continue;
        const t = ((knee.x - hip.x) * (ankle.x - hip.x) + (knee.y - hip.y) * (ankle.y - hip.y)) / (leg ** 2);
        const proj = { x: hip.x + t * (ankle.x - hip.x), y: hip.y + t * (ankle.y - hip.y) };
        values.push(distance(knee, proj) / leg);
      }
      return avg(values);
    },
  },
  {
    id: "hipExtension",
    label: "股関節伸展",
    category: "takeoff",
    unit: "deg",
    weight: 1.05,
    phase: "takeoff",
    description: "離地付近の股関節角度。",
    targetByForm: formTargets({ ideal: 165, tolerance: 25, direction: "higher" }),
    measure: (ctx) => {
      const f = eventFrame(ctx, "takeoffIndex");
      if (!f) return null;
      return avg([angleAt(f, L.leftShoulder, L.leftHip, L.leftKnee), angleAt(f, L.rightShoulder, L.rightHip, L.rightKnee)].filter((v): v is number => v !== null));
    },
  },
  {
    id: "kneeExtension",
    label: "膝伸展",
    category: "takeoff",
    unit: "deg",
    weight: 1.1,
    phase: "takeoff",
    description: "離地付近の膝角度。",
    targetByForm: formTargets({ ideal: 168, tolerance: 28, direction: "higher" }),
    measure: (ctx) => {
      const f = eventFrame(ctx, "takeoffIndex");
      if (!f) return null;
      return avg([f.leftKneeAngle, f.rightKneeAngle].filter((v): v is number => v !== null));
    },
  },
  {
    id: "ankleExtension",
    label: "足関節伸展",
    category: "takeoff",
    unit: "deg",
    weight: 0.95,
    phase: "takeoff",
    description: "離地付近の足首の底屈に相当する角度。",
    targetByForm: formTargets({ ideal: 155, tolerance: 35, direction: "higher" }),
    measure: (ctx) => {
      const f = eventFrame(ctx, "takeoffIndex");
      if (!f) return null;
      return avg([angleAt(f, L.leftKnee, L.leftAnkle, L.leftFoot), angleAt(f, L.rightKnee, L.rightAnkle, L.rightFoot)].filter((v): v is number => v !== null));
    },
  },
  {
    id: "takeoffVerticalImpulseIndex",
    label: "重心上向き加速",
    category: "takeoff",
    unit: "pxPerSec",
    weight: 0.95,
    phase: "takeoff",
    description: "踏切区間での重心Y速度変化。",
    targetByForm: formTargets({ ideal: 220, tolerance: 180, direction: "higher" }),
    measure: (ctx) => {
      const f = framesOf(ctx, "takeoff");
      if (f.length < 3) return null;
      const before = velocity(f[0], f[Math.min(1, f.length - 1)]);
      const after = velocity(f[Math.max(0, f.length - 2)], f[f.length - 1]);
      if (!before || !after) return null;
      return Math.max(0, before.y - after.y);
    },
  },
  {
    id: "takeoffLateralDrift",
    label: "踏切中の左右ブレ",
    category: "takeoff",
    unit: "ratio",
    weight: 0.85,
    phase: "takeoff",
    description: "踏切中の重心水平移動量。",
    targetByForm: formTargets({ ideal: 0.35, tolerance: 0.5, direction: "lower" }),
    measure: (ctx) => {
      const f = framesOf(ctx, "takeoff");
      if (f.length < 2) return null;
      return Math.abs(f[f.length - 1].centerX - f[0].centerX) / ctx.bodyScale;
    },
  },
  {
    id: "takeoffAngle",
    label: "離地角度",
    category: "takeoff",
    unit: "deg",
    weight: 1.0,
    phase: "takeoff",
    description: "離地直前後の重心速度ベクトル角度。",
    targetByForm: formTargets({ ideal: 65, tolerance: 28 }),
    measure: (ctx) => {
      const i = ctx.engine.events.takeoffIndex;
      if (i < 1 || i + 1 >= ctx.frames.length) return null;
      const v = velocity(ctx.frames[i - 1], ctx.frames[i + 1]);
      if (!v) return null;
      return Math.abs(Math.atan2(-v.y, Math.abs(v.x)) * 180 / Math.PI);
    },
  },
  {
    id: "peakHeight",
    label: "重心最高位置",
    category: "flight",
    unit: "px",
    weight: 1.1,
    phase: "peak",
    description: "離地時から最高点までの重心上昇量。",
    targetByForm: formTargets({ ideal: 120, tolerance: 100, direction: "higher" }),
    measure: (ctx) => {
      const takeoff = eventFrame(ctx, "takeoffIndex");
      const peak = eventFrame(ctx, "peakIndex");
      if (!takeoff || !peak) return null;
      return Math.max(0, takeoff.centerY - peak.centerY);
    },
  },
  {
    id: "flightTime",
    label: "滞空時間",
    category: "flight",
    unit: "ms",
    weight: 0.95,
    phase: "ascent",
    description: "離地から着地までの時間。",
    targetByForm: formTargets({ ideal: 560, tolerance: 260, direction: "higher" }),
    measure: (ctx) => (ctx.frames[ctx.engine.events.landingIndex].time - ctx.frames[ctx.engine.events.takeoffIndex].time) * 1000,
  },
  {
    id: "bodyLine",
    label: "身体一直線性",
    category: "flight",
    unit: "deg",
    weight: 1.0,
    phase: "peak",
    description: "頭・肩・腰・足首ラインの曲がり。小さいほど一直線。",
    targetByForm: formTargets({ ideal: 12, tolerance: 28, direction: "lower" }, { straightArm: { ideal: 9, tolerance: 24 } }),
    measure: (ctx) => {
      const f = eventFrame(ctx, "peakIndex");
      if (!f) return null;
      const head = headCenter(f);
      const shoulder = shoulderCenter(f);
      const hip = hipCenter(f);
      const ankle = ankleCenter(f);
      if (!head || !shoulder || !hip || !ankle) return null;
      return Math.abs(180 - calculateAngle(head, shoulder, hip)) + Math.abs(180 - calculateAngle(shoulder, hip, ankle));
    },
  },
  {
    id: "trunkTilt",
    label: "体幹傾斜",
    category: "flight",
    unit: "deg",
    weight: 0.85,
    phase: "peak",
    description: "最高点付近の体幹の前後傾。",
    targetByForm: formTargets({ ideal: 10, tolerance: 28, direction: "lower" }),
    measure: (ctx) => {
      const f = eventFrame(ctx, "peakIndex");
      if (!f) return null;
      const s = shoulderCenter(f);
      const h = hipCenter(f);
      if (!s || !h) return null;
      return Math.abs(90 - Math.abs(calculateTiltDegrees(h, s)));
    },
  },
  {
    id: "shoulderRotationInFlight",
    label: "空中の肩回転量",
    category: "flight",
    unit: "deg",
    weight: 0.75,
    phase: "ascent",
    description: "離地から着地までの肩ライン角度変化。",
    targetByForm: formTargets({ ideal: 55, tolerance: 50 }),
    measure: (ctx) => {
      const f = ctx.frames.slice(ctx.engine.events.takeoffIndex, ctx.engine.events.landingIndex + 1);
      const tilts = f.map((frame) => lineTilt(frame, L.leftShoulder, L.rightShoulder)).filter((v): v is number => v !== null);
      return range(tilts);
    },
  },
  {
    id: "flightLateralDrift",
    label: "空中の左右流れ",
    category: "flight",
    unit: "ratio",
    weight: 0.95,
    phase: "ascent",
    description: "離地から着地までの重心水平移動。",
    targetByForm: formTargets({ ideal: 0.55, tolerance: 0.8, direction: "lower" }),
    measure: (ctx) => {
      const takeoff = eventFrame(ctx, "takeoffIndex");
      const landing = eventFrame(ctx, "landingIndex");
      if (!takeoff || !landing) return null;
      return Math.abs(landing.centerX - takeoff.centerX) / ctx.bodyScale;
    },
  },
  {
    id: "elbowHeight",
    label: "肘高さ",
    category: "takeback",
    unit: "ratio",
    weight: 1.0,
    phase: "peak",
    description: "打つ側の肘が肩よりどれだけ高いか。",
    targetByForm: formTargets({ ideal: 0.15, tolerance: 0.35, direction: "higher" }, { straightArm: { ideal: 0.08 }, bowAndArrow: { ideal: 0.2 } }),
    measure: (ctx) => {
      const f = wristHeightFrame(ctx);
      if (!f) return null;
      const side = hittingSide(f);
      if (!side) return null;
      const j = jointForSide(side);
      const shoulder = landmark(f, j.shoulder);
      const elbow = landmark(f, j.elbow);
      if (!shoulder || !elbow) return null;
      return (shoulder.y - elbow.y) / ctx.bodyScale;
    },
  },
  {
    id: "shoulderOpen",
    label: "肩の開き",
    category: "takeback",
    unit: "deg",
    weight: 1.05,
    phase: "peak",
    description: "打つ側の上腕と体幹の角度。",
    targetByForm: formTargets({ ideal: 145, tolerance: 35 }, { straightArm: { ideal: 125 }, bowAndArrow: { ideal: 155 }, circularArm: { ideal: 140 } }),
    measure: (ctx) => {
      const f = wristHeightFrame(ctx);
      if (!f) return null;
      const side = hittingSide(f);
      if (!side) return null;
      const j = jointForSide(side);
      const oppositeHip = side === "right" ? L.leftHip : L.rightHip;
      return angleAt(f, oppositeHip, j.shoulder, j.elbow);
    },
  },
  {
    id: "thoraxRotation",
    label: "胸郭回旋",
    category: "takeback",
    unit: "deg",
    weight: 1.0,
    phase: "peak",
    description: "肩ラインと骨盤ラインの角度差。",
    targetByForm: formTargets({ ideal: 32, tolerance: 28 }, { bowAndArrow: { ideal: 42 }, circularArm: { ideal: 36 } }),
    measure: (ctx) => {
      const f = wristHeightFrame(ctx);
      if (!f) return null;
      const shoulder = lineTilt(f, L.leftShoulder, L.rightShoulder);
      const hip = lineTilt(f, L.leftHip, L.rightHip);
      return shoulder !== null && hip !== null ? angleDiff(shoulder, hip) : null;
    },
  },
  {
    id: "oppositeArmKeep",
    label: "逆腕保持",
    category: "takeback",
    unit: "deg",
    weight: 0.85,
    phase: "peak",
    description: "逆腕が早く下がりすぎていないか。",
    targetByForm: formTargets({ ideal: 95, tolerance: 50 }, { bowAndArrow: { ideal: 110 } }),
    measure: (ctx) => {
      const f = wristHeightFrame(ctx);
      if (!f) return null;
      const side = hittingSide(f);
      if (!side) return null;
      const other = jointForSide(side).otherWrist;
      const oppositeShoulder = side === "right" ? L.leftShoulder : L.rightShoulder;
      const oppositeElbow = side === "right" ? L.leftElbow : L.rightElbow;
      return angleAt(f, other, oppositeShoulder, oppositeElbow);
    },
  },
  {
    id: "hipShoulderSequence",
    label: "腰→肩回旋順序",
    category: "takeback",
    unit: "ms",
    weight: 0.95,
    phase: "contact",
    description: "骨盤回旋ピークから肩回旋ピークまでの時間差。",
    targetByForm: formTargets({ ideal: 55, tolerance: 90 }, { bowAndArrow: { ideal: 70 }, circularArm: { ideal: 45 } }),
    measure: (ctx) => sequenceDelay(ctx, "hip", "shoulder"),
  },
  {
    id: "elbowLead",
    label: "肘リード",
    category: "hit",
    unit: "ratio",
    weight: 1.05,
    phase: "contact",
    description: "インパクト付近で肘が手首より前に出る量。",
    targetByForm: formTargets({ ideal: 0.18, tolerance: 0.35 }, { straightArm: { ideal: 0.08 }, bowAndArrow: { ideal: 0.22 } }),
    measure: (ctx) => {
      const f = wristHeightFrame(ctx);
      if (!f) return null;
      const side = hittingSide(f);
      if (!side) return null;
      const j = jointForSide(side);
      const elbow = landmark(f, j.elbow);
      const wrist = landmark(f, j.wrist);
      if (!elbow || !wrist) return null;
      return Math.abs(elbow.x - wrist.x) / ctx.bodyScale;
    },
  },
  {
    id: "proximalDistalTiming",
    label: "肩→肘→手首の加速順序",
    category: "hit",
    unit: "index",
    weight: 1.15,
    phase: "contact",
    description: "最大速度の発生順序が近位から遠位になっているか。",
    targetByForm: formTargets({ ideal: 1, tolerance: 1, direction: "higher" }, { circularArm: { ideal: 1 } }),
    measure: (ctx) => {
      const f = wristHeightFrame(ctx);
      if (!f) return null;
      const side = hittingSide(f);
      if (!side) return null;
      const j = jointForSide(side);
      const shoulderPeak = peakSpeedTime(ctx, j.shoulder);
      const elbowPeak = peakSpeedTime(ctx, j.elbow);
      const wristPeak = peakSpeedTime(ctx, j.wrist);
      if (shoulderPeak === null || elbowPeak === null || wristPeak === null) return null;
      return shoulderPeak <= elbowPeak && elbowPeak <= wristPeak ? 1 : 0;
    },
  },
  {
    id: "hitHeightGap",
    label: "打点高さ",
    category: "hit",
    unit: "px",
    weight: 1.15,
    phase: "contact",
    description: "手首最高点と重心最高点の時間的なズレを高さで評価。",
    targetByForm: formTargets({ ideal: 0, tolerance: 55, direction: "lower" }),
    measure: (ctx) => {
      const peak = eventFrame(ctx, "peakIndex");
      const hit = wristHeightFrame(ctx);
      const wrist = hit ? hittingWrist(hit) : null;
      if (!peak || !hit || !wrist) return null;
      const peakWrist = hittingWrist(peak);
      if (!peakWrist) return null;
      return Math.abs(wrist.y - peakWrist.y);
    },
  },
  {
    id: "frontContact",
    label: "身体前方打点",
    category: "hit",
    unit: "ratio",
    weight: 1.0,
    phase: "contact",
    description: "手首が頭・体幹より前にある量。",
    targetByForm: formTargets({ ideal: 0.45, tolerance: 0.45 }, { straightArm: { ideal: 0.35 } }),
    measure: (ctx) => {
      const f = wristHeightFrame(ctx);
      const wrist = f ? hittingWrist(f) : null;
      const head = f ? headCenter(f) : null;
      if (!wrist || !head) return null;
      return Math.abs(wrist.x - head.x) / ctx.bodyScale;
    },
  },
  {
    id: "armExtension",
    label: "インパクト時の腕伸展",
    category: "hit",
    unit: "deg",
    weight: 1.1,
    phase: "contact",
    description: "打点付近の肘角度。",
    targetByForm: formTargets({ ideal: 165, tolerance: 28, direction: "higher" }, { straightArm: { ideal: 172, tolerance: 22 } }),
    measure: (ctx) => {
      const f = wristHeightFrame(ctx);
      if (!f) return null;
      const side = hittingSide(f);
      if (!side) return null;
      const j = jointForSide(side);
      return angleAt(f, j.shoulder, j.elbow, j.wrist);
    },
  },
  {
    id: "headStabilityHit",
    label: "打撃時の頭部安定",
    category: "hit",
    unit: "ratio",
    weight: 0.8,
    phase: "contact",
    description: "打撃前後の頭部移動量。",
    targetByForm: formTargets({ ideal: 0.28, tolerance: 0.55, direction: "lower" }),
    measure: (ctx) => headMoveRatio(ctx, ctx.engine.events.peakIndex - 2, ctx.engine.events.peakIndex + 2),
  },
  {
    id: "neckAngle",
    label: "頸部角度",
    category: "hit",
    unit: "deg",
    weight: 0.65,
    phase: "contact",
    description: "顎が上がりすぎていないかを頭部・体幹角度から推定。",
    targetByForm: formTargets({ ideal: 18, tolerance: 28, direction: "lower" }),
    measure: (ctx) => neckTiltAt(eventFrame(ctx, "peakIndex")),
  },
  {
    id: "aerialLineAlignment",
    label: "全身ラインの一直線性",
    category: "airPosture",
    unit: "ratio",
    weight: AERIAL_ALIGNMENT_WEIGHT,
    phase: "peak",
    description: "足先または下半身の検出精度が低いため、空中姿勢を正確に評価できませんでした。",
    targetByForm: formTargets({ ideal: 0, tolerance: ALIGNMENT_FAIR_MAX }),
    score: (value) => scoreAerialAlignment(value),
    describe: describeAerialAlignment,
    measure: (ctx) => {
      const samples = aerialPostureSamples(ctx);
      if (samples.length < AERIAL_POSTURE_MIN_SAMPLES) return null;
      return median(samples.map((s) => s.alignmentRatio));
    },
  },
  {
    id: "aerialLineAngle",
    label: "全身ラインの角度（対水平45°）",
    category: "airPosture",
    unit: "deg",
    weight: AERIAL_ANGLE_WEIGHT,
    phase: "peak",
    description: "足先または下半身の検出精度が低いため、空中姿勢を正確に評価できませんでした。",
    targetByForm: formTargets({ ideal: ANGLE_IDEAL_DEG, tolerance: ANGLE_FAIR_TOLERANCE_DEG }),
    score: (value) => scoreAerialAngle(value),
    describe: describeAerialAngle,
    measure: (ctx) => {
      const samples = aerialPostureSamples(ctx);
      if (samples.length < AERIAL_POSTURE_MIN_SAMPLES) return null;
      return median(samples.map((s) => s.angleDeg));
    },
  },
  {
    id: "aerialTrunkStability",
    label: "最高点付近の体幹安定性",
    category: "airPosture",
    unit: "deg",
    weight: AERIAL_TRUNK_STABILITY_WEIGHT,
    phase: "peak",
    description: "体幹または下半身の検出精度が低いため、体幹安定性を正確に評価できませんでした。",
    targetByForm: formTargets({ ideal: 0, tolerance: TRUNK_STABILITY_FAIR_MAX_DEG }),
    score: (value) => scoreTrunkStability(value),
    describe: describeTrunkStability,
    measure: (ctx) => trunkStabilityVariation(ctx),
  },
  {
    id: "followThroughRange",
    label: "腕振り切り",
    category: "followThrough",
    unit: "deg",
    weight: 0.9,
    phase: "descent",
    description: "打点後の肩〜手首角度変化。",
    targetByForm: formTargets({ ideal: 75, tolerance: 70, direction: "higher" }, { circularArm: { ideal: 90 } }),
    measure: (ctx) => wristPathAngleRange(ctx),
  },
  {
    id: "trunkRotationContinue",
    label: "体幹回旋継続",
    category: "followThrough",
    unit: "deg",
    weight: 0.8,
    phase: "descent",
    description: "打点後も肩・骨盤回旋が続いているか。",
    targetByForm: formTargets({ ideal: 32, tolerance: 38, direction: "higher" }, { circularArm: { ideal: 40 } }),
    measure: (ctx) => {
      const f = framesOf(ctx, "descent");
      const diffs = f.map((frame) => {
        const s = lineTilt(frame, L.leftShoulder, L.rightShoulder);
        const h = lineTilt(frame, L.leftHip, L.rightHip);
        return s !== null && h !== null ? angleDiff(s, h) : null;
      }).filter((v): v is number => v !== null);
      return range(diffs);
    },
  },
  {
    id: "wristPathLength",
    label: "腕軌道",
    category: "followThrough",
    unit: "ratio",
    weight: 0.75,
    phase: "descent",
    description: "打点後の手首軌道長。",
    targetByForm: formTargets({ ideal: 1.5, tolerance: 1.2, direction: "higher" }, { circularArm: { ideal: 1.9 }, straightArm: { ideal: 1.25 } }),
    measure: (ctx) => wristPathLength(ctx),
  },
  {
    id: "wristDeceleration",
    label: "手首減速率",
    category: "followThrough",
    unit: "ratio",
    weight: 0.65,
    phase: "descent",
    description: "打点後に手首速度が自然に落ちているか。",
    targetByForm: formTargets({ ideal: 0.55, tolerance: 0.45 }),
    measure: (ctx) => {
      const f = wristHeightFrame(ctx);
      if (!f) return null;
      const side = hittingSide(f);
      if (!side) return null;
      const j = jointForSide(side);
      const speeds = wristSpeeds(ctx, j.wrist);
      if (speeds.length < 4) return null;
      const peak = maxBy(speeds, (s) => s.speed);
      if (!peak || peak.speed <= 0) return null;
      const after = speeds.filter((s) => s.frame.time > peak.frame.time).slice(0, 5).map((s) => s.speed);
      const afterAvg = avg(after);
      return afterAvg === null ? null : clamp(1 - afterAvg / peak.speed, 0, 1);
    },
  },
  {
    id: "landingTimingDiff",
    label: "左右同時接地",
    category: "landing",
    unit: "ms",
    weight: 1.0,
    phase: "landing",
    description: "左右足首の接地推定タイミング差。",
    targetByForm: formTargets({ ideal: 35, tolerance: 100, direction: "lower" }),
    measure: (ctx) => landingFootTimingDiff(ctx),
  },
  {
    id: "landingFootWidth",
    label: "着地足幅",
    category: "landing",
    unit: "ratio",
    weight: 0.85,
    phase: "landing",
    description: "着地時の左右足首幅。",
    targetByForm: formTargets({ ideal: 1.25, tolerance: 0.75 }),
    measure: (ctx) => {
      const f = eventFrame(ctx, "landingIndex");
      const l = f ? landmark(f, L.leftAnkle) : null;
      const r = f ? landmark(f, L.rightAnkle) : null;
      return l && r ? distance(l, r) / ctx.bodyScale : null;
    },
  },
  {
    id: "landingKneeFlexion",
    label: "着地膝屈曲",
    category: "landing",
    unit: "deg",
    weight: 0.95,
    phase: "landing",
    description: "着地時の膝角度。柔らかく使えているか。",
    targetByForm: formTargets({ ideal: 130, tolerance: 35 }),
    measure: (ctx) => {
      const f = eventFrame(ctx, "landingIndex");
      if (!f) return null;
      return avg([f.leftKneeAngle, f.rightKneeAngle].filter((v): v is number => v !== null));
    },
  },
  {
    id: "landingHipFlexion",
    label: "着地股関節屈曲",
    category: "landing",
    unit: "deg",
    weight: 0.8,
    phase: "landing",
    description: "着地時の股関節角度。",
    targetByForm: formTargets({ ideal: 135, tolerance: 35 }),
    measure: (ctx) => {
      const f = eventFrame(ctx, "landingIndex");
      if (!f) return null;
      return avg([angleAt(f, L.leftShoulder, L.leftHip, L.leftKnee), angleAt(f, L.rightShoulder, L.rightHip, L.rightKnee)].filter((v): v is number => v !== null));
    },
  },
  {
    id: "landingSymmetry",
    label: "左右沈み込み差",
    category: "landing",
    unit: "deg",
    weight: 0.9,
    phase: "landing",
    description: "左右膝角度の差。",
    targetByForm: formTargets({ ideal: 10, tolerance: 25, direction: "lower" }),
    measure: (ctx) => {
      const f = eventFrame(ctx, "landingIndex");
      if (!f || f.leftKneeAngle === null || f.rightKneeAngle === null) return null;
      return Math.abs(f.leftKneeAngle - f.rightKneeAngle);
    },
  },
  {
    id: "landingForwardMove",
    label: "着地後の前後移動",
    category: "landing",
    unit: "ratio",
    weight: 0.75,
    phase: "landing",
    description: "着地から安定までの重心移動。",
    targetByForm: formTargets({ ideal: 0.75, tolerance: 0.9, direction: "lower" }),
    measure: (ctx) => landingMove(ctx, "x"),
  },
  {
    id: "landingSideMove",
    label: "着地後の左右移動",
    category: "landing",
    unit: "ratio",
    weight: 0.75,
    phase: "landing",
    description: "着地後の横ブレ。",
    targetByForm: formTargets({ ideal: 0.55, tolerance: 0.75, direction: "lower" }),
    measure: (ctx) => landingMove(ctx, "y"),
  },
  {
    id: "landingStabilizeTime",
    label: "姿勢安定までの時間",
    category: "landing",
    unit: "ms",
    weight: 0.85,
    phase: "landing",
    description: "着地後に重心速度が落ち着くまでの時間。",
    targetByForm: formTargets({ ideal: 280, tolerance: 420, direction: "lower" }),
    measure: (ctx) => stabilizeTime(ctx),
  },
  {
    id: "conversionEfficiency",
    label: "助走→ジャンプ変換効率",
    category: "efficiency",
    unit: "ratio",
    weight: 1.15,
    phase: "takeoff",
    description: "助走速度に対する離地速度の比率。",
    targetByForm: formTargets({ ideal: 0.85, tolerance: 0.55, direction: "higher" }),
    measure: (ctx) => {
      const approach = framesOf(ctx, "approach");
      const av = approach.length >= 2 ? horizontalSpeed(approach[0], approach[approach.length - 1]) : null;
      const i = ctx.engine.events.takeoffIndex;
      if (i < 1 || i + 1 >= ctx.frames.length || av === null || av <= 0) return null;
      const tv = velocity(ctx.frames[i - 1], ctx.frames[i + 1]);
      if (!tv) return null;
      return Math.hypot(tv.x, tv.y) / av;
    },
  },
  {
    id: "verticalVelocityRatio",
    label: "垂直速度割合",
    category: "efficiency",
    unit: "ratio",
    weight: 1.0,
    phase: "takeoff",
    description: "離地速度のうち上方向成分が占める割合。",
    targetByForm: formTargets({ ideal: 0.78, tolerance: 0.32 }),
    measure: (ctx) => {
      const i = ctx.engine.events.takeoffIndex;
      if (i < 1 || i + 1 >= ctx.frames.length) return null;
      const v = velocity(ctx.frames[i - 1], ctx.frames[i + 1]);
      if (!v) return null;
      const total = Math.hypot(v.x, v.y);
      return total > 0 ? Math.abs(v.y) / total : null;
    },
  },
  {
    id: "horizontalLoss",
    label: "水平方向速度ロス",
    category: "efficiency",
    unit: "ratio",
    weight: 0.95,
    phase: "takeoff",
    description: "助走後半から離地直後までの水平速度低下率。",
    targetByForm: formTargets({ ideal: 0.35, tolerance: 0.5, direction: "lower" }),
    measure: (ctx) => {
      const approach = framesOf(ctx, "approach");
      if (approach.length < 2) return null;
      const av = horizontalSpeed(approach[Math.floor(approach.length / 2)], approach[approach.length - 1]);
      const i = ctx.engine.events.takeoffIndex;
      if (i < 1 || i + 1 >= ctx.frames.length || av === null || av <= 0) return null;
      const tv = velocity(ctx.frames[i], ctx.frames[i + 1]);
      if (!tv) return null;
      return Math.max(0, (av - Math.abs(tv.x)) / av);
    },
  },
  {
    id: "efficiencyPeakHeight",
    label: "最高到達の高さ",
    category: "efficiency",
    unit: "px",
    weight: 1.1,
    phase: "peak",
    description: "重心上昇量。",
    targetByForm: formTargets({ ideal: 120, tolerance: 100, direction: "higher" }),
    measure: (ctx) => {
      const takeoff = eventFrame(ctx, "takeoffIndex");
      const peak = eventFrame(ctx, "peakIndex");
      return takeoff && peak ? Math.max(0, takeoff.centerY - peak.centerY) : null;
    },
  },
  {
    id: "efficiencyFlightTime",
    label: "滞空時間",
    category: "efficiency",
    unit: "ms",
    weight: 0.9,
    phase: "ascent",
    description: "離地から着地までの時間。",
    targetByForm: formTargets({ ideal: 560, tolerance: 260, direction: "higher" }),
    measure: (ctx) => (ctx.frames[ctx.engine.events.landingIndex].time - ctx.frames[ctx.engine.events.takeoffIndex].time) * 1000,
  },
];

function sequenceDelay(ctx: EvaluationContext, first: "hip" | "shoulder", second: "hip" | "shoulder"): number | null {
  const start = Math.max(1, ctx.engine.events.takeoffIndex - 3);
  const end = Math.min(ctx.frames.length - 1, ctx.engine.events.peakIndex + 4);
  const angularSpeeds: Array<{ time: number; hip: number | null; shoulder: number | null }> = [];
  for (let i = start; i <= end; i += 1) {
    const prev = ctx.frames[i - 1];
    const curr = ctx.frames[i];
    const dt = curr.time - prev.time;
    if (dt <= 0) continue;
    const hipA = lineTilt(prev, L.leftHip, L.rightHip);
    const hipB = lineTilt(curr, L.leftHip, L.rightHip);
    const shoulderA = lineTilt(prev, L.leftShoulder, L.rightShoulder);
    const shoulderB = lineTilt(curr, L.leftShoulder, L.rightShoulder);
    angularSpeeds.push({
      time: curr.time,
      hip: hipA !== null && hipB !== null ? angleDiff(hipA, hipB) / dt : null,
      shoulder: shoulderA !== null && shoulderB !== null ? angleDiff(shoulderA, shoulderB) / dt : null,
    });
  }
  const firstPeak = maxBy(angularSpeeds, (v) => v[first]);
  const secondPeak = maxBy(angularSpeeds, (v) => v[second]);
  if (!firstPeak || !secondPeak) return null;
  return (secondPeak.time - firstPeak.time) * 1000;
}

function peakSpeedTime(ctx: EvaluationContext, landmarkIndex: number): number | null {
  const start = Math.max(1, ctx.engine.events.takeoffIndex - 2);
  const end = Math.min(ctx.frames.length - 1, ctx.engine.events.peakIndex + 4);
  const values: Array<{ time: number; speed: number }> = [];
  for (let i = start; i <= end; i += 1) {
    const a = landmark(ctx.frames[i - 1], landmarkIndex);
    const b = landmark(ctx.frames[i], landmarkIndex);
    const dt = ctx.frames[i].time - ctx.frames[i - 1].time;
    if (!a || !b || dt <= 0) continue;
    values.push({ time: ctx.frames[i].time, speed: distance(a, b) / dt });
  }
  return maxBy(values, (v) => v.speed)?.time ?? null;
}

function headMoveRatio(ctx: EvaluationContext, startIndex: number, endIndex: number): number | null {
  const start = ctx.frames[Math.max(0, startIndex)];
  const end = ctx.frames[Math.min(ctx.frames.length - 1, endIndex)];
  const a = headCenter(start);
  const b = headCenter(end);
  return a && b ? distance(a, b) / ctx.bodyScale : null;
}

function neckTiltAt(frame: TrackedFrame | null): number | null {
  if (!frame) return null;
  const head = headCenter(frame);
  const shoulder = shoulderCenter(frame);
  if (!head || !shoulder) return null;
  return Math.abs(90 - Math.abs(calculateTiltDegrees(shoulder, head)));
}

function wristPathAngleRange(ctx: EvaluationContext): number | null {
  const hit = wristHeightFrame(ctx);
  if (!hit) return null;
  const side = hittingSide(hit);
  if (!side) return null;
  const j = jointForSide(side);
  const f = framesOf(ctx, "descent");
  const angles = f.map((frame) => angleAt(frame, j.wrist, j.shoulder, side === "right" ? L.rightHip : L.leftHip)).filter((v): v is number => v !== null);
  return range(angles);
}

function wristPathLength(ctx: EvaluationContext): number | null {
  const hit = wristHeightFrame(ctx);
  if (!hit) return null;
  const side = hittingSide(hit);
  if (!side) return null;
  const j = jointForSide(side);
  const f = framesOf(ctx, "descent");
  let total = 0;
  let last: TrackedLandmark | null = null;
  for (const frame of f) {
    const w = landmark(frame, j.wrist);
    if (w && last) total += distance(last, w);
    if (w) last = w;
  }
  return total / ctx.bodyScale;
}

function landingFootTimingDiff(ctx: EvaluationContext): number | null {
  const start = Math.max(0, ctx.engine.events.landingIndex - 4);
  const end = Math.min(ctx.frames.length - 1, ctx.engine.events.landingIndex + 6);
  const slice = ctx.frames.slice(start, end + 1);
  const baseline = Math.max(...ctx.frames.map((f) => Math.max(landmark(f, L.leftAnkle)?.y ?? 0, landmark(f, L.rightAnkle)?.y ?? 0)));
  const threshold = baseline - ctx.bodyScale * 0.2;
  const contactTime = (index: number) => {
    for (const f of slice) {
      const p = landmark(f, index);
      if (p && p.y >= threshold) return f.time;
    }
    return null;
  };
  const left = contactTime(L.leftAnkle);
  const right = contactTime(L.rightAnkle);
  return left !== null && right !== null ? Math.abs(left - right) * 1000 : null;
}

function landingMove(ctx: EvaluationContext, axis: "x" | "y"): number | null {
  const f = framesOf(ctx, "landing");
  if (f.length < 2) return null;
  return Math.abs(f[f.length - 1][axis === "x" ? "centerX" : "centerY"] - f[0][axis === "x" ? "centerX" : "centerY"]) / ctx.bodyScale;
}

function stabilizeTime(ctx: EvaluationContext): number | null {
  const f = framesOf(ctx, "landing");
  if (f.length < 4) return null;
  const speeds: Array<{ time: number; speed: number }> = [];
  for (let i = 1; i < f.length; i += 1) {
    const dt = f[i].time - f[i - 1].time;
    if (dt <= 0) continue;
    speeds.push({ time: f[i].time, speed: Math.hypot(f[i].centerX - f[i - 1].centerX, f[i].centerY - f[i - 1].centerY) / dt });
  }
  const base = median(speeds.map((s) => s.speed));
  if (base === null) return null;
  const threshold = Math.max(base, 35);
  const stable = speeds.find((s) => s.speed <= threshold);
  return stable ? (stable.time - f[0].time) * 1000 : (f[f.length - 1].time - f[0].time) * 1000;
}

/**
 * 総合スコア・改善優先順位の算出から除外するカテゴリ。
 * 着地は安全性・参考評価として表示は維持しつつ、スパイクの総合評価には含めない。
 */
const SCORE_EXCLUDED_CATEGORIES: EvaluationCategoryId[] = ["landing"];

export function evaluateSpikeForm(frames: TrackedFrame[], selectedForm: SpikeArmForm): SpikeFormEvaluationResult | null {
  if (frames.length < 8) return null;
  const engine = runJumpPhaseEngine(frames);
  if (!engine) return null;
  const scales = frames.map(bodyScale).filter((v): v is number => v !== null);
  const scale = median(scales) ?? 100;
  const duration = frames[frames.length - 1].time - frames[0].time;
  const fps = duration > 0 ? frames.length / duration : 30;
  const ctx: EvaluationContext = { frames, engine, bodyScale: scale, fps };

  const metrics = metricDefinitions.map((definition): EvaluationMetric => {
    const rawValue = definition.measure(ctx);
    const value = rawValue === null ? null : rawValue;
    const target = definition.targetByForm[selectedForm];
    const score = value === null ? null : (definition.score ?? scoreValue)(value, target);
    const phase = findEnginePhase(engine, definition.phase);
    const confidence = value === null ? 0 : phase ? clamp((phase.endIndex - phase.startIndex + 1) / 5, 0.35, 1) : 0.45;
    const description =
      value !== null && score !== null && definition.describe
        ? definition.describe(value, score)
        : definition.description;
    return {
      id: definition.id,
      label: definition.label,
      category: definition.category,
      value,
      unit: definition.unit,
      score,
      weight: definition.weight,
      confidence,
      description,
    };
  });

  const categories = (Object.keys(CATEGORY_LABELS) as EvaluationCategoryId[]).map((id) => {
    const categoryMetrics = metrics.filter((m) => m.category === id);
    const score = weightedScore(categoryMetrics);
    return {
      id,
      label: CATEGORY_LABELS[id],
      score,
      weight: CATEGORY_WEIGHTS[id],
      metrics: categoryMetrics,
    };
  });

  // 着地は安全性・参考評価として扱い、スパイクの総合スコアには影響させない。
  const overallScore = weightedScore(
    categories
      .filter((c) => !SCORE_EXCLUDED_CATEGORIES.includes(c.id))
      .map((c) => ({ score: c.score, weight: c.weight, confidence: 1 }))
  );
  const validMetrics = metrics.filter((m) => m.score !== null);
  const confidence = validMetrics.length / metrics.length;
  const priorityMetrics = [...validMetrics]
    .filter((m) => !SCORE_EXCLUDED_CATEGORIES.includes(m.category))
    .filter((m) => (m.score ?? 100) < 78)
    .sort((a, b) => (a.score ?? 100) - (b.score ?? 100))
    .slice(0, 5);

  // 空中姿勢スコア・星評価は airPosture カテゴリの score をそのまま使う（別箇所での再計算はしない）。
  const airPostureCategory = categories.find((c) => c.id === "airPosture") ?? null;
  const aerialPostureScore = airPostureCategory?.score ?? null;
  const aerialPostureStars = aerialPostureScore === null ? null : scoreToStars(aerialPostureScore);

  logAerialPostureDebug(ctx, airPostureCategory, aerialPostureScore, aerialPostureStars);

  return {
    selectedForm,
    selectedFormLabel: FORM_LABELS[selectedForm],
    overallScore,
    confidence,
    categories,
    priorityMetrics,
    note: "この評価は通常動画の2D姿勢推定から数値化できる項目だけで採点しています。力感・力み・指先への力伝達などの感覚項目は含めていません。",
    aerialPostureScore,
    aerialPostureStars,
  };
}

/**
 * 開発環境専用のデバッグ出力。40°が星1になるような回帰を早期発見できるよう、
 * 測定値→スコア→星評価までの内訳を一括で確認できるようにする。
 * 本番ビルド（import.meta.env.DEV === false）では何も出力しない。
 */
function logAerialPostureDebug(
  ctx: EvaluationContext,
  airPostureCategory: EvaluationCategory | null,
  aerialPostureScore: number | null,
  aerialPostureStars: StarRating | null
): void {
  if (!import.meta.env.DEV) return;
  if (!airPostureCategory) return;

  const peakFrame = eventFrame(ctx, "peakIndex");
  const byId = (id: string) => airPostureCategory.metrics.find((m) => m.id === id) ?? null;

  console.debug("[airPosture]", {
    peakFrameIndex: ctx.engine.events.peakIndex,
    peakFrameTime: peakFrame?.time ?? null,
    lineAngleDeg: byId("aerialLineAngle")?.value ?? null,
    lineAngleScore: byId("aerialLineAngle")?.score ?? null,
    alignmentRatio: byId("aerialLineAlignment")?.value ?? null,
    alignmentScore: byId("aerialLineAlignment")?.score ?? null,
    trunkStabilityVariationDeg: byId("aerialTrunkStability")?.value ?? null,
    trunkStabilityScore: byId("aerialTrunkStability")?.score ?? null,
    aerialPostureScore,
    aerialPostureStars,
  });
}

function weightedScore(items: Array<{ score: number | null; weight: number; confidence?: number }>): number | null {
  let total = 0;
  let weightSum = 0;
  for (const item of items) {
    if (item.score === null) continue;
    const w = item.weight * (item.confidence ?? 1);
    total += item.score * w;
    weightSum += w;
  }
  return weightSum > 0 ? total / weightSum : null;
}

export function formatMetricValue(metric: EvaluationMetric): string {
  if (metric.value === null) return "未計測";
  if (metric.unit === "deg") return `${metric.value.toFixed(1)}°`;
  if (metric.unit === "ms") return `${metric.value.toFixed(0)}ms`;
  if (metric.unit === "ratio") return `${(metric.value * 100).toFixed(0)}%`;
  if (metric.unit === "pxPerSec") return `${metric.value.toFixed(0)}px/s`;
  if (metric.unit === "px") return `${metric.value.toFixed(0)}px`;
  return metric.value.toFixed(2);
}
