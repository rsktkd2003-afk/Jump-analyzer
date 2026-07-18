import { describe, expect, it } from "vitest";

import { computeSelectedPoint } from "./useSelectedPerson";
import { toNaturalPoint } from "../utils/manualMeasurement";

function videoStub(
  overrides: Partial<{
    videoWidth: number;
    videoHeight: number;
    rect: { left: number; top: number; width: number; height: number };
  }> = {}
): HTMLVideoElement {
  const rect = overrides.rect ?? { left: 50, top: 20, width: 500, height: 250 };

  return {
    videoWidth: overrides.videoWidth ?? 1000,
    videoHeight: overrides.videoHeight ?? 500,
    getBoundingClientRect: () =>
      ({
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
        right: rect.left + rect.width,
        bottom: rect.top + rect.height,
        x: rect.left,
        y: rect.top,
        toJSON() {
          return this;
        },
      } as DOMRect),
  } as HTMLVideoElement;
}

describe("useSelectedPerson: 座標変換", () => {
  it("表示座標を動画の自然座標へ変換する", () => {
    const video = videoStub();

    const point = computeSelectedPoint({ x: 300, y: 145 }, video);

    // (300-50)/500*1000=500, (145-20)/250*500=250
    expect(point.x).toBeCloseTo(500);
    expect(point.y).toBeCloseTo(250);
  });

  it("マーカー設置と同じtoNaturalPointを使うため結果が一致する", () => {
    const video = videoStub({
      videoWidth: 1920,
      videoHeight: 1080,
      rect: { left: 10, top: 5, width: 800, height: 450 },
    });
    const rect = video.getBoundingClientRect();
    const clientPoint = { x: 410, y: 230 };

    const markerPoint = toNaturalPoint(
      clientPoint,
      { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
      { width: video.videoWidth, height: video.videoHeight }
    );
    const selectedPoint = computeSelectedPoint(clientPoint, video);

    expect(selectedPoint).toEqual(markerPoint);
  });

  it("表示サイズが変わっても同じ相対クリック位置なら同じ自然座標になる", () => {
    const naturalSize = { videoWidth: 1920, videoHeight: 1080 };

    const small = computeSelectedPoint(
      { x: 60, y: 45 },
      videoStub({ ...naturalSize, rect: { left: 0, top: 0, width: 200, height: 100 } })
    );
    const large = computeSelectedPoint(
      { x: 300, y: 225 },
      videoStub({ ...naturalSize, rect: { left: 0, top: 0, width: 1000, height: 500 } })
    );

    expect(small.x).toBeCloseTo(large.x);
    expect(small.y).toBeCloseTo(large.y);
  });
});
