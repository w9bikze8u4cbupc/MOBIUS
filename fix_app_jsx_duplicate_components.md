# Fix for Duplicate Components in App.jsx

## Problem
The Mobius Tutorial Generator was displaying duplicate UI components. The App.jsx was rendering both the ScriptWorkbench component AND separate ScriptEditor/ImageMatcher components, causing a confusing interface that didn't match the intended design.

## Root Cause
In `src/ui/App.jsx`, the component structure was incorrect:
1. ScriptWorkbench was being rendered (which already contains ScriptEditor and ImageMatcher functionality)
2. Additional separate ScriptEditor and ImageMatcher components were being rendered in a tabbed interface
3. This created duplicate and overlapping UI elements

## Solution
Simplified `src/ui/App.jsx` to only render the ScriptWorkbench component, which provides the complete interface:

```javascript
import React from 'react';
import ScriptWorkbench from './ScriptWorkbench';

function App() {
  // In a real implementation, this would come from URL params or context
  const projectId = 'default-project';
  
  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <ScriptWorkbench projectId={projectId} />
    </div>
  );
}

export default App;
```

## Explanation
The ScriptWorkbench component already contains all the necessary functionality for the Mobius Tutorial Generator:
- Script editing capabilities
- Image matching functionality
- Preview generation
- Export functionality
- Proper layout and styling

By removing the duplicate components and tabbed interface, we now have a clean, straightforward interface that matches the intended design of a simple video tutorial generator.

## Files Modified
- `src/ui/App.jsx` - Removed duplicate component rendering and simplified to only use ScriptWorkbench

## Testing
After applying this fix:
1. The application displays a clean interface without duplicate components
2. All functionality (script editing, image matching, preview, export) is accessible
3. The UI matches the intended design of a simple video tutorial generator
4. No overlapping or confusing elements are present