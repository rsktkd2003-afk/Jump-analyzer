import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrackedFrame, TrackedLandmark } from "./poseTypes";
import type { JumpEvents } from "./groundContact";
import type { EnginePhase, EnginePhaseName, JumpPhaseEngineResult } from "./jumpPhaseEngine";

vi.mock("./jumpPhaseEngine", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./jumpPhaseEngine")>();
  return { ...actual, runJumpPhaseEngine: vi.fn() };
});

import { runJumpPhaseEngine } from "./jumpPhaseEngine";
import {
  countDirectionReversals,
  evaluateSpikeForm,
  formatMetricValue,
  scoreAerialAlignment,
  scoreAerialAngle,
  scoreExtraMotion,
  scoreToStars,
  TRUNK_WOBBLE_MIN_AMPLITUDE_DEG,
  WOBBLE_MIN_FRAME_GAP,
  WOBBLE_SMOOTHING_WINDOW,
  type EvaluationCategoryId,
  type EvaluationMetric,
  type SpikeArmForm,
} from "./spikeFormEvaluation";
import { movingAverage } from "./poseMath";

const mockedRunJumpPhaseEngine = vi.mocked(runJumpPhaseEngine);

// =============================================================
// scoreAerialAlignment: 一直線性(0が理想)→0〜100の区分線形変換。
// 境界: ALIGNMENT_EXCELLENT_MAX=0.04, ALIGNMENT_GOOD_MAX=0.08, ALIGNMENT_FAIR_MAX=0.13
// (すべて<=側に含む連続関数。実装をスクリプトで実行し値を確認済み)
// =============================================================
describe("scoreAerialAlignment", () => {
  it("0(完全一直線)は100", () => {
    expect(scoreAerialAlignment(0)).toBeCloseTo(100);
  });

  it("0.04境界の直前・一致・直後", () => {
    expect(scoreAerialAlignment(0.035)).toBeCloseTo(91.25);
    expect(scoreAerialAlignment(0.04)).toBeCloseTo(90);
    expect(scoreAerialAlignment(0.045)).toBeCloseTo(87.5);
  });

  it("0.08境界の直前・一致・直後", () => {
    expect(scoreAerialAlignment(0.075)).toBeCloseTo(72.5);
    expect(scoreAerialAlignment(0.08)).toBeCloseTo(70);
    expect(scoreAerialAlignment(0.085)).toBeCloseTo(67.5);
  });

  it("0.13境界の直前・一致・直後", () => {
    expect(scoreAerialAlignment(0.125)).toBeCloseTo(47.5);
    expect(scoreAerialAlignment(0.13)).toBeCloseTo(45);
    expect(scoreAerialAlignment(0.135)).toBeCloseTo(42.5);
  });

  it("0.22(0.13+POOR_SPAN)以上は0に張り付く(0〜100の範囲を維持)", () => {
    expect(scoreAerialAlignment(0.22)).toBeCloseTo(0);
    expect(scoreAerialAlignment(0.3)).toBeCloseTo(0);
    expect(scoreAerialAlignment(5)).toBeCloseTo(0);
  });
});

