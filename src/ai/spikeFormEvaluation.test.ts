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

// 助走の各歩幅を意図的に不均一にし、approachRhythm等が浮動小数点誤差だけの
// ほぼ0にならず、意味のある固定値を持つようにしている(PR#16でPR#14の値から拡張)。
const CY_BY_FRAME = [
  400, 400, 400, 400, 400, 400, 400, // approach 0-6
  410, 420, 380, // takeoff 7-9
  320, 260, 220, // ascent 10-12
  200, // peak 13
  205, 215, // contact 14-15
  260, 320, 380, 400, // descent 16-19
  400, 408, 403, 400, // landing 20-23(PR#16でlandingStabilizeTimeの測定に必要な4フレームへ拡張)
  400, 400, // finish 24-25
];

const CX_BY_FRAME = [
  100, 122, 141, 165, 183, 201, 220, // approach(不均一な歩幅)
  230, 235, 235, // takeoff
  240, 245, 250, // ascent
  250, // peak
  252, 254, // contact
  256, 258, 260, 262, // descent
  264, 270, 273, 274, // landing
  274, 274, // finish
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
  { name: "landing", start: 20, end: 23 },
  { name: "finish", start: 24, end: 25 },
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

  // =============================================================
  // metricDefinitionsにある51指標すべての value/score/confidence/description を固定する。
  // 期待値は現在の実装(evaluateSpikeForm)を一時スクリプトで実際に実行して取得した値
  // (一時スクリプトはコミットしていない)。代表的な式は以下のとおり手計算とも
  // 突き合わせて検証済み:
  //   approachSpeed: |220-100|/(0.6-0)=200 → 直接一致(浮動小数点誤差のみ)
  //   kneeExtension: avg([110,110])=110、score: clamp((110/168)*100,0,100)=65.476...
  //   peakHeight: takeoff.centerY(410)-peak.centerY(200)=210、score: (210/120)*100>100→100
  //   flightTime: (frames[20].time-frames[7].time)*1000=(2.0-0.7)*1000=1300ms
  //   landingKneeFlexion: avg([165,165])=165、score: 100-(|165-130|/35)*100=0
  //   landingSymmetry: |165-165|=0、score: 100-(0/25)*100=100
  // 51件は metricDefinitions の宣言順(≒カテゴリのグループ順)そのまま。
  // =============================================================

  type ExpectedMetric = {
    id: string;
    category: EvaluationCategoryId;
    label: string;
    unit: EvaluationMetric["unit"];
    weight: number;
    value: number;
    score: number;
    confidence: number;
    description: string;
  };

  const EXPECTED_METRICS_STRAIGHT_ARM: ExpectedMetric[] = [
    { id: "approachSpeed", category: "approach", label: "助走速度", unit: "pxPerSec", weight: 0.9, value: 199.99999999999997, score: 76.92307692307692, confidence: 1, description: "助走区間の重心水平速度。" },
    { id: "approachSpeedRetention", category: "approach", label: "最後2歩の速度維持率", unit: "ratio", weight: 1.15, value: 0.8943089430894308, score: 98.37398373983736, confidence: 1, description: "助走前半に対して後半でどれだけ速度を保てたか。" },
    { id: "approachRhythm", category: "approach", label: "助走リズムの安定", unit: "index", weight: 0.75, value: 0.1118033988749894, score: 100, confidence: 1, description: "助走中の重心速度変動。小さいほど一定リズム。" },
    { id: "approachDirection", category: "approach", label: "助走方向の直線性", unit: "deg", weight: 0.75, value: 0, score: 100, confidence: 1, description: "助走開始から踏切までの進行角度。横へ流れすぎていないか。" },
    { id: "approachLateralDeviation", category: "approach", label: "助走中の左右ブレ", unit: "ratio", weight: 0.8, value: 0, score: 100, confidence: 1, description: "助走軌道からの平均ズレ。" },
    { id: "contactTime", category: "takeoff", label: "接地時間", unit: "ms", weight: 1.2, value: 800, score: 0, confidence: 0.6, description: "最後の踏み込みで両足が接地してから、両足が地面から離れるまでの時間。" },
    { id: "kneeValgus", category: "takeoff", label: "膝の内側倒れ", unit: "ratio", weight: 1.2, value: 0.004166377334907405, score: 100, confidence: 0.6, description: "膝が股関節・足首ラインから内側へ外れる量。" },
    { id: "hipExtension", category: "takeoff", label: "股関節伸展", unit: "deg", weight: 1.05, value: 177.32680074447228, score: 100, confidence: 0.6, description: "離地付近の股関節角度。" },
    { id: "kneeExtension", category: "takeoff", label: "膝伸展", unit: "deg", weight: 1.1, value: 110, score: 65.47619047619048, confidence: 0.6, description: "離地付近の膝角度。" },
    { id: "ankleExtension", category: "takeoff", label: "足関節伸展", unit: "deg", weight: 0.95, value: 159.44395478041653, score: 100, confidence: 0.6, description: "離地付近の足首の底屈に相当する角度。" },
    { id: "takeoffVerticalImpulseIndex", category: "takeoff", label: "重心上向き加速", unit: "pxPerSec", weight: 0.95, value: 500.0000000000001, score: 100, confidence: 0.6, description: "踏切区間での重心Y速度変化。" },
    { id: "takeoffLateralDrift", category: "takeoff", label: "踏切中の左右ブレ", unit: "ratio", weight: 0.85, value: 0.05, score: 100, confidence: 0.6, description: "踏切中の重心水平移動量。" },
    { id: "takeoffAngle", category: "takeoff", label: "離地角度", unit: "deg", weight: 1.0, value: 53.13010235415598, score: 57.60750840769993, confidence: 0.6, description: "離地直前後の重心速度ベクトル角度。" },
    { id: "peakHeight", category: "flight", label: "重心最高位置", unit: "px", weight: 1.1, value: 210, score: 100, confidence: 0.35, description: "離地時から最高点までの重心上昇量。" },
    { id: "flightTime", category: "flight", label: "滞空時間", unit: "ms", weight: 0.95, value: 1299.9999999999998, score: 100, confidence: 0.6, description: "離地から着地までの時間。" },
    { id: "bodyLine", category: "flight", label: "身体一直線性", unit: "deg", weight: 1.0, value: 0, score: 100, confidence: 0.35, description: "頭・肩・腰・足首ラインの曲がり。小さいほど一直線。" },
    { id: "trunkTilt", category: "flight", label: "体幹傾斜", unit: "deg", weight: 0.85, value: 0, score: 100, confidence: 0.35, description: "最高点付近の体幹の前後傾。" },
    { id: "shoulderRotationInFlight", category: "flight", label: "空中の肩回転量", unit: "deg", weight: 0.75, value: 0, score: 0, confidence: 0.6, description: "離地から着地までの肩ライン角度変化。" },
    { id: "flightLateralDrift", category: "flight", label: "空中の左右流れ", unit: "ratio", weight: 0.95, value: 0.34, score: 100, confidence: 0.6, description: "離地から着地までの重心水平移動。" },
    { id: "elbowHeight", category: "takeback", label: "肘高さ", unit: "ratio", weight: 1.0, value: 0.6, score: 100, confidence: 0.35, description: "打つ側の肘が肩よりどれだけ高いか。" },
    { id: "shoulderOpen", category: "takeback", label: "肩の開き", unit: "deg", weight: 1.05, value: 174.35274708568514, score: 0, confidence: 0.35, description: "打つ側の上腕と体幹の角度。" },
    { id: "thoraxRotation", category: "takeback", label: "胸郭回旋", unit: "deg", weight: 1.0, value: 0, score: 0, confidence: 0.35, description: "肩ラインと骨盤ラインの角度差。" },
    { id: "oppositeArmKeep", category: "takeback", label: "逆腕保持", unit: "deg", weight: 0.85, value: 2.124371751343267, score: 0, confidence: 0.35, description: "逆腕が早く下がりすぎていないか。" },
    { id: "hipShoulderSequence", category: "takeback", label: "腰→肩回旋順序", unit: "ms", weight: 0.95, value: 0, score: 38.888888888888886, confidence: 0.4, description: "骨盤回旋ピークから肩回旋ピークまでの時間差。" },
    { id: "elbowLead", category: "hit", label: "肘リード", unit: "ratio", weight: 1.05, value: 0.1, score: 94.28571428571428, confidence: 0.4, description: "インパクト付近で肘が手首より前に出る量。" },
    { id: "proximalDistalTiming", category: "hit", label: "肩→肘→手首の加速順序", unit: "index", weight: 1.15, value: 1, score: 100, confidence: 0.4, description: "最大速度の発生順序が近位から遠位になっているか。" },
    { id: "hitHeightGap", category: "hit", label: "打点高さ", unit: "px", weight: 1.15, value: 0, score: 100, confidence: 0.4, description: "手首最高点と重心最高点の時間的なズレを高さで評価。" },
    { id: "frontContact", category: "hit", label: "身体前方打点", unit: "ratio", weight: 1.0, value: 0.35, score: 100, confidence: 0.4, description: "手首が頭・体幹より前にある量。" },
    { id: "armExtension", category: "hit", label: "インパクト時の腕伸展", unit: "deg", weight: 1.1, value: 178.66778014613058, score: 100, confidence: 0.4, description: "打点付近の肘角度。" },
    { id: "headStabilityHit", category: "hit", label: "打撃時の頭部安定", unit: "ratio", weight: 0.8, value: 0.4589117562233507, score: 67.47058977757261, confidence: 0.4, description: "打撃前後の頭部移動量。" },
    { id: "neckAngle", category: "hit", label: "頸部角度", unit: "deg", weight: 0.65, value: 0, score: 100, confidence: 0.4, description: "顎が上がりすぎていないかを頭部・体幹角度から推定。" },
    { id: "aerialLineAlignment", category: "airPosture", label: "全身ラインの一直線性", unit: "ratio", weight: 0.45, value: 0.057404626584804885, score: 81.29768670759756, confidence: 0.35, description: "打つ側の肩から反対側の足先までが一直線に近く、理想的な空中姿勢です。" },
    { id: "aerialLineAngle", category: "airPosture", label: "全身ラインの角度（対水平45°）", unit: "deg", weight: 0.35, value: 83.74256570185378, score: 2.5148685962924446, confidence: 0.35, description: "全身のラインが立ちすぎており、理想とする45°より大きくなっています。" },
    { id: "aerialExtraMotion", category: "airPosture", label: "余計な動き（揺り戻し）", unit: "index", weight: 0.2, value: 0, score: 100, confidence: 0.35, description: "最高点付近で余計な動き（揺り戻し）は見られません。傾き自体は減点していません。" },
    { id: "followThroughRange", category: "followThrough", label: "腕振り切り", unit: "deg", weight: 0.9, value: 0, score: 0, confidence: 0.8, description: "打点後の肩〜手首角度変化。" },
    { id: "trunkRotationContinue", category: "followThrough", label: "体幹回旋継続", unit: "deg", weight: 0.8, value: 0, score: 0, confidence: 0.8, description: "打点後も肩・骨盤回旋が続いているか。" },
    { id: "wristPathLength", category: "followThrough", label: "腕軌道", unit: "ratio", weight: 0.75, value: 1.4016639940067086, score: 100, confidence: 0.8, description: "打点後の手首軌道長。" },
    { id: "wristDeceleration", category: "followThrough", label: "手首減速率", unit: "ratio", weight: 0.65, value: 0.720134282439739, score: 62.19238168005802, confidence: 0.8, description: "打点後に手首速度が自然に落ちているか。" },
    { id: "landingTimingDiff", category: "landing", label: "左右同時接地", unit: "ms", weight: 1.0, value: 0, score: 100, confidence: 0.8, description: "左右足首の接地推定タイミング差。" },
    { id: "landingFootWidth", category: "landing", label: "着地足幅", unit: "ratio", weight: 0.85, value: 0.26, score: 0, confidence: 0.8, description: "着地時の左右足首幅。" },
    { id: "landingKneeFlexion", category: "landing", label: "着地膝屈曲", unit: "deg", weight: 0.95, value: 165, score: 0, confidence: 0.8, description: "着地時の膝角度。柔らかく使えているか。" },
    { id: "landingHipFlexion", category: "landing", label: "着地股関節屈曲", unit: "deg", weight: 0.8, value: 177.32680074447228, score: 0, confidence: 0.8, description: "着地時の股関節角度。" },
    { id: "landingSymmetry", category: "landing", label: "左右沈み込み差", unit: "deg", weight: 0.9, value: 0, score: 100, confidence: 0.8, description: "左右膝角度の差。" },
    { id: "landingForwardMove", category: "landing", label: "着地後の前後移動", unit: "ratio", weight: 0.75, value: 0.1, score: 100, confidence: 0.8, description: "着地から安定までの重心移動。" },
    { id: "landingSideMove", category: "landing", label: "着地後の左右移動", unit: "ratio", weight: 0.75, value: 0, score: 100, confidence: 0.8, description: "着地後の横ブレ。" },
    { id: "landingStabilizeTime", category: "landing", label: "姿勢安定までの時間", unit: "ms", weight: 0.85, value: 200.00000000000017, score: 100, confidence: 0.8, description: "着地後に重心速度が落ち着くまでの時間。" },
    { id: "conversionEfficiency", category: "efficiency", label: "助走→ジャンプ変換効率", unit: "ratio", weight: 1.15, value: 0.6250000000000002, score: 73.52941176470591, confidence: 0.6, description: "助走速度に対する離地速度の比率。" },
    { id: "verticalVelocityRatio", category: "efficiency", label: "垂直速度割合", unit: "ratio", weight: 1.0, value: 0.8, score: 93.75, confidence: 0.6, description: "離地速度のうち上方向成分が占める割合。" },
    { id: "horizontalLoss", category: "efficiency", label: "水平方向速度ロス", unit: "ratio", weight: 0.95, value: 0.7272727272727273, score: 24.545454545454533, confidence: 0.6, description: "助走後半から離地直後までの水平速度低下率。" },
    { id: "efficiencyPeakHeight", category: "efficiency", label: "最高到達の高さ", unit: "px", weight: 1.1, value: 210, score: 100, confidence: 0.35, description: "重心上昇量。" },
    { id: "efficiencyFlightTime", category: "efficiency", label: "滞空時間", unit: "ms", weight: 0.9, value: 1299.9999999999998, score: 100, confidence: 0.6, description: "離地から着地までの時間。" },
  ];

  it("51指標のIDの並び順がmetricDefinitionsの宣言順(≒カテゴリ順)と一致する", () => {
    const frames = buildFrames();
    mockedRunJumpPhaseEngine.mockReturnValue(buildEngineResult(frames));
    const result = evaluateSpikeForm(frames, "straightArm");

    expect(result).not.toBeNull();
    if (!result) return;

    const actualOrder = result.categories.flatMap((c) => c.metrics.map((m) => m.id));
    expect(actualOrder).toEqual(EXPECTED_METRICS_STRAIGHT_ARM.map((m) => m.id));
    expect(actualOrder).toHaveLength(51);
  });

  it.each(EXPECTED_METRICS_STRAIGHT_ARM)(
    "straightArm: $id の category/label/unit/weight/value/score/confidence/descriptionを固定する",
    (expected) => {
      const frames = buildFrames();
      mockedRunJumpPhaseEngine.mockReturnValue(buildEngineResult(frames));
      const result = evaluateSpikeForm(frames, "straightArm");

      expect(result).not.toBeNull();
      if (!result) return;

      const metric = metricById(result, expected.id);
      expect(metric, `${expected.id} should exist`).not.toBeNull();
      if (!metric) return;

      expect(metric.category).toBe(expected.category);
      expect(metric.label).toBe(expected.label);
      expect(metric.unit).toBe(expected.unit);
      expect(metric.weight).toBeCloseTo(expected.weight, 6);
      expect(metric.value).not.toBeNull();
      expect(metric.value as number).toBeCloseTo(expected.value, 6);
      expect(metric.score).not.toBeNull();
      expect(metric.score as number).toBeCloseTo(expected.score, 6);
      expect(metric.confidence).toBeCloseTo(expected.confidence, 6);
      expect(metric.description).toBe(expected.description);
    }
  );

  // =============================================================
  // フォーム別のtargetByFormが実際にscoreへ反映されることを固定する。
  // 全指標を3フォーム分重複テストせず、formTargetsへ2引数目(フォーム別override)を
  // 持つ12指標(bodyLine, elbowHeight, shoulderOpen, thoraxRotation, oppositeArmKeep,
  // hipShoulderSequence, elbowLead, frontContact, armExtension, followThroughRange,
  // trunkRotationContinue, wristPathLength)だけを対象にする。
  // このうち5指標(shoulderOpen/hipShoulderSequence/elbowLead/frontContact/wristPathLength)は
  // 上のstraightArm基準フレーム列だけでスコアが3フォームとも異なることを確認できたが、
  // 残り7指標は基準フレーム列の値がscoreValueの上限/下限（0または100）に張り付いてしまい
  // フォーム差が観測できないため、それぞれの指標が非飽和域の値を取る専用フレーム列
  // (buildFormOverrideProbeFrames)を追加した。
  //
  // なお proximalDistalTiming にも2引数目のoverride({circularArm:{ideal:1}})があるが、
  // 値がbase(ideal:1)と完全に同一のため実質的に無効なoverrideであり、3フォームとも
  // スコアが一致することを別途「現在の挙動」として固定する。
  // =============================================================

  it("フォーム別override(straightArm基準フレーム列で差が観測できる5指標)", () => {
    const frames = buildFrames();
    mockedRunJumpPhaseEngine.mockReturnValue(buildEngineResult(frames));

    const expectedByForm: Record<SpikeArmForm, Array<{ id: string; score: number }>> = {
      straightArm: [
        { id: "shoulderOpen", score: 0 },
        { id: "hipShoulderSequence", score: 38.888888888888886 },
        { id: "elbowLead", score: 94.28571428571428 },
        { id: "frontContact", score: 100 },
        { id: "wristPathLength", score: 100 },
      ],
      bowAndArrow: [
        { id: "shoulderOpen", score: 44.70643689804247 },
        { id: "hipShoulderSequence", score: 22.222222222222214 },
        { id: "elbowLead", score: 65.71428571428572 },
        { id: "frontContact", score: 77.77777777777777 },
        { id: "wristPathLength", score: 93.4442662671139 },
      ],
      circularArm: [
        { id: "shoulderOpen", score: 1.8492940408996077 },
        { id: "hipShoulderSequence", score: 50 },
        { id: "elbowLead", score: 77.14285714285714 },
        { id: "frontContact", score: 77.77777777777777 },
        { id: "wristPathLength", score: 73.77178915824783 },
      ],
    };

    for (const form of ["straightArm", "bowAndArrow", "circularArm"] as SpikeArmForm[]) {
      mockedRunJumpPhaseEngine.mockReturnValue(buildEngineResult(frames));
      const result = evaluateSpikeForm(frames, form);
      expect(result).not.toBeNull();
      if (!result) continue;

      for (const { id, score } of expectedByForm[form]) {
        expect(metricById(result, id)?.score, `${form}/${id}`).toBeCloseTo(score, 6);
      }
    }

    // 値自体(measure)はフォームに依存せず不変であることも確認する
    const straight = evaluateSpikeForm(frames, "straightArm");
    const circular = evaluateSpikeForm(frames, "circularArm");
    for (const id of ["shoulderOpen", "hipShoulderSequence", "elbowLead", "frontContact", "wristPathLength"]) {
      expect(metricById(straight!, id)?.value).toBeCloseTo(metricById(circular!, id)?.value as number, 6);
    }
  });

  /**
   * bodyLine/elbowHeight/thoraxRotation/oppositeArmKeep/armExtension/followThroughRange/
   * trunkRotationContinue が scoreValue の上限・下限へ飽和しない値を取るように、
   * peakフレーム(足首オフセット・肩の傾き・肘の高さ)とdescentフレーム(肩・腰の傾き、手首位置)
   * だけを調整した専用フレーム列。他の指標の値はstraightArm基準フレーム列と異なってよい
   * (このテスト専用のシナリオのため)。
   */
  function buildFormOverrideProbeFrames(): TrackedFrame[] {
    const frames = buildFrames();
    const f13 = frames[13];
    f13.landmarks[11] = { x: f13.landmarks[11].x, y: f13.landmarks[11].y - 4, visibility: 1 }; // leftShoulder
    f13.landmarks[12] = { x: f13.landmarks[12].x, y: f13.landmarks[12].y + 4, visibility: 1 }; // rightShoulder
    f13.landmarks[14] = { x: f13.landmarks[14].x, y: f13.landmarks[12].y - 5, visibility: 1 }; // rightElbow: 肩のすぐ上(5px)
    f13.landmarks[27] = { x: f13.landmarks[27].x + 22, y: f13.landmarks[27].y, visibility: 1 }; // leftAnkle
    f13.landmarks[28] = { x: f13.landmarks[28].x + 22, y: f13.landmarks[28].y, visibility: 1 }; // rightAnkle
    // 逆腕(左)：肘を真横、手首を肩の真下にして肩頂点の角度を90°にする
    f13.landmarks[13] = { x: f13.landmarks[11].x - 35, y: f13.landmarks[11].y, visibility: 1 }; // leftElbow
    f13.landmarks[15] = { x: f13.landmarks[11].x, y: f13.landmarks[11].y + 84, visibility: 1 }; // leftWrist

    const descentShoulderTiltsDeg = [0, 6, 12, 18];
    const descentHipTiltsDeg = [0, 2, 3, 4];
    for (let i = 0; i < 4; i += 1) {
      const f = frames[16 + i];
      const cy = f.centerY;
      const cx = f.centerX;
      const st = (descentShoulderTiltsDeg[i] * Math.PI) / 180;
      const ht = (descentHipTiltsDeg[i] * Math.PI) / 180;
      const halfShoulder = 15;
      const halfHip = 12;
      f.landmarks[11] = { x: cx - halfShoulder * Math.cos(st), y: cy - 100 - halfShoulder * Math.sin(st), visibility: 1 };
      f.landmarks[12] = { x: cx + halfShoulder * Math.cos(st), y: cy - 100 + halfShoulder * Math.sin(st), visibility: 1 };
      f.landmarks[23] = { x: cx - halfHip * Math.cos(ht), y: cy - halfHip * Math.sin(ht), visibility: 1 };
      f.landmarks[24] = { x: cx + halfHip * Math.cos(ht), y: cy + halfHip * Math.sin(ht), visibility: 1 };
      f.landmarks[16] = { x: cx + 22 + i * 3, y: cy - 20 - i * 15, visibility: 1 }; // rightWrist(打点後、時間とともに移動)
    }
    return frames;
  }

  it("フォーム別override(非飽和域の値が必要な7指標。専用フレーム列を使用)", () => {
    const frames = buildFormOverrideProbeFrames();

    const expectedByForm: Record<SpikeArmForm, Array<{ id: string; value: number; score: number }>> = {
      straightArm: [
        { id: "bodyLine", value: 10.388857815469606, score: 94.2130924355433 },
        { id: "elbowHeight", value: 0.05, score: 62.5 },
        { id: "thoraxRotation", value: 14.931417178137552, score: 39.04077563620554 },
        { id: "oppositeArmKeep", value: 90, score: 90 },
        { id: "armExtension", value: 120.99771964576786, score: 70.34751142195805 },
        { id: "followThroughRange", value: 23.507002641897827, score: 31.342670189197104 },
        { id: "trunkRotationContinue", value: 14, score: 43.75 },
      ],
      bowAndArrow: [
        { id: "bodyLine", value: 10.388857815469606, score: 100 },
        { id: "elbowHeight", value: 0.05, score: 25 },
        { id: "thoraxRotation", value: 14.931417178137552, score: 3.32648992191983 },
        { id: "oppositeArmKeep", value: 90, score: 60 },
        { id: "armExtension", value: 120.99771964576786, score: 73.33195130046536 },
        { id: "followThroughRange", value: 23.507002641897827, score: 31.342670189197104 },
        { id: "trunkRotationContinue", value: 14, score: 43.75 },
      ],
      circularArm: [
        { id: "bodyLine", value: 10.388857815469606, score: 100 },
        { id: "elbowHeight", value: 0.05, score: 33.333333333333336 },
        { id: "thoraxRotation", value: 14.931417178137552, score: 24.755061350491246 },
        { id: "oppositeArmKeep", value: 90, score: 90 },
        { id: "armExtension", value: 120.99771964576786, score: 73.33195130046536 },
        { id: "followThroughRange", value: 23.507002641897827, score: 26.11889182433092 },
        { id: "trunkRotationContinue", value: 14, score: 35 },
      ],
    };

    for (const form of ["straightArm", "bowAndArrow", "circularArm"] as SpikeArmForm[]) {
      mockedRunJumpPhaseEngine.mockReturnValue(buildEngineResult(frames));
      const result = evaluateSpikeForm(frames, form);
      expect(result).not.toBeNull();
      if (!result) continue;

      for (const { id, value, score } of expectedByForm[form]) {
        const metric = metricById(result, id);
        expect(metric?.value, `${form}/${id} value`).toBeCloseTo(value, 6);
        expect(metric?.score, `${form}/${id} score`).toBeCloseTo(score, 6);
      }
    }
  });

  it("proximalDistalTimingはcircularArmのoverrideがbaseと同値のため、3フォームともスコアが一致する(現在の挙動を固定)", () => {
    const frames = buildFrames();

    const scores: number[] = [];
    for (const form of ["straightArm", "bowAndArrow", "circularArm"] as SpikeArmForm[]) {
      mockedRunJumpPhaseEngine.mockReturnValue(buildEngineResult(frames));
      const result = evaluateSpikeForm(frames, form);
      expect(result).not.toBeNull();
      if (!result) continue;
      scores.push(metricById(result, "proximalDistalTiming")?.score as number);
    }

    expect(scores).toHaveLength(3);
    expect(scores[0]).toBeCloseTo(100, 6);
    expect(scores[1]).toBeCloseTo(scores[0], 6);
    expect(scores[2]).toBeCloseTo(scores[0], 6);
  });
});
