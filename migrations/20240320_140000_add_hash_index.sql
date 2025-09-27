-- Add additional hash performance index
-- Version: 20240320_140000

-- Add composite index for better hash lookup performance
CREATE INDEX IF NOT EXISTS idx_dhash_jobs_status_created ON dhash_jobs(status, created_at);

-- Add queue performance table
CREATE TABLE IF NOT EXISTS dhash_queue_stats (
    id SERIAL PRIMARY KEY,
    queue_length INTEGER DEFAULT 0,
    avg_processing_time_ms INTEGER DEFAULT 0,
    recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Record this migration
INSERT INTO schema_migrations (version) VALUES ('20240320_140000') ON CONFLICT DO NOTHING;