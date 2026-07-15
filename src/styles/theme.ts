// =============================================================
// 共通デザイントークン・スタイルヘルパー。
// Apple/Linear/Notion/Hudl/HomeCourt を参考にした
// 「シンプルだが情報量の多いスポーツ分析アプリ」向けの配色・余白基準。
// =============================================================
import type { CSSProperties } from "react";

export const colors = {
  bg: "#F6F7FB",
  card: "#FFFFFF",
  border: "#EBEDF3",
  accent: "#E53935",
  accentSoft: "#FDEBEA",
  accentSofter: "#FFF5F4",
  titleText: "#14151A",
  bodyText: "#6B7280",
  mutedText: "#9CA3AF",
  success: "#16A34A",
  successSoft: "#EAF7EE",
  warning: "#E53935",
  warningSoft: "#FDEBEA",
  gold: "#F5A623",
  sidebarBg: "#14151A",
  sidebarText: "#B4B6C0",
  sidebarActiveText: "#FFFFFF",
};

export const radius = {
  sm: 10,
  md: 14,
  lg: 16,
  xl: 20,
  pill: 999,
};

export const shadow = {
  card: "0 1px 2px rgba(16,24,40,0.04), 0 1px 8px rgba(16,24,40,0.03)",
  raised: "0 4px 16px rgba(16,24,40,0.06)",
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
};

export const page: CSSProperties = {
  padding: "24px 28px 48px",
  maxWidth: 1400,
  margin: "0 auto",
  width: "100%",
  boxSizing: "border-box",
};

export const card: CSSProperties = {
  background: colors.card,
  borderRadius: radius.lg,
  border: `1px solid ${colors.border}`,
  boxShadow: shadow.card,
  padding: spacing.lg,
  boxSizing: "border-box",
};

export const sectionTitle: CSSProperties = {
  fontSize: 16,
  fontWeight: 700,
  color: colors.titleText,
  margin: 0,
};

export const pageTitle: CSSProperties = {
  fontSize: 22,
  fontWeight: 700,
  color: colors.titleText,
  margin: 0,
};

export const mutedText: CSSProperties = {
  fontSize: 13,
  color: colors.bodyText,
  lineHeight: 1.6,
  margin: 0,
};

export const primaryButton: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  padding: "12px 20px",
  borderRadius: radius.md,
  border: "none",
  background: colors.accent,
  color: "#fff",
  fontSize: 15,
  fontWeight: 600,
  cursor: "pointer",
};

export const secondaryButton: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  padding: "12px 20px",
  borderRadius: radius.md,
  border: `1px solid ${colors.border}`,
  background: "#fff",
  color: colors.titleText,
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
};

export const ghostButton: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  padding: "8px 14px",
  borderRadius: radius.pill,
  border: `1px solid ${colors.border}`,
  background: "#fff",
  color: colors.bodyText,
  fontSize: 13,
  fontWeight: 500,
  cursor: "pointer",
};

export const inputStyle: CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: radius.sm,
  border: `1px solid ${colors.border}`,
  fontSize: 14,
  color: colors.titleText,
  background: "#fff",
  boxSizing: "border-box",
};

export const grid = (minWidth: number): CSSProperties => ({
  display: "grid",
  gridTemplateColumns: `repeat(auto-fit, minmax(${minWidth}px, 1fr))`,
  gap: spacing.lg,
});

export function statusColor(kind: "success" | "warning" | "neutral"): string {
  if (kind === "success") return colors.success;
  if (kind === "warning") return colors.warning;
  return colors.bodyText;
}
