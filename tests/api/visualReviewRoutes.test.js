const path = require('node:path');
const { registerProjectPersistenceRoutes } = require('../../src/api/projectPersistenceRoutes.js');
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
test('cached review projection is invalidated immediately when persisted metadata changes', () => {
  const routes = fixture();
  const res = { json: jest.fn(), status: jest.fn().mockReturnThis() };
  const request = { params: { projectId: 'fixture' } };
  const handler = routes.get('/api/projects/:projectId/visual-reviews');
  handler(request, res);
  handler(request, res);
  const metadata = JSON.parse(routes.row.metadata);
  metadata.projectContext.visualReviewItems[0].status = 'resolved';
  routes.row.metadata = JSON.stringify(metadata);
  handler(request, res);
  expect(res.json.mock.calls[2][0].items[0].status).toBe('resolved');
  routes.row.metadata = JSON.stringify({ projectContext: { projectId: 'other', visualReviewItems: [] } });
  handler(request, res);
  expect(res.status).toHaveBeenCalledWith(404);
});
test('review projection retains evidence while replacing the browser file path with a scoped URL', () => {
  const res = { json: jest.fn(), status: jest.fn().mockReturnThis() };
  fixture().get('/api/projects/:projectId/visual-reviews')({ params: { projectId: 'fixture' } }, res);
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
test('unknown project never receives another project review queue', () => {
  const res = { json: jest.fn(), status: jest.fn().mockReturnThis() };
  fixture().get('/api/projects/:projectId/visual-reviews')({ params: { projectId: 'other' } }, res);
  expect(res.status).toHaveBeenCalledWith(404);
});
