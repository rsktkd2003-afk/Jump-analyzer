// =============================================================
// サイドバー等で使う線画アイコン（外部アイコンライブラリ非依存）。
// =============================================================
import type { CSSProperties } from "react";

type IconProps = {
  size?: number;
  style?: CSSProperties;
};

const base = {
  fill: "none",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function HomeIcon({ size = 20, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" stroke="currentColor" style={style} {...base}>
      <path d="M3 11.5 12 4l9 7.5" />
      <path d="M5.5 10v9a1 1 0 0 0 1 1H10a1 1 0 0 0 1-1v-4a1 1 0 0 1 1-1h0a1 1 0 0 1 1 1v4a1 1 0 0 0 1 1h3.5a1 1 0 0 0 1-1v-9" />
    </svg>
  );
}

export function AnalyzeIcon({ size = 20, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" stroke="currentColor" style={style} {...base}>
      <rect x="3.5" y="4.5" width="17" height="12" rx="2" />
      <path d="M10 9.5 14 12l-4 2.5z" fill="currentColor" stroke="none" />
      <path d="M8.5 20h7M12 16.5V20" />
    </svg>
  );
}

export function HistoryIcon({ size = 20, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" stroke="currentColor" style={style} {...base}>
      <path d="M4 12a8 8 0 1 0 2.5-5.8" />
      <path d="M3.5 4v4h4" />
      <path d="M12 8.5V12l3 2" />
    </svg>
  );
}

export function PlayersIcon({ size = 20, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" stroke="currentColor" style={style} {...base}>
      <circle cx="9" cy="8" r="3" />
      <path d="M3.5 19c0-3 2.5-5 5.5-5s5.5 2 5.5 5" />
      <circle cx="17" cy="8.5" r="2.3" />
      <path d="M15.2 14.3c2.4.3 4.3 2.1 4.3 4.7" />
    </svg>
  );
}

export function TeamIcon({ size = 20, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" stroke="currentColor" style={style} {...base}>
      <rect x="3.5" y="10" width="5" height="9" rx="1" />
      <rect x="9.75" y="6" width="5" height="13" rx="1" />
      <rect x="16" y="12.5" width="5" height="6.5" rx="1" />
    </svg>
  );
}

export function SettingsIcon({ size = 20, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" stroke="currentColor" style={style} {...base}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19 12a7 7 0 0 0-.1-1.2l1.8-1.4-1.5-2.6-2.1.7a7 7 0 0 0-2.1-1.2L14.6 4H9.4l-.4 2.3a7 7 0 0 0-2.1 1.2l-2.1-.7-1.5 2.6L5.1 10.8A7 7 0 0 0 5 12c0 .4 0 .8.1 1.2l-1.8 1.4 1.5 2.6 2.1-.7c.6.5 1.3.9 2.1 1.2l.4 2.3h5.2l.4-2.3c.8-.3 1.5-.7 2.1-1.2l2.1.7 1.5-2.6-1.8-1.4c.1-.4.1-.8.1-1.2Z" />
    </svg>
  );
}

export function BellIcon({ size = 20, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" stroke="currentColor" style={style} {...base}>
      <path d="M6 10a6 6 0 1 1 12 0c0 4 1.5 5.5 1.5 5.5H4.5S6 14 6 10Z" />
      <path d="M10 19a2 2 0 0 0 4 0" />
    </svg>
  );
}

export function UploadIcon({ size = 24, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" stroke="currentColor" style={style} {...base}>
      <path d="M12 15V4" />
      <path d="M7.5 8.5 12 4l4.5 4.5" />
      <path d="M4.5 15v3.5a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V15" />
    </svg>
  );
}

export function ChevronLeftIcon({ size = 20, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" stroke="currentColor" style={style} {...base}>
      <path d="M15 5 8 12l7 7" />
    </svg>
  );
}

export function CheckCircleIcon({ size = 16, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" stroke="currentColor" style={style} {...base}>
      <circle cx="12" cy="12" r="9" />
      <path d="m8 12.5 2.5 2.5L16 9.5" />
    </svg>
  );
}

export function WarnIcon({ size = 16, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" stroke="currentColor" style={style} {...base}>
      <path d="M12 4 3 20h18Z" />
      <path d="M12 10v4.5" />
      <circle cx="12" cy="17.2" r="0.4" fill="currentColor" />
    </svg>
  );
}

export function PlayIcon({ size = 16, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" stroke="currentColor" style={style} {...base}>
      <path d="M6 4.5v15l13-7.5Z" strokeLinejoin="round" />
    </svg>
  );
}

export function PauseIcon({ size = 16, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" stroke="currentColor" style={style} {...base}>
      <path d="M7 4.5v15M17 4.5v15" />
    </svg>
  );
}

export function StepBackIcon({ size = 16, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" stroke="currentColor" style={style} {...base}>
      <path d="M17 5v14L7 12z" strokeLinejoin="round" />
      <path d="M6 5v14" />
    </svg>
  );
}

export function StepForwardIcon({ size = 16, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" stroke="currentColor" style={style} {...base}>
      <path d="M7 5v14l10-7z" strokeLinejoin="round" />
      <path d="M18 5v14" />
    </svg>
  );
}

export function SaveIcon({ size = 16, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" stroke="currentColor" style={style} {...base}>
      <path d="M5 4h11l3 3v13H5z" />
      <path d="M8 4v5h7V4M8 20v-6h8v6" />
    </svg>
  );
}

export function PdfIcon({ size = 16, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" stroke="currentColor" style={style} {...base}>
      <path d="M7 3h7l4 4v14H7z" />
      <path d="M14 3v4h4" />
    </svg>
  );
}

export function ShareIcon({ size = 16, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" stroke="currentColor" style={style} {...base}>
      <circle cx="18" cy="6" r="2.3" />
      <circle cx="6" cy="12" r="2.3" />
      <circle cx="18" cy="18" r="2.3" />
      <path d="m8 10.8 8-3.6M8 13.2l8 3.6" />
    </svg>
  );
}

export function MenuIcon({ size = 20, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" stroke="currentColor" style={style} {...base}>
      <path d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  );
}

export function CloseIcon({ size = 20, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" stroke="currentColor" style={style} {...base}>
      <path d="M5 5l14 14M19 5 5 19" />
    </svg>
  );
}

export function TrophyIcon({ size = 20, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" stroke="currentColor" style={style} {...base}>
      <path d="M7 4h10v4a5 5 0 0 1-10 0Z" />
      <path d="M7 5H4.5A2.5 2.5 0 0 0 5.8 9.3M17 5h2.5A2.5 2.5 0 0 1 18.2 9.3" />
      <path d="M12 13v3M9 20h6M9.5 20c0-2 .8-3 2.5-3s2.5 1 2.5 3" />
    </svg>
  );
}
