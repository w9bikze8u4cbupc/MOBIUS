const allowedProfiles = ['DEFAULT', 'BEGINNER', 'EXPERT', 'ACCESSIBLE'];

const PROFILE_CONFIGS = {
  DEFAULT: {
    subtitles: {
      targetCpsMin: 10,
      targetCpsMax: 20,
    },
    audio: {
      targetWpm: 160,
      duckingThresholdDb: -18,
      insertExtraPauses: false,
    },
    motion: {
      maxMotionLoad: 0.85,
    },
  },
  BEGINNER: {
    subtitles: {
      targetCpsMin: 8,
      targetCpsMax: 16,
    },
    audio: {
      targetWpm: 140,
      duckingThresholdDb: -18,
      insertExtraPauses: true,
    },
    motion: {
      maxMotionLoad: 0.65,
    },
  },
  EXPERT: {
    subtitles: {
      targetCpsMin: 12,
      targetCpsMax: 24,
    },
    audio: {
      targetWpm: 185,
      duckingThresholdDb: -16,
      insertExtraPauses: false,
    },
    motion: {
      maxMotionLoad: 0.95,
    },
  },
  ACCESSIBLE: {
    subtitles: {
      targetCpsMin: 8,
      targetCpsMax: 16,
    },
    audio: {
      targetWpm: 135,
      duckingThresholdDb: -20,
      insertExtraPauses: true,
    },
    motion: {
      maxMotionLoad: 0.55,
    },
  },
};

export function getGenesisProfile() {
  const envProfile = process.env.MOBIUS_GENESIS_PROFILE || 'DEFAULT';
  const normalized = envProfile.toUpperCase();
  return allowedProfiles.includes(normalized) ? normalized : 'DEFAULT';
}

export function getProfileBaseConfig(profile) {
  const normalized = profile ? profile.toUpperCase() : 'DEFAULT';
  const resolved = PROFILE_CONFIGS[normalized] ? normalized : 'DEFAULT';
  const selected = PROFILE_CONFIGS[resolved];
  return {
    subtitles: { ...selected.subtitles },
    audio: { ...selected.audio },
    motion: { ...selected.motion },
  };
}

export const GENESIS_PROFILE_CONFIGS = PROFILE_CONFIGS;
