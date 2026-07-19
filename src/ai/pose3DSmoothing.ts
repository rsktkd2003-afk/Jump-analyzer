// =============================================================
// 3Dランドマークの時系列平滑化。
//
// 新規アルゴリズムは追加せず、既存のOne Euro Filter
// （src/utils/oneEuroFilter.ts、関節角度グラフの表示平滑化で実運用中）を
// 関節・軸（x/y/z/visibility）ごとに再利用する。
//
// 欠損（pose3DValidation.tsで無効と判定されたフレーム）は、
// 前後を有効フレームに挟まれた短い区間（MAX_INTERPOLATION_GAP_FRAMES以下）
// だけ線形補間で埋めてから平滑化する。それより長い欠損・先頭/末尾の欠損は
// 補間せずunknown（undefined）のまま残す。
// =============================================================

import { smoothSeriesWithOneEuro, type OneEuroOptions } from "../utils/oneEuroFilter";
import type { PoseWorldLandmark } from "./poseTypes";

/** 短時間欠損とみなして補間する最大フレーム数。これを超える欠損区間は補間しない */
const MAX_INTERPOLATION_GAP_FRAMES = 3;

/**
 * 3D位置（メートル単位、値域がおおよそ-2〜2m程度）向けのOne Euroパラメータ。
 * 関節角度用（MotionGraph.tsx: minCutoff=1.2, beta=0.03、度単位）とは
 * 値のスケールが大きく異なるため、専用の値を用いる。
 * minCutoff: 静止時の基本カットオフ(Hz)。beta: 速度(m/s)に応じてカットオフを
 * 上げる係数。スパイクの腕振り等、局所的に数m/sへ達する動きにも追従できる
 * よう、角度用よりbetaを大きめにしてある。
 */
const POSITION_ONE_EURO_OPTIONS: OneEuroOptions = {
  minCutoff: 1.0,
  beta: 0.3,
  derivativeCutoff: 1.0,
};

/** visibility（0〜1の比率値）向けのOne Euroパラメータ。ノイズ除去を優先し追従性は控えめにする */
const VISIBILITY_ONE_EURO_OPTIONS: OneEuroOptions = {
  minCutoff: 1.0,
  beta: 0.05,
  derivativeCutoff: 1.0,
};

export type Pose3DSmoothingResult = {
  /** フレームごとの平滑化後3Dランドマーク。長時間欠損・元々データがないフレームはundefined */
  landmarksByFrame: Array<PoseWorldLandmark[] | undefined>;
  /** 短時間欠損として補間で埋めたフレームのインデックス集合 */
  interpolatedFrameIndexes: Set<number>;
};

/** 内部が連続してfalseとなる「谷」のうち、両側をtrueに挟まれた区間（インデックスの半開区間）を返す */
function findInteriorGapRuns(present: boolean[]): Array<{ start: number; end: number }> {
  const runs: Array<{ start: number; end: number }> = [];
  let i = 0;

  while (i < present.length) {
    if (present[i]) {
      i += 1;
      continue;
    }

    let j = i;
    while (j < present.length && !present[j]) j += 1;

    const hasLeftNeighbor = i > 0 && present[i - 1];
    const hasRightNeighbor = j < present.length && present[j];
    if (hasLeftNeighbor && hasRightNeighbor) {
      runs.push({ start: i, end: j });
    }

    i = j;
  }

  return runs;
}

/** indexesToFillに含まれる位置だけを、前後の有効値から線形補間して埋める */
function fillGapsAtIndexes(
  values: Array<number | null>,
  indexesToFill: ReadonlySet<number>
): Array<number | null> {
  if (indexesToFill.size === 0) return values;

  const result = [...values];

  for (const idx of indexesToFill) {
    let leftIdx = idx - 1;
    while (leftIdx >= 0 && values[leftIdx] === null) leftIdx -= 1;

    let rightIdx = idx + 1;
    while (rightIdx < values.length && values[rightIdx] === null) rightIdx += 1;

    if (leftIdx < 0 || rightIdx >= values.length) continue; // 安全側（本来ここには来ないはず）

    const leftVal = values[leftIdx] as number;
    const rightVal = values[rightIdx] as number;
    const ratio = (idx - leftIdx) / (rightIdx - leftIdx);
    result[idx] = leftVal + (rightVal - leftVal) * ratio;
  }

  return result;
}

