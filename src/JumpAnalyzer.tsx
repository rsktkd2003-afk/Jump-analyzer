import { useMemo, useState } from "react";

import Sidebar from "./components/layout/Sidebar";
import PwaStatusToast from "./components/PwaStatusToast";
import HomePage from "./pages/HomePage";
import AnalyzePage from "./pages/AnalyzePage";
import ResultPage from "./pages/ResultPage";
import ComparePage from "./pages/ComparePage";
import HistoryPage from "./pages/HistoryPage";
import ComingSoonPage from "./pages/ComingSoonPage";
import SettingsPage from "./pages/SettingsPage";
import { PlayersIcon, TeamIcon } from "./components/layout/Icons";

import type { MarkerTarget, Markers } from "./types/measurement";
import type { MeasurementHistoryItem } from "./types/history";
import type { PageId } from "./types/navigation";

import {
  calculateMaxReach,
  calculateReachError,
} from "./utils/jumpCalculator";
import {
  calculateBallSpeed,
  calculateSpeedError,
} from "./utils/speedCalculator";

import {
  loadMeasurementHistory,
  saveMeasurementHistory,
} from "./storage/measurementStorage";
import { estimateReachFromInputs } from "./ai/reachEstimateAnalyzer";

import { useVideoSource } from "./hooks/useVideoSource";
import { useSelectedPerson } from "./hooks/useSelectedPerson";
import { useMotionTracking } from "./hooks/useMotionTracking";
import { usePoseAnalysis } from "./hooks/usePoseAnalysis";

import { analyze } from "./analysis";
import type { SkillId } from "./analysis/types";
import { buildFormSummary, toFormCategoryScores } from "./utils/formSummary";

import {
  DEFAULT_CAPTURE_SETTINGS,
  type CaptureSettings,
} from "./ai/captureSettings";

import { colors } from "./styles/theme";

const initialMarkers: Markers = {
  calibA: null,
  calibB: null,
  ring: null,
  finger: null,
  ballA: null,
  ballB: null,
};

const USER_NAME = "ゲスト";
const USER_ROLE = "コーチ";

