import { useEffect, useRef } from "react";
import type { TrackedFrame } from "../ai/poseAnalyzer";

type Props = {
  frames: TrackedFrame[];
};

export default function MotionGraph({ frames }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stats = calculateMotionStats(frames);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.width = 720;
    canvas.height = 620;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#f3f3f3";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (frames.length < 2) {
      ctx.fillStyle = "#333";
      ctx.font = "16px system-ui";
      ctx.fillText("トラッキング後にグラフを表示します", 20, 40);
      return;
    }

    drawTrajectory(ctx, frames, canvas.width, 150);

    drawLine(
      ctx,
      frames.map((f) => f.centerX),
      canvas.width,
      70,
      190,
      "左右移動 centerX"
    );

    drawLine(
      ctx,
      frames.map((f) => f.centerY),
      canvas.width,
      70,
      280,
      "上下移動 centerY"
    );

    drawAngleLine(
      ctx,
      frames.map((f) => averageNullable(f.leftKneeAngle, f.rightKneeAngle)),
      canvas.width,
      70,
      370,
      "膝角度の推移"
    );

    drawAngleLine(
      ctx,
      frames.map((f) => averageNullable(f.leftHipAngle, f.rightHipAngle)),
      canvas.width,
      70,
      460,
      "股関節角度の推移"
    );

    drawAngleLine(
      ctx,
      frames.map((f) => averageNullable(f.leftElbowAngle, f.rightElbowAngle)),
      canvas.width,
      70,
      550,
      "肘角度の推移"
    );
  }, [frames]);

  return (
    <div style={{ marginTop: 12 }}>
      <canvas
        ref={canvasRef}
        style={{
          width: "100%",
          borderRadius: 12,
          background: "#f3f3f3",
        }}
      />

      {stats && (
        <div style={cardStyle}>
          <h3 style={{ marginTop: 0 }}>動作特徴</h3>

          <div>左右ブレ：{stats.horizontalMove.toFixed(1)} px</div>
          <div>上下移動：{stats.verticalMove.toFixed(1)} px</div>
          <div>開始 → 終了の横ズレ：{stats.horizontalDrift.toFixed(1)} px</div>
          <div>膝角度の変化量：{stats.kneeRange.toFixed(1)}°</div>
          <div>股関節角度の変化量：{stats.hipRange.toFixed(1)}°</div>
          <div>肘角度の変化量：{stats.elbowRange.toFixed(1)}°</div>

          <p style={commentStyle}>{stats.comment}</p>
        </div>
      )}
    </div>
  );
}

function drawTrajectory(
  ctx: CanvasRenderingContext2D,
  frames: TrackedFrame[],
  width: number,
  height: number
) {
  const xs = frames.map((frame) => frame.centerX);
  const ys = frames.map((frame) => frame.centerY);

  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  const rangeX = maxX - minX || 1;
  const rangeY = maxY - minY || 1;

  const graphX = 32;
  const graphY = 32;
  const graphWidth = width - 64;
  const graphHeight = height - 44;

  ctx.fillStyle = "#333";
  ctx.font = "14px system-ui";
  ctx.fillText("重心軌跡", 16, 22);

  ctx.strokeStyle = "#ccc";
  ctx.lineWidth = 1;
  ctx.strokeRect(graphX, graphY, graphWidth, graphHeight);

  ctx.beginPath();
  ctx.lineWidth = 3;
  ctx.strokeStyle = "#111";

  frames.forEach((frame, index) => {
    const x = graphX + ((frame.centerX - minX) / rangeX) * graphWidth;
    const y = graphY + ((frame.centerY - minY) / rangeY) * graphHeight;

    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });

  ctx.stroke();
}

function drawLine(
  ctx: CanvasRenderingContext2D,
  values: number[],
  width: number,
  graphHeight: number,
  offsetY: number,
  label: string
) {
  drawNullableLine(ctx, values, width, graphHeight, offsetY, label, "");
}

function drawAngleLine(
  ctx: CanvasRenderingContext2D,
  values: Array<number | null>,
  width: number,
  graphHeight: number,
  offsetY: number,
  label: string
) {
  drawNullableLine(ctx, values, width, graphHeight, offsetY, label, "°");
}

