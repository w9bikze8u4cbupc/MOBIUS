import crypto from 'node:crypto';
import path from 'node:path';
import { createRequire } from 'node:module';
import { setProjectState } from './renderJobConfig.js';
import { projectSourceService } from '../services/projectSourceService.js';

const ingestionRequire = createRequire(path.join(process.cwd(), 'src', 'api', 'projectPersistenceRoutes.js'));
const { validateIngestionManifest } = ingestionRequire('../validators/ingestionValidator');

export const INGESTION_MANIFEST_RECOVERY = Object.freeze({
  MISSING: 'INGESTION_MANIFEST_MISSING',
  PROJECT_MISMATCH: 'INGESTION_MANIFEST_PROJECT_MISMATCH',
  INVALID: 'INGESTION_MANIFEST_INVALID',
});

function parsePersistedProjectField(value, fallback, fieldName, projectId) {
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    return parsed ?? fallback;
  } catch (error) {
    console.error(`Unable to hydrate project ${projectId}: invalid ${fieldName}`, error);
    return fallback;
  }
}

function parseRecoveryMetadata(value) {
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function isCanonicalProjectId(value) {
  return typeof value === 'string'
    && value.length <= 128
    && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
}

export function normalizeRecoveryProjectId(value) {
  const projectId = typeof value === 'string' ? value.trim() : '';
  return isCanonicalProjectId(projectId) ? projectId : null;
}

export function validateDurableProjectSource(sourcePdf, projectId) {
  if (sourcePdf === undefined || sourcePdf === null) return { valid: true, sourcePdf: null };
  const source = sourcePdf && typeof sourcePdf === 'object' && !Array.isArray(sourcePdf) ? sourcePdf : null;
  if (!source || source.documentId !== projectId || !/^source-[a-f0-9]{32}$/.test(source.sourceId || '')
    || !/^document-[a-f0-9]{32}$/.test(source.documentFingerprint || '') || !/^[a-f0-9]{64}$/.test(source.sha256 || '')
    || typeof source.filename !== 'string' || !source.filename || source.filename.length > 200 || /[\\/\r\n\u0000-\u001f]/.test(source.filename)
    || !Number.isInteger(source.bytes) || source.bytes < 1 || !Number.isInteger(source.pageCount) || source.pageCount < 1
    || source.provenance !== 'direct_project_upload') {
    return { valid: false, sourcePdf: null };
  }
  return { valid: true, sourcePdf: {
    sourceId: source.sourceId, documentId: source.documentId, documentFingerprint: source.documentFingerprint,
    filename: source.filename, sha256: source.sha256, bytes: source.bytes, pageCount: source.pageCount,
    provenance: source.provenance, status: source.status === 'available' ? 'available' : 'pending_contextual_render',
  } };
}

function sameDurableProjectSource(left, right) {
  return ['sourceId', 'documentId', 'documentFingerprint', 'filename', 'sha256', 'bytes', 'pageCount', 'provenance']
    .every((field) => left?.[field] === right?.[field]);
}

async function resolvePersistedProjectSource(sourcePdf, projectId, projectSource) {
  const requested = validateDurableProjectSource(sourcePdf, projectId);
  if (!requested.valid || !requested.sourcePdf) return requested;
  try {
    const persisted = validateDurableProjectSource(await projectSource.readDescriptor(projectId), projectId);
    if (!persisted.valid || !persisted.sourcePdf || !sameDurableProjectSource(requested.sourcePdf, persisted.sourcePdf)) {
      return { valid: false, sourcePdf: null };
    }
    return persisted;
  } catch {
    return { valid: false, sourcePdf: null };
  }
}

function deterministicPagesFromText(rulebookText) {
  const paragraphs = String(rulebookText || '')
    .split(/\n+/)
    .map((chunk) => chunk.trim())
    .filter(Boolean);
  const pages = [];
  for (let index = 0; index < paragraphs.length; index += 6) {
    pages.push({
      number: pages.length + 1,
      blocks: paragraphs.slice(index, index + 6).map((text) => ({ text })),
    });
  }
  return pages;
}

function deterministicPageHash(page) {
  const text = page.blocks
    .map((block) => String(block.text).normalize('NFKC').replace(/\s+/g, ' ').trim())
    .join('\n');
  return crypto.createHash('sha256').update(`${page.number}:${text}`).digest('hex');
}

function recoveryFailure(code, errors = [], diagnostics = {}) {
  return { valid: false, code, errors, diagnostics };
}

const DEVELOPMENT_RECOVERY_DIAGNOSTICS = process.env.NODE_ENV === 'development';

function createRecoveryDiagnosticId() {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 12);
}

