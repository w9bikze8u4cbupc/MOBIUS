const {
  INGESTION_MANIFEST_RECOVERY,
  recoverDurableIngestionManifest,
  registerProjectPersistenceRoutes,
} = require('../../src/api/projectPersistenceRoutes.js');
const { runIngestionPipeline } = require('../../src/ingestion/pipeline');

const projectId = 'abyss-mstkmf2r-4mlb';
const rulebookText = [
  'Setup', 'Place the board.', 'Shuffle the decks.', 'Give each player two pearls.', 'Choose a first player.', 'Prepare the score track.',
  'Scoring', 'Score the most influence to win.',
].join('\n');

function makePages() {
  return rulebookText.split('\n').reduce((pages, text, index) => {
    const pageIndex = Math.floor(index / 6);
    if (!pages[pageIndex]) pages[pageIndex] = { number: pageIndex + 1, blocks: [] };
    pages[pageIndex].blocks.push({
      text,
      fontSize: index % 6 === 0 ? 24 : 14,
      x: 50,
      y: 40 + (index % 6) * 30,
      width: 500,
      height: 20,
    });
    return pages;
  }, []);
}

function makeManifest() {
  return runIngestionPipeline({
    documentId: projectId,
    metadata: { title: 'Abyss', gameId: projectId, source: 'client-ui' },
    pages: makePages(),
  });
}

function makeRow(manifest = makeManifest()) {
  return {
    id: 1,
    metadata: JSON.stringify({
      projectContext: { version: 3, projectId, rulebookText },
      renderState: { ingestionManifest: manifest },
    }),
    components: '[]', images: '[]', script: '', audio: '', name: 'Abyss',
  };
}

function invokeRecovery(rows, body) {
  const routes = new Map();
  registerProjectPersistenceRoutes({
    post: (route, handler) => routes.set(route, handler),
    get: () => {},
  }, {
    db: {
      all: (_sql, _params, callback) => callback(null, rows),
      run: jest.fn(), get: jest.fn(),
    },
  });
  const result = { statusCode: 200, payload: null };
  const res = {
    status(code) { result.statusCode = code; return this; },
    json(payload) { result.payload = payload; return this; },
  };
  routes.get('/api/projects/recover-ingestion-manifest')({ body }, res);
  return result;
}

describe('durable ingestion-manifest recovery', () => {
  test('recovers only a matching durable manifest and returns no source or filesystem data', () => {
    const manifest = makeManifest();
    manifest.document.pdfPath = 'C:\\private\\rulebook.pdf';
    manifest.components[0].file_path = 'C:\\private\\component.png';
    manifest.assets.pages[0].mediaUrl = 'file:///private/page.png';
    const result = invokeRecovery([makeRow(manifest)], { projectId });
    expect(result).toMatchObject({ statusCode: 200, payload: { ok: true } });
    expect(result.payload.manifest.document.id).toBe(projectId);
    const response = JSON.stringify(result.payload);
    expect(response).not.toContain(rulebookText);
    expect(response).not.toMatch(/file_path|pdf_path|pdfPath|mediaUrl|thumbnail|images\\/i);
    expect(result.payload.manifest.components.every((component) => !Object.hasOwn(component, 'text'))).toBe(true);
  });

  test('returns missing when no canonical durable record has a manifest', () => {
    const row = makeRow();
    const metadata = JSON.parse(row.metadata);
    delete metadata.renderState.ingestionManifest;
    row.metadata = JSON.stringify(metadata);
    expect(invokeRecovery([row], { projectId })).toMatchObject({
      statusCode: 404,
      payload: { ok: false, code: INGESTION_MANIFEST_RECOVERY.MISSING },
    });
  });

  test.each([
    ['foreign document', (manifest) => ({ ...manifest, document: { ...manifest.document, id: 'other-project', gameId: 'other-project' } }), INGESTION_MANIFEST_RECOVERY.PROJECT_MISMATCH],
    ['foreign game', (manifest) => ({ ...manifest, document: { ...manifest.document, gameId: 'other-project' } }), INGESTION_MANIFEST_RECOVERY.PROJECT_MISMATCH],
    ['altered page hash', (manifest) => ({ ...manifest, assets: { ...manifest.assets, pages: [{ ...manifest.assets.pages[0], hash: '0'.repeat(64) }, ...manifest.assets.pages.slice(1)] } }), INGESTION_MANIFEST_RECOVERY.INVALID],
    ['missing required fields', (manifest) => ({ ...manifest, assets: { ...manifest.assets, pages: [] } }), INGESTION_MANIFEST_RECOVERY.INVALID],
    ['private source path', (manifest) => ({ ...manifest, document: { ...manifest.document, source: 'C:\\private\\rulebook.pdf' } }), INGESTION_MANIFEST_RECOVERY.INVALID],
    ['private retained title', (manifest) => ({ ...manifest, document: { ...manifest.document, title: 'file:///private/rulebook.pdf' } }), INGESTION_MANIFEST_RECOVERY.INVALID],
    ['private retained heading', (manifest) => ({ ...manifest, outline: [{ ...manifest.outline[0], title: 'C:\\private\\rulebook.pdf' }, ...manifest.outline.slice(1)] }), INGESTION_MANIFEST_RECOVERY.INVALID],
  ])('fails closed for %s', (_label, alter, expectedCode) => {
    const row = makeRow(alter(makeManifest()));
    expect(invokeRecovery([row], { projectId })).toMatchObject({
      statusCode: 400,
      payload: { ok: false, code: expectedCode },
    });
  });

  test('rejects malformed persisted manifests and invalid/path-like IDs', () => {
    const malformed = makeRow({ version: '1.0.0' });
    expect(invokeRecovery([malformed], { projectId })).toMatchObject({
      statusCode: 400,
      payload: { code: INGESTION_MANIFEST_RECOVERY.INVALID },
    });
    expect(invokeRecovery([makeRow()], { projectId: '../../abyss' })).toMatchObject({
      statusCode: 400,
      payload: { code: INGESTION_MANIFEST_RECOVERY.INVALID },
    });
  });

  test('does not accept mismatched durable page identities directly', () => {
    const manifest = makeManifest();
    expect(recoverDurableIngestionManifest([makeRow(manifest)], projectId)).toMatchObject({ valid: true });
    expect(recoverDurableIngestionManifest([makeRow(manifest)], `${projectId}/..`)).toMatchObject({
      valid: false, code: INGESTION_MANIFEST_RECOVERY.INVALID,
    });
  });
});


