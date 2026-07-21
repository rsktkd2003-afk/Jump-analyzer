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

/**
 * 移動量検証（validatePose3DMotion）用の、肘・手首・膝・足首まで個別に配置した
 * 3Dランドマーク。validLandmarks()は肩・腰以外がすべて同一点に潰れているため、
 * 「一部の関節だけ変化」「大半の関節が変化」といった形状変化のテストには使えない。
 * 体幹長は0.5m相当になるよう配置してある（scale計算の分母が単純になるように）。
 */
function richLandmarks(
  offset: { x?: number; y?: number; z?: number } = {},
  jointOverrides: Record<number, { dx?: number; dy?: number; dz?: number; visibility?: number }> = {}
): PoseWorldLandmark[] {
  const ox = offset.x ?? 0;
  const oy = offset.y ?? 0;
  const oz = offset.z ?? 0;

  const basePositions: Record<number, { x: number; y: number; z: number }> = {
    11: { x: -0.175, y: 0.25, z: 0 }, // left shoulder
    12: { x: 0.175, y: 0.25, z: 0 }, // right shoulder
    13: { x: -0.22, y: 0.1, z: 0.05 }, // left elbow
    14: { x: 0.22, y: 0.1, z: 0.05 }, // right elbow
    15: { x: -0.25, y: -0.05, z: 0.1 }, // left wrist
    16: { x: 0.25, y: -0.05, z: 0.1 }, // right wrist
    23: { x: -0.1, y: -0.25, z: 0 }, // left hip
    24: { x: 0.1, y: -0.25, z: 0 }, // right hip
    25: { x: -0.1, y: -0.6, z: 0 }, // left knee
    26: { x: 0.1, y: -0.6, z: 0 }, // right knee
    27: { x: -0.12, y: -0.95, z: 0 }, // left ankle
    28: { x: 0.12, y: -0.95, z: 0 }, // right ankle
  };

  const landmarks: PoseWorldLandmark[] = Array.from({ length: 33 }, () => ({
    x: ox,
    y: oy,
    z: oz,
    visibility: 1,
  }));

  for (const [indexStr, pos] of Object.entries(basePositions)) {
    const index = Number(indexStr);
    const override = jointOverrides[index] ?? {};
    landmarks[index] = {
      x: ox + pos.x + (override.dx ?? 0),
      y: oy + pos.y + (override.dy ?? 0),
      z: oz + pos.z + (override.dz ?? 0),
      visibility: override.visibility ?? 1,
    };
  }

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

// =============================================================
// validatePose3DMotion: コードレビュー指摘により、絶対位置（腰中点）ベースの
// 判定から、骨盤中心・体幹長で正規化した主要関節の「形状」変化（中央値）
// ベースの判定へ修正した。MediaPipeのworldLandmarksは股関節中点付近を
// 原点とする人物中心座標のため、腰中点の絶対移動量は常にほぼ0になり、
// 平行移動そのものは異常移動として検出してはならない（旧実装のバグ）。
// =============================================================
describe("validatePose3DMotion", () => {
  it("前フレームがない場合は常に有効", () => {
    expect(validatePose3DMotion(validLandmarks(), null)).toEqual({ valid: true });
  });

  it("腰中点の移動量が現実的な範囲なら有効", () => {
    const prev = validLandmarks();
    const current = validLandmarks({ x: 0.1 });
    expect(validatePose3DMotion(current, prev)).toEqual({ valid: true });
  });

  // 必須テスト1: 全身が同じ平行移動をしても、人物中心world座標では異常移動扱いしない
  it("全身が同じ平行移動をしても異常移動扱いしない（人物中心座標の平行移動は形状不変）", () => {
    const prev = richLandmarks();
    // 平行移動量が大きくても（旧実装のMAX_PLAUSIBLE_HIP_MOTION_M=1.5を大幅に超える量でも）
    // 関節どうしの相対形状は変わらないため、有効のままであるべき
    const current = richLandmarks({ x: 3, y: -2, z: 1.5 });
    const result = validatePose3DMotion(current, prev);
    expect(result.valid).toBe(true);
  });

  // 必須テスト2: 主要関節の大多数が非現実的に急変した場合はabnormal-motionになる
  it("主要関節の大多数(6/10)が非現実的に急変した場合はabnormal-motionとして無効", () => {
    const prev = richLandmarks();
    const current = richLandmarks(
      {},
      {
        11: { dx: 1.5 },
        12: { dx: -1.5 },
        13: { dy: 1.5 },
        14: { dy: -1.5 },
        25: { dz: 1.5 },
        26: { dz: -1.5 },
      }
    );
    expect(validatePose3DMotion(current, prev)).toEqual({
      valid: false,
      reason: "abnormal-motion",
    });
  });

  // 必須テスト3: 腕1本の高速スイングだけでは異常移動扱いしない
  it("腕1本（右手首）の高速スイングだけでは異常移動扱いしない", () => {
    const prev = richLandmarks();
    const current = richLandmarks(
      {},
      {
        16: { dx: 0.6, dy: 0.8, dz: -0.3 }, // 右手首だけを大きく動かす
      }
    );
    expect(validatePose3DMotion(current, prev)).toEqual({ valid: true });
  });

  // 必須テスト5: 通常のジャンプ・体幹回旋は通過する
  it("通常のジャンプ・軽い体幹回旋に相当する程度の同期した変化は通過する", () => {
    const prev = richLandmarks();
    const current = richLandmarks(
      { y: 0.15 }, // ジャンプによる全身の上昇
      {
        11: { dz: 0.05 },
        12: { dz: -0.05 }, // 軽い体幹回旋（肩）
        23: { dz: 0.02 },
        24: { dz: -0.02 }, // 軽い体幹回旋（骨盤）
        13: { dy: 0.05 },
        14: { dy: 0.05 },
        15: { dy: 0.08 },
        16: { dy: 0.08 },
        25: { dy: 0.1 },
        26: { dy: 0.1 },
        27: { dy: 0.12 },
        28: { dy: 0.12 },
      }
    );
    expect(validatePose3DMotion(current, prev)).toEqual({ valid: true });
  });

  it("比較に使える関節（visibility十分）が4点未満の場合は判定を見送り有効とする", () => {
    const prev = richLandmarks();
    const current = richLandmarks(
      {},
      {
        11: { visibility: 0.1 },
        12: { visibility: 0.1 },
        13: { visibility: 0.1 },
        14: { visibility: 0.1 },
        15: { visibility: 0.1 },
        16: { visibility: 0.1 },
        25: { visibility: 0.1 },
        // 26(右膝)・27・28(両足首)だけ十分なvisibilityを残す -> 比較可能な関節が3点のみ(4点未満)
      }
    );
    expect(validatePose3DMotion(current, prev)).toEqual({ valid: true });
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

  // 必須テスト4相当（単体版）: 人物乗り換え相当の骨格形状急変はabnormal-motionになる。
  // 肩・腰(11,12,23,24)はvalidatePose3DStructureの体幹長/肩幅判定に使われるため、
  // ここを崩すと移動量検証に到達する前にdegenerate-scaleとして弾かれてしまう。
  // そのため肩・腰は動かさず、肘・手首・膝・足首(10関節中8関節)だけを急変させる。
  // ratio > 0 になることの統合確認はpose3DPipeline.test.tsで行う。
  it("構造は妥当でも骨格形状が人物乗り換え相当に急変すればabnormal-motionとして無効", () => {
    const prev = richLandmarks();
    const current = richLandmarks(
      {},
      {
        13: { dx: 0.5, dy: -0.2 },
        14: { dx: -0.5, dy: -0.2 },
        15: { dx: 0.6, dy: 0.1 },
        16: { dx: -0.6, dy: 0.1 },
        25: { dx: 0.4, dy: 0.3 },
        26: { dx: -0.4, dy: 0.3 },
        27: { dx: 0.3, dy: 0.5 },
        28: { dx: -0.3, dy: 0.5 },
      }
    );
    expect(validatePose3D(current, prev)).toEqual({
      valid: false,
      reason: "abnormal-motion",
    });
  });
});
