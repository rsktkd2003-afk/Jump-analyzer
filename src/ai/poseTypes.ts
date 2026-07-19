// =============================================================
// AI解析層のすべての型定義。
// このファイルは他のsrc/aiモジュールに依存しない（依存方向の終点）。
// =============================================================

/** 2次元座標。数学処理・人物選択などで共用する */
export type Point2D = {
  x: number;
  y: number;
};

export type TrackedLandmark = {
  x: number;
  y: number;
  z?: number;
  visibility?: number;
};

export type TrackedCrop = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type TrackedFrame = {
  frameIndex: number;
  time: number;

  landmarks: TrackedLandmark[];

  crop: TrackedCrop;

  centerX: number;
  centerY: number;

  leftKneeAngle: number | null;
  rightKneeAngle: number | null;

  hipAngle: number | null;
  shoulderTilt: number | null;

  leftHipAngle: number | null;
  rightHipAngle: number | null;

  leftElbowAngle: number | null;
  rightElbowAngle: number | null;

  leftShoulderAngle: number | null;
  rightShoulderAngle: number | null;

  /** 左右入れ替わり補正の結果（Phase1追加）。未適用/フラグOFF時はundefined */
  lateralityCorrection?: LateralityCorrectionResult;

  /** 軽量トラッカーによるこのフレームの人物マッチング品質（Phase1追加）。未適用時はundefined */
  trackingQuality?: TrackerFrameQuality;
};

/** 左右入れ替わり検出・補正の結果（フレーム単位）。 */
export type LateralityCorrectionResult = {
  /** このフレームで左右を入れ替えたか */
  corrected: boolean;
  /** 判定の確信度（0〜1）。低いほど交換有無の判断が曖昧だったことを示す */
  confidence: number;
  /** デバッグ用の理由（本番の通常表示では使わない） */
  reason?: string;
};

/** 軽量トラッカーによる、このフレームの人物マッチング品質。 */
export type TrackerFrameQuality = {
  /** 予測・IoU・サイズ・ポーズ類似度等を統合したマッチングスコア（0〜1、高いほど良い） */
  matchScore: number;
  /** 予約フィールド。coasting中はTrackedFrame自体が生成されないため、
   *  このフィールドが付与されたフレームでは常にfalseになる。
   *  coasting比率の集計には PersonTrackerStats.coastingFrameCount を使うこと。 */
  isCoasting: boolean;
  /** 対象を再取得した直後のフレームか */
  reacquired: boolean;
};

/**
 * 軽量トラッカーの解析全体を通じた統計。
 * coasting（予測のみで維持したフレーム）は pose:null を返すため
 * TrackedFrame自体が生成されない。そのため生成済みのTrackedFrame[]から
 * 事後的に逆算するのではなく、トラッカー自身がカウントを保持する。
 */
export type PersonTrackerStats = {
  /** update()が呼ばれた総フレーム数 */
  updateCount: number;
  /** 候補を同一人物として採用できたフレーム数（初回取得・再取得を含む） */
  matchedFrameCount: number;
  /** 候補を採用せず予測状態のみを維持した（=検出なし扱いにした）フレーム数 */
  coastingFrameCount: number;
  /** MAX_COASTING_FRAMES超過後、クリック位置基準で再取得できた回数 */
  reacquiredCount: number;
  /** マッチングスコアが閾値を満たさず不採用になった候補の延べ数 */
  rejectedCandidateCount: number;
  /** 採用できたフレームのマッチングスコアの合計（平均算出用） */
  matchScoreSum: number;
  /** matchScoreSumの対象フレーム数 */
  matchScoreCount: number;
};

export type LandmarkSmoothingOptions = {
  enabled?: boolean;
};

export type MotionTrackingOptions = {
  smoothing?: LandmarkSmoothingOptions;
};

export type MotionTrackingResult = {
  frames: TrackedFrame[];
  detectedFrameCount: number;
  checkedFrameCount: number;
  confidence: number;
  message: string;
  /** 軽量トラッカー（Phase1）の統計。トラッカー未使用（Feature Flag OFF）時はundefined */
  trackerStats?: PersonTrackerStats;
};

export type PoseAnalysisResult = {
  bestFrame: number | null;
  bestTime: number | null;
  confidence: number;
  message: string;
};

export type FormAnalysisResult = {
  elbowText: string;
  postureText: string;
  kneeText: string;
  summary: string;
};

export type JumpFormAnalysisResult = {
  frame: number | null;
  time: number | null;
  confidence: number;
  message: string;
  form: FormAnalysisResult | null;
};

export type PoseOverlayPoint = {
  x: number;
  y: number;
};