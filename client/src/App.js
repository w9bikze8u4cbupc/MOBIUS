import React from 'react';

import TutorialOrchestrator from './components/TutorialOrchestrator';

function App() {
  return React.createElement(
    'div',
    { className: 'App' },
    React.createElement(TutorialOrchestrator, null)
  );
}

export default App;
