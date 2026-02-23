// client/src/components/ConfidenceBadge.js
// Display confidence level with color coding and warnings tooltip

import React, { useState } from 'react';

const ConfidenceBadge = ({ confidence }) => {
  const [showTooltip, setShowTooltip] = useState(false);

  if (!confidence) {
    return null;
  }

  const { level, score, warnings } = confidence;

  // Color coding based on confidence level
  const colors = {
    high: 'bg-green-100 text-green-800 border-green-300',
    medium: 'bg-yellow-100 text-yellow-800 border-yellow-300',
    low: 'bg-orange-100 text-orange-800 border-orange-300',
    none: 'bg-red-100 text-red-800 border-red-300'
  };

  const colorClass = colors[level] || colors.none;
  const percentage = Math.round(score * 100);

  return (
    <div className="relative inline-block">
      <div
        className={`px-2 py-1 rounded border text-xs font-medium cursor-help ${colorClass}`}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
      >
        {level.toUpperCase()} ({percentage}%)
      </div>

      {showTooltip && warnings && warnings.length > 0 && (
        <div className="absolute z-10 w-64 p-2 mt-1 text-sm bg-gray-900 text-white rounded shadow-lg">
          <div className="font-semibold mb-1">Warnings:</div>
          <ul className="list-disc list-inside space-y-1">
            {warnings.map((warning, idx) => (
              <li key={idx} className="text-xs">{warning}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default ConfidenceBadge;
