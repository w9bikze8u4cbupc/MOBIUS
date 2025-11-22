import fs from "fs";
import { getGenesisMode } from "../config/genesisConfig.js";
import { getGenesisProfile, getProfileBaseConfig } from "../config/genesisProfiles.js";
import { checkGenesisFeedbackCompat } from "../compat/genesisCompat.js";
import { getGenesisFeedbackPath } from "./genesisFeedback.js";

export function buildRenderConfigForProject(projectId) {
  const mode = getGenesisMode();
  const profile = getGenesisProfile();

  // 1. Base config from profile.
  const baseProfileConfig = getProfileBaseConfig(profile);

  const baseConfig = {
    subtitles: { ...baseProfileConfig.subtitles },
    audio: { ...baseProfileConfig.audio },
    motion: { ...baseProfileConfig.motion },
  };

  // If GENESIS is OFF: just use profile config.
  if (mode === "OFF") {
    return baseConfig;
  }

  // 2. Try to load GENESIS feedback (G6).
  const feedbackPath = getGenesisFeedbackPath(projectId);
  if (!fs.existsSync(feedbackPath)) {
    return baseConfig;
  }

  let feedback;
  try {
    const raw = fs.readFileSync(feedbackPath, "utf8");
    feedback = JSON.parse(raw);
  } catch (err) {
    console.error("Failed to parse GENESIS feedback:", err);
    return baseConfig;
  }

  const compat = checkGenesisFeedbackCompat(feedback);
  const hints = feedback.mobiusHints || {};

  // 3. SHADOW/ADVISORY or incompatible → do not modify config.
  if (mode === "SHADOW" || mode === "ADVISORY" || !compat.compatible) {
    console.log(
      `[GENESIS] Mode=${mode}, profile=${profile}, compatible=${compat.compatible}. Hints not applied.`,
    );
    return baseConfig;
  }

  // 4. ACTIVE + compatible → apply hints on top of profile base.
  try {
    if (hints.targetWpmRange) {
      // Blend profile targetWpm with GENESIS range.
      const profileWpm = baseProfileConfig.audio.targetWpm;
      const hintMid =
        (hints.targetWpmRange.min + hints.targetWpmRange.max) / 2;
      baseConfig.audio.targetWpm = Math.round((profileWpm + hintMid) / 2);
    }

    if (hints.targetCaptionCpsRange) {
      // Clamp profile CPS into GENESIS suggested range.
      const { min, max } = hints.targetCaptionCpsRange;
      baseConfig.subtitles.targetCpsMin = Math.max(
        min,
        baseProfileConfig.subtitles.targetCpsMin,
      );
      baseConfig.subtitles.targetCpsMax = Math.min(
        max,
        baseProfileConfig.subtitles.targetCpsMax,
      );
      if (
        baseConfig.subtitles.targetCpsMin >
        baseConfig.subtitles.targetCpsMax
      ) {
        // fallback: use hint range if intersection is empty
        baseConfig.subtitles.targetCpsMin = min;
        baseConfig.subtitles.targetCpsMax = max;
      }
    }

    if (typeof hints.maxMotionLoad === "number") {
      // Take the *lower* of profile maxMotionLoad and hint to stay safe.
      baseConfig.motion.maxMotionLoad = Math.min(
        baseProfileConfig.motion.maxMotionLoad,
        hints.maxMotionLoad,
      );
    }

    if (hints.suggestLowerDuckingThreshold) {
      // Nudge toward stronger ducking relative to profile.
      baseConfig.audio.duckingThresholdDb =
        baseProfileConfig.audio.duckingThresholdDb - 2;
    }

    if (hints.suggestStrongerPauseCues) {
      baseConfig.audio.insertExtraPauses = true;
    }
  } catch (err) {
    console.error(
      `Failed to apply GENESIS hints for project ${projectId}; falling back to profile config.`,
      err,
    );
    return baseProfileConfig;
  }

  return baseConfig;
}
