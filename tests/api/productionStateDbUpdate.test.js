import db from '../../src/api/db.js';

describe('file-backed canonical production state updates', () => {
  beforeEach(() => db.reset());

  it('updates the existing project row instead of falling through to an insert', () => {
    const inserted = db.run(
      'INSERT INTO projects (name, metadata, components, images, script, audio, scenes) VALUES (?, ?, ?, ?, ?, ?, ?)',
      ['Jaipur', '{"version":1}', '[]', '[]', '{}', '[]', '[]'],
    );

    const result = db.run(
      'UPDATE projects SET name = ?, metadata = ?, components = ?, images = ?, script = ?, audio = ?, scenes = ? WHERE id = ?',
      ['Jaipur', '{"version":2}', '[1]', '[2]', '{"script":true}', '[3]', '[4]', inserted.lastID],
    );

    expect(result.changes).toBe(1);
    expect(db.all('SELECT * FROM projects')).toHaveLength(1);
    expect(db.get('SELECT * FROM projects WHERE id = ?', [inserted.lastID])).toMatchObject({
      metadata: '{"version":2}',
      components: '[1]',
      scenes: '[4]',
    });
  });
});
