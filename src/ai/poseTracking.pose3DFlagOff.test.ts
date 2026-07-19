import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PoseWorldLandmark, TrackedLandmark } from "./poseTypes";

const mocks = vi.hoisted(() => ({
  getPoseLandmarker: vi.fn(),
  seekVideo: vi.fn(),
}));

vi.mock("./poseLandmarkerClient", () => ({
  getPoseLandmarker: mocks.getPoseLandmarker,
}));

vi.mock("./poseVideo", () => ({
  seekVideo: mocks.seekVideo,
}));

// Phase2Aの3D関連Feature Flagだけをすべてfalseにする。
// Phase1のフラグ（ENABLE_LATERALITY_CORRECTION等）は実際の値をそのまま使う。
vi.mock("./featureFlags", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./featureFlags")>();
  return {
    ...actual,
    ENABLE_WORLD_LANDMARKS_3D: false,
    ENABLE_3D_SMOOTHING: false,
    ENABLE_3D_METRICS: false,
  };
});

import { analyzeTrackedMotion } from "./poseTracking";

function normalizedPose(centerX: number, centerY: number): TrackedLandmark[] {
  return Array.from({ length: 33 }, (_, index) => ({
    x: centerX + ((index % 3) - 1) * 0.01,
    y: centerY + (((Math.floor(index / 3) % 3) - 1) * 0.01),
    visibility: 1,
  }));
}

function distinctWorldPose(offsetX = 0): PoseWorldLandmark[] {
  const landmarks: PoseWorldLandmark[] = Array.from({ length: 33 }, () => ({
    x: offsetX,
    y: 0,
    z: 0,
    visibility: 1,
  }));
  landmarks[11] = { x: offsetX - 0.175, y: 0.25, z: 0, visibility: 1 };
  landmarks[12] = { x: offsetX + 0.175, y: 0.25, z: 0, visibility: 1 };
  landmarks[23] = { x: offsetX - 0.1, y: -0.25, z: 0, visibility: 1 };
  landmarks[24] = { x: offsetX + 0.1, y: -0.25, z: 0, visibility: 1 };
  return landmarks;
}

function videoStub(
  overrides: Partial<
    Pick<HTMLVideoElement, "currentTime" | "duration" | "videoWidth" | "videoHeight">
  > = {}
): HTMLVideoElement {
  return {
    currentTime: 0.04,
    duration: 0.1,
    videoWidth: 1000,
    videoHeight: 500,
    ...overrides,
  } as HTMLVideoElement;
}

function useDetectionsWithWorld(
  ...frames: Array<{ landmarks: TrackedLandmark[][]; worldLandmarks?: PoseWorldLandmark[][] }>
) {
  const detectForVideo = vi.fn();
  for (const frameData of frames) {
    detectForVideo.mockReturnValueOnce({
      landmarks: frameData.landmarks,
      worldLandmarks: frameData.worldLandmarks,
    });
  }
  mocks.getPoseLandmarker.mockResolvedValue({ detectForVideo });
  return detectForVideo;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.seekVideo.mockImplementation(async (video: HTMLVideoElement, time: number) => {
    video.currentTime = time;
  });
});

describe("poseTracking: ENABLE_WORLD_LANDMARKS_3D OFF時はPhase1と完全互換", () => {
  it("worldLandmarksが検出結果にあってもworldLandmarks3D/normalizedPose3D/pose3DQualityは一切付与されない", async () => {
    const pose2D = normalizedPose(0.2, 0.4);
    const pose3D = distinctWorldPose(0);

    useDetectionsWithWorld({ landmarks: [pose2D], worldLandmarks: [pose3D] });

    const result = await analyzeTrackedMotion(
      videoStub({ duration: 0 }),
      10,
      undefined,
      null,
      { smoothing: { enabled: false } }
    );

    expect(result.frames).toHaveLength(1);
    expect(result.frames[0].worldLandmarks3D).toBeUndefined();
    expect(result.frames[0].normalizedPose3D).toBeUndefined();
    expect(result.pose3DQuality).toBeUndefined();
    // 2D側の挙動はPhase1と同じまま
    expect(result.frames[0].centerX).toBeCloseTo(200);
    expect(result.frames[0].landmarks).toHaveLength(33);
  });

  it("複数フレームでも3D関連フィールドが一切生成されない", async () => {
    const pose0 = normalizedPose(0.2, 0.4);
    const pose1 = normalizedPose(0.21, 0.41);
    useDetectionsWithWorld(
      { landmarks: [pose0], worldLandmarks: [distinctWorldPose(0)] },
      { landmarks: [pose1], worldLandmarks: [distinctWorldPose(0.01)] }
    );

    const result = await analyzeTrackedMotion(videoStub(), 10, undefined, null, {
      smoothing: { enabled: false },
    });

    expect(result.frames).toHaveLength(2);
    for (const frame of result.frames) {
      expect(frame.worldLandmarks3D).toBeUndefined();
      expect(frame.normalizedPose3D).toBeUndefined();
    }
    expect(result.pose3DQuality).toBeUndefined();
  });
});
