import { describe, expect, it } from "vitest";

import {
  validatePose3D,
  validatePose3DMotion,
  validatePose3DStructure,
} from "./pose3DValidation";
import type { PoseWorldLandmark } from "./poseTypes";

/** 33点分の妥当な3Dランドマークを作る。主要関節は体幹長0.5m・肩幅0.35m程度になるよう配置する */
function validLandmarks(offset: { x?: number; y?: number; z?: number } = {}): PoseWorldLandmark[] {
  const ox = offset.x ?? 0;
  const oy = offset.y ?? 0;
  const oz = offset.z ?? 0;

  const landmarks: PoseWorldLandmark[] = Array.from({ length: 33 }, () => ({
    x: ox,
    y: oy,
    z: oz,
    visibility: 1,
  }));

  landmarks[11] = { x: ox - 0.175, y: oy + 0.25, z: oz, visibility: 1 }; // left shoulder
  landmarks[12] = { x: ox + 0.175, y: oy + 0.25, z: oz, visibility: 1 }; // right shoulder
  landmarks[23] = { x: ox - 0.1, y: oy - 0.25, z: oz, visibility: 1 }; // left hip
  landmarks[24] = { x: ox + 0.1, y: oy - 0.25, z: oz, visibility: 1 }; // right hip

  return landmarks;
}

describe("validatePose3DStructure", () => {
  it("undefinedはmissingとして無効", () => {
    expect(validatePose3DStructure(undefined)).toEqual({ valid: false, reason: "missing" });
  });

  it("33点未満はinsufficient-pointsとして無効", () => {
    const landmarks = validLandmarks().slice(0, 32);
    expect(validatePose3DStructure(landmarks)).toEqual({
      valid: false,
      reason: "insufficient-points",
    });
  });

  it("非有限値を含む場合はnon-finite-valuesとして無効", () => {
    const landmarks = validLandmarks();
    landmarks[5] = { ...landmarks[5], x: NaN };
    expect(validatePose3DStructure(landmarks)).toEqual({
      valid: false,
      reason: "non-finite-values",
    });
  });

  it("Infinityを含む場合もnon-finite-valuesとして無効", () => {
    const landmarks = validLandmarks();
    landmarks[5] = { ...landmarks[5], z: Infinity };
    expect(validatePose3DStructure(landmarks)).toEqual({
      valid: false,
      reason: "non-finite-values",
    });
  });

  it("主要関節の平均visibilityが低い場合はlow-visibilityとして無効", () => {
    const landmarks = validLandmarks();
    landmarks[11] = { ...landmarks[11], visibility: 0.1 };
    landmarks[12] = { ...landmarks[12], visibility: 0.1 };
    landmarks[23] = { ...landmarks[23], visibility: 0.1 };
    landmarks[24] = { ...landmarks[24], visibility: 0.1 };
    expect(validatePose3DStructure(landmarks)).toEqual({
      valid: false,
      reason: "low-visibility",
    });
  });

  it("体幹長が短すぎる場合はdegenerate-scaleとして無効", () => {
    const landmarks = validLandmarks();
    // 肩と腰をほぼ同じ位置にして体幹長を潰す
    landmarks[11] = { x: -0.175, y: 0, z: 0, visibility: 1 };
    landmarks[12] = { x: 0.175, y: 0, z: 0, visibility: 1 };
    landmarks[23] = { x: -0.1, y: 0.01, z: 0, visibility: 1 };
    landmarks[24] = { x: 0.1, y: 0.01, z: 0, visibility: 1 };
    expect(validatePose3DStructure(landmarks)).toEqual({
      valid: false,
      reason: "degenerate-scale",
    });
  });

  it("肩幅が狭すぎる場合はdegenerate-scaleとして無効", () => {
    const landmarks = validLandmarks();
    landmarks[11] = { x: -0.02, y: 0.25, z: 0, visibility: 1 };
    landmarks[12] = { x: 0.02, y: 0.25, z: 0, visibility: 1 };
    expect(validatePose3DStructure(landmarks)).toEqual({
      valid: false,
      reason: "degenerate-scale",
    });
  });

  it("妥当なランドマークはvalid:trueを返す", () => {
    expect(validatePose3DStructure(validLandmarks())).toEqual({ valid: true });
  });
});

describe("validatePose3DMotion", () => {
  it("前フレームがない場合は常に有効", () => {
    expect(validatePose3DMotion(validLandmarks(), null)).toEqual({ valid: true });
  });

  it("腰中点の移動量が現実的な範囲なら有効", () => {
    const prev = validLandmarks();
    const current = validLandmarks({ x: 0.1 });
    expect(validatePose3DMotion(current, prev)).toEqual({ valid: true });
  });

  it("腰中点の移動量が非現実的に大きい場合はabnormal-motionとして無効", () => {
    const prev = validLandmarks();
    const current = validLandmarks({ x: 3 });
    expect(validatePose3DMotion(current, prev)).toEqual({
      valid: false,
      reason: "abnormal-motion",
    });
  });
});

describe("validatePose3D", () => {
  it("構造検証で無効な場合は移動量検証を行わずその理由を返す", () => {
    expect(validatePose3D(undefined, null)).toEqual({ valid: false, reason: "missing" });
  });

  it("構造・移動量ともに問題なければvalid:true", () => {
    const prev = validLandmarks();
    const current = validLandmarks({ x: 0.05 });
    expect(validatePose3D(current, prev)).toEqual({ valid: true });
  });

  it("構造は妥当でも移動量が異常ならabnormal-motionとして無効", () => {
    const prev = validLandmarks();
    const current = validLandmarks({ x: 5 });
    expect(validatePose3D(current, prev)).toEqual({
      valid: false,
      reason: "abnormal-motion",
    });
  });
});
