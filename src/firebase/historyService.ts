// =============================================================
// Firestore上の解析履歴（users/{uid}/analysisHistories/{analysisId}）
// へのアクセスを一箇所にまとめる層。UIコンポーネントはこの関数群だけを呼び、
// Firestore SDKを直接触らない。
// =============================================================
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  type CollectionReference,
  type DocumentData,
} from "firebase/firestore";
import { db } from "./config";
import type { AnalysisHistory, AnalysisHistoryDraft } from "../types/analysisHistory";

export class FirestoreNotConfiguredError extends Error {
  constructor() {
    super("Firebaseが設定されていないため、履歴を保存できません。");
    this.name = "FirestoreNotConfiguredError";
  }
}

function historiesCollection(uid: string): CollectionReference<DocumentData> {
  if (!db) throw new FirestoreNotConfiguredError();
  return collection(db, "users", uid, "analysisHistories");
}

/**
 * 解析履歴を保存する。ドキュメントIDにanalysisIdをそのまま使うため、
 * 同じanalysisIdで再度呼び出しても重複ドキュメントは作られず上書きされる。
 */
export async function saveAnalysisHistory(
  uid: string,
  draft: AnalysisHistoryDraft
): Promise<void> {
  if (!db) throw new FirestoreNotConfiguredError();

  const ref = doc(db, "users", uid, "analysisHistories", draft.analysisId);

  await setDoc(
    ref,
    {
      ...draft,
      userId: uid,
      analyzedAt: Timestamp.fromDate(draft.analyzedAt),
      savedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

/** 指定analysisIdの履歴が既に保存済みかを確認する。 */
export async function fetchSavedAnalysisId(
  uid: string,
  analysisId: string
): Promise<boolean> {
  if (!db) return false;
  const ref = doc(db, "users", uid, "analysisHistories", analysisId);
  const snapshot = await getDoc(ref);
  return snapshot.exists();
}

/**
 * ログイン中ユーザーの解析履歴を保存日時の新しい順に購読する。
 * 戻り値の解除関数を、呼び出し側のアンマウント時に必ず呼ぶこと。
 */
export function subscribeToAnalysisHistories(
  uid: string,
  onChange: (items: AnalysisHistory[]) => void,
  onError: (error: Error) => void
): () => void {
  if (!db) {
    onChange([]);
    return () => {};
  }

  const q = query(historiesCollection(uid), orderBy("savedAt", "desc"));

  return onSnapshot(
    q,
    (snapshot) => {
      const items = snapshot.docs.map(
        (docSnapshot) =>
          ({ id: docSnapshot.id, ...docSnapshot.data() }) as AnalysisHistory
      );
      onChange(items);
    },
    (error) => onError(error)
  );
}

export async function deleteAnalysisHistory(
  uid: string,
  historyId: string
): Promise<void> {
  if (!db) throw new FirestoreNotConfiguredError();
  const ref = doc(db, "users", uid, "analysisHistories", historyId);
  await deleteDoc(ref);
}

export async function deleteAllAnalysisHistories(
  uid: string,
  historyIds: string[]
): Promise<void> {
  for (const id of historyIds) {
    await deleteAnalysisHistory(uid, id);
  }
}
