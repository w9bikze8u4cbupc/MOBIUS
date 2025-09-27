-- Migration 002: Add performance tracking
-- Forward migration
CREATE TABLE IF NOT EXISTS dhash_performance (
  id SERIAL PRIMARY KEY,
  operation_type VARCHAR(100) NOT NULL,
  duration_ms INTEGER NOT NULL,
  success BOOLEAN NOT NULL DEFAULT true,
  error_message TEXT,
  environment VARCHAR(50) NOT NULL,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_dhash_performance_env_timestamp ON dhash_performance(environment, timestamp);
CREATE INDEX idx_dhash_performance_operation ON dhash_performance(operation_type, environment);
