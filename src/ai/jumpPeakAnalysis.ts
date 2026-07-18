// =============================================================
// jumpPeakAnalyzer.tsから抽出した、React/DOM非依存の純粋処理。
// 体の高さスコア計算・最高点候補の比較・骨格点からのフォーム計算・
// フォーム評価文言生成を担う。
// =============================================================

import type { PoseLandmarkerResult } from "@mediapipe/tasks-vision";
import { getBodyJoints } from "./poseLandmarks";
import { calculateAngle } from "./poseMath";
import type { FormAnalysisResult } from "./poseTypes";

// 体の高さスコア＝手首と腰の高さの重み付き平均（yが小さいほど高い）
export const WRIST_HEIGHT_WEIGHT = 0.75;
export const HIP_HEIGHT_WEIGHT = 0.25;

// 最高点探索では2フレームおきにスキャンする
export const PEAK_SCAN_FRAME_STRIDE = 2;

// ---------------------------------------------------------
// スコア計算
// ---------------------------------------------------------

/** 体の高さスコア。小さいほど高い位置にいる。骨格点が欠けていればnull */
export function getBodyHeightScore(result: PoseLandmarkerResult): number | null {
  const landmarks = result.landmarks[0];

  if (!landmarks) {
    return null;
  }

  const joints = getBodyJoints(landmarks);
  const { leftWrist, rightWrist, leftHip, rightHip } = joints;

  if (!leftWrist || !rightWrist || !leftHip || !rightHip) {
    return null;
  }

  const wristY = Math.min(leftWrist.y, rightWrist.y);
  const hipY = (leftHip.y + rightHip.y) / 2;

  return wristY * WRIST_HEIGHT_WEIGHT + hipY * HIP_HEIGHT_WEIGHT;
}

// ---------------------------------------------------------
// 最高点候補の比較・選択
// ---------------------------------------------------------

export type PeakCandidate = {
  time: number;
  score: number;
};

export type PeakSelection = PeakCandidate | null;

/** スコアが小さい方を最高点として採用する。同点の場合は先に見つかった方を維持する */
export function selectBetterPeak(
  current: PeakSelection,
  candidate: PeakCandidate
): PeakSelection {
  if (!current || candidate.score < current.score) {
    return candidate;
  }

  return current;
}

// ---------------------------------------------------------
// フォーム解析
// ---------------------------------------------------------

/** 骨格の相対位置と膝角度からフォーム評価テキストを生成する */
export function analyzeJumpForm(params: {
  shoulderY: number;
  elbowY: number;
  hipY: number;
  kneeAngle: number;
}): FormAnalysisResult {
  const { shoulderY, elbowY, hipY, kneeAngle } = params;

  const elbowDiff = elbowY - shoulderY;
  const hipDiff = hipY - shoulderY;

  const elbowText =
    elbowDiff > 0
      ? `肘の位置は肩より下にあります。差分：約 ${elbowDiff.toFixed(3)}`
      : elbowDiff < 0
      ? `肘の位置は肩より上にあります。差分：約 ${Math.abs(elbowDiff).toFixed(3)}`
      : "肘の位置は肩とほぼ同じ高さです。";

  const postureText =
    hipDiff > 0
      ? `腰の位置は肩より下にあります。差分：約 ${hipDiff.toFixed(3)}`
      : hipDiff < 0
      ? `腰の位置は肩より上にあります。差分：約 ${Math.abs(hipDiff).toFixed(3)}`
      : "腰の位置は肩とほぼ同じ高さです。";

  const kneeText = `膝角度：約 ${kneeAngle.toFixed(1)}°`;

  const summary = [
    "最高点候補フレームにおける骨格情報です。",
    `肘-肩の高さ差：${elbowDiff.toFixed(3)}`,
    `腰-肩の高さ差：${hipDiff.toFixed(3)}`,
    `膝角度：${kneeAngle.toFixed(1)}°`,
  ].join("\n");

  return {
    elbowText,
    postureText,
    kneeText,
    summary,
  };
}

/** 検出結果からフォーム解析を行う。必要な骨格点が欠けていればnull */
export function analyzeFormFromPose(
  result: PoseLandmarkerResult
): FormAnalysisResult | null {
  const landmarks = result.landmarks[0];

  if (!landmarks) {
    return null;
  }

  const joints = getBodyJoints(landmarks);
  const {
    leftShoulder,
    rightShoulder,
    leftElbow,
    rightElbow,
    leftHip,
    rightHip,
    leftKnee,
    rightKnee,
    leftAnkle,
    rightAnkle,
  } = joints;

  if (
    !leftShoulder ||
    !rightShoulder ||
    !leftElbow ||
    !rightElbow ||
    !leftHip ||
    !rightHip ||
    !leftKnee ||
    !rightKnee ||
    !leftAnkle ||
    !rightAnkle
  ) {
    return null;
  }

  const shoulderY = Math.min(leftShoulder.y, rightShoulder.y);
  const elbowY = Math.min(leftElbow.y, rightElbow.y);
  const hipY = (leftHip.y + rightHip.y) / 2;

  const leftKneeAngle = calculateAngle(leftHip, leftKnee, leftAnkle);
  const rightKneeAngle = calculateAngle(rightHip, rightKnee, rightAnkle);
  const kneeAngle = Math.max(leftKneeAngle, rightKneeAngle);

  return analyzeJumpForm({
    shoulderY,
    elbowY,
    hipY,
    kneeAngle,
  });
}
