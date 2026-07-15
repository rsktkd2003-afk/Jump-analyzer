import { useState } from "react";

import FrameStepControls, { type TimeSaveLabel } from "./FrameStepControls";
import TrackingSection from "./TrackingSection";
import FormAnalysisSection from "./FormAnalysisSection";

import type { SelectedPersonPoint } from "../hooks/useSelectedPerson";
import { colors, radius } from "../styles/theme";

import type { MarkerTarget, Markers } from "../types/measurement";
import type { BodyProfile } from "../analysis/evaluation";
import type { TrackedFrame } from "../ai/poseAnalyzer";
import type { JumpFormAnalysisResult } from "../ai/poseAnalyzer";

export type { TimeSaveLabel };

type Props = {
  fps: number;
  onTimeSave: (label: TimeSaveLabel, time: number, frame: number) => void;
  onPeakDetected?: (frame: number, time: number) => void;
  markers: Markers;
  markerTarget: MarkerTarget;
  onMarkerPlace: (target: MarkerTarget, point: { x: number; y: number }) => void;
  /** 身長・指高（トラッキング解析のcm換算用、任意） */
  bodyProfile?: BodyProfile;

  videoRef: React.RefObject<HTMLVideoElement | null>;
  videoUrl: string | null;
  videoName: string;
  currentTime: number;
  setCurrentTime: (time: number) => void;

  selectedPoint: SelectedPersonPoint | null;
  onVideoClickSelectPerson: (e: React.MouseEvent<HTMLVideoElement>, video: HTMLVideoElement) => void;

  // トラッキング（人物追跡）
  trackedFrames: TrackedFrame[];
  currentTrackedFrame: TrackedFrame | null;
  trackingMessage: string;
  trackingProgress: number;
  isTracking: boolean;
  isSmoothingEnabled: boolean;
  setIsSmoothingEnabled: (value: boolean) => void;
  runTracking: () => void;

  // フォーム解析
  formResult: JumpFormAnalysisResult | null;
  peakFrame: number | null;
  peakTime: number | null;
  isAnalyzingForm: boolean;
  formMessage: string;
  analyzeForm: () => void;
};

const markerLabels: Record<MarkerTarget, string> = {
  calibA: "基準A",
  calibB: "基準B",
  ring: "リング",
  finger: "指先",
  ballA: "ボールA",
  ballB: "ボールB",
};

