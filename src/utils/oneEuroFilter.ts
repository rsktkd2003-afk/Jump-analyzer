// =============================================================
// One Euro Filter（1€ Filter）
// 速度適応型ローパスフィルタ。
// - 動きが遅い（≒停止に近い）とき：カットオフを下げて強く平滑化 → ノイズ除去
// - 動きが速いとき：カットオフを上げて追従 → 遅延を増やさない
// 関節角度など「静止時に振動し、動作時は追従性が欲しい」信号に適する。
// 参考: Casiez et al., "1€ Filter" (CHI 2012)
// =============================================================

function smoothingFactor(cutoffHz: number, dtSec: number): number {
  const r = 2 * Math.PI * cutoffHz * dtSec;
  return r / (r + 1);
}

function exponentialSmoothing(alpha: number, value: number, prev: number): number {
  return alpha * value + (1 - alpha) * prev;
}

export type OneEuroOptions = {
  /** 静止時の基本カットオフ周波数(Hz)。小さいほど強く平滑化 */
  minCutoff?: number;
  /** 速度に応じてカットオフを上げる係数。大きいほど高速時に追従 */
  beta?: number;
  /** 微分（速度）信号のカットオフ周波数(Hz) */
  derivativeCutoff?: number;
};

const DEFAULT_MIN_CUTOFF = 1.5;
const DEFAULT_BETA = 0.05;
const DEFAULT_DERIVATIVE_CUTOFF = 1.0;

export class OneEuroFilter {
  private readonly minCutoff: number;
  private readonly beta: number;
  private readonly derivativeCutoff: number;

  private prevValue: number | null = null;
  private prevDerivative = 0;
  private prevTime: number | null = null;

  constructor(options: OneEuroOptions = {}) {
    this.minCutoff = options.minCutoff ?? DEFAULT_MIN_CUTOFF;
    this.beta = options.beta ?? DEFAULT_BETA;
    this.derivativeCutoff = options.derivativeCutoff ?? DEFAULT_DERIVATIVE_CUTOFF;
  }

  reset(): void {
    this.prevValue = null;
    this.prevDerivative = 0;
    this.prevTime = null;
  }

  /**
   * @param value 観測値
   * @param timeSec 観測時刻（秒）。フレーム時刻を渡す
   */
  update(value: number, timeSec: number): number {
    if (this.prevValue === null || this.prevTime === null) {
      this.prevValue = value;
      this.prevTime = timeSec;
      this.prevDerivative = 0;
      return value;
    }

    const dt = timeSec - this.prevTime;

    if (dt <= 0) {
      return this.prevValue;
    }

    // 速度推定（微分信号も平滑化する）
    const rawDerivative = (value - this.prevValue) / dt;
    const derivativeAlpha = smoothingFactor(this.derivativeCutoff, dt);
    const derivative = exponentialSmoothing(
      derivativeAlpha,
      rawDerivative,
      this.prevDerivative
    );

    // 速度が大きいほどカットオフを上げる（＝遅延を減らす）
    const cutoff = this.minCutoff + this.beta * Math.abs(derivative);
    const alpha = smoothingFactor(cutoff, dt);
    const filtered = exponentialSmoothing(alpha, value, this.prevValue);

    this.prevValue = filtered;
    this.prevDerivative = derivative;
    this.prevTime = timeSec;

    return filtered;
  }
}

/**
 * null混じりの時系列にOne Euroフィルタを適用する。
 * nullは平滑化せずそのまま返し、フィルタ状態は保持する（欠測を跨いで継続）。
 */
export function smoothSeriesWithOneEuro(
  values: Array<number | null>,
  times: number[],
  options?: OneEuroOptions
): Array<number | null> {
  const filter = new OneEuroFilter(options);

  return values.map((value, index) => {
    if (value === null || !Number.isFinite(value)) return null;
    return filter.update(value, times[index]);
  });
}
