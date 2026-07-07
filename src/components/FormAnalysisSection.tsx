import { useEffect } from "react";

import FormAnalysisCard from "./FormAnalysisCard";
import { usePoseAnalysis } from "../hooks/usePoseAnalysis";
import { buttonStyle } from "../styles/ui";

type Props = {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  fps: number;
  onPeakDetected?: (frame: number, time: number) => void;
};

/**
 * フォーム解析のセクション。
 * 解析状態は内部で管理するため、動画差し替え時は
 * 親側で key を変えて再マウントすればリセットされる。
 */
export default function FormAnalysisSection({
  videoRef,
  fps,
  onPeakDetected,
}: Props) {
  const {
    formResult,
    peakFrame,
    peakTime,
    isAnalyzing,
    message,
    analyzeForm,
  } = usePoseAnalysis(videoRef, fps);

  useEffect(() => {
    if (peakFrame === null || peakTime === null) return;
    onPeakDetected?.(peakFrame, peakTime);
  }, [peakFrame, peakTime, onPeakDetected]);

  return (
    <section>
      <h2>フォーム解析</h2>

      <button
        onClick={analyzeForm}
        disabled={isAnalyzing}
        style={{ ...buttonStyle, width: "100%" }}
      >
        {isAnalyzing ? "解析中..." : "フォーム解析"}
      </button>

      {message && <p style={{ fontSize: 14 }}>{message}</p>}

      <FormAnalysisCard result={formResult} />
    </section>
  );
}
