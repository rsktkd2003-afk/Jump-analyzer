// =============================================================
// 信頼度算出v2（Phase1）の検証コード。
//
// このプロジェクトにはテストランナーが未導入のため、単体テストの代わりに
// 実装済みの純粋関数（buildConfidenceAwareSummary）を直接呼び出して検証する
// （既存の spikeFormEvaluation.selfcheck.ts と同じ方式）。
//
// 実行方法（開発時の手動確認用。npm run build には含まれない）：
//   npx vite-node src/utils/analysisConfidence.selfcheck.ts
// =============================================================

import { buildConfidenceAwareSummary } from "./analysisConfidence";
import { DEFAULT_CAPTURE_SETTINGS } from "../ai/captureSettings";
import type { ConfidenceQualitySignals } from "../ai/trackingQualitySignals";
import type { Feature } from "../analysis/types";

const baseFeatures: Feature[] = [
  {
    key: "takeoff.kneeMinAngle",
    label: "踏切膝角度",
    phase: "takeoff",
    region: "lowerBody",
    value: 100,
    unit: "deg",
    confidence: 0.9,
  },
];

const NO_SIGNALS: ConfidenceQualitySignals = {
  interpolatedRatio: null,
  lowConfidenceFrameRatio: null,
  averageTrackerMatchScore: null,
  coastingFrameRatio: null,
  lateralityCorrectionRatio: null,
  averageLateralityCorrectionConfidence: null,
  abnormalJumpRatio: null,
};

function summarize(signals?: ConfidenceQualitySignals) {
  return buildConfidenceAwareSummary(baseFeatures, DEFAULT_CAPTURE_SETTINGS, 60, signals);
}

type Case = { name: string; run: () => string | null };

const cases: Case[] = [
  {
    name: "補間率が高い場合に信頼度が下がる",
    run: () => {
      const base = summarize(undefined);
      const withHighInterpolation = summarize({ ...NO_SIGNALS, interpolatedRatio: 0.5 });
      if (base.confidenceOverall === null || withHighInterpolation.confidenceOverall === null) {
        return "confidenceOverallがnullになった";
      }
      if (withHighInterpolation.confidenceVersion !== 2) return "confidenceVersionが2にならなかった";
      return withHighInterpolation.confidenceOverall < base.confidenceOverall
        ? null
        : `信頼度が下がらなかった (base=${base.confidenceOverall.toFixed(3)}, after=${withHighInterpolation.confidenceOverall.toFixed(3)})`;
    },
  },
  {
    name: "低信頼フレームが多い場合に信頼度が下がる",
    run: () => {
      const base = summarize(undefined);
      const withLowConfidenceFrames = summarize({ ...NO_SIGNALS, lowConfidenceFrameRatio: 0.5 });
      if (base.confidenceOverall === null || withLowConfidenceFrames.confidenceOverall === null) {
        return "confidenceOverallがnullになった";
      }
      return withLowConfidenceFrames.confidenceOverall < base.confidenceOverall
        ? null
        : `信頼度が下がらなかった (base=${base.confidenceOverall.toFixed(3)}, after=${withLowConfidenceFrames.confidenceOverall.toFixed(3)})`;
    },
  },
  {
    name: "トラッカーが安定している場合は不必要に減点しない",
    run: () => {
      const base = summarize(undefined);
      const withStableTracker = summarize({
        ...NO_SIGNALS,
        averageTrackerMatchScore: 0.92,
        coastingFrameRatio: 0.01,
      });
      if (base.confidenceOverall === null || withStableTracker.confidenceOverall === null) {
        return "confidenceOverallがnullになった";
      }
      const diff = Math.abs(withStableTracker.confidenceOverall - base.confidenceOverall);
      return diff < 1e-9 ? null : `安定しているのに信頼度が変化した (diff=${diff})`;
    },
  },
  {
    name: "左右補正が1回だけ（低頻度）発生しても過度に減点しない",
    run: () => {
      const base = summarize(undefined);
      // 100フレーム中1回だけ補正が発生したケース（低頻度）
      const withRareCorrection = summarize({
        ...NO_SIGNALS,
        lateralityCorrectionRatio: 0.01,
        averageLateralityCorrectionConfidence: 0.8,
      });
      if (base.confidenceOverall === null || withRareCorrection.confidenceOverall === null) {
        return "confidenceOverallがnullになった";
      }
      const diff = Math.abs(withRareCorrection.confidenceOverall - base.confidenceOverall);
      if (diff >= 1e-9) return `低頻度の補正なのに減点された (diff=${diff})`;
      if (withRareCorrection.confidenceWarnings.some((w) => w.includes("左右"))) {
        return "低頻度の補正なのに左右補正の警告が出た";
      }
      return null;
    },
  },
  {
    name: "複数の品質低下が重なった場合に警告が強くなる（単独より減点が大きく、警告も複数出る）",
    run: () => {
      const singleIssue = summarize({ ...NO_SIGNALS, interpolatedRatio: 0.5 });
      const multipleIssues = summarize({
        ...NO_SIGNALS,
        interpolatedRatio: 0.5,
        lowConfidenceFrameRatio: 0.5,
        averageTrackerMatchScore: 0.3,
        lateralityCorrectionRatio: 0.5,
      });

      if (singleIssue.confidenceOverall === null || multipleIssues.confidenceOverall === null) {
        return "confidenceOverallがnullになった";
      }
      if (multipleIssues.confidenceOverall >= singleIssue.confidenceOverall) {
        return "複数の問題が重なっても単独より減点が大きくならなかった";
      }
      if (multipleIssues.confidenceWarnings.length <= singleIssue.confidenceWarnings.length) {
        return "複数の問題が重なっても警告メッセージが増えなかった";
      }
      return null;
    },
  },
  {
    name: "qualitySignals未指定（旧データ相当）でもエラーなく動作し、v1相当の結果になる",
    run: () => {
      const withoutArg = buildConfidenceAwareSummary(baseFeatures, DEFAULT_CAPTURE_SETTINGS, 60);
      if (withoutArg.confidenceVersion !== 1) {
        return `confidenceVersion=${withoutArg.confidenceVersion} (期待: 1)`;
      }
      if (withoutArg.confidenceOverall === null) return "confidenceOverallがnullになった";
      return null;
    },
  },
];

const results = cases.map((c) => {
  const failure = c.run();
  return { name: c.name, pass: failure === null, detail: failure };
});

let allPass = true;
console.log("--- 信頼度算出v2 ---");
for (const r of results) {
  allPass = allPass && r.pass;
  console.log(`${r.pass ? "PASS" : "FAIL"} - ${r.name}${r.detail ? `\n  ${r.detail}` : ""}`);
}
console.log(allPass ? "\nすべてのケースに合格しました。" : "\n失敗したケースがあります。");
