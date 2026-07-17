// =============================================================
// 表示専用の集計レイヤー。
// analysis/evaluation.ts が算出する既存の★1〜5評価・コメントを、
// 結果画面向けに「助走/踏切/空中姿勢/スイング/着地」の5カテゴリと
// 総合スコアへ集約するだけで、新しい解析ロジックは持たない。
// =============================================================
import type { Feature } from "../analysis/types";
import { evaluateFeature, type FeatureEvaluation } from "../analysis/evaluation";

export type FormCategoryKey = "approach" | "takeoff" | "air" | "swing" | "landing";

export const FORM_CATEGORY_LABELS: Record<FormCategoryKey, string> = {
  approach: "助走",
  takeoff: "踏切",
  air: "空中姿勢",
  swing: "スイング",
  landing: "着地",
};

/**
 * 着地は安全性・改善点として評価表示するが、スパイク動作の総合スコアには含めない。
 */
export function isOverallScoreCategory(key: FormCategoryKey): boolean {
  return key !== "landing";
}

const CATEGORY_BY_FEATURE_KEY: Record<string, FormCategoryKey> = {
  "approach.speed": "approach",
  "takeoff.kneeMinAngle": "takeoff",
  "takeoff.hipMinAngle": "takeoff",
  "takeoff.contactTimeSec": "takeoff",
  "takeoff.sinkDurationSec": "takeoff",
  "takeoff.maxExtensionVelocity": "takeoff",
  "symmetry.kneeDiff": "takeoff",
  "air.postureStability": "air",
  "air.timeSec": "air",
  "air.horizontalDrift": "air",
  "peak.shoulderTilt": "air",
  "arm.swingVelocity": "swing",
  "contact.wristPeakToBodyPeakTimeDiff": "swing",
  "landing.impactIndex": "landing",
  "landing.kneeAbsorption": "landing",
};

export type EvaluatedFeature = {
  feature: Feature;
  evaluation: FeatureEvaluation;
  category: FormCategoryKey;
};

export type FormCategorySummary = {
  key: FormCategoryKey;
  label: string;
  stars: number | null;
  score: number | null;
  featureCount: number;
};

export type FormSummary = {
  categories: FormCategorySummary[];
  overallStars: number | null;
  overallScore: number | null;
  rank: "S" | "A" | "B" | "C" | "D" | null;
  strengths: EvaluatedFeature[];
  improvements: EvaluatedFeature[];
};

export function scoreFromStars(stars: number): number {
  return Math.round((stars / 5) * 100);
}

export function rankFromScore(score: number): FormSummary["rank"] {
  if (score >= 90) return "S";
  if (score >= 80) return "A";
  if (score >= 65) return "B";
  if (score >= 50) return "C";
  return "D";
}

export function getEvaluatedFeatures(features: Feature[]): EvaluatedFeature[] {
  const result: EvaluatedFeature[] = [];

  for (const feature of features) {
    const category = CATEGORY_BY_FEATURE_KEY[feature.key];
    if (!category) continue;

    const evaluation = evaluateFeature(feature);
    if (!evaluation) continue;

    result.push({ feature, evaluation, category });
  }

  return result;
}

export function toFormCategoryScores(
  categories: FormCategorySummary[]
): Record<FormCategoryKey, number | null> {
  const result = {} as Record<FormCategoryKey, number | null>;
  for (const category of categories) {
    result[category.key] = category.stars;
  }
  return result;
}

export function buildFormSummary(features: Feature[]): FormSummary {
  const evaluated = getEvaluatedFeatures(features);

  const categories: FormCategorySummary[] = (
    Object.keys(FORM_CATEGORY_LABELS) as FormCategoryKey[]
  ).map((key) => {
    const items = evaluated.filter((item) => item.category === key);
    if (items.length === 0) {
      return { key, label: FORM_CATEGORY_LABELS[key], stars: null, score: null, featureCount: 0 };
    }

    const avgStars =
      items.reduce((sum, item) => sum + item.evaluation.stars, 0) / items.length;

    return {
      key,
      label: FORM_CATEGORY_LABELS[key],
      stars: avgStars,
      score: scoreFromStars(avgStars),
      featureCount: items.length,
    };
  });

  const categoriesWithData = categories.filter(
    (c) => c.stars !== null && isOverallScoreCategory(c.key)
  );
  const overallStars =
    categoriesWithData.length > 0
      ? categoriesWithData.reduce((sum, c) => sum + (c.stars ?? 0), 0) / categoriesWithData.length
      : null;
  const overallScore = overallStars !== null ? scoreFromStars(overallStars) : null;
  const rank = overallScore !== null ? rankFromScore(overallScore) : null;

  const strengths = [...evaluated]
    .filter((item) => item.evaluation.stars >= 4)
    .sort((a, b) => b.evaluation.stars - a.evaluation.stars)
    .slice(0, 4);

  const improvements = [...evaluated]
    .filter((item) => item.evaluation.stars <= 3)
    .sort((a, b) => a.evaluation.stars - b.evaluation.stars)
    .slice(0, 4);

  return { categories, overallStars, overallScore, rank, strengths, improvements };
}
