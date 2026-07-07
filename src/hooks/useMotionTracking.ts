import { useMemo, useState } from "react";
import {
  analyzeTrackedMotion,
  type TrackedFrame,
} from "../ai/trackingAnalyzer";
import { summarizeMotion } from "../ai/motionAnalyzer";
import type { SelectedPersonPoint } from "./useSelectedPerson";

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

  const currentTrackedFrame = useMemo(() => {
    if (trackedFrames.length === 0) return null;

    let nearest = trackedFrames[0];
    let minDiff = Math.abs(nearest.time - currentTime);

    for (const frame of trackedFrames) {
      const diff = Math.abs(frame.time - currentTime);
      if (diff < minDiff) {
        nearest = frame;
        minDiff = diff;
      }
    }

    return nearest;
  }, [trackedFrames, currentTime]);

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
  selectedPoint
);
setTrackedFrames(result.frames);
setTrackingMessage(result.message);
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
    runTracking,
    resetTracking,
  };
}