function smoothChannel(
  values: Array<number | null>,
  indexesToFill: ReadonlySet<number>,
  times: number[],
  options: OneEuroOptions
): Array<number | null> {
  const filled = fillGapsAtIndexes(values, indexesToFill);
  return smoothSeriesWithOneEuro(filled, times, options);
}

/**
 * フレーム列全体の3Dランドマークを平滑化する。
 * framesLandmarksとtimesは同じ長さ・同じフレーム順であること。
 * 各要素が有効な3Dデータを持つ場合はPoseWorldLandmark[]（33点）、
 * そうでない場合はundefinedを渡す（pose3DValidation.tsの検証結果に対応）。
 */
export function smoothPose3DSequence(
  framesLandmarks: Array<PoseWorldLandmark[] | undefined>,
  times: number[]
): Pose3DSmoothingResult {
  const frameCount = framesLandmarks.length;

  if (frameCount === 0) {
    return { landmarksByFrame: [], interpolatedFrameIndexes: new Set() };
  }

  const present = framesLandmarks.map((f) => f !== undefined);
  const interiorGaps = findInteriorGapRuns(present);

  const interpolatedFrameIndexes = new Set<number>();
  for (const run of interiorGaps) {
    if (run.end - run.start <= MAX_INTERPOLATION_GAP_FRAMES) {
      for (let i = run.start; i < run.end; i += 1) {
        interpolatedFrameIndexes.add(i);
      }
    }
  }

  const landmarkCount =
    framesLandmarks.find((f): f is PoseWorldLandmark[] => f !== undefined)?.length ?? 0;

  // 出力対象（元々有効、または短時間欠損として補間される）フレームのみ、
  // 33関節 x 4チャンネル(x,y,z,visibility)ぶんの時系列を平滑化する。
  const outputFrameIndexes = new Set<number>(
    present.flatMap((isPresent, i) => (isPresent || interpolatedFrameIndexes.has(i) ? [i] : []))
  );

  if (landmarkCount === 0 || outputFrameIndexes.size === 0) {
    return {
      landmarksByFrame: framesLandmarks.map(() => undefined),
      interpolatedFrameIndexes,
    };
  }

  const smoothedChannels: {
    x: Array<number | null>[];
    y: Array<number | null>[];
    z: Array<number | null>[];
    visibility: Array<number | null>[];
  } = { x: [], y: [], z: [], visibility: [] };

  for (let landmarkIndex = 0; landmarkIndex < landmarkCount; landmarkIndex += 1) {
    const xs = framesLandmarks.map((f) => f?.[landmarkIndex]?.x ?? null);
    const ys = framesLandmarks.map((f) => f?.[landmarkIndex]?.y ?? null);
    const zs = framesLandmarks.map((f) => f?.[landmarkIndex]?.z ?? null);
    const vis = framesLandmarks.map((f) => f?.[landmarkIndex]?.visibility ?? null);

    smoothedChannels.x.push(smoothChannel(xs, interpolatedFrameIndexes, times, POSITION_ONE_EURO_OPTIONS));
    smoothedChannels.y.push(smoothChannel(ys, interpolatedFrameIndexes, times, POSITION_ONE_EURO_OPTIONS));
    smoothedChannels.z.push(smoothChannel(zs, interpolatedFrameIndexes, times, POSITION_ONE_EURO_OPTIONS));
    smoothedChannels.visibility.push(
      smoothChannel(vis, interpolatedFrameIndexes, times, VISIBILITY_ONE_EURO_OPTIONS)
    );
  }

  const landmarksByFrame: Array<PoseWorldLandmark[] | undefined> = framesLandmarks.map((_, frameIndex) => {
    if (!outputFrameIndexes.has(frameIndex)) return undefined;

    const landmarks: PoseWorldLandmark[] = [];
    for (let landmarkIndex = 0; landmarkIndex < landmarkCount; landmarkIndex += 1) {
      const x = smoothedChannels.x[landmarkIndex][frameIndex];
      const y = smoothedChannels.y[landmarkIndex][frameIndex];
      const z = smoothedChannels.z[landmarkIndex][frameIndex];
      const visibility = smoothedChannels.visibility[landmarkIndex][frameIndex];

      if (x === null || y === null || z === null) {
        // このフレームは出力対象のはずだが、念のため欠けていたら安全側でこのフレーム全体を諦める
        return undefined;
      }

      landmarks.push({ x, y, z, visibility: visibility ?? undefined });
    }
    return landmarks;
  });

  return { landmarksByFrame, interpolatedFrameIndexes };
}
