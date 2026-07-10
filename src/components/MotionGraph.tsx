import { useEffect, useMemo, useRef } from "react";
import type { TrackedFrame } from "../ai/poseAnalyzer";
import { runJumpPhaseEngine } from "../ai/jumpPhaseEngine";
import { smoothSeriesWithOneEuro } from "../utils/oneEuroFilter";

type Props = {
  frames: TrackedFrame[];
};

// 角度グラフは常に0〜180°固定（動画間・試行間で比較可能にする）
const ANGLE_AXIS_MIN = 0;
const ANGLE_AXIS_MAX = 180;

const CANVAS_WIDTH = 720;
const TRAJECTORY_HEIGHT = 240;
const LINE_CHART_HEIGHT = 80;
const CHART_GAP = 34;
const CHART_LEFT = 48;
const CHART_RIGHT = 16;

export default function MotionGraph({ frames }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const engine = useMemo(
    () => (frames.length >= 8 ? runJumpPhaseEngine(frames) : null),
    [frames]
  );

  // 関節角度はMediaPipeの検出ノイズで振動するため、
  // 速度適応型のOne Euroフィルタで表示・統計の両方を平滑化する。
  // （停止時のみ強く平滑化し、速い動作では遅延を増やさない）
  const smoothed = useMemo(() => {
    const times = frames.map((f) => f.time);
    const options = { minCutoff: 1.2, beta: 0.03 };

    return {
      knee: smoothSeriesWithOneEuro(
        frames.map((f) => averageNullable(f.leftKneeAngle, f.rightKneeAngle)),
        times,
        options
      ),
      hip: smoothSeriesWithOneEuro(
        frames.map((f) => averageNullable(f.leftHipAngle, f.rightHipAngle)),
        times,
        options
      ),
      elbow: smoothSeriesWithOneEuro(
        frames.map((f) => averageNullable(f.leftElbowAngle, f.rightElbowAngle)),
        times,
        options
      ),
    };
  }, [frames]);

  const stats = useMemo(
    () => calculateMotionStats(frames, smoothed),
    [frames, smoothed]
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const chartCount = 4; // 重心Y正規化 + 膝 + 股関節 + 肘
    const totalHeight =
      40 +
      TRAJECTORY_HEIGHT +
      20 +
      (LINE_CHART_HEIGHT + CHART_GAP) * chartCount +
      10;

    canvas.width = CANVAS_WIDTH;
    canvas.height = totalHeight;

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

    drawTrajectory(ctx, frames, engine, 30);

    let top = 40 + TRAJECTORY_HEIGHT + 20;

    // 重心の高さ：体幹長で正規化して比較可能に
    const torsoPx = engine?.events.torsoPx ?? null;
    const baseline = engine?.events.baselineComY ?? null;
    const comValues = frames.map((f, i) => {
      const y = engine ? engine.events.comY[i] : f.centerY;
      if (torsoPx && baseline !== null) {
        return ((baseline - y) / torsoPx) * 100; // 体幹長比%（+が上）
      }
      return -y;
    });
    drawLineChart(ctx, {
      values: comValues,
      top,
      label: torsoPx
        ? "重心の高さ（体幹長比%、+が上）"
        : "重心の高さ（相対値）",
      color: "#1f7a8c",
      fixedRange: null,
      engine,
      frames,
    });
    top += LINE_CHART_HEIGHT + CHART_GAP;

    drawLineChart(ctx, {
      values: smoothed.knee,
      top,
      label: "膝角度の推移（0〜180°固定）",
      color: "#d1495b",
      fixedRange: [ANGLE_AXIS_MIN, ANGLE_AXIS_MAX],
      engine,
      frames,
    });
    top += LINE_CHART_HEIGHT + CHART_GAP;

    drawLineChart(ctx, {
      values: smoothed.hip,
      top,
      label: "股関節角度の推移（0〜180°固定）",
      color: "#6b4e9b",
      fixedRange: [ANGLE_AXIS_MIN, ANGLE_AXIS_MAX],
      engine,
      frames,
    });
    top += LINE_CHART_HEIGHT + CHART_GAP;

    drawLineChart(ctx, {
      values: smoothed.elbow,
      top,
      label: "肘角度の推移（0〜180°固定・平滑化済み）",
      color: "#e09f3e",
      fixedRange: [ANGLE_AXIS_MIN, ANGLE_AXIS_MAX],
      engine,
      frames,
    });
  }, [frames, engine, smoothed]);

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

