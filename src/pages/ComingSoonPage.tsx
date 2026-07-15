import type { ReactElement } from "react";
import { card, colors, mutedText, page } from "../styles/theme";

type Props = {
  title: string;
  description: string;
  icon: ReactElement;
};

/**
 * 選手/チーム機能は複数選手・複数チームのデータモデルを前提とするが、
 * 現在のアプリは単一動画の解析（ローカル履歴のみ）を対象としているため、
 * 実データに基づく画面はまだ提供できない。サイドバー構成は画像に合わせて
 * 維持しつつ、準備中である旨を明示する。
 */
export default function ComingSoonPage({ title, description, icon }: Props) {
  return (
    <div style={page}>
      <h1 style={{ fontSize: 20, marginBottom: 16 }}>{title}</h1>
      <div style={{ ...card, textAlign: "center", padding: "64px 24px" }}>
        <div
          style={{
            width: 56,
            height: 56,
            margin: "0 auto 16px",
            borderRadius: "50%",
            background: colors.accentSoft,
            color: colors.accent,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {icon}
        </div>
        <div style={{ fontSize: 16, fontWeight: 700, color: colors.titleText }}>準備中です</div>
        <p style={{ ...mutedText, marginTop: 8, maxWidth: 420, marginLeft: "auto", marginRight: "auto" }}>
          {description}
        </p>
      </div>
    </div>
  );
}
