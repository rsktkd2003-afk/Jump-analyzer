export type ReachEstimateMethod =
  | "calibration"
  | "known-max-reach"
  | "flight-time";

export type ReachEstimateConfidence = "高" | "中" | "低";

export type ReachEstimateInput = {
  standingReachCm: number | null;
  heightCm: number | null;
  calibrationMaxReachCm: number | null;
  flightTimeJumpHeightCm: number | null;
  knownMaxReachCm: number | null;
  calibrationErrorCm: number | null;
};

export type ReachEstimateResult = {
  estimatedMaxReachCm: number | null;
  estimatedJumpHeightCm: number | null;
  standingReachCm: number | null;
  heightCm: number | null;
  method: ReachEstimateMethod | null;
  methodLabel: string;
  scaleInfo: string;
  confidence: ReachEstimateConfidence | null;
  confidenceText: string;
  note: string;
};

const MIN_REASONABLE_STANDING_REACH_CM = 100;
const MAX_REASONABLE_STANDING_REACH_CM = 300;
const MIN_REASONABLE_HEIGHT_CM = 120;
const MAX_REASONABLE_HEIGHT_CM = 230;
const HIGH_CONFIDENCE_ERROR_CM = 5;
const MEDIUM_CONFIDENCE_ERROR_CM = 12;

function isValidPositive(value: number | null): value is number {
  return value !== null && Number.isFinite(value) && value > 0;
}

function normalizeStandingReach(value: number | null): number | null {
  if (!isValidPositive(value)) return null;
  if (value < MIN_REASONABLE_STANDING_REACH_CM) return null;
  if (value > MAX_REASONABLE_STANDING_REACH_CM) return null;
  return value;
}

function normalizeHeight(value: number | null): number | null {
  if (!isValidPositive(value)) return null;
  if (value < MIN_REASONABLE_HEIGHT_CM) return null;
  if (value > MAX_REASONABLE_HEIGHT_CM) return null;
  return value;
}

function confidenceFromCalibrationError(
  errorCm: number | null
): ReachEstimateConfidence {
  if (!isValidPositive(errorCm)) return "中";
  if (errorCm <= HIGH_CONFIDENCE_ERROR_CM) return "高";
  if (errorCm <= MEDIUM_CONFIDENCE_ERROR_CM) return "中";
  return "低";
}

function confidenceText(confidence: ReachEstimateConfidence | null): string {
  if (confidence === "高") {
    return "信頼度：高。基準点または入力値が比較的安定しています。";
  }

  if (confidence === "中") {
    return "信頼度：中。動画の画角や基準点の取り方で誤差が出ます。";
  }

  if (confidence === "低") {
    return "信頼度：低。参考値として見てください。";
  }

  return "信頼度：未算出。指高または換算に必要な情報が不足しています。";
}

function buildResult(params: {
  standingReachCm: number | null;
  heightCm: number | null;
  estimatedMaxReachCm: number | null;
  method: ReachEstimateMethod | null;
  methodLabel: string;
  scaleInfo: string;
  confidence: ReachEstimateConfidence | null;
}): ReachEstimateResult {
  const estimatedJumpHeightCm =
    params.estimatedMaxReachCm !== null && params.standingReachCm !== null
      ? params.estimatedMaxReachCm - params.standingReachCm
      : null;

  return {
    estimatedMaxReachCm: params.estimatedMaxReachCm,
    estimatedJumpHeightCm,
    standingReachCm: params.standingReachCm,
    heightCm: params.heightCm,
    method: params.method,
    methodLabel: params.methodLabel,
    scaleInfo: params.scaleInfo,
    confidence: params.confidence,
    confidenceText: confidenceText(params.confidence),
    note: "カメラ距離・奥行き・画角の影響を受けるため、正確な測定値ではなく推定値です。",
  };
}

export function estimateReachFromInputs(
  input: ReachEstimateInput
): ReachEstimateResult {
  const standingReachCm = normalizeStandingReach(input.standingReachCm);
  const heightCm = normalizeHeight(input.heightCm);

  if (standingReachCm === null) {
    return buildResult({
      standingReachCm,
      heightCm,
      estimatedMaxReachCm: null,
      method: null,
      methodLabel: "未算出",
      scaleInfo: "指高cmが未入力または範囲外のため、cm換算を表示していません。",
      confidence: null,
    });
  }

  if (isValidPositive(input.calibrationMaxReachCm)) {
    const confidence = confidenceFromCalibrationError(input.calibrationErrorCm);

    return buildResult({
      standingReachCm,
      heightCm,
      estimatedMaxReachCm: input.calibrationMaxReachCm,
      method: "calibration",
      methodLabel: "基準A/Bキャリブレーション方式",
      scaleInfo:
        "基準A/Bでcm/pxを作り、リング・指先マーカーから最高到達点を推定しています。",
      confidence,
    });
  }

  if (isValidPositive(input.knownMaxReachCm)) {
    return buildResult({
      standingReachCm,
      heightCm,
      estimatedMaxReachCm: input.knownMaxReachCm,
      method: "known-max-reach",
      methodLabel: "既知の最高到達点入力方式",
      scaleInfo:
        "入力された既知の最高到達点を優先し、指高との差からジャンプ高を表示しています。",
      confidence: "高",
    });
  }

  if (isValidPositive(input.flightTimeJumpHeightCm)) {
    return buildResult({
      standingReachCm,
      heightCm,
      estimatedMaxReachCm: standingReachCm + input.flightTimeJumpHeightCm,
      method: "flight-time",
      methodLabel: "滞空時間推定方式",
      scaleInfo:
        "離地A〜着地Bの滞空時間からジャンプ高を推定し、指高に加算しています。",
      confidence: "低",
    });
  }

  return buildResult({
    standingReachCm,
    heightCm,
    estimatedMaxReachCm: null,
    method: null,
    methodLabel: "未算出",
    scaleInfo:
      "基準A/B、既知の最高到達点、滞空時間のいずれも不足しているため、cm換算を表示していません。",
    confidence: null,
  });
}