// =============================================================
// scoreAerialAngle: 45°理想、偏差5/10/20°が区分境界(すべて<=側)。
// =============================================================
describe("scoreAerialAngle", () => {
  it("45°(理想)は100", () => {
    expect(scoreAerialAngle(45)).toBeCloseTo(100);
  });

  it("40〜50°(偏差5以内)は理想帯としてすべて90以上", () => {
    expect(scoreAerialAngle(40)).toBeCloseTo(90);
    expect(scoreAerialAngle(50)).toBeCloseTo(90);
  });

  it("偏差5境界の直前・直後(39.5°/50.5°)", () => {
    expect(scoreAerialAngle(39.5)).toBeCloseTo(88);
    expect(scoreAerialAngle(50.5)).toBeCloseTo(88);
  });

  it("偏差10境界の直前・一致・直後", () => {
    expect(scoreAerialAngle(35.5)).toBeCloseTo(72);
    expect(scoreAerialAngle(35)).toBeCloseTo(70);
    expect(scoreAerialAngle(34.5)).toBeCloseTo(68.5);
  });

  it("偏差20境界の直前・一致・直後", () => {
    expect(scoreAerialAngle(25.5)).toBeCloseTo(41.5);
    expect(scoreAerialAngle(25)).toBeCloseTo(40);
    expect(scoreAerialAngle(24.5)).toBeCloseTo(39);
  });

  it("理想角から離れるほどスコアが単調に下がる", () => {
    const scores = [45, 40, 35, 25, 5].map((a) => scoreAerialAngle(a));
    for (let i = 1; i < scores.length; i += 1) {
      expect(scores[i]).toBeLessThan(scores[i - 1]);
    }
  });

  it("偏差40以上は0に張り付く(0〜100の範囲を維持)", () => {
    expect(scoreAerialAngle(5)).toBeCloseTo(0);
    expect(scoreAerialAngle(85)).toBeCloseTo(0);
    expect(scoreAerialAngle(145)).toBeCloseTo(0);
  });
});

// =============================================================
// scoreExtraMotion: Math.round→clamp(0,4)→[100,80,55,30,10]
// =============================================================
describe("scoreExtraMotion", () => {
  it("反転0回から4回以上までの対応表", () => {
    expect(scoreExtraMotion(0)).toBe(100);
    expect(scoreExtraMotion(1)).toBe(80);
    expect(scoreExtraMotion(2)).toBe(55);
    expect(scoreExtraMotion(3)).toBe(30);
    expect(scoreExtraMotion(4)).toBe(10);
  });

  it("4回を超えても最下位(10)のまま", () => {
    expect(scoreExtraMotion(5)).toBe(10);
    expect(scoreExtraMotion(10)).toBe(10);
  });

  it("負数はMath.roundしてから0にクランプされる(0回と同じ扱い)", () => {
    expect(scoreExtraMotion(-1)).toBe(100);
    expect(scoreExtraMotion(-0.5)).toBe(100);
  });

  it("小数はMath.roundで丸めてから引く(JSの四捨五入は0.5を+方向に丸める)", () => {
    expect(scoreExtraMotion(0.5)).toBe(80); // round(0.5)=1
    expect(scoreExtraMotion(1.5)).toBe(55); // round(1.5)=2
    expect(scoreExtraMotion(2.4)).toBe(55); // round(2.4)=2
    expect(scoreExtraMotion(2.6)).toBe(30); // round(2.6)=3
    expect(scoreExtraMotion(3.6)).toBe(10); // round(3.6)=4
  });
});

// =============================================================
// scoreToStars: STAR_SCORE_THRESHOLDS = {5:90, 4:75, 3:60, 2:40}（すべて>=）
// =============================================================
describe("scoreToStars", () => {
  it("星5境界(90)の直前・一致・直後", () => {
    expect(scoreToStars(89.999)).toBe(4);
    expect(scoreToStars(90)).toBe(5);
    expect(scoreToStars(90.001)).toBe(5);
  });

  it("星4境界(75)の直前・一致・直後", () => {
    expect(scoreToStars(74.999)).toBe(3);
    expect(scoreToStars(75)).toBe(4);
    expect(scoreToStars(75.001)).toBe(4);
  });

  it("星3境界(60)の直前・一致・直後", () => {
    expect(scoreToStars(59.999)).toBe(2);
    expect(scoreToStars(60)).toBe(3);
    expect(scoreToStars(60.001)).toBe(3);
  });

  it("星2境界(40)の直前・一致・直後", () => {
    expect(scoreToStars(39.999)).toBe(1);
    expect(scoreToStars(40)).toBe(2);
    expect(scoreToStars(40.001)).toBe(2);
  });

  it("0未満・100超・NaNの現在の挙動", () => {
    expect(scoreToStars(0)).toBe(1);
    expect(scoreToStars(-5)).toBe(1);
    expect(scoreToStars(100)).toBe(5);
    expect(scoreToStars(150)).toBe(5);
    expect(scoreToStars(NaN)).toBe(1); // NaNとの比較は常にfalseになり、最終的にreturn 1へ落ちる
  });
});

