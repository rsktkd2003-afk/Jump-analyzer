import type { TrackedFrame } from "./poseAnalyzer";

/** ジャンプ動作のフェーズ */
export type PhaseKey = "start" | "sink" | "takeoff" | "peak" | "landing";

export type PhaseMarker = {
  key: PhaseKey;
  label: string;
  /** series / frames 配列内のインデックス */
  index: number;
  time: number;
};

/**
 * px を意味のある単位へ換算するためのスケール情報。
 * - cm: 基準A/Bのキャリブレーションがある場合（実寸換算）
 * - torso: キャリブレーションが無い場合、体幹長（肩〜腰）を基準にした相対値
 * - px: 骨格が取れず体幹長も推定できない場合のフォールバック
 */
export type ComScale = {
  mode: "cm" | "torso" | "px";
  cmPerPx: number | null;
  torsoPx: number | null;
  /** グラフ軸などに表示する単位ラベル */
  unitLabel: string;
  /** スケールの説明文（ユーザー向け） */
  note: string;
};

export type MoveLevel = "小" | "中" | "大";

export type ScaledValue = {
  /** 生の px 値（符号付きの場合あり。+ は画面右 / 上方向） */
  px: number;
  /** ユーザー向け表示テキスト（単位換算済み） */
  text: string;
  level: MoveLevel;
};

export type ComSeriesPoint = {
  time: number;
  frameIndex: number;
  /** 開始位置からの左右移動（px, + = 画面右） */
  xShift: number;
  /** 基準姿勢からの重心上昇量（px, + = 上） */
  rise: number;
  /** 開始位置からの合成移動距離（px） */
  moveFromStart: number;
};

export type ComMetrics = {
  /** 重心上昇量（基準姿勢 → 最高点） */
  riseHeight: ScaledValue | null;
  /** 沈み込みの深さ（基準姿勢 → 最下点） */
  sinkDepth: ScaledValue | null;
  /** 沈み込み開始 → 踏切までの時間（秒） */
  sinkToTakeoffSec: number | null;
  /** 滞空時間（踏切 → 着地、秒） */
  airTimeSec: number | null;
  /** 動作全体の横ブレ幅 */
  swayWidth: ScaledValue;
  /** 踏切前（沈み込み開始 → 踏切）の横移動（符号付き） */
  driftBeforeTakeoff: ScaledValue | null;
  /** 空中（踏切 → 着地）の横移動（符号付き） */
  driftInAir: ScaledValue | null;
  /** 開始位置に対する着地位置の横ズレ（符号付き） */
  landingOffset: ScaledValue | null;
};

export type ComAnalysisResult = {
  series: ComSeriesPoint[];
  markers: PhaseMarker[];
  scale: ComScale;
  metrics: ComMetrics;
  /** 改善のヒント（日本語コメント） */
  comments: string[];
  jumpDetected: boolean;
};

const phaseLabels: Record<PhaseKey, string> = {
  start: "開始",
  sink: "沈み込み",
  takeoff: "踏切",
  peak: "最高点",
  landing: "着地",
};

const LEFT_SHOULDER = 11;
const RIGHT_SHOULDER = 12;
const LEFT_HIP = 23;
const RIGHT_HIP = 24;

