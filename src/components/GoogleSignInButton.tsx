import EmailAuthPanel from "./EmailAuthPanel";
import { ghostButton, primaryButton } from "../styles/theme";

type Props = {
  onClick: () => void;
  isLoading?: boolean;
  disabled?: boolean;
  label?: string;
  variant?: "primary" | "ghost";
  style?: React.CSSProperties;
};

function GoogleLogo({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.28 1.48-1.13 2.73-2.4 3.58v2.98h3.88c2.27-2.09 3.54-5.17 3.54-8.8Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.07 7.93-2.92l-3.88-2.98c-1.08.72-2.45 1.15-4.05 1.15-3.11 0-5.75-2.1-6.69-4.93H1.3v3.09C3.26 21.3 7.31 24 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.31 14.32A7.2 7.2 0 0 1 4.93 12c0-.8.14-1.58.38-2.32V6.59H1.3A11.98 11.98 0 0 0 0 12c0 1.93.46 3.76 1.3 5.41l4.01-3.09Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.45-3.45C17.94 1.19 15.23 0 12 0 7.31 0 3.26 2.7 1.3 6.59l4.01 3.09C6.25 6.85 8.89 4.75 12 4.75Z"
      />
    </svg>
  );
}

export default function GoogleSignInButton({
  onClick,
  isLoading = false,
  disabled = false,
  label = "Googleでログイン",
  variant = "primary",
  style,
}: Props) {
  const base = variant === "primary" ? primaryButton : ghostButton;
  const showEmailAuth = variant === "ghost";

  return (
    <>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled || isLoading}
        style={{
          ...base,
          background: variant === "primary" ? "#fff" : base.background,
          color: "#3C4043",
          border: "1px solid #DADCE0",
          opacity: disabled || isLoading ? 0.6 : 1,
          cursor: disabled || isLoading ? "not-allowed" : "pointer",
          ...style,
        }}
      >
        <GoogleLogo />
        {isLoading ? "ログイン中..." : label}
      </button>
      {showEmailAuth && <EmailAuthPanel />}
    </>
  );
}
