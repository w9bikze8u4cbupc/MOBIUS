import React, { useEffect, useMemo, useState } from 'react';
import ScriptEditor from './ScriptEditor';
import ImageMatcher from './components/ImageMatcher';
import { loadInitial, persist } from '../utils/scriptUtils';

// Use a default value instead of process.env which isn't available in Vite
const AUTOSAVE_MS = 4000;

export default function ScriptWorkbench({ projectId }) {
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [previewJob, setPreviewJob] = useState(null);
  const [state, setState] = useState({
    chapters: loadInitial(),
    activeChapterId: loadInitial()[0]?.id || null,
    activeStepId: loadInitial()[0]?.steps?.[0]?.id || null,
    assetMatches: {},
    dirty: false
  });

  useEffect(() => {
    // In a real implementation, this would fetch from the backend
    // For now, we're using localStorage
    const saved = localStorage.getItem('mobius_script_v1');
    if (saved) {
      try {
        const project = JSON.parse(saved);
        setState(prev => ({
          ...prev,
          chapters: project,
          activeChapterId: project[0]?.id || null,
          activeStepId: project[0]?.steps?.[0]?.id || null
        }));
      } catch (error) {
        console.error('workbench_fetch_failed', { error, projectId });
        setSaveError('Failed to load project state.');
      }
    }
  }, [projectId]);

  useEffect(() => {
    if (!state.dirty) return;
    const timer = setTimeout(async () => {
      try {
        setIsSaving(true);
        persist(state.chapters);
        setState(prev => ({ ...prev, dirty: false }));
        setSaveError(null);
      } catch (error) {
        console.error('workbench_autosave_failed', { error, projectId });
        setSaveError('Autosave failed. Check console and retry.');
      } finally {
        setIsSaving(false);
      }
    }, AUTOSAVE_MS);
    return () => clearTimeout(timer);
  }, [state, projectId]);

  const selectedChapter = useMemo(
    () => state.chapters.find((chapter) => chapter.id === state.activeChapterId) ?? null,
    [state.chapters, state.activeChapterId]
  );

  const handlePreview = async () => {
    if (!selectedChapter) return;
    setPreviewJob({ status: 'pending' });
    
    // In a real implementation, this would call the backend
    // For now, we're simulating the call
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const job = {
        status: 'queued',
        jobToken: Math.random().toString(36).substring(2, 15),
        previewPath: `previews/${selectedChapter.id}.json`
      };
      
      setPreviewJob(job);
    } catch (error) {
      console.error('workbench_preview_failed', { error, projectId });
      setPreviewJob({ status: 'error', message: error.message ?? 'Preview request failed.' });
    }
  };

  const dispatch = (action) => {
    switch (action.type) {
      case 'SET_CHAPTERS':
        setState(prev => ({ ...prev, chapters: action.payload, dirty: true }));
        break;
      case 'SET_ACTIVE_CHAPTER':
        setState(prev => ({ ...prev, activeChapterId: action.payload, dirty: true }));
        break;
      case 'SET_ACTIVE_STEP':
        setState(prev => ({ ...prev, activeStepId: action.payload, dirty: true }));
        break;
      case 'MATCH_ASSET_TO_STEP':
        setState(prev => ({
          ...prev,
          assetMatches: {
            ...prev.assetMatches,
            [action.payload.stepId]: action.payload.assetId
          },
          dirty: true
        }));
        break;
      case 'UNMATCH_ASSET_FROM_STEP':
        setState(prev => {
          const newMatches = { ...prev.assetMatches };
          delete newMatches[action.payload.stepId];
          return { ...prev, assetMatches: newMatches, dirty: true };
        });
        break;
      default:
        console.warn('Unknown action type:', action.type);
    }
  };

  const undo = () => {
    // In a real implementation, this would use the undo stack
    console.log('Undo action');
  };

  const redo = () => {
    // In a real implementation, this would use the redo stack
    console.log('Redo action');
  };

  const canUndo = false; // In a real implementation, this would check the undo stack
  const canRedo = false; // In a real implementation, this would check the redo stack

  return (
    <div className="script-workbench">
      <header className="workbench-header">
        <div>
          <h1>Script Workbench</h1>
          <p className="subtitle">
            Manage script content, match imagery, and request preview renders.
          </p>
        </div>
        <div className="toolbar">
          <button onClick={undo} disabled={!canUndo}>Undo</button>
          <button onClick={redo} disabled={!canRedo}>Redo</button>
          <button onClick={handlePreview} disabled={!selectedChapter}>Preview Chapter</button>
        </div>
        <div className="status">
          {isSaving ? <span className="saving">Autosaving…</span> : state.dirty ? <span className="dirty">Unsaved changes</span> : <span className="clean">All changes saved</span>}
          {saveError && <span className="error">{saveError}</span>}
        </div>
      </header>

      <main className="workbench-grid">
        <section className="script-pane" aria-label="Script editor">
          <ScriptEditor 
            chapters={state.chapters}
            activeChapterId={state.activeChapterId}
            activeStepId={state.activeStepId}
            dispatch={dispatch}
          />
        </section>
        <section className="matcher-pane" aria-label="Image matcher">
          <ImageMatcher
            projectId={projectId}
            chapters={state.chapters}
            matches={state.assetMatches}
            dispatch={dispatch}
          />
        </section>
        <aside className="preview-pane" aria-label="Preview status">
          <PreviewPane job={previewJob} onRefresh={() => handlePreview()} />
        </aside>
      </main>
    </div>
  );
}

function PreviewPane({ job, onRefresh }) {
  if (!job) {
    return (
      <div className="preview-pane">
        <h3>Preview</h3>
        <p>No preview requested yet.</p>
      </div>
    );
  }

  return (
    <div className="preview-pane">
      <h3>Preview Status</h3>
      {job.status === 'pending' && <p>Requesting preview...</p>}
      {job.status === 'queued' && (
        <div>
          <p>Preview queued:</p>
          <p>Job Token: {job.jobToken}</p>
          <p>Path: {job.previewPath}</p>
        </div>
      )}
      {job.status === 'error' && (
        <div>
          <p>Error: {job.message}</p>
          <button onClick={onRefresh}>Retry</button>
        </div>
      )}
    </div>
  );
}