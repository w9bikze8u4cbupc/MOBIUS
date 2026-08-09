import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';

const clamp = {
  extrapolateLeft: 'clamp',
  extrapolateRight: 'clamp',
};

/** Accessible, animated heading for a tutorial scene. */
export const SceneTitle = ({ children, color }) => {
  const frame = useCurrentFrame();
  const { fps, width } = useVideoConfig();
  const entrance = spring({
    fps,
    frame,
    config: { damping: 16, mass: 0.75, stiffness: 130 },
  });
  const opacity = interpolate(entrance, [0, 1], [0, 1], clamp);
  const translateY = interpolate(entrance, [0, 1], [54, 0], clamp);
  const fontSize = Math.max(96, Math.round(width * 0.058));

  return (
    <h1
      style={{
        color,
        fontSize,
        fontWeight: 800,
        letterSpacing: -1.5,
        lineHeight: 1.08,
        margin: 0,
        maxWidth: '100%',
        opacity,
        transform: `translateY(${translateY}px)`,
      }}
    >
      {children}
    </h1>
  );
};

export default SceneTitle;