function createInMemoryProjectDb(rows = []) {
  let nextId = rows.length + 1;
  return {
    all: (_sql, _params, callback) => callback(null, rows),
    get: jest.fn(),
    run: (sql, params, callback) => {
      if (/^UPDATE/i.test(sql.trim())) {
        const row = rows.find((candidate) => candidate.id === params[1]);
        if (row) row.metadata = params[0];
        callback.call({ changes: row ? 1 : 0 }, null);
        return;
      }
      rows.push({
        id: nextId++, name: params[0], metadata: params[1], components: params[2], images: params[3],
        script: params[4], audio: params[5], scenes: params[6],
      });
      callback.call({ lastID: nextId - 1, changes: 1 }, null);
    },
  };
}

function invokePersistence(rows, body) {
  const routes = new Map();
  registerProjectPersistenceRoutes({
    post: (route, handler) => routes.set(route, handler),
    get: () => {},
  }, { db: createInMemoryProjectDb(rows) });
  const result = { statusCode: 200, payload: null };
  const res = {
    status(code) { result.statusCode = code; return this; },
    json(payload) { result.payload = payload; return this; },
  };
  routes.get('/api/projects/persist-ingestion-manifest')({ body }, res);
  return result;
}

describe('canonical ingestion persistence for recovery', () => {
  test('persists a validated logical project record and recovers it without inspecting artifacts', () => {
    const rows = [];
    const persisted = invokePersistence(rows, { projectId, rulebookText, manifest: makeManifest() });
    expect(persisted).toEqual(expect.objectContaining({ statusCode: 200, payload: { ok: true, projectId } }));
    expect(rows).toHaveLength(1);
    expect(invokeRecovery(rows, { projectId })).toMatchObject({
      statusCode: 200,
      payload: { ok: true, manifest: { document: { id: projectId, gameId: projectId } } },
    });
  });

  test('keeps diagnostics redacted while identifying an empty durable store', () => {
    const recovery = recoverDurableIngestionManifest([], projectId);
    expect(recovery).toMatchObject({
      valid: false,
      code: INGESTION_MANIFEST_RECOVERY.MISSING,
      diagnostics: { candidateCount: 0, candidateOutcomes: ['record_lookup:missing'] },
    });
    expect(JSON.stringify(recovery.diagnostics)).not.toContain(rulebookText);
    expect(JSON.stringify(recovery.diagnostics)).not.toMatch(/private|token|password|file:/i);
  });
});


test('reports distinct redacted diagnostics for ambiguity, invalid context, and conflicting candidates', () => {
  const duplicate = makeRow();
  duplicate.id = 2;
  expect(recoverDurableIngestionManifest([makeRow(), duplicate], projectId)).toMatchObject({
    valid: false,
    code: INGESTION_MANIFEST_RECOVERY.INVALID,
    diagnostics: { candidateCount: 2, candidateOutcomes: ['record_lookup:ambiguous'] },
  });

  const invalidContext = makeRow();
  const invalidContextMetadata = JSON.parse(invalidContext.metadata);
  invalidContextMetadata.projectContext.rulebookText = null;
  invalidContext.metadata = JSON.stringify(invalidContextMetadata);
  expect(recoverDurableIngestionManifest([invalidContext], projectId)).toMatchObject({
    valid: false,
    code: INGESTION_MANIFEST_RECOVERY.INVALID,
    diagnostics: { candidateOutcomes: ['persisted_context:invalid'] },
  });

  const conflict = makeRow();
  const conflictMetadata = JSON.parse(conflict.metadata);
  conflictMetadata.projectContext.ingestionManifest = { ...makeManifest(), version: 'different' };
  conflict.metadata = JSON.stringify(conflictMetadata);
  expect(recoverDurableIngestionManifest([conflict], projectId)).toMatchObject({
    valid: false,
    code: INGESTION_MANIFEST_RECOVERY.INVALID,
    diagnostics: { candidateOutcomes: ['manifest_candidate:conflict'] },
  });
});
