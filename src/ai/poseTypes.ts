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

  /**
   * MediaPipeのworldLandmarksから取得した実寸3D関節座標（Phase2A追加）。
   * 2Dランドマークと同じ人物インデックスから取得したものだけを保持する。
   * 取得不可・検証NG（33点未満・非有限値・visibility不足・体幹長異常・
   * 移動量異常等）の場合はundefined（＝既存2D解析へ安全にフォールバック）。
   * Feature Flag（ENABLE_WORLD_LANDMARKS_3D）OFF時は常にundefined。
   * pose3DPipeline.tsの検証・平滑化を通過した後は、平滑化後の値に置き換わる
   * （検証NG・長時間欠損の場合はundefinedになる）。
   */
  worldLandmarks3D?: PoseWorldLandmark[];

  /**
   * worldLandmarks3Dを骨盤中心原点・体幹長スケールで正規化した3D姿勢（Phase2A追加）。
   * pose3DPipeline.tsでworldLandmarks3Dの検証・平滑化後に算出する。
   * worldLandmarks3Dがundefinedのフレームでは、これもundefined。
   */
  normalizedPose3D?: NormalizedPose3D;
};

/**
 * MediaPipeのworldLandmarksが返す、実寸（メートル単位）の3D関節座標。
 *
 * 座標系について（@mediapipe/tasks-vision の型定義および公式ドキュメントで
 * 確認できる範囲）:
 * - 確認済み: 原点は左右股関節の中点。単位はメートル。
 * - 確認済み: z軸は値が小さいほどカメラに近い（MediaPipe公式ドキュメント・
 *   パッケージ型定義のコメントで明記）。
 * - 未確認: x軸・y軸の正方向（画面右/左のどちらがx正方向か等）は、
 *   MediaPipe公式ドキュメントに明記がなく、コミュニティのGitHub Issue
 *   （google-ai-edge/mediapipe#3370, 2022年提起・本調査時点で未回答）
 *   でも解決していない。本実装ではMediaPipeの生座標をそのまま保持し、
 *   独自の軸変換・符号反転は行わない（表示層で必要になった時点で変換する）。
 *   肩・骨盤の回旋角や体幹傾きなど本Phaseで追加する指標は、いずれも
 *   同一フレーム内の相対的なベクトル計算であるため、x/y軸の絶対的な
 *   向きが未確認でも内部的な符号の一貫性は保たれる。実動画E2E検証で
 *   実際の動きと数値の対応を確認し、必要であれば符号反転を検討する
 *   （Phase 2B以降）。
 */
export type PoseWorldLandmark = {
  x: number;
  y: number;
  z: number;
  /** @mediapipe/tasks-visionの型定義上は必須(number)だが、実データでの
   *  欠落・異常値に備えoptionalとして扱う */
  visibility?: number;
};

/**
 * 骨盤中心（左右股関節の中点）を原点、体幹長（または肩幅）をスケールとして
 * 正規化した3D姿勢。評価・指標算出には生のworldLandmarksではなくこちらを使う。
 */
export type NormalizedPose3D = {
  landmarks: PoseWorldLandmark[];
  origin: { x: number; y: number; z: number };
  /** 正規化に使ったスケール（メートル）。0や極端に小さい値にはならない（下限あり） */
  scale: number;
  /** この正規化結果の信頼度（0〜1）。主要関節のvisibilityから算出 */
  quality: number;
};

/** 3D処理（Phase2A）の品質シグナル。既存の2D信頼度算出（analysisConfidence.ts）
 *  とは独立しており、Phase2Aでは総合スコアに反映しない（デバッグ・検証用）。 */
export type Pose3DQualitySignals = {
  /** 検証済みで有効だった（=フォールバックしなかった）フレームの割合 */
  availableFrameRatio: number;
  /** 有効フレームのうち、主要関節の平均visibilityが低かったフレームの割合 */
  lowConfidenceFrameRatio: number;
  /** 短時間欠損として補間されたフレームの割合 */
  interpolatedFrameRatio: number;
  /** 前フレームからの移動量が異常と判定され無効化されたフレームの割合 */
  abnormalMotionFrameRatio: number;
  /** 有効フレームにおける主要関節の平均visibility */
  meanVisibility: number;
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
  /** 3D処理（Phase2A）の品質シグナル。ENABLE_WORLD_LANDMARKS_3D OFF時はundefined */
  pose3DQuality?: Pose3DQualitySignals;
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