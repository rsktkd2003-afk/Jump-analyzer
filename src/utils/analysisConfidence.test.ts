import { describe, expect, it } from "vitest";
import type { CaptureSettings } from "../ai/captureSettings";
import type { Feature } from "../analysis/types";
import type { ConfidenceQualitySignals } from "../ai/trackingQualitySignals";
import {
  buildConfidenceAwareSummary,
  confidenceLevelLabel,
  measurementStatusLabel,
} from "./analysisConfidence";

const normalSettings: CaptureSettings = {
  cameraView: "side",
  framing: "normal",
  distance: "normal",
};

function feature(
  confidence: number,
  key = "approach.speed",
  value = 4
): Feature {
  return {
    key,
    label: key,
    phase: "approach",
    region: "centerOfMass",
    value,
    unit: "normPxPerSec",
    confidence,
  };
}

describe("analysisConfidence", () => {
  it.each([
    { confidence: 0.55, status: "measured", level: "high" },
    { confidence: 0.54, status: "reference", level: "medium" },
    { confidence: 0.32, status: "reference", level: "medium" },
    { confidence: 0.31, status: "unavailable", level: "low" },
  ] as const)(
    "補正後confidence $confidenceを$statusへ分類する",
    ({ confidence, status, level }) => {
      const summary = buildConfidenceAwareSummary(
        [feature(confidence)],
        normalSettings,
        60
      );
      const approach = summary.categories.find(
        (category) => category.key === "approach"
      );

      expect(approach?.status).toBe(status);
      expect(summary.confidenceLevel).toBe(level);
    }
  );

  it("評価不能カテゴリを総合スコア・コメントから除外する", () => {
    const summary = buildConfidenceAwareSummary(
      [feature(0.2)],
      normalSettings,
      60
    );

    expect(summary.overallScore).toBeNull();
    expect(summary.rank).toBeNull();
    expect(summary.strengths).toEqual([]);
    expect(summary.improvements).toEqual([]);
    expect(summary.confidenceWarnings.join("\n")).toContain("評価対象から除外");
  });

  it("着地評価を表示に残しつつ総合スコアから除外する", () => {
    const summary = buildConfidenceAwareSummary(
      [feature(1), feature(1, "landing.impactIndex", 9.1)],
      normalSettings,
      60
    );
    const landing = summary.categories.find(
      (category) => category.key === "landing"
    );

    expect(landing?.status).toBe("measured");
    expect(landing?.score).toBe(20);
    expect(summary.overallStars).toBe(5);
    expect(summary.overallScore).toBe(100);
    expect(summary.rank).toBe("S");
    expect(summary.improvements.some((item) => item.category === "landing")).toBe(
      true
    );
  });

  it("撮影条件・参考値・フレーム不足の警告を組み立てる", () => {
    const summary = buildConfidenceAwareSummary(
      [feature(0.8)],
      { cameraView: "unknown", framing: "wide", distance: "far" },
      29
    );
    const warnings = summary.confidenceWarnings.join("\n");

    expect(warnings).toContain("撮影距離が遠い");
    expect(warnings).toContain("画角が広く");
    expect(warnings).toContain("撮影方向が未入力");
    expect(warnings).toContain("参考値");
    expect(warnings).toContain("フレーム数が少なく");
  });

  it("特徴量がない場合は信頼度を判定不能にする", () => {
    const summary = buildConfidenceAwareSummary([], normalSettings);

    expect(summary.confidenceLevel).toBe("unknown");
    expect(summary.confidenceOverall).toBeNull();
    expect(summary.categories.every((category) => category.status === "notMeasured")).toBe(
      true
    );
  });

  it("ステータスと信頼度の日本語表示を固定する", () => {
    expect(measurementStatusLabel("measured")).toBe("正常に測定");
    expect(measurementStatusLabel("reference")).toBe("参考値");
    expect(measurementStatusLabel("unavailable")).toBe("評価不能");
    expect(measurementStatusLabel("notMeasured")).toBe("未計測");
    expect(confidenceLevelLabel("high")).toBe("高");
    expect(confidenceLevelLabel("medium")).toBe("中");
    expect(confidenceLevelLabel("low")).toBe("低");
    expect(confidenceLevelLabel("unknown")).toBe("判定不能");
  });

  it("qualitySignals未指定（旧データ相当）でもエラーなく動作し、v1相当の結果になる", () => {
    const summary = buildConfidenceAwareSummary([feature(0.9)], normalSettings, 60);
    expect(summary.confidenceVersion).toBe(1);
    expect(summary.confidenceOverall).not.toBeNull();
  });
});

