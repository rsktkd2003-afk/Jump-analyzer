import type { MeasurementHistoryItem } from "../types/history";
import { card, colors, ghostButton, mutedText, page, secondaryButton } from "../styles/theme";

type Props = {
  history: MeasurementHistoryItem[];
  onClear: () => void;
  onOpenCompare: () => void;
};

export default function HistoryPage({ history, onClear, onOpenCompare }: Props) {
  return (
    <div style={page}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <h1 style={{ fontSize: 20 }}>解析履歴</h1>
        <div style={{ display: "flex", gap: 8 }}>
          {history.length > 1 && (
            <button style={secondaryButton} onClick={onOpenCompare}>
              比較する
            </button>
          )}
          {history.length > 0 && (
            <button style={ghostButton} onClick={onClear}>
              履歴を全削除
            </button>
          )}
        </div>
      </div>

      {history.length === 0 ? (
        <p style={{ ...mutedText, marginTop: 16 }}>まだ履歴はありません。</p>
      ) : (
        <div
          style={{
            marginTop: 16,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
            gap: 16,
          }}
        >
          {history.map((item) => (
            <div key={item.id} style={card}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: colors.titleText }}>
                  {new Date(item.createdAt).toLocaleString()}
                </div>
                {typeof item.overallScore === "number" && (
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 800,
                      color: colors.accent,
                      background: colors.accentSoft,
                      borderRadius: 999,
                      padding: "3px 10px",
                    }}
                  >
                    {item.overallScore}点{item.rank ? ` ${item.rank}` : ""}
                  </span>
                )}
              </div>

              <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 12 }}>
                <Metric label="最高到達点" value={item.maxReach ? `${item.maxReach.toFixed(1)}cm` : "-"} />
                <Metric label="ジャンプ高" value={item.jumpHeight ? `${item.jumpHeight.toFixed(1)}cm` : "-"} />
                <Metric label="滞空時間" value={item.airTime ? `${item.airTime.toFixed(3)}秒` : "-"} />
                <Metric label="球速" value={item.ballSpeed ? `${item.ballSpeed.toFixed(1)}km/h` : "-"} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ color: colors.mutedText }}>{label}</div>
      <div style={{ color: colors.titleText, fontWeight: 700, marginTop: 2 }}>{value}</div>
    </div>
  );
}
