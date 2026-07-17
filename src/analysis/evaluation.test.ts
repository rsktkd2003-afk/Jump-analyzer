import { describe, expect, it } from "vitest";
import {
  scoreAerialAlignment,
  scoreAerialAngle,
  scoreExtraMotion,
  scoreToStars,
} from "../ai/spikeFormEvaluation";
import { evaluateFeature } from "./evaluation";
import type { Feature } from "./types";

function feature(key: Feature["key"], value: number): Feature {
  return {
    key,
    label: key,
    phase: "takeoff",
    region: "trunk",
    value,
    unit: "deg",
    confidence: 1,
  };
}

describe("空中姿勢スコア", () => {
  it("40〜50度を理想帯として高評価にする", () => {
    expect(scoreAerialAngle(40)).toBeGreaterThanOrEqual(90);
    expect(scoreAerialAngle(45)).toBe(100);
    expect(scoreAerialAngle(50)).toBeGreaterThanOrEqual(90);
  });

  it("一直線性と揺り戻しを境界値どおりに評価する", () => {
    expect(scoreAerialAlignment(0.04)).toBe(90);
    expect(scoreAerialAlignment(0.08)).toBe(70);
    expect(scoreExtraMotion(0)).toBe(100);
    expect(scoreExtraMotion(3)).toBe(30);
  });

  it("0〜100点を星1〜5へ変換する", () => {
    expect(scoreToStars(90)).toBe(5);
    expect(scoreToStars(75)).toBe(4);
    expect(scoreToStars(60)).toBe(3);
    expect(scoreToStars(40)).toBe(2);
    expect(scoreToStars(39.9)).toBe(1);
  });
});

describe("特徴量の星評価", () => {
  it("打つ側の肩が6度以上高い場合を星5にする", () => {
    expect(evaluateFeature(feature("peak.shoulderTilt", 6))?.stars).toBe(5);
  });

  it("踏切時間0.35秒を星5、0.36秒を星4にする", () => {
    expect(evaluateFeature(feature("takeoff.contactTimeSec", 0.35))?.stars).toBe(5);
    expect(evaluateFeature(feature("takeoff.contactTimeSec", 0.36))?.stars).toBe(4);
  });

  it.each([
    { key: "takeoff.kneeMinAngle", value: 100, stars: 5 },
    { key: "takeoff.hipMinAngle", value: 95, stars: 5 },
    { key: "takeoff.sinkDurationSec", value: 0.36, stars: 3 },
    { key: "takeoff.maxExtensionVelocity", value: 400, stars: 4 },
    { key: "symmetry.kneeDiff", value: 16, stars: 2 },
    { key: "air.postureStability", value: 7.1, stars: 2 },
    { key: "air.timeSec", value: 0.5, stars: 4 },
    { key: "contact.wristPeakToBodyPeakTimeDiff", value: 0.16, stars: 2 },
    { key: "arm.swingVelocity", value: 3.5, stars: 3 },
    { key: "approach.speed", value: 3, stars: 4 },
    { key: "landing.impactIndex", value: 7.6, stars: 2 },
    { key: "landing.kneeAbsorption", value: 12, stars: 3 },
    { key: "air.horizontalDrift", value: 0.61, stars: 3 },
  ] as const)(
    "$key=$valueを星$starsとして評価する",
    ({ key, value, stars }) => {
      expect(evaluateFeature(feature(key, value))?.stars).toBe(stars);
    }
  );

  it.each([
    { value: 6, stars: 5 },
    { value: 0, stars: 4 },
    { value: -4, stars: 3 },
    { value: -8, stars: 2 },
    { value: -8.1, stars: 1 },
  ])("肩の傾き$value度を星$starsとして評価する", ({ value, stars }) => {
    expect(evaluateFeature(feature("peak.shoulderTilt", value))?.stars).toBe(stars);
  });

  it("未対応の特徴量は星評価しない", () => {
    expect(evaluateFeature(feature("unknown.feature", 1))).toBeNull();
  });
});
