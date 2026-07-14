// =============================================================
// 空中姿勢スコア（一直線性・45°評価・揺り戻し→星評価）の検証コード。
//
// このプロジェクトにはテストランナーが未導入のため、単体テストの代わりに
// 実装済みの純粋関数（scoreAerialAlignment / scoreAerialAngle /
// scoreExtraMotion / countDirectionReversals / scoreToStars）を
// 直接呼び出して検証する。
//
// 実行方法（開発時の手動確認用。npm run build には含まれない）：
//   npx vite-node src/ai/spikeFormEvaluation.selfcheck.ts
// =============================================================

import { movingAverage } from "./poseMath";
import {
  AERIAL_ALIGNMENT_WEIGHT,
  AERIAL_ANGLE_WEIGHT,
  AERIAL_EXTRA_MOTION_WEIGHT,
  countDirectionReversals,
  scoreAerialAlignment,
  scoreAerialAngle,
  scoreExtraMotion,
  scoreToStars,
  TRUNK_WOBBLE_MIN_AMPLITUDE_DEG,
  WOBBLE_MIN_FRAME_GAP,
  WOBBLE_SMOOTHING_WINDOW,
  type StarRating,
} from "./spikeFormEvaluation";

// -----------------------------------------------------------------
// パート1: 空中姿勢スコア（一直線性45% + 45°評価35% + 揺り戻し20%）の検証
// -----------------------------------------------------------------

type SelfCheckCase = {
  name: string;
  angleDeg: number;
  alignmentRatio: number;
  reversalCount: number;
  expect: (result: SelfCheckResult) => string | null; // 失敗理由。合格ならnull
};

type SelfCheckResult = {
  angleScore: number;
  alignmentScore: number;
  extraMotionScore: number;
  aerialPostureScore: number;
  stars: StarRating;
};

function evaluate(angleDeg: number, alignmentRatio: number, reversalCount: number): SelfCheckResult {
  const angleScore = scoreAerialAngle(angleDeg);
  const alignmentScore = scoreAerialAlignment(alignmentRatio);
  const extraMotionScore = scoreExtraMotion(reversalCount);
  const aerialPostureScore =
    alignmentScore * AERIAL_ALIGNMENT_WEIGHT +
    angleScore * AERIAL_ANGLE_WEIGHT +
    extraMotionScore * AERIAL_EXTRA_MOTION_WEIGHT;
  const stars = scoreToStars(aerialPostureScore);
  return { angleScore, alignmentScore, extraMotionScore, aerialPostureScore, stars };
}

const cases: SelfCheckCase[] = [
  {
    name: "ケース1: 40°/良好/揺り戻しなし → 星4以上",
    angleDeg: 40,
    alignmentRatio: 0.06, // 良好帯（0.04〜0.08）
    reversalCount: 0,
    expect: (r) => (r.stars >= 4 ? null : `stars=${r.stars} (期待: 4以上)`),
  },
  {
    name: "ケース2: 45°/非常に良好/揺り戻しなし → 星5",
    angleDeg: 45,
    alignmentRatio: 0.02,
    reversalCount: 0,
    expect: (r) => (r.stars === 5 ? null : `stars=${r.stars} (期待: 5)`),
  },
  {
    name: "ケース3: 40°/やや低い一直線性/揺り戻しなし → 減点はされるが星1にならない",
    angleDeg: 40,
    alignmentRatio: 0.1, // やや崩れている帯（0.08〜0.13）
    reversalCount: 0,
    expect: (r) => {
      if (r.angleScore < 85) return `angleScore=${r.angleScore} (40°は高評価のはず)`;
      if (r.stars <= 1) return `stars=${r.stars} (期待: 2以上)`;
      return null;
    },
  },
  {
    name: "ケース4: 一定方向の傾き自体は減点しない（揺り戻し0回→高評価）",
    angleDeg: 45,
    alignmentRatio: 0.02,
    reversalCount: 0,
    expect: (r) => (r.extraMotionScore >= 90 ? null : `extraMotionScore=${r.extraMotionScore} (期待: 90以上)`),
  },
  {
    name: "ケース5: 揺り戻しが多いと低評価（3回→低評価）",
    angleDeg: 45,
    alignmentRatio: 0.02,
    reversalCount: 3,
    expect: (r) => (r.extraMotionScore <= 45 ? null : `extraMotionScore=${r.extraMotionScore} (期待: 45以下)`),
  },
];

