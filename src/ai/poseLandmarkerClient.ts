// =============================================================
// MediaPipe PoseLandmarker の初期化とシングルトン管理。
// Promise自体をキャッシュすることで、同時呼び出し時の二重初期化を防ぐ。
// =============================================================

import {
  FilesetResolver,
  PoseLandmarker,
} from "@mediapipe/tasks-vision";

// オフライン動作のため、WASMとモデルはCDN/外部ストレージではなく
// public/ 配下にローカル配置したものを読み込む。
// import.meta.env.BASE_URL を使うことで、デプロイ先のルートパスに依存しない。
const VISION_WASM_URL = `${import.meta.env.BASE_URL}mediapipe/wasm`;

const POSE_MODEL_URL = `${import.meta.env.BASE_URL}models/pose_landmarker_full.task`;

// 複数人物対応で追跡人数を増やす場合はここを変更する
const MAX_DETECTABLE_POSES = 4;
const MIN_POSE_DETECTION_CONFIDENCE = 0.7;
const MIN_POSE_PRESENCE_CONFIDENCE = 0.7;
const MIN_TRACKING_CONFIDENCE = 0.8;

let landmarkerPromise: Promise<PoseLandmarker> | null = null;

async function createPoseLandmarker(): Promise<PoseLandmarker> {
  const vision = await FilesetResolver.forVisionTasks(VISION_WASM_URL);

  return PoseLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: POSE_MODEL_URL,
      delegate: "GPU",
    },
    runningMode: "VIDEO",
    numPoses: MAX_DETECTABLE_POSES,
    minPoseDetectionConfidence: MIN_POSE_DETECTION_CONFIDENCE,
    minPosePresenceConfidence: MIN_POSE_PRESENCE_CONFIDENCE,
    minTrackingConfidence: MIN_TRACKING_CONFIDENCE,
    outputSegmentationMasks: false,
  });
}

export function getPoseLandmarker(): Promise<PoseLandmarker> {
  if (!landmarkerPromise) {
    landmarkerPromise = createPoseLandmarker();
  }

  return landmarkerPromise;
}