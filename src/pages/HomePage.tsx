import { AnalyzeIcon } from "../components/layout/Icons";
import StatCard from "../components/ui/StatCard";
import type { HistoriesState } from "../hooks/useAnalysisHistories";
import { computeHomeStats } from "../utils/historyStats";
import { card, colors, mutedText, page, sectionTitle } from "../styles/theme";

type Props = {
  userName: string;
  isLoggedIn: boolean;
  historiesState: HistoriesState;
  onStartAnalyze: () => void;
  onOpenHistory: () => void;
};

export default function HomePage({
  userName,
  isLoggedIn,
  historiesState,
  onStartAnalyze,
  onOpenHistory,
}: Props) {
  const items = historiesState.status === "loaded" ? historiesState.items : [];
  const stats = computeHomeStats(items);
  const recent = items.slice(0, 4);
  const latest = items[0];

  return (
    <div style={page} className="page-container">
      <div>
        <h1 style={{ fontSize: 22 }}>こんにちは、{userName}さん！</h1>
        <p style={{ ...mutedText, marginTop: 4 }}>今日も最高のジャンプを分析しましょう</p>
      </div>

      <div
        className="grid-2col-hero"
        style={{
          marginTop: 20,
          display: "grid",
          gap: 16,
          alignItems: "stretch",
        }}
      >
        <button
          onClick={onStartAnalyze}
          style={{
            textAlign: "left",
            border: "none",
            cursor: "pointer",
            borderRadius: 20,
            padding: 28,
            background: `linear-gradient(135deg, ${colors.accent}, #c62828)`,
            color: "#fff",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            minHeight: 160,
          }}
        >
          <div>
            <h2 style={{ fontSize: 20, color: "#fff", marginBottom: 6 }}>新しく解析する</h2>
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.85)", margin: 0, lineHeight: 1.6 }}>
              動画をアップロードして
              <br />
              ジャンプ・スパイクを解析します
            </p>
          </div>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: "50%",
              background: "rgba(255,255,255,0.18)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              alignSelf: "flex-end",
            }}
          >
            <AnalyzeIcon size={22} style={{ color: "#fff" }} />
          </div>
        </button>

        <div style={card}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <h2 style={sectionTitle}>最近の解析</h2>
            <button
              onClick={onOpenHistory}
              style={{ border: "none", background: "none", color: colors.accent, fontSize: 12, fontWeight: 600, cursor: "pointer" }}
            >
              すべて見る ›
            </button>
          </div>

          {!isLoggedIn ? (
            <p style={{ ...mutedText, marginTop: 12 }}>
              Googleでログインすると、保存した解析履歴がここに表示されます。
            </p>
          ) : historiesState.status === "loading" ? (
            <p style={{ ...mutedText, marginTop: 12 }}>読み込み中...</p>
          ) : historiesState.status === "error" ? (
            <p style={{ ...mutedText, marginTop: 12, color: colors.warning }}>{historiesState.message}</p>
          ) : recent.length === 0 ? (
            <p style={{ ...mutedText, marginTop: 12 }}>まだ解析履歴がありません。</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 8 }}>
              {recent.map((item) => (
                <div
                  key={item.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "8px 4px",
                    borderBottom: `1px solid ${colors.border}`,
                  }}
                >
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: colors.titleText }}>
                      {item.savedAt.toDate().toLocaleDateString()}
                    </div>
                    <div style={{ fontSize: 11, color: colors.mutedText }}>
                      {item.savedAt.toDate().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </div>
                  </div>
                  <div
                    style={{
                      fontSize: 15,
                      fontWeight: 800,
                      color: typeof item.totalScore === "number" ? colors.accent : colors.mutedText,
                    }}
                  >
                    {typeof item.totalScore === "number" ? `${item.totalScore}点` : "-"}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div
        style={{
          marginTop: 20,
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
          gap: 14,
        }}
      >
        <StatCard label="平均ジャンプ高" value={stats.averageJumpHeight !== null ? `${stats.averageJumpHeight.toFixed(1)} cm` : "-"} />
        <StatCard label="最高到達点" value={stats.bestMaxReach !== null ? `${stats.bestMaxReach.toFixed(0)} cm` : "-"} />
        <StatCard label="解析回数" value={`${stats.analysisCount} 回`} />
        <StatCard label="平均スコア" value={stats.averageScore !== null ? `${stats.averageScore.toFixed(1)} 点` : "-"} />
        <StatCard
          label="改善率"
          value={stats.improvementRate !== null ? `${stats.improvementRate >= 0 ? "+" : ""}${stats.improvementRate.toFixed(1)}%` : "-"}
          delta={stats.improvementRate !== null ? "過去4回" : undefined}
          deltaKind={stats.improvementRate !== null && stats.improvementRate >= 0 ? "success" : "warning"}
        />
      </div>

      <div style={{ ...card, marginTop: 20 }}>
        <h2 style={sectionTitle}>AIからの最新コメント</h2>
        {latest && (latest.improvements.length > 0 || latest.strengths.length > 0) ? (
          <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
            {latest.strengths.slice(0, 1).map((c, i) => (
              <p key={`s-${i}`} style={{ ...mutedText, color: colors.titleText }}>
                {c}
              </p>
            ))}
            {latest.improvements.slice(0, 1).map((c, i) => (
              <p key={`i-${i}`} style={mutedText}>
                {c}
              </p>
            ))}
          </div>
        ) : (
          <p style={{ ...mutedText, marginTop: 8 }}>
            動画を解析すると、フォームの良い点・改善点をAIがここに表示します。
          </p>
        )}
      </div>
    </div>
  );
}
