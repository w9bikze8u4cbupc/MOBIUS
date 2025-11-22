const RAW_PROFILE = process.env.MOBIUS_GENESIS_PROFILE || "DEFAULT";

const ALLOWED = ["DEFAULT", "BEGINNER", "EXPERT", "ACCESSIBLE"];

export function getGenesisProfile() {
  const upper = RAW_PROFILE.toUpperCase();
  return ALLOWED.includes(upper) ? upper : "DEFAULT";
}

/**
 * Base tuning per profile.
 * These are *starting points* for the pipeline; GENESIS hints then nudge them.
 */
export function getProfileBaseConfig(profile) {
  switch (profile) {
    case "BEGINNER":
      return {
        subtitles: {
          targetCpsMin: 8,
          targetCpsMax: 16,
        },
        audio: {
          targetWpm: 130,
          duckingThresholdDb: -20,
          insertExtraPauses: true,
        },
        motion: {
          maxMotionLoad: 0.6,
        },
      };
    case "EXPERT":
      return {
        subtitles: {
          targetCpsMin: 12,
          targetCpsMax: 24,
        },
        audio: {
          targetWpm: 180,
          duckingThresholdDb: -16,
          insertExtraPauses: false,
        },
        motion: {
          maxMotionLoad: 0.9,
        },
      };
    case "ACCESSIBLE":
      return {
        subtitles: {
          targetCpsMin: 6,
          targetCpsMax: 14,
        },
        audio: {
          targetWpm: 120,
          duckingThresholdDb: -22,
          insertExtraPauses: true,
        },
        motion: {
          maxMotionLoad: 0.5,
        },
      };
    case "DEFAULT":
    default:
      return {
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
      };
  }
}
