// client/src/index.js
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

const root = createRoot(document.getElementById('root'));

const disableStrict = String(process.env.REACT_APP_DISABLE_STRICT_MODE || '').toLowerCase() === 'true';
const app = <App />;

if (disableStrict) {
  root.render(app);
} else {
  root.render(<React.StrictMode>{app}</React.StrictMode>);
}