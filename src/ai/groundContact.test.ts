import { describe, expect, it } from "vitest";
import type { TrackedFrame, TrackedLandmark } from "./poseTypes";
import { detectJumpEvents } from "./groundContact";

function createFrame(
  frameIndex: number,
  verticalOffset: number,
  visibility = 1
): TrackedFrame {
  const landmarks: TrackedLandmark[] = Array.from({ length: 33 }, () => ({
    x: 100,
    y: 300 + verticalOffset,
    visibility,
  }));

  for (const index of [11, 12]) {
    landmarks[index] = {
      x: index === 11 ? 80 : 120,
      y: 200 + verticalOffset,
      visibility,
    };
  }
  for (const index of [23, 24]) {
    landmarks[index] = {
      x: index === 23 ? 85 : 115,
      y: 300 + verticalOffset,
      visibility,
    };
  }
  for (const index of [25, 26]) {
    landmarks[index] = {
      x: index === 25 ? 85 : 115,
      y: 350 + verticalOffset,
      visibility,
    };
  }
  for (const index of [27, 28, 29, 30, 31, 32]) {
    landmarks[index] = {
      x: index % 2 === 1 ? 85 : 115,
      y: 400 + verticalOffset,
      visibility,
    };
  }

  return {
    frameIndex,
    time: frameIndex * 0.1,
    landmarks,
    crop: { x: 0, y: 0, width: 200, height: 500 },
    centerX: 100,
    centerY: 300 + verticalOffset,
    leftKneeAngle: frameIndex >= 14 ? 100 : 160,
    rightKneeAngle: frameIndex >= 14 ? 100 : 160,
    hipAngle: 160,
    shoulderTilt: 0,
    leftHipAngle: 160,
    rightHipAngle: 160,
    leftElbowAngle: 150,
    rightElbowAngle: 150,
    leftShoulderAngle: 90,
    rightShoulderAngle: 90,
  };
}

