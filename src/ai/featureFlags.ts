// =============================================================
// Phase1（トラッキング精度改善）の Feature Flag。
// 秘密情報ではないため .env は使わず、他の設定値（例: captureSettings.ts の
// DEFAULT_CAPTURE_SETTINGS）と同様にコード内の定数として持つ。
// 問題が起きた場合はここを false にするだけで各機能を個別に無効化できる。
// =============================================================

/** 左右関節の入れ替わり検出・補正を有効にするか */
export const ENABLE_LATERALITY_CORRECTION = true;

/** 軽量な時系列人物トラッカー（予測+マッチング）を有効にするか。
 *  falseの場合は既存の「毎フレーム最近傍選択」方式を使う。 */
export const ENABLE_TEMPORAL_TRACKER = true;

/** 信頼度算出v2（既存未活用シグナルの統合）を有効にするか。
 *  falseの場合は従来のvisibility平均のみの信頼度算出に戻る。 */
export const ENABLE_CONFIDENCE_V2 = true;

// =============================================================
// Phase2A（単眼3D解析基盤）の Feature Flag。
// docs/PHASE2_MONOCULAR_3D_DESIGN.md 参照。
// 3つともfalseにすれば、3D関連の処理は一切行われずPhase1と完全に
// 同じ挙動になる（TrackedFrame.worldLandmarks3D等は常にundefined）。
// =============================================================

/** MediaPipeのworldLandmarks（実寸3D座標）の取得・検証・保持を有効にするか。
 *  falseの場合、3D関連処理は一切行わない。 */
export const ENABLE_WORLD_LANDMARKS_3D = true;

/** 3Dランドマークの時系列平滑化を有効にするか。
 *  ENABLE_WORLD_LANDMARKS_3Dがfalseの場合は無条件に無効。 */
export const ENABLE_3D_SMOOTHING = true;

/** 3D指標（肩・骨盤回旋角等）の算出を有効にするか。
 *  falseでも既存の2D採点には一切影響しない（Phase2Aでは採点へ未接続のため）。
 *  ENABLE_WORLD_LANDMARKS_3Dがfalseの場合は無条件に無効。 */
export const ENABLE_3D_METRICS = false;
