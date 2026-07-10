import FrameStepControls, { type TimeSaveLabel } from "./FrameStepControls";
import TrackingSection from "./TrackingSection";
import FormAnalysisSection from "./FormAnalysisSection";

import { useSelectedPerson } from "../hooks/useSelectedPerson";
import { useVideoSource } from "../hooks/useVideoSource";
import { numberInputStyle } from "../styles/ui";

import type { MarkerTarget, Markers } from "../types/measurement";
import type { BodyProfile } from "../analysis/evaluation";

export type { TimeSaveLabel };

type Props = {
  fps: number;
  onFpsChange: (fps: number) => void;
  onTimeSave: (label: TimeSaveLabel, time: number, frame: number) => void;
  onPeakDetected?: (frame: number, time: number) => void;
  markers: Markers;
  markerTarget: MarkerTarget;
  onMarkerPlace: (target: MarkerTarget, point: { x: number; y: number }) => void;
  /** 身長・指高（トラッキング解析のcm換算用、任意） */
  bodyProfile?: BodyProfile;
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
  onFpsChange,
  onTimeSave,
  onPeakDetected,
  markers,
  markerTarget,
  onMarkerPlace,
  bodyProfile,
}: Props) {
  const {
    videoRef,
    videoUrl,
    videoName,
    currentTime,
    setCurrentTime,
    loadFile,
  } = useVideoSource();

  const { selectedPoint, selectPerson, resetSelectedPerson } =
    useSelectedPerson();

  const currentFrame = Math.round(currentTime * fps);

  const handleVideoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    loadFile(file);
    resetSelectedPerson();
  };

  const handleVideoClick = (e: React.MouseEvent<HTMLVideoElement>) => {
    const video = videoRef.current;
    if (!video) return;

    const rect = video.getBoundingClientRect();

    const point = {
      x: ((e.clientX - rect.left) / rect.width) * video.videoWidth,
      y: ((e.clientY - rect.top) / rect.height) * video.videoHeight,
    };

    onMarkerPlace(markerTarget, point);
    selectPerson(e, video);
  };

  const getMarkerStyle = (point: { x: number; y: number }) => {
    const video = videoRef.current;

    if (!video || !video.videoWidth || !video.videoHeight) {
      return {
        left: "0%",
        top: "0%",
      };
    }

    return {
      left: `${(point.x / video.videoWidth) * 100}%`,
      top: `${(point.y / video.videoHeight) * 100}%`,
    };
  };

  return (
    <section>
      <h2>動画</h2>

      <input
        type="file"
        accept="video/*"
        onChange={handleVideoUpload}
        style={{ fontSize: 16 }}
      />

      <div style={{ marginTop: 8 }}>
        <label>
          FPS：
          <input
            type="number"
            value={fps}
            onChange={(e) => onFpsChange(Number(e.target.value))}
            style={numberInputStyle}
          />
        </label>
      </div>

      {videoUrl && (
        <>
          <p style={{ fontSize: 14 }}>{videoName}</p>

          <p style={{ fontSize: 13 }}>
            現在のタップ対象：<b>{markerLabels[markerTarget]}</b>
          </p>

          <div style={{ position: "relative", width: "100%" }}>
            <video
              ref={videoRef}
              src={videoUrl}
              controls
              playsInline
              style={{
                width: "100%",
                borderRadius: 12,
                background: "#000",
                display: "block",
              }}
              onClick={handleVideoClick}
              onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
              onLoadedMetadata={(e) =>
                setCurrentTime(e.currentTarget.currentTime)
              }
            />

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
                      width: 16,
                      height: 16,
                      borderRadius: "50%",
                      background: target === markerTarget ? "#ff1744" : "#00e5ff",
                      border: "2px solid #fff",
                      boxShadow: "0 0 6px rgba(0,0,0,0.6)",
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

          <div style={{ marginTop: 8, fontSize: 14 }}>
            <div>現在時刻：{currentTime.toFixed(3)} 秒</div>
            <div>現在フレーム：{currentFrame} F</div>
            <div>
              選択人物：
              {selectedPoint
                ? `x=${selectedPoint.x.toFixed(0)}, y=${selectedPoint.y.toFixed(0)}`
                : "未選択"}
            </div>
          </div>

          <FrameStepControls
            videoRef={videoRef}
            fps={fps}
            onTimeSave={onTimeSave}
            onStep={setCurrentTime}
          />

          <hr />

          <TrackingSection
            key={`tracking-${videoUrl}`}
            videoRef={videoRef}
            fps={fps}
            currentTime={currentTime}
            selectedPoint={selectedPoint}
            bodyProfile={bodyProfile}
          />

          <hr />

          <FormAnalysisSection
            key={`form-${videoUrl}`}
            videoRef={videoRef}
            fps={fps}
            onPeakDetected={onPeakDetected}
          />
        </>
      )}
    </section>
  );
}