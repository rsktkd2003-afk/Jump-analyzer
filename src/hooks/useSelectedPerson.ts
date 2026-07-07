import { useState } from "react";

export type SelectedPersonPoint = {
  x: number;
  y: number;
};

export function useSelectedPerson() {
  const [selectedPoint, setSelectedPoint] =
    useState<SelectedPersonPoint | null>(null);

  const selectPerson = (
    e: React.MouseEvent<HTMLVideoElement>,
    video: HTMLVideoElement
  ) => {
    const rect = video.getBoundingClientRect();

    const scaleX = video.videoWidth / rect.width;
    const scaleY = video.videoHeight / rect.height;

    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    setSelectedPoint({ x, y });
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