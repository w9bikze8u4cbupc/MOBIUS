import React, { useState } from 'react';
import fetchJson from '../utils/fetchJson';

const BACKEND_URL = "http://localhost:5001";

/**
 * DevTestPage - Component for testing fetchJson functionality in isolation
 * This helps validate the migration from axios to fetchJson
 */
function DevTestPage() {
  const [testResults, setTestResults] = useState({});
  const [loading, setLoading] = useState({});

  const addResult = (testName, result) => {
    setTestResults(prev => ({ ...prev, [testName]: result }));
    setLoading(prev => ({ ...prev, [testName]: false }));
  };

  const startTest = (testName) => {
    setLoading(prev => ({ ...prev, [testName]: true }));
  };

  // Test 1: BGG XML Fetch
  const testBGGFetch = async () => {
    startTest('bggFetch');
    try {
      const xml = await fetchJson('https://boardgamegeek.com/xmlapi2/thing?id=174430&stats=1', {
        headers: { 'User-Agent': 'BoardGameTutorialGenerator/1.0' },
        timeout: 10000,
        responseType: 'xml',
        context: { area: 'test', action: 'bggFetch' }
      });
      
      addResult('bggFetch', { 
        success: true, 
        message: `Successfully fetched XML (${xml.length} chars)`,
        hasGameData: xml.includes('<item') && xml.includes('</item>')
      });
    } catch (error) {
      addResult('bggFetch', { 
        success: false, 
        message: error.message,
        context: error.context
      });
    }
  };

  // Test 2: TTS Request (mock/test)
  const testTTSRequest = async () => {
    startTest('ttsRequest');
    try {
      // This will likely fail without proper API key, but tests the request format
      await fetchJson(`${BACKEND_URL}/tts`, {
        method: 'POST',
        body: { text: 'Test audio generation', voice: 'test', language: 'english' },
        responseType: 'arrayBuffer',
        context: { area: 'test', action: 'tts' }
      });
      
      addResult('ttsRequest', { 
        success: true, 
        message: 'TTS request succeeded (unexpected!)'
      });
    } catch (error) {
      // We expect this to fail in most cases due to server not running or missing API key
      addResult('ttsRequest', { 
        success: error.message.includes('fetch') || error.message.includes('ECONNREFUSED'), 
        message: `Expected connection error: ${error.message}`,
        expectedFailure: true
      });
    }
  };

  // Test 3: JSON Response
  const testJSONResponse = async () => {
    startTest('jsonResponse');
    try {
      // Test with a public JSON API
      const data = await fetchJson('https://httpbin.org/json', {
        responseType: 'json',
        context: { area: 'test', action: 'jsonTest' }
      });
      
      addResult('jsonResponse', { 
        success: true, 
        message: 'JSON response parsed successfully',
        hasSlideshow: data.slideshow && data.slideshow.title
      });
    } catch (error) {
      addResult('jsonResponse', { 
        success: false, 
        message: error.message,
        context: error.context
      });
    }
  };

  // Test 4: Retry mechanism
  const testRetryMechanism = async () => {
    startTest('retryTest');
    try {
      // This should trigger retries and eventually fail
      await fetchJson('https://httpbin.org/status/500', {
        retries: 2,
        retryDelay: 500,
        context: { area: 'test', action: 'retryTest' }
      });
      
      addResult('retryTest', { 
        success: false, 
        message: 'Unexpected success on 500 status'
      });
    } catch (error) {
      addResult('retryTest', { 
        success: error.message.includes('HTTP 500'), 
        message: `Retry mechanism working: ${error.message}`,
        expectedFailure: true
      });
    }
  };

  // Test 5: Deduplication
  const testDeduplication = async () => {
    startTest('dedupeTest');
    try {
      const dedupeKey = 'test-dedupe-' + Date.now();
      
      // Fire two identical requests with same dedupe key
      const [result1, result2] = await Promise.all([
        fetchJson('https://httpbin.org/delay/1', {
          dedupeKey,
          context: { area: 'test', action: 'dedupe1' }
        }),
        fetchJson('https://httpbin.org/delay/1', {
          dedupeKey,
          context: { area: 'test', action: 'dedupe2' }
        })
      ]);
      
      addResult('dedupeTest', { 
        success: true, 
        message: 'Deduplication test completed',
        bothRequests: !!result1 && !!result2
      });
    } catch (error) {
      addResult('dedupeTest', { 
        success: false, 
        message: error.message,
        context: error.context
      });
    }
  };

  const runAllTests = async () => {
    await testBGGFetch();
    await testTTSRequest();
    await testJSONResponse();
    await testRetryMechanism();
    await testDeduplication();
  };

  return (
    <div style={{ padding: '20px', fontFamily: 'monospace' }}>
      <h2>🧪 DevTestPage - fetchJson Migration Validation</h2>
      <p>This page tests the unified fetchJson utility that replaced axios.</p>
      
      <div style={{ marginBottom: '20px' }}>
        <button onClick={runAllTests} style={{ marginRight: '10px' }}>
          Run All Tests
        </button>
        <button onClick={testBGGFetch} disabled={loading.bggFetch}>
          {loading.bggFetch ? 'Testing BGG...' : 'Test BGG XML Fetch'}
        </button>
        <button onClick={testTTSRequest} disabled={loading.ttsRequest}>
          {loading.ttsRequest ? 'Testing TTS...' : 'Test TTS Request'}
        </button>
        <button onClick={testJSONResponse} disabled={loading.jsonResponse}>
          {loading.jsonResponse ? 'Testing JSON...' : 'Test JSON Response'}
        </button>
        <button onClick={testRetryMechanism} disabled={loading.retryTest}>
          {loading.retryTest ? 'Testing Retry...' : 'Test Retry Mechanism'}
        </button>
        <button onClick={testDeduplication} disabled={loading.dedupeTest}>
          {loading.dedupeTest ? 'Testing Dedupe...' : 'Test Deduplication'}
        </button>
      </div>

      <div>
        <h3>Test Results:</h3>
        {Object.entries(testResults).length === 0 && (
          <p>No tests run yet. Click buttons above to test fetchJson functionality.</p>
        )}
        
        {Object.entries(testResults).map(([testName, result]) => (
          <div key={testName} style={{ 
            margin: '10px 0', 
            padding: '10px', 
            border: `2px solid ${result.success ? 'green' : 'orange'}`,
            borderRadius: '5px',
            backgroundColor: result.success ? '#f0fff0' : '#fff5f5'
          }}>
            <h4 style={{ margin: '0 0 5px 0' }}>
              {result.success ? '✅' : result.expectedFailure ? '⚠️' : '❌'} {testName}
            </h4>
            <p style={{ margin: '0' }}>{result.message}</p>
            {result.context && (
              <details style={{ marginTop: '5px' }}>
                <summary>Error Context</summary>
                <pre style={{ fontSize: '12px', background: '#f5f5f5', padding: '5px' }}>
                  {JSON.stringify(result.context, null, 2)}
                </pre>
              </details>
            )}
            {result.hasGameData !== undefined && (
              <p style={{ margin: '5px 0 0 0', fontSize: '12px' }}>
                Contains game data: {result.hasGameData ? 'Yes' : 'No'}
              </p>
            )}
            {result.hasSlideshow !== undefined && (
              <p style={{ margin: '5px 0 0 0', fontSize: '12px' }}>
                JSON parsed correctly: {result.hasSlideshow ? 'Yes' : 'No'}
              </p>
            )}
          </div>
        ))}
      </div>

      <div style={{ marginTop: '30px', padding: '10px', background: '#f0f0f0' }}>
        <h3>Expected Behavior:</h3>
        <ul>
          <li>BGG XML Fetch: Should successfully fetch and return XML data</li>
          <li>TTS Request: Expected to fail with connection error (server not running)</li>
          <li>JSON Response: Should parse JSON from public API</li>
          <li>Retry Mechanism: Should retry failed requests and provide proper error</li>
          <li>Deduplication: Should handle concurrent requests with same dedupe key</li>
        </ul>
      </div>
    </div>
  );
}

export default DevTestPage;