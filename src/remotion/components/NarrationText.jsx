import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';

const clamp = {
  extrapolateLeft: 'clamp',
  extrapolateRight: 'clamp',
};

/** Readable, delayed narration entrance for a tutorial scene. */
export const NarrationText = ({ children }) => {
  const frame = useCurrentFrame();
  const { fps, height, width } = useVideoConfig();
  const entrance = spring({
    fps,
    frame: frame - 7,
    config: { damping: 18, mass: 0.8, stiffness: 115 },
  });
  const opacity = interpolate(entrance, [0, 1], [0, 1], clamp);
  const translateY = interpolate(entrance, [0, 1], [36, 0], clamp);
  const fontSize = Math.max(64, Math.round(width * 0.036));

  return (
    <p
      style={{
        color: '#f8fafc',
        fontSize,
        fontWeight: 600,
        lineHeight: 1.32,
        margin: `${Math.max(32, Math.round(height * 0.03))}px 0 0`,
        maxWidth: '100%',
        opacity,
        transform: `translateY(${translateY}px)`,
      }}
    >
      {children}
    </p>
  );
};

export default NarrationText;