// =============================================================
// countDirectionReversals: 転換点検出→同種はminFrameGap未満で統合→
// 種類変化はminAmplitude未満で棄却。
// =============================================================
describe("countDirectionReversals", () => {
  it("3点未満は常に0", () => {
    expect(countDirectionReversals([], 1, 1)).toBe(0);
    expect(countDirectionReversals([1], 1, 1)).toBe(0);
    expect(countDirectionReversals([1, 2], 1, 1)).toBe(0);
  });

  it("単調増加は反転0回", () => {
    expect(countDirectionReversals([1, 2, 3, 4, 5], 1, 1)).toBe(0);
  });

  it("単調減少は反転0回", () => {
    expect(countDirectionReversals([5, 4, 3, 2, 1], 1, 1)).toBe(0);
  });

  it("一定値は反転0回", () => {
    expect(countDirectionReversals([5, 5, 5, 5, 5], 1, 1)).toBe(0);
  });

  it("大きな方向反転は正しくカウントされる", () => {
    expect(countDirectionReversals([0, 10, 0, 10, 0], 1, 1)).toBe(2);
  });

  it("最小振幅(minAmplitude)未満の小さな揺れは無視する(境界の直前・一致・直後)", () => {
    const series = [10, 10.5, 10, 10.5, 10]; // 隣接転換点の振れ幅は常に0.5
    expect(countDirectionReversals(series, 0.49, 2)).toBe(2); // 0.5>=0.49 → 採用
    expect(countDirectionReversals(series, 0.5, 2)).toBe(2); // 0.5>=0.5 → 採用(境界一致)
    expect(countDirectionReversals(series, 0.51, 2)).toBe(0); // 0.5<0.51 → 棄却
  });

  it("最小フレーム間隔(minFrameGap)未満の同種転換点は統合される(minAmplitude=0で振幅フィルタを無効化し単独で検証)", () => {
    // [0,10,10,10,0]: index1とindex3に同種(peak)の転換点が生じ、間隔は2
    const series = [0, 10, 10, 10, 0];
    expect(countDirectionReversals(series, 0, 1)).toBe(1); // gap(2)<1は偽 → 統合されない
    expect(countDirectionReversals(series, 0, 2)).toBe(1); // gap(2)<2は偽(境界一致) → 統合されない
    expect(countDirectionReversals(series, 0, 3)).toBe(0); // gap(2)<3は真 → 統合される
  });

  it("仕様書の例A: 14→15→16→15→14(体幹の想定パラメータで平滑化)は低反転数として扱う", () => {
    const smoothed = movingAverage([14, 15, 16, 15, 14], WOBBLE_SMOOTHING_WINDOW);
    expect(
      countDirectionReversals(smoothed, TRUNK_WOBBLE_MIN_AMPLITUDE_DEG, WOBBLE_MIN_FRAME_GAP)
    ).toBe(0);
  });

  it("仕様書の例B: 5→15→2→18→6(体幹の想定パラメータで平滑化)は複数回の反転を検出する", () => {
    const smoothed = movingAverage([5, 15, 2, 18, 6], WOBBLE_SMOOTHING_WINDOW);
    expect(
      countDirectionReversals(smoothed, TRUNK_WOBBLE_MIN_AMPLITUDE_DEG, WOBBLE_MIN_FRAME_GAP)
    ).toBe(2);
  });

  it("仕様書の例C: 10→20→30→40→50(単調増加, 体幹の想定パラメータで平滑化)は反転0回", () => {
    const smoothed = movingAverage([10, 20, 30, 40, 50], WOBBLE_SMOOTHING_WINDOW);
    expect(
      countDirectionReversals(smoothed, TRUNK_WOBBLE_MIN_AMPLITUDE_DEG, WOBBLE_MIN_FRAME_GAP)
    ).toBe(0);
  });
});

