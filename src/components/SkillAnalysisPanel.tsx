import { useMemo } from "react";

import { analyze, type AnalysisResult, type Feature, type PhaseSegment } from "../analysis";
import type { TrackedFrame } from "../ai/trackingAnalyzer";

const phaseLabels: Record<PhaseSegment["phase"], string> = {
  approach: "助走",
  takeoff: "踏切",
  ascent: "上昇",
  peak: "最高点",
  contact: "打球",
  landing: "着地",
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
};

export default function SkillAnalysisPanel({ frames }: Props) {
  const result = useMemo<AnalysisResult | null>(() => {
    if (frames.length < 3) return null;
    return analyze(frames, "spikeJump");
  }, [frames]);

  if (!result) return null;

  return (
    <section style={cardStyle}>
      <h3 style={{ marginTop: 0 }}>スパイクジャンプ分析</h3>

      <p style={descriptionStyle}>
        トラッキング済みフレームを、助走・踏切・上昇・最高点・打球・着地に分け、
        身体スケールで正規化した特徴量を表示します。
      </p>

      <div style={{ marginTop: 12 }}>
        <strong>フェーズ分割</strong>
        {result.segments.length === 0 ? (
          <p style={descriptionStyle}>フェーズを推定できませんでした。</p>
        ) : (
          <div style={timelineStyle}>
            {result.segments.map((segment) => (
              <PhaseItem key={`${segment.phase}-${segment.startFrame}`} segment={segment} />
            ))}
          </div>
        )}
      </div>

      <div style={{ marginTop: 16 }}>
        <strong>特徴量</strong>
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
  return (
    <div style={featureRowStyle}>
      <div>
        <strong>{feature.label}</strong>
        <div style={smallTextStyle}>
          {phaseLabels[feature.phase]} / {regionLabels[feature.region]} / 信頼度
          {(feature.confidence * 100).toFixed(0)}%
        </div>
      </div>
      <div style={featureValueStyle}>{formatFeatureValue(feature)}</div>
    </div>
  );
}

function formatFeatureValue(feature: Feature) {
  if (feature.unit === "deg") return `${feature.value.toFixed(1)}°`;
  if (feature.unit === "sec") return `${feature.value.toFixed(3)}秒`;
  if (feature.unit === "ratio") return `${(feature.value * 100).toFixed(0)}%`;
  return feature.value.toFixed(2);
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
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 8,
  marginTop: 8,
};

const phaseItemStyle: React.CSSProperties = {
  padding: 10,
  borderRadius: 10,
  background: "#fff",
  border: "1px solid #e2e2e2",
};

const featureRowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  padding: "10px 0",
  borderBottom: "1px solid #ddd",
};

const featureValueStyle: React.CSSProperties = {
  minWidth: 72,
  textAlign: "right",
  fontWeight: 700,
};

const smallTextStyle: React.CSSProperties = {
  color: "#666",
  fontSize: 12,
  lineHeight: 1.5,
};