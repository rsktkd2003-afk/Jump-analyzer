// =============================================================
// 空中姿勢スコア（一直線性・45°評価・体幹安定性→星評価）の検証コード。
//
// このプロジェクトにはテストランナーが未導入のため、単体テストの代わりに
// 実装済みの純粋関数（scoreAerialAlignment / scoreAerialAngle /
// scoreTrunkStability / scoreToStars）を直接呼び出して検証する。
//
// 実行方法（開発時の手動確認用。npm run build には含まれない）：
//   npx vite-node src/ai/spikeFormEvaluation.selfcheck.ts
// =============================================================

import {
  AERIAL_ALIGNMENT_WEIGHT,
  AERIAL_ANGLE_WEIGHT,
  AERIAL_TRUNK_STABILITY_WEIGHT,
  scoreAerialAlignment,
  scoreAerialAngle,
  scoreToStars,
  scoreTrunkStability,
  type StarRating,
} from "./spikeFormEvaluation";

type SelfCheckCase = {
  name: string;
  angleDeg: number;
  alignmentRatio: number;
  trunkVariationDeg: number;
  expect: (result: SelfCheckResult) => string | null; // 失敗理由。合格ならnull
};

type SelfCheckResult = {
  angleScore: number;
  alignmentScore: number;
  trunkStabilityScore: number;
  aerialPostureScore: number;
  stars: StarRating;
};

function evaluate(angleDeg: number, alignmentRatio: number, trunkVariationDeg: number): SelfCheckResult {
  const angleScore = scoreAerialAngle(angleDeg);
  const alignmentScore = scoreAerialAlignment(alignmentRatio);
  const trunkStabilityScore = scoreTrunkStability(trunkVariationDeg);
  const aerialPostureScore =
    alignmentScore * AERIAL_ALIGNMENT_WEIGHT +
    angleScore * AERIAL_ANGLE_WEIGHT +
    trunkStabilityScore * AERIAL_TRUNK_STABILITY_WEIGHT;
  const stars = scoreToStars(aerialPostureScore);
  return { angleScore, alignmentScore, trunkStabilityScore, aerialPostureScore, stars };
}

const cases: SelfCheckCase[] = [
  {
    // ケース1：角度40°・一直線性良好・体幹安定 → 星1にならない（星4以上）
    name: "ケース1: 40°/良好/安定 → 星4以上",
    angleDeg: 40,
    alignmentRatio: 0.06, // 良好帯（0.04〜0.08）
    trunkVariationDeg: 6, // 安定帯（4〜8）
    expect: (r) => (r.stars >= 4 ? null : `stars=${r.stars} (期待: 4以上)`),
  },
  {
    // ケース2：角度45°・非常に良好・非常に安定 → 星5
    name: "ケース2: 45°/非常に良好/非常に安定 → 星5",
    angleDeg: 45,
    alignmentRatio: 0.02,
    trunkVariationDeg: 1,
    expect: (r) => (r.stars === 5 ? null : `stars=${r.stars} (期待: 5)`),
  },
  {
    // ケース3：角度40°・一直線性やや低い・体幹安定 → 減点されるが星1にはならない
    name: "ケース3: 40°/やや低い一直線性/安定 → 減点はされるが星1にならない",
    angleDeg: 40,
    alignmentRatio: 0.1, // やや崩れている帯（0.08〜0.13）
    trunkVariationDeg: 6,
    expect: (r) => {
      if (r.angleScore < 85) return `angleScore=${r.angleScore} (40°は高評価のはず)`;
      if (r.stars <= 1) return `stars=${r.stars} (期待: 2以上)`;
      return null;
    },
  },
  {
    // ケース4：体軸の絶対角度40°相当でも、変動が2°なら体幹安定性は高評価
    // （scoreTrunkStabilityは絶対角度を受け取らず変動量だけを見る設計そのものを確認）
    name: "ケース4: 体幹の絶対傾き自体では減点しない（変動2°→高評価）",
    angleDeg: 45,
    alignmentRatio: 0.02,
    trunkVariationDeg: 2,
    expect: (r) => (r.trunkStabilityScore >= 90 ? null : `trunkStabilityScore=${r.trunkStabilityScore} (期待: 90以上)`),
  },
  {
    // ケース5：体軸が5°とほぼ垂直でも、変動が15°あれば体幹安定性は低評価
    name: "ケース5: 垂直に近くても変動が大きければ低評価（変動15°→低評価）",
    angleDeg: 45,
    alignmentRatio: 0.02,
    trunkVariationDeg: 15,
    expect: (r) => (r.trunkStabilityScore <= 45 ? null : `trunkStabilityScore=${r.trunkStabilityScore} (期待: 45以下)`),
  },
];

export function runAerialPostureSelfCheck(): Array<{ name: string; pass: boolean; detail: string; result: SelfCheckResult }> {
  return cases.map((c) => {
    const result = evaluate(c.angleDeg, c.alignmentRatio, c.trunkVariationDeg);
    const failure = c.expect(result);
    return {
      name: c.name,
      pass: failure === null,
      detail:
        failure ??
        `angleScore=${result.angleScore.toFixed(1)} alignmentScore=${result.alignmentScore.toFixed(1)} trunkStabilityScore=${result.trunkStabilityScore.toFixed(1)} aerialPostureScore=${result.aerialPostureScore.toFixed(2)} stars=${result.stars}`,
      result,
    };
  });
}

// vite-node等で直接実行した場合に結果を出力する。
const results = runAerialPostureSelfCheck();
let allPass = true;
for (const r of results) {
  allPass = allPass && r.pass;
  console.log(`${r.pass ? "PASS" : "FAIL"} - ${r.name}\n  ${r.detail}`);
}
console.log(allPass ? "\nすべてのケースに合格しました。" : "\n失敗したケースがあります。");