// =============================================================
// 信頼度算出v2（Phase1）: 品質シグナルによる追加減点・警告の検証。
// =============================================================
describe("analysisConfidence: 信頼度v2（品質シグナル）", () => {
  const highConfidenceFeature: Feature = feature(0.9);

  const noSignals: ConfidenceQualitySignals = {
    interpolatedRatio: null,
    lowConfidenceFrameRatio: null,
    averageTrackerMatchScore: null,
    coastingFrameRatio: null,
    lateralityCorrectionRatio: null,
    averageLateralityCorrectionConfidence: null,
    abnormalJumpRatio: null,
  };

  function summarize(signals?: ConfidenceQualitySignals) {
    return buildConfidenceAwareSummary([highConfidenceFeature], normalSettings, 60, signals);
  }

  it("v2使用時はconfidenceVersionが2になる", () => {
    const summary = summarize({ ...noSignals, interpolatedRatio: 0.5 });
    expect(summary.confidenceVersion).toBe(2);
  });

  it("補間率が高い場合に信頼度が下がる", () => {
    const base = summarize(undefined);
    const withHighInterpolation = summarize({ ...noSignals, interpolatedRatio: 0.5 });
    expect(base.confidenceOverall).not.toBeNull();
    expect(withHighInterpolation.confidenceOverall).not.toBeNull();
    expect(withHighInterpolation.confidenceOverall!).toBeLessThan(base.confidenceOverall!);
  });

  it("低信頼フレームが多い場合に信頼度が下がる", () => {
    const base = summarize(undefined);
    const withLowConfidenceFrames = summarize({ ...noSignals, lowConfidenceFrameRatio: 0.5 });
    expect(withLowConfidenceFrames.confidenceOverall!).toBeLessThan(base.confidenceOverall!);
  });

  it("トラッカーが安定している場合は不必要に減点しない", () => {
    const base = summarize(undefined);
    const withStableTracker = summarize({
      ...noSignals,
      averageTrackerMatchScore: 0.92,
      coastingFrameRatio: 0.01,
    });
    expect(withStableTracker.confidenceOverall!).toBeCloseTo(base.confidenceOverall!, 9);
  });

  it("左右補正が1回だけ（低頻度）発生しても過度に減点しない", () => {
    const base = summarize(undefined);
    // 100フレーム中1回だけ補正が発生したケース（低頻度、閾値5%未満）
    const withRareCorrection = summarize({
      ...noSignals,
      lateralityCorrectionRatio: 0.01,
      averageLateralityCorrectionConfidence: 0.8,
    });
    expect(withRareCorrection.confidenceOverall!).toBeCloseTo(base.confidenceOverall!, 9);
    expect(withRareCorrection.confidenceWarnings.some((w) => w.includes("左右"))).toBe(false);
  });

  it("複数の品質低下が重なった場合、単独より減点が大きく、警告メッセージも複数出る", () => {
    const singleIssue = summarize({ ...noSignals, interpolatedRatio: 0.5 });
    const multipleIssues = summarize({
      ...noSignals,
      interpolatedRatio: 0.5,
      lowConfidenceFrameRatio: 0.5,
      averageTrackerMatchScore: 0.3,
      lateralityCorrectionRatio: 0.5,
    });

    expect(multipleIssues.confidenceOverall!).toBeLessThan(singleIssue.confidenceOverall!);
    expect(multipleIssues.confidenceWarnings.length).toBeGreaterThan(
      singleIssue.confidenceWarnings.length
    );
  });

  it("同じ警告メッセージは重複表示しない（複数ルールが同一メッセージにマップされていても1件のみ）", () => {
    // averageTrackerMatchScore・coastingFrameRatio・abnormalJumpRatio は
    // いずれも「人物追跡が一部不安定でした」に対応する。3つ同時に発火させても1件のみ出ること。
    const summary = summarize({
      ...noSignals,
      averageTrackerMatchScore: 0.2,
      coastingFrameRatio: 0.5,
      abnormalJumpRatio: 0.5,
    });

    const trackingWarnings = summary.confidenceWarnings.filter(
      (w) => w === "人物追跡が一部不安定でした"
    );
    expect(trackingWarnings).toHaveLength(1);
  });

  it("減点の合計は上限（25%）を超えない（極端な値を全て与えても信頼度が想定範囲を割らない）", () => {
    const worst = summarize({
      interpolatedRatio: 1,
      lowConfidenceFrameRatio: 1,
      averageTrackerMatchScore: 0,
      coastingFrameRatio: 1,
      lateralityCorrectionRatio: 1,
      averageLateralityCorrectionConfidence: 0,
      abnormalJumpRatio: 1,
    });

    expect(worst.confidenceOverall).not.toBeNull();
    expect(worst.confidenceOverall!).toBeGreaterThanOrEqual(0);
    expect(worst.confidenceOverall!).toBeLessThanOrEqual(1);
    // 25%減点上限: 0.9(feature confidence) * settingsFactor * 0.75 が理論下限に近いはず
    const base = summarize(undefined);
    expect(worst.confidenceOverall!).toBeGreaterThanOrEqual(base.confidenceOverall! * 0.74);
  });

  it("undefined・NaNの品質シグナルが混在してもエラーにならず、NaNを生成しない", () => {
    const summary = summarize({
      interpolatedRatio: NaN,
      lowConfidenceFrameRatio: undefined as unknown as number | null,
      averageTrackerMatchScore: null,
      coastingFrameRatio: null,
      lateralityCorrectionRatio: null,
      averageLateralityCorrectionConfidence: null,
      abnormalJumpRatio: null,
    });

    expect(Number.isNaN(summary.confidenceOverall ?? 0)).toBe(false);
    expect(summary.confidenceOverall).not.toBeNull();
  });

  it("着地除外（isOverallScoreCategory）はv2でも維持される", () => {
    const summary = buildConfidenceAwareSummary(
      [highConfidenceFeature, feature(0.9, "landing.impactIndex", 9.1)],
      normalSettings,
      60,
      { ...noSignals, interpolatedRatio: 0.5 }
    );
    const landing = summary.categories.find((c) => c.key === "landing");
    expect(landing?.status).toBe("measured");
    // 着地は測定はされるが総合スコア計算には使われない一貫性が保たれている
    expect(summary.confidenceVersion).toBe(2);
  });
});
