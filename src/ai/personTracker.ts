// =============================================================
// 軽量な時系列人物トラッカー。
//
// 既存の「毎フレーム、ユーザーがクリックした座標に最も近い人物を選び直す」
// 方式（poseSelection.ts の selectPoseByPoint）は、他の選手が近くに映り
// 込むと対象を乗り換えてしまうことがある。
// このモジュールは、前フレームの位置・速度から現フレームの位置を予測し、
// 予測位置との距離・IoU・体格（トルソー長）の変化・ポーズ形状の類似度を
// 組み合わせて「同一人物らしさ」を評価することで、乗り換えを減らす。
//
// 状態設計:
// - 位置予測は「速度による外挿」で行う（前回位置＋速度×経過時間）。
// - 確定した中心座標の平滑化にはKalmanFilter1D（既存クラス）を再利用するが、
//   座標平滑化・欠損補間用のインスタンス（poseTrackingSmoothing.ts側）とは
//   分離し、トラッカー専用のインスタンス（x/y）として持つ。状態も共有しない。
//   One Euro Filterへは一本化しない。役割は Kalman=トラッキング/予測/座標補完、
//   One Euro=表示用のまま。
// - 対象を見失っても、MAX_COASTING_FRAMES の間は前回状態を保持して
//   予測のみを続け（coasting）、すぐには他人物へ乗り換えない。
// - それを超えて見失った場合のみ、既存の selectPoseByPoint による
//   再取得（クリック位置基準）にフォールバックする。
// - マッチする候補が1つもない場合は例外を投げず、そのフレームは
//   「検出なし」（pose: null）として返す。呼び出し側は既存同様に
//   そのフレームをスキップできる。
// - createPersonTracker() は呼び出しごとに新しい閉包状態を持つため、
//   動画（analyzeTrackedMotion の呼び出し）ごとに必ず新しいインスタンスを
//   生成すれば、前の動画の状態が引き継がれることはない。
// - フレーム時刻が前回より逆行・停滞した場合は速度による外挿を行わず、
//   その時点の位置をそのまま予測位置として扱う（異常な外挿を避ける）。
//
// 単一候補時の扱い（重要）:
// - 追跡状態が未確立（初回取得）の場合のみ、既存の selectPoseByPoint
//   （クリック位置最近傍）を使う。
// - 追跡状態が確立した後は、候補が1人しかいない場合でも無条件に採用しない。
//   候補が1人だけの場面は「対象が消え、別人だけが残った」場合と
//   区別できないため、体格（トルソー長）・ポーズ形状の一致度を中心に
//   評価し、一致しなければ採用せずcoastingへ移行する。
//   ただし複数候補から選ぶ場面と異なり「比較対象がいない」ため、
//   位置・IoUのブレだけで過敏に棄却しないよう、単一候補時は
//   位置・IoUの重みを下げ、体格・ポーズ形状の重みを上げた
//   別の重みプロファイルを使う（無条件採用は行わない）。
// =============================================================

import { KalmanFilter1D } from "../utils/kalmanFilter";
import { getBodyJoints } from "./poseLandmarks";
import { selectPoseByPoint } from "./poseSelection";
import type {
  PersonTrackerStats,
  Point2D,
  TrackedLandmark,
  TrackerFrameQuality,
} from "./poseTypes";

// ---- 重み・閾値（すべてここに集約。調整はこのブロックのみで完結する） ----

type CostWeights = {
  distance: number;
  iou: number;
  sizeChange: number;
  poseShape: number;
  visibilityPenalty: number;
};

/** 複数候補から選ぶ場面の重み。位置・IoUを重視し、明確に近い候補を選ぶ。 */
const MULTI_CANDIDATE_WEIGHTS: CostWeights = {
  distance: 1.4,
  iou: 1.2,
  sizeChange: 0.8,
  poseShape: 1.0,
  visibilityPenalty: 0.6,
};

/**
 * 候補が1人だけの場面の重み。
 * 比較対象がいないため、位置・IoUのブレだけで棄却すると、速い動き・
 * フレーム間隔の広がりで正当な継続まで弾いてしまう。体格（トルソー長）・
 * ポーズ形状という「そもそも同一人物の身体らしいか」を示す、位置に
 * 依存しない手がかりを主軸にする。ただし位置・IoUの重みをゼロにはせず、
 * 明後日の方向にいる別人を無条件採用しないための最低限の寄与は残す。
 */
