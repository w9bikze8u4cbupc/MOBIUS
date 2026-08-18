import React from 'react';
import { AbsoluteFill, Audio, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { TransitionSeries, linearTiming } from '@remotion/transitions';
import { slide } from '@remotion/transitions/slide';
import { MediaGallery } from './components/MediaGallery';
import { NarrationText } from './components/NarrationText';
import { SceneTitle } from './components/SceneTitle';
import { StepBadge } from './components/StepBadge';

const FALLBACK_BORDER_COLOR = '#E91E63';
export const TIMELINE_TRANSITION_DURATION_IN_FRAMES = 18;

const clamp = {
  extrapolateLeft: 'clamp',
  extrapolateRight: 'clamp',
};

const resolveSceneDuration = (scene, fallbackDurationInFrames) => (
  Number.isInteger(scene?.durationInFrames) && scene.durationInFrames > 0
    ? scene.durationInFrames
    : fallbackDurationInFrames
);

const getTransitionDuration = (previousScene, nextScene, fallbackDurationInFrames) => {
  const maxOverlap = Math.min(
    TIMELINE_TRANSITION_DURATION_IN_FRAMES,
    resolveSceneDuration(previousScene, fallbackDurationInFrames) - 1,
    resolveSceneDuration(nextScene, fallbackDurationInFrames) - 1,
  );
  return Math.max(0, maxOverlap);
};

/** Calculates a TransitionSeries duration, including overlapping scene changes. */
export const getMobiusTimelineDuration = (scenes, fallbackDurationInFrames = 150) => {
  if (!Array.isArray(scenes) || scenes.length === 0) {
    return fallbackDurationInFrames;
  }

  return scenes.reduce((total, scene, index) => {
    const sceneDuration = resolveSceneDuration(scene, fallbackDurationInFrames);
    const overlap = index === 0
      ? 0
      : getTransitionDuration(scenes[index - 1], scene, fallbackDurationInFrames);
    return total + sceneDuration - overlap;
  }, 0);
};

const resolveImageUrls = (imageUrls, imageUrl) => {
  if (Array.isArray(imageUrls) && imageUrls.length > 0) {
    return imageUrls;
  }

  return imageUrl ? [imageUrl] : [];
};

/**
 * Renders one deterministic MOBIUS tutorial scene. The typography deliberately
 * exceeds 96px for titles and 64px for narration at every supported resolution.
 */
export const MobiusComposition = ({
  narrationText,
  imageUrl,
  imageUrls,
  sectionTitle,
  visualOverlayText,
  stepNumber = 1,
  themeBorderColor = FALLBACK_BORDER_COLOR,
  audioFile,
  backgroundMusicFile,
  backgroundMusicVolume = 0.12,
  backgroundMusicStartFrom = 0,
}) => {
  const frame = useCurrentFrame();
  const { fps, height, width } = useVideoConfig();
  const borderWidth = Math.max(16, Math.round(Math.min(width, height) * 0.014));
  const padding = Math.max(56, Math.round(width * 0.045));
  const gap = Math.max(40, Math.round(width * 0.035));
  const borderEntrance = spring({
    fps,
    frame,
    config: { damping: 17, mass: 0.8, stiffness: 120 },
  });
  const borderOpacity = interpolate(borderEntrance, [0, 1], [0, 1], clamp);
  const borderScale = interpolate(borderEntrance, [0, 1], [0.975, 1], clamp);
  const backgroundShift = interpolate(frame, [0, Math.max(1, fps * 5)], [0, 1], clamp);
  const resolvedImageUrls = resolveImageUrls(imageUrls, imageUrl);

  return (
    <AbsoluteFill
      style={{
        backgroundColor: '#101827',
        backgroundImage: `linear-gradient(${125 + (backgroundShift * 16)}deg, #101827 0%, #172554 100%)`,
        color: '#f8fafc',
        fontFamily: 'Nunito, Arial, sans-serif',
        overflow: 'hidden',
      }}
    >
      <AbsoluteFill
        style={{
          border: `${borderWidth}px solid ${themeBorderColor}`,
          boxSizing: 'border-box',
          opacity: borderOpacity,
          padding,
          transform: `scale(${borderScale})`,
        }}
      >
        <div
          style={{
            display: 'flex',
            gap,
            height: '100%',
            width: '100%',
          }}
        >
          <section
            style={{
              display: 'flex',
              flex: '1.08 1 0',
              flexDirection: 'column',
              justifyContent: 'center',
              minWidth: 0,
              paddingRight: Math.round(width * 0.01),
            }}
          >
            <StepBadge color={themeBorderColor} stepNumber={stepNumber} />
            <div style={{ marginTop: Math.max(28, Math.round(height * 0.025)) }}>
              <SceneTitle color={themeBorderColor}>{sectionTitle}</SceneTitle>
              {visualOverlayText ? (
                <p style={{ color: themeBorderColor, fontSize: Math.max(28, Math.round(width * 0.022)), fontWeight: 700, margin: '18px 0 0' }}>
                  {visualOverlayText}
                </p>
              ) : null}
              <NarrationText>{narrationText}</NarrationText>
            </div>
          </section>
          <MediaGallery imageUrls={resolvedImageUrls} label={sectionTitle} />
        </div>
      </AbsoluteFill>
      {backgroundMusicFile ? (
        <Audio
          src={backgroundMusicFile}
          volume={backgroundMusicVolume}
          startFrom={backgroundMusicStartFrom}
          loop
        />
      ) : null}
      {audioFile ? <Audio src={audioFile} /> : null}
    </AbsoluteFill>
  );
};

/**
 * A transition-enabled multi-scene composition. The separate scene composition
 * remains available for the renderer's existing one-MP4-per-scene contract.
 */
export const MobiusTutorialTimeline = ({ scenes = [], fallbackDurationInFrames = 150 }) => {
  const safeScenes = Array.isArray(scenes) && scenes.length > 0 ? scenes : [];
  const children = [];

  safeScenes.forEach((scene, index) => {
    const previousScene = safeScenes[index - 1];
    const transitionDuration = index === 0
      ? 0
      : getTransitionDuration(previousScene, scene, fallbackDurationInFrames);

    if (transitionDuration > 0) {
      children.push(
        <TransitionSeries.Transition
          key={`transition-${index}`}
          presentation={slide({ direction: 'from-right' })}
          timing={linearTiming({ durationInFrames: transitionDuration })}
        />,
      );
    }

    children.push(
      <TransitionSeries.Sequence
        key={`scene-${scene.id || index}`}
        durationInFrames={resolveSceneDuration(scene, fallbackDurationInFrames)}
        name={scene.sectionTitle || `Scene ${index + 1}`}
      >
        <MobiusComposition {...scene} stepNumber={scene.stepNumber ?? index + 1} />
      </TransitionSeries.Sequence>,
    );
  });

  return <TransitionSeries>{children}</TransitionSeries>;
};

export default MobiusComposition;
