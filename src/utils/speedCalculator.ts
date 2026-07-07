import type { Markers } from "../types/measurement";
import { distancePx } from "./geometry";
import { calculateCmPerPx } from "./jumpCalculator";

type SpeedParams = {
  markers: Markers;
  knownCm: number;
  timeA: number | null;
  timeB: number | null;
};

export const calculateBallSpeed = ({
  markers,
  knownCm,
  timeA,
  timeB,
}: SpeedParams): number | null => {
  const cmPerPx = calculateCmPerPx(markers, knownCm);

  if (
    !cmPerPx ||
    !markers.ballA ||
    !markers.ballB ||
    timeA === null ||
    timeB === null ||
    timeA === timeB
  ) {
    return null;
  }

  const distanceM = (distancePx(markers.ballA, markers.ballB) * cmPerPx) / 100;
  const timeSec = Math.abs(timeB - timeA);

  return (distanceM / timeSec) * 3.6;
};

export const calculateSpeedError = (speed: number | null): number | null => {
  if (!speed) return null;

  return speed * 0.12;
};