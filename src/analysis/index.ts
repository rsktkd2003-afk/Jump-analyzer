import type { AnalysisResult, SkillDefinition, SkillId } from "./types";
import type { TrackedFrame } from "../ai/poseAnalyzer";
import { spikeJumpDefinition } from "./skills/spikeJump";

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
  skillId: SkillId
): AnalysisResult {
  const definition = skillDefinitions[skillId];
  const segments = definition.segment(frames);
  const features = definition.extract(frames, segments);

  return {
    skillId,
    segments,
    features,
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