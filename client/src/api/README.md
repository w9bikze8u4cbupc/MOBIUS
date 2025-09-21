# API Modules

This directory contains modules for interacting with the backend API.

## Direct Function Modules

- [extractActions.js](file:///c:/Users/danie/Documents/mobius-games-tutorial-generator/client/src/api/extractActions.js) - Functions for extracting actions from PDFs
- [extractPdfImages.js](file:///c:/Users/danie/Documents/mobius-games-tutorial-generator/client/src/api/extractPdfImages.js) - Functions for extracting images from PDFs

## Hook-Based Modules

- [extractActionsHook.js](file:///c:/Users/danie/Documents/mobius-games-tutorial-generator/client/src/api/extractActionsHook.js) - React hooks for extracting actions from PDFs
- [extractPdfImagesHook.js](file:///c:/Users/danie/Documents/mobius-games-tutorial-generator/client/src/api/extractPdfImagesHook.js) - React hooks for extracting images from PDFs

## Usage

### Direct Function Usage:

```javascript
import { extractActionsByUrl } from './api/extractActions';

const images = await extractActionsByUrl('https://example.com/pdf');
```

### Hook-Based Usage:

```javascript
import { useExtractActionsApi } from './api/extractActionsHook';

function MyComponent() {
  const { extractActions } = useExtractActionsApi();

  const handleExtract = async () => {
    const data = await extractActions({ pdfUrl: 'https://example.com/pdf' });
    // Process data
  };
}
```
