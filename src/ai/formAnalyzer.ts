export type FormAnalysisResult = {
  elbowText: string;
  postureText: string;
  kneeText: string;
  summary: string;
};

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