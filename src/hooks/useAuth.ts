import { useEffect, useRef, useState } from "react";
import { isFirebaseConfigured } from "../firebase/config";
import {
  describeSignInError,
  signInWithGoogle,
  signOutUser,
  subscribeToAuthState,
  type AuthUser,
} from "../firebase/authService";

export type AuthState = {
  user: AuthUser | null;
  /** 初回のログイン状態確認が完了したか（リロード直後のちらつき防止用） */
  isAuthReady: boolean;
  isSigningIn: boolean;
  signInError: string | null;
  isFirebaseReady: boolean;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
};

export function useAuth(): AuthState {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [signInError, setSignInError] = useState<string | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    const unsubscribe = subscribeToAuthState((nextUser) => {
      if (!isMountedRef.current) return;
      setUser(nextUser);
      setIsAuthReady(true);
    });

    return () => {
      isMountedRef.current = false;
      unsubscribe();
    };
  }, []);

  const signIn = async () => {
    setIsSigningIn(true);
    setSignInError(null);
    try {
      await signInWithGoogle();
    } catch (error) {
      if (!isMountedRef.current) return;
      setSignInError(describeSignInError(error));
    } finally {
      if (isMountedRef.current) setIsSigningIn(false);
    }
  };

  const signOut = async () => {
    try {
      await signOutUser();
    } catch (error) {
      console.error(error);
    }
  };

  return {
    user,
    isAuthReady,
    isSigningIn,
    signInError,
    isFirebaseReady: isFirebaseConfigured(),
    signIn,
    signOut,
  };
}