describe("detectJumpEvents", () => {
  it("8フレーム未満は解析不能にする", () => {
    const frames = Array.from({ length: 7 }, (_, index) =>
      createFrame(index, 0)
    );

    expect(detectJumpEvents(frames)).toBeNull();
  });

  it("静止区間をジャンプとして扱わない", () => {
    const frames = Array.from({ length: 16 }, (_, index) =>
      createFrame(index, 0)
    );

    const result = detectJumpEvents(frames);

    expect(result).not.toBeNull();
    expect(result?.valid).toBe(false);
    expect(result?.airTimeSec).toBeNull();
  });

  it("主要骨格点が全区間低信頼の場合は解析不能にする", () => {
    const frames = Array.from({ length: 16 }, (_, index) =>
      createFrame(index, 0, 0.1)
    );

    expect(detectJumpEvents(frames)).toBeNull();
  });

  it("上昇と下降を含む系列ではイベント順序を保証する", () => {
    const offsets = [
      0,
      0,
      0,
      0,
      10,
      0,
      -30,
      -60,
      -90,
      -110,
      -90,
      -60,
      -30,
      0,
      0,
      0,
      0,
      0,
    ];
    const frames = offsets.map((offset, index) => createFrame(index, offset));

    const result = detectJumpEvents(frames);

    expect(result).not.toBeNull();
    expect(result?.valid).toBe(true);
    expect(result?.sinkStartIndex).toBeLessThanOrEqual(
      result?.sinkBottomIndex ?? -1
    );
    expect(result?.sinkBottomIndex).toBeLessThanOrEqual(
      result?.takeoffIndex ?? -1
    );
    expect(result?.takeoffIndex).toBeLessThan(result?.peakIndex ?? -1);
    expect(result?.peakIndex).toBeLessThan(result?.landingIndex ?? -1);
    expect(result?.landingIndex).toBeLessThanOrEqual(
      result?.landingEndIndex ?? -1
    );
    expect(result?.airTimeSec).not.toBeNull();
    expect(result?.airTimeSec ?? 0).toBeGreaterThan(0);
    expect(result?.airTimeSec ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(
      1.2
    );
  });

  it("補正後も1.2秒を超える非現実的な滞空時間は計測不能にする", () => {
    const offsets = [
      0,
      0,
      0,
      0,
      10,
      0,
      -30,
      -60,
      -90,
      -110,
      -110,
      -110,
      -110,
      -110,
      -110,
      -110,
      -110,
      -110,
      -110,
      -90,
      -70,
      -50,
      -30,
      -10,
      0,
      0,
      0,
      0,
      0,
      0,
    ];
    const frames = offsets.map((offset, index) => createFrame(index, offset));

    const result = detectJumpEvents(frames);

    expect(result).not.toBeNull();
    expect(result?.valid).toBe(true);
    expect(result?.landingIndex).toBeGreaterThan(result?.takeoffIndex ?? -1);
    expect(
      frames[result?.landingIndex ?? 0].time -
        frames[result?.takeoffIndex ?? 0].time
    ).toBeGreaterThan(1.2);
    expect(result?.airTimeSec).toBeNull();
  });

  it("1.2秒超の滞空時間を補正し、補正後1.2秒以内ならairTimeSecを採用する", () => {
    const offsets = [
      0, 0, 0, 0, 10, 0, -30, -60, -90,
      -18, -18, -18, -18, -18, -18, -18, -18,
      -16, -14, -12, -10, -8, -6, -4, -2, 0, 0, 0, 0,
    ];
    const frames = offsets.map((offset, index) => createFrame(index, offset));

    // 補正前（素朴な着地探索）は接地までに1.2秒を超えることを確認する。
    const naiveLandingIndex = 18;
    const naiveDiff =
      frames[naiveLandingIndex].time - frames[4].time;
    expect(naiveDiff).toBeGreaterThan(1.2);

    const result = detectJumpEvents(frames);

    expect(result).not.toBeNull();
    expect(result?.valid).toBe(true);
    expect(result?.takeoffIndex).toBe(4);
    expect(result?.landingIndex).toBe(12);
    expect(result?.airTimeSec).not.toBeNull();
    expect(result?.airTimeSec).toBeCloseTo(0.8);
    expect(result?.airTimeSec ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(
      1.2
    );
  });

  it("8フレームちょうどは解析不能にせず結果を返す", () => {
    const frames = Array.from({ length: 8 }, (_, index) =>
      createFrame(index, 0)
    );

    expect(detectJumpEvents(frames)).not.toBeNull();
  });

  it("visibility 0.5は有効な骨格点として扱う", () => {
    const offsets = [
      0, 0, 0, 0, 10, 0, -30, -60, -90, -110, -90, -60, -30, 0, 0, 0, 0, 0,
    ];
    const frames = offsets.map((offset, index) =>
      createFrame(index, offset, 0.5)
    );

    const result = detectJumpEvents(frames);

    expect(result).not.toBeNull();
    expect(result?.valid).toBe(true);
  });

  it("visibility 0.5未満は欠測として扱い、全区間で信号を構築できない場合はnull", () => {
    const offsets = [
      0, 0, 0, 0, 10, 0, -30, -60, -90, -110, -90, -60, -30, 0, 0, 0, 0, 0,
    ];
    const frames = offsets.map((offset, index) =>
      createFrame(index, offset, 0.49)
    );

    expect(detectJumpEvents(frames)).toBeNull();
  });

  it("主要骨格点の平均visibilityは十分でも、腰だけが低信頼なら信号を構築できない", () => {
    const frames: TrackedFrame[] = Array.from({ length: 10 }, (_, frameIndex) => {
      const landmarks: TrackedLandmark[] = Array.from({ length: 33 }, () => ({
        x: 100,
        y: 300,
        visibility: 1,
      }));

      // 肩は高visibilityのまま、腰(23/24)だけ0.5未満にする。
      // 肩+腰の平均visibilityは(1+1+0.3+0.3)/4=0.65で「全区間低信頼」には
      // ならないが、腰のreliableAverageY自体は個別に欠測になる。
      for (const index of [11, 12]) {
        landmarks[index] = { x: index === 11 ? 80 : 120, y: 200, visibility: 1 };
      }
      for (const index of [23, 24]) {
        landmarks[index] = { x: index === 23 ? 85 : 115, y: 300, visibility: 0.3 };
      }
      for (const index of [27, 28, 29, 30, 31, 32]) {
        landmarks[index] = {
          x: index % 2 === 1 ? 85 : 115,
          y: 400,
          visibility: 1,
        };
      }

      return {
        frameIndex,
        time: frameIndex * 0.1,
        landmarks,
        crop: { x: 0, y: 0, width: 200, height: 500 },
        centerX: 100,
        centerY: 300,
        leftKneeAngle: 160,
        rightKneeAngle: 160,
        hipAngle: 160,
        shoulderTilt: 0,
        leftHipAngle: 160,
        rightHipAngle: 160,
        leftElbowAngle: 150,
        rightElbowAngle: 150,
        leftShoulderAngle: 90,
        rightShoulderAngle: 90,
      };
    });

    expect(detectJumpEvents(frames)).toBeNull();
  });

  it("ジャンプなしの場合はvalid=falseで各フィールドが既定値になる", () => {
    const frames = Array.from({ length: 16 }, (_, index) =>
      createFrame(index, 0)
    );

    const result = detectJumpEvents(frames);

    expect(result).not.toBeNull();
    expect(result?.valid).toBe(false);
    expect(result?.sinkStartIndex).toBe(0);
    expect(result?.sinkBottomIndex).toBe(0);
    expect(result?.takeoffIndex).toBe(0);
    expect(result?.peakIndex).toBe(0);
    expect(result?.landingIndex).toBe(frames.length - 1);
    expect(result?.landingEndIndex).toBe(frames.length - 1);
    expect(result?.airTimeSec).toBeNull();
    expect(result?.risePx).toBe(0);
    expect(result?.sinkPx).toBe(0);
    expect(result?.torsoPx).toBeCloseTo(100);
    expect(result?.interpolatedRatio).toBe(0);
    expect(result?.lowConfidenceFrames.size).toBe(0);
    expect(result?.grounded).toEqual(Array(frames.length).fill(true));
  });

  it("イベント順序とlandingEndIndexが動画範囲内に収まることを保証する", () => {
    const offsets = [
      0, 0, 0, 0, 10, 0, -30, -60, -90, -110, -90, -60, -30, 0, 0, 0, 0, 0,
    ];
    const frames = offsets.map((offset, index) => createFrame(index, offset));

    const result = detectJumpEvents(frames);

    expect(result).not.toBeNull();
    expect(result?.valid).toBe(true);
    expect(result?.sinkStartIndex).toBeLessThanOrEqual(
      result?.sinkBottomIndex ?? -1
    );
    expect(result?.sinkBottomIndex).toBeLessThanOrEqual(
      result?.takeoffIndex ?? -1
    );
    expect(result?.takeoffIndex).toBeLessThan(result?.peakIndex ?? -1);
    expect(result?.peakIndex).toBeLessThan(result?.landingIndex ?? -1);
    expect(result?.landingIndex).toBeLessThanOrEqual(
      result?.landingEndIndex ?? -1
    );
    expect(result?.landingEndIndex ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(
      frames.length - 1
    );
    expect(result?.sinkStartIndex ?? -1).toBeGreaterThanOrEqual(0);
  });

  it("接地条件を満たす着地点がない場合は基準姿勢の75%回復点へフォールバックする", () => {
    const offsets = [
      0, 0, 0, 0, 10, 0, -30, -60, -90, -110, -90, -60, -30, 0, 0, 0,
      0, 0,
    ];
    const frames = offsets.map((offset, index) => createFrame(index, offset));

    // 離地後は足だけを上げたままにし、重心が基準姿勢へ戻っても
    // grounded=falseとなる系列を作る。これにより一次着地探索は失敗する。
    for (let index = 6; index < frames.length; index += 1) {
      for (const footIndex of [27, 28, 29, 30, 31, 32]) {
        frames[index].landmarks[footIndex] = {
          ...frames[index].landmarks[footIndex],
          y: 300,
        };
      }
    }

    const result = detectJumpEvents(frames);

    expect(result).not.toBeNull();
    expect(result?.valid).toBe(true);
    if (!result) return;

    const fallbackY = result.baselineComY - result.risePx * 0.25;

    expect(result.grounded[result.landingIndex]).toBe(false);
    expect(
      result.grounded
        .slice(result.peakIndex + 1, result.landingIndex + 1)
        .every((grounded) => !grounded)
    ).toBe(true);
    expect(result.comY[result.landingIndex]).toBeGreaterThanOrEqual(fallbackY);
    expect(result.comY[result.landingIndex - 1]).toBeLessThan(fallbackY);
  });

  it("入力framesを変更しない", () => {
    const offsets = [
      0, 0, 0, 0, 10, 0, -30, -60, -90, -110, -90, -60, -30, 0, 0, 0, 0, 0,
    ];
    const frames = offsets.map((offset, index) => createFrame(index, offset));
    const snapshot = JSON.parse(JSON.stringify(frames));

    detectJumpEvents(frames);

    expect(JSON.parse(JSON.stringify(frames))).toEqual(snapshot);
  });
});
