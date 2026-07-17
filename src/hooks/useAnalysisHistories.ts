import { useEffect, useState } from "react";
import { subscribeToAnalysisHistories } from "../firebase/historyService";
import type { AnalysisHistory } from "../types/analysisHistory";

export type HistoriesState =
  | { status: "not-logged-in" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "loaded"; items: AnalysisHistory[] };

/** ログイン中ユーザーのFirestore解析履歴を購読する。uidがnullなら未ログイン扱い。 */
export function useAnalysisHistories(uid: string | null): HistoriesState {
  const [state, setState] = useState<HistoriesState>(
    uid ? { status: "loading" } : { status: "not-logged-in" }
  );
  const [prevUid, setPrevUid] = useState(uid);

  // uid（ログイン状態）が変わったタイミングで、レンダー中に同期的に状態をリセットする。
  // Firestore購読自体（外部システムとの同期）はエフェクトの責務として残す。
  if (uid !== prevUid) {
    setPrevUid(uid);
    setState(uid ? { status: "loading" } : { status: "not-logged-in" });
  }

  useEffect(() => {
    if (!uid) return;

    let isMounted = true;

    const unsubscribe = subscribeToAnalysisHistories(
      uid,
      (items) => {
        if (!isMounted) return;
        setState({ status: "loaded", items });
      },
      (error) => {
        if (!isMounted) return;
        console.error(error);
        setState({
          status: "error",
          message: "履歴の取得に失敗しました。通信状況を確認して再度お試しください。",
        });
      }
    );

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [uid]);

  return state;
}
