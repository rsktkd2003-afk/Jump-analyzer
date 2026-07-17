// =============================================================
// Firebaseアプリの初期化。
// 環境変数（VITE_FIREBASE_*）が未設定の場合でもアプリ全体が
// 真っ白にならないよう、authとdbはnullのまま返す（機能側で
// isFirebaseConfigured() を見てログイン・保存導線を無効化する）。
// =============================================================
import { initializeApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

/** 必須環境変数のうち未設定のものの変数名一覧（すべて揃っていれば空配列） */
function getMissingRequiredEnvVars(): string[] {
  const required: Array<[string, string | undefined]> = [
    ["VITE_FIREBASE_API_KEY", firebaseConfig.apiKey],
    ["VITE_FIREBASE_AUTH_DOMAIN", firebaseConfig.authDomain],
    ["VITE_FIREBASE_PROJECT_ID", firebaseConfig.projectId],
    ["VITE_FIREBASE_APP_ID", firebaseConfig.appId],
  ];
  return required.filter(([, value]) => !value).map(([name]) => name);
}

let authInstance: Auth | null = null;
let dbInstance: Firestore | null = null;

const missingEnvVars = getMissingRequiredEnvVars();

if (missingEnvVars.length === 0) {
  try {
    const app = initializeApp(firebaseConfig);
    authInstance = getAuth(app);
    dbInstance = getFirestore(app);
  } catch (error) {
    console.error("[firebase] 初期化に失敗しました。", error);
    authInstance = null;
    dbInstance = null;
  }
} else {
  // ビルド時にVITE_FIREBASE_*が埋め込まれなかった場合にここに来る。
  // 開発者がすぐ原因を特定できるよう、不足している変数名を具体的に列挙する
  // （エンドユーザー向けUIには「準備中です」とだけ表示し、この詳細は出さない）。
  console.warn(
    `[firebase] 次の環境変数が未設定のため、ログイン・履歴保存機能は無効化されています（動画解析自体は引き続き利用できます）: ${missingEnvVars.join(", ")}`
  );
}

/** Firebaseが利用可能な設定になっているか（未設定/初期化失敗ならfalse） */
export function isFirebaseConfigured(): boolean {
  return authInstance !== null && dbInstance !== null;
}

export const auth = authInstance;
export const db = dbInstance;
