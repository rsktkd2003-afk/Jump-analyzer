import type { TrackedFrame } from "../ai/trackingAnalyzer";

type Props = {
  frames: TrackedFrame[];
};

export default function MotionFingerprint({ frames }: Props) {
  if (frames.length < 2) return null;

  const values = createFingerprint(frames);

  return (
    <section style={cardStyle}>
      <h3 style={{ marginTop: 0 }}>フォーム指紋</h3>

      <Bar label="横移動" value={values.horizontal} />
      <Bar label="上下移動" value={values.vertical} />
      <Bar label="膝変化" value={values.knee} />
      <Bar label="股関節変化" value={values.hip} />
      <Bar label="肘変化" value={values.elbow} />

      <p style={{ fontSize: 13, color: "#666", lineHeight: 1.6 }}>
        良し悪しではなく、この動画に含まれる動作特徴の大きさを表示しています。
      </p>
    </section>
  );
}

function Bar({ label, value }: { label: string; value: number }) {
  const width = Math.max(0, Math.min(100, value));

  return (
    <div style={{ marginBottom: 10 }}>
      <div>{label}：{width.toFixed(0)}%</div>
      <div style={barBgStyle}>
        <div style={{ ...barStyle, width: `${width}%` }} />
      </div>
    </div>
  );
}

function createFingerprint(frames: TrackedFrame[]) {
  const xs = frames.map((f) => f.centerX);
  const ys = frames.map((f) => f.centerY);

  return {
    horizontal: normalize(Math.max(...xs) - Math.min(...xs), 180),
    vertical: normalize(Math.max(...ys) - Math.min(...ys), 220),
    knee: normalize(range(frames.map((f) => avg(f.leftKneeAngle, f.rightKneeAngle))), 70),
    hip: normalize(range(frames.map((f) => avg(f.leftHipAngle, f.rightHipAngle))), 60),
    elbow: normalize(range(frames.map((f) => avg(f.leftElbowAngle, f.rightElbowAngle))), 90),
  };
}

function normalize(value: number, max: number) {
  return (value / max) * 100;
}

function avg(a: number | null, b: number | null) {
  if (a === null && b === null) return null;
  if (a === null) return b;
  if (b === null) return a;
  return (a + b) / 2;
}

function range(values: Array<number | null>) {
  const valid = values.filter((v): v is number => v !== null);
  if (valid.length < 2) return 0;
  return Math.max(...valid) - Math.min(...valid);
}

const cardStyle: React.CSSProperties = {
  marginTop: 12,
  padding: 16,
  borderRadius: 12,
  background: "#f7f7f7",
  border: "1px solid #ddd",
  fontSize: 14,
};

const barBgStyle: React.CSSProperties = {
  height: 10,
  borderRadius: 999,
  background: "#ddd",
  overflow: "hidden",
};

const barStyle: React.CSSProperties = {
  height: "100%",
  background: "#222",
};