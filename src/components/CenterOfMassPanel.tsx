import { useEffect, useRef } from "react";

import {
  convertForChart,
  type ComAnalysisResult,
  type ComScale,
  type ComSeriesPoint,
  type PhaseMarker,
} from "../ai/comAnalyzer";

type Props = {
  result: ComAnalysisResult;
};

const COLOR_X = "#d1495b";
const COLOR_Y = "#1f7a8c";
const COLOR_MOVE = "#6b4e9b";
const COLOR_MARKER = "#999";
const COLOR_TEXT = "#333";
const COLOR_SUBTEXT = "#666";
const COLOR_GRID = "#ddd";

const CANVAS_WIDTH = 760;
const CHART_LEFT = 70;
const CHART_RIGHT = 16;
const CHART_HEIGHT = 110;
const MARKER_STRIP_HEIGHT = 34;
const CHART_GAP = 40;
const TRAJECTORY_HEIGHT = 200;

export default function CenterOfMassPanel({ result }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const chartsTop = 30 + MARKER_STRIP_HEIGHT;
    const totalHeight =
      chartsTop +
      (CHART_HEIGHT + CHART_GAP) * 3 +
      30 +
      TRAJECTORY_HEIGHT +
      20;

    canvas.width = CANVAS_WIDTH;
    canvas.height = totalHeight;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#fafafa";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const { series, markers, scale } = result;

    if (series.length < 2) {
      ctx.fillStyle = COLOR_TEXT;
      ctx.font = "16px system-ui";
      ctx.fillText("トラッキング後にグラフを表示します", 20, 40);
      return;
    }

    const t0 = series[0].time;
    const t1 = series[series.length - 1].time;
    const timeToX = (time: number) =>
      CHART_LEFT +
      ((time - t0) / Math.max(t1 - t0, 0.001)) *
        (CANVAS_WIDTH - CHART_LEFT - CHART_RIGHT);

    // タイトル
    ctx.fillStyle = COLOR_TEXT;
    ctx.font = "bold 15px system-ui";
    ctx.fillText("重心の動き（時間推移）", 12, 20);

    // フェーズマーカーのラベル帯（上下2段で重なりを回避）
    drawMarkerLabels(ctx, markers, series, timeToX, 30);

    // 各チャートの縦線（フェーズ境界）は各チャート内で描画
    const chartBottom = chartsTop + (CHART_HEIGHT + CHART_GAP) * 3 - CHART_GAP;

    drawTimeChart(ctx, {
      top: chartsTop,
      title: `左右方向の移動（＋が画面右） [${scale.unitLabel}]`,
      color: COLOR_X,
      values: series.map((p) => convertForChart(p.xShift, scale)),
      series,
      timeToX,
      showZeroLine: true,
      markers,
    });

    drawTimeChart(ctx, {
      top: chartsTop + CHART_HEIGHT + CHART_GAP,
      title: `上下方向の移動＝重心の上昇量（＋が上） [${scale.unitLabel}]`,
      color: COLOR_Y,
      values: series.map((p) => convertForChart(p.rise, scale)),
      series,
      timeToX,
      showZeroLine: true,
      markers,
    });

    drawTimeChart(ctx, {
      top: chartsTop + (CHART_HEIGHT + CHART_GAP) * 2,
      title: `合成移動量＝開始位置からの距離 [${scale.unitLabel}]`,
      color: COLOR_MOVE,
      values: series.map((p) => convertForChart(p.moveFromStart, scale)),
      series,
      timeToX,
      showZeroLine: false,
      markers,
    });

    // 時間軸ラベル（最下段チャートの下）
    ctx.fillStyle = COLOR_SUBTEXT;
    ctx.font = "11px system-ui";
    ctx.fillText(`${t0.toFixed(2)}秒`, CHART_LEFT - 8, chartBottom + 16);
    const midTime = (t0 + t1) / 2;
    ctx.fillText(
      `${midTime.toFixed(2)}秒`,
      timeToX(midTime) - 16,
      chartBottom + 16
    );
    ctx.fillText(
      `${t1.toFixed(2)}秒`,
      CANVAS_WIDTH - CHART_RIGHT - 40,
      chartBottom + 16
    );

    // 重心の軌跡（横 × 縦）
    drawTrajectory(ctx, {
      top: chartBottom + 40,
      series,
      markers,
      scale,
    });
  }, [result]);

  return (
    <section style={panelStyle}>
      <h3 style={{ marginTop: 0 }}>重心の移動グラフ</h3>

      <div className="chart-scroll-x" style={{ background: "#fafafa" }}>
        <canvas
          ref={canvasRef}
          className="chart-canvas"
          style={{ background: "#fafafa" }}
        />
      </div>

      <div style={legendStyle}>
        <LegendItem color={COLOR_X} label="左右移動（＋が画面右）" />
        <LegendItem color={COLOR_Y} label="上下移動（＋が上）" />
        <LegendItem color={COLOR_MOVE} label="合成移動量" />
        <LegendItem color={COLOR_MARKER} label="┆ フェーズ境界" line />
      </div>

      <p style={noteStyle}>{result.scale.note}</p>

      <MetricsCard result={result} />

      <div style={commentCardStyle}>
        <h3 style={{ marginTop: 0 }}>改善のヒント</h3>
        <ul style={{ margin: 0, paddingLeft: 20 }}>
          {result.comments.map((comment, index) => (
            <li key={index} style={{ marginBottom: 8, lineHeight: 1.7 }}>
              {comment}
            </li>
          ))}
        </ul>
        <p style={noteStyle}>
          ※「左右」は画面上の向きです。数値はAIの骨格推定に基づく目安として活用してください。
        </p>
      </div>
    </section>
  );
}

