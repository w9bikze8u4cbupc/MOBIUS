// Example usage of ConfidenceBadge and ScoreTooltip components

import React from 'react';
import { ConfidenceBadge, ScoreTooltip } from './ConfidenceBadge';

// Example image data
const exampleImage = {
  url: 'https://example.com/image.jpg',
  label: 'Game Board',
  factors: {
    size: 0.45,
    proximity: 0.82,
    providerWeight: 0.85,
    focus: 0.75,
    uniqueness: 0.90
  },
  provider: 'ubg',
  score: 0.78
};

// Example scoring configuration from grid search
const scoringConfig = {
  weights: {
    size: 0.20,
    proximity: 0.20,
    provider: 0.25,
    focus: 0.20,
    uniqueness: 0.20
  },
  thresholds: {
    high: 0.72,
    medium: 0.50
  }
};

// Example component showing usage
function ExampleUsage() {
  return (
    <div>
      <h2>Confidence Badge Examples</h2>
      
      {/* High confidence example */}
      <div style={{ marginBottom: 20 }}>
        <h3>High Confidence Image</h3>
        <img src={exampleImage.url} alt={exampleImage.label} style={{ width: 200, height: 150, objectFit: 'cover' }} />
        <div style={{ marginTop: 10 }}>
          <ConfidenceBadge band="High" />
        </div>
      </div>
      
      {/* Tooltip example */}
      <div style={{ marginBottom: 20 }}>
        <h3>Score Tooltip Example</h3>
        <ScoreTooltip
          score={exampleImage.score}
          band="High"
          contribs={{
            size: 0.09,
            proximity: 0.164,
            providerWeight: 0.2125,
            focus: 0.15,
            uniqueness: 0.18
          }}
          provider="ubg"
          thresholds={scoringConfig.thresholds}
        />
      </div>
    </div>
  );
}

export default ExampleUsage;