import { describe, expect, it } from "vitest";

import { normalizePose3D } from "./pose3DNormalization";
import type { PoseWorldLandmark } from "./poseTypes";

function baseLandmarks(): PoseWorldLandmark[] {
  const landmarks: PoseWorldLandmark[] = Array.from({ length: 33 }, () => ({
    x: 1,
    y: 1,
    z: 1,
    visibility: 1,
  }));

  landmarks[11] = { x: 0.825, y: 1.25, z: 1, visibility: 0.9 }; // left shoulder
  landmarks[12] = { x: 1.175, y: 1.25, z: 1, visibility: 0.8 }; // right shoulder
  landmarks[23] = { x: 0.9, y: 0.75, z: 1, visibility: 1 }; // left hip
  landmarks[24] = { x: 1.1, y: 0.75, z: 1, visibility: 1 }; // right hip

  return landmarks;
}

describe("normalizePose3D", () => {
  it("原点は左右股関節の中点になる", () => {
    const result = normalizePose3D(baseLandmarks());
    expect(result.origin).toEqual({ x: 1, y: 0.75, z: 1 });
  });

  it("原点位置のランドマークは正規化後(0,0,0)になる", () => {
    const landmarks = baseLandmarks();
    const result = normalizePose3D(landmarks);
    // 左右股関節の中点はorigin自身なので、正規化後の座標は原点からの相対位置になる
    const leftHipNormalized = result.landmarks[23];
    const rightHipNormalized = result.landmarks[24];
    expect((leftHipNormalized.x + rightHipNormalized.x) / 2).toBeCloseTo(0, 10);
    expect((leftHipNormalized.y + rightHipNormalized.y) / 2).toBeCloseTo(0, 10);
  });

  it("スケールは肩中点-腰中点の距離（体幹長）になる", () => {
    const result = normalizePose3D(baseLandmarks());
    // 肩中点(1, 1.25, 1) - 腰中点(1, 0.75, 1) = 距離0.5m
    expect(result.scale).toBeCloseTo(0.5, 10);
  });

  it("スケールが下限(0.1m)未満になる場合は下限値を使う", () => {
    const landmarks = baseLandmarks();
    landmarks[11] = { x: 0.825, y: 0.751, z: 1, visibility: 1 };
    landmarks[12] = { x: 1.175, y: 0.751, z: 1, visibility: 1 };
    const result = normalizePose3D(landmarks);
    expect(result.scale).toBe(0.1);
  });

  it("正規化後の肩幅はスケールで割った値になる", () => {
    const result = normalizePose3D(baseLandmarks());
    const left = result.landmarks[11];
    const right = result.landmarks[12];
    const normalizedShoulderWidth = Math.hypot(
      left.x - right.x,
      left.y - right.y,
      left.z - right.z
    );
    // 元の肩幅0.35m / スケール0.5m = 0.7
    expect(normalizedShoulderWidth).toBeCloseTo(0.7, 10);
  });

  it("qualityは肩・腰4点の平均visibility", () => {
    const result = normalizePose3D(baseLandmarks());
    // (0.9 + 0.8 + 1 + 1) / 4 = 0.925
    expect(result.quality).toBeCloseTo(0.925, 10);
  });

  it("全33点が正規化後landmarksに含まれる", () => {
    const result = normalizePose3D(baseLandmarks());
    expect(result.landmarks).toHaveLength(33);
  });
});
