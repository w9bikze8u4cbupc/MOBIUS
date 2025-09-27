-- Initial dhash schema migration
-- Version: 20240315_120000

-- Create schema_migrations table if not exists
CREATE TABLE IF NOT EXISTS schema_migrations (
    version VARCHAR(255) PRIMARY KEY,
    applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create dhash tables
CREATE TABLE IF NOT EXISTS dhash_jobs (
    id SERIAL PRIMARY KEY,
    hash_value VARCHAR(64) NOT NULL,
    status VARCHAR(20) DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_dhash_jobs_status ON dhash_jobs(status);
CREATE INDEX IF NOT EXISTS idx_dhash_jobs_hash ON dhash_jobs(hash_value);

-- Record this migration
INSERT INTO schema_migrations (version) VALUES ('20240315_120000') ON CONFLICT DO NOTHING;