function writeRecoveryDiagnostic(diagnostic) {
  if (!DEVELOPMENT_RECOVERY_DIAGNOSTICS) return;
  console.info('[ingestion-manifest-recovery]', JSON.stringify(diagnostic));
}

function recoveryOutcome(code) {
  if (code === INGESTION_MANIFEST_RECOVERY.MISSING) return 'missing';
  if (code === INGESTION_MANIFEST_RECOVERY.PROJECT_MISMATCH) return 'project_mismatch';
  if (code === INGESTION_MANIFEST_RECOVERY.INVALID) return 'invalid';
  return 'valid';
}

function withRecoveryDiagnostics(recovery, candidateCount, candidateOutcomes) {
  return {
    ...recovery,
    diagnostics: { candidateCount, candidateOutcomes },
  };
}

function hasUnsafeSource(value) {
  return typeof value !== 'string' || /(^[a-z]:[\\/]|^[/\\]|\.\.|[\\/])/.test(value);
}

function isBrowserSafeLabel(value) {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= 160
    && !/[\r\n\u0000-\u001f]/.test(value)
    && !/(^|\s)(?:file|https?):/i.test(value)
    && !hasUnsafeSource(value);
}

function isBrowserSafeManifestContent(manifest) {
  return isBrowserSafeLabel(manifest.document?.title)
    && manifest.outline.every((entry) => (
      /^[a-f0-9]{64}$/i.test(entry?.id || '')
      && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entry?.slug || '')
      && isBrowserSafeLabel(entry?.title)
    ))
    && manifest.components.every((component) => (
      /^comp-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(component?.id || '')
      && /^[a-z][a-z0-9-]{0,31}$/.test(component?.type || '')
      && /^[a-f0-9]{64}$/i.test(component?.sourceHeading || '')
    ));
}

function browserSafeManifest(manifest) {
  return {
    version: manifest.version,
    document: {
      id: manifest.document.id,
      title: manifest.document.title,
      gameId: manifest.document.gameId,
      source: 'canonical-local-project',
    },
    outline: manifest.outline.map(({ id, title, slug, page }) => ({ id, title, slug, page })),
    components: manifest.components.map(({
      id, type, sourceHeading, hash, pageStart, pageEnd,
    }) => ({ id, type, sourceHeading, hash, pageStart, pageEnd })),
    assets: {
      pages: manifest.assets.pages.map(({ page, hash }) => ({ page, hash })),
      components: manifest.assets.components.map(({ id, hash }) => ({ id, hash })),
    },
  };
}

