const MIN_VALID_VIDEO_DURATION_SEC = 0.1;
const SEEK_TIMEOUT_MS = 3000;

export function hasValidDuration(video: HTMLVideoElement): boolean {
  return (
    Number.isFinite(video.duration) &&
    video.duration > MIN_VALID_VIDEO_DURATION_SEC
  );
}

export function seekVideo(
  video: HTMLVideoElement,
  time: number
): Promise<void> {
  return new Promise((resolve) => {
    const safeTime = Math.min(Math.max(time, 0), video.duration || 0);

    let settled = false;

    const cleanup = () => {
      video.removeEventListener("seeked", handleSeeked);
      window.clearTimeout(timeoutId);
    };

    const finish = () => {
      if (settled) return;

      settled = true;
      cleanup();
      resolve();
    };

    const handleSeeked = () => {
      finish();
    };

    const timeoutId = window.setTimeout(() => {
      finish();
    }, SEEK_TIMEOUT_MS);

    video.addEventListener("seeked", handleSeeked, { once: true });

    if (Math.abs(video.currentTime - safeTime) < 0.001) {
      finish();
      return;
    }

    video.currentTime = safeTime;
  });
}