import fs from 'fs';
import { getGenesisFeedbackPath } from './genesisFeedback.js';
import { getGenesisMode } from '../config/genesisConfig.js';
import { checkGenesisFeedbackCompat } from '../compat/genesisCompat.js';

export function buildRenderConfigForProject(projectId) {
  const baseConfig = {
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

  const mode = getGenesisMode();
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
      `[GENESIS] Mode=${mode}, compatible=${compat.compatible}. Hints available but not applied.`,
    );
    return baseConfig;
  }

  try {
    if (hints.targetWpmRange) {
      baseConfig.audio.targetWpm =
        (hints.targetWpmRange.min + hints.targetWpmRange.max) / 2;
    }
    if (hints.targetCaptionCpsRange) {
      baseConfig.subtitles.targetCpsMin = hints.targetCaptionCpsRange.min;
      baseConfig.subtitles.targetCpsMax = hints.targetCaptionCpsRange.max;
    }
    if (typeof hints.maxMotionLoad === 'number') {
      baseConfig.motion.maxMotionLoad = hints.maxMotionLoad;
    }
    if (hints.suggestLowerDuckingThreshold) {
      baseConfig.audio.duckingThresholdDb = -21;
    }
    if (hints.suggestStrongerPauseCues) {
      baseConfig.audio.insertExtraPauses = true;
    }
  } catch (err) {
    console.error('Failed to apply GENESIS hints; falling back to base config.', err);
    return baseConfig;
  }

  return baseConfig;
}
