// client/src/components/DevTestPage.jsx
import React from 'react';
import DebugChips from './DebugChips';
import { useToast } from '../contexts/ToastContext';
import { extractBggHtml } from '../api/extractBggHtml';
import { searchImages } from '../api/searchImages';

const API_BASE = process.env.REACT_APP_API_BASE || '';

export default function DevTestPage({ onClose }) {
  const { addToast } = useToast();
  
  // Ensure REACT_APP_SHOW_DEV_TEST gating is read at boot
  const isDevTestEnabled = process.env.REACT_APP_SHOW_DEV_TEST === 'true';

  const runExtractMetadata = async () => {
    try {
      const res = await extractBggHtml({
        apiBase: API_BASE,
        bggUrl: 'https://boardgamegeek.com/boardgame/12345/sample-game',
        addToast,
      });
      
      addToast({
        variant: 'success',
        message: 'Extract Metadata successful',
        dedupeKey: 'extract-metadata-success',
      });
      
      return res;
    } catch (err) {
      // Error already handled by fetchJson
      return null;
    }
  };

  const runWebSearch = async () => {
    try {
      const res = await searchImages({
        apiBase: API_BASE,
        query: { gameName: 'Sample Game', pageLimit: 2 },
        addToast,
      });
      
      addToast({
        variant: 'success',
        message: `Found ${res?.images?.length || 0} images`,
        dedupeKey: 'web-search-success',
      });
      
      return res;
    } catch (err) {
      // Error already handled by fetchJson
      return null;
    }
  };
  
  // Make operations idempotent with explicit reset
  const handleReset = () => {
    // Reset any test state if needed
    console.log('DevTestPage state reset');
  };

  // DevTestPage should not be shipped enabled by default
  if (!isDevTestEnabled) {
    return null;
  }

  return (
    <div 
      style={{ padding: 24 }}
      role="region"
      aria-label="Development Test Page"
      data-testid="dev-test-page"
    >
      <h2>Dev / Test Page</h2>
      <p>Use this page for targeted validation of API helpers, toasts, and QA gates.</p>
      
      <div 
        style={{ marginTop: 16, display: 'flex', gap: 12, flexWrap: 'wrap' }}
        role="group"
        aria-label="Test Actions"
      >
        <button 
          onClick={runExtractMetadata}
          style={{ padding: '8px 16px' }}
          data-testid="run-extract-metadata"
          aria-label="Run Extract Metadata"
        >
          Run Extract Metadata
        </button>
        
        <button 
          onClick={runWebSearch}
          style={{ padding: '8px 16px' }}
          data-testid="run-web-search"
          aria-label="Run Web Search"
        >
          Run Web Search
        </button>
        
        <button 
          onClick={handleReset}
          style={{ padding: '8px 16px' }}
          data-testid="reset-dev-test"
          aria-label="Reset Test State"
        >
          Reset
        </button>
        
        <button 
          onClick={onClose}
          style={{ padding: '8px 16px' }}
          data-testid="close-dev-test"
          aria-label="Close Dev Test Page"
        >
          Close
        </button>
      </div>
      
      <div 
        style={{ marginTop: 20 }}
        data-testid="debug-chips-container"
      >
        <DebugChips />
      </div>
    </div>
  );
}