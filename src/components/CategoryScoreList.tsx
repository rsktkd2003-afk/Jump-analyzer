// =============================================================
// カテゴリ別（助走/踏切/空中姿勢/スイング/着地）の★評価・点数を表示する
// 共通コンポーネント。解析結果画面（ResultPage）と履歴詳細（HistoryPage）の
// 双方から、同じ見た目・同じ測定不能ラベルで利用する。
// =============================================================
import StarRow from "./ui/StarRow";
import { colors } from "../styles/theme";
import { measurementStatusLabel, type MeasurementStatus } from "../utils/analysisConfidence";

export type CategoryScoreItem = {
  key: string;
  label: string;
  stars: number | null;
  score: number | null;
  status: MeasurementStatus;
};

export default function CategoryScoreList({ categories }: { categories: CategoryScoreItem[] }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 8 }}>
      {categories.map((c) => (
        <div key={c.key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <span style={{ fontSize: 13, color: colors.titleText, fontWeight: 600, minWidth: 64 }}>{c.label}</span>
          {c.stars !== null ? (
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <StarRow stars={c.stars} />
              <span style={{ fontSize: 12, color: colors.bodyText, minWidth: 32, textAlign: "right" }}>
                {c.score}点{c.status === "reference" ? "（参考値）" : ""}
              </span>
            </div>
          ) : (
            <span style={{ fontSize: 12, color: colors.mutedText }}>{measurementStatusLabel(c.status)}</span>
          )}
        </div>
      ))}
    </div>
  );
}
