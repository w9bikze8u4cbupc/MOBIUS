# fetchJson API Utility - Developer Onboarding Guide

## Overview

The `fetchJson` utility is our centralized API client that handles all HTTP requests with built-in retry logic, error handling, and toast notifications. It replaces direct axios calls and provides a consistent interface for API interactions.

## Key Features

### 1. Robust Error Handling
- Automatic retry with exponential backoff and jitter
- Special handling for 429 (Rate Limiting) with Retry-After header support
- Structured error mapping with user-friendly messages
- Toast notifications with deduplication

### 2. Request Management
- In-flight request deduplication to prevent duplicate calls
- AbortSignal support for cancellable requests
- Max timeout to prevent hanging requests
- Telemetry-ready with timing and attempt count metadata

### 3. Developer Experience
- Consistent API across all HTTP requests
- Type-safe options and responses
- Comprehensive documentation and examples
- Built-in testing utilities

## Basic Usage

```javascript
import { fetchJson } from '../utils/fetchJson';

// Simple GET request
const userData = await fetchJson('/api/users/123');

// POST request with body
const newPost = await fetchJson('/api/posts', {
  method: 'POST',
  body: { title: 'New Post', content: 'Post content' }
});
```

## Advanced Options

```javascript
const result = await fetchJson('/api/data', {
  method: 'POST',
  body: { key: 'value' },
  headers: { 'Custom-Header': 'value' },
  
  // Authentication
  authToken: 'Bearer token123',
  
  // Retry configuration
  retries: 3,
  retryBackoffMs: 500,
  maxTimeout: 30000,
  
  // Toast integration
  toast: { 
    addToast: useToast().addToast, 
    dedupeKey: 'unique-operation-key' 
  },
  
  // Error context for better messages
  errorContext: { area: 'user', action: 'create' },
  
  // Expected status codes
  expectedStatuses: [200, 201],
  
  // Abort signal
  signal: abortController.signal
});
```

## API Helper Pattern

Create dedicated API helpers for each service:

```javascript
// client/src/api/userService.js
import { fetchJson } from '../utils/fetchJson';

export async function getUser(userId, { addToast }) {
  return fetchJson(`/api/users/${userId}`, {
    method: 'GET',
    toast: { addToast, dedupeKey: `get-user-${userId}` },
    errorContext: { area: 'user', action: 'get' }
  });
}

export async function createUser(userData, { addToast }) {
  return fetchJson('/api/users', {
    method: 'POST',
    body: userData,
    toast: { addToast, dedupeKey: 'create-user' },
    errorContext: { area: 'user', action: 'create' },
    expectedStatuses: [201]
  });
}
```

## Error Handling

The utility automatically handles errors and shows toast notifications, but you can also handle them manually:

```javascript
try {
  const result = await fetchJson('/api/data');
  // Handle success - result contains { data, status, headers, timing, attempts }
  console.log('Data:', result.data);
  console.log('Attempts:', result.attempts);
} catch (error) {
  // Error already shown in toast, but you can log additional details
  console.error('API Error:', error.message);
  console.error('Status:', error.status);
  console.error('Backend error:', error.backend);
  console.error('Raw response:', error.backendRaw);
}
```

## Testing

### Unit Tests with Jest

```javascript
import { fetchJson } from '../utils/fetchJson';

jest.mock('../utils/fetchJson');

it('should fetch user data', async () => {
  fetchJson.mockResolvedValue({ 
    data: { id: 1, name: 'John' },
    status: 200,
    attempts: 1
  });
  
  const user = await getUser(1, { addToast: jest.fn() });
  expect(user).toEqual({ id: 1, name: 'John' });
});
```

### Retry Testing

```javascript
it('should retry on network failure', async () => {
  jest.useFakeTimers();
  
  fetchJson
    .mockRejectedValueOnce(new Error('Network Error'))
    .mockResolvedValueOnce({ data: { success: true } });
  
  const promise = fetchJson('/api/test');
  jest.advanceTimersByTime(1000); // Advance through backoff
  
  const result = await promise;
  expect(result.data).toEqual({ success: true });
});
```

## Best Practices

1. **Always use API helpers** - Don't call fetchJson directly from components
2. **Provide meaningful dedupeKeys** - Use action+identifier patterns
3. **Set appropriate timeouts** - Don't let requests hang indefinitely
4. **Handle errors gracefully** - Even though toasts are automatic, log for debugging
5. **Test retry scenarios** - Use fake timers for efficient retry testing
6. **Use AbortSignals** - For cancellable requests, especially in useEffect cleanup

## Common Patterns

### Component Integration

```javascript
import React from 'react';
import { useToast } from '../contexts/ToastContext';
import { getUser } from '../api/userService';

function UserProfile({ userId }) {
  const { addToast } = useToast();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(false);
  
  const loadUser = async () => {
    setLoading(true);
    try {
      const userData = await getUser(userId, { addToast });
      setUser(userData);
    } finally {
      setLoading(false);
    }
  };
  
  useEffect(() => {
    loadUser();
  }, [userId]);
  
  // ... render user profile
}
```

### Error Context

Always provide error context for better user messages:

```javascript
// Good - Provides context for error messages
errorContext: { area: 'user', action: 'update' }
// Results in messages like "Failed to update user: Network error"

// Bad - No context provided
// Results in generic messages like "Network error"
```

## Migration from axios

When migrating from axios:

1. Replace `axios.get(url)` with `fetchJson(url)`
2. Replace `axios.post(url, data)` with `fetchJson(url, { method: 'POST', body: data })`
3. Add toast integration if needed
4. Update error handling to use the new error object structure
5. Remove axios imports and dependency

## Debugging Tips

1. **Check the network tab** - See actual requests and responses
2. **Log timing and attempts** - Useful for performance analysis
3. **Use unique dedupeKeys** - Prevents unexpected deduplication
4. **Test offline scenarios** - Verify retry behavior
5. **Monitor console logs** - fetchJson logs retry attempts in development