const SINGLE_CANDIDATE_WEIGHTS: CostWeights = {
  distance: 0.08,
  iou: 0.15,
  sizeChange: 2.4,
  poseShape: 2.4,
  visibilityPenalty: 0.6,
};

/** 複数候補時にこのコストを超える候補はマッチとして採用しない */
const MAX_ACCEPTABLE_COST = 2.4;
/** 単一候補時にこのコストを超える場合は採用せずcoastingへ移行する（無条件採用はしない） */
const MAX_ACCEPTABLE_COST_SINGLE_CANDIDATE = 2.4;

/** 遮蔽とみなして予測のみで維持する最大連続フレーム数を超えたら、
 *  クリック位置基準の再取得にフォールバックする。 */
const MAX_COASTING_FRAMES = 10;
/** トルソー長が極端に小さい場合のゼロ割防止用の下限（px） */
const MIN_TORSO_PX = 8;
/** 候補の主要関節の平均visibilityがこれ未満の場合、追加コストを課す */
const MIN_MATCH_VISIBILITY = 0.4;
/** これより小さい経過時間（秒）は「時刻が進んでいない/逆行した」とみなし、
 *  速度外挿を行わない（異常な外挿・ゼロ割を避けるための下限でもある）。 */
const MIN_VALID_DT_SEC = 1 / 240;

/** Kalmanフィルタのパラメータ（中心座標の平滑化専用。座標平滑化用インスタンスとは別）*/
const CENTER_KALMAN_ERROR_ESTIMATE = 1;
const CENTER_KALMAN_ERROR_MEASURE = 6;
const CENTER_KALMAN_PROCESS_NOISE = 0.15;

type BoundingBox = { minX: number; minY: number; maxX: number; maxY: number };

type PoseShapePoint = { dx: number; dy: number; visibility: number };

type TrackerState = {
  center: Point2D;
  velocity: Point2D;
  bbox: BoundingBox;
  torsoLength: number;
  shape: PoseShapePoint[];
  lastTime: number;
  missedFrames: number;
  centerFilterX: KalmanFilter1D;
  centerFilterY: KalmanFilter1D;
};

export type TrackerMatchResult = {
  pose: TrackedLandmark[] | null;
  quality?: TrackerFrameQuality;
};

export type PersonTracker = {
  update: (poses: TrackedLandmark[][], time: number) => TrackerMatchResult;
  /** 解析全体を通じた統計のスナップショットを返す（呼び出し側で変更しても内部状態には影響しない） */
  getStats: () => PersonTrackerStats;
};

function createInitialStats(): PersonTrackerStats {
  return {
    updateCount: 0,
    matchedFrameCount: 0,
    coastingFrameCount: 0,
    reacquiredCount: 0,
    rejectedCandidateCount: 0,
    matchScoreSum: 0,
    matchScoreCount: 0,
  };
}

function getBoundingBox(landmarks: TrackedLandmark[]): BoundingBox | null {
  const visible = landmarks.filter((p) => (p.visibility ?? 1) > 0.35);
  if (visible.length === 0) return null;

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const point of visible) {
    if (point.x < minX) minX = point.x;
    if (point.x > maxX) maxX = point.x;
    if (point.y < minY) minY = point.y;
    if (point.y > maxY) maxY = point.y;
  }

  return { minX, minY, maxX, maxY };
}

function boxCenter(box: BoundingBox): Point2D {
  return { x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2 };
}

function shiftBox(box: BoundingBox, dx: number, dy: number): BoundingBox {
  return { minX: box.minX + dx, minY: box.minY + dy, maxX: box.maxX + dx, maxY: box.maxY + dy };
}

function boxIoU(a: BoundingBox, b: BoundingBox): number {
  const ix = Math.max(0, Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX));
  const iy = Math.max(0, Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY));
  const intersection = ix * iy;
  if (intersection <= 0) return 0;

  const areaA = Math.max(0, a.maxX - a.minX) * Math.max(0, a.maxY - a.minY);
  const areaB = Math.max(0, b.maxX - b.minX) * Math.max(0, b.maxY - b.minY);
  const union = areaA + areaB - intersection;

  return union > 0 ? intersection / union : 0;
}

