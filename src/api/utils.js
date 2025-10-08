// src/api/utils.js
// Utility functions for the API

import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import fs from 'fs';

// Fix for __dirname in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Get the canonical data directory path
 * @returns {string} Path to the data directory
 */
export function getDataDir() {
  // Get DATA_DIR from environment variable or default to ./data
  const dataDir = process.env.DATA_DIR || path.join(dirname(dirname(__dirname)), 'data');
  
  // Ensure data directory exists
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  
  return dataDir;
}

/**
 * Get the database path
 * @returns {string} Path to the database file
 */
export function getDbPath() {
  const dataDir = getDataDir();
  return path.join(dataDir, 'projects.db');
}

/**
 * Get the uploads directory path
 * @returns {string} Path to the uploads directory
 */
export function getUploadsDir() {
  const dataDir = getDataDir();
  const uploadsDir = path.join(dataDir, 'uploads');
  
  // Ensure uploads directory exists
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }
  
  return uploadsDir;
}

export default {
  getDataDir,
  getDbPath,
  getUploadsDir
};