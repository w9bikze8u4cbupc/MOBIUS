import React, { useState } from 'react';
import fetchJson from '../utils/fetchJson';

const BACKEND_URL = "http://localhost:5001";

/**
 * DevTestPage for manual validation of fetchJson functionality
 * This component can be used to test various fetchJson scenarios during development
 */
function DevTestPage() {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState({});

  const addResult = (testName, result, success = true) => {
    const timestamp = new Date().toLocaleTimeString();
    setResults(prev => [...prev, {
      testName,
      result,
      success,
      timestamp,
      id: Date.now()
    }]);
  };

  const runTest = async (testName, testFn) => {
    setLoading(prev => ({ ...prev, [testName]: true }));
    try {
      const result = await testFn();
      addResult(testName, result, true);
    } catch (error) {
      addResult(testName, {
        error: error.message,
        context: error.context,
        status: error.status
      }, false);
    } finally {
      setLoading(prev => ({ ...prev, [testName]: false }));
    }
  };

  const tests = [
    {
      name: 'BGG XML Fetch',
      description: 'Test BGG XML API fetch with retries',
      test: () => fetchJson('https://boardgamegeek.com/xmlapi2/thing?id=174430', {
        method: 'GET',
        responseType: 'xml',
        timeout: 10000,
        retries: 3,
        context: { area: 'bgg', action: 'fetch_test' }
      })
    },
    {
      name: 'JSON Echo Test',
      description: 'Test JSON request/response with httpbin.org',
      test: () => fetchJson('https://httpbin.org/json', {
        method: 'GET',
        timeout: 5000,
        retries: 2,
        context: { area: 'test', action: 'json_echo' }
      })
    },
    {
      name: 'POST with Body',
      description: 'Test POST request with JSON body',
      test: () => fetchJson('https://httpbin.org/post', {
        method: 'POST',
        body: { test: 'data', timestamp: Date.now() },
        timeout: 5000,
        retries: 1,
        context: { area: 'test', action: 'post_test' }
      })
    },
    {
      name: 'Error Handling',
      description: 'Test error handling with 404 status',
      test: () => fetchJson('https://httpbin.org/status/404', {
        method: 'GET',
        expectedStatuses: [200], // This should cause an error
        timeout: 5000,
        retries: 1,
        context: { area: 'test', action: 'error_test' }
      })
    },
    {
      name: 'Request Deduplication',
      description: 'Test request deduplication with same key',
      test: async () => {
        const dedupeKey = 'test-dedupe-key';
        const promises = [
          fetchJson('https://httpbin.org/delay/1', {
            method: 'GET',
            dedupeKey,
            timeout: 10000,
            context: { area: 'test', action: 'dedupe_test_1' }
          }),
          fetchJson('https://httpbin.org/delay/1', {
            method: 'GET',
            dedupeKey,
            timeout: 10000,
            context: { area: 'test', action: 'dedupe_test_2' }
          })
        ];
        
        const results = await Promise.all(promises);
        return {
          message: 'Both requests should return same result',
          result1Keys: Object.keys(results[0]),
          result2Keys: Object.keys(results[1]),
          areEqual: JSON.stringify(results[0]) === JSON.stringify(results[1])
        };
      }
    },
    {
      name: 'Backend Health Check',
      description: 'Test connection to local backend server',
      test: () => fetchJson(`${BACKEND_URL}/health`, {
        method: 'GET',
        timeout: 5000,
        retries: 1,
        context: { area: 'backend', action: 'health_check' }
      }).catch(() => ({
        error: 'Backend not running or not accessible',
        suggestion: 'Make sure the backend server is running on port 5001'
      }))
    }
  ];

  const clearResults = () => setResults([]);

  return (
    <div style={{ padding: '20px', fontFamily: 'monospace', fontSize: '14px' }}>
      <h1>FetchJson Dev Test Page</h1>
      <p>This page allows manual testing of the fetchJson utility functions.</p>
      
      <div style={{ marginBottom: '20px' }}>
        <button 
          onClick={clearResults}
          style={{ 
            padding: '8px 16px', 
            backgroundColor: '#dc3545', 
            color: 'white', 
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          Clear Results
        </button>
      </div>

      <div style={{ display: 'grid', gap: '10px', marginBottom: '30px' }}>
        {tests.map((test) => (
          <div key={test.name} style={{ 
            border: '1px solid #ddd', 
            borderRadius: '8px', 
            padding: '15px',
            backgroundColor: '#f8f9fa'
          }}>
            <h3 style={{ margin: '0 0 5px 0', color: '#333' }}>{test.name}</h3>
            <p style={{ margin: '0 0 10px 0', color: '#666' }}>{test.description}</p>
            <button
              onClick={() => runTest(test.name, test.test)}
              disabled={loading[test.name]}
              style={{
                padding: '6px 12px',
                backgroundColor: loading[test.name] ? '#6c757d' : '#007bff',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: loading[test.name] ? 'not-allowed' : 'pointer'
              }}
            >
              {loading[test.name] ? 'Running...' : 'Run Test'}
            </button>
          </div>
        ))}
      </div>

      <h2>Test Results</h2>
      <div style={{ maxHeight: '500px', overflowY: 'auto' }}>
        {results.length === 0 ? (
          <p style={{ color: '#666', fontStyle: 'italic' }}>No test results yet. Run some tests above.</p>
        ) : (
          results.slice().reverse().map((result) => (
            <div 
              key={result.id}
              style={{ 
                margin: '10px 0',
                padding: '10px',
                border: `1px solid ${result.success ? '#28a745' : '#dc3545'}`,
                borderRadius: '4px',
                backgroundColor: result.success ? '#d4edda' : '#f8d7da'
              }}
            >
              <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center',
                marginBottom: '5px'
              }}>
                <strong style={{ color: result.success ? '#155724' : '#721c24' }}>
                  {result.testName} {result.success ? '✅' : '❌'}
                </strong>
                <small style={{ color: '#666' }}>{result.timestamp}</small>
              </div>
              <pre style={{ 
                margin: '5px 0 0 0', 
                padding: '8px',
                backgroundColor: result.success ? '#c3e6cb' : '#f5c6cb',
                borderRadius: '4px',
                fontSize: '12px',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                maxHeight: '200px',
                overflowY: 'auto'
              }}>
                {JSON.stringify(result.result, null, 2)}
              </pre>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default DevTestPage;