type EngineResult = ReturnType<typeof runJumpPhaseEngine>;

/**
 * 重心軌跡：時系列順の1本のラインとして描画する。
 * - 進行に応じて色相を変える（青=開始 → 赤=終了）ため、
 *   往復しても「どの時点の線か」が読み取れる。
 * - 縦横は同一スケール（等アスペクト）で描画し、形状を歪めない。
 * - 離地・最高点・着地の位置にマーカーを打つ。
 */
function drawTrajectory(
  ctx: CanvasRenderingContext2D,
  frames: TrackedFrame[],
  engine: EngineResult,
  top: number
) {
  const xs = engine ? engine.events.comX : frames.map((f) => f.centerX);
  const ys = engine ? engine.events.comY : frames.map((f) => f.centerY);

  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  const areaX = CHART_LEFT;
  const areaY = top + 10;
  const areaWidth = CANVAS_WIDTH - CHART_LEFT - CHART_RIGHT;
  const areaHeight = TRAJECTORY_HEIGHT - 40;

  ctx.fillStyle = "#333";
  ctx.font = "bold 14px system-ui";
  ctx.fillText("重心軌跡（時系列1本ライン：青=開始 → 赤=終了）", 16, top);

  ctx.strokeStyle = "#ccc";
  ctx.lineWidth = 1;
  ctx.strokeRect(areaX, areaY, areaWidth, areaHeight);

  // 等アスペクト：px→canvasの倍率を縦横共通にする
  const rangeX = maxX - minX || 1;
  const rangeY = maxY - minY || 1;
  const scale = Math.min(areaWidth / rangeX, areaHeight / rangeY);
  const offsetX = areaX + (areaWidth - rangeX * scale) / 2;
  const offsetY = areaY + (areaHeight - rangeY * scale) / 2;

  const toCanvasX = (x: number) => offsetX + (x - minX) * scale;
  const toCanvasY = (y: number) => offsetY + (y - minY) * scale;

  // 時間グラデーションの1本ライン（セグメントごとに色相を変える）
  ctx.lineWidth = 2.5;
  ctx.lineCap = "round";

  for (let i = 1; i < frames.length; i += 1) {
    const t = i / (frames.length - 1);
    const hue = 220 - 220 * t; // 220(青) → 0(赤)
    ctx.strokeStyle = `hsl(${hue}, 75%, 45%)`;
    ctx.beginPath();
    ctx.moveTo(toCanvasX(xs[i - 1]), toCanvasY(ys[i - 1]));
    ctx.lineTo(toCanvasX(xs[i]), toCanvasY(ys[i]));
    ctx.stroke();
  }

  // フェーズマーカー
  if (engine) {
    const { events } = engine;
    const markers: Array<{ index: number; label: string; color: string }> = [
      { index: events.takeoffIndex, label: "離地", color: "#d1495b" },
      { index: events.peakIndex, label: "最高点", color: "#1f7a8c" },
      { index: events.landingIndex, label: "着地", color: "#6b4e9b" },
    ];

    ctx.font = "12px system-ui";
    for (const marker of markers) {
      const x = toCanvasX(xs[marker.index]);
      const y = toCanvasY(ys[marker.index]);

      ctx.fillStyle = marker.color;
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 1.5;
      ctx.stroke();

      const labelX = Math.min(x + 8, areaX + areaWidth - 48);
      ctx.fillText(marker.label, labelX, Math.max(y - 8, areaY + 12));
    }
  }

  ctx.fillStyle = "#666";
  ctx.font = "11px system-ui";
  ctx.fillText(
    "縦横同スケール表示",
    areaX + 4,
    areaY + areaHeight + 14
  );
}

