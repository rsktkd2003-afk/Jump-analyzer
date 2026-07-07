import type { TrackedFrame } from "./trackingAnalyzer";

export type MotionFeatures = {
  horizontalMove: number;
  verticalMove: number;
  horizontalDrift: number;
  kneeRange: number;
  hipRange: number;
  elbowRange: number;
};

export type MotionComparison = {
  user: MotionFeatures;
  reference: MotionFeatures;
  differences: MotionFeatures;
  comments: string[];
};

export function compareMotion(
  userFrames: TrackedFrame[],
  referenceFrames: TrackedFrame[]
): MotionComparison | null {
  const user = extractMotionFeatures(userFrames);
  const reference = extractMotionFeatures(referenceFrames);

  if (!user || !reference) return null;

  const differences: MotionFeatures = {
    horizontalMove: user.horizontalMove - reference.horizontalMove,
    verticalMove: user.verticalMove - reference.verticalMove,
    horizontalDrift: user.horizontalDrift - reference.horizontalDrift,
    kneeRange: user.kneeRange - reference.kneeRange,
    hipRange: user.hipRange - reference.hipRange,
    elbowRange: user.elbowRange - reference.elbowRange,
  };

  return {
    user,
    reference,
    differences,
    comments: createComparisonComments(differences),
  };
}

function extractMotionFeatures(frames: TrackedFrame[]): MotionFeatures | null {
  if (frames.length < 2) return null;

  const xs = frames.map((f) => f.centerX);
  const ys = frames.map((f) => f.centerY);

  return {
    horizontalMove: Math.max(...xs) - Math.min(...xs),
    verticalMove: Math.max(...ys) - Math.min(...ys),
    horizontalDrift: frames[frames.length - 1].centerX - frames[0].centerX,
    kneeRange: range(
      frames.map((f) => averageNullable(f.leftKneeAngle, f.rightKneeAngle))
    ),
    hipRange: range(
      frames.map((f) => averageNullable(f.leftHipAngle, f.rightHipAngle))
    ),
    elbowRange: range(
      frames.map((f) => averageNullable(f.leftElbowAngle, f.rightElbowAngle))
    ),
  };
}

function createComparisonComments(diff: MotionFeatures) {
  const comments: string[] = [];

  if (Math.abs(diff.horizontalMove) > 30) {
    comments.push(
      diff.horizontalMove > 0
        ? "自分の方が左右方向の移動量が大きいです。"
        : "参考動画の方が左右方向の移動量が大きいです。"
    );
  }

  if (Math.abs(diff.horizontalDrift) > 30) {
    comments.push(
      diff.horizontalDrift > 0
        ? "自分の方が開始位置から終了位置までの横ズレが大きいです。"
        : "参考動画の方が開始位置から終了位置までの横ズレが大きいです。"
    );
  }

  if (Math.abs(diff.kneeRange) > 15) {
    comments.push(
      diff.kneeRange > 0
        ? "自分の方が膝角度の変化量が大きいです。"
        : "参考動画の方が膝角度の変化量が大きいです。"
    );
  }

  if (Math.abs(diff.hipRange) > 15) {
    comments.push(
      diff.hipRange > 0
        ? "自分の方が股関節角度の変化量が大きいです。"
        : "参考動画の方が股関節角度の変化量が大きいです。"
    );
  }

  if (Math.abs(diff.elbowRange) > 20) {
    comments.push(
      diff.elbowRange > 0
        ? "自分の方が肘角度の変化量が大きいです。"
        : "参考動画の方が肘角度の変化量が大きいです。"
    );
  }

  if (comments.length === 0) {
    comments.push("大きな差分は少なめです。");
  }

  return comments;
}

function averageNullable(a: number | null, b: number | null) {
  if (a === null && b === null) return null;
  if (a === null) return b;
  if (b === null) return a;
  return (a + b) / 2;
}

function range(values: Array<number | null>) {
  const valid = values.filter((v): v is number => v !== null);
  if (valid.length < 2) return 0;
  return Math.max(...valid) - Math.min(...valid);
}