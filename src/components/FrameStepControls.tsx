import { buttonStyle } from "../styles/ui";
import { computeSteppedTime } from "../utils/manualMeasurement";

export type TimeSaveLabel = "takeoff" | "landing";

type Props = {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  fps: number;
  onTimeSave: (label: TimeSaveLabel, time: number, frame: number) => void;
  /** コマ送り直後に現在時刻を親へ即時反映する（timeupdate を待たない）。 */
  onStep?: (time: number) => void;
};

/** コマ送り（±1F）と離地/着地時刻の保存ボタン。 */
export default function FrameStepControls({
  videoRef,
  fps,
  onTimeSave,
  onStep,
}: Props) {
  const stepFrame = (dir: -1 | 1) => {
    const video = videoRef.current;
    if (!video) return;

    const nextTime = computeSteppedTime({
      currentTime: video.currentTime,
      duration: video.duration,
      fps,
      direction: dir,
    });

    video.currentTime = nextTime;
    onStep?.(nextTime);
  };

  const saveTime = (label: TimeSaveLabel) => {
    const video = videoRef.current;
    if (!video) return;

    const time = video.currentTime;
    onTimeSave(label, time, Math.round(time * fps));
  };

  return (
    <>
      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <button onClick={() => stepFrame(-1)} style={{ ...buttonStyle, flex: 1, marginTop: 0 }}>
          -1F
        </button>

        <button onClick={() => stepFrame(1)} style={{ ...buttonStyle, flex: 1, marginTop: 0 }}>
          +1F
        </button>
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <button onClick={() => saveTime("takeoff")} style={{ ...buttonStyle, flex: 1, marginTop: 0 }}>
          離地を保存
        </button>

        <button onClick={() => saveTime("landing")} style={{ ...buttonStyle, flex: 1, marginTop: 0 }}>
          着地を保存
        </button>
      </div>
    </>
  );
}
