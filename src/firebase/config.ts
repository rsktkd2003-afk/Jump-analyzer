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

function hasRequiredConfig(): boolean {
  return Boolean(
    firebaseConfig.apiKey &&
      firebaseConfig.authDomain &&
      firebaseConfig.projectId &&
      firebaseConfig.appId
  );
}

let authInstance: Auth | null = null;
let dbInstance: Firestore | null = null;

if (hasRequiredConfig()) {
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
  console.warn(
    "[firebase] 環境変数（VITE_FIREBASE_*）が未設定のため、ログイン・履歴保存機能は無効化されています。動画解析自体は引き続き利用できます。"
  );
}

/** Firebaseが利用可能な設定になっているか（未設定/初期化失敗ならfalse） */
export function isFirebaseConfigured(): boolean {
  return authInstance !== null && dbInstance !== null;
}

export const auth = authInstance;
export const db = dbInstance;
