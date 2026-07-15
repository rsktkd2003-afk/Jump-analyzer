import type { MeasurementMode } from "./measurement";

export type ReachEstimateMethod =
  | "calibration"
  | "known-max-reach"
  | "flight-time";

export type ReachEstimateConfidence = "高" | "中" | "低";

export type FormRank = "S" | "A" | "B" | "C" | "D";

/** 助走/踏切/空中姿勢/スイング/着地の★評価（結果画面のフォーム評価カード表示専用の集計値） */
export type FormCategoryScores = {
  approach: number | null;
  takeoff: number | null;
  air: number | null;
  swing: number | null;
  landing: number | null;
};

export type MeasurementHistoryItem = {
  id: string;
  createdAt: string;
  mode: MeasurementMode;

  maxReach: number | null;
  jumpHeight: number | null;
  airTime: number | null;
  airFrameCount: number | null;
  estimatedJumpHeight: number | null;

  estimatedMaxReach?: number | null;
  estimatedReachJumpHeight?: number | null;
  reachEstimateMethod?: ReachEstimateMethod | null;
  reachEstimateConfidence?: ReachEstimateConfidence | null;
  heightCm?: number | null;
  standingReach?: number | null;
  knownMaxReach?: number | null;

  peakTime: number | null;
  peakFrame: number | null;

  reachError: number | null;
  ballSpeed: number | null;
  speedError: number | null;

  // 以下は自動フォーム解析（スキル評価）を実行した場合のみ入る任意フィールド。
  // 既存の保存済み履歴（これらのフィールドを持たない）との後方互換を維持する。
  overallScore?: number | null;
  overallStars?: number | null;
  rank?: FormRank | null;
  formCategoryScores?: FormCategoryScores | null;
  improvementComments?: string[];
  strengthComments?: string[];
};