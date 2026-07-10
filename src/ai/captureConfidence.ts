import type { CaptureSettings } from "./captureSettings";
import type { EvaluationCategoryId } from "./spikeFormEvaluation";

type ConfidenceTable = {
  category?: Partial<Record<EvaluationCategoryId, number>>;
  metric?: Record<string, number>;
};

const CAMERA_VIEW_CONFIDENCE: Record<CaptureSettings["cameraView"], ConfidenceTable> = {
  side: {
    category: {
      approach: 1.12,
      takeoff: 1.08,
      flight: 1.12,
      hit: 1.08,
      airPosture: 1.08,
      landing: 0.9,
    },
    metric: {
      approachSpeed: 1.15,
      peakHeight: 1.15,
      efficiencyPeakHeight: 1.15,
      hitHeightGap: 1.12,
      trunkTilt: 1.12,
      airTrunkAngle: 1.12,
      kneeValgus: 0.75,
      landingSymmetry: 0.8,
      landingTimingDiff: 0.85,
    },
  },

  front: {
    category: {
      takeoff: 1.08,
      landing: 1.12,
      approach: 0.85,
      flight: 0.9,
    },
    metric: {
      kneeValgus: 1.18,
      landingSymmetry: 1.18,
      landingTimingDiff: 1.15,
      approachSpeed: 0.75,
      peakHeight: 0.85,
      efficiencyPeakHeight: 0.85,
      landingForwardMove: 0.8,
    },
  },

  back: {
    category: {
      landing: 1.12,
      airPosture: 1.08,
      takeback: 1.05,
      hit: 0.9,
      approach: 0.85,
    },
    metric: {
      landingSymmetry: 1.15,
      landingTimingDiff: 1.15,
      thoraxRotation: 1.12,
      pelvisRotation: 1.12,
      hitHeightGap: 0.85,
      approachSpeed: 0.8,
    },
  },

  frontDiagonal: {
    category: {
      approach: 0.95,
      takeoff: 0.95,
      flight: 0.95,
      takeback: 0.95,
      hit: 0.95,
      airPosture: 0.95,
      followThrough: 0.95,
      landing: 0.95,
      efficiency: 0.95,
    },
  },

  backDiagonal: {
    category: {
      approach: 0.95,
      takeoff: 0.95,
      flight: 0.95,
      takeback: 0.95,
      hit: 0.95,
      airPosture: 0.95,
      followThrough: 0.95,
      landing: 0.95,
      efficiency: 0.95,
    },
  },

  unknown: {
    category: {
      approach: 0.92,
      takeoff: 0.92,
      flight: 0.92,
      takeback: 0.92,
      hit: 0.92,
      airPosture: 0.92,
      followThrough: 0.92,
      landing: 0.92,
      efficiency: 0.92,
    },
  },
};

const FRAMING_CONFIDENCE: Record<CaptureSettings["framing"], number> = {
  close: 1.04,
  normal: 1.08,
  wide: 0.92,
  far: 0.78,
  unknown: 0.94,
};

const DISTANCE_CONFIDENCE: Record<CaptureSettings["distance"], number> = {
  near: 1.03,
  normal: 1.06,
  far: 0.82,
  unknown: 0.94,
};

export function getCaptureConfidenceFactor(args: {
  settings: CaptureSettings;
  category: EvaluationCategoryId;
  metricId: string;
}): number {
  const { settings, category, metricId } = args;

  const viewTable = CAMERA_VIEW_CONFIDENCE[settings.cameraView];

  const viewCategoryFactor = viewTable.category?.[category] ?? 1;
  const viewMetricFactor = viewTable.metric?.[metricId] ?? 1;
  const framingFactor = FRAMING_CONFIDENCE[settings.framing];
  const distanceFactor = DISTANCE_CONFIDENCE[settings.distance];

  const factor =
    viewCategoryFactor *
    viewMetricFactor *
    framingFactor *
    distanceFactor;

  return Math.max(0.35, Math.min(1.2, factor));
}