// =============================================================
// formatMetricValue: 単位ごとの表示文字列。null→"未計測"。
// =============================================================
describe("formatMetricValue", () => {
  function makeMetric(value: number | null, unit: EvaluationMetric["unit"]): EvaluationMetric {
    return {
      id: "test",
      label: "テスト",
      category: "approach",
      value,
      unit,
      score: null,
      weight: 1,
      confidence: 1,
      description: "",
    };
  }

  it("valueがnullなら単位に関わらず未計測", () => {
    expect(formatMetricValue(makeMetric(null, "deg"))).toBe("未計測");
    expect(formatMetricValue(makeMetric(null, "ratio"))).toBe("未計測");
  });

  it("deg: 小数第1位+度記号", () => {
    expect(formatMetricValue(makeMetric(45.06, "deg"))).toBe("45.1°");
    expect(formatMetricValue(makeMetric(45.04, "deg"))).toBe("45.0°");
    expect(formatMetricValue(makeMetric(-12.34, "deg"))).toBe("-12.3°");
  });

  it("ms: 整数+ms", () => {
    expect(formatMetricValue(makeMetric(219.4, "ms"))).toBe("219ms");
    expect(formatMetricValue(makeMetric(219.6, "ms"))).toBe("220ms");
    expect(formatMetricValue(makeMetric(0, "ms"))).toBe("0ms");
  });

  it("ratio: 100倍して整数+%", () => {
    expect(formatMetricValue(makeMetric(0.567, "ratio"))).toBe("57%");
    expect(formatMetricValue(makeMetric(0.5, "ratio"))).toBe("50%");
    expect(formatMetricValue(makeMetric(0, "ratio"))).toBe("0%");
  });

  it("pxPerSec: 整数+px/s", () => {
    expect(formatMetricValue(makeMetric(123.456, "pxPerSec"))).toBe("123px/s");
    expect(formatMetricValue(makeMetric(123.6, "pxPerSec"))).toBe("124px/s");
  });

  it("px: 整数+px", () => {
    expect(formatMetricValue(makeMetric(45.6, "px"))).toBe("46px");
  });

  it("index(その他)は小数第2位までのそのままの数値", () => {
    expect(formatMetricValue(makeMetric(1.23456, "index"))).toBe("1.23");
    expect(formatMetricValue(makeMetric(0, "index"))).toBe("0.00");
    // JSの浮動小数点表現により1.005.toFixed(2)は"1.01"ではなく"1.00"になる(現在の挙動として固定する)
    expect(formatMetricValue(makeMetric(1.005, "index"))).toBe("1.00");
  });
});

// =============================================================
// evaluateSpikeForm: 決定的なフレーム列 + モックしたjumpPhaseEngineの
// 出力を組み合わせて、カテゴリ集計・除外ロジック・欠測処理・不変性・
// 再現性を検証する。groundContact/jumpPhaseEngine自体の実ジャンプ検出は
// groundContact.test.ts / jumpPhaseEngine.test.ts で別途検証済みのため、
// ここではrunJumpPhaseEngineをモックしてevaluateSpikeForm自体の
// 集計ロジックだけを切り出して検証する。
// =============================================================

const CY_BY_FRAME = [
  400, 400, 400, 400, 400, 400, 400, // approach 0-6
  410, 420, 380, // takeoff 7-9
  320, 260, 220, // ascent 10-12
  200, // peak 13
  205, 215, // contact 14-15
  260, 320, 380, 400, // descent 16-19
  400, 405, // landing 20-21
  400, 400, // finish 22-23
];

