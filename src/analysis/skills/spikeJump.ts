// =============================================================
// スパイクジャンプの競技分析。
// フェーズ分割は jumpPhaseEngine（接地判定ベース・順序保証・非重複）に
// 一本化し、このファイルは特徴量（競技指標）の抽出に専念する。
// visibility < 0.5 のフレームはエンジン側で補間/除外済み。
// =============================================================

import type { TrackedFrame } from "../../ai/poseAnalyzer";
import {
  findEnginePhase,
  getImpactWindowFrames,
  runJumpPhaseEngine,
  type JumpPhaseEngineResult,
} from "../../ai/jumpPhaseEngine";
import { movingAverage } from "../../ai/poseMath";
import type { Feature, PhaseSegment, SkillDefinition } from "../types";
import {
  average,
  calculateVisibilityConfidence,
  getSegmentFrames,
  normalizeByBody,
  stdDev,
  toSeries,
} from "../utils";

const LEFT_SHOULDER = 11;
const RIGHT_SHOULDER = 12;
const LEFT_WRIST = 15;
const RIGHT_WRIST = 16;
const LOWER_BODY_LANDMARKS = [23, 24, 25, 26, 27, 28];
const TRUNK_LANDMARKS = [11, 12, 23, 24];
const ARM_LANDMARKS = [11, 12, 13, 14, 15, 16];

/** 空中姿勢（打点前後の体軸・肩傾き）を判定する際の可視性しきい値 */
const AIR_POSTURE_MIN_VISIBILITY = 0.5;
/** 打点前後の角度系列に対する移動平均ウィンドウ（フレーム数） */
const AIR_POSTURE_SMOOTHING_WINDOW = 3;

function getAverageKneeAngle(frame: TrackedFrame): number | null {
  const values = [frame.leftKneeAngle, frame.rightKneeAngle].filter(
    (value): value is number => typeof value === "number"
  );
  return average(values);
}

function getAverageHipAngle(frame: TrackedFrame): number | null {
  const values = [frame.leftHipAngle, frame.rightHipAngle].filter(
    (value): value is number => typeof value === "number"
  );
  return average(values);
}

function pushFeature(features: Feature[], feature: Feature | null) {
  if (!feature) return;
  if (!Number.isFinite(feature.value)) return;
  features.push(feature);
}

// -------------------------------------------------------------
// セグメンテーション：エンジンの結果をPhaseSegmentへ変換
// -------------------------------------------------------------

function toPhaseSegments(
  frames: TrackedFrame[],
  engine: JumpPhaseEngineResult
): PhaseSegment[] {
  return engine.phases.map((phase) => ({
    phase: phase.name,
    startTime: phase.startTime,
    endTime: phase.endTime,
    startFrame: frames[phase.startIndex].frameIndex,
    endFrame: frames[phase.endIndex].frameIndex,
  }));
}

function segmentSpikeJump(frames: TrackedFrame[]): PhaseSegment[] {
  const engine = runJumpPhaseEngine(frames);
  if (!engine) return [];
  return toPhaseSegments(frames, engine);
}

// -------------------------------------------------------------
// 特徴量抽出
// -------------------------------------------------------------

/** 区間内の膝角度の最大伸展角速度（deg/秒）。踏切の爆発力の指標 */
function maxKneeExtensionVelocity(
  frames: TrackedFrame[],
  from: number,
  to: number
): number | null {
  let best: number | null = null;

  for (let i = Math.max(1, from + 1); i <= to && i < frames.length; i += 1) {
    const prev = getAverageKneeAngle(frames[i - 1]);
    const current = getAverageKneeAngle(frames[i]);
    if (prev === null || current === null) continue;

    const dt = frames[i].time - frames[i - 1].time;
    if (dt <= 0) continue;

    const velocity = (current - prev) / dt; // 伸展 = 角度増加 = 正
    if (velocity > 0 && (best === null || velocity > best)) {
      best = velocity;
    }
  }

  return best;
}

