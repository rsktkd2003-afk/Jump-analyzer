import { useState } from "react";

import type { AuthUser } from "../firebase/authService";
import type { HistoriesState } from "../hooks/useAnalysisHistories";
import type { AnalysisHistory } from "../types/analysisHistory";
import GoogleSignInButton from "../components/GoogleSignInButton";
import CategoryScoreList from "../components/CategoryScoreList";
import { ChevronLeftIcon } from "../components/layout/Icons";
import { confidenceLevelLabel, type MeasurementStatus } from "../utils/analysisConfidence";
import { FORM_CATEGORY_LABELS, type FormCategoryKey } from "../utils/formSummary";
import {
  card,
  colors,
  ghostButton,
  mutedText,
  page,
  radius,
  secondaryButton,
  sectionTitle,
} from "../styles/theme";

type Props = {
  authUser: AuthUser | null;
  isAuthReady: boolean;
  isFirebaseReady: boolean;
  isSigningIn: boolean;
  onSignIn: () => Promise<void>;
  historiesState: HistoriesState;
  onOpenCompare: () => void;
  onDeleteHistory: (historyId: string) => Promise<void>;
  onDeleteAllHistories: (historyIds: string[]) => Promise<void>;
};

function formatMetric(
  value: number | null,
  status: MeasurementStatus,
  unit: string,
  decimals: number
): string {
  if (status === "notMeasured") return "未計測";
  if (value === null) return "測定できませんでした";
  const text = `${value.toFixed(decimals)}${unit}`;
  return status === "reference" ? `${text}（参考値）` : text;
}

