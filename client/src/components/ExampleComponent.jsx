// client/src/components/ExampleComponent.jsx
import React from 'react';
import { useExtractActionsApi } from '../api/extractActionsHook';
import DebugChips from './DebugChips';
import { useToast } from '../contexts/ToastContext';

export default function Example() {
  const { extractActions } = useExtractActionsApi();
  const [debugInfo, setDebugInfo] = React.useState(null);
  const { addToast } = useToast();

  const onClick = async () => {
    try {
      const controller = new AbortController();
      const data = await extractActions(
        { pdfUrl: 'https://example.com/test.pdf', options: {} },
        { signal: controller.signal }
      );
      // Suppose backend returns meta fields:
      setDebugInfo({
        requestId: data?.meta?.requestId,
        ruleHits: data?.meta?.rules?.length,
        latency: data?.meta?.latencyMs,
        source: data?.meta?.source,
      });
      addToast({
        variant: 'success',
        message: 'Actions extracted successfully',
        dedupeKey: 'extract-actions:success',
      });
    } catch (e) {
      // Errors are already toasted by fetchJson; optional extra handling here
    }
  };

  return (
    <>
      <button onClick={onClick}>Extract</button>
      <DebugChips info={debugInfo} />
    </>
  );
}
