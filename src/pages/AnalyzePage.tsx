import { useRef, useState } from "react";

import VideoPlayer, { type TimeSaveLabel } from "../components/VideoPlayer";
import MarkerToolbar from "../components/MarkerToolbar";
import ResultCard from "../components/ResultCard";
import { CaptureSettingsForm } from "../components/CaptureSettingsForm";
import { UploadIcon, ChevronLeftIcon, CheckCircleIcon } from "../components/layout/Icons";

import type { CaptureSettings } from "../ai/captureSettings";
import type { SkillId } from "../analysis/types";
import type { MarkerTarget, Markers } from "../types/measurement";
import type { SelectedPersonPoint } from "../hooks/useSelectedPerson";
import type { TrackedFrame, JumpFormAnalysisResult } from "../ai/poseAnalyzer";
import type { ReachEstimateResult } from "../ai/reachEstimateAnalyzer";

import { card, colors, inputStyle, mutedText, page, primaryButton, radius, sectionTitle } from "../styles/theme";

type Props = {
  fps: number;
  onFpsChange: (fps: number) => void;
  heightCm: number;
  onHeightChange: (value: number) => void;
  standingReach: number;
  onStandingReachChange: (value: number) => void;
  knownMaxReach: number | null;
  onKnownMaxReachChange: (value: number | null) => void;
  knownCm: number;
  onKnownCmChange: (value: number) => void;
  ringHeight: number;
  onRingHeightChange: (value: number) => void;

  captureSettings: CaptureSettings;
  onCaptureSettingsChange: (value: CaptureSettings) => void;
  skillId: SkillId;
  onSkillIdChange: (value: SkillId) => void;

  markers: Markers;
  markerTarget: MarkerTarget;
  onMarkerTargetChange: (target: MarkerTarget) => void;
  onMarkerPlace: (target: MarkerTarget, point: { x: number; y: number }) => void;
  onClearMarker: (target: MarkerTarget) => void;

  onTimeSave: (label: TimeSaveLabel, time: number, frame: number) => void;
  onPeakDetected?: (frame: number, time: number) => void;

  videoRef: React.RefObject<HTMLVideoElement | null>;
  videoUrl: string | null;
  videoName: string;
  currentTime: number;
  setCurrentTime: (time: number) => void;
  loadFile: (file: File) => void;

  selectedPoint: SelectedPersonPoint | null;
  onVideoClickSelectPerson: (e: React.MouseEvent<HTMLVideoElement>, video: HTMLVideoElement) => void;

  trackedFrames: TrackedFrame[];
  currentTrackedFrame: TrackedFrame | null;
  trackingMessage: string;
  trackingProgress: number;
  isTracking: boolean;
  isSmoothingEnabled: boolean;
  setIsSmoothingEnabled: (value: boolean) => void;
  runTracking: () => void;

  formResult: JumpFormAnalysisResult | null;
  peakFrame: number | null;
  peakTime: number | null;
  isAnalyzingForm: boolean;
  formMessage: string;
  analyzeForm: () => void;

  maxReach: number | null;
  jumpHeight: number | null;
  airTime: number | null;
  airFrameCount: number | null;
  reachEstimate: ReachEstimateResult;
  ballSpeed: number | null;
  speedError: number | null;
  reachError: number | null;

  isStarting: boolean;
  onStartAnalysis: () => void;
  onBack: () => void;
};

