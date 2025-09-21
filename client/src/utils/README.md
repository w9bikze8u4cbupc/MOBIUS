# Frontend Utilities

This directory contains utility functions and helpers used throughout the Mobius Games Tutorial Generator frontend.

## fetchJson.js

A robust fetch utility for making JSON API requests with the following features:

- Automatic JSON serialization/deserialization
- Authentication header support
- Retry with exponential backoff for transient errors
- AbortSignal support for request cancellation
- Centralized error handling with user-friendly messages
- Toast notification integration with deduplication

## errorMap.js

Error mapping utility that translates backend error codes and HTTP status codes into user-friendly messages.

## Usage

### Using fetchJson directly:

```javascript
import { fetchJson } from './utils/fetchJson';

const data = await fetchJson('/api/endpoint', {
  method: 'POST',
  body: { key: 'value' },
  toast: { addToast, dedupeKey: 'unique-key' },
  errorContext: { area: 'extract', action: 'actions' },
});
```

### Using hook-based API modules:

```javascript
import { useExtractActionsApi } from './api/extractActionsHook';

function MyComponent() {
  const { extractActions } = useExtractActionsApi();
  const { addToast } = useToast();

  const handleClick = async () => {
    try {
      const data = await extractActions({ pdfUrl: '...' });
      // Handle success
    } catch (error) {
      // Errors are automatically toasted
    }
  };

  return <button onClick={handleClick}>Extract</button>;
}
```

### Using DebugChips for QA:

```javascript
import DebugChips from './components/DebugChips';

function MyComponent() {
  const [debugInfo, setDebugInfo] = useState({
    requestId: '123',
    latency: '45ms',
  });

  return (
    <div>
      <button>Do something</button>
      <DebugChips info={debugInfo} />
    </div>
  );
}
```

Note: DebugChips are only visible when `REACT_APP_QA_LABELS=true` is set in the environment.
