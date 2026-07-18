import { beforeEach, describe, expect, it, vi } from "vitest";

import type { TrackedLandmark } from "./poseTypes";

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

function videoStub(
  overrides: Partial<
    Pick<
      HTMLVideoElement,
      "currentTime" | "duration" | "videoWidth" | "videoHeight"
    >
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

function useDetections(...landmarksByFrame: TrackedLandmark[][][]) {
  const detectForVideo = vi.fn();

  for (const landmarks of landmarksByFrame) {
    detectForVideo.mockReturnValueOnce({ landmarks });
  }

  mocks.getPoseLandmarker.mockResolvedValue({ detectForVideo });
  return detectForVideo;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.seekVideo.mockImplementation(
    async (video: HTMLVideoElement, time: number) => {
      video.currentTime = time;
    }
  );
});

describe("poseTracking: 入力ガード", () => {
  it.each([0, -10, NaN, Infinity, -Infinity])(
    "fpsが%sの場合はモデル取得・seek・進捗通知を行わず、時刻を維持したまま計測不能を返す",
    async (fps) => {
      const video = videoStub();
      const originalTime = video.currentTime;
      const progress = vi.fn();

      const result = await analyzeTrackedMotion(video, fps, progress, null, {
        smoothing: { enabled: false },
      });

      expect(mocks.getPoseLandmarker).not.toHaveBeenCalled();
      expect(mocks.seekVideo).not.toHaveBeenCalled();
      expect(progress).not.toHaveBeenCalled();
      expect(video.currentTime).toBe(originalTime);
      expect(result).toEqual({
        frames: [],
        detectedFrameCount: 0,
        checkedFrameCount: 0,
        confidence: 0,
        message: "FPSは0より大きい有限値を指定してください。",
      });
    }
  );

  it.each([-1, NaN, Infinity, -Infinity])(
    "video.durationが%sの場合はモデル取得・seek・進捗通知を行わず、時刻を維持したまま計測不能を返す",
    async (duration) => {
      const video = videoStub({ duration });
      const originalTime = video.currentTime;
      const progress = vi.fn();

      const result = await analyzeTrackedMotion(video, 10, progress, null, {
        smoothing: { enabled: false },
      });

      expect(mocks.getPoseLandmarker).not.toHaveBeenCalled();
      expect(mocks.seekVideo).not.toHaveBeenCalled();
      expect(progress).not.toHaveBeenCalled();
      expect(video.currentTime).toBe(originalTime);
      expect(result).toEqual({
        frames: [],
        detectedFrameCount: 0,
        checkedFrameCount: 0,
        confidence: 0,
        message: "動画時間を取得できませんでした。",
      });
    }
  );

  it("duration=0は既存どおり有効な値として扱う", async () => {
    useDetections([normalizedPose(0.2, 0.4)]);

    const result = await analyzeTrackedMotion(
      videoStub({ duration: 0 }),
      10,
      undefined,
      null,
      { smoothing: { enabled: false } }
    );

    expect(mocks.getPoseLandmarker).toHaveBeenCalledTimes(1);
    expect(result.checkedFrameCount).toBe(1);
  });
});

