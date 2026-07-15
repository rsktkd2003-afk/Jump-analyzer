import { useMemo, useState } from "react";

import type { MeasurementHistoryItem } from "../types/history";
import { FORM_CATEGORY_LABELS, type FormCategoryKey } from "../utils/formSummary";
import { card, colors, inputStyle, mutedText, page, sectionTitle } from "../styles/theme";

type Props = {
  history: MeasurementHistoryItem[];
};

type DiffRow = {
  label: string;
  unit: string;
  currentValue: number | null;
  previousValue: number | null;
  higherIsBetter: boolean;
  decimals: number;
};

function formatDate(iso: string) {
  const d = new Date(iso);
  return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}

export default function ComparePage({ history }: Props) {
  const [currentId, setCurrentId] = useState(history[0]?.id ?? "");
  const [previousId, setPreviousId] = useState(history[1]?.id ?? "");

  const current = history.find((h) => h.id === currentId) ?? history[0] ?? null;
  const previous = history.find((h) => h.id === previousId) ?? history[1] ?? null;

  const rows: DiffRow[] = useMemo(() => {
    if (!current) return [];
    return [
      {
        label: "最高到達点",
        unit: "cm",
        currentValue: current.estimatedMaxReach ?? current.maxReach,
        previousValue: previous ? previous.estimatedMaxReach ?? previous.maxReach : null,
        higherIsBetter: true,
        decimals: 1,
      },
      {
        label: "ジャンプ高",
        unit: "cm",
        currentValue: current.estimatedReachJumpHeight ?? current.jumpHeight,
        previousValue: previous ? previous.estimatedReachJumpHeight ?? previous.jumpHeight : null,
        higherIsBetter: true,
        decimals: 1,
      },
      {
        label: "滞空時間",
        unit: "秒",
        currentValue: current.airTime,
        previousValue: previous?.airTime ?? null,
        higherIsBetter: true,
        decimals: 2,
      },
      {
        label: "球速",
        unit: "km/h",
        currentValue: current.ballSpeed,
        previousValue: previous?.ballSpeed ?? null,
        higherIsBetter: true,
        decimals: 1,
      },
      {
        label: "総合スコア",
        unit: "点",
        currentValue: current.overallScore ?? null,
        previousValue: previous?.overallScore ?? null,
        higherIsBetter: true,
        decimals: 0,
      },
    ];
  }, [current, previous]);

  if (history.length === 0) {
    return (
      <div style={page}>
        <h1 style={{ fontSize: 20, marginBottom: 12 }}>比較する</h1>
        <p style={mutedText}>比較するにはまず解析結果を2件以上保存してください。</p>
      </div>
    );
  }

  return (
    <div style={page}>
      <h1 style={{ fontSize: 20, marginBottom: 16 }}>比較する</h1>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <PickerCard title="今回の解析" value={currentId} onChange={setCurrentId} history={history} accent />
        <PickerCard title="前回の解析" value={previousId} onChange={setPreviousId} history={history} />
      </div>

      <div style={{ ...card, marginTop: 20 }}>
        <h2 style={sectionTitle}>数値の差分</h2>
        <div style={{ marginTop: 8 }}>
          {rows.map((row) => {
            const diff =
              row.currentValue !== null && row.previousValue !== null
                ? row.currentValue - row.previousValue
                : null;
            const isGood = diff !== null ? (row.higherIsBetter ? diff >= 0 : diff <= 0) : null;

            return (
              <div
                key={row.label}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "10px 0",
                  borderBottom: `1px solid ${colors.border}`,
                  fontSize: 13,
                }}
              >
                <span style={{ color: colors.bodyText, fontWeight: 600, minWidth: 90 }}>{row.label}</span>
                <span style={{ fontWeight: 700, color: colors.titleText, minWidth: 90, textAlign: "right" }}>
                  {row.currentValue !== null ? `${row.currentValue.toFixed(row.decimals)}${row.unit}` : "-"}
                </span>
                <span
                  style={{
                    minWidth: 90,
                    textAlign: "right",
                    fontWeight: 700,
                    color: diff === null ? colors.mutedText : isGood ? colors.success : colors.warning,
                  }}
                >
                  {diff !== null ? `${diff >= 0 ? "+" : ""}${diff.toFixed(row.decimals)}${row.unit}` : "-"}
                </span>
                <span style={{ minWidth: 90, textAlign: "right", color: colors.mutedText }}>
                  {row.previousValue !== null ? `${row.previousValue.toFixed(row.decimals)}${row.unit}` : "-"}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ ...card, marginTop: 20 }}>
        <h2 style={sectionTitle}>フォームレーダー</h2>
        {current?.formCategoryScores || previous?.formCategoryScores ? (
          <RadarChart
            current={current?.formCategoryScores ?? null}
            previous={previous?.formCategoryScores ?? null}
          />
        ) : (
          <p style={{ ...mutedText, marginTop: 8 }}>
            カテゴリ別データが保存されていません（自動フォーム解析を実行して保存した結果から表示されます）。
          </p>
        )}
      </div>
    </div>
  );
}

