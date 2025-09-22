import React, { useState } from 'react';
import fetchJson from '../utils/fetchJson';

/**
 * DevTestPage - Manual validation page for fetchJson functionality
 * 
 * This component allows manual testing of various fetchJson scenarios:
 * - BGG XML fetch & parsing
 * - JSON echo POST
 * - Request deduplication
 * - Error handling
 */
export default function DevTestPage() {
  const [results, setResults] = useState({});
  const [loading, setLoading] = useState({});

  const addResult = (key, result) => {
    setResults(prev => ({ ...prev, [key]: result }));
  };

  const setLoadingState = (key, isLoading) => {
    setLoading(prev => ({ ...prev, [key]: isLoading }));
  };

  const testBGGFetch = async () => {
    const key = 'bggFetch';
    setLoadingState(key, true);
    try {
      const xml = await fetchJson('https://boardgamegeek.com/xmlapi2/thing?id=174430&stats=1', {
        responseType: 'xml',
        timeout: 10000,
        context: { area: 'test', action: 'bgg_fetch' }
      });
      addResult(key, { success: true, data: xml.substring(0, 200) + '...' });
    } catch (error) {
      addResult(key, { success: false, error: error.message, context: error.context });
    }
    setLoadingState(key, false);
  };

  const testJsonEcho = async () => {
    const key = 'jsonEcho';
    setLoadingState(key, true);
    try {
      const response = await fetchJson('https://httpbin.org/post', {
        method: 'POST',
        body: { message: 'Hello from fetchJson!', timestamp: Date.now() },
        responseType: 'json',
        timeout: 10000,
        context: { area: 'test', action: 'json_echo' }
      });
      addResult(key, { success: true, data: response.json });
    } catch (error) {
      addResult(key, { success: false, error: error.message, context: error.context });
    }
    setLoadingState(key, false);
  };

  const testDeduplication = async () => {
    const key = 'deduplication';
    setLoadingState(key, true);
    
    try {
      // Fire off 3 identical requests with the same dedupeKey
      const dedupeKey = 'test-dedupe-' + Date.now();
      const promises = [
        fetchJson('https://httpbin.org/delay/2', {
          dedupeKey,
          timeout: 10000,
          context: { area: 'test', action: 'dedupe_1' }
        }),
        fetchJson('https://httpbin.org/delay/2', {
          dedupeKey,
          timeout: 10000,
          context: { area: 'test', action: 'dedupe_2' }
        }),
        fetchJson('https://httpbin.org/delay/2', {
          dedupeKey,
          timeout: 10000,
          context: { area: 'test', action: 'dedupe_3' }
        })
      ];

      const startTime = Date.now();
      const results = await Promise.all(promises);
      const endTime = Date.now();
      
      // Should take ~2 seconds, not 6 seconds if deduplication works
      addResult(key, { 
        success: true, 
        duration: endTime - startTime,
        message: `3 requests completed in ${endTime - startTime}ms (should be ~2s if deduplicated)`,
        allSame: results[0] === results[1] && results[1] === results[2]
      });
    } catch (error) {
      addResult(key, { success: false, error: error.message, context: error.context });
    }
    setLoadingState(key, false);
  };

  const testRetry = async () => {
    const key = 'retry';
    setLoadingState(key, true);
    try {
      // This will return 500 status, should trigger retries
      const response = await fetchJson('https://httpbin.org/status/500', {
        retries: 2,
        timeout: 5000,
        context: { area: 'test', action: 'retry_test' }
      });
      addResult(key, { success: true, data: response });
    } catch (error) {
      addResult(key, { 
        success: false, 
        error: error.message, 
        context: error.context,
        message: 'Should have retried 2 times before failing'
      });
    }
    setLoadingState(key, false);
  };

  const testTimeout = async () => {
    const key = 'timeout';
    setLoadingState(key, true);
    try {
      // This should timeout after 2 seconds
      const response = await fetchJson('https://httpbin.org/delay/5', {
        timeout: 2000,
        context: { area: 'test', action: 'timeout_test' }
      });
      addResult(key, { success: true, data: response });
    } catch (error) {
      addResult(key, { 
        success: false, 
        error: error.message, 
        context: error.context,
        message: 'Should have timed out after 2 seconds'
      });
    }
    setLoadingState(key, false);
  };

  const renderResult = (key) => {
    const result = results[key];
    const isLoading = loading[key];
    
    if (isLoading) {
      return <div style={{ padding: '10px', backgroundColor: '#e3f2fd' }}>Loading...</div>;
    }
    
    if (!result) {
      return <div style={{ padding: '10px', backgroundColor: '#f5f5f5' }}>Not tested yet</div>;
    }
    
    return (
      <div style={{ 
        padding: '10px', 
        backgroundColor: result.success ? '#e8f5e8' : '#ffeaea',
        border: `1px solid ${result.success ? '#4caf50' : '#f44336'}`
      }}>
        <div><strong>Success:</strong> {result.success ? 'Yes' : 'No'}</div>
        {result.error && <div><strong>Error:</strong> {result.error}</div>}
        {result.message && <div><strong>Message:</strong> {result.message}</div>}
        {result.context && (
          <div><strong>Context:</strong> {JSON.stringify(result.context)}</div>
        )}
        {result.data && (
          <div><strong>Data:</strong> {JSON.stringify(result.data, null, 2).substring(0, 300)}...</div>
        )}
        {result.duration && (
          <div><strong>Duration:</strong> {result.duration}ms</div>
        )}
        {result.allSame !== undefined && (
          <div><strong>All Same:</strong> {result.allSame ? 'Yes' : 'No'}</div>
        )}
      </div>
    );
  };

  return (
    <div style={{ padding: '20px', fontFamily: 'Arial, sans-serif' }}>
      <h1>fetchJson Dev Test Page</h1>
      <p>This page allows manual validation of fetchJson functionality.</p>
      
      <div style={{ display: 'grid', gap: '20px', marginTop: '20px' }}>
        <div>
          <h3>BGG XML Fetch Test</h3>
          <p>Tests fetching XML data from BoardGameGeek API</p>
          <button 
            onClick={testBGGFetch} 
            disabled={loading.bggFetch}
            style={{ padding: '10px 20px', marginBottom: '10px' }}
          >
            Test BGG Fetch
          </button>
          {renderResult('bggFetch')}
        </div>

        <div>
          <h3>JSON Echo Test</h3>
          <p>Tests POST request with JSON body</p>
          <button 
            onClick={testJsonEcho} 
            disabled={loading.jsonEcho}
            style={{ padding: '10px 20px', marginBottom: '10px' }}
          >
            Test JSON Echo
          </button>
          {renderResult('jsonEcho')}
        </div>

        <div>
          <h3>Request Deduplication Test</h3>
          <p>Tests that concurrent requests with the same dedupeKey are deduplicated</p>
          <button 
            onClick={testDeduplication} 
            disabled={loading.deduplication}
            style={{ padding: '10px 20px', marginBottom: '10px' }}
          >
            Test Deduplication
          </button>
          {renderResult('deduplication')}
        </div>

        <div>
          <h3>Retry Test</h3>
          <p>Tests that failed requests are retried with exponential backoff</p>
          <button 
            onClick={testRetry} 
            disabled={loading.retry}
            style={{ padding: '10px 20px', marginBottom: '10px' }}
          >
            Test Retry Logic
          </button>
          {renderResult('retry')}
        </div>

        <div>
          <h3>Timeout Test</h3>
          <p>Tests that requests timeout after the specified duration</p>
          <button 
            onClick={testTimeout} 
            disabled={loading.timeout}
            style={{ padding: '10px 20px', marginBottom: '10px' }}
          >
            Test Timeout
          </button>
          {renderResult('timeout')}
        </div>
      </div>
    </div>
  );
}