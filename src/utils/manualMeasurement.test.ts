import { describe, expect, it } from "vitest";
import type { Markers } from "../types/measurement";
import {
  INITIAL_MANUAL_MEASUREMENT_DATA,
  clearMarker,
  computeAirFrameCount,
  computeAirTimeSec,
  computeEstimatedJumpHeightCm,
  computeSteppedTime,
  placeMarker,
  resetManualMeasurementData,
  saveMeasurementTime,
  toNaturalPoint,
  type ManualMeasurementData,
} from "./manualMeasurement";
import { calculateMaxReach, calculateReachError } from "./jumpCalculator";
import { calculateBallSpeed } from "./speedCalculator";

describe("manualMeasurement: 初期状態", () => {
  it("全マーカーと離地・着地情報がnull", () => {
    expect(INITIAL_MANUAL_MEASUREMENT_DATA.markers).toEqual({
      calibA: null,
      calibB: null,
      ring: null,
      finger: null,
      ballA: null,
      ballB: null,
    });
    expect(INITIAL_MANUAL_MEASUREMENT_DATA.takeoff).toBeNull();
    expect(INITIAL_MANUAL_MEASUREMENT_DATA.landing).toBeNull();
  });
});

describe("manualMeasurement: マーカー設置・削除", () => {
  it("指定したマーカーだけ設置できる", () => {
    const result = placeMarker(
      INITIAL_MANUAL_MEASUREMENT_DATA,
      "ring",
      { x: 10, y: 20 }
    );

    expect(result.markers.ring).toEqual({ x: 10, y: 20 });
    expect(result.markers.calibA).toBeNull();
    expect(result.markers.finger).toBeNull();
  });

  it("指定したマーカーだけ削除できる（他は残る）", () => {
    let data = placeMarker(INITIAL_MANUAL_MEASUREMENT_DATA, "ring", { x: 10, y: 20 });
    data = placeMarker(data, "finger", { x: 30, y: 40 });

    const result = clearMarker(data, "ring");

    expect(result.markers.ring).toBeNull();
    expect(result.markers.finger).toEqual({ x: 30, y: 40 });
  });
});

describe("manualMeasurement: 離地・着地の保存", () => {
  it("離地は takeoff、着地は landing の正しい場所へ保存される", () => {
    let data = saveMeasurementTime(INITIAL_MANUAL_MEASUREMENT_DATA, "takeoff", 1.2, 36);
    data = saveMeasurementTime(data, "landing", 1.7, 51);

    expect(data.takeoff).toEqual({ time: 1.2, frame: 36 });
    expect(data.landing).toEqual({ time: 1.7, frame: 51 });
  });

  it("同じラベルを再保存すると上書きされる", () => {
    let data = saveMeasurementTime(INITIAL_MANUAL_MEASUREMENT_DATA, "takeoff", 1.0, 30);
    data = saveMeasurementTime(data, "takeoff", 1.1, 33);

    expect(data.takeoff).toEqual({ time: 1.1, frame: 33 });
    expect(data.landing).toBeNull();
  });
});

describe("manualMeasurement: リセット", () => {
  it("resetで手動計測データ（マーカー・離地・着地）だけ初期化される", () => {
    let dirtyData: ManualMeasurementData = placeMarker(
      INITIAL_MANUAL_MEASUREMENT_DATA,
      "calibA",
      { x: 1, y: 2 }
    );
    dirtyData = saveMeasurementTime(dirtyData, "takeoff", 1.0, 30);
    dirtyData = saveMeasurementTime(dirtyData, "landing", 1.5, 45);

    // マーカー設置・時刻保存後は初期状態と異なることを確認した上で、
    // resetManualMeasurementData() が入力に関わらず常に初期状態を返すことを検証する。
    expect(dirtyData).not.toEqual(INITIAL_MANUAL_MEASUREMENT_DATA);

    const result = resetManualMeasurementData();

    expect(result).toEqual(INITIAL_MANUAL_MEASUREMENT_DATA);
    expect(result.markers.calibA).toBeNull();
    expect(result.takeoff).toBeNull();
    expect(result.landing).toBeNull();
  });
});

describe("manualMeasurement: 既存計算式との整合性（100pxが50cmの基準）", () => {
  const markers: Markers = {
    calibA: { x: 0, y: 0 },
    calibB: { x: 0, y: 100 },
    ring: { x: 100, y: 200 },
    finger: { x: 100, y: 180 },
    ballA: { x: 0, y: 0 },
    ballB: { x: 100, y: 0 },
  };

  it("calculateMaxReachの結果が既存テストと同じ", () => {
    expect(calculateMaxReach({ markers, knownCm: 50, ringHeight: 305 })).toBeCloseTo(315);
  });

  it("calculateReachErrorの結果が既存テストと同じ", () => {
    expect(calculateReachError(markers, 50)).toBeCloseTo(3);
  });

  it("calculateBallSpeedの結果が同じ基準・計算式で一致する", () => {
    // cmPerPx = 50/100 = 0.5、ballA-ballB距離100px → 50cm → 0.5m、1秒 → 1.8km/h
    expect(
      calculateBallSpeed({ markers, knownCm: 50, timeA: 1, timeB: 2 })
    ).toBeCloseTo(1.8);
  });
});

