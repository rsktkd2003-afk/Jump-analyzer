import { describe, expect, it } from "vitest";

import { calculatePose3DMetrics } from "./pose3DMetrics";
import type { NormalizedPose3D, PoseWorldLandmark } from "./poseTypes";

function makePose(overrides: {
  leftShoulder?: PoseWorldLandmark;
  rightShoulder?: PoseWorldLandmark;
  leftHip?: PoseWorldLandmark;
  rightHip?: PoseWorldLandmark;
  landmarkCount?: number;
}): NormalizedPose3D {
  const landmarkCount = overrides.landmarkCount ?? 33;
  const landmarks: PoseWorldLandmark[] = Array.from({ length: landmarkCount }, () => ({
    x: 0,
    y: 0,
    z: 0,
  }));

  if (overrides.leftShoulder) landmarks[11] = overrides.leftShoulder;
  if (overrides.rightShoulder) landmarks[12] = overrides.rightShoulder;
  if (overrides.leftHip) landmarks[23] = overrides.leftHip;
  if (overrides.rightHip) landmarks[24] = overrides.rightHip;

  return { landmarks, origin: { x: 0, y: 0, z: 0 }, scale: 1, quality: 1 };
}

describe("calculatePose3DMetrics", () => {
  it("肩・腰のいずれかが欠けている場合はnullを返す", () => {
    const pose = makePose({ landmarkCount: 10 }); // インデックス11以降が存在しない
    expect(calculatePose3DMetrics(pose)).toBeNull();
  });

  it("肩ラインがx軸に平行なら肩回旋量は0度", () => {
    const pose = makePose({
      leftShoulder: { x: -1, y: 1, z: 0 },
      rightShoulder: { x: 1, y: 1, z: 0 },
      leftHip: { x: -1, y: 0, z: 0 },
      rightHip: { x: 1, y: 0, z: 0 },
    });
    const metrics = calculatePose3DMetrics(pose);
    expect(metrics?.shoulderRotationDeg).toBeCloseTo(0, 6);
    expect(metrics?.pelvisRotationDeg).toBeCloseTo(0, 6);
  });

  it("肩ラインがz軸方向を向いていれば肩回旋量は90度", () => {
    const pose = makePose({
      leftShoulder: { x: 0, y: 1, z: -1 },
      rightShoulder: { x: 0, y: 1, z: 1 },
      leftHip: { x: -1, y: 0, z: 0 },
      rightHip: { x: 1, y: 0, z: 0 },
    });
    const metrics = calculatePose3DMetrics(pose);
    expect(metrics?.shoulderRotationDeg).toBeCloseTo(90, 6);
  });

  it("肩と骨盤の回旋角の差がshoulderPelvisSeparationDegになる", () => {
    const pose = makePose({
      // 肩ライン: x軸から45度回転
      leftShoulder: { x: -1, y: 1, z: -1 },
      rightShoulder: { x: 1, y: 1, z: 1 },
      // 腰ライン: x軸に平行(0度)
      leftHip: { x: -1, y: 0, z: 0 },
      rightHip: { x: 1, y: 0, z: 0 },
    });
    const metrics = calculatePose3DMetrics(pose);
    expect(metrics?.shoulderRotationDeg).toBeCloseTo(45, 6);
    expect(metrics?.pelvisRotationDeg).toBeCloseTo(0, 6);
    expect(metrics?.shoulderPelvisSeparationDeg).toBeCloseTo(45, 6);
  });

  it("体幹が前後方向にのみ傾いている場合、前後傾きだけが非ゼロになる", () => {
    const pose = makePose({
      leftShoulder: { x: -0.2, y: 1, z: 0.5 },
      rightShoulder: { x: 0.2, y: 1, z: 0.5 },
      leftHip: { x: -0.1, y: 0, z: 0 },
      rightHip: { x: 0.1, y: 0, z: 0 },
    });
    const metrics = calculatePose3DMetrics(pose);
    // hipMid=(0,0,0), shoulderMid=(0,1,0.5) -> atan2(0.5,1) ≈ 26.565度
    expect(metrics?.trunkForwardTiltDeg).toBeCloseTo(26.565, 2);
    expect(metrics?.trunkLateralTiltDeg).toBeCloseTo(0, 6);
  });

  it("体幹が左右方向にのみ傾いている場合、左右傾きだけが非ゼロになる", () => {
    const pose = makePose({
      leftShoulder: { x: 0.3, y: 1, z: 0 },
      rightShoulder: { x: 0.7, y: 1, z: 0 },
      leftHip: { x: -0.1, y: 0, z: 0 },
      rightHip: { x: 0.1, y: 0, z: 0 },
    });
    const metrics = calculatePose3DMetrics(pose);
    // hipMid=(0,0,0), shoulderMid=(0.5,1,0) -> atan2(0.5,1) ≈ 26.565度
    expect(metrics?.trunkLateralTiltDeg).toBeCloseTo(26.565, 2);
    expect(metrics?.trunkForwardTiltDeg).toBeCloseTo(0, 6);
  });

  it("体幹がまっすぐ（骨盤の真上に肩がある）場合は前後・左右傾きともに0度", () => {
    const pose = makePose({
      leftShoulder: { x: -0.2, y: 1, z: 0 },
      rightShoulder: { x: 0.2, y: 1, z: 0 },
      leftHip: { x: -0.1, y: 0, z: 0 },
      rightHip: { x: 0.1, y: 0, z: 0 },
    });
    const metrics = calculatePose3DMetrics(pose);
    expect(metrics?.trunkForwardTiltDeg).toBeCloseTo(0, 6);
    expect(metrics?.trunkLateralTiltDeg).toBeCloseTo(0, 6);
  });
});
