import { useEffect } from "react";

import { usePeakDetection } from "../hooks/usePeakDetection";
import { buttonStyle } from "../styles/ui";

type Props = {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  fps: number;
  onPeakDetected?: (frame: number, time: number) => void;
};

/**
 * ジャンプ最高点の自動検出セクション。
 * 検出結果は親（ジャンプ計測）にも反映される。
 */
export default function PeakDetectionSection({
  videoRef,
  fps,
  onPeakDetected,
}: Props) {
  const { peakFrame, peakTime, confidence, isDetecting, message, detectPeak } =
    usePeakDetection(videoRef, fps);

  useEffect(() => {
    if (peakFrame === null || peakTime === null) return;
    onPeakDetected?.(peakFrame, peakTime);
  }, [peakFrame, peakTime, onPeakDetected]);

  return (
    <section>
      <h2>最高点の自動検出</h2>

      <button
        onClick={detectPeak}
        disabled={isDetecting}
        style={{ ...buttonStyle, width: "100%" }}
      >
        {isDetecting ? "解析中..." : "ジャンプの最高点を自動検出"}
      </button>

      {message && <p style={{ fontSize: 14 }}>{message}</p>}

      {peakFrame !== null && peakTime !== null && (
        <div style={cardStyle}>
          <div style={rowStyle}>
            <span>最高点フレーム</span>
            <strong>{peakFrame} F</strong>
          </div>

          <div style={rowStyle}>
            <span>最高点の時刻</span>
            <strong>{peakTime.toFixed(3)} 秒</strong>
          </div>

          <div style={rowStyle}>
            <span>骨格の検出率</span>
            <strong>{confidence !== null ? `${confidence}%` : "-"}</strong>
          </div>
        </div>
      )}
    </section>
  );
}

const cardStyle: React.CSSProperties = {
  marginTop: 12,
  padding: 12,
  borderRadius: 12,
  background: "#f3f3f3",
};

const rowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  marginTop: 6,
};
