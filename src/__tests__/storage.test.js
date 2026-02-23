/**
 * Tests for canonical storage path configuration
 */

import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import {
  getDataRoot,
  getDataDirs,
  getDbPath,
  ensureDataDirs,
  resolveDataPath,
  getUploadPath,
  getOutputPath,
  getTmpPath
} from '../config/storage.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('Canonical Storage Paths', () => {
  let originalEnv;
  
  beforeEach(() => {
    // Save original environment
    originalEnv = { ...process.env };
  });
  
  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
  });
  
  describe('getDataRoot', () => {
    test('should return default data directory', () => {
      delete process.env.MOBIUS_DATA_ROOT;
      delete process.env.DATA_DIR;
      
      const dataRoot = getDataRoot();
      expect(dataRoot).toContain('data');
      expect(path.isAbsolute(dataRoot)).toBe(true);
    });
    
    test('should respect MOBIUS_DATA_ROOT environment variable', () => {
      process.env.MOBIUS_DATA_ROOT = '/custom/data/path';
      
      const dataRoot = getDataRoot();
      expect(dataRoot).toBe(path.resolve('/custom/data/path'));
    });
    
    test('should respect DATA_DIR environment variable for backward compatibility', () => {
      delete process.env.MOBIUS_DATA_ROOT;
      process.env.DATA_DIR = '/legacy/data/path';
      
      const dataRoot = getDataRoot();
      expect(dataRoot).toBe(path.resolve('/legacy/data/path'));
    });
    
    test('should prefer MOBIUS_DATA_ROOT over DATA_DIR', () => {
      process.env.MOBIUS_DATA_ROOT = '/new/path';
      process.env.DATA_DIR = '/old/path';
      
      const dataRoot = getDataRoot();
      expect(dataRoot).toBe(path.resolve('/new/path'));
    });
  });
  
  describe('getDataDirs', () => {
    test('should return all canonical directories', () => {
      const dirs = getDataDirs();
      
      expect(dirs).toHaveProperty('root');
      expect(dirs).toHaveProperty('db');
      expect(dirs).toHaveProperty('uploads');
      expect(dirs).toHaveProperty('outputs');
      expect(dirs).toHaveProperty('tmp');
    });
    
    test('should return absolute paths', () => {
      const dirs = getDataDirs();
      
      expect(path.isAbsolute(dirs.root)).toBe(true);
      expect(path.isAbsolute(dirs.db)).toBe(true);
      expect(path.isAbsolute(dirs.uploads)).toBe(true);
      expect(path.isAbsolute(dirs.outputs)).toBe(true);
      expect(path.isAbsolute(dirs.tmp)).toBe(true);
    });
    
    test('should have correct subdirectory structure', () => {
      const dirs = getDataDirs();
      
      expect(dirs.db).toBe(path.join(dirs.root, 'db'));
      expect(dirs.uploads).toBe(path.join(dirs.root, 'uploads'));
      expect(dirs.outputs).toBe(path.join(dirs.root, 'outputs'));
      expect(dirs.tmp).toBe(path.join(dirs.root, 'tmp'));
    });
  });
  
  describe('getDbPath', () => {
    test('should return path to SQLite database', () => {
      const dbPath = getDbPath();
      
      expect(dbPath).toContain('db');
      expect(dbPath).toContain('projects.sqlite');
      expect(path.isAbsolute(dbPath)).toBe(true);
    });
    
    test('should return exactly one database path', () => {
      const dbPath1 = getDbPath();
      const dbPath2 = getDbPath();
      
      expect(dbPath1).toBe(dbPath2);
    });
  });
  
  describe('resolveDataPath', () => {
    test('should resolve path within data directory', () => {
      const resolved = resolveDataPath('test', 'file.txt');
      const dataRoot = getDataRoot();
      
      expect(resolved).toBe(path.join(dataRoot, 'test', 'file.txt'));
    });
    
    test('should handle single segment', () => {
      const resolved = resolveDataPath('test.txt');
      const dataRoot = getDataRoot();
      
      expect(resolved).toBe(path.join(dataRoot, 'test.txt'));
    });
    
    test('should handle multiple segments', () => {
      const resolved = resolveDataPath('a', 'b', 'c', 'file.txt');
      const dataRoot = getDataRoot();
      
      expect(resolved).toBe(path.join(dataRoot, 'a', 'b', 'c', 'file.txt'));
    });
  });
  
  describe('getUploadPath', () => {
    test('should return path in uploads directory', () => {
      const uploadPath = getUploadPath('test.pdf');
      const dirs = getDataDirs();
      
      expect(uploadPath).toBe(path.join(dirs.uploads, 'test.pdf'));
    });
  });
  
  describe('getOutputPath', () => {
    test('should return project output directory', () => {
      const outputPath = getOutputPath('project-123');
      const dirs = getDataDirs();
      
      expect(outputPath).toBe(path.join(dirs.outputs, 'project-123'));
    });
    
    test('should return file path when filename provided', () => {
      const outputPath = getOutputPath('project-123', 'video.mp4');
      const dirs = getDataDirs();
      
      expect(outputPath).toBe(path.join(dirs.outputs, 'project-123', 'video.mp4'));
    });
  });
  
  describe('getTmpPath', () => {
    test('should return path in tmp directory', () => {
      const tmpPath = getTmpPath('temp-file.txt');
      const dirs = getDataDirs();
      
      expect(tmpPath).toBe(path.join(dirs.tmp, 'temp-file.txt'));
    });
  });
  
  describe('Path consistency', () => {
    test('all paths should be under the same data root', () => {
      const dataRoot = getDataRoot();
      const dirs = getDataDirs();
      const dbPath = getDbPath();
      const uploadPath = getUploadPath('test.pdf');
      const outputPath = getOutputPath('project-1');
      const tmpPath = getTmpPath('temp.txt');
      
      expect(dirs.db.startsWith(dataRoot)).toBe(true);
      expect(dirs.uploads.startsWith(dataRoot)).toBe(true);
      expect(dirs.outputs.startsWith(dataRoot)).toBe(true);
      expect(dirs.tmp.startsWith(dataRoot)).toBe(true);
      expect(dbPath.startsWith(dataRoot)).toBe(true);
      expect(uploadPath.startsWith(dataRoot)).toBe(true);
      expect(outputPath.startsWith(dataRoot)).toBe(true);
      expect(tmpPath.startsWith(dataRoot)).toBe(true);
    });
    
    test('should not reference legacy paths', () => {
      const dirs = getDataDirs();
      const dbPath = getDbPath();
      
      // Should not contain 'src/api'
      expect(dbPath).not.toContain(path.join('src', 'api'));
      expect(dirs.uploads).not.toContain(path.join('src', 'api'));
      
      // Database should be in db/ subdirectory, not root
      expect(dbPath).toContain(path.join('db', 'projects.sqlite'));
    });
  });
});
