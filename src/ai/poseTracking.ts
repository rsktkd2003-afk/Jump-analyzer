import { getPoseLandmarker } from "./poseLandmarkerClient";
import { createTrackedFrame } from "./poseFrameFactory";
import { waitSeeked } from "./poseMath";
import { selectPoseByPoint } from "./poseSelection";
import type {
  MotionTrackingResult,
  TrackedFrame,
  TrackedLandmark,
} from "./poseTypes";

const MAX_CENTER_JUMP_PX = 120;

function removeCenterOutliers(frames: TrackedFrame[]): TrackedFrame[] {
  const filteredFrames: TrackedFrame[] = [];

  for (const current of frames) {
    if (filteredFrames.length === 0) {
      filteredFrames.push(current);
      continue;
    }

    const previous = filteredFrames[filteredFrames.length - 1];

    const distance = Math.hypot(
      current.centerX - previous.centerX,
      current.centerY - previous.centerY
    );

    if (distance < MAX_CENTER_JUMP_PX) {
      filteredFrames.push(current);
    }
  }

  return filteredFrames;
}

export async function analyzeTrackedMotion(
  video: HTMLVideoElement,
  fps: number,
  onProgress?: (progress: number) => void,
  selectedPoint?: { x: number; y: number } | null
): Promise<MotionTrackingResult> {
  const landmarker = await getPoseLandmarker();

  const originalTime = video.currentTime;
  const duration = video.duration;

  const frames: TrackedFrame[] = [];
  let checkedFrameCount = 0;
  let detectedFrameCount = 0;

  for (let time = 0; time <= duration; time += 1 / fps) {
    video.currentTime = Math.min(time, duration);
    await waitSeeked(video);

    const result = landmarker.detectForVideo(video, performance.now());
    checkedFrameCount += 1;

    const poses: TrackedLandmark[][] = result.landmarks.map((pose) =>
      pose.map((point) => ({
        x: point.x * video.videoWidth,
        y: point.y * video.videoHeight,
        z: point.z,
        visibility: point.visibility,
      }))
    );

    const pose = selectPoseByPoint(poses, selectedPoint);

    if (pose) {
      const frame = createTrackedFrame(
        pose,
        Math.round(time * fps),
        time,
        video.videoWidth,
        video.videoHeight
      );

      if (frame) {
        frames.push(frame);
        detectedFrameCount += 1;
      }
    }

    if (duration > 0) {
      onProgress?.(Math.min(100, Math.round((time / duration) * 100)));
    }
  }

  video.currentTime = originalTime;
  await waitSeeked(video);

  const filteredFrames = removeCenterOutliers(frames);

  const confidence =
    checkedFrameCount === 0
      ? 0
      : Math.round((detectedFrameCount / checkedFrameCount) * 100);

  return {
    frames: filteredFrames,
    detectedFrameCount,
    checkedFrameCount,
    confidence,
    message:
      filteredFrames.length > 0
        ? `トラッキング完了：${filteredFrames.length}フレーム / 検出率 ${confidence}%`
        : "人体を検出できませんでした。",
  };
}