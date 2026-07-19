import type { TrackedFrame } from "../ai/poseAnalyzer";
import type { ConfidenceQualitySignals } from "../ai/trackingQualitySignals";

export type Phase =
  | "approach"
  | "takeoff"
  | "ascent"
  | "peak"
  | "contact"
  | "descent"
  | "landing"
  | "finish";

export type SkillId = "spikeJump" | "receive" | "block";

export type Region =
  | "centerOfMass"
  | "lowerBody"
  | "trunk"
  | "arm"
  | "symmetry";

export type FeatureUnit =
  | "deg"
  | "ratio"
  | "sec"
  | "normPx"
  | "degPerSec"
  | "normPxPerSec";

export type Feature = {
  key: string;
  label: string;
  phase: Phase;
  region: Region;
  value: number;
  unit: FeatureUnit;
  confidence: number;
  descriptor?: string;
};

export type PhaseSegment = {
  phase: Phase;
  startTime: number;
  endTime: number;
  startFrame: number;
  endFrame: number;
};

export type SkillDefinition = {
  id: SkillId;
  segment: (frames: TrackedFrame[]) => PhaseSegment[];
  extract: (frames: TrackedFrame[], segments: PhaseSegment[]) => Feature[];
};

export type AnalysisResult = {
  skillId: SkillId;
  segments: PhaseSegment[];
  features: Feature[];
  /** 信頼度算出v2（Phase1）向けの品質シグナル。Feature Flag OFF時はundefined */
  qualitySignals?: ConfidenceQualitySignals;
};