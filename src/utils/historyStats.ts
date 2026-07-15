// =============================================================
// 表示専用の集計レイヤー。保存済み履歴（MeasurementHistoryItem[]）から
// ホーム画面の統計カードに必要な値を導出するだけで、新しい解析ロジックは持たない。
// =============================================================
import type { MeasurementHistoryItem } from "../types/history";

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

function resolveJumpHeight(item: MeasurementHistoryItem): number | null {
  return item.estimatedReachJumpHeight ?? item.jumpHeight;
}

function resolveMaxReach(item: MeasurementHistoryItem): number | null {
  return item.estimatedMaxReach ?? item.maxReach;
}

export function computeHomeStats(history: MeasurementHistoryItem[]): HomeStats {
  const jumpHeights = history.map(resolveJumpHeight).filter((v): v is number => v !== null);
  const maxReaches = history.map(resolveMaxReach).filter((v): v is number => v !== null);
  const scores = history
    .map((item) => item.overallScore)
    .filter((v): v is number => typeof v === "number");

  // 改善率：直近4件のうち最も古いものと最新のジャンプ高を比較
  const recentWithJump = history
    .slice(0, 4)
    .map(resolveJumpHeight)
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
