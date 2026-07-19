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

import { analyzeTrackedMotion } from "./poseTracking";

function normalizedPose(centerX: number, centerY: number): TrackedLandmark[] {
  return Array.from({ length: 33 }, (_, index) => ({
    x: centerX + ((index % 3) - 1) * 0.01,
    y: centerY + (((Math.floor(index / 3) % 3) - 1) * 0.01),
    visibility: 1,
  }));
}

/** 2D版distinctPoseと同じ構造の、左右を明確に区別できる3D姿勢（メートル単位） */
function distinctWorldPose(offsetX = 0): PoseWorldLandmark[] {
  const landmarks: PoseWorldLandmark[] = Array.from({ length: 33 }, () => ({
    x: offsetX,
    y: 0,
    z: 0,
    visibility: 1,
  }));
  const set = (index: number, dx: number, dy: number) => {
    landmarks[index] = { x: offsetX + dx, y: dy, z: 0, visibility: 1 };
  };
  set(11, -0.175, 0.25); // left shoulder
  set(12, 0.175, 0.25); // right shoulder
  set(13, -0.22, 0.1); // left elbow
  set(14, 0.22, 0.1); // right elbow
  set(15, -0.25, -0.05); // left wrist
  set(16, 0.25, -0.05); // right wrist
  set(23, -0.1, -0.25); // left hip
  set(24, 0.1, -0.25); // right hip
  set(25, -0.1, -0.6); // left knee
  set(26, 0.1, -0.6); // right knee
  set(27, -0.12, -0.95); // left ankle
  set(28, 0.12, -0.95); // right ankle
  return landmarks;
}

function distinctPose(centerX: number, centerY: number): TrackedLandmark[] {
  const landmarks = normalizedPose(centerX, centerY);
  const set = (index: number, dx: number, dy: number) => {
    landmarks[index] = { x: centerX + dx, y: centerY + dy, visibility: 1 };
  };
  set(11, -0.03, -0.05);
  set(12, 0.03, -0.05);
  set(13, -0.04, -0.02);
  set(14, 0.04, -0.02);
  set(15, -0.045, 0.02);
  set(16, 0.045, 0.02);
  set(23, -0.02, 0.05);
  set(24, 0.02, 0.05);
  set(25, -0.02, 0.12);
  set(26, 0.02, 0.12);
  set(27, -0.024, 0.18);
  set(28, 0.024, 0.18);
  return landmarks;
}

const LATERAL_PAIRS: Array<[number, number]> = [
  [11, 12],
  [13, 14],
  [15, 16],
  [23, 24],
  [25, 26],
  [27, 28],
];

function swapLeftRight2D(landmarks: TrackedLandmark[]): TrackedLandmark[] {
  const result = [...landmarks];
  for (const [l, r] of LATERAL_PAIRS) {
    result[l] = landmarks[r];
    result[r] = landmarks[l];
  }
  return result;
}

