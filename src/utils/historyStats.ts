// =============================================================
// 表示専用の集計レイヤー。Firestoreに保存済みの解析履歴（AnalysisHistory[]）
// からホーム画面の統計カードに必要な値を導出するだけで、新しい解析ロジックは持たない。
// =============================================================
import type { AnalysisHistory } from "../types/analysisHistory";

export type HomeStats = {
  averageJumpHeight: number | null;
  bestMaxReach: number | null;
  analysisCount: number;
  averageScore: number | null;
  improvementRate: number | null;
};

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

export function computeHomeStats(history: AnalysisHistory[]): HomeStats {
  const jumpHeights = history
    .map((item) => item.metrics.jumpHeightCm)
    .filter((v): v is number => v !== null);
  const maxReaches = history
    .map((item) => item.metrics.maxReachCm)
    .filter((v): v is number => v !== null);
  const scores = history
    .map((item) => item.totalScore)
    .filter((v): v is number => typeof v === "number");

  // 改善率：保存日時が新しい順の直近4件のうち最も古いものと最新のジャンプ高を比較
  const recentWithJump = history
    .slice(0, 4)
    .map((item) => item.metrics.jumpHeightCm)
    .filter((v): v is number => v !== null);

  let improvementRate: number | null = null;
  if (recentWithJump.length >= 2) {
    const latest = recentWithJump[0];
    const earliest = recentWithJump[recentWithJump.length - 1];
    if (earliest > 0) {
      improvementRate = ((latest - earliest) / earliest) * 100;
    }
  }

  return {
    averageJumpHeight: average(jumpHeights),
    bestMaxReach: maxReaches.length > 0 ? Math.max(...maxReaches) : null,
    analysisCount: history.length,
    averageScore: average(scores),
    improvementRate,
  };
}
