import type { TrackedFrame } from "./poseAnalyzer";

export type MotionAnalysisFrame = {
  time: number;
  frameIndex: number;
};

export type MotionAnalysisResult = {
  message: string;
  frames: MotionAnalysisFrame[];
  trunkAngleRange: number | null;
  trunkAngleMin: number | null;
  trunkAngleMax: number | null;
  shoulderXRange: number | null;
  hipXRange: number | null;
};

export type MotionSummary = {
  frameCount: number;
  startTime: number | null;
  endTime: number | null;
  minCenterX: number | null;
  maxCenterX: number | null;
  centerXRange: number | null;
  minCenterY: number | null;
  maxCenterY: number | null;
  centerYRange: number | null;
};

export function summarizeMotion(frames: TrackedFrame[]): MotionSummary {
  if (frames.length === 0) {
    return {
      frameCount: 0,
      startTime: null,
      endTime: null,
      minCenterX: null,
      maxCenterX: null,
      centerXRange: null,
      minCenterY: null,
      maxCenterY: null,
      centerYRange: null,
    };
  }

  const xs = frames.map((frame) => frame.centerX);
  const ys = frames.map((frame) => frame.centerY);

  const minCenterX = Math.min(...xs);
  const maxCenterX = Math.max(...xs);
  const minCenterY = Math.min(...ys);
  const maxCenterY = Math.max(...ys);

  return {
    frameCount: frames.length,
    startTime: frames[0].time,
    endTime: frames[frames.length - 1].time,
    minCenterX,
    maxCenterX,
    centerXRange: maxCenterX - minCenterX,
    minCenterY,
    maxCenterY,
    centerYRange: maxCenterY - minCenterY,
  };
}

/**
 * duration/fpsからフレーム列を生成する。
 * durationまたはfpsが有限かつ0より大きくない場合は空配列を返す。
 */
export function buildMotionAnalysisFrames(
  duration: number,
  fps: number
): MotionAnalysisFrame[] {
  if (!Number.isFinite(duration) || duration <= 0) return [];
  if (!Number.isFinite(fps) || fps <= 0) return [];

  const maxFrames = Math.min(Math.ceil(duration * fps), 300);

  return Array.from({ length: maxFrames }, (_, i) => ({
    frameIndex: i,
    time: i / fps,
  }));
}

export async function analyzeBodyAxisMotion(
  video?: HTMLVideoElement,
  fps = 60
): Promise<MotionAnalysisResult> {
  const duration =
    video && Number.isFinite(video.duration) && video.duration > 0
      ? video.duration
      : 0;

  const frames = buildMotionAnalysisFrames(duration, fps);

  return {
    message:
      "現在の構成では、詳細な軸ブレ解析は人物トラッキング結果から行います。",
    frames,
    trunkAngleRange: null,
    trunkAngleMin: null,
    trunkAngleMax: null,
    shoulderXRange: null,
    hipXRange: null,
  };
}