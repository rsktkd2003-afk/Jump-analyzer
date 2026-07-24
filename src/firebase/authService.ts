// =============================================================
// Firebase Authenticationのラッパー。
// UIコンポーネントへFirebase SDKを直接触らせないための薄い層。
// =============================================================
import { FirebaseError } from "firebase/app";
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  type User,
} from "firebase/auth";
import { auth } from "./config";

export type AuthUser = Pick<User, "uid" | "displayName" | "photoURL" | "email">;

const googleProvider = new GoogleAuthProvider();

googleProvider.setCustomParameters({
  prompt: "select_account",
});

function toAuthUser(user: User): AuthUser {
  return {
    uid: user.uid,
    displayName: user.displayName ?? user.email?.split("@")[0] ?? "ユーザー",
    photoURL: user.photoURL,
    email: user.email,
  };
}

export class AuthNotConfiguredError extends Error {
  constructor() {
    super("Firebaseが設定されていないため、ログインできません。");
    this.name = "AuthNotConfiguredError";
  }
}

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
        return "このサイトのドメインがFirebaseで承認されていないため、ログインできません。";
      case "auth/operation-not-allowed":
        return "このログイン方法がFirebase Authenticationで有効化されていません。";
      case "auth/network-request-failed":
        return "通信状況を確認できませんでした。電波の良い場所でもう一度お試しください。";
      case "auth/invalid-email":
        return "メールアドレスの形式が正しくありません。";
      case "auth/user-disabled":
        return "このアカウントは無効化されています。";
      case "auth/user-not-found":
      case "auth/wrong-password":
      case "auth/invalid-credential":
        return "メールアドレスまたはパスワードが正しくありません。";
      case "auth/email-already-in-use":
        return "このメールアドレスはすでに登録されています。";
      case "auth/weak-password":
        return "パスワードは6文字以上で入力してください。";
      case "auth/too-many-requests":
        return "試行回数が多すぎます。時間をおいてから再度お試しください。";
      default:
        return "認証処理に失敗しました。時間をおいて再度お試しください。";
    }
  }

  console.error("[auth] 認証中に予期しないエラーが発生しました。", error);
  return "認証処理に失敗しました。時間をおいて再度お試しください。";
}

export async function signInWithGoogle(): Promise<AuthUser> {
  if (!auth) throw new AuthNotConfiguredError();
  const result = await signInWithPopup(auth, googleProvider);
  return toAuthUser(result.user);
}

export async function signInWithEmail(email: string, password: string): Promise<AuthUser> {
  if (!auth) throw new AuthNotConfiguredError();
  const result = await signInWithEmailAndPassword(auth, email.trim(), password);
  return toAuthUser(result.user);
}

export async function createUserWithEmail(params: {
  displayName: string;
  email: string;
  password: string;
}): Promise<AuthUser> {
  if (!auth) throw new AuthNotConfiguredError();

  const displayName = params.displayName.trim();
  if (!displayName) {
    throw new Error("表示名を入力してください。");
  }

  const result = await createUserWithEmailAndPassword(
    auth,
    params.email.trim(),
    params.password
  );

  await updateProfile(result.user, { displayName });
  return toAuthUser(result.user);
}

export async function signOutUser(): Promise<void> {
  if (!auth) return;
  await signOut(auth);
}

export function subscribeToAuthState(
  callback: (user: AuthUser | null) => void
): () => void {
  if (!auth) {
    callback(null);
    return () => {};
  }
  return onAuthStateChanged(auth, (user) => {
    callback(user ? toAuthUser(user) : null);
  });
}
