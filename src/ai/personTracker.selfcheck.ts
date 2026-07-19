// =============================================================
// 軽量人物トラッカーの検証コード。
//
// このプロジェクトにはテストランナーが未導入のため、単体テストの代わりに
// 実装済みの純粋関数（createPersonTracker）を直接呼び出して検証する
// （既存の spikeFormEvaluation.selfcheck.ts と同じ方式）。
//
// 実行方法（開発時の手動確認用。npm run build には含まれない）：
//   npx vite-node src/ai/personTracker.selfcheck.ts
// =============================================================

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

  const landmarks: TrackedLandmark[] = new Array(33).fill(null).map((_, i) => {
    const offset = offsets[i];
    if (!offset) return { x: cx, y: cy, visibility: 0 };
    return { x: cx + offset[0] * scale, y: cy + offset[1] * scale, visibility };
  });

  return landmarks;
}

type Case = { name: string; run: () => string | null };

const cases: Case[] = [
  {
    name: "単一人物を継続追跡できる",
    run: () => {
      const tracker = createPersonTracker({ x: 100, y: 100 });
      let time = 0;
      for (let i = 0; i < 6; i += 1) {
        const person = makePerson(100 + i * 3, 100 + i * 2);
        const { pose, quality } = tracker.update([person], time);
        if (!pose) return `フレーム${i}: 検出できなかった`;
        if (!quality || quality.isCoasting) return `フレーム${i}: coasting扱いになった（期待: 継続追跡）`;
        time += 1 / 30;
      }
      return null;
    },
  },
  {
    name: "2人が接近しても、体格・ポーズが継続する人物から乗り換えない",
    run: () => {
      const tracker = createPersonTracker({ x: 100, y: 100 });
      const personA0 = makePerson(100, 100);
      const first = tracker.update([personA0], 0);
      if (!first.pose) return "初回フレームで検出できなかった";

      // personAは自然に少し移動。personBはpersonAの予測位置のすぐ近くに現れるが、
      // 体格（トルソー長）が明確に異なる（半分のスケール）別人物。
      const personAContinued = makePerson(105, 102);
      const personBNearby = makePerson(110, 105, 0.5);

      const { pose } = tracker.update([personAContinued, personBNearby], 1 / 30);
      if (!pose) return "候補があるのに検出できなかった";

      const shoulderX = pose[P.LEFT_SHOULDER].x;
      const expectedA = personAContinued[P.LEFT_SHOULDER].x;
      const expectedB = personBNearby[P.LEFT_SHOULDER].x;

      const distToA = Math.abs(shoulderX - expectedA);
      const distToB = Math.abs(shoulderX - expectedB);

      return distToA < distToB
        ? null
        : `体格の異なる近くの人物(B)へ乗り換えてしまった (A差=${distToA.toFixed(1)}, B差=${distToB.toFixed(1)})`;
    },
  },
  {
    name: "一時的な遮蔽後、同じ人物へ復帰する",
    run: () => {
      const tracker = createPersonTracker({ x: 100, y: 100 });
      let time = 0;
      const dt = 1 / 30;

      // 3フレーム、一定速度で移動しながら追跡（速度を学習させる）
      for (let i = 0; i < 3; i += 1) {
        const person = makePerson(100 + i * 4, 100 + i * 3);
        const { pose } = tracker.update([person], time);
        if (!pose) return `学習フェーズのフレーム${i}で検出できなかった`;
        time += dt;
      }

      // 3フレーム遮蔽（誰も検出されない）
      for (let i = 0; i < 3; i += 1) {
        const { pose } = tracker.update([], time);
        if (pose) return "遮蔽中なのに何らかの人物を返してしまった";
        time += dt;
      }

      // 速度どおりに継続した位置に人物が再出現
      const reappeared = makePerson(100 + 6 * 4, 100 + 6 * 3);
      const { pose, quality } = tracker.update([reappeared], time);

      if (!pose) return "遮蔽明けのフレームで再取得できなかった";
      if (!quality?.reacquired) return "再取得フラグ(reacquired)がtrueにならなかった";
      return null;
    },
  },
  {
    name: "対象が完全に消えた場合、安全に失敗し続ける（例外を投げない）",
    run: () => {
      const tracker = createPersonTracker({ x: 100, y: 100 });
      let time = 0;
      const dt = 1 / 30;

      const person = makePerson(100, 100);
      tracker.update([person], time);
      time += dt;

      try {
        // MAX_COASTING_FRAMES(10)を大きく超える長さ、誰も検出されない状態が続く
        for (let i = 0; i < 20; i += 1) {
          const { pose } = tracker.update([], time);
          if (pose) return `フレーム${i}: 候補が無いのに人物を返してしまった`;
          time += dt;
        }
      } catch (error) {
        return `例外が発生した: ${String(error)}`;
      }

      return null;
    },
  },
  {
    name: "Feature Flag OFF相当（トラッカー未使用）では既存のselectPoseByPointがそのまま使われる",
    run: () => {
      if (typeof ENABLE_TEMPORAL_TRACKER !== "boolean") {
        return "ENABLE_TEMPORAL_TRACKER が boolean として定義されていない";
      }

      // トラッカーを使わない場合の呼び出し経路（poseTracking.ts の detectFrame が
      // tracker未指定時に呼ぶのと同じ関数）が、引き続き正しく動作することを確認する。
      const near = makePerson(100, 100);
      const far = makePerson(400, 400);
      const picked = selectPoseByPoint([far, near], { x: 105, y: 102 });

      if (!picked) return "selectPoseByPointがnullを返した";
      const isNear = picked[P.LEFT_SHOULDER].x === near[P.LEFT_SHOULDER].x;
      return isNear ? null : "クリック位置に最も近い人物を選ばなかった";
    },
  },
];

const results = cases.map((c) => {
  const failure = c.run();
  return { name: c.name, pass: failure === null, detail: failure };
});

let allPass = true;
console.log("--- 軽量人物トラッカー ---");
for (const r of results) {
  allPass = allPass && r.pass;
  console.log(`${r.pass ? "PASS" : "FAIL"} - ${r.name}${r.detail ? `\n  ${r.detail}` : ""}`);
}
console.log(allPass ? "\nすべてのケースに合格しました。" : "\n失敗したケースがあります。");
