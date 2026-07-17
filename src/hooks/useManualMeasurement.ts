import { useMemo, useState } from "react";

import type { MarkerTarget } from "../types/measurement";
import type { Point } from "../types/point";

import { calculateMaxReach, calculateReachError } from "../utils/jumpCalculator";
import { calculateBallSpeed, calculateSpeedError } from "../utils/speedCalculator";

import {
  INITIAL_MANUAL_MEASUREMENT_DATA,
  clearMarker as clearMarkerData,
  computeAirFrameCount,
  computeAirTimeSec,
  computeEstimatedJumpHeightCm,
  placeMarker as placeMarkerData,
  resetManualMeasurementData,
  saveMeasurementTime,
  type ManualMeasurementData,
  type MeasurementLabel,
} from "../utils/manualMeasurement";

type Params = {
  knownCm: number;
  ringHeight: number;
  standingReach: number;
};

/**
 * 手動計測（マーカー・離地/着地時刻）の状態と派生値をまとめて管理するフック。
 * 計算式自体は jumpCalculator / speedCalculator / manualMeasurement の
 * 既存関数をそのまま呼び出すだけで、新しい計算ロジックは持たない。
 */
export function useManualMeasurement({ knownCm, ringHeight, standingReach }: Params) {
  const [markerTarget, setMarkerTarget] = useState<MarkerTarget>("calibA");
  const [data, setData] = useState<ManualMeasurementData>(INITIAL_MANUAL_MEASUREMENT_DATA);

  const placeMarker = (target: MarkerTarget, point: Point) => {
    setData((prev) => placeMarkerData(prev, target, point));
  };

  const clearMarker = (target: MarkerTarget) => {
    setData((prev) => clearMarkerData(prev, target));
  };

  const saveTime = (label: MeasurementLabel, time: number, frame: number) => {
    setData((prev) => saveMeasurementTime(prev, label, time, frame));
  };

  const reset = () => {
    setData(resetManualMeasurementData());
  };

  const takeoffTime = data.takeoff?.time ?? null;
  const takeoffFrame = data.takeoff?.frame ?? null;
  const landingTime = data.landing?.time ?? null;
  const landingFrame = data.landing?.frame ?? null;

  const maxReach = useMemo(
    () => calculateMaxReach({ markers: data.markers, knownCm, ringHeight }),
    [data.markers, knownCm, ringHeight]
  );

  const jumpHeight = useMemo(() => {
    if (!maxReach) return null;
    return maxReach - standingReach;
  }, [maxReach, standingReach]);

  const airTime = useMemo(
    () => computeAirTimeSec(takeoffTime, landingTime),
    [takeoffTime, landingTime]
  );

  const airFrameCount = useMemo(
    () => computeAirFrameCount(takeoffFrame, landingFrame),
    [takeoffFrame, landingFrame]
  );

  const estimatedJumpHeight = useMemo(
    () => computeEstimatedJumpHeightCm(airTime),
    [airTime]
  );

  const reachError = useMemo(
    () => calculateReachError(data.markers, knownCm),
    [data.markers, knownCm]
  );

  const ballSpeed = useMemo(
    () =>
      calculateBallSpeed({
        markers: data.markers,
        knownCm,
        timeA: takeoffTime,
        timeB: landingTime,
      }),
    [data.markers, knownCm, takeoffTime, landingTime]
  );

  const speedError = useMemo(() => calculateSpeedError(ballSpeed), [ballSpeed]);

  return {
    markerTarget,
    setMarkerTarget,
    markers: data.markers,
    placeMarker,
    clearMarker,
    takeoffTime,
    takeoffFrame,
    landingTime,
    landingFrame,
    saveTime,
    reset,
    maxReach,
    jumpHeight,
    airTime,
    airFrameCount,
    estimatedJumpHeight,
    reachError,
    ballSpeed,
    speedError,
  };
}
