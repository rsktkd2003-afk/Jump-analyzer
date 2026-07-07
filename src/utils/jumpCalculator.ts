import type { Markers } from "../types/measurement";
import { distancePx } from "./geometry";

type JumpParams = {
  markers: Markers;
  knownCm: number;
  ringHeight: number;
};

export const calculateCmPerPx = (
  markers: Markers,
  knownCm: number
): number | null => {
  const { calibA, calibB } = markers;

  if (!calibA || !calibB) return null;

  const px = distancePx(calibA, calibB);
  if (px === 0) return null;

  return knownCm / px;
};

export const calculateMaxReach = ({
  markers,
  knownCm,
  ringHeight,
}: JumpParams): number | null => {
  const cmPerPx = calculateCmPerPx(markers, knownCm);

  if (!cmPerPx || !markers.ring || !markers.finger) return null;

  return ringHeight + (markers.ring.y - markers.finger.y) * cmPerPx;
};

export const calculateReachError = (
  markers: Markers,
  knownCm: number
): number | null => {
  const cmPerPx = calculateCmPerPx(markers, knownCm);

  if (!cmPerPx) return null;

  return 3 * cmPerPx * 2;
};