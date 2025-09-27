-- Migration 001: Initial dhash schema
-- Forward migration
CREATE TABLE IF NOT EXISTS dhash_config (
  id SERIAL PRIMARY KEY,
  key VARCHAR(255) NOT NULL UNIQUE,
  value TEXT,
  environment VARCHAR(50) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS dhash_metrics (
  id SERIAL PRIMARY KEY,
  metric_name VARCHAR(255) NOT NULL,
  metric_value FLOAT NOT NULL,
  environment VARCHAR(50) NOT NULL,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_dhash_config_env ON dhash_config(environment);
CREATE INDEX idx_dhash_metrics_env_timestamp ON dhash_metrics(environment, timestamp);
