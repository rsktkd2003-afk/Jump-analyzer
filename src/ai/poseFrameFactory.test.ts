import { describe, expect, it } from "vitest";

import type { TrackedFrame, TrackedLandmark } from "./poseTypes";
import {
  createTrackedFrame,
  recreateTrackedFrameFromLandmarks,
} from "./poseFrameFactory";

function boxLandmarks(visibility?: number): TrackedLandmark[] {
  return [
    { x: 100, y: 100, visibility },
    { x: 200, y: 100, visibility },
    { x: 100, y: 300, visibility },
    { x: 200, y: 300, visibility },
    { x: 120, y: 150, visibility },
    { x: 180, y: 150, visibility },
    { x: 120, y: 250, visibility },
    { x: 180, y: 250, visibility },
  ];
}

function baseFrame(): TrackedFrame {
  return {
    frameIndex: 12,
    time: 0.2,
    landmarks: boxLandmarks(1),
    crop: { x: 1, y: 2, width: 3, height: 4 },
    centerX: 10,
    centerY: 20,
    leftKneeAngle: 90,
    rightKneeAngle: 90,
    hipAngle: 90,
    shoulderTilt: 5,
    leftHipAngle: 90,
    rightHipAngle: 90,
    leftElbowAngle: 90,
    rightElbowAngle: 90,
    leftShoulderAngle: 90,
    rightShoulderAngle: 90,
  };
}

describe("poseFrameFactory: TrackedFrame生成", () => {
  it("8個の可視点から中心と45%/35%パディングのcropを生成する", () => {
    const frame = createTrackedFrame(boxLandmarks(1), 12, 0.2, 400, 400);

    expect(frame).not.toBeNull();
    expect(frame?.frameIndex).toBe(12);
    expect(frame?.time).toBe(0.2);
    expect(frame?.centerX).toBe(150);
    expect(frame?.centerY).toBe(200);
    expect(frame?.crop).toEqual({ x: 55, y: 30, width: 190, height: 340 });
  });

  it("可視点が7個以下なら計測不能", () => {
    expect(
      createTrackedFrame(boxLandmarks(1).slice(0, 7), 0, 0, 400, 400)
    ).toBeNull();
  });

  it("可視点の平均visibilityが0.6未満なら計測不能", () => {
    expect(createTrackedFrame(boxLandmarks(0.59), 0, 0, 400, 400)).toBeNull();
    expect(createTrackedFrame(boxLandmarks(0.6), 0, 0, 400, 400)).not.toBeNull();
  });

  it("visibility未定義は1として扱う", () => {
    expect(createTrackedFrame(boxLandmarks(), 0, 0, 400, 400)).not.toBeNull();
  });

  it("visibilityが0.35の点はboundsと可視点数から除外する", () => {
    const landmarks = [
      ...boxLandmarks(0.6),
      { x: -1000, y: -1000, visibility: 0.35 },
    ];
    const frame = createTrackedFrame(landmarks, 0, 0, 400, 400);

    expect(frame?.centerX).toBe(150);
    expect(frame?.centerY).toBe(200);
  });

  it("boundsとcropを動画領域内へ収める", () => {
    const landmarks = boxLandmarks(1).map((point, index) => ({
      ...point,
      x: index % 2 === 0 ? -20 : 220,
      y: index < 4 ? -10 : 120,
    }));
    const frame = createTrackedFrame(landmarks, 0, 0, 200, 100);

    expect(frame?.centerX).toBe(100);
    expect(frame?.centerY).toBe(50);
    expect(frame?.crop).toEqual({ x: 0, y: 0, width: 200, height: 100 });
  });

  it("主要関節が一直線なら各関節角180度、水平な肩なら傾き0度", () => {
    const landmarks: TrackedLandmark[] = Array.from({ length: 33 }, () => ({
      x: 150,
      y: 200,
      visibility: 1,
    }));

    landmarks[11] = { x: 100, y: 100, visibility: 1 };
    landmarks[12] = { x: 200, y: 100, visibility: 1 };
    landmarks[13] = { x: 100, y: 50, visibility: 1 };
    landmarks[14] = { x: 200, y: 50, visibility: 1 };
    landmarks[15] = { x: 100, y: 0, visibility: 1 };
    landmarks[16] = { x: 200, y: 0, visibility: 1 };
    landmarks[23] = { x: 100, y: 200, visibility: 1 };
    landmarks[24] = { x: 200, y: 200, visibility: 1 };
    landmarks[25] = { x: 100, y: 300, visibility: 1 };
    landmarks[26] = { x: 200, y: 300, visibility: 1 };
    landmarks[27] = { x: 100, y: 400, visibility: 1 };
    landmarks[28] = { x: 200, y: 400, visibility: 1 };

    const frame = createTrackedFrame(landmarks, 0, 0, 500, 500);

    expect(frame?.shoulderTilt).toBeCloseTo(0);
    expect(frame?.leftKneeAngle).toBeCloseTo(180);
    expect(frame?.rightKneeAngle).toBeCloseTo(180);
    expect(frame?.leftHipAngle).toBeCloseTo(180);
    expect(frame?.rightHipAngle).toBeCloseTo(180);
    expect(frame?.leftElbowAngle).toBeCloseTo(180);
    expect(frame?.rightElbowAngle).toBeCloseTo(180);
    expect(frame?.leftShoulderAngle).toBeCloseTo(180);
    expect(frame?.rightShoulderAngle).toBeCloseTo(180);
  });
});

describe("poseFrameFactory: 平滑化後の再生成", () => {
  it("可視点が8個未満でもboundsがあればcropと中心を再計算する", () => {
    const landmarks = [
      { x: 100, y: 100, visibility: 1 },
      { x: 200, y: 300, visibility: 1 },
    ];
    const frame = recreateTrackedFrameFromLandmarks(
      baseFrame(),
      landmarks,
      400,
      400
    );

    expect(frame.centerX).toBe(150);
    expect(frame.centerY).toBe(200);
    expect(frame.crop).toEqual({ x: 55, y: 30, width: 190, height: 340 });
  });

  it("boundsを作れない場合は元のcropと中心を維持し、角度だけ再計算する", () => {
    const original = baseFrame();
    const frame = recreateTrackedFrameFromLandmarks(original, [], 400, 400);

    expect(frame.crop).toEqual(original.crop);
    expect(frame.centerX).toBe(original.centerX);
    expect(frame.centerY).toBe(original.centerY);
    expect(frame.landmarks).toEqual([]);
    expect(frame.leftKneeAngle).toBeNull();
    expect(frame.shoulderTilt).toBeNull();
  });
});
