// =============================================================
// Firestoreに保存する解析履歴のデータ型。
// users/{uid}/analysisHistories/{analysisId} に保存する。
// =============================================================
import type { Timestamp } from "firebase/firestore";
import type { FormCategoryKey } from "../utils/formSummary";
import type {
  ConfidenceLevel,
  MeasurementStatus,
} from "../utils/analysisConfidence";

/**
 * 解析基準・スコア計算方法のバージョン。
 * 今後スコア計算ロジックを変更した場合はここを更新し、
 * 異なるバージョン同士の比較には注意表示を出す。
 */
export const ANALYSIS_VERSION = "1.0.0";

export type AnalysisMetrics = {
  maxReachCm: number | null;
  jumpHeightCm: number | null;
  flightTimeSec: number | null;
  takeoffTimeSec: number | null;
  ballSpeedKmh: number | null;
};

export type AnalysisCaptureSettings = {
  direction: string | null;
  framing: string | null;
  distance: string | null;
};

export type AnalysisConfidence = {
  overall: number | null;
  level: ConfidenceLevel;
  warnings: string[];
};

/** メトリクス・カテゴリごとの測定可否。キーは metrics のプロパティ名 or FormCategoryKey */
export type MeasurementStatusMap = Record<string, MeasurementStatus>;

export type AnalysisHistory = {
  id: string;
  analysisId: string;
  userId: string;

  title: string;
  memo: string;

  skillId: "spikeJump";

  analyzedAt: Timestamp;
  savedAt: Timestamp;

  totalScore: number | null;
  categoryScores: Record<FormCategoryKey, number | null>;

  metrics: AnalysisMetrics;

  strengths: string[];
  improvements: string[];

  captureSettings: AnalysisCaptureSettings;
  confidence: AnalysisConfidence;

  measurementStatuses: MeasurementStatusMap;

  analysisVersion: string;
};

/** 保存前（Firestoreへ書き込む直前）のドラフト。savedAtはサーバー時刻をhistoryService側で付与する。 */
export type AnalysisHistoryDraft = Omit<AnalysisHistory, "id" | "savedAt" | "analyzedAt"> & {
  analyzedAt: Date;
};
