export type CameraView =
  | "side"
  | "front"
  | "back"
  | "frontDiagonal"
  | "backDiagonal"
  | "unknown";

export type CameraFraming =
  | "close"
  | "normal"
  | "wide"
  | "far"
  | "unknown";

export type CameraDistance =
  | "near"
  | "normal"
  | "far"
  | "unknown";

export type CaptureSettings = {
  cameraView: CameraView;
  framing: CameraFraming;
  distance: CameraDistance;
};

export const DEFAULT_CAPTURE_SETTINGS: CaptureSettings = {
  cameraView: "unknown",
  framing: "unknown",
  distance: "unknown",
};

export function isCaptureSettingsUnknown(settings: CaptureSettings): boolean {
  return (
    settings.cameraView === "unknown" &&
    settings.framing === "unknown" &&
    settings.distance === "unknown"
  );
}

const VIEW_LABELS: Record<CameraView, string> = {
  side: "横",
  front: "正面",
  back: "後ろ",
  frontDiagonal: "斜め前",
  backDiagonal: "斜め後ろ",
  unknown: "未入力",
};

const FRAMING_LABELS: Record<CameraFraming, string> = {
  close: "全身が大きく映る",
  normal: "全身＋少し余白",
  wide: "コートが広く映る",
  far: "遠距離",
  unknown: "未入力",
};

const DISTANCE_LABELS: Record<CameraDistance, string> = {
  near: "近い",
  normal: "普通",
  far: "遠い",
  unknown: "わからない",
};

export function captureSettingsLabel(settings: CaptureSettings): string {
  if (isCaptureSettingsUnknown(settings)) return "未入力";

  return `${VIEW_LABELS[settings.cameraView]} / ${FRAMING_LABELS[settings.framing]} / ${DISTANCE_LABELS[settings.distance]}`;
}

/** 撮影方向・画角・撮影距離を個別の日本語ラベルとして取得する（履歴保存・表示用）。 */
export function captureSettingLabelParts(settings: CaptureSettings): {
  direction: string;
  framing: string;
  distance: string;
} {
  return {
    direction: VIEW_LABELS[settings.cameraView],
    framing: FRAMING_LABELS[settings.framing],
    distance: DISTANCE_LABELS[settings.distance],
  };
}