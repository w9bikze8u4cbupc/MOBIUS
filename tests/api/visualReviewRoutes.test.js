const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { registerProjectPersistenceRoutes } = require('../../src/api/projectPersistenceRoutes.js');
const storage = require('../../src/services/canonicalProductionStateStorage.cjs');
const file = path.resolve(__dirname, '../fixtures/images/test-bg-100x100.png');
function fixture(candidatePath = file) {
  const routes = new Map();
  const row = { id: 1, metadata: JSON.stringify({ projectContext: { projectId: 'fixture', visualReviewItems: [{
    id: 'review', requiredObjects: ['board'], candidates: [{ assetId: 'asset', thumbnailPath: candidatePath, rejectionReasons: ['unknown'], sourceRefs: [{ page: 1 }] }],
  }] } }) };
  registerProjectPersistenceRoutes({ post() {}, get(name, handler) { routes.set(name, handler); } }, {
    db: { all(_sql, _params, done) { return done(null, [row]); } },
    projectSource: { resolveFile: async () => path.join(path.dirname(file), 'source', 'rulebook.pdf') },
  });
  routes.row = row;
  return routes;
}
test('cached review projection is invalidated immediately when persisted metadata changes', async () => {
  const routes = fixture();
  const res = { json: jest.fn(), status: jest.fn().mockReturnThis() };
  const request = { params: { projectId: 'fixture' } };
  const handler = routes.get('/api/projects/:projectId/visual-reviews');
  await handler(request, res);
  await handler(request, res);
  const metadata = JSON.parse(routes.row.metadata);
  metadata.projectContext.visualReviewItems[0].status = 'resolved';
  routes.row.metadata = JSON.stringify(metadata);
  await handler(request, res);
  expect(res.json.mock.calls[2][0].items[0].status).toBe('resolved');
  routes.row.metadata = JSON.stringify({ projectContext: { projectId: 'other', visualReviewItems: [] } });
  await handler(request, res);
  expect(res.status).toHaveBeenCalledWith(404);
});
test('review projection retains evidence while replacing the browser file path with a scoped URL', async () => {
  const res = { json: jest.fn(), status: jest.fn().mockReturnThis() };
  await fixture().get('/api/projects/:projectId/visual-reviews')({ params: { projectId: 'fixture' } }, res);
  expect(res.json.mock.calls[0][0].items[0].candidates[0]).toMatchObject({ sourceRefs: [{ page: 1 }],
    thumbnailUrl: '/api/projects/fixture/visual-reviews/assets/asset/file', rejectionReasons: ['unknown'] });
  expect(res.json.mock.calls[0][0].items[0].candidates[0].thumbnailPath).toBeUndefined();
});
test('image route refuses an existing file outside canonical project ownership', async () => {
  const res = { json: jest.fn(), status: jest.fn().mockReturnThis(), sendFile: jest.fn() };
  await fixture(path.resolve('package.json')).get('/api/projects/:projectId/visual-reviews/assets/:assetId/file')({ params: { projectId: 'fixture', assetId: 'asset' } }, res);
  expect(res.status).toHaveBeenCalledWith(403);
  expect(res.sendFile).not.toHaveBeenCalled();
});
test('unknown project never receives another project review queue', async () => {
  const res = { json: jest.fn(), status: jest.fn().mockReturnThis() };
  await fixture().get('/api/projects/:projectId/visual-reviews')({ params: { projectId: 'other' } }, res);
  expect(res.status).toHaveBeenCalledWith(404);
});

test('Cockpit hydrates candidate proof from the checksummed project-owned sidecar', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mobius-visual-sidecar-'));
  const projectId = 'fixture';
  const sourceFile = path.join(root, projectId, 'source', 'rulebook.pdf');
  fs.mkdirSync(path.dirname(sourceFile), { recursive: true });
  fs.writeFileSync(sourceFile, '%PDF-1.4 fixture');
  const state = {
    projectId,
    assets: [{ id: 'board', filePath: path.join(root, projectId, 'production', 'board.png'), sourceRefs: [{ page: 3 }] }],
    sourceSelections: [{ ruleAtomId: 'atom', status: 'REVIEW_REQUIRED', suggestedAssets: [], selectedAssets: [], ranked: [] }],
    visualPlans: [], scenes: [],
    reviewItems: [{ id: 'review', candidates: [{ assetId: 'board', thumbnailPath: path.join(root, projectId, 'production', 'board.png'), sourceRefs: [{ page: 3 }], rejectionReasons: ['crop'] }]],
  };
  const compacted = storage.createCompactCanonicalProductionState(state, { projectId, relativePath: 'production/visual-evidence-artifact.json' });
  const artifactFile = path.join(root, projectId, 'production', 'visual-evidence-artifact.json');
  fs.mkdirSync(path.dirname(artifactFile), { recursive: true });
  fs.writeFileSync(artifactFile, JSON.stringify(compacted.artifact));
  const routes = new Map();
  const row = { id: 1, metadata: JSON.stringify({ projectContext: {
    projectId, visualReviewItems: compacted.compact.reviewItems, visualEvidenceArtifact: compacted.artifactDescriptor,
  } }) };
  registerProjectPersistenceRoutes({ post() {}, get(name, handler) { routes.set(name, handler); } }, {
    db: { all(_sql, _params, done) { return done(null, [row]); } },
    projectSource: { resolveFile: async () => sourceFile },
  });
  const res = { json: jest.fn(), status: jest.fn().mockReturnThis() };
  await routes.get('/api/projects/:projectId/visual-reviews')({ params: { projectId } }, res);
  expect(res.json.mock.calls[0][0].items[0].candidates[0]).toMatchObject({ assetId: 'board', sourceRefs: [{ page: 3 }], rejectionReasons: ['crop'] });
});