function PickerCard({
  title,
  value,
  onChange,
  history,
  accent,
}: {
  title: string;
  value: string;
  onChange: (id: string) => void;
  history: MeasurementHistoryItem[];
  accent?: boolean;
}) {
  const item = history.find((h) => h.id === value);
  return (
    <div style={{ ...card, borderColor: accent ? colors.accent : colors.border }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: accent ? colors.accent : colors.bodyText }}>{title}</div>
      <select value={value} onChange={(e) => onChange(e.target.value)} style={{ ...inputStyle, marginTop: 8 }}>
        {history.map((h) => (
          <option key={h.id} value={h.id}>
            {formatDate(h.createdAt)}
          </option>
        ))}
      </select>
      <div style={{ fontSize: 28, fontWeight: 800, color: colors.titleText, marginTop: 12 }}>
        {typeof item?.overallScore === "number" ? `${item.overallScore}点` : "-"}
      </div>
    </div>
  );
}

const CATEGORY_ORDER: FormCategoryKey[] = ["approach", "takeoff", "air", "swing", "landing"];

function RadarChart({
  current,
  previous,
}: {
  current: Partial<Record<FormCategoryKey, number | null>> | null;
  previous: Partial<Record<FormCategoryKey, number | null>> | null;
}) {
  const size = 260;
  const center = size / 2;
  const maxRadius = size / 2 - 32;
  const angleStep = (Math.PI * 2) / CATEGORY_ORDER.length;

  const toPoint = (index: number, valueOutOf5: number) => {
    const angle = -Math.PI / 2 + angleStep * index;
    const r = (Math.max(0, Math.min(5, valueOutOf5)) / 5) * maxRadius;
    return { x: center + r * Math.cos(angle), y: center + r * Math.sin(angle) };
  };

  const toPolygon = (values: Partial<Record<FormCategoryKey, number | null>> | null) => {
    if (!values) return null;
    return CATEGORY_ORDER.map((key, i) => toPoint(i, values[key] ?? 0))
      .map((p) => `${p.x},${p.y}`)
      .join(" ");
  };

  const currentPolygon = toPolygon(current);
  const previousPolygon = toPolygon(previous);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 24, flexWrap: "wrap" }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {[1, 2, 3, 4, 5].map((ring) => (
          <polygon
            key={ring}
            points={CATEGORY_ORDER.map((_, i) => {
              const p = toPoint(i, ring);
              return `${p.x},${p.y}`;
            }).join(" ")}
            fill="none"
            stroke={colors.border}
            strokeWidth={1}
          />
        ))}

        {CATEGORY_ORDER.map((key, i) => {
          const p = toPoint(i, 5);
          return <line key={key} x1={center} y1={center} x2={p.x} y2={p.y} stroke={colors.border} strokeWidth={1} />;
        })}

        {previousPolygon && (
          <polygon points={previousPolygon} fill="none" stroke={colors.mutedText} strokeWidth={1.5} strokeDasharray="4 3" />
        )}
        {currentPolygon && (
          <polygon points={currentPolygon} fill={colors.accentSoft} stroke={colors.accent} strokeWidth={2} />
        )}

        {CATEGORY_ORDER.map((key, i) => {
          const p = toPoint(i, 5.85);
          return (
            <text key={key} x={p.x} y={p.y} fontSize={11} fill={colors.bodyText} textAnchor="middle" dominantBaseline="middle">
              {FORM_CATEGORY_LABELS[key]}
            </text>
          );
        })}
      </svg>

      <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 12 }}>
        <Legend color={colors.accent} label="今回" dashed={false} />
        <Legend color={colors.mutedText} label="前回" dashed />
      </div>
    </div>
  );
}

function Legend({ color, label, dashed }: { color: string; label: string; dashed: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <svg width={18} height={4}>
        <line x1={0} y1={2} x2={18} y2={2} stroke={color} strokeWidth={2} strokeDasharray={dashed ? "4 3" : undefined} />
      </svg>
      <span style={{ color: colors.bodyText }}>{label}</span>
    </div>
  );
}
