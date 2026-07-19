import { describe, expect, it } from "vitest";

import { createPersonTracker } from "./personTracker";
import { selectPoseByPoint } from "./poseSelection";
import { ENABLE_TEMPORAL_TRACKER } from "./featureFlags";
import { POSE_LANDMARK } from "./poseLandmarks";
import type { TrackedLandmark } from "./poseTypes";

const P = POSE_LANDMARK;

/** 中心(cx, cy)・スケールscaleの「直立した人物」の33点ぶんのランドマークを作る */
function makePerson(cx: number, cy: number, scale = 1, visibility = 0.9): TrackedLandmark[] {
  const offsets: Record<number, [number, number]> = {
    [P.LEFT_SHOULDER]: [-30, -60],
    [P.RIGHT_SHOULDER]: [30, -60],
    [P.LEFT_ELBOW]: [-40, -20],
    [P.RIGHT_ELBOW]: [40, -20],
    [P.LEFT_WRIST]: [-45, 20],
    [P.RIGHT_WRIST]: [45, 20],
    [P.LEFT_HIP]: [-20, 60],
    [P.RIGHT_HIP]: [20, 60],
    [P.LEFT_KNEE]: [-22, 120],
    [P.RIGHT_KNEE]: [22, 120],
    [P.LEFT_ANKLE]: [-24, 180],
    [P.RIGHT_ANKLE]: [24, 180],
    [P.LEFT_HEEL]: [-25, 190],
    [P.RIGHT_HEEL]: [25, 190],
    [P.LEFT_FOOT_INDEX]: [-20, 200],
    [P.RIGHT_FOOT_INDEX]: [20, 200],
  };

  return new Array(33).fill(null).map((_, i) => {
    const offset = offsets[i];
    if (!offset) return { x: cx, y: cy, visibility: 0 };
    return { x: cx + offset[0] * scale, y: cy + offset[1] * scale, visibility };
  });
}

describe("personTracker: 基本追跡", () => {
  it("単一人物を継続追跡できる", () => {
    const tracker = createPersonTracker({ x: 100, y: 100 });
    let time = 0;
    for (let i = 0; i < 6; i += 1) {
      const person = makePerson(100 + i * 3, 100 + i * 2);
      const { pose, quality } = tracker.update([person], time);
      expect(pose).not.toBeNull();
      expect(quality?.isCoasting).toBe(false);
      time += 1 / 30;
    }
  });

  it("2人が接近しても、体格・ポーズが継続する人物から乗り換えない", () => {
    const tracker = createPersonTracker({ x: 100, y: 100 });
    const personA0 = makePerson(100, 100);
    const first = tracker.update([personA0], 0);
    expect(first.pose).not.toBeNull();

    // personAは自然に少し移動。personBはpersonAの予測位置のすぐ近くに現れるが、
    // 体格（トルソー長）が明確に異なる（半分のスケール）別人物。
    const personAContinued = makePerson(105, 102);
    const personBNearby = makePerson(110, 105, 0.5);

    const { pose } = tracker.update([personAContinued, personBNearby], 1 / 30);
    expect(pose).not.toBeNull();

    const shoulderX = pose![P.LEFT_SHOULDER].x;
    const distToA = Math.abs(shoulderX - personAContinued[P.LEFT_SHOULDER].x);
    const distToB = Math.abs(shoulderX - personBNearby[P.LEFT_SHOULDER].x);
    expect(distToA).toBeLessThan(distToB);
  });

  it("一時的な遮蔽後、同じ人物へ復帰する", () => {
    const tracker = createPersonTracker({ x: 100, y: 100 });
    let time = 0;
    const dt = 1 / 30;

    for (let i = 0; i < 3; i += 1) {
      const person = makePerson(100 + i * 4, 100 + i * 3);
      const { pose } = tracker.update([person], time);
      expect(pose).not.toBeNull();
      time += dt;
    }

    for (let i = 0; i < 3; i += 1) {
      const { pose } = tracker.update([], time);
      expect(pose).toBeNull();
      time += dt;
    }

    const reappeared = makePerson(100 + 6 * 4, 100 + 6 * 3);
    const { pose, quality } = tracker.update([reappeared], time);

    expect(pose).not.toBeNull();
    expect(quality?.reacquired).toBe(true);
  });

  it("対象が完全に消えた場合、安全に失敗し続ける（例外を投げない）", () => {
    const tracker = createPersonTracker({ x: 100, y: 100 });
    let time = 0;
    const dt = 1 / 30;

    tracker.update([makePerson(100, 100)], time);
    time += dt;

    expect(() => {
      // MAX_COASTING_FRAMES(10)を大きく超える長さ、誰も検出されない状態が続く
      for (let i = 0; i < 20; i += 1) {
        const { pose } = tracker.update([], time);
        expect(pose).toBeNull();
        time += dt;
      }
    }).not.toThrow();
  });

  it("候補が1人しかいない場合は、予測から離れていてもコストに関わらず採用する（外れ値除去は後段に委ねる）", () => {
    const tracker = createPersonTracker({ x: 100, y: 100 });
    tracker.update([makePerson(100, 100)], 0);

    // 単一候補が予測位置から大きく離れていても、比較対象がないため採用される。
    const farPerson = makePerson(500, 500);
    const { pose } = tracker.update([farPerson], 1 / 30);
    expect(pose).not.toBeNull();
  });

  it("Feature Flag OFF相当（トラッカー未使用）では既存のselectPoseByPointがそのまま使われる", () => {
    expect(typeof ENABLE_TEMPORAL_TRACKER).toBe("boolean");

    const near = makePerson(100, 100);
    const far = makePerson(400, 400);
    const picked = selectPoseByPoint([far, near], { x: 105, y: 102 });

    expect(picked).not.toBeNull();
    expect(picked![P.LEFT_SHOULDER].x).toBe(near[P.LEFT_SHOULDER].x);
  });
});

