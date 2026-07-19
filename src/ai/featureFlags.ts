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
