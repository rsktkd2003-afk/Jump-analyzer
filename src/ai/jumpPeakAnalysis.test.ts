import { describe, expect, it } from "vitest";

import type { PoseLandmarkerResult } from "@mediapipe/tasks-vision";
import type { TrackedLandmark } from "./poseTypes";
import { getBodyHeightScore, selectBetterPeak } from "./jumpPeakAnalysis";

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

describe("jumpPeakAnalysis: 体の高さスコア", () => {
  it("手首75%・腰25%の重みでスコアを計算する", () => {
    const score = getBodyHeightScore(poseResult(heightPose(0.2, 0.6)));

    expect(score).toBeCloseTo(0.2 * 0.75 + 0.6 * 0.25);
  });

  it("左右手首は高い側（Yが小さい側）を使う", () => {
    const pose = heightPose(0.5, 0.5);
    pose[15] = { x: 0.4, y: 0.1, visibility: 1 };
    pose[16] = { x: 0.6, y: 0.9, visibility: 1 };

    const score = getBodyHeightScore(poseResult(pose));

    expect(score).toBeCloseTo(0.1 * 0.75 + 0.5 * 0.25);
  });

  it("左右腰は平均Yを使う", () => {
    const pose = heightPose(0.5, 0.5);
    pose[23] = { x: 0.4, y: 0.1, visibility: 1 };
    pose[24] = { x: 0.6, y: 0.9, visibility: 1 };

    const score = getBodyHeightScore(poseResult(pose));

    expect(score).toBeCloseTo(0.5 * 0.75 + 0.5 * 0.25);
  });

  it("骨格点が検出できない場合はnull", () => {
    expect(getBodyHeightScore(poseResult(null))).toBeNull();
  });

  it("手首または腰が欠けている場合はnull", () => {
    const missingHip = heightPose(0.3, 0.5).slice(0, 20);

    expect(getBodyHeightScore(poseResult(missingHip))).toBeNull();
  });
});

describe("jumpPeakAnalysis: 最高点候補の選択", () => {
  it("初回候補をそのまま採用する", () => {
    const result = selectBetterPeak(null, { time: 0.2, score: 0.5 });

    expect(result).toEqual({ time: 0.2, score: 0.5 });
  });

  it("より良いスコア（小さい方）で更新する", () => {
    const current = { time: 0, score: 0.5 };

    const result = selectBetterPeak(current, { time: 0.2, score: 0.3 });

    expect(result).toEqual({ time: 0.2, score: 0.3 });
  });

  it("同点または劣るスコアでは先に見つかった方を維持する", () => {
    const current = { time: 0, score: 0.5 };

    expect(selectBetterPeak(current, { time: 0.2, score: 0.5 })).toEqual(
      current
    );
    expect(selectBetterPeak(current, { time: 0.2, score: 0.6 })).toEqual(
      current
    );
  });
});