type LineChartOptions = {
  values: Array<number | null>;
  top: number;
  label: string;
  color: string;
  /** [min, max] を指定するとY軸を固定（角度グラフ用） */
  fixedRange: [number, number] | null;
  engine: EngineResult;
  frames: TrackedFrame[];
};

function drawLineChart(
  ctx: CanvasRenderingContext2D,
  options: LineChartOptions
) {
  const { values, top, label, color, fixedRange, engine, frames } = options;

  const graphX = CHART_LEFT;
  const graphWidth = CANVAS_WIDTH - CHART_LEFT - CHART_RIGHT;

  ctx.fillStyle = "#333";
  ctx.font = "13px system-ui";
  ctx.fillText(label, 16, top - 8);

  ctx.strokeStyle = "#ccc";
  ctx.lineWidth = 1;
  ctx.strokeRect(graphX, top, graphWidth, LINE_CHART_HEIGHT);

  const validValues = values.filter((v): v is number => v !== null);
  if (validValues.length < 2) {
    ctx.fillStyle = "#777";
    ctx.fillText("データ不足", graphX + 8, top + 28);
    return;
  }

  const min = fixedRange ? fixedRange[0] : Math.min(...validValues);
  const max = fixedRange ? fixedRange[1] : Math.max(...validValues);
  const range = max - min || 1;

  const valueToY = (value: number) =>
    top + LINE_CHART_HEIGHT - ((value - min) / range) * LINE_CHART_HEIGHT;

  // 軸ラベル
  ctx.fillStyle = "#666";
  ctx.font = "11px system-ui";
  ctx.textAlign = "right";
  ctx.fillText(`${max.toFixed(0)}`, graphX - 4, top + 10);
  ctx.fillText(`${min.toFixed(0)}`, graphX - 4, top + LINE_CHART_HEIGHT - 2);
  ctx.textAlign = "left";

  // フェーズ境界の縦線（離地・最高点・着地）
  if (engine) {
    const { events } = engine;
    ctx.strokeStyle = "#aaa";
    ctx.setLineDash([3, 4]);
    for (const index of [
      events.takeoffIndex,
      events.peakIndex,
      events.landingIndex,
    ]) {
      const x = graphX + (index / (frames.length - 1)) * graphWidth;
      ctx.beginPath();
      ctx.moveTo(x, top);
      ctx.lineTo(x, top + LINE_CHART_HEIGHT);
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }

  // 折れ線
  ctx.beginPath();
  ctx.lineWidth = 2;
  ctx.strokeStyle = color;

  let hasStarted = false;
  values.forEach((value, index) => {
    if (value === null) return;

    const x = graphX + (index / (values.length - 1)) * graphWidth;
    const y = valueToY(Math.max(min, Math.min(max, value)));

    if (!hasStarted) {
      ctx.moveTo(x, y);
      hasStarted = true;
    } else {
      ctx.lineTo(x, y);
    }
  });

  ctx.stroke();
}

function calculateMotionStats(
  frames: TrackedFrame[],
  smoothed: {
    knee: Array<number | null>;
    hip: Array<number | null>;
    elbow: Array<number | null>;
  }
) {
  if (frames.length < 2) return null;

  const xs = frames.map((frame) => frame.centerX);
  const ys = frames.map((frame) => frame.centerY);

  const horizontalMove = Math.max(...xs) - Math.min(...xs);
  const verticalMove = Math.max(...ys) - Math.min(...ys);
  const horizontalDrift = frames[frames.length - 1].centerX - frames[0].centerX;

  const kneeRange = calculateRange(smoothed.knee);
  const hipRange = calculateRange(smoothed.hip);
  const elbowRange = calculateRange(smoothed.elbow);

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