/** 区間内の手首の最大上向き速度（px/秒→体幹正規化して返す用の生値） */
function maxWristUpwardVelocityPx(
  frames: TrackedFrame[],
  from: number,
  to: number
): number | null {
  let best: number | null = null;

  for (let i = Math.max(1, from + 1); i <= to && i < frames.length; i += 1) {
    const dt = frames[i].time - frames[i - 1].time;
    if (dt <= 0) continue;

    for (const wristIndex of [LEFT_WRIST, RIGHT_WRIST]) {
      const prev = frames[i - 1].landmarks[wristIndex];
      const current = frames[i].landmarks[wristIndex];
      if (!prev || !current) continue;
      if ((prev.visibility ?? 1) < 0.5 || (current.visibility ?? 1) < 0.5) {
        continue;
      }

      // 画像座標はy下向き正。上向き速度 = -(dy/dt)
      const upward = -(current.y - prev.y) / dt;
      if (upward > 0 && (best === null || upward > best)) {
        best = upward;
      }
    }
  }

  return best;
}

/** 区間の左右膝角度差の平均（deg）。左右対称指数 */
function meanKneeAsymmetry(
  frames: TrackedFrame[],
  ranges: Array<[number, number]>
): number | null {
  const diffs: number[] = [];

  for (const [from, to] of ranges) {
    for (let i = from; i <= to && i < frames.length; i += 1) {
      const frame = frames[i];
      if (
        typeof frame.leftKneeAngle === "number" &&
        typeof frame.rightKneeAngle === "number"
      ) {
        diffs.push(Math.abs(frame.leftKneeAngle - frame.rightKneeAngle));
      }
    }
  }

  return average(diffs);
}

/** 区間内で最も高く上がった手首から打つ側を判定する（1フレームのブレに依存しない） */
function determineHittingSide(frames: TrackedFrame[]): "left" | "right" | null {
  let side: "left" | "right" | null = null;
  let bestY = Number.POSITIVE_INFINITY;

  for (const frame of frames) {
    for (const [wristIndex, candidate] of [
      [LEFT_WRIST, "left"],
      [RIGHT_WRIST, "right"],
    ] as const) {
      const wrist = frame.landmarks[wristIndex];
      if (!wrist || (wrist.visibility ?? 1) < AIR_POSTURE_MIN_VISIBILITY) continue;
      if (wrist.y < bestY) {
        bestY = wrist.y;
        side = candidate;
      }
    }
  }

  return side;
}

/**
 * 打つ側の肩が高いほど正になる、符号付きの肩ライン角度（deg）。
 * 0＝水平、正＝打つ側の肩が高い（理想方向）、負＝逆方向。
 */
function shoulderTiltForHittingSide(
  frame: TrackedFrame,
  side: "left" | "right"
): number | null {
  const left = frame.landmarks[LEFT_SHOULDER];
  const right = frame.landmarks[RIGHT_SHOULDER];
  if (!left || !right) return null;
  if (
    (left.visibility ?? 1) < AIR_POSTURE_MIN_VISIBILITY ||
    (right.visibility ?? 1) < AIR_POSTURE_MIN_VISIBILITY
  ) {
    return null;
  }

  const width = Math.hypot(right.x - left.x, right.y - left.y);
  if (width <= 0) return null;

  const raisedPx = side === "right" ? left.y - right.y : right.y - left.y;
  return (Math.atan2(raisedPx, width) * 180) / Math.PI;
}

