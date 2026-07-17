// =============================================================
// Firebase Authentication（Googleログイン）のラッパー。
// UIコンポーネントへFirebase SDKを直接触らせないための薄い層。
// =============================================================
import { FirebaseError } from "firebase/app";
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

/**
 * signInWithPopupの失敗理由を、ユーザー向けの分かりやすい日本語に変換する。
 * 元のFirebaseエラーコード・メッセージは常にconsole.errorへ出力し、
 * 開発者が原因を追えるようにする。
 */
export function describeSignInError(error: unknown): string {
  if (error instanceof AuthNotConfiguredError) {
    return error.message;
  }

  if (error instanceof FirebaseError) {
    console.error(`[auth] ${error.code}: ${error.message}`);

    switch (error.code) {
      case "auth/popup-blocked":
        return "ブラウザにポップアップがブロックされました。ポップアップを許可してから、もう一度お試しください。";
      case "auth/popup-closed-by-user":
        return "ログイン画面が閉じられたため、ログインがキャンセルされました。";
      case "auth/unauthorized-domain":
        return "このサイトのドメインがFirebaseで承認されていないため、ログインできません。管理者にお問い合わせください。";
      case "auth/operation-not-allowed":
        return "Googleログインが有効化されていません。管理者にお問い合わせください。";
      case "auth/network-request-failed":
        return "通信状況を確認できませんでした。電波の良い場所でもう一度お試しください。";
      default:
        return "Googleログインに失敗しました。時間をおいて再度お試しください。";
    }
  }

  console.error("[auth] ログイン中に予期しないエラーが発生しました。", error);
  return "Googleログインに失敗しました。時間をおいて再度お試しください。";
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
