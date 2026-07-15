import { useMemo, useState } from "react";

import TrackingCanvas from "../components/TrackingCanvas";
import StarRow from "../components/ui/StarRow";
import {
  ChevronLeftIcon,
  CheckCircleIcon,
  PdfIcon,
  SaveIcon,
  ShareIcon,
  StepBackIcon,
  StepForwardIcon,
  PlayIcon,
  PauseIcon,
  WarnIcon,
} from "../components/layout/Icons";

import type { AnalysisResult } from "../analysis";
import type { ReachEstimateResult } from "../ai/reachEstimateAnalyzer";
import type { TrackedFrame } from "../ai/poseAnalyzer";
import { buildFormSummary } from "../utils/formSummary";
import { card, colors, ghostButton, mutedText, page, primaryButton, radius, sectionTitle } from "../styles/theme";

type Props = {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  videoUrl: string | null;
  videoName: string;
  currentTime: number;
  setCurrentTime: (time: number) => void;
  currentTrackedFrame: TrackedFrame | null;
  fps: number;

  analysisResult: AnalysisResult | null;
  reachEstimate: ReachEstimateResult;
  maxReach: number | null;
  jumpHeight: number | null;
  airTime: number | null;

  resultTimestamp: string | null;

  onBack: () => void;
  onSave: () => void;
  onShare: () => void;
};

