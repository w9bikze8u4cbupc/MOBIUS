import React from 'react';
import { 
  loadInitial, 
  persist, 
  toSrt, 
  downloadJson, 
  uid 
} from '../utils/scriptUtils';

function ScriptEditor() {
  const [chapters, setChapters] = React.useState(() => loadInitial());
  const [selectedChapterId, setSelectedChapterId] = React.useState(() => chapters[0]?.id || null);
  const [selectedStepId, setSelectedStepId] = React.useState(() => chapters[0]?.steps?.[0]?.id || null);
  const [status, setStatus] = React.useState('Idle');
  const [dirty, setDirty] = React.useState(false);
  const [undoStack, setUndoStack] = React.useState([]);
  const [redoStack, setRedoStack] = React.useState([]);
  const [autosaveMs, setAutosaveMs] = React.useState(1200);

  React.useEffect(() => {
    const id = setInterval(() => {
      if (dirty) {
        setStatus('Autosaving...');
        persist(chapters);
        setDirty(false);
        setStatus('Saved');
        setTimeout(() => setStatus('Idle'), 600);
      }
    }, autosaveMs);
    return () => clearInterval(id);
  }, [dirty, chapters, autosaveMs]);

  React.useEffect(() => {
    // ensure selections are valid
    const ch = chapters.find(c => c.id === selectedChapterId) || chapters[0];
    if (!ch) return;
    if (!chapters.some(c => c.id === selectedChapterId)) setSelectedChapterId(ch.id);
    const st = ch.steps.find(s => s.id === selectedStepId) || ch.steps[0];
    if (st && st.id !== selectedStepId) setSelectedStepId(st.id);
  }, [chapters]);

  function pushUndo(snapshot) {
    setUndoStack(prev => [...prev.slice(-49), snapshot]);
    setRedoStack([]);
  }

  function takeSnapshot() {
    return JSON.stringify(chapters);
  }

  function restoreSnapshot(snap) {
    const data = JSON.parse(snap);
    setChapters(data);
  }

  function onEditStepText(chId, stepId, text) {
    pushUndo(takeSnapshot());
    setChapters(prev => prev.map(c => c.id === chId ? { ...c, steps: c.steps.map(s => s.id === stepId ? { ...s, text } : s) } : c));
    setDirty(true);
  }

  function addChapter() {
    pushUndo(takeSnapshot());
    const newChapter = { id: uid(), title: `Chapter ${chapters.length + 1}`, steps: [{ id: uid(), text: 'New step' }] };
    setChapters(prev => [...prev, newChapter]);
    setSelectedChapterId(newChapter.id);
    setSelectedStepId(newChapter.steps[0].id);
    setDirty(true);
  }

  function addStep(chId) {
    pushUndo(takeSnapshot());
    setChapters(prev => prev.map(c => c.id === chId ? { ...c, steps: [...c.steps, { id: uid(), text: 'New step' }] } : c));
    setDirty(true);
  }

  function deleteStep(chId, stepId) {
    pushUndo(takeSnapshot());
    setChapters(prev => prev.map(c => c.id === chId ? { ...c, steps: c.steps.filter(s => s.id !== stepId) } : c));
    setDirty(true);
  }

  function moveStep(chId, stepId, dir) {
    pushUndo(takeSnapshot());
    setChapters(prev => prev.map(c => {
      if (c.id !== chId) return c;
      const idx = c.steps.findIndex(s => s.id === stepId);
      const j = idx + dir;
      if (idx < 0 || j < 0 || j >= c.steps.length) return c;
      const arr = [...c.steps];
      const [item] = arr.splice(idx, 1);
      arr.splice(j, 0, item);
      return { ...c, steps: arr };
    }));
    setDirty(true);
  }

  function renameChapter(chId, title) {
    pushUndo(takeSnapshot());
    setChapters(prev => prev.map(c => c.id === chId ? { ...c, title } : c));
    setDirty(true);
  }

  function undo() {
    if (!undoStack.length) return;
    const snap = undoStack[undoStack.length - 1];
    setUndoStack(prev => prev.slice(0, -1));
    setRedoStack(prev => [...prev, takeSnapshot()]);
    restoreSnapshot(snap);
    setStatus('Undone');
  }

  function redo() {
    if (!redoStack.length) return;
    const snap = redoStack[redoStack.length - 1];
    setRedoStack(prev => prev.slice(0, -1));
    setUndoStack(prev => [...prev, takeSnapshot()]);
    restoreSnapshot(snap);
    setStatus('Redone');
  }

  function exportPackage() {
    // Produce chapters.json + srt (mock) and download as a single JSON bundle for now.
    const srt = toSrt(chapters);
    const bundle = { chapters, srt, meta: { generatedAt: new Date().toISOString(), version: 'v1' } };
    downloadJson('mobius_export_bundle.json', bundle);
  }

  function previewChapter(chId) {
    const ch = chapters.find(c => c.id === chId);
    if (!ch) return;
    setStatus(`Previewing “${ch.title}”…`);
    setTimeout(() => setStatus('Idle'), 1000);
  }

  const ch = chapters.find(c => c.id === selectedChapterId);
  const step = ch?.steps.find(s => s.id === selectedStepId);

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className={"text-sm px-2 py-1 rounded " + (dirty ? 'bg-yellow-100 text-yellow-800' : 'bg-green-100 text-green-700')}>
            {dirty ? 'Unsaved' : status}
          </span>
          <button 
            onClick={undo} 
            className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300" 
            title="Undo" 
            disabled={!undoStack.length}
          >
            Undo
          </button>
          <button 
            onClick={redo} 
            className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300" 
            title="Redo" 
            disabled={!redoStack.length}
          >
            Redo
          </button>
          <button 
            onClick={exportPackage} 
            className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Export
          </button>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-4 flex-grow">
        {/* Chapters list */}
        <aside className="col-span-3 bg-white rounded shadow p-3">
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-semibold">Chapters</h2>
            <button 
              onClick={addChapter} 
              className="px-2 py-1 bg-green-600 text-white rounded text-sm"
            >
              Add
            </button>
          </div>
          <ul className="space-y-1 max-h-[calc(100vh-200px)] overflow-y-auto">
            {chapters.map(c => (
              <li 
                key={c.id} 
                className={"p-2 rounded cursor-pointer " + (c.id === selectedChapterId ? 'bg-blue-50 border border-blue-200' : 'hover:bg-gray-50')} 
                onClick={() => { 
                  setSelectedChapterId(c.id); 
                  setSelectedStepId(c.steps[0]?.id || null); 
                }}
              >
                <input 
                  className="w-full bg-transparent outline-none" 
                  value={c.title} 
                  onChange={(e) => renameChapter(c.id, e.target.value)} 
                />
                <div className="text-xs text-gray-500">{c.steps.length} steps</div>
                <div className="mt-1 flex gap-1">
                  <button 
                    onClick={(ev) => {ev.stopPropagation(); previewChapter(c.id);}} 
                    className="text-xs px-2 py-0.5 bg-gray-200 rounded"
                  >
                    Preview
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </aside>

        {/* Steps list */}
        <section className="col-span-4 bg-white rounded shadow p-3">
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-semibold">Steps</h2>
            {ch && (
              <button 
                onClick={() => addStep(ch.id)} 
                className="px-2 py-1 bg-green-600 text-white rounded text-sm"
              >
                Add
              </button>
            )}
          </div>
          {!ch ? (
            <div className="text-sm text-gray-500">No chapter selected.</div>
          ) : (
            <ul className="space-y-1 max-h-[calc(100vh-200px)] overflow-y-auto">
              {ch.steps.map((s, idx) => (
                <li 
                  key={s.id} 
                  className={"p-2 rounded border " + (s.id === selectedStepId ? 'border-blue-300 bg-blue-50' : 'border-transparent hover:bg-gray-50')}
                >
                  <div className="flex items-center justify-between">
                    <button 
                      onClick={() => setSelectedStepId(s.id)} 
                      className="text-left flex-1"
                    >
                      Step {idx + 1}
                    </button>
                    <div className="flex items-center gap-1">
                      <button 
                        onClick={() => moveStep(ch.id, s.id, -1)} 
                        className="text-xs px-2 py-0.5 bg-gray-200 rounded" 
                        disabled={idx === 0}
                      >
                        Up
                      </button>
                      <button 
                        onClick={() => moveStep(ch.id, s.id, 1)} 
                        className="text-xs px-2 py-0.5 bg-gray-200 rounded" 
                        disabled={idx === ch.steps.length - 1}
                      >
                        Down
                      </button>
                      <button 
                        onClick={() => deleteStep(ch.id, s.id)} 
                        className="text-xs px-2 py-0.5 bg-red-600 text-white rounded"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Editor */}
        <section className="col-span-5 bg-white rounded shadow p-3">
          <h2 className="font-semibold mb-2">Editor</h2>
          {!step ? (
            <div className="text-sm text-gray-500">No step selected.</div>
          ) : (
            <textarea 
              className="w-full h-64 border rounded p-2" 
              value={step.text} 
              onChange={(e) => onEditStepText(ch.id, step.id, e.target.value)} 
            />
          )}

          <div className="mt-3">
            <label className="text-sm text-gray-600">Autosave interval (ms)</label>
            <input 
              type="number" 
              className="ml-2 border rounded p-1 w-24" 
              value={autosaveMs} 
              onChange={(e) => setAutosaveMs(Number(e.target.value || 1200))} 
            />
          </div>
        </section>
      </div>

      <footer className="p-4 text-xs text-gray-500 mt-4">
        Tip: Use Export to download a bundle (chapters + srt). In app, this will POST to /api/export.
      </footer>
    </div>
  );
}

export default ScriptEditor;