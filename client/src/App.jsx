import React from 'react';
import { getShowDevTest } from './utils/env';

import DevTestPage from './components/DevTestPage';
import TutorialOrchestrator from './components/TutorialOrchestrator';
import { ToastProvider } from './contexts/ToastContext';

const SHOW_DEV_TEST = getShowDevTest();
console.log('SHOW_DEV_TEST constant:', SHOW_DEV_TEST);

function App() {
  console.log('Rendering App component, SHOW_DEV_TEST:', SHOW_DEV_TEST);
  return React.createElement(
    ToastProvider,
    null,
    SHOW_DEV_TEST
      ? React.createElement(DevTestPage, null)
      : React.createElement(TutorialOrchestrator, null)
  );
}

export default App;
