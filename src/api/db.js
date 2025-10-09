// src/api/db.js
// SQLite database implementation for Mobius Games Tutorial Generator
// Uses better-sqlite3 for performance and reliability

import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import fs from 'fs';

// Fix for __dirname in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Get DATA_DIR from environment variable or default to ./data
const dataDir = process.env.DATA_DIR || path.join(dirname(dirname(__dirname)), 'data');
const dbPath = path.join(dataDir, 'projects.db');

// Ensure data directory exists
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Initialize database
const db = new Database(dbPath);

// Create tables if they don't exist
db.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    metadata TEXT,
    components TEXT,
    images TEXT,
    script TEXT,
    audio TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// Create index for faster lookups
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_projects_name ON projects(name)
`);

export default db;