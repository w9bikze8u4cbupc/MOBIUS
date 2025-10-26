import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Open the database
const dbPath = join(__dirname, 'data', 'projects.db');
console.log(`Opening database at: ${dbPath}`);

try {
  const db = new Database(dbPath, { readonly: true });
  console.log('Connected to the projects database.');
  
  // Get table names
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
  console.log('Tables in the database:');
  tables.forEach(row => {
    console.log(`- ${row.name}`);
    
    // Get schema for each table
    const schema = db.prepare(`PRAGMA table_info(${row.name})`).all();
    console.log(`\nSchema for table ${row.name}:`);
    schema.forEach(col => {
      console.log(`  ${col.name} (${col.type}) ${col.notnull ? 'NOT NULL' : ''} ${col.pk ? 'PRIMARY KEY' : ''}`);
    });
  });
  
  db.close();
  console.log('Database connection closed.');
} catch (err) {
  console.error('Error:', err.message);
}