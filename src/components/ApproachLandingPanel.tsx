import { analyzeApproachAndLanding } from "../ai/approachLandingAnalyzer";
import type { TrackedFrame } from "../ai/trackingAnalyzer";

type Props = {
  frames: TrackedFrame[];
};

export default function ApproachLandingPanel({ frames }: Props) {
  const result = analyzeApproachAndLanding(frames);

  if (!result) return null;

  return (
    <section style={cardStyle}>
      <h3 style={{ marginTop: 0 }}>助走・着地解析</h3>

      <p style={noteStyle}>
        骨格点とフェーズ情報から見た傾向です。医療的な診断や怪我リスクの判定ではありません。
      </p>

      <div style={gridStyle}>
        <Metric label="助走速度" value={result.approach.speedLevel} />
        <Metric label="踏切前減速" value={result.approach.decelerationLevel} />
        <Metric label="助走安定度" value={result.approach.stabilityLevel} />
        <Metric label="着地左右差" value={result.landing.sideDiffLevel} />
        <Metric
          label="片足着地傾向"
          value={result.landing.singleLegLandingTendency}
        />
        <Metric label="着地バランス" value={result.landing.balanceLevel} />
      </div>

      <div style={detailStyle}>
        <strong>助走</strong>
        <div>
          水平移動量：
          {result.approach.horizontalMovePx !== null
            ? `${Math.round(Math.abs(result.approach.horizontalMovePx))} px`
            : "-"}
        </div>
        <div>{result.approach.takeoffCenterText}</div>
        <ul style={listStyle}>
          {result.approach.comments.map((comment) => (
            <li key={comment}>{comment}</li>
          ))}
        </ul>
      </div>

      <div style={detailStyle}>
        <strong>着地</strong>
        <div>
          左右足の接地タイミング差：
          {result.landing.footTimingDiffSec !== null
            ? `${result.landing.footTimingDiffSec.toFixed(3)} 秒`
            : "-"}
        </div>
        <ul style={listStyle}>
          {result.landing.comments.map((comment) => (
            <li key={comment}>{comment}</li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div style={metricStyle}>
      <div style={metricLabelStyle}>{label}</div>
      <strong>{value}</strong>
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  marginTop: 12,
  padding: 16,
  borderRadius: 12,
  background: "#f7f7f7",
  border: "1px solid #ddd",
  fontSize: 14,
};

const noteStyle: React.CSSProperties = {
  marginTop: 0,
  color: "#666",
  lineHeight: 1.6,
};

const gridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
  gap: 8,
  marginTop: 12,
};

const metricStyle: React.CSSProperties = {
  padding: 10,
  borderRadius: 10,
  background: "#fff",
  border: "1px solid #e0e0e0",
};

const metricLabelStyle: React.CSSProperties = {
  fontSize: 12,
  color: "#666",
  marginBottom: 4,
};

const detailStyle: React.CSSProperties = {
  marginTop: 14,
  paddingTop: 12,
  borderTop: "1px solid #ddd",
  lineHeight: 1.6,
};

const listStyle: React.CSSProperties = {
  marginTop: 8,
  paddingLeft: 20,
};