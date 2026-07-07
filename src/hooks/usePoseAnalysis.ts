import { useState } from "react";
import {
  analyzeJumpFormAtPeak,
  detectPosePointsAtCurrentFrame,
  type JumpFormAnalysisResult,
  type PoseOverlayPoint,
} from "../ai/poseAnalyzer";

export function usePoseAnalysis(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  fps: number
) {
  const [posePoints, setPosePoints] = useState<PoseOverlayPoint[]>([]);
  const [formResult, setFormResult] =
    useState<JumpFormAnalysisResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [message, setMessage] = useState("");
  const [peakFrame, setPeakFrame] = useState<number | null>(null);
  const [peakTime, setPeakTime] = useState<number | null>(null);

  const detectCurrentPose = async () => {
    const video = videoRef.current;
    if (!video) return;

    setIsAnalyzing(true);

    try {
      const points = await detectPosePointsAtCurrentFrame(video);
      setPosePoints(points);
      setMessage(
        points.length > 0
          ? `骨格点を${points.length}個検出しました。`
          : "骨格を検出できませんでした。"
      );
    } catch (error) {
      console.error(error);
      setMessage("骨格検出中にエラーが発生しました。");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const analyzeForm = async () => {
    const video = videoRef.current;
    if (!video) return;

    setIsAnalyzing(true);

    try {
      const result = await analyzeJumpFormAtPeak(video, fps);
      setFormResult(result);
      setMessage(result.message);
      setPeakFrame(result.frame);
      setPeakTime(result.time);
    } catch (error) {
      console.error(error);
      setMessage("フォーム解析中にエラーが発生しました。");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const resetPoseAnalysis = () => {
    setPosePoints([]);
    setFormResult(null);
    setMessage("");
    setPeakFrame(null);
    setPeakTime(null);
  };

  return {
    posePoints,
    formResult,
    isAnalyzing,
    message,
    peakFrame,
    peakTime,
    detectCurrentPose,
    analyzeForm,
    resetPoseAnalysis,
  };
}