export function validateDurableIngestionManifest({ projectId, manifest, rulebookText } = {}) {
  const canonicalProjectId = normalizeRecoveryProjectId(projectId);
  if (!canonicalProjectId) {
    return recoveryFailure(INGESTION_MANIFEST_RECOVERY.INVALID, ['Project ID is not canonical']);
  }
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    return recoveryFailure(INGESTION_MANIFEST_RECOVERY.MISSING, ['Manifest missing']);
  }
  if (!manifest.document || typeof manifest.document !== 'object'
    || typeof manifest.document.id !== 'string' || typeof manifest.document.gameId !== 'string') {
    return recoveryFailure(INGESTION_MANIFEST_RECOVERY.INVALID, ['Document metadata is incomplete']);
  }
  if (manifest.document.id !== canonicalProjectId || manifest.document.gameId !== canonicalProjectId) {
    return recoveryFailure(INGESTION_MANIFEST_RECOVERY.PROJECT_MISMATCH, ['Document identity does not match project']);
  }

  if (hasUnsafeSource(manifest.document.source) || !isBrowserSafeManifestContent(manifest)) {
    return recoveryFailure(INGESTION_MANIFEST_RECOVERY.INVALID, ['Manifest source is not browser-safe']);
  }

  const contractValidation = validateIngestionManifest(manifest);
  if (!contractValidation.valid) {
    return recoveryFailure(INGESTION_MANIFEST_RECOVERY.INVALID, contractValidation.errors);
  }

  const pages = deterministicPagesFromText(rulebookText);
  if (!pages.length || pages.length !== manifest.assets.pages.length) {
    return recoveryFailure(INGESTION_MANIFEST_RECOVERY.INVALID, ['Durable source pages do not match manifest']);
  }
  if (manifest.assets.pages.some((asset, index) => (
    asset?.page !== pages[index].number || asset?.hash !== deterministicPageHash(pages[index])
  ))) {
    return recoveryFailure(INGESTION_MANIFEST_RECOVERY.INVALID, ['Durable source page hashes do not match manifest']);
  }

  return { valid: true, code: null, errors: [], manifest };
}

function selectDurableManifest(metadata, context) {
  const candidates = [
    context?.ingestionManifest,
    metadata?.renderState?.ingestionManifest,
    metadata?.ingestionManifest,
  ].filter((candidate) => candidate && typeof candidate === 'object' && !Array.isArray(candidate));
  if (!candidates.length) return null;
  const serialized = candidates.map((candidate) => JSON.stringify(candidate));
  return serialized.every((candidate) => candidate === serialized[0]) ? candidates[0] : false;
}

export function recoverDurableIngestionManifest(rows, requestedProjectId) {
  const projectId = normalizeRecoveryProjectId(requestedProjectId);
  if (!projectId) {
    return withRecoveryDiagnostics(
      recoveryFailure(INGESTION_MANIFEST_RECOVERY.INVALID, ['Project ID is not canonical']),
      0,
      ['project_id:invalid'],
    );
  }

  const matchingRecords = (Array.isArray(rows) ? rows : [])
    .map((row) => ({ row, metadata: parseRecoveryMetadata(row?.metadata) }))
    .filter(({ metadata }) => metadata?.projectContext?.projectId === projectId);
  if (!matchingRecords.length) {
    return withRecoveryDiagnostics(
      recoveryFailure(INGESTION_MANIFEST_RECOVERY.MISSING, ['Project not found']),
      0,
      ['record_lookup:missing'],
    );
  }
  if (matchingRecords.length !== 1) {
    return withRecoveryDiagnostics(
      recoveryFailure(INGESTION_MANIFEST_RECOVERY.INVALID, ['Project ID is ambiguous']),
      matchingRecords.length,
      ['record_lookup:ambiguous'],
    );
  }

  const { metadata } = matchingRecords[0];
  const context = metadata.projectContext;
  if (!context || typeof context !== 'object' || Array.isArray(context)
    || context.projectId !== projectId || typeof context.rulebookText !== 'string') {
    return withRecoveryDiagnostics(
      recoveryFailure(INGESTION_MANIFEST_RECOVERY.INVALID, ['Persisted project context is invalid']),
      1,
      ['persisted_context:invalid'],
    );
  }
  const manifest = selectDurableManifest(metadata, context);
  if (manifest === false) {
    return withRecoveryDiagnostics(
      recoveryFailure(INGESTION_MANIFEST_RECOVERY.INVALID, ['Durable manifests disagree']),
      1,
      ['manifest_candidate:conflict'],
    );
  }
  if (!manifest) {
    return withRecoveryDiagnostics(
      recoveryFailure(INGESTION_MANIFEST_RECOVERY.MISSING, ['Manifest missing']),
      1,
      ['manifest_candidate:missing'],
    );
  }
  const recovery = validateDurableIngestionManifest({ projectId, manifest, rulebookText: context.rulebookText });
  return withRecoveryDiagnostics(recovery, 1, [`manifest_validation:${recoveryOutcome(recovery.code)}`]);
}

