import React, { useState } from 'react';
import { fetchJson } from './utils/fetchJson';

const DevTestPage = () => {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);

  const addResult = (test, result, error = null) => {
    setResults(prev => [...prev, { test, result, error, timestamp: new Date().toISOString() }]);
  };

  const runBggTest = async () => {
    setLoading(true);
    try {
      const result = await fetchJson('https://boardgamegeek.com/xmlapi2/thing?id=1&stats=1', {
        responseType: 'xml',
        timeout: 10000,
        context: { area: 'dev-test', action: 'bgg-fetch' }
      });
      addResult('BGG XML Fetch', `Success: ${result.length} characters`);
    } catch (error) {
      addResult('BGG XML Fetch', 'Failed', error.message);
    }
    setLoading(false);
  };

  const runJsonTest = async () => {
    setLoading(true);
    try {
      const result = await fetchJson('https://httpbin.org/json', {
        context: { area: 'dev-test', action: 'json-fetch' }
      });
      addResult('JSON Fetch', `Success: ${JSON.stringify(result).substring(0, 100)}...`);
    } catch (error) {
      addResult('JSON Fetch', 'Failed', error.message);
    }
    setLoading(false);
  };

  const runPostTest = async () => {
    setLoading(true);
    try {
      const result = await fetchJson('https://httpbin.org/post', {
        method: 'POST',
        body: { test: 'data', timestamp: Date.now() },
        context: { area: 'dev-test', action: 'post-test' }
      });
      addResult('POST Test', `Success: ${result.json?.test}`);
    } catch (error) {
      addResult('POST Test', 'Failed', error.message);
    }
    setLoading(false);
  };

  const runRetryTest = async () => {
    setLoading(true);
    try {
      const result = await fetchJson('https://httpbin.org/status/500', {
        retries: 2,
        expectedStatuses: [200, 500], // Accept 500 to test retry logic
        context: { area: 'dev-test', action: 'retry-test' }
      });
      addResult('Retry Test', 'Completed (with retries)');
    } catch (error) {
      addResult('Retry Test', 'Failed after retries', error.message);
    }
    setLoading(false);
  };

  const runDedupeTest = async () => {
    setLoading(true);
    const startTime = Date.now();
    
    try {
      // Make two identical requests with dedupe key
      const [result1, result2] = await Promise.all([
        fetchJson('https://httpbin.org/uuid', { dedupeKey: 'uuid-test' }),
        fetchJson('https://httpbin.org/uuid', { dedupeKey: 'uuid-test' })
      ]);
      
      const elapsed = Date.now() - startTime;
      addResult('Dedupe Test', `Completed in ${elapsed}ms - Same UUID: ${result1.uuid === result2.uuid}`);
    } catch (error) {
      addResult('Dedupe Test', 'Failed', error.message);
    }
    setLoading(false);
  };

  const clearResults = () => setResults([]);

  return (
    <div style={{ padding: '20px', fontFamily: 'monospace' }}>
      <h1>🧪 fetchJson Development Test Page</h1>
      <p>This page tests the fetchJson utility with various scenarios.</p>

      <div style={{ marginBottom: '20px' }}>
        <h2>Test Controls</h2>
        <button onClick={runBggTest} disabled={loading} style={buttonStyle}>
          Test BGG XML Fetch
        </button>
        <button onClick={runJsonTest} disabled={loading} style={buttonStyle}>
          Test JSON Fetch
        </button>
        <button onClick={runPostTest} disabled={loading} style={buttonStyle}>
          Test POST Request
        </button>
        <button onClick={runRetryTest} disabled={loading} style={buttonStyle}>
          Test Retry Logic
        </button>
        <button onClick={runDedupeTest} disabled={loading} style={buttonStyle}>
          Test Deduplication
        </button>
        <button onClick={clearResults} style={{ ...buttonStyle, backgroundColor: '#dc3545' }}>
          Clear Results
        </button>
      </div>

      {loading && <div style={{ color: 'blue' }}>⏳ Running test...</div>}

      <div>
        <h2>Test Results</h2>
        {results.length === 0 ? (
          <p>No tests run yet. Click a test button above.</p>
        ) : (
          <div style={{ maxHeight: '400px', overflowY: 'auto', border: '1px solid #ccc', padding: '10px' }}>
            {results.map((result, idx) => (
              <div key={idx} style={{ 
                marginBottom: '10px', 
                padding: '8px', 
                backgroundColor: result.error ? '#ffebee' : '#e8f5e8',
                border: `1px solid ${result.error ? '#f44336' : '#4caf50'}`,
                borderRadius: '4px'
              }}>
                <div><strong>{result.test}</strong> - {result.timestamp}</div>
                <div>Result: {result.result}</div>
                {result.error && <div style={{ color: 'red' }}>Error: {result.error}</div>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

const buttonStyle = {
  margin: '5px',
  padding: '10px 15px',
  backgroundColor: '#007bff',
  color: 'white',
  border: 'none',
  borderRadius: '4px',
  cursor: 'pointer'
};

export default DevTestPage;