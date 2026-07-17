import { describe, expect, it } from "vitest";
import {
  differentiate,
  interpolateNulls,
  isReliableLandmark,
  medianOf,
  movingAverage,
  quantileOf,
  stdDevOf,
} from "./signalProcessing";

describe("signalProcessing", () => {
  it("visibility 0.5以上または未指定の骨格点を有効とする", () => {
    expect(isReliableLandmark({ x: 0, y: 0, visibility: 0.5 })).toBe(true);
    expect(isReliableLandmark({ x: 0, y: 0 })).toBe(true);
    expect(isReliableLandmark({ x: 0, y: 0, visibility: 0.49 })).toBe(false);
    expect(isReliableLandmark(undefined)).toBe(false);
  });

  it("内部欠測を線形補間し、先頭と末尾は最近傍値で埋める", () => {
    expect(interpolateNulls([null, 10, null, null, 40, null])).toEqual([
      10,
      10,
      20,
      30,
      40,
      40,
    ]);
  });

  it("全区間が欠測の場合はnullのまま返す", () => {
    expect(interpolateNulls([null, null, null])).toEqual([null, null, null]);
  });

  it("中心移動平均を端では利用可能な範囲だけで計算する", () => {
    expect(movingAverage([1, 2, 3, 4, 5], 3)).toEqual([
      1.5,
      2,
      3,
      4,
      4.5,
    ]);
    expect(movingAverage([null, null], 3)).toEqual([null, null]);
  });

  it("時刻差を使って端は片側差分、内部は中心差分を計算する", () => {
    expect(differentiate([0, 10, 20], [0, 1, 2])).toEqual([10, 10, 10]);
    expect(differentiate([0, null, 20], [0, 1, 2])).toEqual([
      null,
      null,
      null,
    ]);
    expect(differentiate([0, 10], [1, 1])).toEqual([null, null]);
  });

  it("中央値・分位点・標準偏差を現在の定義どおり計算する", () => {
    expect(medianOf([9, 1, 5, 3])).toBe(4);
    expect(medianOf([])).toBeNull();
    expect(quantileOf([0, 10, 20, 30], 0.5)).toBe(15);
    expect(quantileOf([0, 10, 20, 30], -1)).toBe(0);
    expect(quantileOf([0, 10, 20, 30], 2)).toBe(30);
    expect(stdDevOf([1, 2, 3])).toBeCloseTo(Math.sqrt(2 / 3));
    expect(stdDevOf([1, null])).toBeNull();
  });
});
