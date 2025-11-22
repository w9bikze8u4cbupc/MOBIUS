import { getGenesisProfile } from './genesisProfiles.js';

export const SCENARIOS = {
  YOUTUBE_DEFAULT: {
    id: 'YOUTUBE_DEFAULT',
    label: 'YouTube – Default',
    description: 'Balanced pacing and motion for general audiences.',
    profile: 'DEFAULT',
  },
  ACCESSIBILITY_FIRST: {
    id: 'ACCESSIBILITY_FIRST',
    label: 'Accessibility First',
    description: 'Slower speech, low CPS, reduced motion and extra pauses.',
    profile: 'ACCESSIBLE',
  },
  EXPERT_SPEEDRUN: {
    id: 'EXPERT_SPEEDRUN',
    label: 'Expert – Speedrun',
    description: 'Faster pacing, slightly denser captions, more motion allowed (but governed).',
    profile: 'EXPERT',
  },
  KIDS_GENTLE: {
    id: 'KIDS_GENTLE',
    label: 'Kids – Gentle Mode',
    description: 'Slow narration, minimal motion, light caption density.',
    profile: 'BEGINNER',
  },
};

export function getAvailableScenarios() {
  return Object.values(SCENARIOS);
}

export function resolveScenario(scenarioId) {
  if (scenarioId && SCENARIOS[scenarioId]) {
    return SCENARIOS[scenarioId];
  }
  const envProfile = getGenesisProfile();
  const match = Object.values(SCENARIOS).find((s) => s.profile === envProfile);
  return match || SCENARIOS.YOUTUBE_DEFAULT;
}
