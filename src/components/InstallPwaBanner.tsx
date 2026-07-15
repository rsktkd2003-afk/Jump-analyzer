import { useState } from "react";

import { useInstallPrompt } from "../hooks/useInstallPrompt";
import { buttonStyle, hintStyle } from "../styles/ui";

const IOS_HINT_DISMISSED_KEY = "jump-analyzer:ios-install-hint-dismissed";

function InstallPwaBanner() {
  const { canInstall, isInstalled, isIos, promptInstall } =
    useInstallPrompt();
  const [iosHintDismissed, setIosHintDismissed] = useState<boolean>(
    () => localStorage.getItem(IOS_HINT_DISMISSED_KEY) === "1"
  );

  if (isInstalled) return null;

  if (canInstall) {
    return (
      <button onClick={promptInstall} style={{ ...buttonStyle, width: "100%" }}>
        📲 アプリをインストール
      </button>
    );
  }

  if (isIos && !iosHintDismissed) {
    return (
      <div
        style={{
          border: "1px solid #ccc",
          borderRadius: 12,
          padding: 12,
          marginTop: 8,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 8,
        }}
      >
        <p style={{ ...hintStyle, margin: 0 }}>
          ホーム画面に追加するには、Safariの共有ボタン（
          <span aria-hidden="true">⬆️</span>）から
          「ホーム画面に追加」を選んでください。
        </p>
        <button
          onClick={() => {
            localStorage.setItem(IOS_HINT_DISMISSED_KEY, "1");
            setIosHintDismissed(true);
          }}
          aria-label="閉じる"
          style={{
            border: "none",
            background: "none",
            fontSize: 16,
            cursor: "pointer",
            lineHeight: 1,
          }}
        >
          ×
        </button>
      </div>
    );
  }

  return null;
}

export default InstallPwaBanner;
