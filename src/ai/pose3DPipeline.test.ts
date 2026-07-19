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

  it("移動量が異常なフレームはabnormal-motionとして無効化され、品質シグナルに反映される", () => {
    const frames = [
      makeFrame(0, 0, validWorldLandmarks(0)),
      makeFrame(1, 0.1, validWorldLandmarks(5)), // 非現実的な移動量
      makeFrame(2, 0.2, validWorldLandmarks(0.02)),
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