export function buildRenderProjectState(row) {
  const parsedMetadata = parsePersistedProjectField(row.metadata, {}, 'metadata', row.id);
  const metadata =
    parsedMetadata && typeof parsedMetadata === 'object' && !Array.isArray(parsedMetadata)
      ? parsedMetadata
      : {};
  const components = parsePersistedProjectField(row.components, [], 'components', row.id);
  const images = parsePersistedProjectField(row.images, [], 'images', row.id);
  const renderMetadata =
    metadata.renderState && typeof metadata.renderState === 'object'
      ? metadata.renderState
      : {};

  const projectContext = metadata.projectContext && typeof metadata.projectContext === 'object'
    ? metadata.projectContext
    : null;

  return {
    projectId: String(row.id),
    name: row.name || '',
    metadata,
    projectContext,
    components: Array.isArray(components) ? components : [],
    images: Array.isArray(images) ? images : [],
    script: row.script || '',
    audio: row.audio || '',
    // The renderer parses this serialized field after project-state hydration.
    // Omitting it makes every persisted render project look scene-less after a
    // server restart, even though /save-project stored a valid scene array.
    scenes: row.scenes,
    ingestionManifest: metadata.ingestionManifest || renderMetadata.ingestionManifest,
    storyboardManifest: metadata.storyboardManifest || renderMetadata.storyboardManifest,
    resolution: metadata.resolution || renderMetadata.resolution,
    created_at: row.created_at,
  };
}

export function hydrateRenderProjectState(db) {
  db.all('SELECT * FROM projects', [], (error, rows = []) => {
    if (error) {
      console.error('Unable to hydrate persisted project state', error);
      return;
    }

    rows.forEach((row) => {
      try {
        setProjectState(row.id, buildRenderProjectState(row));
      } catch (hydrationError) {
        console.error(`Unable to hydrate project ${row?.id ?? 'unknown'}`, hydrationError);
      }
    });
  });
}

function withDiagnosticId(payload, diagnosticId) {
  return DEVELOPMENT_RECOVERY_DIAGNOSTICS ? { ...payload, diagnosticId } : payload;
}

function sendRecoveryFailure(res, recovery, diagnosticId) {
  const status = recovery.code === INGESTION_MANIFEST_RECOVERY.MISSING ? 404 : 400;
  return res.status(status).json(withDiagnosticId({ ok: false, code: recovery.code }, diagnosticId));
}

function buildPersistedRecoveryMetadata(metadata, projectId, rulebookText, manifest, sourcePdf = null) {
  const existingMetadata = metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? metadata : {};
  const existingContext = existingMetadata.projectContext && typeof existingMetadata.projectContext === 'object'
    && !Array.isArray(existingMetadata.projectContext)
    ? existingMetadata.projectContext
    : {};
  const existingRenderState = existingMetadata.renderState && typeof existingMetadata.renderState === 'object'
    && !Array.isArray(existingMetadata.renderState)
    ? existingMetadata.renderState
    : {};
  return {
    ...existingMetadata,
    projectContext: {
      ...existingContext,
      version: 4,
      projectId,
      rulebookText,
      ...(sourcePdf ? { sourcePdf } : {}),
      ingestionManifest: manifest,
    },
    renderState: { ...existingRenderState, ingestionManifest: manifest },
  };
}

