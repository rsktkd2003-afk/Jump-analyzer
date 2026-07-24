import { useState, type FormEvent } from "react";
import {
  createUserWithEmail,
  describeSignInError,
  signInWithEmail,
} from "../firebase/authService";
import { colors } from "../styles/theme";

type Mode = "login" | "register";

type Props = {
  onAuthenticated?: () => void;
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  borderRadius: 8,
  border: "1px solid rgba(255,255,255,0.18)",
  background: "rgba(255,255,255,0.08)",
  color: "#fff",
  padding: "9px 10px",
  fontSize: 12,
  outline: "none",
};

export default function EmailAuthPanel({ onAuthenticated }: Props) {
  const [mode, setMode] = useState<Mode>("login");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (!email.trim()) {
      setError("メールアドレスを入力してください。");
      return;
    }
    if (password.length < 6) {
      setError("パスワードは6文字以上で入力してください。");
      return;
    }
    if (mode === "register" && !displayName.trim()) {
      setError("表示名を入力してください。");
      return;
    }

    setIsSubmitting(true);
    try {
      if (mode === "register") {
        await createUserWithEmail({ displayName, email, password });
      } else {
        await signInWithEmail(email, password);
      }
      setPassword("");
      onAuthenticated?.();
    } catch (authError) {
      if (authError instanceof Error && authError.message === "表示名を入力してください。") {
        setError(authError.message);
      } else {
        setError(describeSignInError(authError));
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const switchMode = (nextMode: Mode) => {
    setMode(nextMode);
    setError(null);
    setPassword("");
  };

  return (
    <div style={{ marginTop: 10 }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 4,
          marginBottom: 8,
        }}
      >
        <button
          type="button"
          onClick={() => switchMode("login")}
          style={{
            border: "none",
            borderRadius: 7,
            padding: "7px 6px",
            cursor: "pointer",
            fontSize: 11,
            fontWeight: 700,
            background: mode === "login" ? colors.accent : "rgba(255,255,255,0.08)",
            color: "#fff",
          }}
        >
          ログイン
        </button>
        <button
          type="button"
          onClick={() => switchMode("register")}
          style={{
            border: "none",
            borderRadius: 7,
            padding: "7px 6px",
            cursor: "pointer",
            fontSize: 11,
            fontWeight: 700,
            background: mode === "register" ? colors.accent : "rgba(255,255,255,0.08)",
            color: "#fff",
          }}
        >
          新規登録
        </button>
      </div>

      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 7 }}>
        {mode === "register" && (
          <input
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            placeholder="表示名"
            autoComplete="name"
            maxLength={40}
            disabled={isSubmitting}
            style={inputStyle}
          />
        )}
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="メールアドレス"
          autoComplete="email"
          disabled={isSubmitting}
          style={inputStyle}
        />
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="パスワード（6文字以上）"
          autoComplete={mode === "register" ? "new-password" : "current-password"}
          minLength={6}
          disabled={isSubmitting}
          style={inputStyle}
        />
        <button
          type="submit"
          disabled={isSubmitting}
          style={{
            border: "none",
            borderRadius: 8,
            padding: "9px 10px",
            cursor: isSubmitting ? "wait" : "pointer",
            fontSize: 12,
            fontWeight: 800,
            background: colors.accent,
            color: "#fff",
            opacity: isSubmitting ? 0.7 : 1,
          }}
        >
          {isSubmitting
            ? "処理中..."
            : mode === "register"
              ? "メールアドレスで登録"
              : "メールアドレスでログイン"}
        </button>
      </form>

      {error && (
        <p style={{ color: colors.accent, fontSize: 11, margin: "7px 0 0", lineHeight: 1.5 }}>
          {error}
        </p>
      )}
    </div>
  );
}