export default function AnalyzePage(props: Props) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [showManualCalibration, setShowManualCalibration] = useState(false);

  const handleFiles = (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    props.loadFile(file);
  };

  const step2Reached = Boolean(props.videoUrl);
  const step3Ready = step2Reached;

  const busy = props.isStarting || props.isTracking || props.isAnalyzingForm;

  const progressSteps = [
    { label: "動画読込", done: step2Reached },
    { label: "姿勢推定", done: props.trackedFrames.length > 0, active: props.isTracking },
    { label: "ジャンプ検出", done: props.trackedFrames.length > 0, active: props.isTracking },
    { label: "フォーム解析", done: Boolean(props.formResult), active: props.isAnalyzingForm },
    { label: "AI評価", done: Boolean(props.formResult), active: props.isAnalyzingForm },
  ];
  const progressPercent = busy
    ? Math.round(
        (progressSteps.filter((s) => s.done).length / progressSteps.length) * 100 +
          (props.isTracking ? props.trackingProgress / progressSteps.length : 0)
      )
    : step3Ready
    ? 0
    : 0;

  return (
    <div style={page} className="page-container">
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
        <button
          onClick={props.onBack}
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
        <h1 style={{ fontSize: 20 }}>新しく解析する</h1>
      </div>

      <Stepper active={!step2Reached ? 1 : busy ? 3 : 2} />

      <div style={{ ...card, marginTop: 20 }}>
        <h2 style={sectionTitle}>動画を選択</h2>
        {!props.videoUrl ? (
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragOver(true);
            }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragOver(false);
              handleFiles(e.dataTransfer.files);
            }}
            onClick={() => fileInputRef.current?.click()}
            style={{
              marginTop: 12,
              border: `2px dashed ${isDragOver ? colors.accent : colors.border}`,
              borderRadius: radius.lg,
              background: isDragOver ? colors.accentSofter : "#FAFBFD",
              padding: "56px 24px",
              textAlign: "center",
              cursor: "pointer",
            }}
          >
            <div
              style={{
                width: 56,
                height: 56,
                margin: "0 auto 16px",
                borderRadius: "50%",
                background: colors.accentSoft,
                color: colors.accent,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <UploadIcon size={26} />
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, color: colors.titleText }}>
              動画をドラッグ&ドロップ
            </div>
            <div style={{ fontSize: 13, color: colors.mutedText, margin: "6px 0 16px" }}>または</div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                fileInputRef.current?.click();
              }}
              style={primaryButton}
            >
              ファイルを選択
            </button>
            <div style={{ fontSize: 12, color: colors.mutedText, marginTop: 16 }}>
              対応形式：MP4, MOV, AVI（最大2GB）
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="video/*"
              onChange={(e) => handleFiles(e.target.files)}
              style={{ display: "none" }}
            />
          </div>
        ) : (
          <div style={{ marginTop: 12 }}>
            <VideoPlayer
              fps={props.fps}
              onTimeSave={props.onTimeSave}
              onPeakDetected={props.onPeakDetected}
              markers={props.markers}
              markerTarget={props.markerTarget}
              onMarkerPlace={props.onMarkerPlace}
              bodyProfile={{ heightCm: props.heightCm, standingReachCm: props.standingReach }}
              videoRef={props.videoRef}
              videoUrl={props.videoUrl}
              videoName={props.videoName}
              currentTime={props.currentTime}
              setCurrentTime={props.setCurrentTime}
              selectedPoint={props.selectedPoint}
              onVideoClickSelectPerson={props.onVideoClickSelectPerson}
              trackedFrames={props.trackedFrames}
              currentTrackedFrame={props.currentTrackedFrame}
              trackingMessage={props.trackingMessage}
              trackingProgress={props.trackingProgress}
              isTracking={props.isTracking}
              isSmoothingEnabled={props.isSmoothingEnabled}
              setIsSmoothingEnabled={props.setIsSmoothingEnabled}
              runTracking={props.runTracking}
              formResult={props.formResult}
              peakFrame={props.peakFrame}
              peakTime={props.peakTime}
              isAnalyzingForm={props.isAnalyzingForm}
              formMessage={props.formMessage}
              analyzeForm={props.analyzeForm}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              style={{
                marginTop: 8,
                fontSize: 12,
                color: colors.accent,
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: 0,
              }}
            >
              別の動画に差し替える
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="video/*"
              onChange={(e) => handleFiles(e.target.files)}
              style={{ display: "none" }}
            />
          </div>
        )}
      </div>

      <div style={{ ...card, marginTop: 20 }}>
        <h2 style={sectionTitle}>解析設定（任意）</h2>
        <p style={{ ...mutedText, marginBottom: 16 }}>
          未入力でも解析できます。入力すると評価の信頼度・cm換算の精度が上がります。
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16 }}>
          <Field label="競技">
            <select
              value={props.skillId}
              onChange={(e) => props.onSkillIdChange(e.target.value as SkillId)}
              style={inputStyle}
            >
              <option value="spikeJump">スパイク</option>
              <option value="receive">レシーブ（準備中）</option>
              <option value="block">ブロック（準備中）</option>
            </select>
          </Field>

          <Field label="身長 (cm)">
            <input
              type="number"
              value={props.heightCm}
              onChange={(e) => props.onHeightChange(Number(e.target.value))}
              style={inputStyle}
            />
          </Field>

          <Field label="指高 (cm)">
            <input
              type="number"
              value={props.standingReach}
              onChange={(e) => props.onStandingReachChange(Number(e.target.value))}
              style={inputStyle}
            />
          </Field>

          <Field label="FPS">
            <input
              type="number"
              value={props.fps}
              onChange={(e) => props.onFpsChange(Number(e.target.value))}
              style={inputStyle}
            />
          </Field>
        </div>

        <div style={{ marginTop: 16 }}>
          <CaptureSettingsForm value={props.captureSettings} onChange={props.onCaptureSettingsChange} />
        </div>

        <button
          type="button"
          onClick={() => setShowManualCalibration((prev) => !prev)}
          style={{
            marginTop: 4,
            fontSize: 12,
            color: colors.bodyText,
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: 0,
            textDecoration: "underline",
          }}
        >
          {showManualCalibration ? "手動キャリブレーションを閉じる" : "手動キャリブレーション（上級者向け）を開く"}
        </button>

        {showManualCalibration && (
          <div style={{ marginTop: 16, borderTop: `1px solid ${colors.border}`, paddingTop: 16 }}>
            <p style={mutedText}>
              基準A/B・リング・指先・ボールA/Bを動画上でタップして手動計測する既存機能です。自動解析とは独立して利用できます。
            </p>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 16, marginTop: 12 }}>
              <Field label="基準距離 (cm)">
                <input
                  type="number"
                  value={props.knownCm}
                  onChange={(e) => props.onKnownCmChange(Number(e.target.value))}
                  style={inputStyle}
                />
              </Field>
              <Field label="リング高さ (cm)">
                <input
                  type="number"
                  value={props.ringHeight}
                  onChange={(e) => props.onRingHeightChange(Number(e.target.value))}
                  style={inputStyle}
                />
              </Field>
              <Field label="既知の最高到達点 (cm・任意)">
                <input
                  type="number"
                  value={props.knownMaxReach ?? ""}
                  placeholder="任意"
                  onChange={(e) =>
                    props.onKnownMaxReachChange(e.target.value === "" ? null : Number(e.target.value))
                  }
                  style={inputStyle}
                />
              </Field>
            </div>

            {props.videoUrl && (
              <div style={{ marginTop: 16 }}>
                <MarkerToolbar
                  target={props.markerTarget}
                  onChange={props.onMarkerTargetChange}
                  onClearMarker={props.onClearMarker}
                />
              </div>
            )}

            <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
              <ResultCard
                title="最高到達点（キャリブレーション）"
                value={props.maxReach ? `約 ${props.maxReach.toFixed(1)} cm` : "-"}
                subText={props.reachError ? `誤差目安：±${props.reachError.toFixed(1)}cm` : undefined}
              />
              <ResultCard
                title="ジャンプ高（キャリブレーション）"
                value={props.jumpHeight ? `約 ${props.jumpHeight.toFixed(1)} cm` : "-"}
              />
              <ResultCard
                title="滞空時間（離地A/着地B）"
                value={props.airTime ? `${props.airTime.toFixed(3)} 秒` : "-"}
                subText={props.airFrameCount ? `${props.airFrameCount}フレーム` : "離地をA、着地をBで保存"}
              />
              <ResultCard
                title="球速"
                value={props.ballSpeed ? `約 ${props.ballSpeed.toFixed(1)} km/h` : "-"}
                subText={props.speedError ? `誤差目安：±${props.speedError.toFixed(1)}km/h` : undefined}
              />
            </div>
          </div>
        )}
      </div>

      {busy && (
        <div style={{ ...card, marginTop: 20 }}>
          <h2 style={sectionTitle}>解析中...</h2>
          <div
            style={{
              height: 8,
              borderRadius: 999,
              background: colors.border,
              overflow: "hidden",
              marginTop: 8,
              marginBottom: 16,
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${Math.min(100, Math.max(4, progressPercent))}%`,
                background: colors.accent,
                transition: "width 0.3s ease",
              }}
            />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {progressSteps.map((step) => (
              <div key={step.label} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                <span
                  style={{
                    color: step.done ? colors.success : step.active ? colors.accent : colors.mutedText,
                    display: "flex",
                  }}
                >
                  <CheckCircleIcon size={16} />
                </span>
                <span style={{ color: step.done ? colors.titleText : colors.bodyText }}>{step.label}</span>
                {step.active && !step.done && (
                  <span style={{ color: colors.mutedText, fontSize: 12 }}>処理中…</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={props.onStartAnalysis}
        disabled={!props.videoUrl || busy}
        style={{
          ...primaryButton,
          width: "100%",
          marginTop: 20,
          padding: "16px 20px",
          fontSize: 16,
          opacity: !props.videoUrl || busy ? 0.5 : 1,
          cursor: !props.videoUrl || busy ? "not-allowed" : "pointer",
        }}
      >
        {busy ? "解析中..." : "解析を開始する"}
      </button>

      {props.videoUrl && !props.selectedPoint && (
        <p style={{ ...mutedText, marginTop: 8, textAlign: "center" }}>
          解析精度を上げるには、動画内の選手を先にクリックして選択してください。
        </p>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "block" }}>
      <span style={{ display: "block", fontSize: 12, fontWeight: 600, color: colors.bodyText, marginBottom: 6 }}>
        {label}
      </span>
      {children}
    </label>
  );
}

function Stepper({ active }: { active: 1 | 2 | 3 }) {
  const steps = ["動画を選択", "設定を入力", "解析開始"];
  return (
    <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", rowGap: 8, gap: 8 }}>
      {steps.map((label, index) => {
        const stepNum = index + 1;
        const isActive = stepNum === active;
        const isDone = stepNum < active;
        return (
          <div key={label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "5px 12px",
                borderRadius: radius.pill,
                background: isActive || isDone ? colors.accentSoft : "#fff",
                border: `1px solid ${isActive || isDone ? colors.accent : colors.border}`,
                color: isActive || isDone ? colors.accent : colors.mutedText,
                fontSize: 12,
                fontWeight: 700,
              }}
            >
              <span>{stepNum}</span>
              <span>{label}</span>
            </div>
            {stepNum < steps.length && (
              <span style={{ color: colors.border, fontSize: 12 }}>―</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
