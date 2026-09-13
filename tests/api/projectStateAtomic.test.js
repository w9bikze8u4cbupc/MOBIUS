const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const transport = require('../../src/services/projectStateTransport.cjs');
const { registerProjectPersistenceRoutes } = require('../../src/api/projectPersistenceRoutes.js');

test.each([null, [], {}, { projectContext: { projectId: 'fixture' } }])('compact malformed/identity-free payload is refused without DB access: %j', async value => {
  const routes = new Map(); const db = { all: jest.fn(), run: jest.fn() };
  registerProjectPersistenceRoutes({ post: (p, h) => routes.set(p, h), get() {} }, { db });
  db.all.mockClear(); // Registration hydrates the existing runtime state once.
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  await routes.get('/api/projects/:projectId/production-state')({ params: { projectId: 'fixture' }, body: transport.packProjectState(value) }, res);
  expect(res.status).toHaveBeenCalledWith(400);
  expect(db.all).not.toHaveBeenCalled();
});

test('failed atomic rename leaves disk AND in-memory Cockpit row unchanged', () => {
  const previous = { NODE_ENV: process.env.NODE_ENV, DB_DATA_DIR: process.env.DB_DATA_DIR, DB_DATA_FILE: process.env.DB_DATA_FILE, DB_IN_MEMORY: process.env.DB_IN_MEMORY };
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mobius-db-atomic-'));
  Object.assign(process.env, { NODE_ENV: 'proof', DB_DATA_DIR: root, DB_DATA_FILE: path.join(root, 'projects.json'), DB_IN_MEMORY: 'false' });
  try {
    jest.isolateModules(() => {
      const db = require('../../src/api/db.js').default;
      db.run('INSERT INTO projects VALUES (?, ?, ?, ?, ?, ?, ?)', ['fixture', '{"review":"pending"}', '[]', '[]', '', '', '[]']);
      const before = fs.readFileSync(process.env.DB_DATA_FILE, 'utf8');
      const rename = jest.spyOn(fs, 'renameSync').mockImplementation(() => { throw new Error('fixture disk unavailable'); });
      try {
        expect(() => db.run('UPDATE projects SET metadata = ? WHERE id = ?', ['{"review":"changed"}', 1])).toThrow('fixture disk unavailable');
        expect(db.get('SELECT * FROM projects WHERE id = ?', [1]).metadata).toBe('{"review":"pending"}');
        expect(fs.readFileSync(process.env.DB_DATA_FILE, 'utf8')).toBe(before);
        expect(fs.readdirSync(root)).toEqual(['projects.json']);
      } finally { rename.mockRestore(); }
    });
  } finally {
    for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  }
});