function extractSpikeJump(
  frames: TrackedFrame[],
  segments: PhaseSegment[]
): Feature[] {
  if (frames.length === 0 || segments.length === 0) return [];

  const engine = runJumpPhaseEngine(frames);
  if (!engine) return [];

  const { events } = engine;
  const features: Feature[] = [];
  const times = frames.map((f) => f.time);

  const approach = findEnginePhase(engine, "approach");
  const landing = findEnginePhase(engine, "landing");

  const airFrom = events.takeoffIndex + 1;
  const airTo = events.landingIndex - 1;

  // --- 沈み込み時の膝角度（深さの指標） ---
  {
    const kneeStats = toSeries(
      getSegmentFrames(frames, events.sinkStartIndex, events.takeoffIndex),
      getAverageKneeAngle
    );
    const minKnee = kneeStats.reduce<number | null>(
      (min, p) => (min === null || p.value < min ? p.value : min),
      null
    );

    if (minKnee !== null) {
      pushFeature(features, {
        key: "takeoff.kneeMinAngle",
        label: "沈み込み時の膝角度",
        phase: "takeoff",
        region: "lowerBody",
        value: minKnee,
        unit: "deg",
        confidence: calculateVisibilityConfidence(
          getSegmentFrames(frames, events.sinkStartIndex, events.takeoffIndex),
          LOWER_BODY_LANDMARKS
        ),
      });
    }
  }

  // --- 股関節角度の最小値 ---
  {
    const hipStats = toSeries(
      getSegmentFrames(frames, events.sinkStartIndex, events.takeoffIndex),
      getAverageHipAngle
    );
    const minHip = hipStats.reduce<number | null>(
      (min, p) => (min === null || p.value < min ? p.value : min),
      null
    );

    if (minHip !== null) {
      pushFeature(features, {
        key: "takeoff.hipMinAngle",
        label: "沈み込み時の股関節角度",
        phase: "takeoff",
        region: "lowerBody",
        value: minHip,
        unit: "deg",
        confidence: calculateVisibilityConfidence(
          getSegmentFrames(frames, events.sinkStartIndex, events.takeoffIndex),
          LOWER_BODY_LANDMARKS
        ),
      });
    }
  }

  // --- 沈み込み時間（沈み込み開始→最下点） ---
  if (events.sinkBottomIndex > events.sinkStartIndex) {
    pushFeature(features, {
      key: "takeoff.sinkDurationSec",
      label: "沈み込み時間",
      phase: "takeoff",
      region: "lowerBody",
      value: times[events.sinkBottomIndex] - times[events.sinkStartIndex],
      unit: "sec",
      confidence: calculateVisibilityConfidence(
        getSegmentFrames(frames, events.sinkStartIndex, events.sinkBottomIndex),
        LOWER_BODY_LANDMARKS
      ),
    });
  }

  // --- 踏切時間（沈み込み開始→離地。接地時間の近似） ---
  if (events.takeoffIndex > events.sinkStartIndex) {
    pushFeature(features, {
      key: "takeoff.contactTimeSec",
      label: "踏切時間",
      phase: "takeoff",
      region: "lowerBody",
      value: times[events.takeoffIndex] - times[events.sinkStartIndex],
      unit: "sec",
      confidence: calculateVisibilityConfidence(
        getSegmentFrames(frames, events.sinkStartIndex, events.takeoffIndex),
        LOWER_BODY_LANDMARKS
      ),
    });
  }

  // --- 最大伸展速度（膝の角速度） ---
  {
    const velocity = maxKneeExtensionVelocity(
      frames,
      events.sinkBottomIndex,
      Math.min(events.takeoffIndex + 2, frames.length - 1)
    );
    if (velocity !== null) {
      pushFeature(features, {
        key: "takeoff.maxExtensionVelocity",
        label: "最大伸展速度（膝）",
        phase: "takeoff",
        region: "lowerBody",
        value: velocity,
        unit: "degPerSec",
        confidence: calculateVisibilityConfidence(
          getSegmentFrames(frames, events.sinkBottomIndex, events.takeoffIndex),
          LOWER_BODY_LANDMARKS
        ),
      });
    }
  }

  // --- 助走速度（体幹長/秒） ---
  if (approach && approach.endIndex > approach.startIndex) {
    const dt = approach.endTime - approach.startTime;
    if (dt > 0) {
      const dx = Math.abs(
        events.comX[approach.endIndex] - events.comX[approach.startIndex]
      );
      pushFeature(features, {
        key: "approach.speed",
        label: "助走速度",
        phase: "approach",
        region: "centerOfMass",
        value: normalizeByBody(frames, dx) / dt,
        unit: "normPxPerSec",
        confidence: calculateVisibilityConfidence(
          getSegmentFrames(frames, approach.startIndex, approach.endIndex)
        ),
      });
    }
  }

  // --- 滞空時間 ---
  if (events.airTimeSec !== null) {
    pushFeature(features, {
      key: "air.timeSec",
      label: "滞空時間",
      phase: "ascent",
      region: "centerOfMass",
      value: events.airTimeSec,
      unit: "sec",
      confidence: calculateVisibilityConfidence(
        getSegmentFrames(frames, events.takeoffIndex, events.landingIndex)
      ),
    });
  }

  // --- 空中姿勢安定度（打点前後の体幹傾き系列を平滑化した上でのばらつき。小さいほど安定） ---
  // 助走やテイクバックを含む「空中全体」ではなく、打点前後（インパクト周辺）のみを評価する。
  const impactFrames = getImpactWindowFrames(frames, engine);
  {
    const smoothedTilts = movingAverage(
      impactFrames
        .map((f) => (typeof f.shoulderTilt === "number" ? f.shoulderTilt : null))
        .filter((v): v is number => v !== null),
      AIR_POSTURE_SMOOTHING_WINDOW
    );
    const tiltStd = stdDev(smoothedTilts);
    if (tiltStd !== null) {
      pushFeature(features, {
        key: "air.postureStability",
        label: "空中姿勢の揺れ（肩傾きのばらつき）",
        phase: "peak",
        region: "trunk",
        value: tiltStd,
        unit: "deg",
        confidence: calculateVisibilityConfidence(impactFrames, TRUNK_LANDMARKS),
      });
    }
  }

  // --- 最高点付近の肩の傾き（打つ側の肩が高いほど自然。逆方向のみ注意すべき） ---
  {
    const side = determineHittingSide(impactFrames);
    if (side) {
      const smoothedBalance = movingAverage(
        impactFrames
          .map((f) => shoulderTiltForHittingSide(f, side))
          .filter((v): v is number => v !== null),
        AIR_POSTURE_SMOOTHING_WINDOW
      );
      const value = average(smoothedBalance);
      if (value !== null) {
        pushFeature(features, {
          key: "peak.shoulderTilt",
          label: "最高点付近の肩の傾き",
          phase: "peak",
          region: "trunk",
          value,
          unit: "deg",
          confidence: calculateVisibilityConfidence(impactFrames, TRUNK_LANDMARKS),
        });
      }
    }
  }

  // --- 左右対称指数（踏切+着地の左右膝角度差の平均） ---
  {
    const asymmetry = meanKneeAsymmetry(frames, [
      [events.sinkStartIndex, events.takeoffIndex],
      [events.landingIndex, events.landingEndIndex],
    ]);
    if (asymmetry !== null) {
      pushFeature(features, {
        key: "symmetry.kneeDiff",
        label: "左右膝差（踏切・着地）",
        phase: "takeoff",
        region: "symmetry",
        value: asymmetry,
        unit: "deg",
        confidence: calculateVisibilityConfidence(
          getSegmentFrames(frames, events.sinkStartIndex, events.takeoffIndex),
          LOWER_BODY_LANDMARKS
        ),
      });
    }
  }

  // --- 腕振り速度（沈み込み〜最高点の手首最大上向き速度、体幹長/秒） ---
  {
    const wristVelocityPx = maxWristUpwardVelocityPx(
      frames,
      events.sinkStartIndex,
      events.peakIndex
    );
    if (wristVelocityPx !== null) {
      pushFeature(features, {
        key: "arm.swingVelocity",
        label: "腕振り速度（上向き最大）",
        phase: "takeoff",
        region: "arm",
        value: normalizeByBody(frames, wristVelocityPx),
        unit: "normPxPerSec",
        confidence: calculateVisibilityConfidence(
          getSegmentFrames(frames, events.sinkStartIndex, events.peakIndex),
          ARM_LANDMARKS
        ),
      });
    }
  }

  // --- 打点タイミング（手首最高点と身体最高点の時間差） ---
  {
    let wristPeakTime: number | null = null;
    let bestY = Number.POSITIVE_INFINITY;
    for (let i = events.takeoffIndex; i <= events.landingIndex; i += 1) {
      for (const wristIndex of [LEFT_WRIST, RIGHT_WRIST]) {
        const wrist = frames[i].landmarks[wristIndex];
        if (!wrist || (wrist.visibility ?? 1) < 0.5) continue;
        if (wrist.y < bestY) {
          bestY = wrist.y;
          wristPeakTime = frames[i].time;
        }
      }
    }

    if (wristPeakTime !== null) {
      pushFeature(features, {
        key: "contact.wristPeakToBodyPeakTimeDiff",
        label: "打点タイミング（腕最高点−身体最高点）",
        phase: "contact",
        region: "arm",
        value: wristPeakTime - times[events.peakIndex],
        unit: "sec",
        confidence: calculateVisibilityConfidence(
          getSegmentFrames(frames, events.peakIndex, events.landingIndex),
          ARM_LANDMARKS
        ),
      });
    }
  }

  // --- 着地衝撃指数（着地直前の重心下降速度、体幹長/秒） ---
  {
    const preLanding = Math.max(events.peakIndex + 1, events.landingIndex - 1);
    const velocity = events.comVelocity[preLanding];
    if (velocity !== null && velocity > 0) {
      pushFeature(features, {
        key: "landing.impactIndex",
        label: "着地衝撃指数（接地直前の下降速度）",
        phase: "landing",
        region: "lowerBody",
        value: normalizeByBody(frames, velocity),
        unit: "normPxPerSec",
        confidence: calculateVisibilityConfidence(
          landing
            ? getSegmentFrames(frames, landing.startIndex, landing.endIndex)
            : frames,
          LOWER_BODY_LANDMARKS
        ),
      });
    }
  }

  // --- 着地時の膝屈曲量（衝撃吸収の指標） ---
  {
    const landingFrames = getSegmentFrames(
      frames,
      events.landingIndex,
      events.landingEndIndex
    );
    const kneeAtLanding = getAverageKneeAngle(frames[events.landingIndex]);
    const minKnee = landingFrames.reduce<number | null>((min, f) => {
      const knee = getAverageKneeAngle(f);
      if (knee === null) return min;
      return min === null || knee < min ? knee : min;
    }, null);

    if (kneeAtLanding !== null && minKnee !== null) {
      pushFeature(features, {
        key: "landing.kneeAbsorption",
        label: "着地の膝屈曲量（衝撃吸収）",
        phase: "landing",
        region: "lowerBody",
        value: Math.max(0, kneeAtLanding - minKnee),
        unit: "deg",
        confidence: calculateVisibilityConfidence(
          landingFrames,
          LOWER_BODY_LANDMARKS
        ),
      });
    }
  }

  // --- 空中での水平移動（体幹長比） ---
  if (airTo > airFrom) {
    const dx = Math.abs(
      events.comX[events.landingIndex] - events.comX[events.takeoffIndex]
    );
    pushFeature(features, {
      key: "air.horizontalDrift",
      label: "空中での水平移動",
      phase: "ascent",
      region: "centerOfMass",
      value: normalizeByBody(frames, dx),
      unit: "normPx",
      confidence: calculateVisibilityConfidence(
        getSegmentFrames(frames, events.takeoffIndex, events.landingIndex)
      ),
    });
  }

  // --- 重心上昇量（体幹長比） ---
  pushFeature(features, {
    key: "center.verticalRange",
    label: "重心の上昇量",
    phase: "ascent",
    region: "centerOfMass",
    value: normalizeByBody(frames, events.risePx),
    unit: "normPx",
    confidence: calculateVisibilityConfidence(frames),
  });

  return features;
}

export const spikeJumpDefinition: SkillDefinition = {
  id: "spikeJump",
  segment: segmentSpikeJump,
  extract: extractSpikeJump,
};
