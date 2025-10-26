import React, { useState } from 'react';
import ScriptWorkbench from './ScriptWorkbench';
import ScriptEditor from './ScriptEditor';
import ImageMatcher from './ImageMatcher';

function App() {
  // In a real implementation, this would come from URL params or context
  const projectId = 'default-project';
  const [activeTab, setActiveTab] = useState('editor');
  
  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <header className="flex items-center justify-between px-4 py-3 bg-white shadow">
        <h1 className="text-xl font-semibold">Mobius Script Editor (Phase F)</h1>
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setActiveTab('editor')}
            className={`px-3 py-1 rounded ${activeTab === 'editor' ? 'bg-blue-600 text-white' : 'bg-gray-200 hover:bg-gray-300'}`}
          >
            Script Editor
          </button>
          <button 
            onClick={() => setActiveTab('images')}
            className={`px-3 py-1 rounded ${activeTab === 'images' ? 'bg-blue-600 text-white' : 'bg-gray-200 hover:bg-gray-300'}`}
          >
            Image Matcher
          </button>
        </div>
      </header>

      <main className="p-4">
        {activeTab === 'editor' && <ScriptEditor />}
        {activeTab === 'images' && <ImageMatcher />}
      </main>
    </div>
  );
}

export default App;