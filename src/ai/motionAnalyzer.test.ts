import { describe, expect, it } from "vitest";
import type { TrackedFrame } from "./poseTypes";
import {
  analyzeBodyAxisMotion,
  buildMotionAnalysisFrames,
  summarizeMotion,
} from "./motionAnalyzer";

function frame(time: number, centerX: number, centerY: number): TrackedFrame {
  return {
    frameIndex: 0,
    time,
    landmarks: [],
    crop: { x: 0, y: 0, width: 0, height: 0 },
    centerX,
    centerY,
    leftKneeAngle: null,
    rightKneeAngle: null,
    hipAngle: null,
    shoulderTilt: null,
    leftHipAngle: null,
    rightHipAngle: null,
    leftElbowAngle: null,
    rightElbowAngle: null,
    leftShoulderAngle: null,
    rightShoulderAngle: null,
  };
}

function videoStub(duration: number): HTMLVideoElement {
  return { duration } as HTMLVideoElement;
}

const FIXED_MESSAGE =
  "現在の構成では、詳細な軸ブレ解析は人物トラッキング結果から行います。";

describe("summarizeMotion", () => {
  it("空配列の場合はframeCount0で他はnull", () => {
    const result = summarizeMotion([]);

    expect(result).toEqual({
      frameCount: 0,
      startTime: null,
      endTime: null,
      minCenterX: null,
      maxCenterX: null,
      centerXRange: null,
      minCenterY: null,
      maxCenterY: null,
      centerYRange: null,
    });
  });

  it("frame数と先頭・末尾の時刻を返す", () => {
    const frames = [frame(0.1, 10, 20), frame(0.5, 15, 25), frame(0.9, 12, 18)];

    const result = summarizeMotion(frames);

    expect(result.frameCount).toBe(3);
    expect(result.startTime).toBe(0.1);
    expect(result.endTime).toBe(0.9);
  });

  it("centerX/centerYのmin・max・rangeを計算する", () => {
    const frames = [frame(0, 10, 50), frame(0.1, 30, 20), frame(0.2, 5, 40)];

    const result = summarizeMotion(frames);

    expect(result.minCenterX).toBe(5);
    expect(result.maxCenterX).toBe(30);
    expect(result.centerXRange).toBe(25);
    expect(result.minCenterY).toBe(20);
    expect(result.maxCenterY).toBe(50);
    expect(result.centerYRange).toBe(30);
  });

  it("負数や小数の座標も正しく扱う", () => {
    const frames = [
      frame(0, -10.5, 3.25),
      frame(0.1, 2.75, -8.125),
      frame(0.2, -1, 0),
    ];

    const result = summarizeMotion(frames);

    expect(result.minCenterX).toBe(-10.5);
    expect(result.maxCenterX).toBe(2.75);
    expect(result.centerXRange).toBeCloseTo(13.25);
    expect(result.minCenterY).toBe(-8.125);
    expect(result.maxCenterY).toBe(3.25);
    expect(result.centerYRange).toBeCloseTo(11.375);
  });

  it("入力framesを変更しない", () => {
    const frames = [frame(0.1, 10, 20), frame(0.5, 15, 25), frame(0.9, 12, 18)];
    const snapshot = JSON.parse(JSON.stringify(frames));

    summarizeMotion(frames);

    expect(JSON.parse(JSON.stringify(frames))).toEqual(snapshot);
  });
});

describe("buildMotionAnalysisFrames", () => {
  it.each([0, -30, NaN, Infinity, -Infinity])(
    "fpsが%sの場合はframesが空になる（durationは有効値）",
    (fps) => {
      expect(buildMotionAnalysisFrames(1.0, fps)).toEqual([]);
    }
  );

  it.each([0, -1, NaN, Infinity, -Infinity])(
    "durationが%sの場合はframesが空になる（fpsは有効値）",
    (duration) => {
      expect(buildMotionAnalysisFrames(duration, 30)).toEqual([]);
    }
  );

  it("有効なduration・fpsからMath.ceil(duration*fps)件のフレームを生成する", () => {
    const frames = buildMotionAnalysisFrames(1.0, 30);

    expect(frames.length).toBe(30);
    frames.forEach((f, i) => {
      expect(f.frameIndex).toBe(i);
      expect(f.time).toBeCloseTo(i / 30);
    });
  });

  it("フレーム数は最大300に制限される", () => {
    const frames = buildMotionAnalysisFrames(100, 60);

    expect(frames.length).toBe(300);
  });
});

describe("analyzeBodyAxisMotion", () => {
  it("videoが未指定の場合はframes空で固定メッセージ・null値を返す", async () => {
    const result = await analyzeBodyAxisMotion();

    expect(result.frames).toEqual([]);
    expect(result.message).toBe(FIXED_MESSAGE);
    expect(result.trunkAngleRange).toBeNull();
    expect(result.trunkAngleMin).toBeNull();
    expect(result.trunkAngleMax).toBeNull();
    expect(result.shoulderXRange).toBeNull();
    expect(result.hipXRange).toBeNull();
  });

  it.each([0, -1, NaN, Infinity, -Infinity])(
    "durationが%sの場合はframesが空になる",
    async (duration) => {
      const result = await analyzeBodyAxisMotion(videoStub(duration), 30);

      expect(result.frames).toEqual([]);
    }
  );

  it.each([0, -30, NaN, Infinity, -Infinity])(
    "fpsが%sの場合はframesが空になる",
    async (fps) => {
      const result = await analyzeBodyAxisMotion(videoStub(1.0), fps);

      expect(result.frames).toEqual([]);
    }
  );

  it("有効なdurationとfpsからMath.ceil(duration*fps)件のフレームを生成する", async () => {
    const result = await analyzeBodyAxisMotion(videoStub(1.0), 30);

    expect(result.frames.length).toBe(30);
  });

  it("duration*fpsが整数でない場合もMath.ceilで切り上げる", async () => {
    const result = await analyzeBodyAxisMotion(videoStub(1.01), 30);

    // ceil(1.01 * 30 = 30.3...) = 31
    expect(result.frames.length).toBe(31);
  });

  it("frameIndexは0始まりの連番、timeはi/fpsになる", async () => {
    const result = await analyzeBodyAxisMotion(videoStub(0.5), 10);

    expect(result.frames.length).toBe(5);
    result.frames.forEach((f, i) => {
      expect(f.frameIndex).toBe(i);
      expect(f.time).toBeCloseTo(i / 10);
    });
  });

  it("フレーム数は最大300に制限される", async () => {
    const result = await analyzeBodyAxisMotion(videoStub(100), 60);

    expect(result.frames.length).toBe(300);
    expect(result.frames[0].frameIndex).toBe(0);
    expect(result.frames[299].frameIndex).toBe(299);
  });

  it("フレームがある場合も固定メッセージと解析値nullは変わらない", async () => {
    const result = await analyzeBodyAxisMotion(videoStub(1), 30);

    expect(result.frames.length).toBeGreaterThan(0);
    expect(result.message).toBe(FIXED_MESSAGE);
    expect(result.trunkAngleRange).toBeNull();
    expect(result.trunkAngleMin).toBeNull();
    expect(result.trunkAngleMax).toBeNull();
    expect(result.shoulderXRange).toBeNull();
    expect(result.hipXRange).toBeNull();
  });
});
