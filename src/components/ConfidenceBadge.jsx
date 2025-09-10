import React from 'react';
import { confidenceBand, scoreContributions } from '../utils/confidence';

/**
 * Confidence badge component that displays the confidence level
 * @param {Object} props - Component props
 * @param {string} props.band - Confidence band ('High', 'Medium', 'Low')
 * @returns {JSX.Element} Confidence badge element
 */
export function ConfidenceBadge({ band }) {
  const color = band === 'High' ? '#16a34a' : band === 'Medium' ? '#f59e0b' : '#6b7280';
  const bg = band === 'High' ? '#dcfce7' : band === 'Medium' ? '#fef3c7' : '#f3f4f6';
  
  return (
    <span 
      style={{
        background: bg,
        color: color,
        padding: '2px 8px',
        borderRadius: 8,
        fontSize: 12,
        fontWeight: 600
      }}
    >
      {band}
    </span>
  );
}

/**
 * Score tooltip component that displays detailed score information
 * @param {Object} props - Component props
 * @param {number} props.score - Final score
 * @param {string} props.band - Confidence band
 * @param {Object} props.contribs - Score contributions
 * @param {string} props.provider - Provider name
 * @param {Object} props.thresholds - Thresholds object
 * @returns {JSX.Element} Score tooltip element
 */
export function ScoreTooltip({ score, band, contribs, provider, thresholds }) {
  const entries = Object.entries(contribs).sort((a, b) => b[1] - a[1]);
  
  return (
    <div style={{ fontSize: 12, maxWidth: 280 }}>
      <div><b>Score:</b> {score.toFixed(3)} ({band})</div>
      <div><b>Thresholds:</b> H ≥ {thresholds.high}, M ≥ {thresholds.medium}</div>
      <div><b>Provider:</b> {provider}</div>
      <div style={{ marginTop: 6 }}><b>Contributions:</b></div>
      <ul style={{ margin: '4px 0 0 16px' }}>
        {entries.map(([k, v]) => (
          <li key={k}>{k}: {v.toFixed(3)}</li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Image card component that displays an image with confidence badge and tooltip
 * @param {Object} props - Component props
 * @param {Object} props.item - Image item object
 * @param {Object} props.scoringConfig - Scoring configuration
 * @returns {JSX.Element} Image card element
 */
export function ImageCard({ item, scoringConfig }) {
  const { factors, provider, score: precomputed } = item; // factors: {size, proximity, providerWeight, focus, uniqueness}
  const { contribs, score } = scoreContributions(factors, scoringConfig.weights);
  const band = confidenceBand(score ?? precomputed, scoringConfig.thresholds);
  
  return (
    <div className="card">
      <img src={item.url} alt={item.label} />
      <div className="row">
        <ConfidenceBadge band={band} />
        <div className="tooltip">
          <ScoreTooltip
            score={score}
            band={band}
            contribs={contribs}
            provider={provider}
            thresholds={scoringConfig.thresholds}
          />
        </div>
      </div>
      <div className="meta">{item.label}</div>
    </div>
  );
}