/** 3点移動平均で平滑化 */
function smooth(values: number[]): number[] {
  if (values.length < 3) return [...values];

  return values.map((_, i) => {
    const a = values[Math.max(0, i - 1)];
    const b = values[i];
    const c = values[Math.min(values.length - 1, i + 1)];
    return (a + b + c) / 3;
  });
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

/** 肩の中点〜腰の中点の距離（体幹長）を全フレーム平均で推定 */
function estimateTorsoPx(frames: TrackedFrame[]): number | null {
  const values: number[] = [];

  for (const frame of frames) {
    const ls = frame.landmarks[LEFT_SHOULDER];
    const rs = frame.landmarks[RIGHT_SHOULDER];
    const lh = frame.landmarks[LEFT_HIP];
    const rh = frame.landmarks[RIGHT_HIP];

    if (!ls || !rs || !lh || !rh) continue;

    const visibilities = [ls, rs, lh, rh].map((p) => p.visibility ?? 1);
    if (visibilities.some((v) => v < 0.35)) continue;

    const sx = (ls.x + rs.x) / 2;
    const sy = (ls.y + rs.y) / 2;
    const hx = (lh.x + rh.x) / 2;
    const hy = (lh.y + rh.y) / 2;

    values.push(Math.hypot(sx - hx, sy - hy));
  }

  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

export function buildScale(
  frames: TrackedFrame[],
  cmPerPx: number | null
): ComScale {
  const torsoPx = estimateTorsoPx(frames);

  if (cmPerPx && cmPerPx > 0) {
    return {
      mode: "cm",
      cmPerPx,
      torsoPx,
      unitLabel: "cm",
      note: "基準A/Bのキャリブレーションを使い、実寸(cm)に換算しています。",
    };
  }

  if (torsoPx && torsoPx > 0) {
    return {
      mode: "torso",
      cmPerPx: null,
      torsoPx,
      unitLabel: "%（体幹長比）",
      note:
        "実寸換算の基準が無いため、体幹長（肩〜腰の長さ）を100%とした動画内基準の相対値で表示しています。",
    };
  }

  return {
    mode: "px",
    cmPerPx: null,
    torsoPx: null,
    unitLabel: "相対値",
    note: "実寸換算の基準が無いため、動画内基準の相対値で表示しています。",
  };
}

/** グラフ描画用：px を表示単位の数値へ変換 */
export function convertForChart(px: number, scale: ComScale): number {
  if (scale.mode === "cm" && scale.cmPerPx) return px * scale.cmPerPx;
  if (scale.mode === "torso" && scale.torsoPx) return (px / scale.torsoPx) * 100;
  return px;
}

/** 大きさ（絶対値）を表示テキストに変換 */
export function formatAmount(px: number, scale: ComScale): string {
  const abs = Math.abs(px);

  if (scale.mode === "cm" && scale.cmPerPx) {
    const cm = abs * scale.cmPerPx;
    return cm >= 100 ? `約 ${(cm / 100).toFixed(2)}m` : `約 ${cm.toFixed(1)}cm`;
  }

  if (scale.mode === "torso" && scale.torsoPx) {
    return `体幹長の約 ${Math.round((abs / scale.torsoPx) * 100)}%`;
  }

  return `約 ${Math.round(abs)}（動画内相対値）`;
}

function levelOf(px: number, scale: ComScale): MoveLevel {
  const abs = Math.abs(px);

  if (scale.mode === "cm" && scale.cmPerPx) {
    const cm = abs * scale.cmPerPx;
    if (cm < 10) return "小";
    if (cm < 25) return "中";
    return "大";
  }

  if (scale.mode === "torso" && scale.torsoPx) {
    const ratio = abs / scale.torsoPx;
    if (ratio < 0.25) return "小";
    if (ratio < 0.6) return "中";
    return "大";
  }

  if (abs < 40) return "小";
  if (abs < 100) return "中";
  return "大";
}

function scaledAmount(px: number, scale: ComScale): ScaledValue {
  return {
    px,
    text: `${formatAmount(px, scale)}（${levelOf(px, scale)}）`,
    level: levelOf(px, scale),
  };
}

/** 符号付きの横移動を「画面右へ／画面左へ」付きで表示 */
function scaledDirectional(px: number, scale: ComScale): ScaledValue {
  const direction = px >= 0 ? "画面右へ" : "画面左へ";
  return {
    px,
    text: `${direction} ${formatAmount(px, scale)}（${levelOf(px, scale)}）`,
    level: levelOf(px, scale),
  };
}

/** 着地フェーズ付近の左右膝角度差（度）を推定 */
function landingKneeDiff(
  frames: TrackedFrame[],
  landingIndex: number
): number | null {
  const diffs: number[] = [];
  const end = Math.min(frames.length, landingIndex + 6);

  for (let i = landingIndex; i < end; i += 1) {
    const frame = frames[i];
    if (frame.leftKneeAngle !== null && frame.rightKneeAngle !== null) {
      diffs.push(Math.abs(frame.leftKneeAngle - frame.rightKneeAngle));
    }
  }

  if (diffs.length === 0) return null;
  return diffs.reduce((sum, v) => sum + v, 0) / diffs.length;
}

/**
 * 重心（トラッキングした人物の中心座標）の推移から、
 * ジャンプのフェーズ・移動量・改善コメントを推定する。
 */
export function analyzeCenterOfMass(
  frames: TrackedFrame[],
  cmPerPx: number | null
): ComAnalysisResult | null {
  if (frames.length < 8) return null;

  const scale = buildScale(frames, cmPerPx);

  const xs = frames.map((f) => f.centerX);
  const ys = frames.map((f) => f.centerY);
  const smoothY = smooth(ys);
  const smoothX = smooth(xs);

  // 基準姿勢（立ち姿勢）の高さ：序盤フレームの中央値
  const baselineCount = Math.max(3, Math.floor(frames.length * 0.15));
  const baselineY = median(smoothY.slice(0, baselineCount));

  // 最高点（画像座標では y が最小）
  let peakIndex = 0;
  for (let i = 1; i < smoothY.length; i += 1) {
    if (smoothY[i] < smoothY[peakIndex]) peakIndex = i;
  }

  // 最下点（沈み込みの底）：最高点より前で y が最大
  let sinkIndex = 0;
  for (let i = 1; i <= peakIndex; i += 1) {
    if (smoothY[i] > smoothY[sinkIndex]) sinkIndex = i;
  }

  const risePx = baselineY - smoothY[peakIndex];
  const sinkPx = smoothY[sinkIndex] - baselineY;

  // ジャンプとして十分な上昇があるか
  const minRise = scale.torsoPx ? scale.torsoPx * 0.15 : 15;
  const jumpDetected = risePx > minRise && peakIndex > sinkIndex;

  // 沈み込み開始：最下点から遡り、基準姿勢に近い最後のフレーム
  let startIndex = 0;
  if (sinkPx > 0) {
    const threshold = baselineY + Math.max(sinkPx * 0.15, 2);
    for (let i = sinkIndex; i >= 0; i -= 1) {
      if (smoothY[i] <= threshold) {
        startIndex = i;
        break;
      }
    }
  }

  // 踏切：最下点→最高点の間で、重心が基準姿勢の高さを上向きに通過した点
  let takeoffIndex = sinkIndex;
  {
    let found = false;
    for (let i = sinkIndex + 1; i <= peakIndex; i += 1) {
      if (smoothY[i] <= baselineY) {
        takeoffIndex = i;
        found = true;
        break;
      }
    }

    if (!found) {
      // フォールバック：上向き速度が最大の点
      let bestVelocity = 0;
      for (let i = sinkIndex + 1; i <= peakIndex; i += 1) {
        const dt = frames[i].time - frames[i - 1].time;
        if (dt <= 0) continue;
        const velocity = (smoothY[i - 1] - smoothY[i]) / dt;
        if (velocity > bestVelocity) {
          bestVelocity = velocity;
          takeoffIndex = i;
        }
      }
    }
  }

  // 着地：最高点の後、重心が基準姿勢付近まで戻った最初のフレーム
  let landingIndex = frames.length - 1;
  if (risePx > 0) {
    const threshold = baselineY - risePx * 0.25;
    for (let i = peakIndex + 1; i < frames.length; i += 1) {
      if (smoothY[i] >= threshold) {
        landingIndex = i;
        break;
      }
    }
  }

  const markers: PhaseMarker[] = [];

  if (jumpDetected) {
    const keys: Array<[PhaseKey, number]> = [
      ["start", startIndex],
      ["sink", sinkIndex],
      ["takeoff", takeoffIndex],
      ["peak", peakIndex],
      ["landing", landingIndex],
    ];

    let lastIndex = -1;
    for (const [key, index] of keys) {
      // フェーズの順序が崩れている場合は重複マーカーを避ける
      if (index <= lastIndex && key !== "start") continue;
      markers.push({
        key,
        label: phaseLabels[key],
        index,
        time: frames[index].time,
      });
      lastIndex = index;
    }
  }

  // グラフ用の時系列（開始位置基準）
  const originX = smoothX[startIndex];
  const originY = smoothY[startIndex];

  const series: ComSeriesPoint[] = frames.map((frame, i) => {
    const dx = smoothX[i] - originX;
    const dy = smoothY[i] - originY;
    return {
      time: frame.time,
      frameIndex: frame.frameIndex,
      xShift: dx,
      rise: baselineY - smoothY[i],
      moveFromStart: Math.hypot(dx, dy),
    };
  });

  // 指標
  const swayPx = Math.max(...smoothX) - Math.min(...smoothX);

  const metrics: ComMetrics = {
    riseHeight: jumpDetected ? scaledAmount(risePx, scale) : null,
    sinkDepth: jumpDetected && sinkPx > 0 ? scaledAmount(sinkPx, scale) : null,
    sinkToTakeoffSec:
      jumpDetected && takeoffIndex > startIndex
        ? frames[takeoffIndex].time - frames[startIndex].time
        : null,
    airTimeSec:
      jumpDetected && landingIndex > takeoffIndex
        ? frames[landingIndex].time - frames[takeoffIndex].time
        : null,
    swayWidth: scaledAmount(swayPx, scale),
    driftBeforeTakeoff: jumpDetected
      ? scaledDirectional(smoothX[takeoffIndex] - smoothX[startIndex], scale)
      : null,
    driftInAir: jumpDetected
      ? scaledDirectional(smoothX[landingIndex] - smoothX[takeoffIndex], scale)
      : null,
    landingOffset: jumpDetected
      ? scaledDirectional(smoothX[landingIndex] - smoothX[startIndex], scale)
      : null,
  };

  const comments = createComments(frames, metrics, scale, {
    jumpDetected,
    landingIndex,
    sinkPx,
  });

  return {
    series,
    markers,
    scale,
    metrics,
    comments,
    jumpDetected,
  };
}

function createComments(
  frames: TrackedFrame[],
  metrics: ComMetrics,
  scale: ComScale,
  context: { jumpDetected: boolean; landingIndex: number; sinkPx: number }
): string[] {
  const comments: string[] = [];

  if (!context.jumpDetected) {
    comments.push(
      "はっきりしたジャンプ動作（重心の上昇）を検出できませんでした。選手全体が映っているか、トラッキング対象が正しいかを確認してください。"
    );
    return comments;
  }

  const drift = metrics.driftBeforeTakeoff;
  if (drift && drift.level !== "小") {
    const direction = drift.px >= 0 ? "画面右" : "画面左";
    comments.push(
      `踏切前に重心が${direction}へ流れています（${formatAmount(
        drift.px,
        scale
      )}）。沈み込み中に重心を足の真上に保つと、上方向へ力を伝えやすくなる可能性があります。`
    );
  }

  const air = metrics.driftInAir;
  if (air && air.level !== "小") {
    const direction = air.px >= 0 ? "画面右" : "画面左";
    comments.push(
      `空中で重心が${direction}へ移動しています（${formatAmount(
        air.px,
        scale
      )}）。踏切で力が横方向へ逃げている可能性があります。`
    );
  }

  const sink = metrics.sinkDepth;
  if (sink) {
    if (scale.torsoPx && context.sinkPx > scale.torsoPx * 0.5) {
      comments.push(
        `沈み込みが深めです（${sink.text}）。切り返しに時間がかかると上方向への力が逃げる可能性があるため、沈み込みの深さと切り返しの速さのバランスを確認してみてください。`
      );
    } else if (scale.torsoPx && context.sinkPx < scale.torsoPx * 0.12) {
      comments.push(
        `沈み込みが浅めです（${sink.text}）。もう少し沈み込むと、脚の力を使って重心を高く上げやすくなる可能性があります。`
      );
    }
  }

  const landing = metrics.landingOffset;
  if (landing && landing.level !== "小") {
    const direction = landing.px >= 0 ? "画面右" : "画面左";
    comments.push(
      `着地位置が開始位置より${direction}側にズレています（${formatAmount(
        landing.px,
        scale
      )}）。着地バランスが片側に流れている可能性があります。`
    );
  }

  const kneeDiff = landingKneeDiff(frames, context.landingIndex);
  if (kneeDiff !== null && kneeDiff > 15) {
    comments.push(
      `着地時に左右の膝の曲がり方に差があります（角度差 約${kneeDiff.toFixed(
        0
      )}°）。片脚に負担が偏っている可能性があるため、両足で均等に着地する意識が有効かもしれません。`
    );
  }

  if (comments.length === 0) {
    comments.push(
      "重心の横ブレが小さく、上方向へ効率よく力を伝えられているジャンプです。この動きを再現できるよう繰り返し確認してみてください。"
    );
  }

  return comments;
}
