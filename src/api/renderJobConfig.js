import fs from 'fs';
import { getGenesisMode } from '../config/genesisConfig.js';
import { getProfileBaseConfig } from '../config/genesisProfiles.js';
import { getGenesisFeedbackPath } from './genesisFeedback.js';
import { checkGenesisFeedbackCompat } from '../compat/genesisCompat.js';
import { loadProjectScenario } from './genesisScenario.js';

export function buildRenderConfigForProject(projectId) {
  const mode = getGenesisMode();

  const { scenarioId, scenario } = loadProjectScenario(projectId);
  const profile = scenario.profile;

  const baseProfileConfig = getProfileBaseConfig(profile);
  const baseConfig = {
    subtitles: { ...baseProfileConfig.subtitles },
    audio: { ...baseProfileConfig.audio },
    motion: { ...baseProfileConfig.motion },
  };

  if (mode === 'OFF') {
    return baseConfig;
  }

  const feedbackPath = getGenesisFeedbackPath(projectId);
  if (!fs.existsSync(feedbackPath)) {
    return baseConfig;
  }

  let feedback;
  try {
    const raw = fs.readFileSync(feedbackPath, 'utf8');
    feedback = JSON.parse(raw);
  } catch (err) {
    console.error('Failed to parse GENESIS feedback:', err);
    return baseConfig;
  }

  const compat = checkGenesisFeedbackCompat(feedback);
  const hints = feedback.mobiusHints || {};

  if (mode === 'SHADOW' || mode === 'ADVISORY' || !compat.compatible) {
    console.log(
      `[GENESIS] Mode=${mode}, scenario=${scenarioId}, profile=${profile}, compatible=${compat.compatible}. Hints not applied.`,
    );
    return baseConfig;
  }

  try {
    if (hints.targetWpmRange) {
      const profileWpm = baseProfileConfig.audio.targetWpm;
      const hintMid = (hints.targetWpmRange.min + hints.targetWpmRange.max) / 2;
      baseConfig.audio.targetWpm = Math.round((profileWpm + hintMid) / 2);
    }

    if (hints.targetCaptionCpsRange) {
      const { min, max } = hints.targetCaptionCpsRange;
      baseConfig.subtitles.targetCpsMin = Math.max(
        min,
        baseProfileConfig.subtitles.targetCpsMin,
      );
      baseConfig.subtitles.targetCpsMax = Math.min(
        max,
        baseProfileConfig.subtitles.targetCpsMax,
      );
      if (baseConfig.subtitles.targetCpsMin > baseConfig.subtitles.targetCpsMax) {
        baseConfig.subtitles.targetCpsMin = min;
        baseConfig.subtitles.targetCpsMax = max;
      }
    }

    if (typeof hints.maxMotionLoad === 'number') {
      baseConfig.motion.maxMotionLoad = Math.min(
        baseProfileConfig.motion.maxMotionLoad,
        hints.maxMotionLoad,
      );
    }

    if (hints.suggestLowerDuckingThreshold) {
      baseConfig.audio.duckingThresholdDb =
        baseProfileConfig.audio.duckingThresholdDb - 2;
    }

    if (hints.suggestStrongerPauseCues) {
      baseConfig.audio.insertExtraPauses = true;
    }
  } catch (err) {
    console.error(
      `Failed to apply GENESIS hints for project ${projectId}; falling back to scenario profile config.`,
      err,
    );
    return baseProfileConfig;
  }

  return baseConfig;
}
