import { useState } from "react";
import { card, colors, ghostButton, inputStyle, primaryButton, radius } from "../styles/theme";
import { confidenceLevelLabel, type ConfidenceLevel } from "../utils/analysisConfidence";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (title: string, memo: string) => void;
  isSaving: boolean;
  defaultTitle: string;
  initialTitle: string;
  initialMemo: string;

  analyzedAtLabel: string;
  totalScore: number | null;
  maxReachCm: number | null;
  jumpHeightCm: number | null;
  flightTimeSec: number | null;
  takeoffTimeSec: number | null;
  captureSettingsLabel: string;
  confidenceLevel: ConfidenceLevel;
};

export default function SaveHistoryModal({
  isOpen,
  onClose,
  onConfirm,
  isSaving,
  defaultTitle,
  initialTitle,
  initialMemo,
  analyzedAtLabel,
  totalScore,
  maxReachCm,
  jumpHeightCm,
  flightTimeSec,
  takeoffTimeSec,
  captureSettingsLabel,
  confidenceLevel,
}: Props) {
  const [title, setTitle] = useState(initialTitle);
  const [memo, setMemo] = useState(initialMemo);

  if (!isOpen) return null;

  const rows: Array<{ label: string; value: string }> = [
    { label: "解析日時", value: analyzedAtLabel },
    { label: "総合スコア", value: totalScore !== null ? `${totalScore}点` : "評価不能" },
    { label: "最高到達点", value: maxReachCm !== null ? `${maxReachCm.toFixed(1)}cm` : "未計測" },
    { label: "ジャンプ高", value: jumpHeightCm !== null ? `${jumpHeightCm.toFixed(1)}cm` : "未計測" },
    { label: "滞空時間", value: flightTimeSec !== null ? `${flightTimeSec.toFixed(3)}秒` : "未計測" },
    { label: "踏切時間", value: takeoffTimeSec !== null ? `${takeoffTimeSec.toFixed(2)}秒` : "未計測" },
    { label: "撮影条件", value: captureSettingsLabel },
    { label: "解析信頼度", value: confidenceLevelLabel(confidenceLevel) },
  ];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="履歴に保存する内容の確認"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(20,21,26,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        zIndex: 2000,
      }}
      onClick={onClose}
    >
      <div
        style={{ ...card, maxWidth: 480, width: "100%", maxHeight: "90vh", overflowY: "auto" }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ fontSize: 16, fontWeight: 700, color: colors.titleText, margin: 0 }}>
          この内容で履歴に保存しますか？
        </h2>

        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 6 }}>
          {rows.map((row) => (
            <div
              key={row.label}
              style={{ display: "flex", justifyContent: "space-between", fontSize: 13, gap: 12 }}
            >
              <span style={{ color: colors.bodyText }}>{row.label}</span>
              <span style={{ color: colors.titleText, fontWeight: 600, textAlign: "right" }}>{row.value}</span>
            </div>
          ))}
        </div>

        <label style={{ display: "block", marginTop: 16 }}>
          <span style={{ display: "block", fontSize: 12, fontWeight: 600, color: colors.bodyText, marginBottom: 6 }}>
            タイトル（任意）
          </span>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={defaultTitle}
            style={inputStyle}
            maxLength={80}
          />
        </label>

        <label style={{ display: "block", marginTop: 12 }}>
          <span style={{ display: "block", fontSize: 12, fontWeight: 600, color: colors.bodyText, marginBottom: 6 }}>
            メモ（任意）
          </span>
          <textarea
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            rows={3}
            maxLength={500}
            style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }}
          />
        </label>

        <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            style={{ ...ghostButton, flex: 1, borderRadius: radius.md, opacity: isSaving ? 0.6 : 1 }}
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={() => onConfirm(title.trim() || defaultTitle, memo.trim())}
            disabled={isSaving}
            style={{ ...primaryButton, flex: 1, opacity: isSaving ? 0.6 : 1, cursor: isSaving ? "not-allowed" : "pointer" }}
          >
            {isSaving ? "保存中..." : "保存する"}
          </button>
        </div>
      </div>
    </div>
  );
}