describe("manualMeasurement: 派生値の計算式が旧実装と一致する", () => {
  it("computeAirTimeSec: 離地・着地の絶対差を返す", () => {
    expect(computeAirTimeSec(1.0, 1.5)).toBeCloseTo(0.5);
    expect(computeAirTimeSec(1.5, 1.0)).toBeCloseTo(0.5);
  });

  it("computeAirTimeSec: 片方がnull、または差が0以下ならnull", () => {
    expect(computeAirTimeSec(null, 1.5)).toBeNull();
    expect(computeAirTimeSec(1.0, null)).toBeNull();
    expect(computeAirTimeSec(1.0, 1.0)).toBeNull();
  });

  it("computeAirFrameCount: 離地・着地フレームの絶対差を返す", () => {
    expect(computeAirFrameCount(30, 45)).toBe(15);
    expect(computeAirFrameCount(45, 30)).toBe(15);
  });

  it("computeAirFrameCount: 片方がnull、または差が0以下ならnull", () => {
    expect(computeAirFrameCount(null, 45)).toBeNull();
    expect(computeAirFrameCount(30, null)).toBeNull();
    expect(computeAirFrameCount(30, 30)).toBeNull();
  });

  it("computeEstimatedJumpHeightCm: 滞空時間法の式(9.81*t^2/8*100)と一致する", () => {
    const airTime = 0.6;
    expect(computeEstimatedJumpHeightCm(airTime)).toBeCloseTo(
      ((9.81 * airTime * airTime) / 8) * 100
    );
  });

  it("computeEstimatedJumpHeightCm: airTimeがnullまたは0ならnull", () => {
    expect(computeEstimatedJumpHeightCm(null)).toBeNull();
    expect(computeEstimatedJumpHeightCm(0)).toBeNull();
  });
});

describe("manualMeasurement: 動画座標変換", () => {
  it("表示座標から動画自然座標へ変換する", () => {
    const point = toNaturalPoint(
      { x: 150, y: 100 },
      { left: 50, top: 50, width: 200, height: 100 },
      { width: 800, height: 400 }
    );

    expect(point.x).toBeCloseTo(400);
    expect(point.y).toBeCloseTo(200);
  });

  it("表示サイズが変わっても同じ相対クリック位置なら同じ自然座標になる", () => {
    const naturalSize = { width: 1920, height: 1080 };

    const small = toNaturalPoint(
      { x: 60, y: 45 },
      { left: 0, top: 0, width: 200, height: 100 },
      naturalSize
    );

    const large = toNaturalPoint(
      { x: 300, y: 225 },
      { left: 0, top: 0, width: 1000, height: 500 },
      naturalSize
    );

    expect(small.x).toBeCloseTo(large.x);
    expect(small.y).toBeCloseTo(large.y);
  });
});

describe("manualMeasurement: コマ送り時刻計算", () => {
  it("+1Fで1/fps秒進む", () => {
    const next = computeSteppedTime({
      currentTime: 1.0,
      duration: 10,
      fps: 30,
      direction: 1,
    });
    expect(next).toBeCloseTo(1.0 + 1 / 30);
  });

  it("-1Fで1/fps秒戻る", () => {
    const next = computeSteppedTime({
      currentTime: 1.0,
      duration: 10,
      fps: 30,
      direction: -1,
    });
    expect(next).toBeCloseTo(1.0 - 1 / 30);
  });

  it("0秒未満にならない", () => {
    const next = computeSteppedTime({
      currentTime: 0,
      duration: 10,
      fps: 30,
      direction: -1,
    });
    expect(next).toBe(0);
  });

  it("動画時間を超えない", () => {
    const next = computeSteppedTime({
      currentTime: 10,
      duration: 10,
      fps: 30,
      direction: 1,
    });
    expect(next).toBe(10);
  });

  it.each([0, -30, NaN, Infinity, -Infinity])(
    "fpsが%sの場合は不正な時刻(NaN/Infinity)を生成せず、現在時刻をクランプして返す",
    (fps) => {
      const next = computeSteppedTime({
        currentTime: 5,
        duration: 10,
        fps,
        direction: 1,
      });
      expect(Number.isFinite(next)).toBe(true);
      expect(next).toBe(5);
    }
  );

  it("fpsが不正でも現在時刻自体は[0, duration]へクランプされる", () => {
    const next = computeSteppedTime({
      currentTime: 999,
      duration: 10,
      fps: NaN,
      direction: 1,
    });
    expect(next).toBe(10);
  });
});
