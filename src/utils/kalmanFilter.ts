export class KalmanFilter1D {
  private estimate: number;
  private errorEstimate: number;
  private readonly errorMeasure: number;
  private readonly processNoise: number;

  constructor(
    initialValue = 0,
    errorEstimate = 1,
    errorMeasure = 4,
    processNoise = 0.01
  ) {
    this.estimate = initialValue;
    this.errorEstimate = errorEstimate;
    this.errorMeasure = errorMeasure;
    this.processNoise = processNoise;
  }

  update(measurement: number): number {
    const kalmanGain =
      this.errorEstimate / (this.errorEstimate + this.errorMeasure);

    this.estimate =
      this.estimate + kalmanGain * (measurement - this.estimate);

    this.errorEstimate =
      (1 - kalmanGain) * this.errorEstimate + this.processNoise;

    return this.estimate;
  }
}

export function smoothNumberSeriesWithKalman(values: number[]): number[] {
  if (values.length === 0) return [];

  const filter = new KalmanFilter1D(values[0]);

  return values.map((value) => filter.update(value));
}