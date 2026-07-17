import { useEffect, useRef, useState } from "react";

/**
 * アップロード動画の ObjectURL・ファイル名・現在時刻を管理するフック。
 * 差し替え時とアンマウント時に URL を revoke する。
 *
 * objectUrlRef で「今有効なURL」を明示的に追跡し、新しいURLを作る前に
 * loadFile内で確実に前のURLを解放する（二重解放や古いURL参照を避けるため、
 * effectの依存配列クリーンアップの暗黙的な挙動には頼らない）。
 */
export function useVideoSource() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoName, setVideoName] = useState("");
  const [currentTime, setCurrentTime] = useState(0);

  // アンマウント時に、その時点で有効なObjectURLを解放する
  useEffect(() => {
    return () => {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
    };
  }, []);

  const loadFile = (file: File) => {
    // 新しいURLを作る前に、以前のURLを解放する
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
  };
}
