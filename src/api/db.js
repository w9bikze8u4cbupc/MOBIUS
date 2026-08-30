import * as fs from 'fs';
import * as path from 'path';

const DATA_DIR = process.env.DB_DATA_DIR || path.resolve(process.cwd(), 'data');
const DATA_FILE = process.env.DB_DATA_FILE || path.join(DATA_DIR, 'projects.json');
const USE_FILE_STORAGE = process.env.DB_IN_MEMORY === 'true' ? false : process.env.NODE_ENV !== 'test';

let projects = [];
let nextId = 1;

function ensureStorage() {
  if (!USE_FILE_STORAGE) {
    return;
  }
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (fs.existsSync(DATA_FILE)) {
    try {
      const raw = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
      if (Array.isArray(raw.projects)) {
        projects = raw.projects;
        nextId = typeof raw.nextId === 'number' ? raw.nextId : Math.max(1, ...projects.map((p) => p.id + 1));
      }
    } catch (err) {
      console.warn('Failed to load existing project data, starting fresh.', err);
    }
  }
}

function persist() {
  if (!USE_FILE_STORAGE) {
    return;
  }
  fs.writeFileSync(
    DATA_FILE,
    JSON.stringify({ projects, nextId }, null, 2),
    'utf-8'
  );
}

function run(sql, params = [], callback) {
  try {
    if (/^\s*UPDATE\s+projects\s+SET\s+metadata\s*=\s*\?/i.test(sql)) {
      const [metadata, id] = params;
      const record = projects.find((project) => project.id === Number(id));
      if (!record) {
        if (callback) {
          callback.call({ changes: 0 }, null);
        }
        return { changes: 0 };
      }
      record.metadata = metadata || '{}';
      persist();
      if (callback) {
        callback.call({ changes: 1 }, null);
      }
      return { changes: 1 };
    }

    if (/^\s*UPDATE\s+projects\s+SET\s+name\s*=\s*\?,\s*metadata\s*=\s*\?,\s*components\s*=\s*\?,\s*images\s*=\s*\?,\s*script\s*=\s*\?,\s*audio\s*=\s*\?,\s*scenes\s*=\s*\?\s+WHERE\s+id\s*=\s*\?/i.test(sql)) {
      const [name, metadata, components, images, script, audio, scenes, id] = params;
      const record = projects.find((project) => project.id === Number(id));
      if (!record) {
        if (callback) callback.call({ changes: 0 }, null);
        return { changes: 0 };
      }
      Object.assign(record, {
        name: name || '',
        metadata: metadata || '{}',
        components: components || '[]',
        images: images || '[]',
        script: script || '',
        audio: audio || '',
        scenes,
      });
      persist();
      if (callback) callback.call({ changes: 1 }, null);
      return { changes: 1 };
    }

    const [name, metadata, components, images, script, audio, scenes] = params;
    const record = {
      id: nextId++,
      name: name || '',
      metadata: metadata || '{}',
      components: components || '[]',
      images: images || '[]',
      script: script || '',
      audio: audio || '',
      ...(scenes === undefined ? {} : { scenes }),
      created_at: new Date().toISOString()
    };
    projects.push(record);
    persist();
    if (callback) {
      callback.call({ lastID: record.id, changes: 1 }, null);
    }
    return { lastID: record.id, changes: 1 };
  } catch (err) {
    if (callback) {
      callback(err);
      return;
    }
    throw err;
  }
}

function all(sql, params = [], callback) {
  try {
    const rows = [...projects];
    if (callback) {
      callback(null, rows);
      return;
    }
    return rows;
  } catch (err) {
    if (callback) {
      callback(err);
      return;
    }
    throw err;
  }
}

function get(sql, params = [], callback) {
  try {
    const [id] = params;
    const row = projects.find((p) => p.id === Number(id));
    if (callback) {
      callback(null, row);
      return;
    }
    return row;
  } catch (err) {
    if (callback) {
      callback(err);
      return;
    }
    throw err;
  }
}

function reset() {
  projects = [];
  nextId = 1;
  persist();
}

ensureStorage();

export default { run, all, get, reset };
export { run, all, get, reset };
