import crypto from 'node:crypto';
import path from 'node:path';
import { createRequire } from 'node:module';
import { setProjectState } from './renderJobConfig.js';

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

function recoveryFailure(code, errors = []) {
  return { valid: false, code, errors };
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
  if (!projectId) return recoveryFailure(INGESTION_MANIFEST_RECOVERY.INVALID, ['Project ID is not canonical']);

  const matchingRecords = (Array.isArray(rows) ? rows : [])
    .map((row) => ({ row, metadata: parseRecoveryMetadata(row?.metadata) }))
    .filter(({ metadata }) => metadata?.projectContext?.projectId === projectId);
  if (!matchingRecords.length) return recoveryFailure(INGESTION_MANIFEST_RECOVERY.MISSING, ['Project not found']);
  if (matchingRecords.length !== 1) {
    return recoveryFailure(INGESTION_MANIFEST_RECOVERY.INVALID, ['Project ID is ambiguous']);
  }

  const { metadata } = matchingRecords[0];
  const context = metadata.projectContext;
  if (!context || typeof context !== 'object' || Array.isArray(context)
    || context.projectId !== projectId || typeof context.rulebookText !== 'string') {
    return recoveryFailure(INGESTION_MANIFEST_RECOVERY.INVALID, ['Persisted project context is invalid']);
  }
  const manifest = selectDurableManifest(metadata, context);
  if (manifest === false) {
    return recoveryFailure(INGESTION_MANIFEST_RECOVERY.INVALID, ['Durable manifests disagree']);
  }
  return validateDurableIngestionManifest({ projectId, manifest, rulebookText: context.rulebookText });
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

function sendRecoveryFailure(res, recovery) {
  const status = recovery.code === INGESTION_MANIFEST_RECOVERY.MISSING ? 404 : 400;
  return res.status(status).json({ ok: false, code: recovery.code });
}

export function registerProjectPersistenceRoutes(app, { db }) {
  hydrateRenderProjectState(db);

  app.post('/api/projects/recover-ingestion-manifest', (req, res) => {
    const projectId = normalizeRecoveryProjectId(req.body?.projectId);
    if (!projectId) {
      return sendRecoveryFailure(res, recoveryFailure(INGESTION_MANIFEST_RECOVERY.INVALID));
    }
    return db.all('SELECT * FROM projects', [], (error, rows = []) => {
      if (error) {
        console.error('Unable to recover durable ingestion manifest', error);
        return sendRecoveryFailure(res, recoveryFailure(INGESTION_MANIFEST_RECOVERY.INVALID));
      }
      const recovery = recoverDurableIngestionManifest(rows, projectId);
      if (!recovery.valid) return sendRecoveryFailure(res, recovery);
      // Never expose durable source text, filesystem metadata, or media paths to the browser.
      return res.json({ ok: true, manifest: browserSafeManifest(recovery.manifest) });
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

  app.get('/load-project/:id', (req, res) => {
    const apiKey = req.headers['x-api-key'];
    if (!apiKey || apiKey !== process.env.API_KEY) {
      return res.status(401).json({ error: 'Unauthorized: Invalid API key' });
    }

    db.get(
      'SELECT * FROM projects WHERE id = ?',
      [req.params.id],
      (error, row) => {
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
      },
    );
  });
}