function swapLeftRight3D(landmarks: PoseWorldLandmark[]): PoseWorldLandmark[] {
  const result = [...landmarks];
  for (const [l, r] of LATERAL_PAIRS) {
    result[l] = landmarks[r];
    result[r] = landmarks[l];
  }
  return result;
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

describe("poseTracking: 2D/3D person-index同期", () => {
  it("複数人物からトラッカー/選択が選んだ2Dと同じ人物インデックスの3Dデータが付与される", async () => {
    const leftPerson2D = normalizedPose(0.2, 0.4);
    const rightPerson2D = normalizedPose(0.8, 0.4);
    const leftPerson3D = distinctWorldPose(-0.5);
    const rightPerson3D = distinctWorldPose(0.5);

    useDetectionsWithWorld({
      landmarks: [leftPerson2D, rightPerson2D],
      worldLandmarks: [leftPerson3D, rightPerson3D],
    });

    const result = await analyzeTrackedMotion(
      videoStub({ duration: 0 }),
      10,
      undefined,
      { x: 805, y: 200 }, // 右側の人物に近いクリック位置
      { smoothing: { enabled: false } }
    );

    expect(result.frames).toHaveLength(1);
    expect(result.frames[0].centerX).toBeCloseTo(800);
    // 右側の人物(rightPerson3D, offsetX=0.5)のleft shoulder(index11)はoffsetX-0.175=0.325付近のはず
    expect(result.frames[0].worldLandmarks3D?.[11].x).toBeCloseTo(0.325, 1);
    // 左側の人物(offsetX=-0.5)の値(-0.675付近)ではないことを確認
    expect(result.frames[0].worldLandmarks3D?.[11].x).not.toBeCloseTo(-0.675, 1);
  });
});

describe("poseTracking: 左右補正の3D同期", () => {
  it("2D側で左右入れ替わりが検出・補正されたフレームでは、3D側も同じ左右対を入れ替える", async () => {
    const physical2D_0 = distinctPose(0.5, 0.4);
    const physical2D_1 = distinctPose(0.51, 0.41);
    const physical3D_0 = distinctWorldPose(0);
    const physical3D_1 = distinctWorldPose(0.01);

    // MediaPipeが2フレーム目だけ2D・3Dともに左右を取り違えたことを模す
    const mislabeled2D_1 = swapLeftRight2D(physical2D_1);
    const mislabeled3D_1 = swapLeftRight3D(physical3D_1);

    useDetectionsWithWorld(
      { landmarks: [physical2D_0], worldLandmarks: [physical3D_0] },
      { landmarks: [mislabeled2D_1], worldLandmarks: [mislabeled3D_1] }
    );

    const result = await analyzeTrackedMotion(videoStub(), 10, undefined, null, {
      smoothing: { enabled: false },
    });

    expect(result.frames).toHaveLength(2);
    expect(result.frames[1].lateralityCorrection?.corrected).toBe(true);
    // 2D側: 左肩(11)が右肩(12)より画面左側にあること
    expect(result.frames[1].landmarks[11].x).toBeLessThan(result.frames[1].landmarks[12].x);
    // 3D側: 左肩(11)のxが右肩(12)のxより小さいこと（同じ左右対応が保たれている）
    const leftShoulder3D = result.frames[1].worldLandmarks3D?.[11].x ?? 0;
    const rightShoulder3D = result.frames[1].worldLandmarks3D?.[12].x ?? 0;
    expect(leftShoulder3D).toBeLessThan(rightShoulder3D);
  });
});

describe("poseTracking: worldLandmarks欠損時の2Dフォールバック", () => {
  it("検出結果にworldLandmarksが含まれない場合でも2D解析は通常どおり行われる", async () => {
    const pose2D = normalizedPose(0.2, 0.4);

    useDetectionsWithWorld({ landmarks: [pose2D], worldLandmarks: undefined });

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
    expect(result.frames[0].landmarks).toHaveLength(33);
    expect(result.frames[0].centerX).toBeCloseTo(200);
  });

  it("選ばれた人物インデックスに対応するworldLandmarksの要素だけが欠けている場合も2D解析に影響しない", async () => {
    const pose2D = normalizedPose(0.2, 0.4);

    // landmarksは1人分あるが、worldLandmarksは空配列（対応インデックスなし）
    useDetectionsWithWorld({ landmarks: [pose2D], worldLandmarks: [] });

    const result = await analyzeTrackedMotion(
      videoStub({ duration: 0 }),
      10,
      undefined,
      null,
      { smoothing: { enabled: false } }
    );

    expect(result.frames).toHaveLength(1);
    expect(result.frames[0].worldLandmarks3D).toBeUndefined();
    expect(result.frames[0].landmarks).toHaveLength(33);
  });
});

describe("poseTracking: pose3DQuality", () => {
  it("有効な3Dデータがあるフレームのみの場合、pose3DQualityが返り、availableFrameRatioは1になる", async () => {
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

    expect(result.pose3DQuality).toBeDefined();
    expect(result.pose3DQuality?.availableFrameRatio).toBe(1);
  });
});