/** 肩・股関節の中点間距離をトルソー長とみなす。算出不能な場合はnull */
function getTorsoLength(landmarks: TrackedLandmark[]): number | null {
  const { leftShoulder, rightShoulder, leftHip, rightHip } = getBodyJoints(landmarks);
  if (!leftShoulder || !rightShoulder || !leftHip || !rightHip) return null;

  const shoulderMidX = (leftShoulder.x + rightShoulder.x) / 2;
  const shoulderMidY = (leftShoulder.y + rightShoulder.y) / 2;
  const hipMidX = (leftHip.x + rightHip.x) / 2;
  const hipMidY = (leftHip.y + rightHip.y) / 2;

  return Math.hypot(shoulderMidX - hipMidX, shoulderMidY - hipMidY);
}

/** 主要関節を中心・トルソー長で正規化した「ポーズ形状」を作る（スケール・位置に依存しない比較用） */
function getPoseShape(
  landmarks: TrackedLandmark[],
  center: Point2D,
  torsoLength: number
): PoseShapePoint[] {
  const joints = getBodyJoints(landmarks);
  const scale = Math.max(torsoLength, MIN_TORSO_PX);

  const points = [
    joints.leftShoulder,
    joints.rightShoulder,
    joints.leftHip,
    joints.rightHip,
    joints.leftKnee,
    joints.rightKnee,
  ];

  return points.map((point) => {
    if (!point) return { dx: 0, dy: 0, visibility: 0 };
    return {
      dx: (point.x - center.x) / scale,
      dy: (point.y - center.y) / scale,
      visibility: point.visibility ?? 1,
    };
  });
}

function poseShapeDistance(a: PoseShapePoint[], b: PoseShapePoint[]): number {
  let totalWeight = 0;
  let totalDistance = 0;

  for (let i = 0; i < a.length && i < b.length; i += 1) {
    const w = Math.min(a[i].visibility, b[i].visibility);
    if (w <= 0) continue;
    totalDistance += Math.hypot(a[i].dx - b[i].dx, a[i].dy - b[i].dy) * w;
    totalWeight += w;
  }

  if (totalWeight === 0) return 1; // 比較不能な場合は中立的に「やや不一致」扱い
  return totalDistance / totalWeight;
}

/** getPoseShapeの並び([leftShoulder, rightShoulder, leftHip, rightHip, leftKnee, rightKnee])
 *  に対応する左右ペアを入れ替えたポーズ形状を返す。 */
function swapPoseShapeSides(shape: PoseShapePoint[]): PoseShapePoint[] {
  const [leftShoulder, rightShoulder, leftHip, rightHip, leftKnee, rightKnee] = shape;
  return [rightShoulder, leftShoulder, rightHip, leftHip, rightKnee, leftKnee];
}

/**
 * ポーズ形状の不一致度を、左右ラベルが入れ替わっている可能性を考慮して算出する。
 * MediaPipeが一時的に左右を取り違えたフレームでも、単なる姿勢の違いと誤認して
 * トラッカーが対象を見失わないようにする（左右入れ替わりの補正自体は
 * lateralityCorrection.ts が別途行うため、ここでは「同一人物である可能性を
 * 過小評価しない」ための頑健性を目的とする）。
 */
function robustPoseShapeCost(candidateShape: PoseShapePoint[], referenceShape: PoseShapePoint[]): number {
  const normal = poseShapeDistance(candidateShape, referenceShape);
  const swapped = poseShapeDistance(swapPoseShapeSides(candidateShape), referenceShape);
  return Math.min(normal, swapped);
}

function averageVisibility(landmarks: TrackedLandmark[]): number {
  const { leftShoulder, rightShoulder, leftHip, rightHip } = getBodyJoints(landmarks);
  const points = [leftShoulder, rightShoulder, leftHip, rightHip].filter(
    (p): p is TrackedLandmark => !!p
  );
  if (points.length === 0) return 0;
  return points.reduce((sum, p) => sum + (p.visibility ?? 1), 0) / points.length;
}

