import { ghostButton, card, colors, mutedText, page, sectionTitle } from "../styles/theme";
import InstallPwaBanner from "../components/InstallPwaBanner";

type Props = {
  historyCount: number;
  onClearHistory: () => void;
};

export default function SettingsPage({ historyCount, onClearHistory }: Props) {
  return (
    <div style={page} className="page-container">
      <h1 style={{ fontSize: 20, marginBottom: 16 }}>設定</h1>

      <div style={card}>
        <h2 style={sectionTitle}>データ管理</h2>
        <p style={{ ...mutedText, marginTop: 8 }}>
          解析履歴はこの端末のブラウザ内（localStorage）に保存されています。現在 {historyCount} 件の履歴があります。
        </p>
        <button
          style={{ ...ghostButton, marginTop: 12, color: colors.warning, borderColor: colors.warningSoft }}
          onClick={onClearHistory}
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
