import { describe, expect, it } from "vitest";

import {
  correctLateralityForFrame,
  correctLateralityForSequence,
} from "./lateralityCorrection";
import { POSE_LANDMARK } from "./poseLandmarks";
import type { TrackedLandmark } from "./poseTypes";

const P = POSE_LANDMARK;

type Overrides = Partial<Record<number, TrackedLandmark>>;

/** 33点ぶんの「直立姿勢」を基準に、指定インデックスだけ上書きしたランドマーク配列を作る */
function makeLandmarks(overrides: Overrides = {}, visibility = 0.9): TrackedLandmark[] {
  const base: Record<number, TrackedLandmark> = {
    [P.LEFT_SHOULDER]: { x: 120, y: 100, visibility },
    [P.RIGHT_SHOULDER]: { x: 180, y: 100, visibility },
    [P.LEFT_ELBOW]: { x: 110, y: 140, visibility },
    [P.RIGHT_ELBOW]: { x: 190, y: 140, visibility },
    [P.LEFT_WRIST]: { x: 105, y: 180, visibility },
    [P.RIGHT_WRIST]: { x: 195, y: 180, visibility },
    [P.LEFT_HIP]: { x: 130, y: 220, visibility },
    [P.RIGHT_HIP]: { x: 170, y: 220, visibility },
    [P.LEFT_KNEE]: { x: 128, y: 280, visibility },
    [P.RIGHT_KNEE]: { x: 172, y: 280, visibility },
    [P.LEFT_ANKLE]: { x: 126, y: 340, visibility },
    [P.RIGHT_ANKLE]: { x: 174, y: 340, visibility },
    [P.LEFT_HEEL]: { x: 124, y: 350, visibility },
    [P.RIGHT_HEEL]: { x: 176, y: 350, visibility },
    [P.LEFT_FOOT_INDEX]: { x: 130, y: 355, visibility },
    [P.RIGHT_FOOT_INDEX]: { x: 170, y: 355, visibility },
  };

  const landmarks: TrackedLandmark[] = new Array(33)
    .fill(null)
    .map((_, i) => base[i] ?? { x: 0, y: 0, visibility: 0 });

  for (const [indexStr, point] of Object.entries(overrides)) {
    if (point) landmarks[Number(indexStr)] = point;
  }

  return landmarks;
}

function shiftAll(landmarks: TrackedLandmark[], dx: number, dy: number): TrackedLandmark[] {
  return landmarks.map((p) => ({ ...p, x: p.x + dx, y: p.y + dy }));
}

function swapPair(landmarks: TrackedLandmark[], left: number, right: number): TrackedLandmark[] {
  const result = [...landmarks];
  result[left] = landmarks[right];
  result[right] = landmarks[left];
  return result;
}

function fullySwap(landmarks: TrackedLandmark[]): TrackedLandmark[] {
  let result = landmarks;
  const pairs: Array<[number, number]> = [
    [P.LEFT_SHOULDER, P.RIGHT_SHOULDER],
    [P.LEFT_ELBOW, P.RIGHT_ELBOW],
    [P.LEFT_WRIST, P.RIGHT_WRIST],
    [P.LEFT_HIP, P.RIGHT_HIP],
    [P.LEFT_KNEE, P.RIGHT_KNEE],
    [P.LEFT_ANKLE, P.RIGHT_ANKLE],
    [P.LEFT_HEEL, P.RIGHT_HEEL],
    [P.LEFT_FOOT_INDEX, P.RIGHT_FOOT_INDEX],
  ];
  for (const [l, r] of pairs) {
    result = swapPair(result, l, r);
  }
  return result;
}

