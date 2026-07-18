// =============================================================
// useMotionTracking.tsから抽出した、React非依存の純粋処理。
// TrackedFrame→PoseFrame変換、現在時刻に最も近いフレームの選択、
// 精度改善解析メッセージの生成をまとめる。
// =============================================================
import type { TrackedFrame } from "../ai/trackingAnalyzer";
import { analyzeJumpFromPoseFrames, type PoseFrame } from "./trackingQuality";

export function toPoseFrames(trackedFrames: TrackedFrame[]): PoseFrame[] {
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

export function createImprovedTrackingMessage(
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

/** 現在時刻に最も近いTrackedFrameを返す。同距離の場合は先に現れたフレームを維持する */
export function findNearestTrackedFrame(
  trackedFrames: TrackedFrame[],
  currentTime: number
): TrackedFrame | null {
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
}
