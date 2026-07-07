import type { MarkerTarget } from "../types/measurement";

type Props = {
  target: MarkerTarget;
  onChange: (target: MarkerTarget) => void;
  onClearMarker: (target: MarkerTarget) => void;
};

const targets: MarkerTarget[] = [
  "calibA",
  "calibB",
  "ring",
  "finger",
  "ballA",
  "ballB",
];

const labels: Record<MarkerTarget, string> = {
  calibA: "基準A",
  calibB: "基準B",
  ring: "リング",
  finger: "指先",
  ballA: "ボールA",
  ballB: "ボールB",
};

export default function MarkerToolbar({
  target,
  onChange,
  onClearMarker,
}: Props) {
  return (
    <section>
      <h2>タップ対象</h2>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {targets.map((item) => (
          <button
            key={item}
            onClick={() => onChange(item)}
            onDoubleClick={() => onClearMarker(item)}
            style={{
              padding: 12,
              borderRadius: 12,
              background: target === item ? "#111" : "#fff",
              color: target === item ? "#fff" : "#000",
            }}
          >
            {labels[item]}
          </button>
        ))}
      </div>

      <p style={{ fontSize: 13 }}>
        ボタンをダブルクリックすると、そのマーカーだけ削除できます。
      </p>
    </section>
  );
}