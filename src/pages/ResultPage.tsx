import { useEffect, useMemo, useState } from "react";

import TrackingCanvas from "../components/TrackingCanvas";
import StarRow from "../components/ui/StarRow";
import GoogleSignInButton from "../components/GoogleSignInButton";
import SaveHistoryModal from "../components/SaveHistoryModal";
import CategoryScoreList from "../components/CategoryScoreList";
import {
  ChevronLeftIcon,
  CheckCircleIcon,
  PdfIcon,
  SaveIcon,
  ShareIcon,
  StepBackIcon,
  StepForwardIcon,
  PlayIcon,
  PauseIcon,
  WarnIcon,
} from "../components/layout/Icons";

import type { AnalysisResult } from "../analysis";
import type { ReachEstimateResult } from "../ai/reachEstimateAnalyzer";
import type { TrackedFrame } from "../ai/poseAnalyzer";
import type { CaptureSettings } from "../ai/captureSettings";
import { captureSettingLabelParts, captureSettingsLabel } from "../ai/captureSettings";
import { buildConfidenceAwareSummary } from "../utils/analysisConfidence";
import type { AuthUser } from "../firebase/authService";
import { fetchSavedAnalysisId } from "../firebase/historyService";
import type { AnalysisHistoryDraft } from "../types/analysisHistory";
import { ANALYSIS_VERSION } from "../types/analysisHistory";
import { card, colors, ghostButton, mutedText, page, primaryButton, radius, sectionTitle } from "../styles/theme";

type SaveStatus = "idle" | "checking" | "saving" | "saved" | "error";

const PENDING_SAVE_STORAGE_KEY = "jump-analyzer:pending-save";

type Props = {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  videoUrl: string | null;
  videoName: string;
  currentTime: number;
  setCurrentTime: (time: number) => void;
  currentTrackedFrame: TrackedFrame | null;
  fps: number;

  analysisResult: AnalysisResult | null;
  captureSettings: CaptureSettings;
  trackedFrameCount: number;
  reachEstimate: ReachEstimateResult;
  maxReach: number | null;
  jumpHeight: number | null;
  airTime: number | null;
  ballSpeed: number | null;

  analysisId: string | null;
  analyzedAt: Date | null;

  authUser: AuthUser | null;
  isAuthReady: boolean;
  isFirebaseReady: boolean;
  isSigningIn: boolean;
  signInError: string | null;
  onSignIn: () => Promise<void>;
  onSaveHistory: (uid: string, draft: AnalysisHistoryDraft) => Promise<void>;

  onBack: () => void;
  onShare: () => void;
};

