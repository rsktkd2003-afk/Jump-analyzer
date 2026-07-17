import { ghostButton, card, colors, mutedText, page, sectionTitle } from "../styles/theme";
import InstallPwaBanner from "../components/InstallPwaBanner";
import GoogleSignInButton from "../components/GoogleSignInButton";
import type { AuthUser } from "../firebase/authService";

type Props = {
  authUser: AuthUser | null;
  isAuthReady: boolean;
  isFirebaseReady: boolean;
  isSigningIn: boolean;
  onSignIn: () => Promise<void>;
  onSignOut: () => Promise<void>;
  historyCount: number;
  onClearHistory: () => void;
};

export default function SettingsPage({
  authUser,
  isAuthReady,
  isFirebaseReady,
  isSigningIn,
  onSignIn,
  onSignOut,
  historyCount,
  onClearHistory,
}: Props) {
  const handleClearAll = () => {
    if (historyCount === 0) return;
    if (window.confirm(`保存済みの解析履歴を${historyCount}件すべて削除します。よろしいですか？`)) {
      onClearHistory();
    }
  };

  return (
    <div style={page} className="page-container">
      <h1 style={{ fontSize: 20, marginBottom: 16 }}>設定</h1>

      <div style={card}>
        <h2 style={sectionTitle}>アカウント</h2>
        {!isFirebaseReady ? (
          <p style={{ ...mutedText, marginTop: 8 }}>
            ログイン機能は準備中です。動画解析は引き続きご利用いただけます。
          </p>
        ) : !isAuthReady ? (
          <p style={{ ...mutedText, marginTop: 8 }}>確認中...</p>
        ) : authUser ? (
          <div style={{ marginTop: 8, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <p style={{ ...mutedText, margin: 0 }}>
              {authUser.displayName ?? "Googleユーザー"} としてログイン中です。履歴の保存・比較が利用できます。
            </p>
            <button style={ghostButton} onClick={() => void onSignOut()}>
              ログアウト
            </button>
          </div>
        ) : (
          <div style={{ marginTop: 8 }}>
            <p style={{ ...mutedText, marginBottom: 12 }}>
              Googleでログインすると、解析結果を履歴として保存し、後から比較できます。ログインしなくても動画解析自体は利用できます。
            </p>
            <GoogleSignInButton onClick={() => void onSignIn()} isLoading={isSigningIn} />
          </div>
        )}
      </div>

      <div style={{ ...card, marginTop: 16 }}>
        <h2 style={sectionTitle}>データ管理</h2>
        <p style={{ ...mutedText, marginTop: 8 }}>
          解析履歴はログイン中のGoogleアカウントに紐づけてFirestoreに保存されます。現在 {historyCount} 件の履歴があります。
        </p>
        <button
          style={{ ...ghostButton, marginTop: 12, color: colors.warning, borderColor: colors.warningSoft }}
          onClick={handleClearAll}
          disabled={historyCount === 0}
        >
          履歴を全削除
        </button>
      </div>

      <div style={{ ...card, marginTop: 16 }}>
        <h2 style={sectionTitle}>アプリのインストール</h2>
        <p style={{ ...mutedText, marginTop: 8 }}>
          ホーム画面に追加すると、通信のない体育館でも動画解析まで利用できます。
        </p>
        <div style={{ marginTop: 12 }}>
          <InstallPwaBanner />
        </div>
      </div>

      <div style={{ ...card, marginTop: 16 }}>
        <h2 style={sectionTitle}>このアプリについて</h2>
        <p style={{ ...mutedText, marginTop: 8 }}>
          Jump Analyzer は動画から選手の姿勢を推定し、ジャンプ・スパイクフォームを解析するツールです。撮影方向や画角などの撮影設定は「解析」画面から動画ごとに設定します。
        </p>
      </div>
    </div>
  );
}