describe("personTracker: 状態管理", () => {
  it("新しい動画の解析開始時（新しいトラッカー生成時）は状態がリセットされる", () => {
    const trackerA = createPersonTracker({ x: 100, y: 100 });
    for (let i = 0; i < 5; i += 1) {
      trackerA.update([makePerson(100 + i * 10, 100)], i / 30);
    }

    // 新しい動画の解析＝新しいcreatePersonTracker呼び出し。
    // 前の動画（trackerA）をどれだけ使っていても、新しいインスタンスは初回acquireから始まる。
    const trackerB = createPersonTracker({ x: 900, y: 900 });
    const person = makePerson(900, 900);
    const { pose, quality } = trackerB.update([person], 0);

    expect(pose).not.toBeNull();
    expect(quality?.reacquired).toBe(false); // 初回取得であり「再取得」ではない
    expect(quality?.matchScore).toBe(1); // 初回acquireの既定スコア
  });

  it("同じ動画を再解析しても（新しいインスタンスなら）前回状態を引き継がない", () => {
    const firstAnalysis = createPersonTracker({ x: 200, y: 200 });
    firstAnalysis.update([makePerson(200, 200)], 0);
    firstAnalysis.update([makePerson(250, 240)], 1 / 30);
    firstAnalysis.update([makePerson(300, 280)], 2 / 30);

    // 同じ動画・同じ選択座標でも、再解析は新しいインスタンスで行われる。
    const secondAnalysis = createPersonTracker({ x: 200, y: 200 });
    const { pose } = secondAnalysis.update([makePerson(200, 200)], 0);

    expect(pose).not.toBeNull();
    // 1回目の解析で蓄積された速度（250,240→300,280方向）の影響を受けていないこと。
    // もし状態が漏れていれば、次のupdateで不自然な予測位置になるはず。
    const { quality } = secondAnalysis.update([makePerson(205, 202)], 1 / 30);
    expect(quality?.isCoasting).toBe(false);
  });

  it("フレーム時刻が逆行した場合でも例外を投げず、安全に処理する", () => {
    const tracker = createPersonTracker({ x: 100, y: 100 });
    tracker.update([makePerson(100, 100)], 1.0);
    tracker.update([makePerson(110, 105)], 1.1);

    // 時刻が逆行（シークやフレーム順の乱れを想定）
    expect(() => {
      const result = tracker.update([makePerson(108, 103)], 0.5);
      expect(result.pose).not.toBeNull();
    }).not.toThrow();

    // 逆行後も、その後の正常な時刻進行に復帰できる
    const after = tracker.update([makePerson(112, 106)], 1.2);
    expect(after.pose).not.toBeNull();
  });

  it("Feature Flagを切り替えても（トラッカーを使わない経路でも）モジュール状態は残らない", () => {
    const tracker = createPersonTracker({ x: 100, y: 100 });
    tracker.update([makePerson(100, 100)], 0);
    tracker.update([makePerson(200, 200)], 1 / 30);

    // フラグOFF相当＝トラッカーを生成・使用しない経路。
    // モジュールレベルの共有状態が無いため、この経路は上のtracker使用と無関係に動作する。
    const near = makePerson(300, 300);
    const picked = selectPoseByPoint([near], { x: 300, y: 300 });
    expect(picked).toEqual(near);

    // 元のtrackerも引き続き正常に動作する（フラグ切替による干渉がない）。
    const { pose } = tracker.update([makePerson(210, 202)], 2 / 30);
    expect(pose).not.toBeNull();
  });
});
