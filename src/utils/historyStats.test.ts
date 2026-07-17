import { describe, expect, it } from "vitest";
import type { AnalysisHistory } from "../types/analysisHistory";
import { computeHomeStats } from "./historyStats";

function history(
  id: string,
  jumpHeightCm: number | null,
  maxReachCm: number | null,
  totalScore: number | null
): AnalysisHistory {
  return {
    id,
    metrics: {
      jumpHeightCm,
      maxReachCm,
      flightTimeSec: null,
      takeoffTimeSec: null,
      ballSpeedKmh: null,
    },
    totalScore,
  } as AnalysisHistory;
}

describe("computeHomeStats", () => {
  it("履歴がない場合は件数以外を未算出にする", () => {
    expect(computeHomeStats([])).toEqual({
      averageJumpHeight: null,
      bestMaxReach: null,
      analysisCount: 0,
      averageScore: null,
      improvementRate: null,
    });
  });

  it("nullを除外して平均・最高値・件数を集計する", () => {
    const result = computeHomeStats([
      history("new", 80, 305, 90),
      history("middle", null, 300, null),
      history("old", 70, null, 70),
    ]);

    expect(result.averageJumpHeight).toBe(75);
    expect(result.bestMaxReach).toBe(305);
    expect(result.analysisCount).toBe(3);
    expect(result.averageScore).toBe(80);
  });

  it("新しい順の直近4件から最古と最新のジャンプ高を比較する", () => {
    const result = computeHomeStats([
      history("latest", 80, 305, 90),
      history("2", null, 302, 85),
      history("3", 75, 300, 80),
      history("earliest-in-window", 64, 295, 75),
      history("outside-window", 40, 280, 60),
    ]);

    expect(result.improvementRate).toBe(25);
  });

  it("比較元が0以下の場合は改善率を算出しない", () => {
    const result = computeHomeStats([
      history("latest", 80, 305, 90),
      history("old", 0, 300, 80),
    ]);

    expect(result.improvementRate).toBeNull();
  });
});
