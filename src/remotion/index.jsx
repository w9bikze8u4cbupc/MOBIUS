import React from 'react';
import { Composition, registerRoot } from 'remotion';
import {
  getMobiusTimelineDuration,
  MobiusComposition,
  MobiusTutorialTimeline,
} from './MobiusComposition';

export const MOBIUS_COMPOSITION_ID = 'MobiusTutorialScene';
export const MOBIUS_TIMELINE_COMPOSITION_ID = 'MobiusTutorialTimeline';
export const DEFAULT_DURATION_IN_FRAMES = 150;

const getDurationInFrames = (durationInFrames) => (
  Number.isInteger(durationInFrames) && durationInFrames > 0
    ? durationInFrames
    : DEFAULT_DURATION_IN_FRAMES
);

const defaultSceneProps = {
  narrationText: 'Tutorial narration',
  imageUrl: '',
  imageUrls: [],
  sectionTitle: 'Tutorial section',
  stepNumber: 1,
  themeBorderColor: '#E91E63',
  durationInFrames: DEFAULT_DURATION_IN_FRAMES,
};

const timelineDefaultProps = {
  scenes: [defaultSceneProps],
  fallbackDurationInFrames: DEFAULT_DURATION_IN_FRAMES,
};

export const RemotionRoot = () => (
  <>
    <Composition
      id={MOBIUS_COMPOSITION_ID}
      component={MobiusComposition}
      width={1920}
      height={1080}
      fps={30}
      durationInFrames={DEFAULT_DURATION_IN_FRAMES}
      defaultProps={defaultSceneProps}
      calculateMetadata={({ props }) => ({
        durationInFrames: getDurationInFrames(props.durationInFrames),
      })}
    />
    <Composition
      id={MOBIUS_TIMELINE_COMPOSITION_ID}
      component={MobiusTutorialTimeline}
      width={1920}
      height={1080}
      fps={30}
      durationInFrames={DEFAULT_DURATION_IN_FRAMES}
      defaultProps={timelineDefaultProps}
      calculateMetadata={({ props }) => ({
        durationInFrames: getMobiusTimelineDuration(
          props.scenes,
          getDurationInFrames(props.fallbackDurationInFrames),
        ),
      })}
    />
  </>
);

registerRoot(RemotionRoot);
