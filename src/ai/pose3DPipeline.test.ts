import { describe, expect, it } from "vitest";

import { runPose3DPipeline } from "./pose3DPipeline";
import type { PoseWorldLandmark, TrackedFrame } from "./poseTypes";

function validWorldLandmarks(offsetX = 0): PoseWorldLandmark[] {
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

/**
 * 移動量検証（validatePose3DMotion）は肩・腰以外の関節（肘・手首・膝・足首）の
 * 形状変化を見るため、validWorldLandmarksのような肩・腰しか差別化しないビルダーでは
 * 平行移動しか表現できず、人物乗り換え相当の「形状」変化を再現できない。
 * このヘルパーはその全関節を差別化した姿勢を返す（isPersonSwap=trueで
 * 肘・手首・膝・足首を大きくずらした別形状にする）。
 */
function richWorldLandmarks(isPersonSwap = false): PoseWorldLandmark[] {
  const landmarks: PoseWorldLandmark[] = Array.from({ length: 33 }, () => ({
    x: 0,
    y: 0,
    z: 0,
    visibility: 1,
  }));
  const shift = isPersonSwap ? 0.5 : 0;
  landmarks[11] = { x: -0.175, y: 0.25, z: 0, visibility: 1 };
  landmarks[12] = { x: 0.175, y: 0.25, z: 0, visibility: 1 };
  landmarks[13] = { x: -0.22 - shift, y: 0.1, z: 0.05, visibility: 1 };
  landmarks[14] = { x: 0.22 + shift, y: 0.1, z: 0.05, visibility: 1 };
  landmarks[15] = { x: -0.25, y: -0.05 + shift, z: 0.1, visibility: 1 };
  landmarks[16] = { x: 0.25, y: -0.05 - shift, z: 0.1, visibility: 1 };
  landmarks[23] = { x: -0.1, y: -0.25, z: 0, visibility: 1 };
  landmarks[24] = { x: 0.1, y: -0.25, z: 0, visibility: 1 };
  landmarks[25] = { x: -0.1, y: -0.6 + shift, z: 0, visibility: 1 };
  landmarks[26] = { x: 0.1, y: -0.6 - shift, z: 0, visibility: 1 };
  landmarks[27] = { x: -0.12 - shift, y: -0.95, z: 0, visibility: 1 };
  landmarks[28] = { x: 0.12 + shift, y: -0.95, z: 0, visibility: 1 };
  return landmarks;
}

function makeFrame(
  frameIndex: number,
  time: number,
  worldLandmarks3D?: PoseWorldLandmark[]
): TrackedFrame {
  return {
    frameIndex,
    time,
    landmarks: [],
    crop: { x: 0, y: 0, width: 10, height: 10 },
    centerX: 0,
    centerY: 0,
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
    worldLandmarks3D,
  };
}

describe("runPose3DPipeline", () => {
  it("有効な3Dランドマークを持つフレーム列は、正規化済みnormalizedPose3Dを付与して返す", () => {
    const frames = [
      makeFrame(0, 0, validWorldLandmarks(0)),
      makeFrame(1, 0.1, validWorldLandmarks(0.01)),
    ];

    const result = runPose3DPipeline(frames);

    expect(result.frames).toHaveLength(2);
    expect(result.frames[0].normalizedPose3D).toBeDefined();
    expect(result.frames[1].normalizedPose3D).toBeDefined();
    expect(result.qualitySignals).toBeDefined();
    expect(result.qualitySignals?.availableFrameRatio).toBe(1);
  });

  it("構造的に不正な3Dランドマーク（33点未満）のフレームはworldLandmarks3D/normalizedPose3Dがundefinedになる", () => {
    const frames = [
      makeFrame(0, 0, validWorldLandmarks(0)),
      makeFrame(1, 0.1, validWorldLandmarks(0.01).slice(0, 20)),
      makeFrame(2, 0.2, validWorldLandmarks(0.02)),
    ];

    const result = runPose3DPipeline(frames);

    // 前後1フレームずつの短い欠損なので補間される
    expect(result.frames[1].worldLandmarks3D).toBeDefined();
    expect(result.qualitySignals?.interpolatedFrameRatio).toBeCloseTo(1 / 3, 6);
  });

  it("worldLandmarks3Dがそもそも存在しないフレームは2D側に影響を与えず、そのまま素通りする", () => {
    const frames = [makeFrame(0, 0, undefined)];
    const result = runPose3DPipeline(frames);

    expect(result.frames[0].worldLandmarks3D).toBeUndefined();
    expect(result.frames[0].normalizedPose3D).toBeUndefined();
    expect(result.frames[0].landmarks).toEqual([]);
  });

  it("骨格形状が人物乗り換え相当に急変したフレームはabnormal-motionとして無効化され、品質シグナルに反映される", () => {
    // worldLandmarksは股関節中点付近を原点とする人物中心座標のため、単純な平行移動
    // （旧: validWorldLandmarks(5)）では移動量検証が発火しない。骨格「形状」自体が
    // 急変するケース（人物乗り換え相当）で発火することを検証する。
    const frames = [
      makeFrame(0, 0, richWorldLandmarks(false)),
      makeFrame(1, 0.1, richWorldLandmarks(true)), // 人物乗り換え相当の形状急変
      makeFrame(2, 0.2, richWorldLandmarks(false)),
    ];

    const result = runPose3DPipeline(frames);

    expect(result.qualitySignals?.abnormalMotionFrameRatio).toBeCloseTo(1 / 3, 6);
  });

  it("フレームが0件の場合はそのまま返す", () => {
    const result = runPose3DPipeline([]);
    expect(result.frames).toEqual([]);
    expect(result.qualitySignals).toBeUndefined();
  });
});
