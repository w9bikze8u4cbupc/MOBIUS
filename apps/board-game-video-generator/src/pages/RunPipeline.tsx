import { useCallback, useEffect, useState } from 'react';
import SegmentTable, { SegmentRow } from '../components/SegmentTable';
import Status, { Toast } from '../components/Status';
import {
  composePreview,
  exportProject,
  exportStatus,
  generateScript,
  generateTts,
  ingestBgg,
  ingestPdf,
  loadProject,
  saveProject,
} from '../lib/api';

const LOCAL_STORAGE_KEY = 'mobius.projectId';

type LoadingKey =
  | 'load'
  | 'save'
  | 'pdf'
  | 'script'
  | 'tts'
  | 'render'
  | 'export';

type LoadingState = Record<LoadingKey, boolean>;

interface ExportState {
  exportId: string;
  state: string;
  zipPath?: string | null;
  error?: string;
}

interface ManifestRulebook {
  filename: string;
  size: number;
  heuristicsApplied?: boolean;
  uploadedAt?: string;
}

function formatBytes(bytes?: number): string {
  if (!bytes) {
    return '—';
  }
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function RunPipeline() {
  const [projectId, setProjectId] = useState(() => {
    if (typeof window === 'undefined') {
      return '';
    }
    return window.localStorage.getItem(LOCAL_STORAGE_KEY) ?? '';
  });
  const [bggUrl, setBggUrl] = useState('');
  const [applyHeuristics, setApplyHeuristics] = useState(true);
  const [rulebook, setRulebook] = useState<ManifestRulebook | null>(null);
  const [segments, setSegments] = useState<SegmentRow[]>([]);
  const [loading, setLoading] = useState<LoadingState>({
    load: false,
    save: false,
    pdf: false,
    script: false,
    tts: false,
    render: false,
    export: false,
  });
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [exportState, setExportState] = useState<ExportState | null>(null);
  const [manifest, setManifest] = useState<any>(null);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    if (projectId) {
      window.localStorage.setItem(LOCAL_STORAGE_KEY, projectId);
    }
  }, [projectId]);

  const pushToast = useCallback((message: string, variant: Toast['variant'] = 'info') => {
    setToasts((prev) => [...prev, { id: `${Date.now()}-${Math.random()}`, message, variant }]);
  }, []);

  const clearToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const updateLoading = useCallback((key: LoadingKey, value: boolean) => {
    setLoading((prev) => ({ ...prev, [key]: value }));
  }, []);

  const ensureProjectId = useCallback(() => {
    if (!projectId) {
      pushToast('Please provide a Project ID.', 'error');
      return false;
    }
    return true;
  }, [projectId, pushToast]);

  const handleLoad = useCallback(async () => {
    if (!ensureProjectId()) {
      return;
    }
    updateLoading('load', true);
    const result = await loadProject(projectId);
    updateLoading('load', false);
    if (!result.ok || !result.data) {
      pushToast(
        `Load failed (${result.endpoint}) [${result.status ?? 'n/a'}]: ${result.error ?? 'Unknown error'}`,
        'error',
      );
      return;
    }
    const loaded = result.data.project ?? {};
    setManifest(loaded);
    setBggUrl(loaded?.bgg?.url ?? '');
    setRulebook(loaded?.rulebook ?? null);
    const loadedSegments: SegmentRow[] = loaded?.tts?.segments ?? loaded?.script?.segments ?? [];
    setSegments(
      loadedSegments.map((seg: any) => ({
        id: seg.id,
        title: seg.title,
        duration: seg.duration,
        text: seg.text,
      })),
    );
    pushToast('Project loaded successfully.', 'success');
  }, [ensureProjectId, projectId, pushToast, updateLoading]);

  const handleSave = useCallback(async () => {
    if (!ensureProjectId()) {
      return;
    }
    if (!bggUrl) {
      pushToast('Please provide a BGG URL before saving.', 'error');
      return;
    }
    updateLoading('save', true);
    const ingestResult = await ingestBgg(projectId, bggUrl);
    if (!ingestResult.ok || !ingestResult.data) {
      updateLoading('save', false);
      pushToast(
        `BGG ingest failed (${ingestResult.endpoint}) [${ingestResult.status ?? 'n/a'}]: ${
          ingestResult.error ?? 'Unknown error'
        }`,
        'error',
      );
      return;
    }
    const manifestPayload = ingestResult.data.project;
    const saveResult = await saveProject(projectId, manifestPayload);
    updateLoading('save', false);
    if (!saveResult.ok || !saveResult.data) {
      pushToast(
        `Save failed (${saveResult.endpoint}) [${saveResult.status ?? 'n/a'}]: ${
          saveResult.error ?? 'Unknown error'
        }`,
        'error',
      );
      return;
    }
    setManifest(saveResult.data.project);
    pushToast('Project saved with BGG metadata.', 'success');
  }, [bggUrl, ensureProjectId, projectId, pushToast, updateLoading]);

  const handlePdfUpload = useCallback(
    async (file: File | null) => {
      if (!file) {
        return;
      }
      if (!ensureProjectId()) {
        return;
      }
      updateLoading('pdf', true);
      const result = await ingestPdf(projectId, file, applyHeuristics);
      updateLoading('pdf', false);
      if (!result.ok || !result.data) {
        pushToast(
          `PDF upload failed (${result.endpoint}) [${result.status ?? 'n/a'}]: ${
            result.error ?? 'Unknown error'
          }`,
          'error',
        );
        return;
      }
      const project = result.data.project;
      setManifest(project);
      setRulebook(project.rulebook ?? null);
      pushToast(`Rulebook uploaded (${file.name}).`, 'success');
    },
    [applyHeuristics, ensureProjectId, projectId, pushToast, updateLoading],
  );

  const handleScript = useCallback(async () => {
    if (!ensureProjectId()) {
      return;
    }
    updateLoading('script', true);
    const result = await generateScript(projectId, 'en');
    updateLoading('script', false);
    if (!result.ok || !result.data) {
      pushToast(
        `Script generation failed (${result.endpoint}) [${result.status ?? 'n/a'}]: ${
          result.error ?? 'Unknown error'
        }`,
        'error',
      );
      return;
    }
    const generatedSegments: SegmentRow[] = (result.data.segments ?? []).map((segment: any) => ({
      id: segment.id,
      title: segment.title,
      duration: segment.duration,
      text: segment.text,
    }));
    setSegments(generatedSegments);
    pushToast('Script generated.', 'success');
  }, [ensureProjectId, projectId, pushToast, updateLoading]);

  const handleTts = useCallback(async () => {
    if (!ensureProjectId()) {
      return;
    }
    if (!segments.length) {
      pushToast('Generate a script before running TTS.', 'error');
      return;
    }
    updateLoading('tts', true);
    const result = await generateTts(
      projectId,
      segments.map((segment) => ({
        id: segment.id,
        title: segment.title,
        duration: segment.duration,
        text: segment.text ?? `Narration for ${segment.title ?? segment.id}`,
      })),
    );
    updateLoading('tts', false);
    if (!result.ok || !result.data) {
      pushToast(
        `TTS generation failed (${result.endpoint}) [${result.status ?? 'n/a'}]: ${
          result.error ?? 'Unknown error'
        }`,
        'error',
      );
      return;
    }
    const ttsSegments: SegmentRow[] = (result.data.segments ?? []).map((segment: any) => ({
      id: segment.id,
      title: segment.title,
      duration: segment.duration,
      text: segment.text,
    }));
    setSegments(ttsSegments);
    pushToast('TTS generated.', 'success');
  }, [ensureProjectId, projectId, pushToast, segments, updateLoading]);

  const handleRender = useCallback(async () => {
    if (!ensureProjectId()) {
      return;
    }
    updateLoading('render', true);
    const result = await composePreview(projectId);
    updateLoading('render', false);
    if (!result.ok || !result.data) {
      pushToast(
        `Preview composition failed (${result.endpoint}) [${result.status ?? 'n/a'}]: ${
          result.error ?? 'Unknown error'
        }`,
        'error',
      );
      return;
    }
    pushToast('Preview composed successfully.', 'success');
  }, [ensureProjectId, projectId, pushToast, updateLoading]);

  const handleExport = useCallback(async () => {
    if (!ensureProjectId()) {
      return;
    }
    updateLoading('export', true);
    const result = await exportProject(projectId);
    updateLoading('export', false);
    if (!result.ok || !result.data) {
      pushToast(
        `Export failed (${result.endpoint}) [${result.status ?? 'n/a'}]: ${result.error ?? 'Unknown error'}`,
        'error',
      );
      return;
    }
    setExportState({ exportId: result.data.exportId, state: result.data.state ?? 'processing' });
    pushToast(`Export started (${result.data.exportId}).`, 'info');
  }, [ensureProjectId, projectId, pushToast, updateLoading]);

  useEffect(() => {
    if (!exportState || !exportState.exportId) {
      return undefined;
    }
    if (exportState.state === 'complete' || exportState.state === 'failed') {
      return undefined;
    }
    const interval = setInterval(async () => {
      const status = await exportStatus(exportState.exportId);
      if (!status.ok || !status.data) {
        pushToast(
          `Export status failed (${status.endpoint}) [${status.status ?? 'n/a'}]: ${
            status.error ?? 'Unknown error'
          }`,
          'error',
        );
        return;
      }
      const next = status.data;
      setExportState({
        exportId: next.exportId,
        state: next.state,
        zipPath: next.zipPath,
        error: next.error,
      });
      if (next.state === 'complete') {
        pushToast(`Export ready at ${next.zipPath}`, 'success');
      }
      if (next.state === 'failed') {
        pushToast(`Export failed: ${next.error ?? 'Unknown reason'}`, 'error');
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [exportState, pushToast]);

  return (
    <div className="main-container">
      <h1>Board Game Video Generator</h1>

      <div className="section">
        <h2>1. Project</h2>
        <label htmlFor="project-id">Project ID</label>
        <input
          id="project-id"
          value={projectId}
          onChange={(event) => setProjectId(event.target.value)}
          placeholder="demo123"
        />
        <label htmlFor="bgg-url">BoardGameGeek URL</label>
        <input
          id="bgg-url"
          type="url"
          value={bggUrl}
          onChange={(event) => setBggUrl(event.target.value)}
          placeholder="https://boardgamegeek.com/boardgame/..."
        />
        <div className="actions">
          <button className="secondary" disabled={loading.load} onClick={handleLoad}>
            {loading.load ? 'Loading…' : 'Load'}
          </button>
          <button className="primary" disabled={loading.save} onClick={handleSave}>
            {loading.save ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      <div className="section">
        <h2>2. Rulebook</h2>
        <label htmlFor="rulebook-file">Upload PDF</label>
        <input
          id="rulebook-file"
          type="file"
          accept="application/pdf"
          onChange={(event) => handlePdfUpload(event.target.files?.[0] ?? null)}
          disabled={loading.pdf || !projectId}
        />
        <label>
          <input
            type="checkbox"
            checked={applyHeuristics}
            onChange={(event) => setApplyHeuristics(event.target.checked)}
            disabled={loading.pdf}
          />
          &nbsp;Apply heuristics
        </label>
        {rulebook && (
          <p>
            Uploaded: <strong>{rulebook.filename}</strong> ({formatBytes(rulebook.size)}) · Heuristics:{' '}
            {rulebook.heuristicsApplied ? 'Yes' : 'No'}
          </p>
        )}
      </div>

      <div className="section">
        <h2>3. Script / TTS / Render</h2>
        <div className="actions">
          <button className="primary" disabled={loading.script || !projectId} onClick={handleScript}>
            {loading.script ? 'Generating…' : 'Generate Script'}
          </button>
          <button className="primary" disabled={loading.tts || !segments.length} onClick={handleTts}>
            {loading.tts ? 'Synthesizing…' : 'Generate TTS'}
          </button>
          <button className="primary" disabled={loading.render || !projectId} onClick={handleRender}>
            {loading.render ? 'Composing…' : 'Compose Preview'}
          </button>
        </div>
        <SegmentTable segments={segments} />
      </div>

      <div className="section">
        <h2>4. Export</h2>
        <button className="primary" disabled={loading.export || !projectId} onClick={handleExport}>
          {loading.export ? 'Exporting…' : 'Export Package'}
        </button>
        {exportState && (
          <p>
            Export {exportState.exportId} → Status: <strong>{exportState.state}</strong>{' '}
            {exportState.zipPath && (
              <span className="download-link">
                • Package:{' '}
                <a href={`file://${exportState.zipPath}`} target="_blank" rel="noreferrer">
                  {exportState.zipPath}
                </a>
              </span>
            )}
          </p>
        )}
      </div>

      <Status toasts={toasts} onClear={clearToast} />
    </div>
  );
}
