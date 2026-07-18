// =============================================================
// ジャンプフェーズ分割エンジン。
//
// groundContact（接地判定）のイベントを唯一の情報源として、
//   助走 → 踏切 → 上昇 → 最高点 → 打球 → 下降 → 着地 → 終了
// の順序を保証したフレーム非重複のフェーズ列を生成する。
//
// 各フェーズの開始 = 前フェーズの終了 + 1 とすることで、
// フレーム重複を構造的に禁止している。
// spikeJump（競技分析）と jumpPhaseAnalyzer（簡易4分割）の両方が
// このエンジンを利用する。
// =============================================================

import type { TrackedFrame } from "./poseTypes";
import { detectJumpEvents, type JumpEvents } from "./groundContact";

const LEFT_WRIST = 15;
const RIGHT_WRIST = 16;

/** 打球フェーズの最大長（秒）。スパイクのインパクトは瞬間的 */
const MAX_CONTACT_DURATION_SEC = 0.12;

/** 「打点前後」の判定窓を最高点フェーズ開始から何フレーム遡って含めるか */
const IMPACT_WINDOW_LOOKBACK_FRAMES = 2;

export type EnginePhaseName =
  | "approach"
  | "takeoff"
  | "ascent"
  | "peak"
  | "contact"
  | "descent"
  | "landing"
  | "finish";

export type EnginePhase = {
  name: EnginePhaseName;
  startIndex: number;
  endIndex: number;
  startTime: number;
  endTime: number;
};

export type JumpPhaseEngineResult = {
  phases: EnginePhase[];
  events: JumpEvents;
};

/** visibilityの高い方の手首Yが最小（最も高い）のフレームを探す */
function findWristPeakIndex(
  frames: TrackedFrame[],
  from: number,
  to: number
): number | null {
  let bestIndex: number | null = null;
  let bestY = Number.POSITIVE_INFINITY;

  for (let i = from; i <= to && i < frames.length; i += 1) {
    for (const wristIndex of [LEFT_WRIST, RIGHT_WRIST]) {
      const wrist = frames[i].landmarks[wristIndex];
      if (!wrist) continue;
      if ((wrist.visibility ?? 1) < 0.5) continue;
      if (wrist.y < bestY) {
        bestY = wrist.y;
        bestIndex = i;
      }
    }
  }

  return bestIndex;
}

/**
 * 打球（contact）区間の決定。
 * 手首の最高点を基準にしつつ、最高点直後〜最大0.12秒に制限し、
 * 着地より前で必ず終わるようにクランプする。
 */
function determineContactRange(
  frames: TrackedFrame[],
  times: number[],
  events: JumpEvents
): { contactStart: number; contactEnd: number } {
  const { takeoffIndex, peakIndex, landingIndex } = events;

  const contactStart = peakIndex + 1;
  const wristPeak = findWristPeakIndex(
    frames,
    Math.max(takeoffIndex, peakIndex - 2),
    landingIndex - 1
  );

  let contactEnd = contactStart;
  const contactLimitTime = times[peakIndex] + MAX_CONTACT_DURATION_SEC;
  while (
    contactEnd + 1 < landingIndex &&
    times[contactEnd + 1] <= contactLimitTime
  ) {
    contactEnd += 1;
  }
  if (wristPeak !== null && wristPeak > peakIndex && wristPeak < landingIndex) {
    contactEnd = Math.max(contactEnd, Math.min(wristPeak + 1, landingIndex - 1));
  }
  contactEnd = Math.min(contactEnd, landingIndex - 1);

  return { contactStart, contactEnd };
}

/** フェーズ列の構築（cursor方式でフレーム重複を構造的に禁止） */
function buildEnginePhases(
  events: JumpEvents,
  lastIndex: number,
  times: number[],
  contactEnd: number
): EnginePhase[] {
  const { sinkStartIndex, takeoffIndex, peakIndex, landingIndex, landingEndIndex } =
    events;

  const phases: EnginePhase[] = [];
  let cursor = 0;

  const push = (name: EnginePhaseName, endIndex: number) => {
    const end = Math.min(Math.max(endIndex, cursor - 1), lastIndex);
    if (end < cursor) return; // 空フェーズはスキップ
    phases.push({
      name,
      startIndex: cursor,
      endIndex: end,
      startTime: times[cursor],
      endTime: times[end],
    });
    cursor = end + 1;
  };

  push("approach", sinkStartIndex - 1);
  push("takeoff", takeoffIndex);
  push("ascent", peakIndex - 1);
  push("peak", peakIndex);
  push("contact", contactEnd);
  push("descent", landingIndex - 1);
  push("landing", landingEndIndex);
  push("finish", lastIndex);

  return phases;
}

/**
 * トラッキング済みフレームからフェーズ列を生成する。
 * ジャンプを検出できない場合はnull。
 */
export function runJumpPhaseEngine(
  frames: TrackedFrame[]
): JumpPhaseEngineResult | null {
  const events = detectJumpEvents(frames);
  if (!events || !events.valid) return null;

  const lastIndex = frames.length - 1;
  const times = frames.map((f) => f.time);

  const { contactEnd } = determineContactRange(frames, times, events);
  const phases = buildEnginePhases(events, lastIndex, times, contactEnd);

  return { phases, events };
}

/** 名前でフェーズを取得 */
export function findEnginePhase(
  result: JumpPhaseEngineResult,
  name: EnginePhaseName
): EnginePhase | null {
  return result.phases.find((phase) => phase.name === name) ?? null;
}

/**
 * 「打点前後（インパクト周辺）」のフレームだけを返す。
 * 最高点フェーズ開始の少し前〜打球フェーズ終了までに限定し、
 * 助走・テイクバック・着地など空中姿勢の評価と無関係な区間を除外する。
 */
export function getImpactWindowFrames(
  frames: TrackedFrame[],
  result: JumpPhaseEngineResult
): TrackedFrame[] {
  const peak = findEnginePhase(result, "peak");
  if (!peak) return [];
  const contact = findEnginePhase(result, "contact");

  const start = Math.max(
    result.events.takeoffIndex,
    peak.startIndex - IMPACT_WINDOW_LOOKBACK_FRAMES
  );
  const end = contact ? contact.endIndex : peak.endIndex;

  return frames.slice(start, end + 1);
}
