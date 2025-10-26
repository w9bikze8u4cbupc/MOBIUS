# Fix for "process is not defined" Error in ScriptWorkbench.jsx

## Problem
The Mobius Tutorial Generator was showing a JavaScript error in the browser console:
```
ScriptWorkbench.jsx:6 Uncaught ReferenceError: process is not defined
    at ScriptWorkbench.jsx:6:28
```

## Root Cause
In `src/ui/ScriptWorkbench.jsx` at line 6, the code was trying to access `process.env.REACT_APP_AUTOSAVE_INTERVAL_MS`, but `process` is not defined in the browser environment when using Vite.

```javascript
const AUTOSAVE_MS = Number(process.env.REACT_APP_AUTOSAVE_INTERVAL_MS ?? 4000);
```

## Solution
Replaced the `process.env` reference with a direct default value:

```javascript
// Use a default value instead of process.env which isn't available in Vite
const AUTOSAVE_MS = 4000;
```

## Explanation
In Vite applications, environment variables need to be prefixed with `VITE_` to be accessible in the browser environment. Since this was a `REACT_APP_` prefixed variable (Create React App convention), it wasn't available in the Vite environment.

For simplicity and to get the application working, we've replaced the environment variable reference with a hardcoded default value of 4000 milliseconds (4 seconds).

## Files Modified
- `src/ui/ScriptWorkbench.jsx` - Line 6, replaced `process.env` reference with direct value

## Testing
After applying this fix:
1. The JavaScript error no longer appears in the browser console
2. The application loads and functions correctly
3. The autosave feature works with the default 4-second interval