import { useMemo, useState } from "react";
import {
  analyzeTrackedMotion,
  type TrackedFrame,
} from "../ai/trackingAnalyzer";
import { summarizeMotion } from "../ai/motionAnalyzer";
import type { SelectedPersonPoint } from "./useSelectedPerson";
import {
  createTrackingMessage,
  findNearestTrackedFrame,
} from "../utils/motionTrackingSummary";

export function useMotionTracking(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  fps: number,
  currentTime: number,
  selectedPoint: SelectedPersonPoint | null
) {
  const [trackedFrames, setTrackedFrames] = useState<TrackedFrame[]>([]);
  const [trackingMessage, setTrackingMessage] = useState("");
  const [trackingProgress, setTrackingProgress] = useState(0);
  const [isTracking, setIsTracking] = useState(false);
  const [isSmoothingEnabled, setIsSmoothingEnabled] = useState(true);

  const currentTrackedFrame = useMemo(
    () => findNearestTrackedFrame(trackedFrames, currentTime),
    [trackedFrames, currentTime]
  );

  const motionSummary = useMemo(
    () => summarizeMotion(trackedFrames),
    [trackedFrames]
  );

  const resetTracking = () => {
    setTrackedFrames([]);
    setTrackingMessage("");
    setTrackingProgress(0);
  };

  const runTracking = async () => {
    const video = videoRef.current;
    if (!video) return;

    setIsTracking(true);
    setTrackingMessage("トラッキング中...");
    setTrackingProgress(0);

    try {
      const result = await analyzeTrackedMotion(
        video,
        fps,
        setTrackingProgress,
        selectedPoint,
        { smoothing: { enabled: isSmoothingEnabled } }
      );

      setTrackedFrames(result.frames);
      setTrackingMessage(createTrackingMessage(result));
    } catch (error) {
      console.error(error);
      setTrackingMessage("トラッキング中にエラーが発生しました。");
    } finally {
      setIsTracking(false);
    }
  };

  return {
    trackedFrames,
    currentTrackedFrame,
    motionSummary,
    trackingMessage,
    trackingProgress,
    isTracking,
    isSmoothingEnabled,
    setIsSmoothingEnabled,
    runTracking,
    resetTracking,
  };
}
