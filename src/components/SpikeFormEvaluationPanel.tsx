import { useMemo } from "react";

import type { CaptureSettings } from "./captureSettings";
import { DEFAULT_CAPTURE_SETTINGS } from "./captureSettings";
import { getCaptureConfidenceFactor } from "./captureConfidence";

import {
  evaluateSpikeForm,
  formatMetricValue,
  type SpikeArmForm,
  type SpikeFormEvaluationResult,
} from "../ai/spikeFormEvaluation";
import type { TrackedFrame } from "../ai/trackingAnalyzer";

const formOptions: Array<{ value: SpikeArmForm; label: string; description: string }> = [
  {
    value: "straightArm",
    label: "ストレートアーム",
    description: "肘高さ・腕伸展・身体一直線性をやや重視",
  },
  {
    value: "bowAndArrow",
    label: "ボーアンドアロー",
    description: "肩の開き・胸郭回旋・逆腕保持をやや重視",
  },
  {
    value: "circularArm",
    label: "サーキュラーアーム",
    description: "腕軌道・回旋継続・加速順序をやや重視",
  },
];

type Props = {
  frames: TrackedFrame[];
  selectedForm: SpikeArmForm;
  onSelectedFormChange: (form: SpikeArmForm) => void;
};

export default function SpikeFormEvaluationPanel({
  frames,
  selectedForm,
  onSelectedFormChange,
}: Props) {
  const result = useMemo<SpikeFormEvaluationResult | null>(() => {
    return evaluateSpikeForm(frames, selectedForm);
  }, [frames, selectedForm]);

  return (
    <section style={cardStyle}>
      <h3 style={{ marginTop: 0 }}>フォーム別・総合評価</h3>

      <p style={descriptionStyle}>
        助走から着地までの一連の流れを、選択した腕のフォームに合わせた重み付けで評価します。
        既存の解析結果はそのまま残し、この評価は追加表示だけ行います。
      </p>

      <div style={selectorStyle}>
        {formOptions.map((option) => (
          <label
            key={option.value}
            style={{
              ...optionStyle,
              borderColor: selectedForm === option.value ? "#222" : "#ddd",
              background: selectedForm === option.value ? "#fff" : "#f7f7f7",
            }}
          >
            <input
              type="radio"
              name="spike-arm-form"
              value={option.value}
              checked={selectedForm === option.value}
              onChange={() => onSelectedFormChange(option.value)}
            />
            <span>
              <strong>{option.label}</strong>
              <span style={smallTextStyle}>{option.description}</span>
            </span>
          </label>
        ))}
      </div>

      {!result ? (
        <p style={descriptionStyle}>
          ジャンプ区間を特定できなかったため、フォーム評価を作成できませんでした。
          足元を含む全身が映っている動画で再解析してください。
        </p>
      ) : (
        <EvaluationResultView result={result} />
      )}
    </section>
  );
}

function EvaluationResultView({ result }: { result: SpikeFormEvaluationResult }) {
  return (
    <div style={{ marginTop: 14 }}>
      <div style={scoreHeaderStyle}>
        <div>
          <div style={smallTextStyle}>選択フォーム</div>
          <strong>{result.selectedFormLabel}</strong>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={smallTextStyle}>総合評価</div>
          <strong style={scoreStyle}>{formatScore(result.overallScore)}</strong>
        </div>
      </div>

      <p style={smallTextStyle}>計測成立率：{(result.confidence * 100).toFixed(0)}%</p>

      {result.priorityMetrics.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <strong>改善優先順位</strong>
          <div style={{ marginTop: 8 }}>
            {result.priorityMetrics.map((metric, index) => (
              <div key={metric.id} style={priorityRowStyle}>
                <span style={rankStyle}>{index + 1}</span>
                <div style={{ flex: 1 }}>
                  <strong>{metric.label}</strong>
                  <div style={smallTextStyle}>{metric.description}</div>
                </div>
                <div style={valueStyle}>
                  <div>{formatScore(metric.score)}</div>
                  <span style={smallTextStyle}>{formatMetricValue(metric)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ marginTop: 14 }}>
        <strong>カテゴリ評価</strong>
        <div style={categoryGridStyle}>
          {result.categories.map((category) => (
            <details key={category.id} style={categoryStyle}>
              <summary style={summaryStyle}>
                <span>{category.label}</span>
                <strong>{formatScore(category.score)}</strong>
              </summary>
              <div style={{ marginTop: 8 }}>
                {category.metrics.map((metric) => (
                  <div key={metric.id} style={metricRowStyle}>
                    <div>
                      <strong>{metric.label}</strong>
                      <div style={smallTextStyle}>{metric.description}</div>
                    </div>
                    <div style={valueStyle}>
                      <div>{formatScore(metric.score)}</div>
                      <span style={smallTextStyle}>{formatMetricValue(metric)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </details>
          ))}
        </div>
      </div>

      <p style={descriptionStyle}>{result.note}</p>
    </div>
  );
}

function formatScore(score: number | null): string {
  return score === null ? "—" : `${Math.round(score)}点`;
}

const cardStyle: React.CSSProperties = {
  marginTop: 12,
  padding: 16,
  borderRadius: 12,
  background: "#f7f7f7",
  border: "1px solid #ddd",
  fontSize: 14,
};

const descriptionStyle: React.CSSProperties = {
  margin: "8px 0 0",
  color: "#666",
  lineHeight: 1.6,
  fontSize: 13,
};

const selectorStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 8,
  marginTop: 12,
};

const optionStyle: React.CSSProperties = {
  display: "flex",
  gap: 8,
  alignItems: "flex-start",
  padding: 10,
  border: "1px solid #ddd",
  borderRadius: 10,
  cursor: "pointer",
};

const scoreHeaderStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  padding: 12,
  borderRadius: 10,
  background: "#fff",
  border: "1px solid #e0e0e0",
};

const scoreStyle: React.CSSProperties = {
  fontSize: 28,
  lineHeight: 1,
};

const categoryGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 8,
  marginTop: 8,
};

const categoryStyle: React.CSSProperties = {
  padding: 10,
  borderRadius: 10,
  background: "#fff",
  border: "1px solid #e0e0e0",
};

const summaryStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  cursor: "pointer",
};

const priorityRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: 10,
  padding: "10px 0",
  borderBottom: "1px solid #e5e5e5",
};

const rankStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 24,
  height: 24,
  borderRadius: 999,
  background: "#222",
  color: "#fff",
  fontWeight: 700,
};

const metricRowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 10,
  padding: "8px 0",
  borderBottom: "1px solid #eee",
};

const valueStyle: React.CSSProperties = {
  textAlign: "right",
  whiteSpace: "nowrap",
  fontWeight: 700,
};

const smallTextStyle: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  color: "#777",
  lineHeight: 1.5,
};