const CX_BY_FRAME = [
  100, 120, 140, 160, 180, 200, 220, // approach
  230, 235, 235, // takeoff
  240, 245, 250, // ascent
  250, // peak
  252, 254, // contact
  256, 258, 260, 262, // descent
  264, 264, // landing
  264, 264, // finish
];

const SPIKE_ARM_FRAME_INDEXES = new Set([12, 13, 14]);

const TAKEOFF_INDEX = 7;
const PEAK_INDEX = 13;
const LANDING_INDEX = 20;
const LANDING_END_INDEX = 21;

const PHASE_RANGES: Array<{ name: EnginePhaseName; start: number; end: number }> = [
  { name: "approach", start: 0, end: 6 },
  { name: "takeoff", start: 7, end: 9 },
  { name: "ascent", start: 10, end: 12 },
  { name: "peak", start: 13, end: 13 },
  { name: "contact", start: 14, end: 15 },
  { name: "descent", start: 16, end: 19 },
  { name: "landing", start: 20, end: 21 },
  { name: "finish", start: 22, end: 23 },
];

type LandmarkOptions = {
  /** trueなら手・肘・膝・足首・踵・つま先・耳のランドマークを欠測(visibility 0)にする */
  sparse?: boolean;
  /** takeoffIndexフレームの両膝(25,26)だけvisibilityを上書きする(0.35境界テスト用) */
  kneeVisibilityAtTakeoff?: number;
};

function buildLandmarks(cx: number, cy: number, armRaised: boolean, options: LandmarkOptions = {}): TrackedLandmark[] {
  const landmarks: TrackedLandmark[] = Array.from({ length: 33 }, () => ({ x: cx, y: cy, visibility: 1 }));
  const set = (index: number, x: number, y: number, visibility = 1) => {
    landmarks[index] = { x, y, visibility };
  };

  const limbVisibility = options.sparse ? 0 : 1;

  set(7, cx - 10, cy - 140, limbVisibility); // leftEar
  set(8, cx + 10, cy - 140, limbVisibility); // rightEar
  set(11, cx - 15, cy - 100, 1); // leftShoulder(core, 常に可視)
  set(12, cx + 15, cy - 100, 1); // rightShoulder(core, 常に可視)
  set(13, cx - 20, cy - 60, limbVisibility); // leftElbow
  set(14, armRaised ? cx + 25 : cx + 20, armRaised ? cy - 160 : cy - 60, limbVisibility); // rightElbow
  set(15, cx - 22, cy - 20, limbVisibility); // leftWrist
  set(16, armRaised ? cx + 35 : cx + 22, armRaised ? cy - 230 : cy - 20, limbVisibility); // rightWrist(打つ側)
  set(23, cx - 12, cy, 1); // leftHip(core, 常に可視)
  set(24, cx + 12, cy, 1); // rightHip(core, 常に可視)
  set(25, cx - 13, cy + 60, limbVisibility); // leftKnee
  set(26, cx + 13, cy + 60, limbVisibility); // rightKnee
  set(27, cx - 13, cy + 120, limbVisibility); // leftAnkle
  set(28, cx + 13, cy + 120, limbVisibility); // rightAnkle
  set(29, cx - 15, cy + 125, limbVisibility); // leftHeel
  set(30, cx + 15, cy + 125, limbVisibility); // rightHeel
  set(31, cx - 10, cy + 128, limbVisibility); // leftFoot
  set(32, cx + 10, cy + 128, limbVisibility); // rightFoot

  if (options.kneeVisibilityAtTakeoff !== undefined) {
    landmarks[25] = { ...landmarks[25], visibility: options.kneeVisibilityAtTakeoff };
    landmarks[26] = { ...landmarks[26], visibility: options.kneeVisibilityAtTakeoff };
  }

  return landmarks;
}