function persistDurableIngestionManifest(db, rows, { projectId, rulebookText, manifest, sourcePdf }, res) {
  const validation = validateDurableIngestionManifest({ projectId, manifest, rulebookText });
  const sourceValidation = validateDurableProjectSource(sourcePdf, projectId);
  if (!validation.valid || !sourceValidation.valid) return sendRecoveryFailure(res, recoveryFailure(INGESTION_MANIFEST_RECOVERY.INVALID));

  const matchingRecords = (Array.isArray(rows) ? rows : [])
    .map((row) => ({ row, metadata: parseRecoveryMetadata(row?.metadata) }))
    .filter(({ metadata }) => metadata?.projectContext?.projectId === projectId);
  if (matchingRecords.length > 1) {
    return sendRecoveryFailure(res, recoveryFailure(INGESTION_MANIFEST_RECOVERY.INVALID, ['Project ID is ambiguous']));
  }

  const existing = matchingRecords[0];
  const persistedMetadata = buildPersistedRecoveryMetadata(existing?.metadata, projectId, rulebookText, manifest, sourceValidation.sourcePdf);
  const complete = (error) => {
    if (error) {
      console.error('Unable to persist durable ingestion manifest', error);
      return sendRecoveryFailure(res, recoveryFailure(INGESTION_MANIFEST_RECOVERY.INVALID));
    }
    return res.json({ ok: true, projectId });
  };

  if (existing) {
    return db.run('UPDATE projects SET metadata = ? WHERE id = ?', [JSON.stringify(persistedMetadata), existing.row.id], complete);
  }
  return db.run(
    `INSERT INTO projects (name, metadata, components, images, script, audio, scenes)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [projectId, JSON.stringify(persistedMetadata), '[]', '[]', '', '', undefined],
    complete,
  );
}

export function registerProjectPersistenceRoutes(app, { db, projectSource = projectSourceService }) {
  hydrateRenderProjectState(db);

  app.post('/api/projects/recover-ingestion-manifest', (req, res) => {
    const diagnosticId = createRecoveryDiagnosticId();
    const requestedProjectId = req.body?.projectId;
    const projectId = normalizeRecoveryProjectId(requestedProjectId);
    const baseDiagnostic = {
      diagnosticId,
      recoveryAttempted: true,
      normalizedProjectId: {
        present: typeof requestedProjectId === 'string' && requestedProjectId.trim().length > 0,
        valid: Boolean(projectId),
      },
      httpRouteReached: true,
    };
    if (!projectId) {
      const recovery = withRecoveryDiagnostics(
        recoveryFailure(INGESTION_MANIFEST_RECOVERY.INVALID), 0, ['project_id:invalid'],
      );
      writeRecoveryDiagnostic({ ...baseDiagnostic, durableRecordCandidateCount: 0, candidateOutcomes: recovery.diagnostics.candidateOutcomes, finalCode: recovery.code });
      return sendRecoveryFailure(res, recovery, diagnosticId);
    }
    return db.all('SELECT * FROM projects', [], (error, rows = []) => {
      if (error) {
        console.error('Unable to recover durable ingestion manifest', error);
        const recovery = withRecoveryDiagnostics(
          recoveryFailure(INGESTION_MANIFEST_RECOVERY.INVALID), 0, ['record_lookup:error'],
        );
        writeRecoveryDiagnostic({ ...baseDiagnostic, durableRecordCandidateCount: 0, candidateOutcomes: recovery.diagnostics.candidateOutcomes, finalCode: recovery.code });
        return sendRecoveryFailure(res, recovery, diagnosticId);
      }
      const recovery = recoverDurableIngestionManifest(rows, projectId);
      writeRecoveryDiagnostic({
        ...baseDiagnostic,
        durableRecordCandidateCount: recovery.diagnostics.candidateCount,
        candidateOutcomes: recovery.diagnostics.candidateOutcomes,
        finalCode: recovery.code,
      });
      if (!recovery.valid) return sendRecoveryFailure(res, recovery, diagnosticId);
      // Never expose durable source text, filesystem metadata, or media paths to the browser.
      return res.json(withDiagnosticId({ ok: true, manifest: browserSafeManifest(recovery.manifest) }, diagnosticId));
    });
  });

  app.post('/api/projects/persist-ingestion-manifest', async (req, res) => {
    const projectId = normalizeRecoveryProjectId(req.body?.projectId);
    if (!projectId || typeof req.body?.rulebookText !== 'string') {
      return sendRecoveryFailure(res, recoveryFailure(INGESTION_MANIFEST_RECOVERY.INVALID));
    }
    const sourceValidation = await resolvePersistedProjectSource(req.body.sourcePdf, projectId, projectSource);
    if (!sourceValidation.valid) {
      return sendRecoveryFailure(res, recoveryFailure(INGESTION_MANIFEST_RECOVERY.INVALID));
    }
    return db.all('SELECT * FROM projects', [], (error, rows = []) => {
      if (error) {
        console.error('Unable to locate durable project for ingestion persistence', error);
        return sendRecoveryFailure(res, recoveryFailure(INGESTION_MANIFEST_RECOVERY.INVALID));
      }
      return persistDurableIngestionManifest(db, rows, {
        projectId,
        rulebookText: req.body.rulebookText,
        manifest: req.body.manifest,
        sourcePdf: sourceValidation.sourcePdf,
      }, res);
    });
  });

  app.post('/save-project', (req, res) => {
    const { name, metadata, components, images, script, audio, scenes, projectContext } = req.body;
    const persistedMetadata = {
      ...(metadata && typeof metadata === 'object' ? metadata : {}),
      ...(projectContext && typeof projectContext === 'object' ? { projectContext } : {}),
    };

    db.run(
      `INSERT INTO projects (name, metadata, components, images, script, audio, scenes)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        name,
        JSON.stringify(persistedMetadata),
        JSON.stringify(components),
        JSON.stringify(images),
        script,
        audio,
        scenes === undefined ? undefined : JSON.stringify(scenes),
      ],
      function (error) {
        if (error) {
          console.error(error);
          return res.status(500).json({ error: 'Failed to save project. Please try again later.' });
        }

        const projectId = this.lastID;
        db.get(
          'SELECT * FROM projects WHERE id = ?',
          [projectId],
          (loadError, row) => {
            if (loadError || !row) {
              console.error('Failed to hydrate saved project state', loadError);
            } else {
              setProjectState(row.id, buildRenderProjectState(row));
            }
            return res.json({ status: 'success', projectId });
          },
        );
      },
    );
  });

  // Idempotent canonical-state boundary used by unattended production. Unlike
  // the historical browser /save-project endpoint, this route updates the
  // newest row for a canonical project ID and therefore cannot create a
  // duplicate project on retry. The immutable source descriptor is checked
  // against project-owned storage before any state is written.
  app.post('/api/projects/:projectId/production-state', async (req, res) => {
    const projectId = normalizeRecoveryProjectId(req.params.projectId);
    if (!projectId) return res.status(400).json({ code: 'PROJECT_ID_INVALID', error: 'Project ID is invalid.' });

    const body = req.body || {};
    const context = body.projectContext && typeof body.projectContext === 'object' && !Array.isArray(body.projectContext)
      ? body.projectContext : {};
    if (context.projectId && context.projectId !== projectId) {
      return res.status(400).json({ code: 'PROJECT_ID_MISMATCH', error: 'Project context does not match the route project ID.' });
    }
    if (context.sourcePdf) {
      const source = await resolvePersistedProjectSource(context.sourcePdf, projectId, projectSource);
      if (!source.valid) return res.status(409).json({ code: 'SOURCE_PDF_INVALID', error: 'The canonical source descriptor is invalid or does not match project storage.' });
    }

    return db.all('SELECT * FROM projects', [], (lookupError, rows = []) => {
      if (lookupError) return res.status(500).json({ code: 'PROJECT_STATE_LOOKUP_FAILED', error: 'Unable to locate canonical project state.' });
      const matches = rows.filter((row) => parseRecoveryMetadata(row?.metadata)?.projectContext?.projectId === projectId)
        .sort((left, right) => Number(right?.id || 0) - Number(left?.id || 0));
      if (matches.length > 1) console.warn(`[production-state] retaining ${matches.length - 1} historical row(s) for ${projectId}`);

      const metadata = {
        ...(body.metadata && typeof body.metadata === 'object' && !Array.isArray(body.metadata) ? body.metadata : {}),
        projectContext: { ...context, projectId },
      };
      const values = [
        body.name || context.gameName || projectId,
        JSON.stringify(metadata),
        JSON.stringify(Array.isArray(body.components) ? body.components : []),
        JSON.stringify(Array.isArray(body.images) ? body.images : []),
        typeof body.script === 'string' ? body.script : JSON.stringify(body.script || ''),
        typeof body.audio === 'string' ? body.audio : JSON.stringify(body.audio || ''),
        body.scenes === undefined ? undefined : JSON.stringify(body.scenes),
      ];
      const current = matches[0];
      const finish = (error, rowId, created) => {
        if (error) {
          console.error('Unable to persist canonical production state', error);
          return res.status(500).json({ code: 'PROJECT_STATE_PERSIST_FAILED', error: 'Unable to persist canonical production state.' });
        }
        db.get('SELECT * FROM projects WHERE id = ?', [rowId], (loadError, row) => {
          if (!loadError && row) setProjectState(row.id, buildRenderProjectState(row));
          return res.json({ ok: true, projectId, rowId, created, updated: !created, historicalRows: Math.max(0, matches.length - 1) });
        });
      };

      if (current) {
        return db.run(
          `UPDATE projects SET name = ?, metadata = ?, components = ?, images = ?, script = ?, audio = ?, scenes = ? WHERE id = ?`,
          [...values, current.id],
          function updateComplete(error) { finish(error, current.id, false); },
        );
      }
      return db.run(
        `INSERT INTO projects (name, metadata, components, images, script, audio, scenes) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        values,
        function insertComplete(error) { finish(error, this.lastID, true); },
      );
    });
  });

  app.get('/load-project/:id', (req, res) => {
    const apiKey = req.headers['x-api-key'];
    if (!apiKey || apiKey !== process.env.API_KEY) {
      return res.status(401).json({ error: 'Unauthorized: Invalid API key' });
    }

    const respondWithProject = (error, row) => {
        if (error) {
          console.error(error);
          return res.status(500).json({ error: 'Failed to load project' });
        }
        if (!row) {
          return res.status(404).json({ error: 'Project not found' });
        }

        try {
          const parsedMetadata = JSON.parse(row.metadata);
          const project = {
            id: row.id,
            name: row.name,
            metadata: parsedMetadata,
            projectContext: parsedMetadata?.projectContext || null,
            components: JSON.parse(row.components),
            images: JSON.parse(row.images),
            script: row.script,
            audio: row.audio,
            created_at: row.created_at,
          };
          if (row.scenes !== undefined) {
            project.scenes = JSON.parse(row.scenes);
          }
          return res.json(project);
        } catch (parseError) {
          console.error('Failed to parse project data:', parseError);
          return res.status(500).json({ error: 'Failed to parse project data' });
        }
    };

    db.get(
      'SELECT * FROM projects WHERE id = ?',
      [req.params.id],
      (error, row) => {
        if (error || row || /^\d+$/.test(String(req.params.id))) {
          return respondWithProject(error, row);
        }

        // The durable API historically exposed the SQLite/file-storage row ID,
        // while the rest of MOBIUS identifies a project by
        // metadata.projectContext.projectId. Resolve that canonical identifier
        // through the same persisted store so production CLIs do not need to
        // know an implementation-specific numeric row ID.
        return db.all('SELECT * FROM projects', [], (lookupError, rows = []) => {
          if (lookupError) return respondWithProject(lookupError, null);
          const matches = rows.filter((candidate) => {
            const metadata = parseRecoveryMetadata(candidate?.metadata);
            return metadata?.projectContext?.projectId === req.params.id;
          });
          // `/save-project` is append-only, so a browser recovery can leave
          // several rows for one canonical project ID. The newest row is the
          // durable current state; retain older rows for audit/recovery rather
          // than forcing callers to know a numeric row ID.
          const current = matches
            .slice()
            .sort((left, right) => Number(right?.id || 0) - Number(left?.id || 0))[0];
          return respondWithProject(null, current);
        });
      },
    );
  });
}
