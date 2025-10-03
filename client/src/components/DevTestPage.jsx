// client/src/components/DevTestPage.jsx
import React from 'react';
import DebugChips from './DebugChips';
import { useToast } from '../contexts/ToastContext';
import { extractBggHtml } from '../api/extractBggHtml';
import { searchImages } from '../api/searchImages';

const API_BASE = process.env.REACT_APP_API_BASE || '';

export default function DevTestPage({ onClose }) {
  const { addToast } = useToast();

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

  return (
    <div style={{ padding: 24 }}>
      <h2>Dev / Test Page</h2>
      <p>
        Use this page for targeted validation of API helpers, toasts, and QA
        gates.
      </p>

      <div style={{ marginTop: 16, display: 'flex', gap: 12 }}>
        <button onClick={runExtractMetadata} style={{ padding: '8px 16px' }}>
          Run Extract Metadata
        </button>

        <button onClick={runWebSearch} style={{ padding: '8px 16px' }}>
          Run Web Search
        </button>

        <button onClick={onClose} style={{ padding: '8px 16px' }}>
          Close
        </button>
      </div>

      <div style={{ marginTop: 20 }}>
        <DebugChips />
      </div>
    </div>
  );
}
