// client/src/components/ApiSmokeTest.jsx
import React from 'react';
import { useToast } from '../contexts/ToastContext';
import { fetchJson } from '../utils/fetchJson';
import DebugChips from './DebugChips';

export default function ApiSmokeTest() {
  const { addToast, clearDedupe } = useToast();
  const [debugInfo, setDebugInfo] = React.useState(null);

  const callOk = async () => {
    clearDedupe();
    try {
      const data = await fetchJson('/api/health', {
        toast: { addToast, dedupeKey: 'health-ok' },
        errorContext: { area: 'health', action: 'ping' },
      });
      setDebugInfo({
        requestId: data?.meta?.requestId || 'n/a',
        latency: data?.meta?.latencyMs || 'n/a',
        source: data?.meta?.source || 'local',
      });
      addToast({
        variant: 'success',
        message: 'Health OK',
        dedupeKey: 'health-ok:success',
      });
    } catch (e) {
      // Ignore errors
    }
  };

  const callOversize = async () => {
    clearDedupe();
    try {
      await fetchJson('/api/extract-actions', {
        method: 'POST',
        body: { pdfUrl: 'https://example.com/too-large.pdf' },
        toast: { addToast, dedupeKey: 'oversize' },
        errorContext: { area: 'extract', action: 'oversize' },
      });
    } catch (e) {
      // Ignore errors
    }
  };

  const callNetworkFail = async () => {
    clearDedupe();
    try {
      await fetchJson('https://invalid.host.mobius.local/api/x', {
        toast: { addToast, dedupeKey: 'network-fail' },
        errorContext: { area: 'net', action: 'fail' },
        retries: 2,
        retryBackoffMs: 200,
      });
    } catch (e) {
      // Ignore errors
    }
  };

  return (
    <div style={{ padding: 16 }}>
      <h3>API Smoke Test</h3>
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={callOk}>Call Health</button>
        <button onClick={callOversize}>Call Oversize (413)</button>
        <button onClick={callNetworkFail}>Call Network Fail</button>
      </div>
      <DebugChips info={debugInfo} />
    </div>
  );
}