describe("lateralityCorrection: 単一フレームの判定", () => {
  it("通常フレーム（小さな連続移動）では補正しない", () => {
    const reference = makeLandmarks();
    const candidate = shiftAll(reference, 2, 1);
    const { result } = correctLateralityForFrame(candidate, reference, 1);
    expect(result.corrected).toBe(false);
  });

  it("明確な左右入れ替わりでは補正する", () => {
    const reference = makeLandmarks();
    const physicalContinuation = shiftAll(reference, 3, 2);
    const mislabeled = fullySwap(physicalContinuation);
    const { landmarks, result } = correctLateralityForFrame(mislabeled, reference, 1);

    expect(result.corrected).toBe(true);
    const shoulderAfter = landmarks[P.LEFT_SHOULDER];
    const expected = physicalContinuation[P.LEFT_SHOULDER];
    const drift = Math.hypot(shoulderAfter.x - expected.x, shoulderAfter.y - expected.y);
    expect(drift).toBeLessThan(1);
  });

  it("体幹回旋だけ（肩・腰がわずかに回転）では補正しない", () => {
    const reference = makeLandmarks();
    const candidate = makeLandmarks({
      [P.LEFT_SHOULDER]: { x: 125, y: 98, visibility: 0.9 },
      [P.RIGHT_SHOULDER]: { x: 175, y: 102, visibility: 0.9 },
      [P.LEFT_HIP]: { x: 133, y: 219, visibility: 0.9 },
      [P.RIGHT_HIP]: { x: 167, y: 221, visibility: 0.9 },
    });
    const { result } = correctLateralityForFrame(candidate, reference, 1);
    expect(result.corrected).toBe(false);
  });

  it("腕の交差だけ（手首のみ左右が入れ替わる）では補正しない", () => {
    const reference = makeLandmarks();
    // 肩・肘・股関節・膝・足首・踵・つま先は基準と同一のまま、手首だけ交差させる
    const candidate = swapPair(makeLandmarks(), P.LEFT_WRIST, P.RIGHT_WRIST);
    const { result } = correctLateralityForFrame(candidate, reference, 1);
    expect(result.corrected).toBe(false);
  });

  it("visibilityが低い場合は積極的に補正しない", () => {
    const reference = makeLandmarks();
    const physicalContinuation = shiftAll(reference, 3, 2);
    const mislabeled = fullySwap(physicalContinuation).map((p) => ({ ...p, visibility: 0.15 }));
    const { result } = correctLateralityForFrame(mislabeled, reference, 1);
    expect(result.corrected).toBe(false);
    expect(result.reason).toBe("insufficient-visibility");
  });

  it("基準フレームが無い場合（先頭フレーム等）は補正しない", () => {
    const { result } = correctLateralityForFrame(makeLandmarks(), null, 0);
    expect(result.corrected).toBe(false);
    expect(result.reason).toBe("no-reference");
  });
});

describe("lateralityCorrection: フレーム列全体の安定性", () => {
  it("連続する自然なフレーム列では単発の異常値で頻繁に反転しない", () => {
    const f0 = makeLandmarks();
    const f1 = shiftAll(f0, 2, 1);
    const f2 = shiftAll(f1, 2, 1);
    const f3 = shiftAll(f2, -1, 2);
    const f4 = shiftAll(f3, 1, 1);
    const results = correctLateralityForSequence([f0, f1, f2, f3, f4]);
    expect(results.filter((r) => r.result.corrected)).toHaveLength(0);
  });

  it("MediaPipeが複数フレーム連続で取り違えても、毎回一貫して補正し続ける（反転しっぱなしにならない）", () => {
    const f0 = makeLandmarks();
    // MediaPipeが3フレーム連続で左右を取り違え続けているケース（実際に起こりうる）。
    const f1 = fullySwap(shiftAll(f0, 3, 2));
    const f2 = fullySwap(shiftAll(f0, 6, 4));
    const f3 = fullySwap(shiftAll(f0, 9, 6));
    const results = correctLateralityForSequence([f0, f1, f2, f3]);

    expect(results[1].result.corrected).toBe(true);
    expect(results[2].result.corrected).toBe(true);
    expect(results[3].result.corrected).toBe(true);
  });

  it("空のフレーム列でも例外を投げない", () => {
    expect(() => correctLateralityForSequence([])).not.toThrow();
    expect(correctLateralityForSequence([])).toEqual([]);
  });

  it("confidenceは常に0〜1の範囲でNaNにならない", () => {
    const reference = makeLandmarks();
    const cases = [
      shiftAll(reference, 2, 1),
      fullySwap(shiftAll(reference, 3, 2)),
      swapPair(makeLandmarks(), P.LEFT_WRIST, P.RIGHT_WRIST),
    ];

    for (const candidate of cases) {
      const { result } = correctLateralityForFrame(candidate, reference, 1);
      expect(Number.isFinite(result.confidence)).toBe(true);
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    }
  });
});