/** 助走→踏切→上昇→最高点→打球→下降→着地→終了、の24フレームを持つ決定的なフレーム列を作る */
function buildFrames(options: LandmarkOptions = {}): TrackedFrame[] {
  return CY_BY_FRAME.map((cy, index) => {
    const cx = CX_BY_FRAME[index];
    const armRaised = SPIKE_ARM_FRAME_INDEXES.has(index);
    const frameOptions =
      options.kneeVisibilityAtTakeoff !== undefined && index === TAKEOFF_INDEX
        ? options
        : { sparse: options.sparse };

    return {
      frameIndex: index,
      time: index * 0.1,
      landmarks: buildLandmarks(cx, cy, armRaised, frameOptions),
      crop: { x: 0, y: 0, width: 800, height: 600 },
      centerX: cx,
      centerY: cy,
      leftKneeAngle: index >= 7 && index <= 9 ? 110 : 165,
      rightKneeAngle: index >= 7 && index <= 9 ? 110 : 165,
      hipAngle: 160,
      shoulderTilt: 0,
      leftHipAngle: 160,
      rightHipAngle: 160,
      leftElbowAngle: 150,
      rightElbowAngle: 150,
      leftShoulderAngle: 90,
      rightShoulderAngle: armRaised ? 170 : 90,
    };
  });
}

function buildEvents(frameCount: number): JumpEvents {
  return {
    valid: true,
    baselineComY: 400,
    groundY: 530,
    sinkStartIndex: 7,
    sinkBottomIndex: 8,
    takeoffIndex: TAKEOFF_INDEX,
    peakIndex: PEAK_INDEX,
    landingIndex: LANDING_INDEX,
    landingEndIndex: LANDING_END_INDEX,
    airTimeSec: 1.3,
    risePx: 200,
    sinkPx: 20,
    torsoPx: 100,
    grounded: Array(frameCount).fill(true),
    comY: Array(frameCount).fill(400),
    comVelocity: Array(frameCount).fill(0),
    comAcceleration: Array(frameCount).fill(0),
    comX: Array(frameCount).fill(200),
    footY: Array(frameCount).fill(520),
    footVelocity: Array(frameCount).fill(0),
    interpolatedRatio: 0,
    lowConfidenceFrames: new Set<number>(),
  };
}

function buildEngineResult(frames: TrackedFrame[]): JumpPhaseEngineResult {
  const phases: EnginePhase[] = PHASE_RANGES.map(({ name, start, end }) => ({
    name,
    startIndex: start,
    endIndex: end,
    startTime: frames[start].time,
    endTime: frames[end].time,
  }));
  return { phases, events: buildEvents(frames.length) };
}

function categoryScore(result: NonNullable<ReturnType<typeof evaluateSpikeForm>>, id: EvaluationCategoryId) {
  return result.categories.find((c) => c.id === id) ?? null;
}

function metricById(result: NonNullable<ReturnType<typeof evaluateSpikeForm>>, id: string): EvaluationMetric | null {
  for (const category of result.categories) {
    const found = category.metrics.find((m) => m.id === id);
    if (found) return found;
  }
  return null;
}

