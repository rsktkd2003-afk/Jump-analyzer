import type { AnalysisResult, SkillDefinition, SkillId } from "./types";
import type { TrackedFrame } from "../ai/poseAnalyzer";
import type { PersonTrackerStats } from "../ai/poseTypes";
import { spikeJumpDefinition } from "./skills/spikeJump";
import { deriveQualitySignalsFromFrames } from "../ai/trackingQualitySignals";
import { ENABLE_CONFIDENCE_V2 } from "../ai/featureFlags";

const stubDefinition = (id: SkillId): SkillDefinition => ({
  id,
  segment: () => [],
  extract: () => [],
});

const skillDefinitions: Record<SkillId, SkillDefinition> = {
  spikeJump: spikeJumpDefinition,
  receive: stubDefinition("receive"),
  block: stubDefinition("block"),
};

export function analyze(
  frames: TrackedFrame[],
  skillId: SkillId,
  trackerStats?: PersonTrackerStats
): AnalysisResult {
  const definition = skillDefinitions[skillId];
  const segments = definition.segment(frames);
  const features = definition.extract(frames, segments);

  return {
    skillId,
    segments,
    features,
    qualitySignals: ENABLE_CONFIDENCE_V2
      ? deriveQualitySignalsFromFrames(frames, trackerStats)
      : undefined,
  };
}

export type {
  AnalysisResult,
  Feature,
  FeatureUnit,
  Phase,
  PhaseSegment,
  Region,
  SkillDefinition,
  SkillId,
} from "./types";