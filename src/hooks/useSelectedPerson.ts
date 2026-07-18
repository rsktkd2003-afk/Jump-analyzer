import { useState } from "react";
import { toNaturalPoint } from "../utils/manualMeasurement";

export type SelectedPersonPoint = {
  x: number;
  y: number;
};

/**
 * 表示座標を動画の自然座標へ変換する。
 * マーカー設置（VideoPlayer.tsx）と同じ toNaturalPoint を使い、
 * 両者の座標変換結果が食い違わないようにする。
 */
export function computeSelectedPoint(
  clientPoint: { x: number; y: number },
  video: HTMLVideoElement
): SelectedPersonPoint {
  const rect = video.getBoundingClientRect();

  return toNaturalPoint(
    clientPoint,
    { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
    { width: video.videoWidth, height: video.videoHeight }
  );
}

export function useSelectedPerson() {
  const [selectedPoint, setSelectedPoint] =
    useState<SelectedPersonPoint | null>(null);

  const selectPerson = (
    e: React.MouseEvent<HTMLVideoElement>,
    video: HTMLVideoElement
  ) => {
    setSelectedPoint(
      computeSelectedPoint({ x: e.clientX, y: e.clientY }, video)
    );
  };

  const resetSelectedPerson = () => {
    setSelectedPoint(null);
  };

  return {
    selectedPoint,
    selectPerson,
    resetSelectedPerson,
  };
}