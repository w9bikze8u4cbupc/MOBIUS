import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ToastProvider } from './contexts/ToastContext';
import DevTestPage from './components/DevTestPage';

const root = ReactDOM.createRoot(document.getElementById('root'));
const SHOW_DEV_TEST =
  String(process.env.REACT_APP_SHOW_DEV_TEST || '').toLowerCase() === 'true';

root.render(
  <React.StrictMode>
    <ToastProvider>{SHOW_DEV_TEST ? <DevTestPage /> : <App />}</ToastProvider>
  </React.StrictMode>
);
