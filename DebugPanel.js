import React, { useState, useEffect } from 'react';

// Debug panel component for showing PDF extraction diagnostics (dev/QA only)
const DebugPanel = ({ extractionData }) => {
  const [isVisible, setIsVisible] = useState(false);
  
  // Only show in development mode
  if (process.env.NODE_ENV !== 'development') {
    return null;
  }
  
  const toggleVisibility = () => {
    setIsVisible(!isVisible);
  };
  
  // Extract debug information from extraction data
  const {
    textLength = 0,
    ocrUsed = false,
    parserMode = 'strict',
    durationMs = 0,
    componentCount = 0,
    pages = 0,
    parseErrors = []
  } = extractionData || {};
  
  return (
    <div style={{
      position: 'fixed',
      bottom: '20px',
      right: '20px',
      backgroundColor: '#f0f0f0',
      border: '1px solid #ccc',
      borderRadius: '5px',
      padding: '10px',
      fontSize: '12px',
      zIndex: 10000,
      maxWidth: '300px'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <strong>PDF Debug Panel</strong>
        <button 
          onClick={toggleVisibility}
          style={{
            background: 'none',
            border: '1px solid #999',
            borderRadius: '3px',
            cursor: 'pointer',
            fontSize: '10px',
            padding: '2px 5px'
          }}
        >
          {isVisible ? 'Hide' : 'Show'}
        </button>
      </div>
      
      {isVisible && (
        <div style={{ marginTop: '10px' }}>
          <div>Text Length: {textLength}</div>
          <div>OCR Used: {ocrUsed ? 'Yes' : 'No'}</div>
          <div>Parser Mode: {parserMode}</div>
          <div>Duration: {durationMs}ms</div>
          <div>Components: {componentCount}</div>
          <div>Pages: {pages}</div>
          {parseErrors && parseErrors.length > 0 && (
            <div>Parse Errors: {parseErrors.length}</div>
          )}
        </div>
      )}
    </div>
  );
};

export default DebugPanel;