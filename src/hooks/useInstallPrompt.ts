import { useCallback, useEffect, useState } from "react";

// beforeinstallprompt/appinstalled はDOM標準の型定義に含まれないため、
// 必要な範囲だけ独自にインターフェースを定義する（anyは使わない）。
interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
  prompt(): Promise<void>;
}

interface NavigatorWithStandalone extends Navigator {
  standalone?: boolean;
}

function isStandaloneDisplayMode(): boolean {
  if (
    typeof window !== "undefined" &&
    window.matchMedia?.("(display-mode: standalone)").matches
  ) {
    return true;
  }

  if (typeof window === "undefined") return false;

  const nav = window.navigator as NavigatorWithStandalone;
  return nav.standalone === true;
}

function isIosDevice(): boolean {
  if (typeof window === "undefined") return false;

  const ua = window.navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua)) return true;

  // iPadOS 13+ は "MacIntel" と報告されるため、タッチ対応で判別する
  return (
    window.navigator.platform === "MacIntel" &&
    window.navigator.maxTouchPoints > 1
  );
}

export interface InstallPromptState {
  canInstall: boolean;
  isInstalled: boolean;
  isIos: boolean;
  promptInstall: () => Promise<void>;
}

export function useInstallPrompt(): InstallPromptState {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState<boolean>(
    isStandaloneDisplayMode
  );
  const [isIos] = useState<boolean>(isIosDevice);

  useEffect(() => {
    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setDeferredPrompt(null);
      setIsInstalled(true);
    };

    window.addEventListener(
      "beforeinstallprompt",
      handleBeforeInstallPrompt
    );
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener(
        "beforeinstallprompt",
        handleBeforeInstallPrompt
      );
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  const promptInstall = useCallback(async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
  }, [deferredPrompt]);

  return {
    canInstall: deferredPrompt !== null,
    isInstalled,
    isIos,
    promptInstall,
  };
}
