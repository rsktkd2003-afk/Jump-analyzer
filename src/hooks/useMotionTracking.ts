import { useMemo, useState } from "react";
import {
  analyzeTrackedMotion,
  type TrackedFrame,
} from "../ai/trackingAnalyzer";
import { summarizeMotion } from "../ai/motionAnalyzer";
import type { SelectedPersonPoint } from "./useSelectedPerson";
import {
  analyzeJumpFromPoseFrames,
  type PoseFrame,
} from "../utils/trackingQuality";

function toPoseFrames(trackedFrames: TrackedFrame[]): PoseFrame[] {
  return trackedFrames.map((frame) => ({
    timestamp: frame.time * 1000,
    leftHip: frame.landmarks[23],
    rightHip: frame.landmarks[24],
    leftKnee: frame.landmarks[25],
    rightKnee: frame.landmarks[26],
    leftAnkle: frame.landmarks[27],
    rightAnkle: frame.landmarks[28],
  }));
}

function createImprovedTrackingMessage(
  originalMessage: string,
  trackedFrames: TrackedFrame[]
): string {
  const poseFrames = toPoseFrames(trackedFrames);
  const jumpAnalysis = analyzeJumpFromPoseFrames(poseFrames);

  if (!jumpAnalysis.success || !jumpAnalysis.jumpEvent) {
    return `${originalMessage}\n精度改善解析：ジャンプ区間を特定できませんでした。`;
  }

  const flightTimeSec = jumpAnalysis.jumpEvent.flightTimeSec;
  const jumpHeightCm = jumpAnalysis.jumpHeightCm;

  return [
    originalMessage,
    `精度改善解析：滞空時間 ${flightTimeSec.toFixed(3)}秒`,
    jumpHeightCm !== null
      ? `推定ジャンプ高 ${jumpHeightCm.toFixed(1)}cm`
      : "推定ジャンプ高を計算できませんでした。",
  ].join("\n");
}

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
        selectedPoint,
        { smoothing: { enabled: isSmoothingEnabled } }
      );

      setTrackedFrames(result.frames);
      setTrackingMessage(
        createImprovedTrackingMessage(result.message, result.frames)
      );
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