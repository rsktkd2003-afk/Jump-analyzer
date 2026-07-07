import { useMemo, useRef, useState } from "react";
import {
  analyzeTrackedMotion,
  type TrackedFrame,
} from "../ai/trackingAnalyzer";
import { compareMotion } from "../ai/comparisonAnalyzer";

type Props = {
  userFrames: TrackedFrame[];
  fps: number;
};

export default function ReferenceComparisonPanel({ userFrames, fps }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoName, setVideoName] = useState("");
  const [referenceFrames, setReferenceFrames] = useState<TrackedFrame[]>([]);
  const [message, setMessage] = useState("");
  const [progress, setProgress] = useState(0);
  const [isTracking, setIsTracking] = useState(false);

  const comparison = useMemo(
    () => compareMotion(userFrames, referenceFrames),
    [userFrames, referenceFrames]
  );

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (videoUrl) {
      URL.revokeObjectURL(videoUrl);
    }

    setVideoUrl(URL.createObjectURL(file));
    setVideoName(file.name);
    setReferenceFrames([]);
    setMessage("");
    setProgress(0);
  };

  const runReferenceTracking = async () => {
    const video = videoRef.current;
    if (!video) return;

    setIsTracking(true);
    setMessage("参考動画をトラッキング中...");
    setProgress(0);

    try {
      const result = await analyzeTrackedMotion(video, fps, setProgress, null);
      setReferenceFrames(result.frames);
      setMessage(result.message);
    } catch (error) {
      console.error(error);
      setMessage("参考動画のトラッキング中にエラーが発生しました。");
    } finally {
      setIsTracking(false);
    }
  };

  return (
    <section style={panelStyle}>
      <h2 style={{ marginTop: 0 }}>参考動画との比較</h2>

      <p style={hintStyle}>
        参考動画を読み込んでトラッキングすると、自分の動画との差分を表示します。
        良し悪しではなく、動作の違いを表示します。
      </p>

      <input type="file" accept="video/*" onChange={handleUpload} />

      {videoUrl && (
        <>
          <p style={{ fontSize: 14 }}>{videoName}</p>

          <video
            ref={videoRef}
            src={videoUrl}
            controls
            playsInline
            style={{
              width: "100%",
              borderRadius: 12,
              background: "#000",
              marginTop: 8,
            }}
          />

          <button
            onClick={runReferenceTracking}
            disabled={isTracking}
            style={{ ...buttonStyle, width: "100%" }}
          >
            {isTracking ? "解析中..." : "参考動画をトラッキング"}
          </button>

          {message && <p style={{ fontSize: 14 }}>{message}</p>}

          {isTracking && <p style={{ fontSize: 14 }}>進捗：{progress}%</p>}
        </>
      )}

      {comparison && (
        <div style={resultStyle}>
          <h3 style={{ marginTop: 0 }}>差分</h3>

          <CompareRow
            label="左右移動"
            user={comparison.user.horizontalMove}
            reference={comparison.reference.horizontalMove}
            diff={comparison.differences.horizontalMove}
            unit="px"
          />

          <CompareRow
            label="上下移動"
            user={comparison.user.verticalMove}
            reference={comparison.reference.verticalMove}
            diff={comparison.differences.verticalMove}
            unit="px"
          />

          <CompareRow
            label="横ズレ"
            user={comparison.user.horizontalDrift}
            reference={comparison.reference.horizontalDrift}
            diff={comparison.differences.horizontalDrift}
            unit="px"
          />

          <CompareRow
            label="膝角度変化"
            user={comparison.user.kneeRange}
            reference={comparison.reference.kneeRange}
            diff={comparison.differences.kneeRange}
            unit="°"
          />

          <CompareRow
            label="股関節角度変化"
            user={comparison.user.hipRange}
            reference={comparison.reference.hipRange}
            diff={comparison.differences.hipRange}
            unit="°"
          />

          <CompareRow
            label="肘角度変化"
            user={comparison.user.elbowRange}
            reference={comparison.reference.elbowRange}
            diff={comparison.differences.elbowRange}
            unit="°"
          />

          <hr />

          <strong>動作の違い</strong>

          <ul>
            {comparison.comments.map((comment, index) => (
              <li key={index}>{comment}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

type CompareRowProps = {
  label: string;
  user: number;
  reference: number;
  diff: number;
  unit: string;
};

function CompareRow({ label, user, reference, diff, unit }: CompareRowProps) {
  return (
    <div style={rowStyle}>
      <div style={{ fontWeight: 700 }}>{label}</div>
      <div>自分：{user.toFixed(1)}{unit}</div>
      <div>参考：{reference.toFixed(1)}{unit}</div>
      <div>差分：{diff > 0 ? "+" : ""}{diff.toFixed(1)}{unit}</div>
    </div>
  );
}

const panelStyle: React.CSSProperties = {
  marginTop: 16,
  padding: 16,
  borderRadius: 12,
  background: "#f7f7f7",
  border: "1px solid #ddd",
};

const hintStyle: React.CSSProperties = {
  fontSize: 13,
  color: "#666",
  lineHeight: 1.6,
};

const buttonStyle: React.CSSProperties = {
  padding: 12,
  borderRadius: 12,
  border: "1px solid #ccc",
  background: "#fff",
  fontSize: 15,
  marginTop: 8,
};

const resultStyle: React.CSSProperties = {
  marginTop: 12,
  padding: 12,
  borderRadius: 12,
  background: "#fff",
  border: "1px solid #ddd",
  fontSize: 14,
  lineHeight: 1.7,
};

const rowStyle: React.CSSProperties = {
  padding: "8px 0",
  borderBottom: "1px solid #eee",
};