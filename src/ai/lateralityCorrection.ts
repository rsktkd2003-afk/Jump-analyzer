// =============================================================
// 左右関節の入れ替わり検出・補正。
//
// MediaPipeが返す左右ランドマークのインデックス（11=左肩 等）を無条件に
// 信頼せず、フレーム間の連続性（移動量）と身体構造（骨長・肩幅・骨盤幅）
// から「通常配置」と「左右交換配置」のどちらが自然かを比較する。
//
// 設計方針:
// - 画面上のx座標だけでは判定しない（スパイクの体幹回旋・腕の交差・
//   空中での脚交差では「左は画面左」という前提が成り立たないため）。
// - 判定は肩・股関節・膝・足首・肘・手首・踵・つま先の複数関節を
//   まとめて評価する。1関節だけで交換を決めない。
// - 体幹（肩・股関節）は交換されにくい前提で重みを高くし、
//   四肢（特に手首・足首）は自然に交差し得るため重みを下げる。
//   これにより「腕の交差だけ」「脚の交差だけ」では交換されない。
// - 比較基準は「直前フレームの生の姿勢」ではなく「直前フレームの
//   （このモジュールが出力した）補正済み姿勢」。補正済みの状態が
//   次フレームの基準になるため、単発の異常値だけでは頻繁に反転しない
//   （一度自然な状態に収束すると、そこから大きく逸脱しない限り
//   その状態が維持されやすい）。
// - 差が僅かな場合や、比較に使える可視ランドマークが少ない場合は
//   交換しない（元のMediaPipe出力を維持する）。
// =============================================================

import { POSE_LANDMARK } from "./poseLandmarks";
import type { LateralityCorrectionResult, TrackedLandmark } from "./poseTypes";

type LateralPair = {
  left: number;
  right: number;
  /** 判定コストへの寄与度。体幹に近いほど高く、四肢の末端ほど低い */
  weight: number;
  label: string;
};

/** 判定に使う左右対の関節。体幹（肩・股関節）を高い重みに、
 *  四肢の末端（手首・足首・踵・つま先）を低い重みにすることで、
 *  「腕の交差だけ」「脚の交差だけ」で全身の左右を交換しないようにする。 */
const LATERAL_PAIRS: LateralPair[] = [
  { left: POSE_LANDMARK.LEFT_SHOULDER, right: POSE_LANDMARK.RIGHT_SHOULDER, weight: 1.6, label: "shoulder" },
  { left: POSE_LANDMARK.LEFT_HIP, right: POSE_LANDMARK.RIGHT_HIP, weight: 1.6, label: "hip" },
  { left: POSE_LANDMARK.LEFT_ELBOW, right: POSE_LANDMARK.RIGHT_ELBOW, weight: 1.0, label: "elbow" },
  { left: POSE_LANDMARK.LEFT_KNEE, right: POSE_LANDMARK.RIGHT_KNEE, weight: 1.0, label: "knee" },
  { left: POSE_LANDMARK.LEFT_WRIST, right: POSE_LANDMARK.RIGHT_WRIST, weight: 0.6, label: "wrist" },
  { left: POSE_LANDMARK.LEFT_ANKLE, right: POSE_LANDMARK.RIGHT_ANKLE, weight: 0.6, label: "ankle" },
  { left: POSE_LANDMARK.LEFT_HEEL, right: POSE_LANDMARK.RIGHT_HEEL, weight: 0.5, label: "heel" },
  { left: POSE_LANDMARK.LEFT_FOOT_INDEX, right: POSE_LANDMARK.RIGHT_FOOT_INDEX, weight: 0.5, label: "footIndex" },
];

type BoneSegment = {
  a: number;
  b: number;
  weight: number;
  label: string;
};

/** 骨長チェックに使う区間。肩幅・骨盤幅を含めることで、
 *  「肩・股関節そのものが交換されているか」を移動量とは別の角度からも検証する。 */