// -----------------------------------------------------------------
// パート2: 揺り戻し（方向反転）検出そのものの検証。
// 仕様書に記載された具体例をそのまま入力する。
// -----------------------------------------------------------------

type ReversalCase = {
  name: string;
  series: number[];
  expect: (count: number) => string | null;
};

const reversalCases: ReversalCase[] = [
  {
    // 14→15→16→15→14：一定の範囲内で揺れているだけで、大きな折り返しはない
    name: "反転ケースA: 14→15→16→15→14 → 反転なし扱い（低反転数）",
    series: [14, 15, 16, 15, 14],
    expect: (count) => (count <= 1 ? null : `count=${count} (期待: 1以下)`),
  },
  {
    // 5→15→2→18→6：短時間で大きく乱高下 → 複数回の反転として検出されるべき
    name: "反転ケースB: 5→15→2→18→6 → 複数回の反転を検出",
    series: [5, 15, 2, 18, 6],
    expect: (count) => (count >= 2 ? null : `count=${count} (期待: 2以上)`),
  },
  {
    // 単調増加：一定方向への傾きは反転として数えない
    name: "反転ケースC: 10→20→30→40→50（単調増加）→ 反転0回",
    series: [10, 20, 30, 40, 50],
    expect: (count) => (count === 0 ? null : `count=${count} (期待: 0)`),
  },
];

function runReversalCases(): Array<{ name: string; pass: boolean; detail: string }> {
  return reversalCases.map((c) => {
    const smoothed = movingAverage(c.series, WOBBLE_SMOOTHING_WINDOW);
    const count = countDirectionReversals(smoothed, TRUNK_WOBBLE_MIN_AMPLITUDE_DEG, WOBBLE_MIN_FRAME_GAP);
    const failure = c.expect(count);
    return { name: c.name, pass: failure === null, detail: failure ?? `reversalCount=${count}` };
  });
}

export function runAerialPostureSelfCheck(): Array<{ name: string; pass: boolean; detail: string; result: SelfCheckResult }> {
  return cases.map((c) => {
    const result = evaluate(c.angleDeg, c.alignmentRatio, c.reversalCount);
    const failure = c.expect(result);
    return {
      name: c.name,
      pass: failure === null,
      detail:
        failure ??
        `angleScore=${result.angleScore.toFixed(1)} alignmentScore=${result.alignmentScore.toFixed(1)} extraMotionScore=${result.extraMotionScore.toFixed(1)} aerialPostureScore=${result.aerialPostureScore.toFixed(2)} stars=${result.stars}`,
      result,
    };
  });
}

// vite-node等で直接実行した場合に結果を出力する。
const scoreResults = runAerialPostureSelfCheck();
const reversalResults = runReversalCases();
let allPass = true;
console.log("--- 空中姿勢スコア ---");
for (const r of scoreResults) {
  allPass = allPass && r.pass;
  console.log(`${r.pass ? "PASS" : "FAIL"} - ${r.name}\n  ${r.detail}`);
}
console.log("\n--- 揺り戻し（方向反転）検出 ---");
for (const r of reversalResults) {
  allPass = allPass && r.pass;
  console.log(`${r.pass ? "PASS" : "FAIL"} - ${r.name}\n  ${r.detail}`);
}
console.log(allPass ? "\nすべてのケースに合格しました。" : "\n失敗したケースがあります。");
