import sqlite3 from 'sqlite3';

const db = new sqlite3.Database('projects.db');

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      metadata TEXT,
      components TEXT,
      images TEXT,
      script TEXT,
      audio TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
});

export default db;