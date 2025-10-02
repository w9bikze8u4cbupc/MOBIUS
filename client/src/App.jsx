import React from 'react';

import DevTestPage from './components/DevTestPage';
import TutorialOrchestrator from './components/TutorialOrchestrator';
import { ToastProvider } from './contexts/ToastContext';

const SHOW_DEV_TEST =
  String(process.env.REACT_APP_SHOW_DEV_TEST || '').toLowerCase() === 'true';

function App() {
  return React.createElement(
    ToastProvider,
    null,
    SHOW_DEV_TEST
      ? React.createElement(DevTestPage, null)
      : React.createElement(TutorialOrchestrator, null)
  );
}

export default App;
