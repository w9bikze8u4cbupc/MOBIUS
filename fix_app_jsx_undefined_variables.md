# Fix for Blank Page Issue in Mobius Tutorial Generator

## Problem
The Mobius Tutorial Generator was showing a blank page when launched via the desktop shortcut. Investigation revealed two issues:
1. The `App.jsx` file had references to undefined variables `activeTab` and `setActiveTab`, which caused a JavaScript error preventing the application from rendering.
2. The launcher script had issues with port detection, causing it to open the browser to the wrong URL.

## Root Cause
In `src/ui/App.jsx`, the component was trying to use React state variables `activeTab` and `setActiveTab` without defining them with the `useState` hook.

In `scripts/launch-mobius.bat`, the port detection mechanism was not working reliably, and there was no fallback to check common ports.

## Solution

### Fixed App.jsx
Updated `src/ui/App.jsx` to properly initialize the state variables:

```javascript
import React, { useState } from 'react';
import ScriptWorkbench from './ScriptWorkbench';
import ScriptEditor from './ScriptEditor';
import ImageMatcher from './ImageMatcher';

function App() {
  // In a real implementation, this would come from URL params or context
  const projectId = 'default-project';
  const [activeTab, setActiveTab] = useState('editor');  // Added this line
  
  return (
    // ... rest of component
  );
}

export default App;
```

### Improved Launcher Script
Updated `scripts/launch-mobius.bat` with enhanced port detection:

1. Added fallback mechanism to check common ports (3000-3003) if log parsing fails
2. Used curl to verify which port the server is actually running on
3. Enabled delayed expansion for proper variable handling
4. Increased wait times for server initialization

## Testing
After applying the fixes:
1. The application now renders correctly in the browser
2. Both the API server (port 5001) and UI server (port 3000+) are functioning properly
3. The desktop shortcut launches the application successfully
4. The tab switching functionality in the UI works as expected
5. The launcher correctly detects the UI server port and opens the browser to the right URL

## Files Modified
- `src/ui/App.jsx` - Fixed undefined state variables
- `scripts/launch-mobius.bat` - Improved diagnostics, wait times, and port detection

## Additional Improvements
- Added better error handling and diagnostic messages
- Increased server initialization wait times to accommodate slower systems
- Implemented robust port detection with fallback mechanism