function drawNullableLine(
  ctx: CanvasRenderingContext2D,
  values: Array<number | null>,
  width: number,
  graphHeight: number,
  offsetY: number,
  label: string,
  suffix: string
) {
  const validValues = values.filter((v): v is number => v !== null);

  ctx.fillStyle = "#333";
  ctx.font = "13px system-ui";
  ctx.fillText(label, 16, offsetY - 8);

  const graphX = 32;
  const graphWidth = width - 64;

  ctx.strokeStyle = "#ccc";
  ctx.lineWidth = 1;
  ctx.strokeRect(graphX, offsetY, graphWidth, graphHeight);

  if (validValues.length < 2) {
    ctx.fillStyle = "#777";
    ctx.fillText("データ不足", graphX + 8, offsetY + 28);
    return;
  }

  const min = Math.min(...validValues);
  const max = Math.max(...validValues);
  const range = max - min || 1;

  ctx.fillStyle = "#666";
  ctx.font = "11px system-ui";
  ctx.fillText(`${max.toFixed(1)}${suffix}`, graphX + 4, offsetY + 12);
  ctx.fillText(
    `${min.toFixed(1)}${suffix}`,
    graphX + 4,
    offsetY + graphHeight - 4
  );

  ctx.beginPath();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "#111";

  let hasStarted = false;

  values.forEach((value, index) => {
    if (value === null) return;

    const x = graphX + (index / (values.length - 1)) * graphWidth;
    const y = offsetY + graphHeight - ((value - min) / range) * graphHeight;

    if (!hasStarted) {
      ctx.moveTo(x, y);
      hasStarted = true;
    } else {
      ctx.lineTo(x, y);
    }
  });

  ctx.stroke();
}

function calculateMotionStats(frames: TrackedFrame[]) {
  if (frames.length < 2) return null;

  const xs = frames.map((frame) => frame.centerX);
  const ys = frames.map((frame) => frame.centerY);

  const kneeValues = frames.map((f) =>
    averageNullable(f.leftKneeAngle, f.rightKneeAngle)
  );

  const hipValues = frames.map((f) =>
    averageNullable(f.leftHipAngle, f.rightHipAngle)
  );

  const elbowValues = frames.map((f) =>
    averageNullable(f.leftElbowAngle, f.rightElbowAngle)
  );

  const horizontalMove = Math.max(...xs) - Math.min(...xs);
  const verticalMove = Math.max(...ys) - Math.min(...ys);
  const horizontalDrift = frames[frames.length - 1].centerX - frames[0].centerX;

  const kneeRange = calculateRange(kneeValues);
  const hipRange = calculateRange(hipValues);
  const elbowRange = calculateRange(elbowValues);

  const comments: string[] = [];

  if (Math.abs(horizontalDrift) > 80) {
    comments.push("開始位置と終了位置の横方向の差が大きめです。");
  }

  if (horizontalMove > 120) {
    comments.push("左右方向への移動量が大きめです。");
  }

  if (kneeRange > 45) {
    comments.push("膝角度の変化量が大きめです。");
  }

  if (hipRange > 35) {
    comments.push("股関節角度の変化量が大きめです。");
  }

  if (elbowRange > 50) {
    comments.push("腕の角度変化が大きめです。");
  }

  if (comments.length === 0) {
    comments.push("今回の動作は大きな変化量が少なめです。");
  }

  return {
    horizontalMove,
    verticalMove,
    horizontalDrift,
    kneeRange,
    hipRange,
    elbowRange,
    comment: comments.join(" "),
  };
}

function averageNullable(a: number | null, b: number | null) {
  if (a === null && b === null) return null;
  if (a === null) return b;
  if (b === null) return a;
  return (a + b) / 2;
}

function calculateRange(values: Array<number | null>) {
  const validValues = values.filter((v): v is number => v !== null);
  if (validValues.length < 2) return 0;

  return Math.max(...validValues) - Math.min(...validValues);
}

const cardStyle: React.CSSProperties = {
  marginTop: 12,
  padding: 12,
  borderRadius: 12,
  background: "#f7f7f7",
  border: "1px solid #ddd",
  fontSize: 14,
  lineHeight: 1.7,
};

const commentStyle: React.CSSProperties = {
  marginBottom: 0,
  lineHeight: 1.6,
};