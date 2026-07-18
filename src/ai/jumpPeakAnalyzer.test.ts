import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PoseLandmarkerResult } from "@mediapipe/tasks-vision";
import type { TrackedLandmark } from "./poseTypes";

const mocks = vi.hoisted(() => ({
  getPoseLandmarker: vi.fn(),
  seekVideo: vi.fn(),
}));

vi.mock("./poseLandmarkerClient", () => ({
  getPoseLandmarker: mocks.getPoseLandmarker,
}));

vi.mock("./poseVideo", async (importOriginal) => {
  const original = await importOriginal<typeof import("./poseVideo")>();

  return {
    ...original,
    seekVideo: mocks.seekVideo,
  };
});

import {
  analyzeJumpForm,
  analyzeJumpFormAtPeak,
  analyzeJumpPeakFrame,
  detectPosePointsAtCurrentFrame,
} from "./jumpPeakAnalyzer";

function videoStub(
  overrides: Partial<
    Pick<
      HTMLVideoElement,
      "currentTime" | "duration" | "videoWidth" | "videoHeight"
    >
  > = {}
): HTMLVideoElement {
  return {
    currentTime: 0.15,
    duration: 0.4,
    videoWidth: 1000,
    videoHeight: 500,
    ...overrides,
  } as HTMLVideoElement;
}

function poseResult(
  landmarks: TrackedLandmark[] | null
): PoseLandmarkerResult {
  return {
    landmarks: landmarks ? [landmarks] : [],
  } as unknown as PoseLandmarkerResult;
}

function heightPose(wristY: number, hipY: number): TrackedLandmark[] {
  const landmarks: TrackedLandmark[] = Array.from({ length: 33 }, () => ({
    x: 0.5,
    y: 0.5,
    visibility: 1,
  }));

  landmarks[15] = { x: 0.4, y: wristY, visibility: 1 };
  landmarks[16] = { x: 0.6, y: wristY, visibility: 1 };
  landmarks[23] = { x: 0.4, y: hipY, visibility: 1 };
  landmarks[24] = { x: 0.6, y: hipY, visibility: 1 };

  return landmarks;
}

function formPose(): TrackedLandmark[] {
  const landmarks = heightPose(0.25, 0.6);

  landmarks[11] = { x: 0.4, y: 0.4, visibility: 1 };
  landmarks[12] = { x: 0.6, y: 0.4, visibility: 1 };
  landmarks[13] = { x: 0.4, y: 0.3, visibility: 1 };
  landmarks[14] = { x: 0.6, y: 0.5, visibility: 1 };
  landmarks[23] = { x: 0.4, y: 0.6, visibility: 1 };
  landmarks[24] = { x: 0.6, y: 0.6, visibility: 1 };
  landmarks[25] = { x: 0.4, y: 0.7, visibility: 1 };
  landmarks[26] = { x: 0.6, y: 0.7, visibility: 1 };
  // 左膝は90度、右膝は180度にして「左右の大きい方」を固定する。
  landmarks[27] = { x: 0.5, y: 0.7, visibility: 1 };
  landmarks[28] = { x: 0.6, y: 0.8, visibility: 1 };

  return landmarks;
}

function useResults(...results: PoseLandmarkerResult[]) {
  const detectForVideo = vi.fn();

  for (const result of results) {
    detectForVideo.mockReturnValueOnce(result);
  }

  mocks.getPoseLandmarker.mockResolvedValue({ detectForVideo });
  return detectForVideo;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getPoseLandmarker.mockResolvedValue({ detectForVideo: vi.fn() });
  mocks.seekVideo.mockImplementation(
    async (video: HTMLVideoElement, time: number) => {
      video.currentTime = time;
    }
  );
});

