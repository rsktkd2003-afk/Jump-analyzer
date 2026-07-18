import { describe, expect, it } from "vitest";

import type { TrackedLandmark } from "./poseTypes";
import { getPoseCenter, selectPoseByPoint } from "./poseSelection";

function point(
  x: number,
  y: number,
  visibility?: number
): TrackedLandmark {
  return { x, y, visibility };
}

describe("poseSelection: 人物中心", () => {
  it("可視骨格点だけの平均を人物中心として返す", () => {
    const center = getPoseCenter([
      point(10, 20, 1),
      point(30, 40, 0.9),
      point(1000, 1000, 0.35),
    ]);

    expect(center).toEqual({ x: 20, y: 30 });
  });

  it("visibility未定義は可視、しきい値0.35以下は不可視として扱う", () => {
    expect(getPoseCenter([point(12, 34)])).toEqual({ x: 12, y: 34 });
    expect(getPoseCenter([point(12, 34, 0.35)])).toBeNull();
  });
});

describe("poseSelection: 対象人物の選択", () => {
  const leftPose = [point(100, 100, 1), point(120, 120, 1)];
  const rightPose = [point(700, 100, 1), point(720, 120, 1)];

  it("人物がいない場合はnull", () => {
    expect(selectPoseByPoint([], { x: 0, y: 0 })).toBeNull();
  });

  it("選択座標がない場合は先頭の人物を返す", () => {
    expect(selectPoseByPoint([leftPose, rightPose])).toBe(leftPose);
    expect(selectPoseByPoint([leftPose, rightPose], null)).toBe(leftPose);
  });

  it("選択座標に中心が最も近い人物を返す", () => {
    expect(
      selectPoseByPoint([leftPose, rightPose], { x: 705, y: 105 })
    ).toBe(rightPose);
  });

  it("同じ距離の場合は先に現れた人物を維持する", () => {
    expect(
      selectPoseByPoint([leftPose, rightPose], { x: 410, y: 110 })
    ).toBe(leftPose);
  });

  it("中心を計算できない人物は候補から除外する", () => {
    const invisiblePose = [point(705, 105, 0.1)];

    expect(
      selectPoseByPoint([invisiblePose, leftPose], { x: 705, y: 105 })
    ).toBe(leftPose);
  });

  it("全人物の中心を計算できない場合は先頭の人物を返す", () => {
    const first = [point(100, 100, 0.1)];
    const second = [point(700, 100, 0.2)];

    expect(selectPoseByPoint([first, second], { x: 700, y: 100 })).toBe(
      first
    );
  });
});
