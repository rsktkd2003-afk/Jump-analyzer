import { useState } from "react";
import type { TrackedFrame } from "../ai/trackingAnalyzer";

type Props = {
  frames: TrackedFrame[];
};

type HistoryItem = {
  id: string;
  savedAt: string;
  horizontalMove: number;
  verticalMove: number;
  kneeRange: number;
  hipRange: number;
  elbowRange: number;
};

const STORAGE_KEY = "jump_analyzer_motion_history";

function loadHistory(): HistoryItem[] {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];

  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export default function MotionHistoryPanel({ frames }: Props) {
  const [history, setHistory] = useState<HistoryItem[]>(loadHistory);

  const saveCurrent = () => {
    const item = createHistoryItem(frames);
    if (!item) return;

    const next = [item, ...history].slice(0, 20);
    setHistory(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  };

  const clearHistory = () => {
    setHistory([]);
    localStorage.removeItem(STORAGE_KEY);
  };

  if (frames.length < 2) return null;

  return (
    <section style={cardStyle}>
      <h3 style={{ marginTop: 0 }}>過去の自分との比較</h3>

      <button onClick={saveCurrent} style={buttonStyle}>
        今回の動作を保存
      </button>

      <button onClick={clearHistory} style={buttonStyle}>
        履歴を削除
      </button>

      {history.length === 0 ? (
        <p style={{ fontSize: 13 }}>まだ保存された履歴がありません。</p>
      ) : (
        <div style={{ marginTop: 12 }}>
          {history.map((item) => (
            <div key={item.id} style={itemStyle}>
              <strong>{new Date(item.savedAt).toLocaleString()}</strong>
              <div>左右移動：{item.horizontalMove.toFixed(1)} px</div>
              <div>上下移動：{item.verticalMove.toFixed(1)} px</div>
              <div>膝変化：{item.kneeRange.toFixed(1)}°</div>
              <div>股関節変化：{item.hipRange.toFixed(1)}°</div>
              <div>肘変化：{item.elbowRange.toFixed(1)}°</div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function createHistoryItem(frames: TrackedFrame[]): HistoryItem | null {
  if (frames.length < 2) return null;

  const xs = frames.map((f) => f.centerX);
  const ys = frames.map((f) => f.centerY);

  return {
    id: crypto.randomUUID(),
    savedAt: new Date().toISOString(),
    horizontalMove: Math.max(...xs) - Math.min(...xs),
    verticalMove: Math.max(...ys) - Math.min(...ys),
    kneeRange: range(frames.map((f) => avg(f.leftKneeAngle, f.rightKneeAngle))),
    hipRange: range(frames.map((f) => avg(f.leftHipAngle, f.rightHipAngle))),
    elbowRange: range(frames.map((f) => avg(f.leftElbowAngle, f.rightElbowAngle))),
  };
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

const buttonStyle: React.CSSProperties = {
  padding: 10,
  borderRadius: 10,
  border: "1px solid #ccc",
  background: "#fff",
  marginRight: 8,
};

const itemStyle: React.CSSProperties = {
  padding: "10px 0",
  borderBottom: "1px solid #ddd",
  lineHeight: 1.7,
};