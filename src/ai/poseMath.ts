export function calculateAngle(
  a: { x: number; y: number },
  b: { x: number; y: number },
  c: { x: number; y: number }
): number {
  const ab = { x: a.x - b.x, y: a.y - b.y };
  const cb = { x: c.x - b.x, y: c.y - b.y };

  const dot = ab.x * cb.x + ab.y * cb.y;
  const abLength = Math.sqrt(ab.x * ab.x + ab.y * ab.y);
  const cbLength = Math.sqrt(cb.x * cb.x + cb.y * cb.y);

  if (abLength === 0 || cbLength === 0) {
    return 0;
  }

  const cos = dot / (abLength * cbLength);
  const safeCos = Math.max(-1, Math.min(1, cos));

  return (Math.acos(safeCos) * 180) / Math.PI;
}

export function waitSeeked(video: HTMLVideoElement) {
  return new Promise<void>((resolve) => {
    const handler = () => {
      video.removeEventListener("seeked", handler);
      resolve();
    };

    video.addEventListener("seeked", handler);
  });
}