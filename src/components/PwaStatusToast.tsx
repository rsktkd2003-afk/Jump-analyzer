import { useEffect } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";

// 解析中に強制リロードされるとデータが失われるため、
// registerType: "prompt" と組み合わせ、更新はユーザー操作でのみ行う。
const OFFLINE_TOAST_AUTO_HIDE_MS = 4000;

function PwaStatusToast() {
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  useEffect(() => {
    if (!offlineReady) return;

    const timer = window.setTimeout(() => {
      setOfflineReady(false);
    }, OFFLINE_TOAST_AUTO_HIDE_MS);

    return () => window.clearTimeout(timer);
  }, [offlineReady, setOfflineReady]);

  if (!offlineReady && !needRefresh) return null;

  return (
    <div
      style={{
        position: "fixed",
        left: 12,
        right: 12,
        bottom: 12,
        maxWidth: 480,
        margin: "0 auto",
        zIndex: 1000,
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      {needRefresh && (
        <div
          style={{
            background: "#222",
            color: "#fff",
            borderRadius: 12,
            padding: 12,
            boxShadow: "0 4px 16px rgba(0,0,0,0.25)",
          }}
        >
          <p style={{ margin: 0, fontSize: 14 }}>新しいバージョンがあります</p>
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button
              onClick={() => updateServiceWorker(true)}
              style={{
                flex: 1,
                padding: 10,
                borderRadius: 10,
                border: "none",
                background: "#4da3ff",
                color: "#fff",
                fontSize: 14,
              }}
            >
              更新する
            </button>
            <button
              onClick={() => setNeedRefresh(false)}
              style={{
                flex: 1,
                padding: 10,
                borderRadius: 10,
                border: "1px solid #555",
                background: "transparent",
                color: "#fff",
                fontSize: 14,
              }}
            >
              あとで
            </button>
          </div>
        </div>
      )}

      {offlineReady && !needRefresh && (
        <div
          style={{
            background: "#2f6f4f",
            color: "#fff",
            borderRadius: 12,
            padding: "10px 12px",
            boxShadow: "0 4px 16px rgba(0,0,0,0.25)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span style={{ fontSize: 13 }}>オフラインで使用できます</span>
          <button
            onClick={() => setOfflineReady(false)}
            aria-label="閉じる"
            style={{
              border: "none",
              background: "none",
              color: "#fff",
              fontSize: 16,
              cursor: "pointer",
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}

export default PwaStatusToast;
