import { useEffect } from "react";

import FormAnalysisCard from "./FormAnalysisCard";
import type { JumpFormAnalysisResult } from "../ai/poseAnalyzer";
import { buttonStyle } from "../styles/ui";

type Props = {
  onPeakDetected?: (frame: number, time: number) => void;

  // フォーム解析の状態は親（解析フロー全体を束ねる画面）から受け取る。
  // ロジック（usePoseAnalysis）自体は変更せず、呼び出し位置のみを
  // 親へ引き上げて「解析を開始する」ボタンから一括起動できるようにしている。
  formResult: JumpFormAnalysisResult | null;
  peakFrame: number | null;
  peakTime: number | null;
  isAnalyzing: boolean;
  message: string;
  analyzeForm: () => void;
};

/**
 * フォーム解析のセクション。
 */
export default function FormAnalysisSection({
  onPeakDetected,
  formResult,
  peakFrame,
  peakTime,
  isAnalyzing,
  message,
  analyzeForm,
}: Props) {
  useEffect(() => {
    if (peakFrame === null || peakTime === null) return;
    onPeakDetected?.(peakFrame, peakTime);
  }, [peakFrame, peakTime, onPeakDetected]);

  return (
    <section>
      <h2>フォーム解析</h2>

      <button
        onClick={analyzeForm}
        disabled={isAnalyzing}
        style={{ ...buttonStyle, width: "100%" }}
      >
        {isAnalyzing ? "解析中..." : "フォーム解析"}
      </button>

      {message && <p style={{ fontSize: 14 }}>{message}</p>}

      <FormAnalysisCard result={formResult} />
    </section>
  );
}
