// =============================================================
// スパイクフォーム評価の公開型。
// spikeFormEvaluation.ts / spikeFormMetrics.ts の両方から参照される
// 共有型をここへ集約し、両モジュール間の循環依存を避ける。
// =============================================================

import type { StarRating } from "./aerialPostureScoring";

export type SpikeArmForm = "straightArm" | "bowAndArrow" | "circularArm";

export type EvaluationCategoryId =
  | "approach"
  | "takeoff"
  | "flight"
  | "takeback"
  | "hit"
  | "airPosture"
  | "followThrough"
  | "landing"
  | "efficiency";

export type EvaluationMetric = {
  id: string;
  label: string;
  category: EvaluationCategoryId;
  value: number | null;
  unit: "deg" | "ms" | "px" | "ratio" | "pxPerSec" | "index";
  score: number | null;
  weight: number;
  confidence: number;
  description: string;
};

export type EvaluationCategory = {
  id: EvaluationCategoryId;
  label: string;
  score: number | null;
  weight: number;
  metrics: EvaluationMetric[];
};

export type SpikeFormEvaluationResult = {
  selectedForm: SpikeArmForm;
  selectedFormLabel: string;
  overallScore: number | null;
  confidence: number;
  categories: EvaluationCategory[];
  priorityMetrics: EvaluationMetric[];
  note: string;
  /** 空中姿勢カテゴリのスコア（airPostureカテゴリのscoreと同一の値。二重計算はしない） */
  aerialPostureScore: number | null;
  /** 空中姿勢スコアを星評価へ変換したもの。画面の星表示は必ずこの値を参照する */
  aerialPostureStars: StarRating | null;
};
