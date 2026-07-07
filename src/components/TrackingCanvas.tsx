import { useEffect, useRef } from "react";
import type { TrackedFrame } from "../ai/poseAnalyzer";

type Props = {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  frame: TrackedFrame | null;
  isCropMode: boolean;
  showSkeleton: boolean;
};

export default function TrackingCanvas({
  videoRef,
  frame,
  isCropMode,
  showSkeleton,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    let animationId = 0;

    const draw = () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;

      if (video && canvas && frame) {
        const ctx = canvas.getContext("2d");

        if (ctx) {
          canvas.width = 360;
          canvas.height = 480;

          ctx.clearRect(0, 0, canvas.width, canvas.height);

          if (isCropMode) {
            const crop = frame.crop;

            ctx.drawImage(
              video,
              crop.x,
              crop.y,
              crop.width,
              crop.height,
              0,
              0,
              canvas.width,
              canvas.height
            );

            if (showSkeleton) {
              drawSkeleton(ctx, frame, crop, canvas.width, canvas.height);
            }
          } else {
            const fullCrop = {
              x: 0,
              y: 0,
              width: video.videoWidth,
              height: video.videoHeight,
            };

            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

            if (showSkeleton) {
              drawSkeleton(ctx, frame, fullCrop, canvas.width, canvas.height);
            }
          }
        }
      }

      animationId = requestAnimationFrame(draw);
    };

    draw();

    return () => cancelAnimationFrame(animationId);
  }, [videoRef, frame, isCropMode, showSkeleton]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        width: "100%",
        maxHeight: 520,
        background: "#111",
        borderRadius: 12,
      }}
    />
  );
}

function drawSkeleton(
  ctx: CanvasRenderingContext2D,
  frame: TrackedFrame,
  crop: { x: number; y: number; width: number; height: number },
  canvasWidth: number,
  canvasHeight: number
) {
  const points = frame.landmarks.map((p) => ({
    x: ((p.x - crop.x) / crop.width) * canvasWidth,
    y: ((p.y - crop.y) / crop.height) * canvasHeight,
    visibility: p.visibility,
  }));

  const lines = [
    [11, 12],
    [11, 13],
    [13, 15],
    [12, 14],
    [14, 16],
    [11, 23],
    [12, 24],
    [23, 24],
    [23, 25],
    [25, 27],
    [24, 26],
    [26, 28],
  ];

  ctx.lineWidth = 3;
  ctx.strokeStyle = "lime";
  ctx.fillStyle = "red";

  for (const [a, b] of lines) {
    const p1 = points[a];
    const p2 = points[b];

    if (!p1 || !p2) continue;
    if ((p1.visibility ?? 1) < 0.35 || (p2.visibility ?? 1) < 0.35) continue;

    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();
  }

  for (const point of points) {
    if ((point.visibility ?? 1) < 0.35) continue;

    ctx.beginPath();
    ctx.arc(point.x, point.y, 4, 0, Math.PI * 2);
    ctx.fill();
  }
}