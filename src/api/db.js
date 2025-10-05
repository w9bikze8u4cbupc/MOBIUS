import path from 'path';
import { fileURLToPath } from 'url';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import { ensureStorageLayout, paths } from './storage.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let db;

/**
 * Lazily opens (or returns) the SQLite connection.
 */
export async function getDb() {
  if (db) return db;

  await ensureStorageLayout();

  const dbPath = path.join(paths.DATA_ROOT, 'projects.db');
  sqlite3.verbose();
  db = await open({
    filename: dbPath,
    driver: sqlite3.Database,
  });

  await bootstrapSchema(db);
  return db;
}

async function bootstrapSchema(database) {
  await database.exec(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      external_id TEXT UNIQUE,
      name TEXT NOT NULL,
      language TEXT DEFAULT 'fr-CA',
      voice_id TEXT,
      detail_boost INTEGER DEFAULT 25,
      metadata_json TEXT DEFAULT '{}',
      script_json TEXT DEFAULT '{}',
      assets_json TEXT DEFAULT '{}',
      audio_json TEXT DEFAULT '{}',
      captions_json TEXT DEFAULT '{}',
      render_json TEXT DEFAULT '{}',
      status TEXT DEFAULT 'draft',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

export async function upsertProject(payload) {
  const database = await getDb();

  const {
    externalId = null,
    name,
    language,
    voiceId,
    detailBoost,
    metadata = {},
    script = {},
    assets = {},
    audio = {},
    captions = {},
    render = {},
    status = 'draft',
  } = payload;

  const result = await database.run(
    `
      INSERT INTO projects (
        external_id, name, language, voice_id, detail_boost,
        metadata_json, script_json, assets_json, audio_json,
        captions_json, render_json, status, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT(external_id) DO UPDATE SET
        name = excluded.name,
        language = excluded.language,
        voice_id = excluded.voice_id,
        detail_boost = excluded.detail_boost,
        metadata_json = excluded.metadata_json,
        script_json = excluded.script_json,
        assets_json = excluded.assets_json,
        audio_json = excluded.audio_json,
        captions_json = excluded.captions_json,
        render_json = excluded.render_json,
        status = excluded.status,
        updated_at = CURRENT_TIMESTAMP;
    `,
    [
      externalId,
      name,
      language,
      voiceId,
      detailBoost,
      JSON.stringify(metadata),
      JSON.stringify(script),
      JSON.stringify(assets),
      JSON.stringify(audio),
      JSON.stringify(captions),
      JSON.stringify(render),
      status,
    ],
  );

  const projectId = result.lastID ?? (await database.get(
    `SELECT id FROM projects WHERE external_id = ?`,
    [externalId],
  ))?.id;

  return getProjectById(projectId);
}

export async function getProjectById(idOrExternalId) {
  const database = await getDb();

  const row = await database.get(
    `
      SELECT
        id,
        external_id as externalId,
        name,
        language,
        voice_id as voiceId,
        detail_boost as detailBoost,
        metadata_json as metadataJson,
        script_json as scriptJson,
        assets_json as assetsJson,
        audio_json as audioJson,
        captions_json as captionsJson,
        render_json as renderJson,
        status,
        created_at as createdAt,
        updated_at as updatedAt
      FROM projects
      WHERE id = ? OR external_id = ?
    `,
    [idOrExternalId, idOrExternalId],
  );

  if (!row) return null;

  return {
    id: row.id,
    externalId: row.externalId,
    name: row.name,
    language: row.language,
    voiceId: row.voiceId,
    detailBoost: row.detailBoost,
    metadata: JSON.parse(row.metadataJson || '{}'),
    script: JSON.parse(row.scriptJson || '{}'),
    assets: JSON.parse(row.assetsJson || '{}'),
    audio: JSON.parse(row.audioJson || '{}'),
    captions: JSON.parse(row.captionsJson || '{}'),
    render: JSON.parse(row.renderJson || '{}'),
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function listProjects() {
  const database = await getDb();
  const rows = await database.all(`
    SELECT
      id,
      external_id as externalId,
      name,
      language,
      voice_id as voiceId,
      detail_boost as detailBoost,
      status,
      created_at as createdAt,
      updated_at as updatedAt
    FROM projects
    ORDER BY updated_at DESC;
  `);
  return rows;
}