const BONE_SEGMENTS: BoneSegment[] = [
  { a: POSE_LANDMARK.LEFT_SHOULDER, b: POSE_LANDMARK.RIGHT_SHOULDER, weight: 1.2, label: "shoulderWidth" },
  { a: POSE_LANDMARK.LEFT_HIP, b: POSE_LANDMARK.RIGHT_HIP, weight: 1.2, label: "hipWidth" },
  { a: POSE_LANDMARK.LEFT_SHOULDER, b: POSE_LANDMARK.LEFT_ELBOW, weight: 0.8, label: "leftUpperArm" },
  { a: POSE_LANDMARK.RIGHT_SHOULDER, b: POSE_LANDMARK.RIGHT_ELBOW, weight: 0.8, label: "rightUpperArm" },
  { a: POSE_LANDMARK.LEFT_ELBOW, b: POSE_LANDMARK.LEFT_WRIST, weight: 0.6, label: "leftForearm" },
  { a: POSE_LANDMARK.RIGHT_ELBOW, b: POSE_LANDMARK.RIGHT_WRIST, weight: 0.6, label: "rightForearm" },
  { a: POSE_LANDMARK.LEFT_HIP, b: POSE_LANDMARK.LEFT_KNEE, weight: 0.9, label: "leftThigh" },
  { a: POSE_LANDMARK.RIGHT_HIP, b: POSE_LANDMARK.RIGHT_KNEE, weight: 0.9, label: "rightThigh" },
  { a: POSE_LANDMARK.LEFT_KNEE, b: POSE_LANDMARK.LEFT_ANKLE, weight: 0.9, label: "leftShin" },
  { a: POSE_LANDMARK.RIGHT_KNEE, b: POSE_LANDMARK.RIGHT_ANKLE, weight: 0.9, label: "rightShin" },
];

/** この値未満のvisibilityの点は継続性・骨長比較から除外する */
const MIN_COMPARISON_VISIBILITY = 0.4;
/** 有効な左右対がこの数未満なら判定を見送る（可視性不足） */
const MIN_VALID_PAIRS = 3;
/** 交換後コストが交換前コストよりこの比率以上小さい場合のみ交換する（曖昧な差では交換しない） */
const SWAP_MARGIN_RATIO = 0.18;
/** コストの下限（ゼロ割・過敏反応を防ぐための床値） */
const MIN_COST_FLOOR = 4;
/** 移動量コストの重み */
const MOVEMENT_COST_WEIGHT = 1;
/** 骨長変化コストの重み */
const BONE_LENGTH_COST_WEIGHT = 1.4;

function isUsable(point: TrackedLandmark | undefined): point is TrackedLandmark {
  return !!point && (point.visibility ?? 1) >= MIN_COMPARISON_VISIBILITY;
}

function pointWeight(point: TrackedLandmark): number {
  // visibilityが未定義の場合は1（=フル信頼）として扱う
  return point.visibility ?? 1;
}

function distance(a: TrackedLandmark, b: TrackedLandmark): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * 左右対のランドマークインデックス一覧（[left, right]のタプル）。
 * Phase2の3D側で、2D側の左右交換判定と同じ交換をミラーする際に使う
 * （2Dと3Dで別々に左右判定をしないため、判定ロジックそのものではなく
 * 「どのインデックスが対になっているか」だけをここから再利用する）。
 */
export const LATERAL_LANDMARK_INDEX_PAIRS: ReadonlyArray<readonly [number, number]> =
  LATERAL_PAIRS.map((pair) => [pair.left, pair.right] as const);

/** 左右対をまとめて入れ替えたランドマーク配列を返す（それ以外の点は変更しない） */
export function swapLateralLandmarks(landmarks: TrackedLandmark[]): TrackedLandmark[] {
  const result = [...landmarks];

  for (const pair of LATERAL_PAIRS) {
    const left = landmarks[pair.left];
    const right = landmarks[pair.right];
    if (!left || !right) continue;
    result[pair.left] = right;
    result[pair.right] = left;
  }

  return result;
}

/**
 * 候補姿勢(candidate)が基準姿勢(reference)からどれだけ「不自然」かのコストを計算する。
 * 低いほど自然（=基準からの移動量・骨長変化が小さい）。
 */
