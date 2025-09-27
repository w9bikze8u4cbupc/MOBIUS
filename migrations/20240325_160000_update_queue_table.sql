-- Update queue table for better monitoring
-- Version: 20240325_160000

-- Add confidence scoring column
ALTER TABLE dhash_jobs ADD COLUMN IF NOT EXISTS confidence_score DECIMAL(3,2) DEFAULT 1.0;

-- Add processing metrics table
CREATE TABLE IF NOT EXISTS dhash_processing_metrics (
    id SERIAL PRIMARY KEY,
    p95_hash_time_ms INTEGER,
    extraction_failure_rate DECIMAL(5,4),
    low_confidence_queue_length INTEGER,
    recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Record this migration
INSERT INTO schema_migrations (version) VALUES ('20240325_160000') ON CONFLICT DO NOTHING;