function MetricsCard({ result }: { result: ComAnalysisResult }) {
  const { metrics } = result;

  const rows: Array<{ label: string; value: string }> = [
    {
      label: "重心の上昇量（基準姿勢→最高点）",
      value: metrics.riseHeight?.text ?? "-",
    },
    {
      label: "沈み込みの深さ",
      value: metrics.sinkDepth?.text ?? "-",
    },
    {
      label: "沈み込み→踏切の時間",
      value:
        metrics.sinkToTakeoffSec !== null
          ? `${metrics.sinkToTakeoffSec.toFixed(2)}秒`
          : "-",
    },
    {
      label: "滞空時間（踏切→着地）",
      value:
        metrics.airTimeSec !== null
          ? `${metrics.airTimeSec.toFixed(2)}秒`
          : "-",
    },
    {
      label: "横ブレ幅（動作全体）",
      value: metrics.swayWidth.text,
    },
    {
      label: "踏切前の横移動",
      value: metrics.driftBeforeTakeoff?.text ?? "-",
    },
    {
      label: "空中での横移動",
      value: metrics.driftInAir?.text ?? "-",
    },
    {
      label: "着地位置の横ズレ（開始位置比）",
      value: metrics.landingOffset?.text ?? "-",
    },
  ];

  return (
    <div style={metricsCardStyle}>
      <h3 style={{ marginTop: 0 }}>重心移動の指標</h3>
      {rows.map((row) => (
        <div key={row.label} style={metricsRowStyle}>
          <span style={{ color: COLOR_SUBTEXT }}>{row.label}</span>
          <strong>{row.value}</strong>
        </div>
      ))}
    </div>
  );
}

function LegendItem({
  color,
  label,
  line,
}: {
  color: string;
  label: string;
  line?: boolean;
}) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      {!line && (
        <span
          style={{
            width: 12,
            height: 12,
            borderRadius: 3,
            background: color,
            display: "inline-block",
          }}
        />
      )}
      <span style={{ fontSize: 13, color: COLOR_TEXT }}>{label}</span>
    </span>
  );
}

type TimeChartOptions = {
  top: number;
  title: string;
  color: string;
  values: number[];
  series: ComSeriesPoint[];
  timeToX: (time: number) => number;
  showZeroLine: boolean;
  markers: PhaseMarker[];
};