describe("jumpPeakAnalyzer: 入力ガード", () => {
  it.each([0, -10, NaN, Infinity, -Infinity])(
    "analyzeJumpPeakFrame: fpsが%sの場合はモデル取得・seek・detectを行わない",
    async (fps) => {
      const detectForVideo = vi.fn();
      mocks.getPoseLandmarker.mockResolvedValue({ detectForVideo });
      const video = videoStub();

      const result = await analyzeJumpPeakFrame(video, fps);

      expect(mocks.getPoseLandmarker).not.toHaveBeenCalled();
      expect(mocks.seekVideo).not.toHaveBeenCalled();
      expect(detectForVideo).not.toHaveBeenCalled();
      expect(video.currentTime).toBe(0.15);
      expect(result).toEqual({
        bestFrame: null,
        bestTime: null,
        confidence: 0,
        message: "FPSは0より大きい有限値を指定してください。",
      });
    }
  );

  it.each([0, -10, NaN, Infinity, -Infinity])(
    "analyzeJumpFormAtPeak: fpsが%sの場合も同じガード結果を返す",
    async (fps) => {
      const detectForVideo = vi.fn();
      mocks.getPoseLandmarker.mockResolvedValue({ detectForVideo });
      const video = videoStub();

      const result = await analyzeJumpFormAtPeak(video, fps);

      expect(mocks.getPoseLandmarker).not.toHaveBeenCalled();
      expect(mocks.seekVideo).not.toHaveBeenCalled();
      expect(detectForVideo).not.toHaveBeenCalled();
      expect(result).toEqual({
        frame: null,
        time: null,
        confidence: 0,
        message: "FPSは0より大きい有限値を指定してください。",
        form: null,
      });
    }
  );

  it("analyzeJumpFormAtPeak: duration不正時もモデルを取得しない", async () => {
    const detectForVideo = vi.fn();
    mocks.getPoseLandmarker.mockResolvedValue({ detectForVideo });

    const result = await analyzeJumpFormAtPeak(videoStub({ duration: 0 }), 10);

    expect(mocks.getPoseLandmarker).not.toHaveBeenCalled();
    expect(mocks.seekVideo).not.toHaveBeenCalled();
    expect(result).toEqual({
      frame: null,
      time: null,
      confidence: 0,
      message: "動画の長さを取得できませんでした。",
      form: null,
    });
  });

  it("analyzeJumpFormAtPeak: 正常系ではモデルを1回だけ取得する（探索とフォーム検出で共有）", async () => {
    useResults(
      poseResult(heightPose(0.4, 0.6)),
      poseResult(heightPose(0.2, 0.4)),
      poseResult(formPose())
    );

    await analyzeJumpFormAtPeak(videoStub({ duration: 0.2 }), 10);

    expect(mocks.getPoseLandmarker).toHaveBeenCalledTimes(1);
  });

  it("detectForVideoが例外を投げても動画時刻を元へ戻してから再スローする", async () => {
    const detectForVideo = vi.fn(() => {
      throw new Error("boom");
    });
    mocks.getPoseLandmarker.mockResolvedValue({ detectForVideo });
    const video = videoStub({ duration: 0.2 });

    await expect(analyzeJumpPeakFrame(video, 10)).rejects.toThrow("boom");

    expect(video.currentTime).toBe(0.15);
  });
});

describe("jumpPeakAnalyzer: フォーム評価テキスト", () => {
  it("肘と腰が肩より下の場合は正の差分を表示する", () => {
    const result = analyzeJumpForm({
      shoulderY: 0.4,
      elbowY: 0.55,
      hipY: 0.7,
      kneeAngle: 123.45,
    });

    expect(result.elbowText).toBe(
      "肘の位置は肩より下にあります。差分：約 0.150"
    );
    expect(result.postureText).toBe(
      "腰の位置は肩より下にあります。差分：約 0.300"
    );
    expect(result.kneeText).toBe("膝角度：約 123.5°");
    expect(result.summary).toBe(
      [
        "最高点候補フレームにおける骨格情報です。",
        "肘-肩の高さ差：0.150",
        "腰-肩の高さ差：0.300",
        "膝角度：123.5°",
      ].join("\n")
    );
  });

  it("肘と腰が肩より上の場合は表示用差分を絶対値にする", () => {
    const result = analyzeJumpForm({
      shoulderY: 0.6,
      elbowY: 0.4,
      hipY: 0.3,
      kneeAngle: 90,
    });

    expect(result.elbowText).toBe(
      "肘の位置は肩より上にあります。差分：約 0.200"
    );
    expect(result.postureText).toBe(
      "腰の位置は肩より上にあります。差分：約 0.300"
    );
    expect(result.summary).toContain("肘-肩の高さ差：-0.200");
    expect(result.summary).toContain("腰-肩の高さ差：-0.300");
  });

  it("肩と同じ高さの場合は専用テキストを返す", () => {
    const result = analyzeJumpForm({
      shoulderY: 0.5,
      elbowY: 0.5,
      hipY: 0.5,
      kneeAngle: 180,
    });

    expect(result.elbowText).toBe("肘の位置は肩とほぼ同じ高さです。");
    expect(result.postureText).toBe("腰の位置は肩とほぼ同じ高さです。");
    expect(result.summary).toContain("肘-肩の高さ差：0.000");
    expect(result.summary).toContain("腰-肩の高さ差：0.000");
  });
});

