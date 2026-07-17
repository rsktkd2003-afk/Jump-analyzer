import { describe, expect, it } from "vitest";
import type { Feature } from "../analysis/types";
import {
  buildFormSummary,
  rankFromScore,
  scoreFromStars,
  toFormCategoryScores,
} from "./formSummary";

function feature(key: string, value: number, confidence = 1): Feature {
  return {
    key,
    label: key,
    phase: "takeoff",
    region: "trunk",
    value,
    unit: "ratio",
    confidence,
  };
}

describe("formSummary", () => {
  it.each([
    { score: 90, rank: "S" },
    { score: 89, rank: "A" },
    { score: 80, rank: "A" },
    { score: 79, rank: "B" },
    { score: 65, rank: "B" },
    { score: 64, rank: "C" },
    { score: 50, rank: "C" },
    { score: 49, rank: "D" },
  ] as const)("スコア$scoreをランク$rankへ変換する", ({ score, rank }) => {
    expect(rankFromScore(score)).toBe(rank);
  });

  it("星を100点満点へ四捨五入して換算する", () => {
    expect(scoreFromStars(5)).toBe(100);
    expect(scoreFromStars(3.5)).toBe(70);
    expect(scoreFromStars(3.333)).toBe(67);
  });

  it("測定できたカテゴリのうち着地を除いて総合スコアを算出する", () => {
    const summary = buildFormSummary([
      feature("approach.speed", 4),
      feature("takeoff.contactTimeSec", 0.36),
      feature("air.timeSec", 0.42),
      feature("arm.swingVelocity", 2.5),
      feature("landing.impactIndex", 9.1),
      feature("unsupported.metric", 999),
    ]);

    expect(summary.categories.map((category) => category.featureCount)).toEqual([
      1,
      1,
      1,
      1,
      1,
    ]);
    expect(summary.overallStars).toBe(3.5);
    expect(summary.overallScore).toBe(70);
    expect(summary.rank).toBe("B");
    expect(summary.strengths).toHaveLength(2);
    expect(summary.improvements).toHaveLength(3);
    expect(
      summary.categories.find((category) => category.key === "landing")?.score
    ).toBe(20);
  });

  it("特徴量がない場合はスコアとランクを算出しない", () => {
    const summary = buildFormSummary([]);

    expect(summary.overallStars).toBeNull();
    expect(summary.overallScore).toBeNull();
    expect(summary.rank).toBeNull();
    expect(summary.strengths).toEqual([]);
    expect(summary.improvements).toEqual([]);
  });

  it("カテゴリ表示用の星一覧へ変換する", () => {
    const summary = buildFormSummary([feature("approach.speed", 4)]);

    expect(toFormCategoryScores(summary.categories)).toEqual({
      approach: 5,
      takeoff: null,
      air: null,
      swing: null,
      landing: null,
    });
  });
});