function drawTimeChart(
  ctx: CanvasRenderingContext2D,
  options: TimeChartOptions
) {
  const { top, title, color, values, series, timeToX, showZeroLine, markers } =
    options;

  const chartWidth = CANVAS_WIDTH - CHART_LEFT - CHART_RIGHT;

  // タイトル
  ctx.fillStyle = COLOR_TEXT;
  ctx.font = "13px system-ui";
  ctx.fillText(title, CHART_LEFT, top - 8);

  // 枠
  ctx.strokeStyle = COLOR_GRID;
  ctx.lineWidth = 1;
  ctx.strokeRect(CHART_LEFT, top, chartWidth, CHART_HEIGHT);

  let min = Math.min(...values);
  let max = Math.max(...values);
  if (showZeroLine) {
    min = Math.min(min, 0);
    max = Math.max(max, 0);
  }
  const range = max - min || 1;

  const valueToY = (value: number) =>
    top + CHART_HEIGHT - ((value - min) / range) * CHART_HEIGHT;

  // ゼロ線
  if (showZeroLine) {
    const zeroY = valueToY(0);
    ctx.strokeStyle = "#bbb";
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(CHART_LEFT, zeroY);
    ctx.lineTo(CHART_LEFT + chartWidth, zeroY);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // フェーズ境界の縦線
  ctx.strokeStyle = COLOR_MARKER;
  ctx.setLineDash([3, 4]);
  for (const marker of markers) {
    const x = timeToX(marker.time);
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x, top + CHART_HEIGHT);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  // 軸ラベル（最大・最小）
  ctx.fillStyle = COLOR_SUBTEXT;
  ctx.font = "11px system-ui";
  ctx.textAlign = "right";
  ctx.fillText(max.toFixed(1), CHART_LEFT - 6, top + 12);
  ctx.fillText(min.toFixed(1), CHART_LEFT - 6, top + CHART_HEIGHT - 2);
  if (showZeroLine && min < 0 && max > 0) {
    ctx.fillText("0", CHART_LEFT - 6, valueToY(0) + 4);
  }
  ctx.textAlign = "left";

  // 折れ線
  ctx.beginPath();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = color;

  series.forEach((point, index) => {
    const x = timeToX(point.time);
    const y = valueToY(values[index]);
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });

  ctx.stroke();

  // フェーズ位置の点
  ctx.fillStyle = "#333";
  for (const marker of markers) {
    const x = timeToX(series[marker.index].time);
    const y = valueToY(values[marker.index]);
    ctx.beginPath();
    ctx.arc(x, y, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawMarkerLabels(
  ctx: CanvasRenderingContext2D,
  markers: PhaseMarker[],
  series: ComSeriesPoint[],
  timeToX: (time: number) => number,
  top: number
) {
  if (series.length < 2) return;

  ctx.font = "12px system-ui";

  markers.forEach((marker, i) => {
    const x = timeToX(marker.time);
    const rowY = top + (i % 2 === 0 ? 10 : 24);

    ctx.fillStyle = "#444";
    const label = `${marker.label} ${marker.time.toFixed(2)}秒`;
    const width = ctx.measureText(label).width;
    const textX = Math.min(
      Math.max(x - width / 2, CHART_LEFT - 40),
      CANVAS_WIDTH - CHART_RIGHT - width
    );
    ctx.fillText(label, textX, rowY);
  });
}

type TrajectoryOptions = {
  top: number;
  series: ComSeriesPoint[];
  markers: PhaseMarker[];
  scale: ComScale;
};

function drawTrajectory(
  ctx: CanvasRenderingContext2D,
  options: TrajectoryOptions
) {
  const { top, series, markers, scale } = options;

  ctx.fillStyle = COLOR_TEXT;
  ctx.font = "bold 15px system-ui";
  ctx.fillText(
    `重心の軌跡（横×縦、単位：${scale.unitLabel}）`,
    12,
    top - 10
  );

  const xs = series.map((p) => convertForChart(p.xShift, scale));
  const ys = series.map((p) => convertForChart(p.rise, scale));

  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  const rangeX = maxX - minX || 1;
  const rangeY = maxY - minY || 1;

  const areaX = CHART_LEFT;
  const areaY = top;
  const areaWidth = CANVAS_WIDTH - CHART_LEFT - CHART_RIGHT;
  const areaHeight = TRAJECTORY_HEIGHT - 30;

  ctx.strokeStyle = COLOR_GRID;
  ctx.lineWidth = 1;
  ctx.strokeRect(areaX, areaY, areaWidth, areaHeight);

  const toCanvasX = (value: number) =>
    areaX + ((value - minX) / rangeX) * areaWidth;
  // 上昇量が大きいほど上に描画
  const toCanvasY = (value: number) =>
    areaY + areaHeight - ((value - minY) / rangeY) * areaHeight;

  // 軌跡
  ctx.beginPath();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = "#555";

  series.forEach((_, index) => {
    const x = toCanvasX(xs[index]);
    const y = toCanvasY(ys[index]);
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  // 軸ラベル
  ctx.fillStyle = COLOR_SUBTEXT;
  ctx.font = "11px system-ui";
  ctx.fillText("← 画面左　　画面右 →", areaX + areaWidth / 2 - 70, areaY + areaHeight + 16);
  ctx.save();
  ctx.translate(areaX - 46, areaY + areaHeight / 2 + 30);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText("↑ 重心が高い", 0, 0);
  ctx.restore();

  // フェーズ位置の点とラベル
  const markerColors: Record<string, string> = {
    start: "#888",
    sink: "#e09f3e",
    takeoff: "#d1495b",
    peak: "#1f7a8c",
    landing: "#6b4e9b",
  };

  ctx.font = "12px system-ui";
  markers.forEach((marker) => {
    const x = toCanvasX(xs[marker.index]);
    const y = toCanvasY(ys[marker.index]);

    ctx.fillStyle = markerColors[marker.key] ?? "#333";
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.fill();

    const labelX = Math.min(x + 8, areaX + areaWidth - 60);
    ctx.fillText(marker.label, labelX, Math.max(y - 6, areaY + 12));
  });
}

const panelStyle: React.CSSProperties = {
  marginTop: 12,
};

const legendStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 14,
  marginTop: 8,
};

const noteStyle: React.CSSProperties = {
  fontSize: 12,
  color: "#666",
  lineHeight: 1.6,
  marginBottom: 0,
};

const metricsCardStyle: React.CSSProperties = {
  marginTop: 12,
  padding: 16,
  borderRadius: 12,
  background: "#f7f7f7",
  border: "1px solid #ddd",
  fontSize: 14,
};

const metricsRowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  padding: "8px 0",
  borderBottom: "1px solid #e5e5e5",
};

const commentCardStyle: React.CSSProperties = {
  marginTop: 12,
  padding: 16,
  borderRadius: 12,
  background: "#fff8ef",
  border: "1px solid #eadbc4",
  fontSize: 14,
};
