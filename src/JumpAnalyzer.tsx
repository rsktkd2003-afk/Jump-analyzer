import { useEffect, useMemo, useState } from "react";

import MarkerToolbar from "./components/MarkerToolbar";
import ResultCard from "./components/ResultCard";
import VideoPlayer from "./components/VideoPlayer";
import HistoryList from "./components/HistoryList";

import type { MarkerTarget, Markers } from "./types/measurement";
import type { MeasurementHistoryItem } from "./types/history";

import {
  calculateCmPerPx,
  calculateMaxReach,
  calculateReachError,
} from "./utils/jumpCalculator";
import {
  calculateBallSpeed,
  calculateSpeedError,
} from "./utils/speedCalculator";

import {
  loadMeasurementHistory,
  saveMeasurementHistory,
} from "./storage/measurementStorage";

const initialMarkers: Markers = {
  calibA: null,
  calibB: null,
  ring: null,
  finger: null,
  ballA: null,
  ballB: null,
};

function JumpAnalyzer() {
  const [fps, setFps] = useState(60);
  const [knownCm, setKnownCm] = useState(45);
  const [ringHeight, setRingHeight] = useState(305);
  const [standingReach, setStandingReach] = useState(214);
  const [target, setTarget] = useState<MarkerTarget>("calibA");

  const [markers, setMarkers] = useState<Markers>(initialMarkers);

  const [timeA, setTimeA] = useState<number | null>(null);
  const [timeB, setTimeB] = useState<number | null>(null);
  const [frameA, setFrameA] = useState<number | null>(null);
  const [frameB, setFrameB] = useState<number | null>(null);

  const [peakTime, setPeakTime] = useState<number | null>(null);
  const [peakFrame, setPeakFrame] = useState<number | null>(null);

  const [history, setHistory] = useState<MeasurementHistoryItem[]>([]);

  useEffect(() => {
    setHistory(loadMeasurementHistory());
  }, []);

  const cmPerPx = useMemo(
    () => calculateCmPerPx(markers, knownCm),
    [markers, knownCm]
  );

  const maxReach = useMemo(
    () => calculateMaxReach({ markers, knownCm, ringHeight }),
    [markers, knownCm, ringHeight]
  );

  const jumpHeight = useMemo(() => {
    if (!maxReach) return null;
    return maxReach - standingReach;
  }, [maxReach, standingReach]);

  const airTime = useMemo(() => {
    if (timeA === null || timeB === null) return null;
    const diff = Math.abs(timeB - timeA);
    return diff > 0 ? diff : null;
  }, [timeA, timeB]);

  const airFrameCount = useMemo(() => {
    if (frameA === null || frameB === null) return null;
    const diff = Math.abs(frameB - frameA);
    return diff > 0 ? diff : null;
  }, [frameA, frameB]);

  const estimatedJumpHeight = useMemo(() => {
    if (!airTime) return null;
    return ((9.81 * airTime * airTime) / 8) * 100;
  }, [airTime]);

  const reachError = useMemo(
    () => calculateReachError(markers, knownCm),
    [markers, knownCm]
  );

  const ballSpeed = useMemo(
    () => calculateBallSpeed({ markers, knownCm, timeA, timeB }),
    [markers, knownCm, timeA, timeB]
  );

  const speedError = useMemo(
    () => calculateSpeedError(ballSpeed),
    [ballSpeed]
  );

  const handleMarkerPlace = (
    target: MarkerTarget,
    point: { x: number; y: number }
  ) => {
    setMarkers((prev) => ({
      ...prev,
      [target]: point,
    }));
  };

  const handleClearMarker = (target: MarkerTarget) => {
    setMarkers((prev) => ({
      ...prev,
      [target]: null,
    }));
  };

  const handleTimeSave = (
    label: "takeoff" | "landing",
    time: number,
    frame: number
  ) => {
    if (label === "takeoff") {
      setTimeA(time);
      setFrameA(frame);
    }

    if (label === "landing") {
      setTimeB(time);
      setFrameB(frame);
    }
  };

  const resetMarkers = () => {
    setMarkers(initialMarkers);
    setTimeA(null);
    setTimeB(null);
    setFrameA(null);
    setFrameB(null);
    setPeakTime(null);
    setPeakFrame(null);
  };

  const handleSaveResult = () => {
    const item: MeasurementHistoryItem = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      mode: "jump",
      maxReach,
      jumpHeight,
      airTime,
      airFrameCount,
      estimatedJumpHeight,
      peakTime,
      peakFrame,
      reachError,
      ballSpeed,
      speedError,
    };

    const next = [item, ...history];
    setHistory(next);
    saveMeasurementHistory(next);
  };

  const handleClearHistory = () => {
    setHistory([]);
    saveMeasurementHistory([]);
  };

  const handleShare = async () => {
    const text = [
      "🏐 Jump Analyzer 測定結果",
      `最高到達点：${maxReach ? `${maxReach.toFixed(1)}cm` : "-"}`,
      `ジャンプ高：${jumpHeight ? `${jumpHeight.toFixed(1)}cm` : "-"}`,
      `離地A：${frameA !== null ? `${frameA}F` : "-"}`,
      `着地B：${frameB !== null ? `${frameB}F` : "-"}`,
      `滞空時間：${airTime ? `${airTime.toFixed(3)}秒` : "-"}`,
      `滞空フレーム数：${airFrameCount ? `${airFrameCount}F` : "-"}`,
      `推定ジャンプ高：${
        estimatedJumpHeight ? `${estimatedJumpHeight.toFixed(1)}cm` : "-"
      }`,
      `最高点フレーム：${peakFrame !== null ? `${peakFrame}F` : "-"}`,
      `球速：${ballSpeed ? `${ballSpeed.toFixed(1)}km/h` : "-"}`,
      `誤差：${reachError ? `±${reachError.toFixed(1)}cm` : "-"}`,
    ].join("\n");

    if (navigator.share) {
      await navigator.share({ text });
    } else {
      await navigator.clipboard.writeText(text);
      alert("測定結果をコピーしました");
    }
  };

  return (
    <main
      style={{
        maxWidth: 520,
        margin: "0 auto",
        padding: 12,
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <h1 style={{ fontSize: 24 }}>🏐 Jump Analyzer</h1>

      <section>
        <label>
          指高(cm)：
          <input
            type="number"
            value={standingReach}
            onChange={(e) => setStandingReach(Number(e.target.value))}
            style={{ width: 80, fontSize: 16, marginLeft: 8 }}
          />
        </label>
      </section>

      <hr />

      <VideoPlayer
        fps={fps}
        onFpsChange={setFps}
        onTimeSave={handleTimeSave}
        onPeakDetected={(frame, time) => {
          setPeakFrame(frame);
          setPeakTime(time);
        }}
        markers={markers}
        markerTarget={target}
        onMarkerPlace={handleMarkerPlace}
      />

      <hr />

      <MarkerToolbar
        target={target}
        onChange={setTarget}
        onClearMarker={handleClearMarker}
      />

      <hr />

      <section>
        <h2>基準設定</h2>

        <label>
          基準距離(cm)：
          <input
            type="number"
            value={knownCm}
            onChange={(e) => setKnownCm(Number(e.target.value))}
            style={{ width: 80, fontSize: 16, marginLeft: 8 }}
          />
        </label>

        <p>
          {cmPerPx
            ? `1px = ${cmPerPx.toFixed(3)}cm`
            : "基準A/Bをタップしてね"}
        </p>
      </section>

      <hr />

      <section>
        <h2>ジャンプ計測</h2>

        <label>
          リング高さ(cm)：
          <input
            type="number"
            value={ringHeight}
            onChange={(e) => setRingHeight(Number(e.target.value))}
            style={{ width: 80, fontSize: 16, marginLeft: 8 }}
          />
        </label>

        <ResultCard
          title="最高到達点"
          value={maxReach ? `約 ${maxReach.toFixed(1)} cm` : "-"}
          subText={
            reachError ? `誤差目安：±${reachError.toFixed(1)}cm` : undefined
          }
        />

        <ResultCard
          title="ジャンプ高"
          value={jumpHeight ? `約 ${jumpHeight.toFixed(1)} cm` : "-"}
          subText={`指高：${standingReach}cm`}
        />

        <ResultCard
          title="滞空時間"
          value={airTime ? `${airTime.toFixed(3)} 秒` : "-"}
          subText={
            airFrameCount
              ? `${airFrameCount}フレーム / 推定ジャンプ高：約 ${estimatedJumpHeight?.toFixed(
                  1
                )}cm`
              : "離地をA、着地をBで保存"
          }
        />

        <ResultCard
          title="最高点フレーム"
          value={peakFrame !== null ? `${peakFrame} F` : "-"}
          subText={peakTime !== null ? `${peakTime.toFixed(3)} 秒` : undefined}
        />
      </section>

      <hr />

      <section>
        <h2>フレーム情報</h2>

        <p>
          離地A：
          {timeA !== null && frameA !== null
            ? `${timeA.toFixed(3)} 秒 / ${frameA}F`
            : "-"}
        </p>

        <p>
          着地B：
          {timeB !== null && frameB !== null
            ? `${timeB.toFixed(3)} 秒 / ${frameB}F`
            : "-"}
        </p>

        <p>
          滞空：
          {airTime && airFrameCount
            ? `${airTime.toFixed(3)} 秒 / ${airFrameCount}F`
            : "-"}
        </p>
      </section>

      <hr />

      <section>
        <h2>球速</h2>

        <ResultCard
          title="球速"
          value={ballSpeed ? `約 ${ballSpeed.toFixed(1)} km/h` : "-"}
          subText={
            speedError
              ? `誤差目安：±${speedError.toFixed(1)}km/h`
              : "ボールA/Bと時刻A/Bを保存"
          }
        />
      </section>

      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <button onClick={handleSaveResult} style={buttonStyle}>
          結果保存
        </button>

        <button onClick={handleShare} style={buttonStyle}>
          共有
        </button>
      </div>

      <button onClick={resetMarkers} style={{ ...buttonStyle, width: "100%" }}>
        測定リセット
      </button>

      <hr />

      <HistoryList items={history} onClear={handleClearHistory} />
    </main>
  );
}

const buttonStyle: React.CSSProperties = {
  flex: 1,
  padding: 14,
  borderRadius: 12,
  border: "1px solid #ccc",
  background: "#fff",
  fontSize: 16,
  marginTop: 12,
};

export default JumpAnalyzer;