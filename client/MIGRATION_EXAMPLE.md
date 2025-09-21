# Migration Example: handleExtractMetadata Function

## Original axios implementation:
```javascript
async function handleExtractMetadata(url) {
  try {
    const response = await axios.post(
      `${API_BASE}/api/extract-bgg-html`,
      { url },
      { headers: { "Content-Type": "application/json" } }
    );
    const data = response.data;
    if (data && data.success && data.metadata) {
      setMetadata(data.metadata);
      setBggMetadata(data.metadata);
      localStorage.setItem("bggMetadata", JSON.stringify(data.metadata));
    } else {
      alert("No metadata found for this URL.");
    }
  } catch (err) {
    alert("Error extracting metadata: " + (err?.response?.data?.error || err.message || String(err)));
  }
}
```

## Migrated fetchJson implementation:
```javascript
import { useToast } from '../contexts/ToastContext';
import { fetchJson } from '../utils/fetchJson';

// Add this at the top of your component
const { addToast } = useToast();

async function handleExtractMetadata(url) {
  try {
    const data = await fetchJson('/api/extract-bgg-html', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: { url },
      toast: { addToast, dedupeKey: 'extract-bgg-html' },
      errorContext: { area: 'extract', action: 'bgg-html' },
      expectedStatuses: [200],
    });
    
    if (data && data.success && data.metadata) {
      setMetadata(data.metadata);
      setBggMetadata(data.metadata);
      localStorage.setItem("bggMetadata", JSON.stringify(data.metadata));
    } else {
      addToast({
        variant: 'warning',
        message: 'No metadata found for this URL.',
        dedupeKey: 'extract-bgg-html:no-metadata'
      });
    }
  } catch (err) {
    // Error toast is automatically handled by fetchJson
    console.error('Error extracting metadata:', err);
  }
}
```

## Key improvements with fetchJson:
1. **Automatic toast handling**: Errors are automatically displayed as toasts with deduplication
2. **Deduplication**: Prevents multiple identical error messages
3. **Retry mechanism**: Built-in retries with exponential backoff for transient errors
4. **Centralized error mapping**: Consistent error messages across the application
5. **Abort signal support**: Can be cancelled if needed
6. **Cleaner error handling**: No need to manually parse axios error responses

## Benefits:
- Reduced boilerplate code
- Consistent error handling across the application
- Automatic deduplication of error messages
- Built-in retry mechanism for transient failures
- Better user experience with clearer error messages