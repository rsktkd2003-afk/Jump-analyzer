// =============================================================
// 後方互換のための再エクスポート。
// フォーム解析の実体は jumpPeakAnalyzer.ts、型は poseTypes.ts に移動した。
// 参照箇所を poseAnalyzer 経由に置き換えたら、このファイルは削除してよい。
// =============================================================

export { analyzeJumpForm } from "./jumpPeakAnalyzer";
export type { FormAnalysisResult } from "./poseTypes";