export default function VideoPlayer({
  fps,
  onTimeSave,
  onPeakDetected,
  markers,
  markerTarget,
  onMarkerPlace,
  bodyProfile,
  videoRef,
  videoUrl,
  videoName,
  currentTime,
  setCurrentTime,
  selectedPoint,
  onVideoClickSelectPerson,
  trackedFrames,
  currentTrackedFrame,
  trackingMessage,
  trackingProgress,
  isTracking,
  isSmoothingEnabled,
  setIsSmoothingEnabled,
  runTracking,
  formResult,
  peakFrame,
  peakTime,
  isAnalyzingForm,
  formMessage,
  analyzeForm,
}: Props) {
  const currentFrame = Math.round(currentTime * fps);

  // ref.current はレンダー中に読まないため、動画の実寸は
  // onLoadedMetadata で state に取り込んでからマーカー位置計算に使う。
  const [videoNaturalSize, setVideoNaturalSize] = useState<{ width: number; height: number } | null>(
    null
  );

  const handleVideoClick = (e: React.MouseEvent<HTMLVideoElement>) => {
    const video = videoRef.current;
    if (!video) return;

    const rect = video.getBoundingClientRect();

    const point = {
      x: ((e.clientX - rect.left) / rect.width) * video.videoWidth,
      y: ((e.clientY - rect.top) / rect.height) * video.videoHeight,
    };

    onMarkerPlace(markerTarget, point);
    onVideoClickSelectPerson(e, video);
  };

  const getMarkerStyle = (point: { x: number; y: number }) => {
    if (!videoNaturalSize) {
      return {
        left: "0%",
        top: "0%",
      };
    }

    return {
      left: `${(point.x / videoNaturalSize.width) * 100}%`,
      top: `${(point.y / videoNaturalSize.height) * 100}%`,
    };
  };

  if (!videoUrl) return null;

  return (
    <section>
      <p style={{ fontSize: 13, color: colors.bodyText, marginBottom: 8 }}>{videoName}</p>

      <p style={{ fontSize: 12, color: colors.bodyText, marginBottom: 8 }}>
        動画内の選手をクリックして選択してください（現在のタップ対象：
        <b style={{ color: colors.titleText }}>{markerLabels[markerTarget]}</b>）
      </p>

      <div style={{ position: "relative", width: "100%" }}>
        <video
          ref={videoRef}
          src={videoUrl}
          controls
          playsInline
          style={{
            width: "100%",
            borderRadius: radius.lg,
            background: "#000",
            display: "block",
          }}
          onClick={handleVideoClick}
          onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
          onLoadedMetadata={(e) => {
            setCurrentTime(e.currentTarget.currentTime);
            setVideoNaturalSize({
              width: e.currentTarget.videoWidth,
              height: e.currentTarget.videoHeight,
            });
          }}
        />

        {selectedPoint && videoNaturalSize && (
          <div
            style={{
              position: "absolute",
              left: `${(selectedPoint.x / videoNaturalSize.width) * 100}%`,
              top: `${(selectedPoint.y / videoNaturalSize.height) * 100}%`,
              transform: "translate(-50%, -50%)",
              pointerEvents: "none",
              width: 22,
              height: 22,
              borderRadius: "50%",
              border: `2px solid ${colors.accent}`,
              boxShadow: "0 0 0 3px rgba(229,57,53,0.2)",
            }}
          />
        )}

        {Object.entries(markers).map(([key, point]) => {
          if (!point) return null;

          const target = key as MarkerTarget;
          const position = getMarkerStyle(point);

          return (
            <div
              key={target}
              style={{
                position: "absolute",
                left: position.left,
                top: position.top,
                transform: "translate(-50%, -50%)",
                pointerEvents: "none",
                zIndex: 2,
              }}
            >
              <div
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: "50%",
                  background: target === markerTarget ? colors.accent : "#00b8d9",
                  border: "2px solid #fff",
                  boxShadow: "0 0 6px rgba(0,0,0,0.5)",
                }}
              />

              <div
                style={{
                  marginTop: 2,
                  padding: "2px 5px",
                  borderRadius: 6,
                  background: "rgba(0,0,0,0.7)",
                  color: "#fff",
                  fontSize: 11,
                  whiteSpace: "nowrap",
                }}
              >
                {markerLabels[target]}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: 8, fontSize: 12, color: colors.bodyText, display: "flex", gap: 16 }}>
        <span>現在時刻：{currentTime.toFixed(3)} 秒</span>
        <span>現在フレーム：{currentFrame} F</span>
      </div>

      <FrameStepControls
        videoRef={videoRef}
        fps={fps}
        onTimeSave={onTimeSave}
        onStep={setCurrentTime}
      />

      <hr style={{ margin: "16px 0", border: "none", borderTop: `1px solid ${colors.border}` }} />

      <TrackingSection
        videoRef={videoRef}
        bodyProfile={bodyProfile}
        trackedFrames={trackedFrames}
        currentTrackedFrame={currentTrackedFrame}
        trackingMessage={trackingMessage}
        trackingProgress={trackingProgress}
        isTracking={isTracking}
        isSmoothingEnabled={isSmoothingEnabled}
        setIsSmoothingEnabled={setIsSmoothingEnabled}
        runTracking={runTracking}
      />

      <hr style={{ margin: "16px 0", border: "none", borderTop: `1px solid ${colors.border}` }} />

      <FormAnalysisSection
        onPeakDetected={onPeakDetected}
        formResult={formResult}
        peakFrame={peakFrame}
        peakTime={peakTime}
        isAnalyzing={isAnalyzingForm}
        message={formMessage}
        analyzeForm={analyzeForm}
      />
    </section>
  );
}
