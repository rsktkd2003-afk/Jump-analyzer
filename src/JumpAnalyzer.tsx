import { useEffect, useMemo, useState } from "react";

import Sidebar from "./components/layout/Sidebar";
import PwaStatusToast from "./components/PwaStatusToast";
import HomePage from "./pages/HomePage";
import AnalyzePage from "./pages/AnalyzePage";
import ResultPage from "./pages/ResultPage";
import ComparePage from "./pages/ComparePage";
import HistoryPage from "./pages/HistoryPage";
import SettingsPage from "./pages/SettingsPage";
import { MenuIcon } from "./components/layout/Icons";

import type { PageId } from "./types/navigation";

import { estimateReachFromInputs } from "./ai/reachEstimateAnalyzer";

import { useVideoSource } from "./hooks/useVideoSource";
import { useManualMeasurement } from "./hooks/useManualMeasurement";
import { useSelectedPerson } from "./hooks/useSelectedPerson";
import { useMotionTracking } from "./hooks/useMotionTracking";
import { usePoseAnalysis } from "./hooks/usePoseAnalysis";
import { useAuth } from "./hooks/useAuth";
import { useAnalysisHistories } from "./hooks/useAnalysisHistories";

import { analyze } from "./analysis";
import type { SkillId } from "./analysis/types";

import {
  DEFAULT_CAPTURE_SETTINGS,
  type CaptureSettings,
} from "./ai/captureSettings";

import {
  deleteAllAnalysisHistories,
  deleteAnalysisHistory,
  saveAnalysisHistory,
} from "./firebase/historyService";
import type { AnalysisHistoryDraft } from "./types/analysisHistory";

import { colors } from "./styles/theme";

const MOBILE_PAGE_TITLES: Record<PageId, string> = {
  home: "ホーム",
  analyze: "解析",
  result: "解析結果",
  compare: "比較する",
  history: "履歴",
  settings: "設定",
};