export default function ResultPage({
  videoRef,
  videoUrl,
  videoName,
  currentTime,
  setCurrentTime,
  currentTrackedFrame,
  fps,
  analysisResult,
  reachEstimate,
  maxReach,
  jumpHeight,
  airTime,
  resultTimestamp,
  onBack,
  onSave,
  onShare,
}: Props) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);

  const formSummary = useMemo(
    () => buildFormSummary(analysisResult?.features ?? []),
    [analysisResult]
  );

  const takeoffContactTime = analysisResult?.features.find(
    (f) => f.key === "takeoff.contactTimeSec"
  )?.value;
  const approachSpeed = analysisResult?.features.find((f) => f.key === "approach.speed")?.value;

  const displayMaxReach = reachEstimate.estimatedMaxReachCm ?? maxReach;
  const displayJumpHeight = reachEstimate.estimatedJumpHeightCm ?? jumpHeight;

  const metrics: Array<{ label: string; value: string; sub?: string }> = [];
  if (displayMaxReach !== null) {
    metrics.push({ label: "最高到達点", value: `${displayMaxReach.toFixed(0)} cm` });
  }
  if (displayJumpHeight !== null) {
    metrics.push({ label: "ジャンプ高", value: `${displayJumpHeight.toFixed(1)} cm` });
  }
  if (airTime !== null) {
    metrics.push({ label: "滞空時間", value: `${airTime.toFixed(2)} 秒` });
  }
  if (typeof takeoffContactTime === "number") {
    metrics.push({ label: "踏切時間", value: `${takeoffContactTime.toFixed(2)} 秒` });
  }
  if (typeof approachSpeed === "number") {
    metrics.push({ label: "助走速度", value: `${approachSpeed.toFixed(1)}`, sub: "体幹長/秒" });
  }

  const handlePlayPause = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play();
      setIsPlaying(true);
    } else {
      video.pause();
      setIsPlaying(false);
    }
  };

  const handleSpeed = (rate: number) => {
    setPlaybackRate(rate);
    if (videoRef.current) videoRef.current.playbackRate = rate;
  };

  const stepFrame = (dir: number) => {
    const video = videoRef.current;
    if (!video) return;
    const next = Math.max(0, Math.min(video.duration || 0, video.currentTime + dir / fps));
    video.currentTime = next;
    setCurrentTime(next);
  };

  if (!videoUrl) {
    return (
      <div style={page}>
        <p style={mutedText}>解析結果がありません。先に「解析」から動画を解析してください。</p>
      </div>
    );
  }

  return (
    <div style={page}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button
            onClick={onBack}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 32,
              height: 32,
              borderRadius: radius.sm,
              border: `1px solid ${colors.border}`,
              background: "#fff",
              cursor: "pointer",
              color: colors.titleText,
            }}
            aria-label="戻る"
          >
            <ChevronLeftIcon size={18} />
          </button>
          <div>
            <h1 style={{ fontSize: 20 }}>解析結果</h1>
            <div style={{ fontSize: 12, color: colors.mutedText }}>
              {videoName}
              {resultTimestamp && ` ・ ${resultTimestamp}`}
            </div>
          </div>
        </div>

        <div className="no-print" style={{ display: "flex", gap: 8 }}>
          <button style={ghostButton} onClick={onSave}>
            <SaveIcon size={14} />
            保存
          </button>
          <button style={ghostButton} onClick={() => window.print()}>
            <PdfIcon size={14} />
            PDF出力
          </button>
          <button style={ghostButton} onClick={onShare}>
            <ShareIcon size={14} />
            共有
          </button>
        </div>
      </div>

      {/* 総合評価 */}
      <div style={{ ...card, marginTop: 20, display: "flex", alignItems: "center", gap: 28, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: colors.bodyText }}>総合スコア</div>
          {formSummary.overallStars !== null && <StarRow stars={formSummary.overallStars} size={20} />}
        </div>

        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
          <span style={{ fontSize: 44, fontWeight: 800, color: colors.titleText, lineHeight: 1 }}>
            {formSummary.overallScore ?? "-"}
          </span>
          <span style={{ fontSize: 16, color: colors.bodyText }}>点</span>
        </div>

        {formSummary.rank && (
          <span
            style={{
              padding: "6px 14px",
              borderRadius: radius.pill,
              background: colors.accent,
              color: "#fff",
              fontWeight: 800,
              fontSize: 13,
            }}
          >
            {formSummary.rank}ランク
          </span>
        )}

        {formSummary.overallScore === null && (
          <p style={mutedText}>選手をトラッキングしてジャンプを検出すると総合評価が表示されます。</p>
        )}
      </div>

      {/* 主要指標 */}
      {metrics.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <h2 style={{ ...sectionTitle, marginBottom: 10 }}>主要指標</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
            {metrics.map((m) => (
              <div key={m.label} style={{ ...card, padding: 14 }}>
                <div style={{ fontSize: 12, color: colors.bodyText, fontWeight: 600 }}>{m.label}</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: colors.titleText, marginTop: 4 }}>
                  {m.value}
                </div>
                {m.sub && <div style={{ fontSize: 11, color: colors.mutedText, marginTop: 2 }}>{m.sub}</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* フォーム評価 + AI改善ポイント */}
      <div
        style={{
          marginTop: 20,
          display: "grid",
          gridTemplateColumns: "minmax(280px, 1.1fr) minmax(280px, 1fr)",
          gap: 16,
        }}
      >
        <div style={card}>
          <h2 style={sectionTitle}>フォーム評価</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 8 }}>
            {formSummary.categories.map((c) => (
              <div key={c.key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <span style={{ fontSize: 13, color: colors.titleText, fontWeight: 600, minWidth: 64 }}>
                  {c.label}
                </span>
                {c.stars !== null ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <StarRow stars={c.stars} />
                    <span style={{ fontSize: 12, color: colors.bodyText, minWidth: 32, textAlign: "right" }}>
                      {c.score}点
                    </span>
                  </div>
                ) : (
                  <span style={{ fontSize: 12, color: colors.mutedText }}>データなし</span>
                )}
              </div>
            ))}
          </div>
        </div>

        <div style={card}>
          <h2 style={sectionTitle}>AI改善ポイント</h2>
          {formSummary.strengths.length === 0 && formSummary.improvements.length === 0 ? (
            <p style={mutedText}>フォーム解析を実行するとAIコメントが表示されます。</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 8 }}>
              {formSummary.improvements.map((item) => (
                <Tip key={item.feature.key} kind="warning" text={item.evaluation.comment} />
              ))}
              {formSummary.strengths.map((item) => (
                <Tip key={item.feature.key} kind="success" text={item.evaluation.comment} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 動画プレーヤー */}
      <div style={{ ...card, marginTop: 20 }}>
        <h2 style={sectionTitle}>動画</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16, marginTop: 8 }}>
          <div>
            <div style={{ fontSize: 12, color: colors.bodyText, marginBottom: 6, fontWeight: 600 }}>元動画</div>
            <video
              ref={videoRef}
              src={videoUrl}
              style={{ width: "100%", borderRadius: radius.md, background: "#000", display: "block" }}
              onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
              onLoadedMetadata={(e) => setCurrentTime(e.currentTarget.currentTime)}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
            />
          </div>
          <div>
            <div style={{ fontSize: 12, color: colors.bodyText, marginBottom: 6, fontWeight: 600 }}>骨格推定</div>
            <TrackingCanvas videoRef={videoRef} frame={currentTrackedFrame} isCropMode={true} showSkeleton={true} />
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
          <button onClick={() => stepFrame(-1)} style={ghostButton} aria-label="1フレーム戻る">
            <StepBackIcon size={14} />
          </button>
          <button onClick={handlePlayPause} style={{ ...primaryButton, padding: "8px 16px" }}>
            {isPlaying ? <PauseIcon size={14} /> : <PlayIcon size={14} />}
          </button>
          <button onClick={() => stepFrame(1)} style={ghostButton} aria-label="1フレーム進む">
            <StepForwardIcon size={14} />
          </button>

          <div style={{ display: "flex", gap: 4, marginLeft: 8 }}>
            {[0.5, 1, 1.5, 2].map((rate) => (
              <button
                key={rate}
                onClick={() => handleSpeed(rate)}
                style={{
                  ...ghostButton,
                  padding: "6px 10px",
                  background: playbackRate === rate ? colors.accentSoft : "#fff",
                  color: playbackRate === rate ? colors.accent : colors.bodyText,
                  borderColor: playbackRate === rate ? colors.accent : colors.border,
                }}
              >
                {rate}x
              </button>
            ))}
          </div>

          <span style={{ marginLeft: "auto", fontSize: 12, color: colors.mutedText }}>
            フレーム：{currentTrackedFrame?.frameIndex ?? Math.round(currentTime * fps)} / 現在時刻：{" "}
            {currentTime.toFixed(2)} 秒
          </span>
        </div>
      </div>
    </div>
  );
}

function Tip({ kind, text }: { kind: "success" | "warning"; text: string }) {
  const color = kind === "success" ? colors.success : colors.warning;
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
      <span style={{ color, flexShrink: 0, marginTop: 1 }}>
        {kind === "success" ? <CheckCircleIcon size={15} /> : <WarnIcon size={15} />}
      </span>
      <span style={{ fontSize: 13, color: colors.titleText, lineHeight: 1.6 }}>{text}</span>
    </div>
  );
}
