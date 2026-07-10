import { useMemo } from "react";

import { analyze, type AnalysisResult, type Feature, type PhaseSegment } from "../analysis";
import {
  buildCmMetrics,
  evaluateFeature,
  type BodyProfile,
  type CmMetricsResult,
} from "../analysis/evaluation";
import { runJumpPhaseEngine } from "../ai/jumpPhaseEngine";
import type { TrackedFrame } from "../ai/trackingAnalyzer";

const phaseLabels: Record<PhaseSegment["phase"], string> = {
  approach: "助走",
  takeoff: "踏切",
  ascent: "上昇",
  peak: "最高点",
  contact: "打球",
  descent: "下降",
  landing: "着地",
  finish: "終了",
};

const regionLabels: Record<Feature["region"], string> = {
  centerOfMass: "重心",
  lowerBody: "下半身",
  trunk: "体幹",
  arm: "腕",
  symmetry: "左右差",
};

type Props = {
  frames: TrackedFrame[];
  /** 身長・指高。cm換算に使用（未指定ならcm指標は非表示） */
  bodyProfile?: BodyProfile;
};

export default function SkillAnalysisPanel({ frames, bodyProfile }: Props) {
  const result = useMemo<AnalysisResult | null>(() => {
    if (frames.length < 3) return null;
    return analyze(frames, "spikeJump");
  }, [frames]);

  const cmMetrics = useMemo<CmMetricsResult | null>(() => {
    if (frames.length < 8) return null;
    const engine = runJumpPhaseEngine(frames);
    if (!engine) return null;
    return buildCmMetrics(
      frames,
      engine.events,
      bodyProfile ?? { heightCm: null, standingReachCm: null }
    );
  }, [frames, bodyProfile]);

  if (!result) return null;

  if (result.segments.length === 0) {
    return (
      <section style={cardStyle}>
        <h3 style={{ marginTop: 0 }}>スパイクジャンプ分析</h3>
        <p style={descriptionStyle}>
          はっきりしたジャンプ動作を検出できませんでした。
          選手全体（特に足元）が映っているか、トラッキング対象が正しいかを確認してください。
        </p>
      </section>
    );
  }

  return (
    <section style={cardStyle}>
      <h3 style={{ marginTop: 0 }}>スパイクジャンプ分析</h3>

      <p style={descriptionStyle}>
        足首・踵・つま先の接地判定と重心速度からフェーズを分割し、
        競技指標を★5段階で評価します。
      </p>

      <div style={{ marginTop: 12 }}>
        <strong>フェーズ分割（重複なし・時系列順）</strong>
        <div style={timelineStyle}>
          {result.segments.map((segment) => (
            <PhaseItem
              key={`${segment.phase}-${segment.startFrame}`}
              segment={segment}
            />
          ))}
        </div>
      </div>

      {cmMetrics && cmMetrics.metrics.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <strong>ジャンプ指標（cm換算）</strong>
          <div style={{ marginTop: 8 }}>
            {cmMetrics.metrics.map((metric) => (
              <div key={metric.label} style={metricRowStyle}>
                <div>
                  <span>{metric.label}</span>
                  {metric.note && (
                    <div style={smallTextStyle}>{metric.note}</div>
                  )}
                </div>
                <strong style={{ whiteSpace: "nowrap" }}>
                  {metric.valueCm.toFixed(1)} cm
                </strong>
              </div>
            ))}
          </div>
          <p style={smallTextStyle}>{cmMetrics.note}</p>
        </div>
      )}

      <div style={{ marginTop: 16 }}>
        <strong>競技評価</strong>
        {result.features.length === 0 ? (
          <p style={descriptionStyle}>十分な特徴量を抽出できませんでした。</p>
        ) : (
          <div style={{ marginTop: 8 }}>
            {result.features.map((feature) => (
              <FeatureRow key={feature.key} feature={feature} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function PhaseItem({ segment }: { segment: PhaseSegment }) {
  return (
    <div style={phaseItemStyle}>
      <strong>{phaseLabels[segment.phase]}</strong>
      <div style={smallTextStyle}>
        {segment.startFrame}F〜{segment.endFrame}F
      </div>
      <div style={smallTextStyle}>
        {segment.startTime.toFixed(3)}〜{segment.endTime.toFixed(3)}秒
      </div>
    </div>
  );
}

function FeatureRow({ feature }: { feature: Feature }) {
  const evaluation = evaluateFeature(feature);
  const lowConfidence = feature.confidence < 0.5;

  return (
    <div style={featureRowStyle}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <strong>{feature.label}</strong>
        <div style={smallTextStyle}>
          {phaseLabels[feature.phase]} / {regionLabels[feature.region]} / 信頼度
          {(feature.confidence * 100).toFixed(0)}%
          {lowConfidence && "（参考値）"}
        </div>
        {evaluation && (
          <div style={commentStyle}>{evaluation.comment}</div>
        )}
      </div>

      <div style={valueColumnStyle}>
        <div style={featureValueStyle}>{formatFeatureValue(feature)}</div>
        {evaluation && (
          <div style={starsStyle} aria-label={`5段階中${evaluation.stars}`}>
            {evaluation.starsText}
          </div>
        )}
      </div>
    </div>
  );
}

function formatFeatureValue(feature: Feature) {
  if (feature.unit === "deg") return `${feature.value.toFixed(1)}°`;
  if (feature.unit === "sec") return `${feature.value.toFixed(2)}秒`;
  if (feature.unit === "ratio") return `${(feature.value * 100).toFixed(0)}%`;
  if (feature.unit === "degPerSec") return `${feature.value.toFixed(0)}°/秒`;
  if (feature.unit === "normPxPerSec")
    return `${feature.value.toFixed(1)} 体幹長/秒`;
  return `体幹長の${(feature.value * 100).toFixed(0)}%`;
}

const cardStyle: React.CSSProperties = {
  marginTop: 12,
  padding: 16,
  borderRadius: 12,
  background: "#f7f7f7",
  border: "1px solid #ddd",
  fontSize: 14,
};

const descriptionStyle: React.CSSProperties = {
  margin: "8px 0 0",
  color: "#666",
  lineHeight: 1.6,
  fontSize: 13,
};

const timelineStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  marginTop: 8,
};

const phaseItemStyle: React.CSSProperties = {
  padding: "6px 10px",
  borderRadius: 8,
  background: "#fff",
  border: "1px solid #e0e0e0",
  minWidth: 96,
};

const metricRowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  padding: "8px 0",
  borderBottom: "1px solid #e5e5e5",
};

const featureRowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 12,
  padding: "10px 0",
  borderBottom: "1px solid #e5e5e5",
};

const valueColumnStyle: React.CSSProperties = {
  textAlign: "right",
  whiteSpace: "nowrap",
};

const featureValueStyle: React.CSSProperties = {
  fontWeight: 700,
  fontSize: 15,
};

const starsStyle: React.CSSProperties = {
  color: "#e09f3e",
  fontSize: 14,
  letterSpacing: 1,
};

const smallTextStyle: React.CSSProperties = {
  fontSize: 12,
  color: "#777",
  lineHeight: 1.5,
};

const commentStyle: React.CSSProperties = {
  fontSize: 13,
  color: "#444",
  lineHeight: 1.6,
  marginTop: 4,
};