export default function ResultPage({
  videoRef,
  videoUrl,
  videoName,
  currentTime,
  setCurrentTime,
  currentTrackedFrame,
  fps,
  analysisResult,
  captureSettings,
  trackedFrameCount,
  reachEstimate,
  maxReach,
  jumpHeight,
  airTime,
  ballSpeed,
  analysisId,
  analyzedAt,
  authUser,
  isAuthReady,
  isFirebaseReady,
  isSigningIn,
  signInError,
  onSignIn,
  onSaveHistory,
  onBack,
  onShare,
}: Props) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [saveErrorMessage, setSaveErrorMessage] = useState<string | null>(null);
  const [pendingDraftFields, setPendingDraftFields] = useState<{ title: string; memo: string } | null>(null);

  const confidenceSummary = useMemo(
    () => buildConfidenceAwareSummary(analysisResult?.features ?? [], captureSettings, trackedFrameCount),
    [analysisResult, captureSettings, trackedFrameCount]
  );

  const takeoffContactTime = analysisResult?.features.find(
    (f) => f.key === "takeoff.contactTimeSec"
  )?.value;
  const approachSpeed = analysisResult?.features.find((f) => f.key === "approach.speed")?.value;

  const displayMaxReach = reachEstimate.estimatedMaxReachCm ?? maxReach;
  const displayJumpHeight = reachEstimate.estimatedJumpHeightCm ?? jumpHeight;

  // 解析完了ごとにanalysisIdが変わるため、保存状態もそれに合わせてリセットする。
  // レンダー中にpropに応じてstateを補正する公式パターンを使い、
  // エフェクト内での無条件setStateを避ける（Firestoreへの既存保存確認という
  // 非同期処理そのものは引き続きエフェクトの責務として残す）。
  const [checkedAnalysisId, setCheckedAnalysisId] = useState<string | null>(null);
  const [resetForAnalysisId, setResetForAnalysisId] = useState<string | null>(null);

  if (analysisId && analysisId !== resetForAnalysisId) {
    setResetForAnalysisId(analysisId);
    setSaveStatus("idle");
    setSaveErrorMessage(null);
  }

  useEffect(() => {
    if (!analysisId || analysisId === checkedAnalysisId || !authUser) return;

    let cancelled = false;

    fetchSavedAnalysisId(authUser.uid, analysisId)
      .then((alreadySaved) => {
        if (cancelled) return;
        setSaveStatus(alreadySaved ? "saved" : "idle");
        setCheckedAnalysisId(analysisId);
      })
      .catch(() => {
        if (cancelled) return;
        setSaveStatus("idle");
        setCheckedAnalysisId(analysisId);
      });

    return () => {
      cancelled = true;
    };
  }, [analysisId, authUser, checkedAnalysisId]);

  // Googleログインのため一時的にログイン導線へ遷移した場合に備え、
  // 保存しようとしていたタイトル・メモをsessionStorageへ退避しておき、
  // ログイン成功後に確認モーダルを再度開いて保存操作を継続できるようにする。
  // sessionStorageの読み取りは同期的なため、レンダー中の状態補正パターンで扱う。
  const pendingSaveKey = authUser && analysisId ? `${authUser.uid}:${analysisId}` : null;
  const [checkedPendingSaveKey, setCheckedPendingSaveKey] = useState<string | null>(null);

  if (pendingSaveKey && pendingSaveKey !== checkedPendingSaveKey) {
    setCheckedPendingSaveKey(pendingSaveKey);

    const raw = sessionStorage.getItem(PENDING_SAVE_STORAGE_KEY);
    if (raw) {
      try {
        const pending = JSON.parse(raw) as { analysisId: string; title: string; memo: string };
        if (pending.analysisId === analysisId) {
          setPendingDraftFields({ title: pending.title, memo: pending.memo });
          setIsModalOpen(true);
        }
      } catch {
        // 破損データは無視する
      } finally {
        sessionStorage.removeItem(PENDING_SAVE_STORAGE_KEY);
      }
    }
  }

  const defaultTitle = analyzedAt
    ? `${analyzedAt.toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric" })}のスパイク解析`
    : "スパイク解析";

  const metrics: Array<{ label: string; value: string; sub?: string }> = [];
  if (displayMaxReach !== null) {
    metrics.push({ label: "最高到達点", value: `${displayMaxReach.toFixed(0)} cm` });
  }
  if (displayJumpHeight !== null) {
    metrics.push({ label: "ジャンプ高", value: `${displayJumpHeight.toFixed(1)} cm` });
  }
  if (airTime !== null) {
    metrics.push({ label: "滞空時間", value: `${airTime.toFixed(2)} 秒` });
  }
  if (typeof takeoffContactTime === "number") {
    metrics.push({ label: "踏切時間", value: `${takeoffContactTime.toFixed(2)} 秒` });
  }
  if (typeof approachSpeed === "number") {
    metrics.push({ label: "助走速度", value: `${approachSpeed.toFixed(1)}`, sub: "体幹長/秒" });
  }

  const handlePlayPause = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play();
      setIsPlaying(true);
    } else {
      video.pause();
      setIsPlaying(false);
    }
  };

  const handleSpeed = (rate: number) => {
    setPlaybackRate(rate);
    if (videoRef.current) videoRef.current.playbackRate = rate;
  };

  const stepFrame = (dir: number) => {
    const video = videoRef.current;
    if (!video) return;
    const next = Math.max(0, Math.min(video.duration || 0, video.currentTime + dir / fps));
    video.currentTime = next;
    setCurrentTime(next);
  };

  const handleOpenSaveModal = () => {
    if (!authUser) {
      // ログインのため一時的に画面が切り替わっても保存内容を復元できるよう退避する。
      if (analysisId) {
        sessionStorage.setItem(
          PENDING_SAVE_STORAGE_KEY,
          JSON.stringify({ analysisId, title: "", memo: "" })
        );
      }
      void onSignIn();
      return;
    }
    setIsModalOpen(true);
  };

  const reachMeasurementStatus = () => {
    if (reachEstimate.confidence === null) return "notMeasured" as const;
    if (reachEstimate.confidence === "低") return "reference" as const;
    return "measured" as const;
  };

  const handleConfirmSave = async (title: string, memo: string) => {
    if (!authUser || !analysisId || !analyzedAt) return;

    setSaveStatus("saving");
    setSaveErrorMessage(null);

    const categoryScores = Object.fromEntries(
      confidenceSummary.categories.map((c) => [c.key, c.score])
    ) as AnalysisHistoryDraft["categoryScores"];

    const captureLabels = captureSettingLabelParts(captureSettings);

    const measurementStatuses: AnalysisHistoryDraft["measurementStatuses"] = {
      maxReachCm: displayMaxReach !== null ? reachMeasurementStatus() : "notMeasured",
      jumpHeightCm: displayJumpHeight !== null ? reachMeasurementStatus() : "notMeasured",
      flightTimeSec: airTime !== null ? "measured" : "notMeasured",
      takeoffTimeSec:
        confidenceSummary.categories.find((c) => c.key === "takeoff")?.status ?? "notMeasured",
      ballSpeedKmh: ballSpeed !== null ? "measured" : "notMeasured",
    };
    for (const c of confidenceSummary.categories) {
      measurementStatuses[c.key] = c.status;
    }

    const draft: AnalysisHistoryDraft = {
      analysisId,
      userId: authUser.uid,
      title,
      memo,
      skillId: "spikeJump",
      analyzedAt,
      totalScore: confidenceSummary.overallScore,
      categoryScores,
      metrics: {
        maxReachCm: displayMaxReach,
        jumpHeightCm: displayJumpHeight,
        flightTimeSec: airTime,
        takeoffTimeSec: typeof takeoffContactTime === "number" ? takeoffContactTime : null,
        ballSpeedKmh: ballSpeed,
      },
      strengths: confidenceSummary.strengths.map((s) => s.evaluation.comment),
      improvements: confidenceSummary.improvements.map((i) => i.evaluation.comment),
      captureSettings: captureLabels,
      confidence: {
        overall: confidenceSummary.confidenceOverall,
        level: confidenceSummary.confidenceLevel,
        warnings: confidenceSummary.confidenceWarnings,
      },
      measurementStatuses,
      analysisVersion: ANALYSIS_VERSION,
    };

    try {
      await onSaveHistory(authUser.uid, draft);
      setSaveStatus("saved");
      setIsModalOpen(false);
    } catch (error) {
      console.error(error);
      setSaveStatus("error");
      setSaveErrorMessage("保存に失敗しました。通信状況を確認してもう一度お試しください。");
    }
  };

  const saveButtonLabel = (() => {
    if (!isAuthReady || saveStatus === "checking") return "確認中...";
    if (!authUser) return "Googleでログインして保存";
    if (saveStatus === "saving") return "保存中...";
    if (saveStatus === "saved") return "保存済み";
    if (saveStatus === "error") return "もう一度保存";
    return "履歴に保存";
  })();

  const saveButtonDisabled =
    !isAuthReady || saveStatus === "checking" || saveStatus === "saving" || saveStatus === "saved" || isSigningIn;

  if (!videoUrl) {
    return (
      <div style={page} className="page-container">
        <p style={mutedText}>解析結果がありません。先に「解析」から動画を解析してください。</p>
      </div>
    );
  }

  return (
    <div style={page} className="page-container">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
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
          <div style={{ minWidth: 0 }}>
            <h1 style={{ fontSize: 20 }}>解析結果</h1>
            <div style={{ fontSize: 12, color: colors.mutedText, overflowWrap: "anywhere" }}>
              {videoName}
              {analyzedAt && ` ・ ${analyzedAt.toLocaleString()}`}
            </div>
          </div>
        </div>

        <div className="no-print" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {!authUser && isFirebaseReady ? (
            <GoogleSignInButton
              onClick={handleOpenSaveModal}
              isLoading={isSigningIn}
              variant="ghost"
              label={saveButtonLabel}
              style={{ fontSize: 13 }}
            />
          ) : (
            <button
              style={{
                ...ghostButton,
                opacity: saveButtonDisabled ? 0.6 : 1,
                cursor: saveButtonDisabled ? "not-allowed" : "pointer",
              }}
              onClick={handleOpenSaveModal}
              disabled={saveButtonDisabled}
            >
              <SaveIcon size={14} />
              {saveButtonLabel}
            </button>
          )}
          <button style={ghostButton} onClick={() => window.print()}>
            <PdfIcon size={14} />
            PDF出力
          </button>
          <button style={ghostButton} onClick={onShare}>
            <ShareIcon size={14} />
            共有
          </button>
        </div>
      </div>

      {saveStatus === "error" && saveErrorMessage && (
        <p style={{ ...mutedText, color: colors.warning, marginTop: 8 }}>{saveErrorMessage}</p>
      )}
      {!authUser && signInError && (
        <p style={{ ...mutedText, color: colors.warning, marginTop: 8 }}>{signInError}</p>
      )}
      {!isFirebaseReady && (
        <p style={{ ...mutedText, marginTop: 8 }}>
          ログイン・履歴保存機能は現在準備中です。動画解析自体はそのままご利用いただけます。
        </p>
      )}

      {/* 解析信頼度 */}
      {confidenceSummary.confidenceWarnings.length > 0 && (
        <div style={{ ...card, marginTop: 20, borderColor: colors.warningSoft, background: colors.accentSofter }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <WarnIcon size={16} style={{ color: colors.warning }} />
            <span style={{ fontSize: 13, fontWeight: 700, color: colors.titleText }}>
              解析信頼度：{
                { high: "高", medium: "中", low: "低", unknown: "判定不能" }[confidenceSummary.confidenceLevel]
              }
            </span>
          </div>
          <ul style={{ margin: "8px 0 0", paddingLeft: 18 }}>
            {confidenceSummary.confidenceWarnings.map((w, i) => (
              <li key={i} style={{ fontSize: 12, color: colors.bodyText, lineHeight: 1.6 }}>
                {w}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 総合評価 */}
      <div style={{ ...card, marginTop: 20, display: "flex", alignItems: "center", gap: 28, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: colors.bodyText }}>総合スコア</div>
          {confidenceSummary.overallStars !== null && <StarRow stars={confidenceSummary.overallStars} size={20} />}
        </div>

        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
          <span style={{ fontSize: 44, fontWeight: 800, color: colors.titleText, lineHeight: 1 }}>
            {confidenceSummary.overallScore ?? "-"}
          </span>
          <span style={{ fontSize: 16, color: colors.bodyText }}>点</span>
        </div>

        {confidenceSummary.rank && (
          <span
            style={{
              padding: "6px 14px",
              borderRadius: radius.pill,
              background: colors.accent,
              color: "#fff",
              fontWeight: 800,
              fontSize: 13,
            }}
          >
            {confidenceSummary.rank}ランク
          </span>
        )}

        {confidenceSummary.overallScore === null && (
          <p style={mutedText}>選手をトラッキングしてジャンプを検出すると総合評価が表示されます。</p>
        )}
      </div>

      {/* 主要指標 */}
      {metrics.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <h2 style={{ ...sectionTitle, marginBottom: 10 }}>主要指標</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
            {metrics.map((m) => (
              <div key={m.label} style={{ ...card, padding: 14 }}>
                <div style={{ fontSize: 12, color: colors.bodyText, fontWeight: 600 }}>{m.label}</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: colors.titleText, marginTop: 4 }}>
                  {m.value}
                </div>
                {m.sub && <div style={{ fontSize: 11, color: colors.mutedText, marginTop: 2 }}>{m.sub}</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* フォーム評価 + AI改善ポイント */}
      <div
        className="grid-2col-eval"
        style={{
          marginTop: 20,
          display: "grid",
          gap: 16,
        }}
      >
        <div style={card}>
          <h2 style={sectionTitle}>フォーム評価</h2>
          <CategoryScoreList categories={confidenceSummary.categories} />
        </div>

        <div style={card}>
          <h2 style={sectionTitle}>AI改善ポイント</h2>
          {confidenceSummary.strengths.length === 0 && confidenceSummary.improvements.length === 0 ? (
            <p style={mutedText}>フォーム解析を実行するとAIコメントが表示されます。</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 8 }}>
              {confidenceSummary.improvements.map((item) => (
                <Tip key={item.feature.key} kind="warning" text={item.evaluation.comment} />
              ))}
              {confidenceSummary.strengths.map((item) => (
                <Tip key={item.feature.key} kind="success" text={item.evaluation.comment} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 動画プレーヤー */}
      <div style={{ ...card, marginTop: 20 }}>
        <h2 style={sectionTitle}>動画</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16, marginTop: 8 }}>
          <div>
            <div style={{ fontSize: 12, color: colors.bodyText, marginBottom: 6, fontWeight: 600 }}>元動画</div>
            <video
              ref={videoRef}
              src={videoUrl}
              style={{ width: "100%", borderRadius: radius.md, background: "#000", display: "block" }}
              onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
              onLoadedMetadata={(e) => setCurrentTime(e.currentTarget.currentTime)}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
            />
          </div>
          <div>
            <div style={{ fontSize: 12, color: colors.bodyText, marginBottom: 6, fontWeight: 600 }}>骨格推定</div>
            <TrackingCanvas videoRef={videoRef} frame={currentTrackedFrame} isCropMode={true} showSkeleton={true} />
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
          <button onClick={() => stepFrame(-1)} style={ghostButton} aria-label="1フレーム戻る">
            <StepBackIcon size={14} />
          </button>
          <button onClick={handlePlayPause} style={{ ...primaryButton, padding: "8px 16px" }}>
            {isPlaying ? <PauseIcon size={14} /> : <PlayIcon size={14} />}
          </button>
          <button onClick={() => stepFrame(1)} style={ghostButton} aria-label="1フレーム進む">
            <StepForwardIcon size={14} />
          </button>

          <div style={{ display: "flex", gap: 4, marginLeft: 8 }}>
            {[0.5, 1, 1.5, 2].map((rate) => (
              <button
                key={rate}
                onClick={() => handleSpeed(rate)}
                style={{
                  ...ghostButton,
                  padding: "6px 10px",
                  background: playbackRate === rate ? colors.accentSoft : "#fff",
                  color: playbackRate === rate ? colors.accent : colors.bodyText,
                  borderColor: playbackRate === rate ? colors.accent : colors.border,
                }}
              >
                {rate}x
              </button>
            ))}
          </div>

          <span style={{ marginLeft: "auto", fontSize: 12, color: colors.mutedText }}>
            フレーム：{currentTrackedFrame?.frameIndex ?? Math.round(currentTime * fps)} / 現在時刻：{" "}
            {currentTime.toFixed(2)} 秒
          </span>
        </div>
      </div>

      {analyzedAt && (
        <SaveHistoryModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          onConfirm={handleConfirmSave}
          isSaving={saveStatus === "saving"}
          defaultTitle={defaultTitle}
          initialTitle={pendingDraftFields?.title ?? ""}
          initialMemo={pendingDraftFields?.memo ?? ""}
          analyzedAtLabel={analyzedAt.toLocaleString()}
          totalScore={confidenceSummary.overallScore}
          maxReachCm={displayMaxReach}
          jumpHeightCm={displayJumpHeight}
          flightTimeSec={airTime}
          takeoffTimeSec={typeof takeoffContactTime === "number" ? takeoffContactTime : null}
          captureSettingsLabel={captureSettingsLabel(captureSettings)}
          confidenceLevel={confidenceSummary.confidenceLevel}
        />
      )}
    </div>
  );
}

function Tip({ kind, text }: { kind: "success" | "warning"; text: string }) {
  const color = kind === "success" ? colors.success : colors.warning;
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
      <span style={{ color, flexShrink: 0, marginTop: 1 }}>
        {kind === "success" ? <CheckCircleIcon size={15} /> : <WarnIcon size={15} />}
      </span>
      <span style={{ fontSize: 13, color: colors.titleText, lineHeight: 1.6 }}>{text}</span>
    </div>
  );
}