describe("jumpPeakAnalyzer: 最高点候補の探索", () => {
  it("手首75%・腰25%の高さスコアが最小のフレームを2フレーム間隔で選ぶ", async () => {
    const detectForVideo = useResults(
      poseResult(heightPose(0.4, 0.6)),
      poseResult(heightPose(0.2, 0.4)),
      poseResult(heightPose(0.3, 0.5))
    );
    const video = videoStub();

    const result = await analyzeJumpPeakFrame(video, 10);

    expect(mocks.seekVideo.mock.calls.map((call) => call[1])).toEqual([
      0, 0.2, 0.4,
    ]);
    expect(detectForVideo).toHaveBeenCalledTimes(3);
    expect(result).toEqual({
      bestFrame: 2,
      bestTime: 0.2,
      confidence: 100,
      message: "最高点候補：2F / 0.200秒 / 検出率 100%",
    });
    expect(video.currentTime).toBe(0.15);
  });

  it("左右の手首は高い側（Yが小さい側）を高さスコアに使う", async () => {
    const asymmetricWrists = heightPose(0.9, 0.5);
    asymmetricWrists[15] = { x: 0.4, y: 0.1, visibility: 1 };
    asymmetricWrists[16] = { x: 0.6, y: 0.9, visibility: 1 };
    useResults(
      poseResult(asymmetricWrists),
      poseResult(heightPose(0.3, 0.3))
    );

    const result = await analyzeJumpPeakFrame(
      videoStub({ duration: 0.2 }),
      10
    );

    expect(result.bestTime).toBe(0);
  });

  it("左右の腰は平均Yを高さスコアに使う", async () => {
    const asymmetricHips = heightPose(0.2, 0.9);
    asymmetricHips[23] = { x: 0.4, y: 0.1, visibility: 1 };
    asymmetricHips[24] = { x: 0.6, y: 0.9, visibility: 1 };
    useResults(
      poseResult(asymmetricHips),
      poseResult(heightPose(0.2, 0.4))
    );

    const result = await analyzeJumpPeakFrame(
      videoStub({ duration: 0.2 }),
      10
    );

    expect(result.bestTime).toBe(0.2);
  });

  it("手首75%・腰25%の重みで高さスコアを比較する", async () => {
    useResults(
      poseResult(heightPose(0.1, 0.9)),
      poseResult(heightPose(0.35, 0.2))
    );

    const result = await analyzeJumpPeakFrame(
      videoStub({ duration: 0.2 }),
      10
    );

    // 0F: 0.1*0.75 + 0.9*0.25 = 0.300
    // 2F: 0.35*0.75 + 0.2*0.25 = 0.3125
    expect(result.bestTime).toBe(0);
  });

  it("高さスコアが同じ場合は先に検出したフレームを維持する", async () => {
    useResults(
      poseResult(heightPose(0.2, 0.4)),
      poseResult(heightPose(0.2, 0.4))
    );

    const result = await analyzeJumpPeakFrame(
      videoStub({ duration: 0.2 }),
      10
    );

    expect(result.bestFrame).toBe(0);
    expect(result.bestTime).toBe(0);
  });

  it("一部フレームだけ検出した場合は検出数/確認数を四捨五入した検出率にする", async () => {
    useResults(
      poseResult(heightPose(0.4, 0.6)),
      poseResult(null),
      poseResult(null)
    );

    const result = await analyzeJumpPeakFrame(videoStub(), 10);

    expect(result.bestFrame).toBe(0);
    expect(result.confidence).toBe(33);
    expect(result.message).toBe("最高点候補：0F / 0.000秒 / 検出率 33%");
  });

  it("人物または必要な手首・腰を検出できない場合は計測不能", async () => {
    const missingHip = heightPose(0.3, 0.5).slice(0, 20);
    useResults(poseResult(null), poseResult(missingHip));

    const result = await analyzeJumpPeakFrame(
      videoStub({ duration: 0.2 }),
      10
    );

    expect(result).toEqual({
      bestFrame: null,
      bestTime: null,
      confidence: 0,
      message: "人体を検出できませんでした。",
    });
  });

  it.each([0, 0.1, -1, NaN, Infinity, -Infinity])(
    "durationが%sの場合は動画時間を取得できない結果を返す",
    async (duration) => {
      const result = await analyzeJumpPeakFrame(videoStub({ duration }), 10);

      expect(result).toEqual({
        bestFrame: null,
        bestTime: null,
        confidence: 0,
        message: "動画の長さを取得できませんでした。",
      });
      expect(mocks.seekVideo).not.toHaveBeenCalled();
      expect(mocks.getPoseLandmarker).not.toHaveBeenCalled();
    }
  );

  it("durationが0.1秒を超える場合は探索を開始する", async () => {
    useResults(poseResult(heightPose(0.2, 0.4)));

    const result = await analyzeJumpPeakFrame(
      videoStub({ duration: 0.100001 }),
      10
    );

    expect(result.bestFrame).toBe(0);
    expect(result.confidence).toBe(100);
  });
});

