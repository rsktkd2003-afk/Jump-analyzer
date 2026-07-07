import type { TrackedFrame } from "../ai/poseAnalyzer";

export type Phase =
  | "approach"
  | "takeoff"
  | "ascent"
  | "peak"
  | "contact"
  | "landing";

export type SkillId = "spikeJump" | "receive" | "block";

export type Region =
  | "centerOfMass"
  | "lowerBody"
  | "trunk"
  | "arm"
  | "symmetry";

export type FeatureUnit = "deg" | "ratio" | "sec" | "normPx";

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
};