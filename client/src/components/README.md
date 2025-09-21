# Components

This directory contains React components used in the Mobius Games Tutorial Generator frontend.

## New Components

- [DebugChips.jsx](file:///c:/Users/danie/Documents/mobius-games-tutorial-generator/client/src/components/DebugChips.jsx) - QA debugging component that displays metadata in a fixed position overlay
- [ExampleComponent.jsx](file:///c:/Users/danie/Documents/mobius-games-tutorial-generator/client/src/components/ExampleComponent.jsx) - Example component demonstrating usage of hooks and DebugChips

## Usage

### DebugChips

```jsx
import DebugChips from './DebugChips';

function MyComponent() {
  const [debugInfo, setDebugInfo] = useState({
    requestId: '123',
    latency: '45ms',
  });

  return (
    <div>
      {/* Your component content */}
      <DebugChips info={debugInfo} />
    </div>
  );
}
```

Note: DebugChips are only visible when `REACT_APP_QA_LABELS=true` is set in the environment.

### Example Usage with API Hooks

```jsx
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
```
