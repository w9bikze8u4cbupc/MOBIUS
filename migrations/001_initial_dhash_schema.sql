-- Sample migration for MOBIUS dhash service
-- This migration adds an index to the projects table for better performance

CREATE INDEX IF NOT EXISTS idx_projects_created_at ON projects(created_at);

-- Add a migration log table for tracking dhash operations
CREATE TABLE IF NOT EXISTS dhash_operations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  operation_type TEXT NOT NULL,
  input_hash TEXT,
  output_hash TEXT,
  duration_ms INTEGER,
  success BOOLEAN DEFAULT 1,
  confidence REAL,
  metadata TEXT, -- JSON metadata
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_dhash_operations_created_at ON dhash_operations(created_at);
CREATE INDEX IF NOT EXISTS idx_dhash_operations_success ON dhash_operations(success);