describe("jumpPeakAnalyzer: 最高点フォーム解析", () => {
  it("最高点を再検出し、必要関節からフォーム結果を生成する", async () => {
    useResults(
      poseResult(heightPose(0.4, 0.6)),
      poseResult(heightPose(0.2, 0.4)),
      poseResult(formPose())
    );
    const video = videoStub({ duration: 0.2 });

    const result = await analyzeJumpFormAtPeak(video, 10);

    expect(result.frame).toBe(2);
    expect(result.time).toBe(0.2);
    expect(result.confidence).toBe(100);
    expect(result.message).toBe("フォーム解析完了：2F / 0.200秒");
    expect(result.form?.elbowText).toBe(
      "肘の位置は肩より上にあります。差分：約 0.100"
    );
    expect(result.form?.postureText).toBe(
      "腰の位置は肩より下にあります。差分：約 0.200"
    );
    expect(result.form?.kneeText).toBe("膝角度：約 180.0°");
    expect(video.currentTime).toBe(0.15);
  });

  it("最高点を検出できない場合はピーク失敗結果をそのまま返す", async () => {
    useResults(poseResult(null), poseResult(null));

    const result = await analyzeJumpFormAtPeak(
      videoStub({ duration: 0.2 }),
      10
    );

    expect(result).toEqual({
      frame: null,
      time: null,
      confidence: 0,
      message: "人体を検出できませんでした。",
      form: null,
    });
  });

  it("最高点は見つかっても必要関節が欠ける場合はフォームだけ計測不能", async () => {
    useResults(
      poseResult(heightPose(0.4, 0.6)),
      poseResult(heightPose(0.2, 0.4)),
      poseResult(heightPose(0.2, 0.4).slice(0, 20))
    );

    const result = await analyzeJumpFormAtPeak(
      videoStub({ duration: 0.2 }),
      10
    );

    expect(result.frame).toBe(2);
    expect(result.time).toBe(0.2);
    expect(result.confidence).toBe(100);
    expect(result.message).toBe(
      "最高点候補は見つかりましたが、フォーム解析に必要な骨格点を検出できませんでした。"
    );
    expect(result.form).toBeNull();
  });
});

describe("jumpPeakAnalyzer: 現在フレームの骨格点", () => {
  it("正規化座標を動画の画素座標へ変換し、visibilityに関係なく返す", async () => {
    useResults(
      poseResult([
        { x: 0.25, y: 0.4, visibility: 1 },
        { x: 0.75, y: 0.8, visibility: 0.1 },
      ])
    );

    const result = await detectPosePointsAtCurrentFrame(videoStub());

    expect(result).toEqual([
      { x: 250, y: 200 },
      { x: 750, y: 400 },
    ]);
  });

  it("人物を検出できない場合は空配列", async () => {
    useResults(poseResult(null));

    expect(await detectPosePointsAtCurrentFrame(videoStub())).toEqual([]);
  });
});