function JumpAnalyzer() {
  const [page, setPage] = useState<PageId>("home");
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [prevPageForSidebar, setPrevPageForSidebar] = useState<PageId>(page);

  // ページ遷移時（サイドバー以外からの遷移も含む）はモバイルメニューを閉じる。
  // レンダー中にpropに応じてstateを補正する公式パターンを使い、
  // エフェクト内での無条件setStateを避ける。
  if (page !== prevPageForSidebar) {
    setPrevPageForSidebar(page);
    setIsSidebarOpen(false);
  }

  useEffect(() => {
    if (!isSidebarOpen) return;

    document.body.style.overflow = "hidden";

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsSidebarOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isSidebarOpen]);

  const auth = useAuth();
  const uid = auth.user?.uid ?? null;
  const historiesState = useAnalysisHistories(uid);

  const [fps, setFps] = useState(60);
  const [knownCm, setKnownCm] = useState(45);
  const [ringHeight, setRingHeight] = useState(305);
  const [heightCm, setHeightCm] = useState(170);
  const [standingReach, setStandingReach] = useState(214);
  const [knownMaxReach, setKnownMaxReach] = useState<number | null>(null);

  const [captureSettings, setCaptureSettings] = useState<CaptureSettings>(
    DEFAULT_CAPTURE_SETTINGS
  );
  const [skillId, setSkillId] = useState<SkillId>("spikeJump");

  const [isStarting, setIsStarting] = useState(false);
  const [analysisId, setAnalysisId] = useState<string | null>(null);
  const [analyzedAt, setAnalyzedAt] = useState<Date | null>(null);

  // ---- 動画・人物選択・トラッキング・フォーム解析（元は各コンポーネント内部で
  // 個別に呼んでいたフックを、解析→結果の画面をまたいでデータを共有できるよう
  // ルートへ引き上げている。ロジック自体は変更していない） ----
  const { videoRef, videoUrl, videoName, currentTime, setCurrentTime, loadFile } =
    useVideoSource();

  const manualMeasurement = useManualMeasurement({ knownCm, ringHeight, standingReach });

  const { selectedPoint, selectPerson, resetSelectedPerson } = useSelectedPerson();

  const {
    trackedFrames,
    trackerStats,
    currentTrackedFrame,
    trackingMessage,
    trackingProgress,
    isTracking,
    isSmoothingEnabled,
    setIsSmoothingEnabled,
    runTracking,
    resetTracking,
  } = useMotionTracking(videoRef, fps, currentTime, selectedPoint);

  const {
    formResult,
    peakFrame,
    peakTime,
    isAnalyzing: isAnalyzingForm,
    message: formMessage,
    analyzeForm,
    resetPoseAnalysis,
  } = usePoseAnalysis(videoRef, fps);

  const handleLoadVideoFile = (file: File) => {
    loadFile(file);
    manualMeasurement.reset();
    resetSelectedPerson();
    resetTracking();
    resetPoseAnalysis();
    setAnalysisId(null);
    setAnalyzedAt(null);
  };

  const reachEstimate = useMemo(
    () =>
      estimateReachFromInputs({
        standingReachCm: standingReach,
        heightCm,
        calibrationMaxReachCm: manualMeasurement.maxReach,
        flightTimeJumpHeightCm: manualMeasurement.estimatedJumpHeight,
        knownMaxReachCm: knownMaxReach,
        calibrationErrorCm: manualMeasurement.reachError,
      }),
    [
      standingReach,
      heightCm,
      manualMeasurement.maxReach,
      manualMeasurement.estimatedJumpHeight,
      knownMaxReach,
      manualMeasurement.reachError,
    ]
  );

  // 自動フォーム解析結果（既存の analysis/evaluation ロジックを結果画面向けに集約表示するだけ）
  const analysisResult = useMemo(() => {
    if (trackedFrames.length < 3) return null;
    return analyze(trackedFrames, skillId, trackerStats);
  }, [trackedFrames, skillId, trackerStats]);

  const handleSaveHistory = async (userId: string, draft: AnalysisHistoryDraft) => {
    await saveAnalysisHistory(userId, draft);
  };

  const handleDeleteHistory = async (historyId: string) => {
    if (!uid) return;
    await deleteAnalysisHistory(uid, historyId);
  };

  const handleDeleteAllHistories = async (historyIds: string[]) => {
    if (!uid) return;
    await deleteAllAnalysisHistories(uid, historyIds);
  };

  const handleShare = async () => {
    const text = [
      "🏐 Jump Analyzer 測定結果",
      `最高到達点：${manualMeasurement.maxReach ? `${manualMeasurement.maxReach.toFixed(1)}cm` : "-"}`,
      `ジャンプ高：${manualMeasurement.jumpHeight ? `${manualMeasurement.jumpHeight.toFixed(1)}cm` : "-"}`,
      `推定最高到達点：${
        reachEstimate.estimatedMaxReachCm !== null
          ? `${reachEstimate.estimatedMaxReachCm.toFixed(1)}cm`
          : "-"
      }`,
      `推定ジャンプ高：${
        reachEstimate.estimatedJumpHeightCm !== null
          ? `${reachEstimate.estimatedJumpHeightCm.toFixed(1)}cm`
          : "-"
      }`,
      `滞空時間：${manualMeasurement.airTime ? `${manualMeasurement.airTime.toFixed(3)}秒` : "-"}`,
      `球速：${manualMeasurement.ballSpeed ? `${manualMeasurement.ballSpeed.toFixed(1)}km/h` : "-"}`,
    ].join("\n");

    if (navigator.share) {
      await navigator.share({ text });
    } else {
      await navigator.clipboard.writeText(text);
      alert("測定結果をコピーしました");
    }
  };

  const handleStartAnalysis = async () => {
    if (!videoUrl) return;

    setIsStarting(true);
    try {
      await runTracking();
      await analyzeForm();
    } finally {
      setIsStarting(false);
    }

    setAnalysisId(crypto.randomUUID());
    setAnalyzedAt(new Date());
    setPage("result");
  };

  return (
    <div className="app-shell">
      <Sidebar
        page={page}
        onNavigate={setPage}
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        authUser={auth.user}
        isAuthReady={auth.isAuthReady}
        isSigningIn={auth.isSigningIn}
        isFirebaseReady={auth.isFirebaseReady}
        signInError={auth.signInError}
        onSignIn={auth.signIn}
        onSignOut={auth.signOut}
      />

      <div
        className={`sidebar-overlay${isSidebarOpen ? " sidebar-overlay--visible" : ""}`}
        onClick={() => setIsSidebarOpen(false)}
        aria-hidden="true"
      />

      <main style={{ flex: 1, minWidth: 0, background: colors.bg }}>
        <div className="mobile-topbar">
          <button
            type="button"
            className="mobile-topbar-btn"
            onClick={() => setIsSidebarOpen(true)}
            aria-label="メニューを開く"
            aria-expanded={isSidebarOpen}
          >
            <MenuIcon size={20} />
          </button>
          <div className="mobile-topbar-title">{MOBILE_PAGE_TITLES[page]}</div>
        </div>

        {page === "home" && (
          <HomePage
            userName={auth.user?.displayName ?? "ゲスト"}
            isLoggedIn={Boolean(auth.user)}
            historiesState={historiesState}
            onStartAnalyze={() => setPage("analyze")}
            onOpenHistory={() => setPage("history")}
          />
        )}

        {page === "analyze" && (
          <AnalyzePage
            fps={fps}
            onFpsChange={setFps}
            heightCm={heightCm}
            onHeightChange={setHeightCm}
            standingReach={standingReach}
            onStandingReachChange={setStandingReach}
            knownMaxReach={knownMaxReach}
            onKnownMaxReachChange={setKnownMaxReach}
            knownCm={knownCm}
            onKnownCmChange={setKnownCm}
            ringHeight={ringHeight}
            onRingHeightChange={setRingHeight}
            captureSettings={captureSettings}
            onCaptureSettingsChange={setCaptureSettings}
            skillId={skillId}
            onSkillIdChange={setSkillId}
            markers={manualMeasurement.markers}
            markerTarget={manualMeasurement.markerTarget}
            onMarkerTargetChange={manualMeasurement.setMarkerTarget}
            onMarkerPlace={manualMeasurement.placeMarker}
            onClearMarker={manualMeasurement.clearMarker}
            onTimeSave={manualMeasurement.saveTime}
            videoRef={videoRef}
            videoUrl={videoUrl}
            videoName={videoName}
            currentTime={currentTime}
            setCurrentTime={setCurrentTime}
            loadFile={handleLoadVideoFile}
            selectedPoint={selectedPoint}
            onVideoClickSelectPerson={selectPerson}
            trackedFrames={trackedFrames}
            currentTrackedFrame={currentTrackedFrame}
            trackingMessage={trackingMessage}
            trackingProgress={trackingProgress}
            isTracking={isTracking}
            isSmoothingEnabled={isSmoothingEnabled}
            setIsSmoothingEnabled={setIsSmoothingEnabled}
            runTracking={runTracking}
            formResult={formResult}
            peakFrame={peakFrame}
            peakTime={peakTime}
            isAnalyzingForm={isAnalyzingForm}
            formMessage={formMessage}
            analyzeForm={analyzeForm}
            maxReach={manualMeasurement.maxReach}
            jumpHeight={manualMeasurement.jumpHeight}
            airTime={manualMeasurement.airTime}
            airFrameCount={manualMeasurement.airFrameCount}
            reachEstimate={reachEstimate}
            ballSpeed={manualMeasurement.ballSpeed}
            speedError={manualMeasurement.speedError}
            reachError={manualMeasurement.reachError}
            isStarting={isStarting}
            onStartAnalysis={handleStartAnalysis}
            onBack={() => setPage("home")}
          />
        )}

        {page === "result" && (
          <ResultPage
            videoRef={videoRef}
            videoUrl={videoUrl}
            videoName={videoName}
            currentTime={currentTime}
            setCurrentTime={setCurrentTime}
            currentTrackedFrame={currentTrackedFrame}
            fps={fps}
            analysisResult={analysisResult}
            captureSettings={captureSettings}
            trackedFrameCount={trackedFrames.length}
            reachEstimate={reachEstimate}
            maxReach={manualMeasurement.maxReach}
            jumpHeight={manualMeasurement.jumpHeight}
            airTime={manualMeasurement.airTime}
            ballSpeed={manualMeasurement.ballSpeed}
            analysisId={analysisId}
            analyzedAt={analyzedAt}
            authUser={auth.user}
            isAuthReady={auth.isAuthReady}
            isFirebaseReady={auth.isFirebaseReady}
            isSigningIn={auth.isSigningIn}
            signInError={auth.signInError}
            onSignIn={auth.signIn}
            onSaveHistory={handleSaveHistory}
            onBack={() => setPage("analyze")}
            onShare={handleShare}
          />
        )}

        {page === "compare" && (
          <ComparePage historiesState={historiesState} onBack={() => setPage("history")} />
        )}

        {page === "history" && (
          <HistoryPage
            authUser={auth.user}
            isAuthReady={auth.isAuthReady}
            isFirebaseReady={auth.isFirebaseReady}
            isSigningIn={auth.isSigningIn}
            signInError={auth.signInError}
            onSignIn={auth.signIn}
            historiesState={historiesState}
            onOpenCompare={() => setPage("compare")}
            onDeleteHistory={handleDeleteHistory}
            onDeleteAllHistories={handleDeleteAllHistories}
          />
        )}

        {page === "settings" && (
          <SettingsPage
            authUser={auth.user}
            isAuthReady={auth.isAuthReady}
            isFirebaseReady={auth.isFirebaseReady}
            isSigningIn={auth.isSigningIn}
            signInError={auth.signInError}
            onSignIn={auth.signIn}
            onSignOut={auth.signOut}
            historyCount={historiesState.status === "loaded" ? historiesState.items.length : 0}
            onClearHistory={() =>
              handleDeleteAllHistories(
                historiesState.status === "loaded" ? historiesState.items.map((i) => i.id) : []
              )
            }
          />
        )}
      </main>

      <PwaStatusToast />
    </div>
  );
}

export default JumpAnalyzer;