function JumpAnalyzer() {
  const [page, setPage] = useState<PageId>("home");

  const [fps, setFps] = useState(60);
  const [knownCm, setKnownCm] = useState(45);
  const [ringHeight, setRingHeight] = useState(305);
  const [heightCm, setHeightCm] = useState(170);
  const [standingReach, setStandingReach] = useState(214);
  const [knownMaxReach, setKnownMaxReach] = useState<number | null>(null);
  const [target, setTarget] = useState<MarkerTarget>("calibA");

  const [captureSettings, setCaptureSettings] = useState<CaptureSettings>(
    DEFAULT_CAPTURE_SETTINGS
  );
  const [skillId, setSkillId] = useState<SkillId>("spikeJump");

  const [markers, setMarkers] = useState<Markers>(initialMarkers);

  const [timeA, setTimeA] = useState<number | null>(null);
  const [timeB, setTimeB] = useState<number | null>(null);
  const [frameA, setFrameA] = useState<number | null>(null);
  const [frameB, setFrameB] = useState<number | null>(null);

  const [history, setHistory] = useState<MeasurementHistoryItem[]>(loadMeasurementHistory);

  const [isStarting, setIsStarting] = useState(false);
  const [resultTimestamp, setResultTimestamp] = useState<string | null>(null);

  // ---- 動画・人物選択・トラッキング・フォーム解析（元は各コンポーネント内部で
  // 個別に呼んでいたフックを、解析→結果の画面をまたいでデータを共有できるよう
  // ルートへ引き上げている。ロジック自体は変更していない） ----
  const { videoRef, videoUrl, videoName, currentTime, setCurrentTime, loadFile } =
    useVideoSource();

  const { selectedPoint, selectPerson, resetSelectedPerson } = useSelectedPerson();

  const {
    trackedFrames,
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
    resetSelectedPerson();
    resetTracking();
    resetPoseAnalysis();
    setResultTimestamp(null);
  };

  const maxReach = useMemo(
    () => calculateMaxReach({ markers, knownCm, ringHeight }),
    [markers, knownCm, ringHeight]
  );

  const jumpHeight = useMemo(() => {
    if (!maxReach) return null;
    return maxReach - standingReach;
  }, [maxReach, standingReach]);

  const airTime = useMemo(() => {
    if (timeA === null || timeB === null) return null;
    const diff = Math.abs(timeB - timeA);
    return diff > 0 ? diff : null;
  }, [timeA, timeB]);

  const airFrameCount = useMemo(() => {
    if (frameA === null || frameB === null) return null;
    const diff = Math.abs(frameB - frameA);
    return diff > 0 ? diff : null;
  }, [frameA, frameB]);

  const estimatedJumpHeight = useMemo(() => {
    if (!airTime) return null;
    return ((9.81 * airTime * airTime) / 8) * 100;
  }, [airTime]);

  const reachError = useMemo(
    () => calculateReachError(markers, knownCm),
    [markers, knownCm]
  );

  const ballSpeed = useMemo(
    () => calculateBallSpeed({ markers, knownCm, timeA, timeB }),
    [markers, knownCm, timeA, timeB]
  );

  const speedError = useMemo(() => calculateSpeedError(ballSpeed), [ballSpeed]);

  const reachEstimate = useMemo(
    () =>
      estimateReachFromInputs({
        standingReachCm: standingReach,
        heightCm,
        calibrationMaxReachCm: maxReach,
        flightTimeJumpHeightCm: estimatedJumpHeight,
        knownMaxReachCm: knownMaxReach,
        calibrationErrorCm: reachError,
      }),
    [standingReach, heightCm, maxReach, estimatedJumpHeight, knownMaxReach, reachError]
  );

  // 自動フォーム解析結果（既存の analysis/evaluation ロジックを結果画面向けに集約表示するだけ）
  const analysisResult = useMemo(() => {
    if (trackedFrames.length < 3) return null;
    return analyze(trackedFrames, skillId);
  }, [trackedFrames, skillId]);

  const formSummary = useMemo(
    () => buildFormSummary(analysisResult?.features ?? []),
    [analysisResult]
  );

  const handleMarkerPlace = (
    markerTarget: MarkerTarget,
    point: { x: number; y: number }
  ) => {
    setMarkers((prev) => ({
      ...prev,
      [markerTarget]: point,
    }));
  };

  const handleClearMarker = (markerTarget: MarkerTarget) => {
    setMarkers((prev) => ({
      ...prev,
      [markerTarget]: null,
    }));
  };

  const handleTimeSave = (
    label: "takeoff" | "landing",
    time: number,
    frame: number
  ) => {
    if (label === "takeoff") {
      setTimeA(time);
      setFrameA(frame);
    }

    if (label === "landing") {
      setTimeB(time);
      setFrameB(frame);
    }
  };

  const handleSaveResult = () => {
    const item: MeasurementHistoryItem = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      mode: "jump",
      maxReach,
      jumpHeight,
      airTime,
      airFrameCount,
      estimatedJumpHeight,
      estimatedMaxReach: reachEstimate.estimatedMaxReachCm,
      estimatedReachJumpHeight: reachEstimate.estimatedJumpHeightCm,
      reachEstimateMethod: reachEstimate.method,
      reachEstimateConfidence: reachEstimate.confidence,
      heightCm,
      standingReach,
      knownMaxReach,
      peakTime,
      peakFrame,
      reachError,
      ballSpeed,
      speedError,
      overallScore: formSummary.overallScore,
      overallStars: formSummary.overallStars,
      rank: formSummary.rank,
      formCategoryScores: analysisResult
        ? (toFormCategoryScores(formSummary.categories) as MeasurementHistoryItem["formCategoryScores"])
        : null,
      improvementComments: formSummary.improvements.map((i) => i.evaluation.comment),
      strengthComments: formSummary.strengths.map((s) => s.evaluation.comment),
    };

    const next = [item, ...history];
    setHistory(next);
    saveMeasurementHistory(next);
  };

  const handleClearHistory = () => {
    setHistory([]);
    saveMeasurementHistory([]);
  };

  const handleShare = async () => {
    const text = [
      "🏐 Jump Analyzer 測定結果",
      `総合スコア：${formSummary.overallScore !== null ? `${formSummary.overallScore}点` : "-"}`,
      `最高到達点：${maxReach ? `${maxReach.toFixed(1)}cm` : "-"}`,
      `ジャンプ高：${jumpHeight ? `${jumpHeight.toFixed(1)}cm` : "-"}`,
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
      `滞空時間：${airTime ? `${airTime.toFixed(3)}秒` : "-"}`,
      `球速：${ballSpeed ? `${ballSpeed.toFixed(1)}km/h` : "-"}`,
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

    setResultTimestamp(new Date().toLocaleString());
    setPage("result");
  };

  return (
    <div style={{ display: "flex", width: "100%", minHeight: "100svh" }}>
      <Sidebar page={page} onNavigate={setPage} userName={USER_NAME} userRole={USER_ROLE} />

      <main style={{ flex: 1, minWidth: 0, background: colors.bg }}>
        {page === "home" && (
          <HomePage
            userName={USER_NAME}
            history={history}
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
            markers={markers}
            markerTarget={target}
            onMarkerTargetChange={setTarget}
            onMarkerPlace={handleMarkerPlace}
            onClearMarker={handleClearMarker}
            onTimeSave={handleTimeSave}
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
            maxReach={maxReach}
            jumpHeight={jumpHeight}
            airTime={airTime}
            airFrameCount={airFrameCount}
            reachEstimate={reachEstimate}
            ballSpeed={ballSpeed}
            speedError={speedError}
            reachError={reachError}
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
            reachEstimate={reachEstimate}
            maxReach={maxReach}
            jumpHeight={jumpHeight}
            airTime={airTime}
            resultTimestamp={resultTimestamp}
            onBack={() => setPage("analyze")}
            onSave={handleSaveResult}
            onShare={handleShare}
          />
        )}

        {page === "compare" && <ComparePage history={history} />}

        {page === "history" && (
          <HistoryPage
            history={history}
            onClear={handleClearHistory}
            onOpenCompare={() => setPage("compare")}
          />
        )}

        {page === "players" && (
          <ComingSoonPage
            title="選手"
            description="選手ごとの解析履歴を管理する機能は準備中です。現在は1回の解析ごとに履歴（「履歴」タブ）から確認できます。"
            icon={<PlayersIcon size={26} />}
          />
        )}

        {page === "team" && (
          <ComingSoonPage
            title="チーム"
            description="チーム単位のダッシュボード（ランキング・練習参加率など）は準備中です。"
            icon={<TeamIcon size={26} />}
          />
        )}

        {page === "settings" && (
          <SettingsPage historyCount={history.length} onClearHistory={handleClearHistory} />
        )}
      </main>

      <PwaStatusToast />
    </div>
  );
}

export default JumpAnalyzer;
