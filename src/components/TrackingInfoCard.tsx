import type { TrackedFrame } from "../ai/poseAnalyzer";

type Props = {
  frame: TrackedFrame | null;
};

export default function TrackingInfoCard({ frame }: Props) {
  if (!frame) return null;

  const featureComment = createFeatureComment(frame);

  return (
    <div
      style={{
        marginTop: 12,
        padding: 16,
        borderRadius: 12,
        background: "#f3f3f3",
        fontSize: 14,
        lineHeight: 1.8,
      }}
    >
      <h3 style={{ marginTop: 0 }}>現在フレーム解析</h3>

      <div>フレーム：{frame.frameIndex} F</div>

      <hr />

      <strong>関節角度</strong>

      <div>左膝：{formatAngle(frame.leftKneeAngle)}</div>
      <div>右膝：{formatAngle(frame.rightKneeAngle)}</div>

      <div>左股関節：{formatAngle(frame.leftHipAngle)}</div>
      <div>右股関節：{formatAngle(frame.rightHipAngle)}</div>

      <div>左肩：{formatAngle(frame.leftShoulderAngle)}</div>
      <div>右肩：{formatAngle(frame.rightShoulderAngle)}</div>

      <div>左肘：{formatAngle(frame.leftElbowAngle)}</div>
      <div>右肘：{formatAngle(frame.rightElbowAngle)}</div>

      <div>肩の傾き：{formatAngle(frame.shoulderTilt)}</div>

      <hr />

      <strong>フォーム特徴</strong>

      <div>{featureComment}</div>
    </div>
  );
}

function createFeatureComment(frame: TrackedFrame) {
  const comments: string[] = [];

  if (
    frame.leftKneeAngle !== null &&
    frame.rightKneeAngle !== null
  ) {
    const diff = Math.abs(
      frame.leftKneeAngle - frame.rightKneeAngle
    );

    if (diff > 20) {
      comments.push("左右の膝角度に差があります。");
    } else {
      comments.push("左右の膝角度は近いです。");
    }
  }

  if (
    frame.leftHipAngle !== null &&
    frame.rightHipAngle !== null
  ) {
    const diff = Math.abs(
      frame.leftHipAngle - frame.rightHipAngle
    );

    if (diff > 15) {
      comments.push("左右の股関節の使い方に差があります。");
    }
  }

  if (frame.shoulderTilt !== null) {
    if (Math.abs(frame.shoulderTilt) > 10) {
      comments.push("肩の傾きが大きめです。");
    } else {
      comments.push("肩の傾きは小さめです。");
    }
  }

  if (
    frame.leftElbowAngle !== null &&
    frame.rightElbowAngle !== null
  ) {
    const diff = Math.abs(
      frame.leftElbowAngle - frame.rightElbowAngle
    );

    if (diff > 20) {
      comments.push("左右の腕の使い方に差があります。");
    }
  }

  if (comments.length === 0) {
    comments.push("大きな特徴は見られませんでした。");
  }

  return comments.join(" ");
}

function formatAngle(value: number | null) {
  if (value === null) return "-";
  return `${value.toFixed(1)}°`;
}