export default function HistoryPage({
  authUser,
  isAuthReady,
  isFirebaseReady,
  isSigningIn,
  onSignIn,
  historiesState,
  onOpenCompare,
  onDeleteHistory,
  onDeleteAllHistories,
}: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [confirmClearAll, setConfirmClearAll] = useState(false);
  const [isClearingAll, setIsClearingAll] = useState(false);

  const items = historiesState.status === "loaded" ? historiesState.items : [];
  const selected = items.find((item) => item.id === selectedId) ?? null;

  const handleDelete = async (historyId: string) => {
    setDeletingId(historyId);
    setDeleteError(null);
    try {
      await onDeleteHistory(historyId);
      setConfirmDeleteId(null);
      if (selectedId === historyId) setSelectedId(null);
    } catch (error) {
      console.error(error);
      setDeleteError("削除に失敗しました。通信状況を確認してもう一度お試しください。");
    } finally {
      setDeletingId(null);
    }
  };

  const handleClearAll = async () => {
    setIsClearingAll(true);
    setDeleteError(null);
    try {
      await onDeleteAllHistories(items.map((item) => item.id));
      setConfirmClearAll(false);
      setSelectedId(null);
    } catch (error) {
      console.error(error);
      setDeleteError("一括削除に失敗しました。通信状況を確認してもう一度お試しください。");
    } finally {
      setIsClearingAll(false);
    }
  };

  if (!isFirebaseReady) {
    return (
      <div style={page} className="page-container">
        <h1 style={{ fontSize: 20, marginBottom: 16 }}>解析履歴</h1>
        <p style={mutedText}>ログイン機能は準備中です。動画解析は引き続きご利用いただけます。</p>
      </div>
    );
  }

  if (!isAuthReady) {
    return (
      <div style={page} className="page-container">
        <h1 style={{ fontSize: 20, marginBottom: 16 }}>解析履歴</h1>
        <p style={mutedText}>確認中...</p>
      </div>
    );
  }

  if (!authUser) {
    return (
      <div style={page} className="page-container">
        <h1 style={{ fontSize: 20, marginBottom: 16 }}>解析履歴</h1>
        <div style={{ ...card, textAlign: "center", padding: "48px 24px" }}>
          <p style={{ ...mutedText, marginBottom: 16 }}>
            解析履歴の保存・閲覧にはGoogleログインが必要です。
          </p>
          <GoogleSignInButton onClick={() => void onSignIn()} isLoading={isSigningIn} />
        </div>
      </div>
    );
  }

  if (selected) {
    return (
      <HistoryDetail
        history={selected}
        onBack={() => setSelectedId(null)}
        onDelete={() => setConfirmDeleteId(selected.id)}
        confirmOpen={confirmDeleteId === selected.id}
        onCancelDelete={() => setConfirmDeleteId(null)}
        onConfirmDelete={() => handleDelete(selected.id)}
        isDeleting={deletingId === selected.id}
        deleteError={deleteError}
      />
    );
  }

  return (
    <div style={page} className="page-container">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <h1 style={{ fontSize: 20 }}>解析履歴</h1>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {items.length > 1 && (
            <button style={secondaryButton} onClick={onOpenCompare}>
              比較する
            </button>
          )}
          {items.length > 0 && (
            <button style={ghostButton} onClick={() => setConfirmClearAll(true)}>
              履歴を全削除
            </button>
          )}
        </div>
      </div>

      {deleteError && <p style={{ ...mutedText, color: colors.warning, marginTop: 12 }}>{deleteError}</p>}

      {confirmClearAll && (
        <div style={{ ...card, marginTop: 16, borderColor: colors.warningSoft }}>
          <p style={{ fontSize: 13, color: colors.titleText, margin: 0 }}>
            保存済みの解析履歴を{items.length}件すべて削除します。この操作は取り消せません。よろしいですか？
          </p>
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button style={ghostButton} onClick={() => setConfirmClearAll(false)} disabled={isClearingAll}>
              キャンセル
            </button>
            <button
              style={{ ...ghostButton, color: "#fff", background: colors.warning, borderColor: colors.warning }}
              onClick={handleClearAll}
              disabled={isClearingAll}
            >
              {isClearingAll ? "削除中..." : "全削除する"}
            </button>
          </div>
        </div>
      )}

      {historiesState.status === "loading" && (
        <p style={{ ...mutedText, marginTop: 16 }}>読み込み中...</p>
      )}

      {historiesState.status === "error" && (
        <p style={{ ...mutedText, marginTop: 16, color: colors.warning }}>{historiesState.message}</p>
      )}

      {historiesState.status === "loaded" && items.length === 0 && (
        <p style={{ ...mutedText, marginTop: 16 }}>まだ履歴はありません。解析結果画面から「履歴に保存」してみましょう。</p>
      )}

      {historiesState.status === "loaded" && items.length > 0 && (
        <div
          style={{
            marginTop: 16,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
            gap: 16,
          }}
        >
          {items.map((item) => (
            <button
              key={item.id}
              onClick={() => setSelectedId(item.id)}
              style={{ ...card, textAlign: "left", cursor: "pointer", border: `1px solid ${colors.border}` }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: colors.titleText, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {item.title}
                </div>
                {typeof item.totalScore === "number" && (
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 800,
                      color: colors.accent,
                      background: colors.accentSoft,
                      borderRadius: 999,
                      padding: "3px 10px",
                      flexShrink: 0,
                    }}
                  >
                    {item.totalScore}点
                  </span>
                )}
              </div>

              <div style={{ marginTop: 6, fontSize: 11, color: colors.mutedText }}>
                解析日時：{item.analyzedAt.toDate().toLocaleString()}
              </div>
              <div style={{ fontSize: 11, color: colors.mutedText }}>
                保存日時：{item.savedAt.toDate().toLocaleString()}
              </div>

              <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 12 }}>
                <Metric
                  label="最高到達点"
                  value={formatMetric(item.metrics.maxReachCm, item.measurementStatuses.maxReachCm ?? "notMeasured", "cm", 1)}
                />
                <Metric
                  label="ジャンプ高"
                  value={formatMetric(item.metrics.jumpHeightCm, item.measurementStatuses.jumpHeightCm ?? "notMeasured", "cm", 1)}
                />
                <Metric
                  label="滞空時間"
                  value={formatMetric(item.metrics.flightTimeSec, item.measurementStatuses.flightTimeSec ?? "notMeasured", "秒", 3)}
                />
                <Metric label="解析信頼度" value={confidenceLevelLabel(item.confidence.level)} />
              </div>
            </button>
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

function HistoryDetail({
  history,
  onBack,
  onDelete,
  confirmOpen,
  onCancelDelete,
  onConfirmDelete,
  isDeleting,
  deleteError,
}: {
  history: AnalysisHistory;
  onBack: () => void;
  onDelete: () => void;
  confirmOpen: boolean;
  onCancelDelete: () => void;
  onConfirmDelete: () => void;
  isDeleting: boolean;
  deleteError: string | null;
}) {
  const categories = (Object.keys(FORM_CATEGORY_LABELS) as FormCategoryKey[]).map((key) => {
    const status = history.measurementStatuses[key] ?? "notMeasured";
    const score = history.categoryScores[key] ?? null;
    return {
      key,
      label: FORM_CATEGORY_LABELS[key],
      stars: score !== null ? score / 20 : null,
      score,
      status,
    };
  });

  return (
    <div style={page} className="page-container">
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
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
          aria-label="一覧に戻る"
        >
          <ChevronLeftIcon size={18} />
        </button>
        <div style={{ minWidth: 0 }}>
          <h1 style={{ fontSize: 20, overflowWrap: "anywhere" }}>{history.title}</h1>
          <div style={{ fontSize: 12, color: colors.mutedText }}>
            解析日時：{history.analyzedAt.toDate().toLocaleString()} ／ 保存日時：{history.savedAt.toDate().toLocaleString()}
          </div>
        </div>
      </div>

      {history.memo && (
        <div style={{ ...card, marginBottom: 16 }}>
          <h2 style={sectionTitle}>メモ</h2>
          <p style={{ ...mutedText, marginTop: 8, whiteSpace: "pre-wrap" }}>{history.memo}</p>
        </div>
      )}

      {history.confidence.warnings.length > 0 && (
        <div style={{ ...card, marginBottom: 16, background: colors.accentSofter }}>
          <h2 style={sectionTitle}>解析信頼度：{confidenceLevelLabel(history.confidence.level)}</h2>
          <ul style={{ margin: "8px 0 0", paddingLeft: 18 }}>
            {history.confidence.warnings.map((w, i) => (
              <li key={i} style={{ fontSize: 12, color: colors.bodyText, lineHeight: 1.6 }}>
                {w}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div style={{ ...card, marginBottom: 16, display: "flex", alignItems: "center", gap: 24, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: colors.bodyText }}>総合スコア</div>
          <div style={{ fontSize: 36, fontWeight: 800, color: colors.titleText }}>
            {history.totalScore !== null ? `${history.totalScore}点` : "評価不能"}
          </div>
        </div>
        <div style={{ fontSize: 11, color: colors.mutedText }}>解析バージョン：{history.analysisVersion}</div>
      </div>

      <div className="grid-2col-eval" style={{ display: "grid", gap: 16, marginBottom: 16 }}>
        <div style={card}>
          <h2 style={sectionTitle}>フォーム評価</h2>
          <CategoryScoreList categories={categories} />
        </div>

        <div style={card}>
          <h2 style={sectionTitle}>AI改善ポイント</h2>
          {history.strengths.length === 0 && history.improvements.length === 0 ? (
            <p style={mutedText}>コメントはありません。</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
              {history.improvements.map((c, i) => (
                <p key={`i-${i}`} style={{ ...mutedText, color: colors.warning }}>
                  {c}
                </p>
              ))}
              {history.strengths.map((c, i) => (
                <p key={`s-${i}`} style={{ ...mutedText, color: colors.success }}>
                  {c}
                </p>
              ))}
            </div>
          )}
        </div>
      </div>

      <div style={{ ...card, marginBottom: 16 }}>
        <h2 style={sectionTitle}>主要指標</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginTop: 8 }}>
          <MetricBlock
            label="最高到達点"
            value={formatMetric(history.metrics.maxReachCm, history.measurementStatuses.maxReachCm ?? "notMeasured", "cm", 1)}
          />
          <MetricBlock
            label="ジャンプ高"
            value={formatMetric(history.metrics.jumpHeightCm, history.measurementStatuses.jumpHeightCm ?? "notMeasured", "cm", 1)}
          />
          <MetricBlock
            label="滞空時間"
            value={formatMetric(history.metrics.flightTimeSec, history.measurementStatuses.flightTimeSec ?? "notMeasured", "秒", 3)}
          />
          <MetricBlock
            label="踏切時間"
            value={formatMetric(history.metrics.takeoffTimeSec, history.measurementStatuses.takeoffTimeSec ?? "notMeasured", "秒", 2)}
          />
          {history.metrics.ballSpeedKmh !== null && (
            <MetricBlock
              label="球速"
              value={formatMetric(history.metrics.ballSpeedKmh, history.measurementStatuses.ballSpeedKmh ?? "notMeasured", "km/h", 1)}
            />
          )}
        </div>
      </div>

      <div style={{ ...card, marginBottom: 16 }}>
        <h2 style={sectionTitle}>撮影条件</h2>
        <p style={{ ...mutedText, marginTop: 8 }}>
          {history.captureSettings.direction ?? "未入力"} / {history.captureSettings.framing ?? "未入力"} / {history.captureSettings.distance ?? "未入力"}
        </p>
      </div>

      <div style={card}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          <h2 style={sectionTitle}>この履歴を削除</h2>
          {!confirmOpen && (
            <button
              style={{ ...ghostButton, color: colors.warning, borderColor: colors.warningSoft }}
              onClick={onDelete}
            >
              削除する
            </button>
          )}
        </div>

        {deleteError && <p style={{ ...mutedText, color: colors.warning, marginTop: 8 }}>{deleteError}</p>}

        {confirmOpen && (
          <div style={{ marginTop: 12 }}>
            <p style={{ fontSize: 13, color: colors.titleText, margin: 0 }}>
              この解析履歴を削除します。この操作は取り消せません。よろしいですか？
            </p>
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button style={ghostButton} onClick={onCancelDelete} disabled={isDeleting}>
                キャンセル
              </button>
              <button
                style={{ ...ghostButton, color: "#fff", background: colors.warning, borderColor: colors.warning }}
                onClick={onConfirmDelete}
                disabled={isDeleting}
              >
                {isDeleting ? "削除中..." : "削除する"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function MetricBlock({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ ...card, padding: 14 }}>
      <div style={{ fontSize: 12, color: colors.bodyText, fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color: colors.titleText, marginTop: 4 }}>{value}</div>
    </div>
  );
}
