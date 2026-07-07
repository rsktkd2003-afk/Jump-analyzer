import { useState } from "react";

import { analyzeJumpPeakFrame } from "../ai/poseAnalyzer";

/** AIによるジャンプ最高点フレームの自動検出 */
export function usePeakDetection(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  fps: number
) {
  const [peakFrame, setPeakFrame] = useState<number | null>(null);
  const [peakTime, setPeakTime] = useState<number | null>(null);
  const [confidence, setConfidence] = useState<number | null>(null);
  const [isDetecting, setIsDetecting] = useState(false);
  const [message, setMessage] = useState("");

  const detectPeak = async () => {
    const video = videoRef.current;
    if (!video) return;

    setIsDetecting(true);

    try {
      const result = await analyzeJumpPeakFrame(video, fps);
      setPeakFrame(result.bestFrame);
      setPeakTime(result.bestTime);
      setConfidence(result.confidence);
      setMessage(result.message);
    } catch (error) {
      console.error(error);
      setMessage("最高点の検出中にエラーが発生しました。");
    } finally {
      setIsDetecting(false);
    }
  };

  return {
    peakFrame,
    peakTime,
    confidence,
    isDetecting,
    message,
    detectPeak,
  };
}