type Candidate = {
  landmarks: TrackedLandmark[];
  bbox: BoundingBox;
  center: Point2D;
  torsoLength: number;
  shape: PoseShapePoint[];
  visibility: number;
};

function buildCandidate(landmarks: TrackedLandmark[]): Candidate | null {
  const bbox = getBoundingBox(landmarks);
  if (!bbox) return null;

  const center = boxCenter(bbox);
  const torsoLength = getTorsoLength(landmarks) ?? Math.hypot(bbox.maxX - bbox.minX, bbox.maxY - bbox.minY) / 3;
  const shape = getPoseShape(landmarks, center, torsoLength);
  const visibility = averageVisibility(landmarks);

  return { landmarks, bbox, center, torsoLength, shape, visibility };
}

function scoreCandidate(
  candidate: Candidate,
  predictedCenter: Point2D,
  predictedBox: BoundingBox,
  state: TrackerState,
  weights: CostWeights
): number {
  const normalizer = Math.max(state.torsoLength, MIN_TORSO_PX);

  const distanceCost = Math.hypot(candidate.center.x - predictedCenter.x, candidate.center.y - predictedCenter.y) / normalizer;
  const iouCost = 1 - boxIoU(predictedBox, candidate.bbox);
  const sizeCost = Math.abs(Math.log(Math.max(candidate.torsoLength, MIN_TORSO_PX) / normalizer));
  const poseShapeCost = robustPoseShapeCost(candidate.shape, state.shape);
  const visibilityCost = candidate.visibility < MIN_MATCH_VISIBILITY ? (MIN_MATCH_VISIBILITY - candidate.visibility) : 0;

  return (
    distanceCost * weights.distance +
    iouCost * weights.iou +
    sizeCost * weights.sizeChange +
    poseShapeCost * weights.poseShape +
    visibilityCost * weights.visibilityPenalty
  );
}

function createStateFromCandidate(candidate: Candidate, time: number): TrackerState {
  const centerFilterX = new KalmanFilter1D(
    candidate.center.x,
    CENTER_KALMAN_ERROR_ESTIMATE,
    CENTER_KALMAN_ERROR_MEASURE,
    CENTER_KALMAN_PROCESS_NOISE
  );
  const centerFilterY = new KalmanFilter1D(
    candidate.center.y,
    CENTER_KALMAN_ERROR_ESTIMATE,
    CENTER_KALMAN_ERROR_MEASURE,
    CENTER_KALMAN_PROCESS_NOISE
  );

  return {
    center: candidate.center,
    velocity: { x: 0, y: 0 },
    bbox: candidate.bbox,
    torsoLength: candidate.torsoLength,
    shape: candidate.shape,
    lastTime: time,
    missedFrames: 0,
    centerFilterX,
    centerFilterY,
  };
}

function updateStateFromMatch(state: TrackerState, candidate: Candidate, time: number): void {
  const rawDt = time - state.lastTime;
  const isTimeRegression = rawDt < MIN_VALID_DT_SEC;

  const filteredX = state.centerFilterX.update(candidate.center.x);
  const filteredY = state.centerFilterY.update(candidate.center.y);
  const filteredCenter: Point2D = { x: filteredX, y: filteredY };

  // 時刻が進んでいない・逆行した場合は速度を算出せず0にリセットする
  // （不正確な外挿やゼロ割を避けるため。位置自体は新しい観測値を信頼する）。
  const velocity: Point2D = isTimeRegression
    ? { x: 0, y: 0 }
    : {
        x: (filteredCenter.x - state.center.x) / rawDt,
        y: (filteredCenter.y - state.center.y) / rawDt,
      };

  state.center = filteredCenter;
  state.velocity = velocity;
  state.bbox = candidate.bbox;
  state.torsoLength = candidate.torsoLength;
  state.shape = candidate.shape;
  state.lastTime = time;
  state.missedFrames = 0;
}

/**
 * 軽量な人物トラッカーを作成する。
 * selectedPoint は初回の対象決定・長時間見失った後の再取得の両方で使う。
 * 呼び出しごとに新しい閉包状態を持つため、動画ごとに新しいインスタンスを
 * 生成すれば前回の解析状態が残ることはない。
 */
