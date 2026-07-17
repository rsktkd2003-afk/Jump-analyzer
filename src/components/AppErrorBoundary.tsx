import { Component, type ErrorInfo, type ReactNode } from "react";
import { reportAppError } from "../utils/appLogger";

type Props = {
  children: ReactNode;
};

type State = {
  hasError: boolean;
};

export default class AppErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    reportAppError(error, {
      area: "react",
      action: info.componentStack ? "render" : "unknown",
    });
  }

  private reload = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <main
        role="alert"
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          padding: 24,
          background: "#010837",
          color: "#ffffff",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <section style={{ maxWidth: 480, textAlign: "center" }}>
          <h1 style={{ fontSize: 22, margin: 0 }}>画面を表示できませんでした</h1>
          <p style={{ lineHeight: 1.7, opacity: 0.85 }}>
            動画ファイルは外部へ送信されていません。ページを再読み込みして、もう一度お試しください。
          </p>
          <button
            type="button"
            onClick={this.reload}
            style={{
              border: 0,
              borderRadius: 10,
              padding: "11px 20px",
              background: "#4da3ff",
              color: "#ffffff",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            再読み込みする
          </button>
        </section>
      </main>
    );
  }
}
