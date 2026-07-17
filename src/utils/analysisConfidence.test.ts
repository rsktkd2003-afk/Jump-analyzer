import { describe, expect, it } from "vitest";
import type { CaptureSettings } from "../ai/captureSettings";
import type { Feature } from "../analysis/types";
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

function feature(confidence: number): Feature {
  return {
    key: "approach.speed",
    label: "助走速度",
    phase: "approach",
    region: "centerOfMass",
    value: 4,
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
});
