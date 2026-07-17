// =============================================================
// Firebase Authentication（Googleログイン）のラッパー。
// UIコンポーネントへFirebase SDKを直接触らせないための薄い層。
// =============================================================
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from "firebase/auth";
import { auth } from "./config";

export type AuthUser = Pick<User, "uid" | "displayName" | "photoURL">;

const googleProvider = new GoogleAuthProvider();

export class AuthNotConfiguredError extends Error {
  constructor() {
    super("Firebaseが設定されていないため、ログインできません。");
    this.name = "AuthNotConfiguredError";
  }
}

/** Googleアカウントでログインする（ポップアップ方式。ページ遷移を伴わないため、直前の解析結果が失われない）。 */
export async function signInWithGoogle(): Promise<AuthUser> {
  if (!auth) throw new AuthNotConfiguredError();
  const result = await signInWithPopup(auth, googleProvider);
  return result.user;
}

export async function signOutUser(): Promise<void> {
  if (!auth) return;
  await signOut(auth);
}

/** ログイン状態の変化を購読する。呼び出し側は返り値の解除関数を必ず呼ぶこと。 */
export function subscribeToAuthState(
  callback: (user: AuthUser | null) => void
): () => void {
  if (!auth) {
    callback(null);
    return () => {};
  }
  return onAuthStateChanged(auth, (user) => {
    callback(user);
  });
}