export function createPersonTracker(selectedPoint?: Point2D | null): PersonTracker {
  let state: TrackerState | null = null;
  const stats = createInitialStats();

  function acquireFromClickPoint(poses: TrackedLandmark[][], time: number): TrackerMatchResult {
    const pose = selectPoseByPoint(poses, selectedPoint);
    if (!pose) {
      return { pose: null };
    }

    const candidate = buildCandidate(pose);
    if (!candidate) {
      return { pose: null };
    }

    const wasTracking = state !== null;
    state = createStateFromCandidate(candidate, time);

    stats.matchedFrameCount += 1;
    stats.matchScoreSum += 1;
    stats.matchScoreCount += 1;
    if (wasTracking) stats.reacquiredCount += 1;

    return {
      pose,
      quality: { matchScore: 1, isCoasting: false, reacquired: wasTracking },
    };
  }

  function update(poses: TrackedLandmark[][], time: number): TrackerMatchResult {
    stats.updateCount += 1;

    if (!state) {
      return acquireFromClickPoint(poses, time);
    }

    const rawDt = time - state.lastTime;
    const isTimeRegression = rawDt < MIN_VALID_DT_SEC;

    // 時刻が逆行・停滞している場合は速度外挿を行わず、現在位置をそのまま予測位置とする。
    const predictedCenter: Point2D = isTimeRegression
      ? { x: state.center.x, y: state.center.y }
      : {
          x: state.center.x + state.velocity.x * rawDt,
          y: state.center.y + state.velocity.y * rawDt,
        };
    const predictedBox = shiftBox(
      state.bbox,
      predictedCenter.x - state.center.x,
      predictedCenter.y - state.center.y
    );

    const candidates = poses
      .map((pose) => buildCandidate(pose))
      .filter((c): c is Candidate => c !== null);

    // 候補が1人だけの場面は「比較対象がいない」ため、位置・IoUに偏らない
    // 別の重みプロファイルで評価する（3.の「複数候補時とは異なる緩和された閾値」）。
    // ただしどちらのプロファイルでも無条件採用はしない。
    const isMultiCandidate = candidates.length > 1;
    const weights = isMultiCandidate ? MULTI_CANDIDATE_WEIGHTS : SINGLE_CANDIDATE_WEIGHTS;
    const threshold = isMultiCandidate ? MAX_ACCEPTABLE_COST : MAX_ACCEPTABLE_COST_SINGLE_CANDIDATE;

    let best: { candidate: Candidate; cost: number } | null = null;
    for (const candidate of candidates) {
      const cost = scoreCandidate(candidate, predictedCenter, predictedBox, state, weights);
      if (!best || cost < best.cost) {
        best = { candidate, cost };
      }
    }

    if (best && best.cost <= threshold) {
      const wasCoasting = state.missedFrames > 0;
      updateStateFromMatch(state, best.candidate, time);

      const matchScore = 1 / (1 + best.cost);
      stats.matchedFrameCount += 1;
      stats.matchScoreSum += matchScore;
      stats.matchScoreCount += 1;
      if (wasCoasting) stats.reacquiredCount += 1;
      stats.rejectedCandidateCount += candidates.length - 1;

      return {
        pose: best.candidate.landmarks,
        quality: {
          matchScore,
          isCoasting: false,
          reacquired: wasCoasting,
        },
      };
    }

    // マッチなし：見失ったフレームとして数える。
    stats.rejectedCandidateCount += candidates.length;
    state.missedFrames += 1;

    if (state.missedFrames > MAX_COASTING_FRAMES) {
      // 長時間見失った場合のみ、既存のクリック位置基準の選択方式へフォールバックする。
      const reacquireResult = acquireFromClickPoint(poses, time);
      if (!reacquireResult.pose) {
        stats.coastingFrameCount += 1;
      }
      return reacquireResult;
    }

    // 遮蔽中：予測のみで状態を維持し、このフレームは「検出なし」として返す
    // （呼び出し側は既存同様にこのフレームをスキップできる。例外は投げない）。
    stats.coastingFrameCount += 1;
    return { pose: null };
  }

  return {
    update,
    getStats: () => ({ ...stats }),
  };
}