describe("poseTracking: 動画全体の追跡", () => {
  it("全フレームを検出し、進捗・検出率・元時刻を正しく返す", async () => {
    const pose = normalizedPose(0.2, 0.4);
    const detectForVideo = useDetections([pose], [pose]);
    const video = videoStub();
    const progress: number[] = [];

    const result = await analyzeTrackedMotion(
      video,
      10,
      (value) => progress.push(value),
      null,
      { smoothing: { enabled: false } }
    );

    expect(detectForVideo).toHaveBeenCalledTimes(2);
    expect(result.frames).toHaveLength(2);
    expect(result.frames.map((frame) => frame.frameIndex)).toEqual([0, 1]);
    expect(result.detectedFrameCount).toBe(2);
    expect(result.checkedFrameCount).toBe(2);
    expect(result.confidence).toBe(100);
    expect(result.message).toBe(
      "トラッキング完了：2フレーム / 検出率 100% / 平滑化 OFF"
    );
    expect(progress).toEqual([0, 100]);
    expect(video.currentTime).toBe(0.04);
    expect(mocks.seekVideo).toHaveBeenLastCalledWith(video, 0.04);
  });

  it("選択座標に近い人物を複数人物の中から追跡する", async () => {
    const left = normalizedPose(0.2, 0.4);
    const right = normalizedPose(0.8, 0.4);
    useDetections([left, right], [left, right]);

    const result = await analyzeTrackedMotion(
      videoStub(),
      10,
      undefined,
      { x: 805, y: 200 },
      { smoothing: { enabled: false } }
    );

    expect(result.frames).toHaveLength(2);
    expect(result.frames[0].centerX).toBeCloseTo(800);
    expect(result.frames[0].centerY).toBeCloseTo(200);
  });

  it("一部のフレームだけ検出できた場合も検出数と検出率を保持する", async () => {
    useDetections([normalizedPose(0.2, 0.4)], []);

    const result = await analyzeTrackedMotion(
      videoStub(),
      10,
      undefined,
      null,
      { smoothing: { enabled: false } }
    );

    expect(result.frames).toHaveLength(1);
    expect(result.detectedFrameCount).toBe(1);
    expect(result.checkedFrameCount).toBe(2);
    expect(result.confidence).toBe(50);
    expect(result.message).toBe(
      "トラッキング完了：1フレーム / 検出率 50% / 平滑化 OFF"
    );
  });

  it("人体を一度も検出できない場合は専用メッセージを返す", async () => {
    useDetections([], []);

    const result = await analyzeTrackedMotion(
      videoStub(),
      10,
      undefined,
      null,
      { smoothing: { enabled: false } }
    );

    expect(result.frames).toEqual([]);
    expect(result.detectedFrameCount).toBe(0);
    expect(result.checkedFrameCount).toBe(2);
    expect(result.confidence).toBe(0);
    expect(result.message).toBe("人体を検出できませんでした。");
  });

  it("durationが0の場合は先頭フレームだけ確認し、進捗を通知しない", async () => {
    useDetections([normalizedPose(0.2, 0.4)]);
    const progress = vi.fn();

    const result = await analyzeTrackedMotion(
      videoStub({ duration: 0 }),
      10,
      progress,
      null,
      { smoothing: { enabled: false } }
    );

    expect(result.checkedFrameCount).toBe(1);
    expect(result.detectedFrameCount).toBe(1);
    expect(result.frames).toHaveLength(1);
    expect(progress).not.toHaveBeenCalled();
  });

  it("中心移動が120pxなら除外し、120px未満なら維持する", async () => {
    useDetections(
      [normalizedPose(0.1, 0.4)],
      [normalizedPose(0.22, 0.4)]
    );

    const atThreshold = await analyzeTrackedMotion(
      videoStub(),
      10,
      undefined,
      null,
      { smoothing: { enabled: false } }
    );

    expect(atThreshold.frames).toHaveLength(1);

    useDetections(
      [normalizedPose(0.1, 0.4)],
      [normalizedPose(0.219, 0.4)]
    );

    const belowThreshold = await analyzeTrackedMotion(
      videoStub(),
      10,
      undefined,
      null,
      { smoothing: { enabled: false } }
    );

    expect(belowThreshold.frames).toHaveLength(2);
  });

  it("除外前の検出数と検出率は中心外れ値があっても保持する", async () => {
    useDetections(
      [normalizedPose(0.1, 0.4)],
      [normalizedPose(0.3, 0.4)]
    );

    const result = await analyzeTrackedMotion(
      videoStub(),
      10,
      undefined,
      null,
      { smoothing: { enabled: false } }
    );

    expect(result.detectedFrameCount).toBe(2);
    expect(result.confidence).toBe(100);
    expect(result.frames).toHaveLength(1);
    expect(result.message).toBe(
      "トラッキング完了：1フレーム / 検出率 100% / 平滑化 OFF"
    );
  });

  it("指定がなければ平滑化ONで、急ではない座標変化を元座標側へ制限付き補正する", async () => {
    useDetections(
      [normalizedPose(0.2, 0.4)],
      [normalizedPose(0.21, 0.4)]
    );

    const result = await analyzeTrackedMotion(videoStub(), 10);

    expect(result.frames).toHaveLength(2);
    expect(result.frames[0].centerX).toBeCloseTo(200);
    expect(result.frames[1].centerX).toBeGreaterThan(200);
    expect(result.frames[1].centerX).toBeLessThan(210);
    expect(result.message).toBe(
      "トラッキング完了：2フレーム / 検出率 100% / 平滑化 ON"
    );
  });

  it("visibilityが0.35の不可視点はKalman平滑化せず元座標を維持する", async () => {
    const first = normalizedPose(0.2, 0.4);
    const second = normalizedPose(0.21, 0.4);
    first[0] = { ...first[0], x: 0.05, visibility: 0.35 };
    second[0] = { ...second[0], x: 0.95, visibility: 0.35 };
    useDetections([first], [second]);

    const result = await analyzeTrackedMotion(videoStub(), 10);

    expect(result.frames).toHaveLength(2);
    expect(result.frames[1].landmarks[0].x).toBe(950);
    expect(result.frames[1].landmarks[1].x).toBeGreaterThan(200);
    expect(result.frames[1].landmarks[1].x).toBeLessThan(210);
  });

  it("平滑化による元座標からの補正量を最大8pxに制限する", async () => {
    useDetections(
      [normalizedPose(0.2, 0.4)],
      [normalizedPose(0.3, 0.4)]
    );

    const result = await analyzeTrackedMotion(videoStub(), 10);

    expect(result.frames).toHaveLength(2);
    expect(result.frames[1].centerX).toBeCloseTo(292);
  });

  it.each([
    ["直前", 7.999, 7.999],
    ["一致", 8, 8],
    ["直後", 8.001, 8],
  ])(
    "平滑化オフセット上限8pxの%sでは補正量を%spxにする",
    async (_, unboundedOffset, expectedOffset) => {
      // 2フレーム目のKalman+blendによる未クランプ補正量は移動量の31.5%。
      const movementPx = unboundedOffset / 0.315;
      const secondCenterPx = 200 + movementPx;
      useDetections(
        [normalizedPose(0.2, 0.4)],
        [normalizedPose(secondCenterPx / 1000, 0.4)]
      );

      const result = await analyzeTrackedMotion(videoStub(), 10);

      expect(result.frames).toHaveLength(2);
      expect(result.frames[1].centerX).toBeCloseTo(
        secondCenterPx - expectedOffset,
        6
      );
    }
  );
});
