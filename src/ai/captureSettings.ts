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

export function captureSettingsLabel(settings: CaptureSettings): string {
  if (isCaptureSettingsUnknown(settings)) return "未入力";

  const viewLabels: Record<CameraView, string> = {
    side: "横",
    front: "正面",
    back: "後ろ",
    frontDiagonal: "斜め前",
    backDiagonal: "斜め後ろ",
    unknown: "未入力",
  };

  const framingLabels: Record<CameraFraming, string> = {
    close: "全身が大きく映る",
    normal: "全身＋少し余白",
    wide: "コートが広く映る",
    far: "遠距離",
    unknown: "未入力",
  };

  const distanceLabels: Record<CameraDistance, string> = {
    near: "近い",
    normal: "普通",
    far: "遠い",
    unknown: "わからない",
  };

  return `${viewLabels[settings.cameraView]} / ${framingLabels[settings.framing]} / ${distanceLabels[settings.distance]}`;
}