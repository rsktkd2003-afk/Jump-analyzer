import { useMemo, useState } from "react";

import type { HistoriesState } from "../hooks/useAnalysisHistories";
import type { AnalysisHistory } from "../types/analysisHistory";
import { FORM_CATEGORY_LABELS, type FormCategoryKey } from "../utils/formSummary";
import { confidenceLevelLabel } from "../utils/analysisConfidence";
import { ChevronLeftIcon } from "../components/layout/Icons";
import { card, colors, inputStyle, mutedText, page, radius, sectionTitle } from "../styles/theme";

type Props = {
  historiesState: HistoriesState;
  onBack: () => void;
};

type DiffRow = {
  label: string;
  unit: string;
  currentValue: number | null;
  previousValue: number | null;
  higherIsBetter: boolean;
  decimals: number;
};

const CATEGORY_ORDER: FormCategoryKey[] = ["approach", "takeoff", "air", "swing", "landing"];

function isCategoryComparable(history: AnalysisHistory, key: FormCategoryKey): boolean {
  const status = history.measurementStatuses[key];
  return status === "measured" || status === "reference";
}

export default function ComparePage({ historiesState, onBack }: Props) {
  const items = historiesState.status === "loaded" ? historiesState.items : [];

  const [currentId, setCurrentId] = useState<string>("");
  const [previousId, setPreviousId] = useState<string>("");

  // 削除済みの履歴が比較対象に残らないよう、一覧が更新されるたびに選択状態を検証する。
  // デフォルトは直近2件（未選択の場合のみ）。レンダー中にpropに応じて
  // stateを補正する公式パターンを使い、エフェクト内での無条件setStateを避ける。
  const idsKey = items.map((item) => item.id).join(",");
  const [checkedIdsKey, setCheckedIdsKey] = useState(idsKey);
  if (idsKey !== checkedIdsKey) {
    setCheckedIdsKey(idsKey);
    const ids = new Set(items.map((item) => item.id));
    if (!(currentId && ids.has(currentId))) setCurrentId(items[0]?.id ?? "");
    if (!(previousId && ids.has(previousId))) setPreviousId(items[1]?.id ?? "");
  }

  const current = items.find((h) => h.id === currentId) ?? null;
  const previous = items.find((h) => h.id === previousId) ?? null;
  const canCompare = Boolean(current && previous && current.id !== previous.id);

  const handleChangeCurrent = (id: string) => {
    if (id === previousId) {
      // 同じ履歴を2件選べないため、選択が重複したら入れ替える。
      setPreviousId(currentId);
    }
    setCurrentId(id);
  };

  const handleChangePrevious = (id: string) => {
    if (id === currentId) {
      setCurrentId(previousId);
    }
    setPreviousId(id);
  };

  const rows: DiffRow[] = useMemo(() => {
    if (!current || !previous) return [];
    return [
      {
        label: "総合スコア",
        unit: "点",
        currentValue: current.totalScore,
        previousValue: previous.totalScore,
        higherIsBetter: true,
        decimals: 0,
      },
      {
        label: "最高到達点",
        unit: "cm",
        currentValue: current.metrics.maxReachCm,
        previousValue: previous.metrics.maxReachCm,
        higherIsBetter: true,
        decimals: 1,
      },
      {
        label: "ジャンプ高",
        unit: "cm",
        currentValue: current.metrics.jumpHeightCm,
        previousValue: previous.metrics.jumpHeightCm,
        higherIsBetter: true,
        decimals: 1,
      },
      {
        label: "滞空時間",
        unit: "秒",
        currentValue: current.metrics.flightTimeSec,
        previousValue: previous.metrics.flightTimeSec,
        higherIsBetter: true,
        decimals: 2,
      },
      {
        label: "踏切時間",
        unit: "秒",
        currentValue: current.metrics.takeoffTimeSec,
        previousValue: previous.metrics.takeoffTimeSec,
        higherIsBetter: false,
        decimals: 2,
      },
    ];
  }, [current, previous]);

  // カテゴリ別の改善・悪化・変化なし（評価不能・未計測は差分計算の対象外）
  const categoryChanges = useMemo(() => {
    if (!current || !previous) return { improved: [] as string[], worsened: [] as string[], unchanged: [] as string[] };

    const improved: string[] = [];
    const worsened: string[] = [];
    const unchanged: string[] = [];

    for (const key of CATEGORY_ORDER) {
      if (!isCategoryComparable(current, key) || !isCategoryComparable(previous, key)) continue;
      const currentScore = current.categoryScores[key];
      const previousScore = previous.categoryScores[key];
      if (currentScore === null || previousScore === null) continue;

      const label = FORM_CATEGORY_LABELS[key];
      if (currentScore > previousScore) improved.push(label);
      else if (currentScore < previousScore) worsened.push(label);
      else unchanged.push(label);
    }

    return { improved, worsened, unchanged };
  }, [current, previous]);

  const versionMismatch = current && previous && current.analysisVersion !== previous.analysisVersion;
  const lowConfidenceIncluded =
    (current && current.confidence.level === "low") || (previous && previous.confidence.level === "low");

  if (historiesState.status === "not-logged-in") {
    return (
      <div style={page} className="page-container">
        <h1 style={{ fontSize: 20, marginBottom: 12 }}>比較する</h1>
        <p style={mutedText}>比較にはGoogleログインが必要です。</p>
      </div>
    );
  }

  if (historiesState.status === "loading") {
    return (
      <div style={page} className="page-container">
        <h1 style={{ fontSize: 20, marginBottom: 12 }}>比較する</h1>
        <p style={mutedText}>読み込み中...</p>
      </div>
    );
  }

  if (historiesState.status === "error") {
    return (
      <div style={page} className="page-container">
        <h1 style={{ fontSize: 20, marginBottom: 12 }}>比較する</h1>
        <p style={{ ...mutedText, color: colors.warning }}>{historiesState.message}</p>
      </div>
    );
  }

  if (items.length < 2) {
    return (
      <div style={page} className="page-container">
        <h1 style={{ fontSize: 20, marginBottom: 12 }}>比較する</h1>
        <p style={mutedText}>比較するにはまず解析結果を2件以上保存してください。</p>
      </div>
    );
  }

  return (
    <div style={page} className="page-container">
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <button
          onClick={onBack}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 40,
            height: 40,
            flexShrink: 0,
            borderRadius: radius.sm,
            border: `1px solid ${colors.border}`,
            background: "#fff",
            cursor: "pointer",
            color: colors.titleText,
          }}
          aria-label="戻る"
        >
          <ChevronLeftIcon size={18} />
        </button>
        <h1 style={{ fontSize: 20 }}>比較する</h1>
      </div>

      <div className="grid-2col-picker" style={{ display: "grid", gap: 16 }}>
        <PickerCard title="今回の解析" value={currentId} onChange={handleChangeCurrent} items={items} accent />
        <PickerCard title="前回の解析" value={previousId} onChange={handleChangePrevious} items={items} />
      </div>

      {!canCompare ? (
        <p style={{ ...mutedText, marginTop: 16 }}>2件の異なる履歴を選択すると比較結果が表示されます。</p>
      ) : (
        <>
          {(versionMismatch || lowConfidenceIncluded) && (
            <div style={{ ...card, marginTop: 20, background: colors.accentSofter }}>
              {versionMismatch && (
                <p style={{ fontSize: 12, color: colors.titleText, margin: 0 }}>
                  解析基準のバージョンが異なるため、スコア差は参考値です。
                </p>
              )}
              {lowConfidenceIncluded && (
                <p style={{ fontSize: 12, color: colors.titleText, margin: versionMismatch ? "6px 0 0" : 0 }}>
                  解析信頼度が低い結果が含まれているため、差分は参考程度に見てください。
                </p>
              )}
            </div>
          )}

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
                      flexWrap: "wrap",
                      rowGap: 4,
                      padding: "10px 0",
                      borderBottom: `1px solid ${colors.border}`,
                      fontSize: 13,
                    }}
                  >
                    <span style={{ color: colors.bodyText, fontWeight: 600, minWidth: 90 }}>{row.label}</span>
                    <span style={{ fontWeight: 700, color: colors.titleText, minWidth: 90, textAlign: "right" }}>
                      {row.currentValue !== null ? `${row.currentValue.toFixed(row.decimals)}${row.unit}` : "データなし"}
                    </span>
                    <span
                      style={{
                        minWidth: 90,
                        textAlign: "right",
                        fontWeight: 700,
                        color: diff === null ? colors.mutedText : isGood ? colors.success : colors.warning,
                      }}
                    >
                      {diff !== null ? `${diff >= 0 ? "+" : ""}${diff.toFixed(row.decimals)}${row.unit}` : "比較不可"}
                    </span>
                    <span style={{ minWidth: 90, textAlign: "right", color: colors.mutedText }}>
                      {row.previousValue !== null ? `${row.previousValue.toFixed(row.decimals)}${row.unit}` : "データなし"}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <div style={{ ...card, marginTop: 20 }}>
            <h2 style={sectionTitle}>フォームカテゴリの変化</h2>
            <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6, fontSize: 13 }}>
              <CategoryChangeRow label="改善した項目" items={categoryChanges.improved} color={colors.success} />
              <CategoryChangeRow label="悪化した項目" items={categoryChanges.worsened} color={colors.warning} />
              <CategoryChangeRow label="変化がない項目" items={categoryChanges.unchanged} color={colors.mutedText} />
            </div>
            {categoryChanges.improved.length === 0 &&
              categoryChanges.worsened.length === 0 &&
              categoryChanges.unchanged.length === 0 && (
                <p style={{ ...mutedText, marginTop: 8 }}>
                  比較可能なカテゴリ別データがありません（評価不能・未計測の項目は比較対象外です）。
                </p>
              )}
          </div>

          <div style={{ ...card, marginTop: 20 }}>
            <h2 style={sectionTitle}>解析信頼度・バージョン</h2>
            <div style={{ marginTop: 8, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, fontSize: 12 }}>
              <div>
                <div style={{ color: colors.mutedText }}>今回</div>
                <div style={{ color: colors.titleText, fontWeight: 700, marginTop: 2 }}>
                  信頼度：{confidenceLevelLabel(current!.confidence.level)} ／ v{current!.analysisVersion}
                </div>
              </div>
              <div>
                <div style={{ color: colors.mutedText }}>前回</div>
                <div style={{ color: colors.titleText, fontWeight: 700, marginTop: 2 }}>
                  信頼度：{confidenceLevelLabel(previous!.confidence.level)} ／ v{previous!.analysisVersion}
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function CategoryChangeRow({ label, items, color }: { label: string; items: string[]; color: string }) {
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
      <span style={{ color: colors.bodyText, fontWeight: 600, minWidth: 100 }}>{label}</span>
      <span style={{ color: items.length > 0 ? color : colors.mutedText }}>
        {items.length > 0 ? items.join("・") : "なし"}
      </span>
    </div>
  );
}

function PickerCard({
  title,
  value,
  onChange,
  items,
  accent,
}: {
  title: string;
  value: string;
  onChange: (id: string) => void;
  items: AnalysisHistory[];
  accent?: boolean;
}) {
  const item = items.find((h) => h.id === value);
  return (
    <div style={{ ...card, borderColor: accent ? colors.accent : colors.border }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: accent ? colors.accent : colors.bodyText }}>{title}</div>
      <select value={value} onChange={(e) => onChange(e.target.value)} style={{ ...inputStyle, marginTop: 8 }}>
        <option value="" disabled>
          選択してください
        </option>
        {items.map((h) => (
          <option key={h.id} value={h.id}>
            {h.title}（{h.savedAt.toDate().toLocaleDateString()}）
          </option>
        ))}
      </select>
      <div style={{ fontSize: 28, fontWeight: 800, color: colors.titleText, marginTop: 12 }}>
        {typeof item?.totalScore === "number" ? `${item.totalScore}点` : "-"}
      </div>
    </div>
  );
}
