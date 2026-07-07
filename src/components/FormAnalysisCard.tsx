import type { JumpFormAnalysisResult } from "../ai/poseAnalyzer";

type Props = {
  result: JumpFormAnalysisResult | null;
};

export default function FormAnalysisCard({ result }: Props) {
  if (!result) {
    return (
      <div style={cardStyle}>
        <h3 style={titleStyle}>フォーム解析</h3>
        <p style={textStyle}>まだフォーム解析は実行されていません。</p>
      </div>
    );
  }

  return (
    <div style={cardStyle}>
      <h3 style={titleStyle}>フォーム解析</h3>

      <p style={textStyle}>{result.message}</p>

      <div style={rowStyle}>
        <span>解析フレーム</span>
        <strong>{result.frame ?? "-"} F</strong>
      </div>

      <div style={rowStyle}>
        <span>解析時刻</span>
        <strong>
          {result.time !== null ? `${result.time.toFixed(3)} 秒` : "-"}
        </strong>
      </div>

      <div style={rowStyle}>
        <span>検出率</span>
        <strong>{result.confidence}%</strong>
      </div>

      {result.form && (
        <>
          <hr />
          <p style={textStyle}>フォーム解析データを取得しました。</p>
        </>
      )}
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  marginTop: 12,
  padding: 12,
  borderRadius: 12,
  background: "#f3f3f3",
};

const titleStyle: React.CSSProperties = {
  marginTop: 0,
  marginBottom: 8,
};

const textStyle: React.CSSProperties = {
  marginTop: 0,
  lineHeight: 1.6,
};

const rowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  marginTop: 6,
};