function computeContinuityCost(
  candidate: TrackedLandmark[],
  reference: TrackedLandmark[]
): { cost: number; validPairCount: number; totalVisibilityWeight: number } {
  let cost = 0;
  let validPairCount = 0;
  let totalVisibilityWeight = 0;

  for (const pair of LATERAL_PAIRS) {
    const candLeft = candidate[pair.left];
    const candRight = candidate[pair.right];
    const refLeft = reference[pair.left];
    const refRight = reference[pair.right];

    if (isUsable(candLeft) && isUsable(refLeft)) {
      const w = pair.weight * Math.min(pointWeight(candLeft), pointWeight(refLeft));
      cost += distance(candLeft, refLeft) * w;
      totalVisibilityWeight += w;
      validPairCount += 1;
    }
    if (isUsable(candRight) && isUsable(refRight)) {
      const w = pair.weight * Math.min(pointWeight(candRight), pointWeight(refRight));
      cost += distance(candRight, refRight) * w;
      totalVisibilityWeight += w;
    }
  }

  let boneLengthCost = 0;
  for (const seg of BONE_SEGMENTS) {
    const candA = candidate[seg.a];
    const candB = candidate[seg.b];
    const refA = reference[seg.a];
    const refB = reference[seg.b];
    if (!isUsable(candA) || !isUsable(candB) || !isUsable(refA) || !isUsable(refB)) continue;

    const candLen = distance(candA, candB);
    const refLen = distance(refA, refB);
    const w =
      seg.weight *
      Math.min(pointWeight(candA), pointWeight(candB), pointWeight(refA), pointWeight(refB));
    boneLengthCost += Math.abs(candLen - refLen) * w;
  }

  return {
    cost: cost * MOVEMENT_COST_WEIGHT + boneLengthCost * BONE_LENGTH_COST_WEIGHT,
    validPairCount,
    totalVisibilityWeight,
  };
}

/** 開発環境専用のデバッグ出力。通常利用時（本番ビルド）では何も出力しない。 */
function logLateralityDebug(frameIndex: number, result: LateralityCorrectionResult): void {
  if (!import.meta.env.DEV) return;
  if (!result.corrected) return;
  console.debug(
    `[lateralityCorrection] frame ${frameIndex}: corrected (confidence=${result.confidence.toFixed(2)}, reason=${result.reason ?? "-"})`
  );
}

/**
 * 1フレーム分の左右入れ替わりを判定・補正する。
 * referenceが無い（先頭フレーム等）場合は判定できないため補正しない。
 */
export function correctLateralityForFrame(
  landmarks: TrackedLandmark[],
  reference: TrackedLandmark[] | null,
  frameIndex: number
): { landmarks: TrackedLandmark[]; result: LateralityCorrectionResult } {
  if (!reference) {
    return {
      landmarks,
      result: { corrected: false, confidence: 0, reason: "no-reference" },
    };
  }

  const normal = computeContinuityCost(landmarks, reference);

  if (normal.validPairCount < MIN_VALID_PAIRS) {
    const result: LateralityCorrectionResult = {
      corrected: false,
      confidence: 0,
      reason: "insufficient-visibility",
    };
    logLateralityDebug(frameIndex, result);
    return { landmarks, result };
  }

  const swappedLandmarks = swapLateralLandmarks(landmarks);
  const swapped = computeContinuityCost(swappedLandmarks, reference);

  const normalCost = Math.max(normal.cost, MIN_COST_FLOOR);
  const swappedCost = Math.max(swapped.cost, MIN_COST_FLOOR);

  const improvement = (normalCost - swappedCost) / normalCost;

  if (improvement > SWAP_MARGIN_RATIO) {
    const result: LateralityCorrectionResult = {
      corrected: true,
      confidence: Math.min(1, improvement),
      reason: "swap-more-continuous",
    };
    logLateralityDebug(frameIndex, result);
    return { landmarks: swappedLandmarks, result };
  }

  const result: LateralityCorrectionResult = {
    corrected: false,
    confidence: Math.min(1, Math.max(0, -improvement)),
    reason: improvement > 0 ? "ambiguous" : "normal-more-continuous",
  };
  logLateralityDebug(frameIndex, result);
  return { landmarks, result };
}

/**
 * フレーム列全体に対して左右入れ替わり補正を順に適用する。
 * 各フレームの基準（reference）には「直前フレームの補正済み結果」を使うため、
 * 一度自然な状態に収束すると単発の異常値だけでは反転しにくい。
 */
export function correctLateralityForSequence(
  landmarksSequence: TrackedLandmark[][]
): { landmarks: TrackedLandmark[]; result: LateralityCorrectionResult }[] {
  const output: { landmarks: TrackedLandmark[]; result: LateralityCorrectionResult }[] = [];
  let reference: TrackedLandmark[] | null = null;

  landmarksSequence.forEach((landmarks, index) => {
    const { landmarks: corrected, result } = correctLateralityForFrame(landmarks, reference, index);
    output.push({ landmarks: corrected, result });

    // 判定に使える可視点が十分だった場合のみ基準を更新する。
    // 可視性不足でスキップしたフレームは基準を古いまま維持し、
    // 遮蔽明けの1フレーム目だけで誤った基準に飛びつかないようにする。
    if (result.reason !== "insufficient-visibility") {
      reference = corrected;
    }
  });

  return output;
}
