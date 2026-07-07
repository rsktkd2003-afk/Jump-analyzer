import { useEffect, useRef, useState } from "react";

/**
 * アップロード動画の ObjectURL・ファイル名・現在時刻を管理するフック。
 * 差し替え時とアンマウント時に URL を revoke する。
 */
export function useVideoSource() {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoName, setVideoName] = useState("");
  const [currentTime, setCurrentTime] = useState(0);

  // アンマウント時に ObjectURL を解放
  useEffect(() => {
    return () => {
      if (videoUrl) URL.revokeObjectURL(videoUrl);
    };
  }, [videoUrl]);

  const loadFile = (file: File) => {
    setVideoUrl(URL.createObjectURL(file));
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
