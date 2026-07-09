import { useState } from "react";

import TrackingCanvas from "./TrackingCanvas";
import TrackingInfoCard from "./TrackingInfoCard";
import MotionGraph from "./MotionGraph";
import ReferenceComparisonPanel from "./ReferenceComparisonPanel";

import JumpPhasePanel from "./JumpPhasePanel";
import MotionFingerprint from "./MotionFingerprint";
import MotionHistoryPanel from "./MotionHistoryPanel";
import SkillAnalysisPanel from "./SkillAnalysisPanel";
import ApproachLandingPanel from "./ApproachLandingPanel";

import { useMotionTracking } from "../hooks/useMotionTracking";
import type { SelectedPersonPoint } from "../hooks/useSelectedPerson";
import { buttonStyle, hintStyle } from "../styles/ui";

type Props = {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  fps: number;
  currentTime: number;
  selectedPoint: SelectedPersonPoint | null;
};

export default function TrackingSection({
  videoRef,
  fps,
  currentTime,
  selectedPoint,
}: Props) {
  const [isCropMode, setIsCropMode] = useState(true);
  const [showSkeleton, setShowSkeleton] = useState(true);

  const {
    trackedFrames,
    currentTrackedFrame,
    trackingMessage,
    trackingProgress,
    isTracking,
    isSmoothingEnabled,
    setIsSmoothingEnabled,
    runTracking,
  } = useMotionTracking(videoRef, fps, currentTime, selectedPoint);

  return (
    <section>
      <h2>人物トラッキング</h2>

      <p style={hintStyle}>
        先に動画内の選手をクリックしてから、トラッキングを実行してください。
      </p>

      <label
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontSize: 14,
          marginBottom: 8,
        }}
      >
        <input
          type="checkbox"
          checked={isSmoothingEnabled}
          disabled={isTracking}
          onChange={(event) => setIsSmoothingEnabled(event.target.checked)}
        />
        Kalman平滑化を使う
      </label>

      <button
        onClick={runTracking}
        disabled={isTracking}
        style={{ ...buttonStyle, width: "100%" }}
      >
        {isTracking ? "解析中..." : "選手をトラッキング"}
      </button>

      <p style={{ fontSize: 14 }}>
        {trackingMessage || "動画を読み込んだらトラッキングできます。"}
      </p>

      {isTracking && <p style={{ fontSize: 14 }}>進捗：{trackingProgress}%</p>}

      {trackedFrames.length > 0 && (
        <>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => setIsCropMode((prev) => !prev)}
              style={buttonStyle}
            >
              {isCropMode ? "全体表示" : "切り抜き表示"}
            </button>

            <button
              onClick={() => setShowSkeleton((prev) => !prev)}
              style={buttonStyle}
            >
              {showSkeleton ? "骨格OFF" : "骨格ON"}
            </button>
          </div>

          <h3>トラッキング再生</h3>

          <TrackingCanvas
            videoRef={videoRef}
            frame={currentTrackedFrame}
            isCropMode={isCropMode}
            showSkeleton={showSkeleton}
          />

          <TrackingInfoCard frame={currentTrackedFrame} />

          <MotionGraph frames={trackedFrames} />

          <SkillAnalysisPanel frames={trackedFrames} />

          <JumpPhasePanel frames={trackedFrames} />

          <ApproachLandingPanel frames={trackedFrames} />

          <MotionFingerprint frames={trackedFrames} />

          <MotionHistoryPanel frames={trackedFrames} />

          <ReferenceComparisonPanel userFrames={trackedFrames} fps={fps} />
        </>
      )}
    </section>
  );
}