import { useCallback, useEffect, useRef, useState } from "react";

export const REMOVE_VIDEO_EVENT = "jump-analyzer:remove-video";

/**
 * アップロード動画の ObjectURL・ファイル名・現在時刻を管理するフック。
 * 差し替え時・削除時・アンマウント時に URL を revoke する。
 */
export function useVideoSource() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoName, setVideoName] = useState("");
  const [currentTime, setCurrentTime] = useState(0);

  const clearFile = useCallback(() => {
    const video = videoRef.current;
    if (video) {
      video.pause();
      video.removeAttribute("src");
      video.load();
    }

    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }

    setVideoUrl(null);
    setVideoName("");
    setCurrentTime(0);
  }, []);

  useEffect(() => {
    window.addEventListener(REMOVE_VIDEO_EVENT, clearFile);

    return () => {
      window.removeEventListener(REMOVE_VIDEO_EVENT, clearFile);
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
    };
  }, [clearFile]);

  const loadFile = (file: File) => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
    }

    const nextUrl = URL.createObjectURL(file);
    objectUrlRef.current = nextUrl;

    setVideoUrl(nextUrl);
    setVideoName(file.name);
    setCurrentTime(0);
  };

  return {
    videoRef,
    videoUrl,
    videoName,
    currentTime,
    setCurrentTime,
    loadFile,
    clearFile,
  };
}
