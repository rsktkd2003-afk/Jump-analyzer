import type { TrackedFrame } from "../ai/trackingAnalyzer";
import { analyzeJumpPhases } from "../ai/jumpPhaseAnalyzer";

type Props = {
  frames: TrackedFrame[];
};

export default function JumpPhasePanel({ frames }: Props) {
  const result = analyzeJumpPhases(frames);

  if (!result) return null;

  return (
    <section style={cardStyle}>
      <h3 style={{ marginTop: 0 }}>ジャンプフェーズ</h3>

      <div>最高点候補：{result.peakFrame.frameIndex}F / {result.peakFrame.time.toFixed(3)}秒</div>

      <div style={{ marginTop: 12 }}>
        {result.phases.map((phase) => (
          <div key={phase.name} style={phaseStyle}>
            <strong>{phase.name}</strong>
            <div>
              {phase.startIndex}〜{phase.endIndex} frame
            </div>
            <div>
              {phase.startTime.toFixed(3)}〜{phase.endTime.toFixed(3)} 秒
            </div>
          </div>
        ))}
      </div>
    </section>
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

const phaseStyle: React.CSSProperties = {
  padding: "8px 0",
  borderBottom: "1px solid #ddd",
};