describe("evaluateSpikeForm", () => {
  beforeEach(() => {
    mockedRunJumpPhaseEngine.mockReset();
  });

  it("frames.length<8はnull(runJumpPhaseEngineを呼ばない)", () => {
    const frames = buildFrames().slice(0, 7);

    expect(evaluateSpikeForm(frames, "straightArm")).toBeNull();
    expect(mockedRunJumpPhaseEngine).not.toHaveBeenCalled();
  });

  it("runJumpPhaseEngineがnull(ジャンプ未検出)を返す場合はnull", () => {
    const frames = buildFrames();
    mockedRunJumpPhaseEngine.mockReturnValue(null);

    expect(evaluateSpikeForm(frames, "straightArm")).toBeNull();
  });

  it("カテゴリの並び・ID・ラベル・重みが仕様どおり", () => {
    const frames = buildFrames();
    mockedRunJumpPhaseEngine.mockReturnValue(buildEngineResult(frames));

    const result = evaluateSpikeForm(frames, "straightArm");

    expect(result).not.toBeNull();
    if (!result) return;

    expect(result.categories.map((c) => ({ id: c.id, label: c.label, weight: c.weight }))).toEqual([
      { id: "approach", label: "助走", weight: 1.0 },
      { id: "takeoff", label: "踏切", weight: 1.25 },
      { id: "flight", label: "ジャンプ", weight: 1.0 },
      { id: "takeback", label: "テイクバック", weight: 1.05 },
      { id: "hit", label: "打撃", weight: 1.25 },
      { id: "airPosture", label: "空中姿勢", weight: 0.9 },
      { id: "followThrough", label: "フォロースルー", weight: 0.65 },
      { id: "landing", label: "着地", weight: 0.85 },
      { id: "efficiency", label: "ジャンプ効率", weight: 1.1 },
    ]);
  });

  it("着地カテゴリはcategoriesに残るが、overallScoreの計算からは除外される", () => {
    const frames = buildFrames();
    mockedRunJumpPhaseEngine.mockReturnValue(buildEngineResult(frames));

    const result = evaluateSpikeForm(frames, "straightArm");

    expect(result).not.toBeNull();
    if (!result) return;

    const landing = categoryScore(result, "landing");
    expect(landing).not.toBeNull();

    // overallScoreは「landing以外のカテゴリ」だけのweightedScore(confidence=1)である、
    // という実装の集計式そのものを、返り値から再計算して検証する。
    const nonLanding = result.categories.filter((c) => c.id !== "landing");
    let total = 0;
    let weightSum = 0;
    for (const c of nonLanding) {
      if (c.score === null) continue;
      total += c.score * c.weight;
      weightSum += c.weight;
    }
    const expectedOverall = weightSum > 0 ? total / weightSum : null;

    expect(result.overallScore).not.toBeNull();
    expect(result.overallScore).toBeCloseTo(expectedOverall as number, 6);

    // landingを含めて再計算すると異なる値になること(=本当に除外されていること)も確認する
    if (landing?.score !== null && landing) {
      const withLandingTotal = total + landing.score * landing.weight;
      const withLandingWeightSum = weightSum + landing.weight;
      const withLanding = withLandingTotal / withLandingWeightSum;
      expect(result.overallScore).not.toBeCloseTo(withLanding, 6);
    }
  });

  it("3種類のSpikeArmFormすべてでクラッシュせず有効な結果を返す", () => {
    const forms: SpikeArmForm[] = ["straightArm", "bowAndArrow", "circularArm"];
    for (const form of forms) {
      const frames = buildFrames();
      mockedRunJumpPhaseEngine.mockReturnValue(buildEngineResult(frames));

      const result = evaluateSpikeForm(frames, form);

      expect(result).not.toBeNull();
      if (!result) continue;
      expect(result.selectedForm).toBe(form);
      expect(result.categories).toHaveLength(9);
      if (result.overallScore !== null) {
        expect(result.overallScore).toBeGreaterThanOrEqual(0);
        expect(result.overallScore).toBeLessThanOrEqual(100);
      }
    }
  });

  it("十分なランドマークがあるフレームでは、位置ベース・角度ベース双方の代表的な指標が測定できる", () => {
    const frames = buildFrames();
    mockedRunJumpPhaseEngine.mockReturnValue(buildEngineResult(frames));

    const result = evaluateSpikeForm(frames, "straightArm");

    expect(result).not.toBeNull();
    if (!result) return;

    for (const id of ["approachSpeed", "contactTime", "peakHeight", "flightTime", "elbowHeight", "aerialLineAlignment", "aerialLineAngle"]) {
      const metric = metricById(result, id);
      expect(metric, `${id} should exist`).not.toBeNull();
      expect(metric?.value, `${id} should be measurable`).not.toBeNull();
      expect(metric?.score).not.toBeNull();
    }
  });

  it("手足・肘・膝・耳などのランドマークが欠測している場合、それらに依存する指標はnullになる", () => {
    const frames = buildFrames({ sparse: true });
    mockedRunJumpPhaseEngine.mockReturnValue(buildEngineResult(frames));

    const result = evaluateSpikeForm(frames, "straightArm");

    expect(result).not.toBeNull();
    if (!result) return;

    // 肘・膝・足首・つま先などに依存する指標は欠測時にnullになる
    for (const id of ["elbowHeight", "kneeValgus", "aerialLineAlignment", "aerialLineAngle"]) {
      const metric = metricById(result, id);
      expect(metric?.value, `${id} should be null when limbs are missing`).toBeNull();
      expect(metric?.score, `${id} score should be null when value is null`).toBeNull();
    }

    // aerialExtraMotionは体幹(肩・腰=core)だけでも測定できるため、
    // 足のランドマークが欠測していても0(反転なし)として測定できてしまう。
    // これは「core以外は全欠測」という本テストのシナリオ特有の挙動であり、意図的にそのまま固定する。
    expect(metricById(result, "aerialExtraMotion")?.value).toBe(0);

    // frame.centerX/centerY/time など、肩・腰(core)だけで測れる指標は欠測の影響を受けない
    for (const id of ["approachSpeed", "flightTime"]) {
      const metric = metricById(result, id);
      expect(metric?.value, `${id} should remain measurable`).not.toBeNull();
    }
  });

  it("visibility 0.35は有効な骨格点として扱う(境界一致)", () => {
    const frames = buildFrames({ kneeVisibilityAtTakeoff: 0.35 });
    mockedRunJumpPhaseEngine.mockReturnValue(buildEngineResult(frames));

    const result = evaluateSpikeForm(frames, "straightArm");

    expect(result).not.toBeNull();
    if (!result) return;
    expect(metricById(result, "hipExtension")?.value).not.toBeNull();
  });

  it("visibility 0.349未満は無効な骨格点として扱う(境界直後)", () => {
    const frames = buildFrames({ kneeVisibilityAtTakeoff: 0.349 });
    mockedRunJumpPhaseEngine.mockReturnValue(buildEngineResult(frames));

    const result = evaluateSpikeForm(frames, "straightArm");

    expect(result).not.toBeNull();
    if (!result) return;
    expect(metricById(result, "hipExtension")?.value).toBeNull();
  });

  it("入力framesを変更しない", () => {
    const frames = buildFrames();
    mockedRunJumpPhaseEngine.mockReturnValue(buildEngineResult(frames));
    const snapshot = JSON.parse(JSON.stringify(frames));

    evaluateSpikeForm(frames, "straightArm");

    expect(JSON.parse(JSON.stringify(frames))).toEqual(snapshot);
  });

  it("同じ入力では同じ結果になる(決定的)", () => {
    const framesA = buildFrames();
    const framesB = buildFrames();
    mockedRunJumpPhaseEngine.mockReturnValue(buildEngineResult(framesA));
    const resultA = evaluateSpikeForm(framesA, "bowAndArrow");

    mockedRunJumpPhaseEngine.mockReturnValue(buildEngineResult(framesB));
    const resultB = evaluateSpikeForm(framesB, "bowAndArrow");

    expect(resultA).not.toBeNull();
    expect(resultB).not.toBeNull();
    // lowConfidenceFrames(Set)はJumpEvents側のフィールドでevaluateSpikeFormの戻り値には含まれないため、
    // categories/overallScore/confidence/priorityMetrics等はプレーンなJSON比較で決定性を確認できる。
    expect(JSON.parse(JSON.stringify(resultA))).toEqual(JSON.parse(JSON.stringify(resultB)));
  });
});
