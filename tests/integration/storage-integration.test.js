/**
 * Integration test for canonical storage paths
 * 
 * This test verifies that:
 * 1. Projects are created with data in the canonical location
 * 2. Uploads go to the canonical uploads directory
 * 3. Renders output to the canonical outputs directory
 * 4. All operations use exactly one database file
 */

import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { 
  getDataDirs, 
  getDbPath, 
  ensureDataDirs,
  getUploadPath,
  getOutputPath 
} from '../../src/config/storage.mjs';

describe('Storage Integration Test', () => {
  let testDataRoot;
  let originalEnv;
  
  beforeAll(() => {
    // Save original environment
    originalEnv = { ...process.env };
    
    // Set up test data directory
    testDataRoot = path.join(process.cwd(), 'test-data-integration');
    process.env.MOBIUS_DATA_ROOT = testDataRoot;
    
    // Clean up any existing test data
    if (fs.existsSync(testDataRoot)) {
      fs.rmSync(testDataRoot, { recursive: true, force: true });
    }
    
    // Ensure directories exist
    ensureDataDirs();
  });
  
  afterAll(() => {
    // Restore original environment
    process.env = originalEnv;
    
    // Clean up test data
    if (fs.existsSync(testDataRoot)) {
      fs.rmSync(testDataRoot, { recursive: true, force: true });
    }
  });
  
  test('should create canonical directory structure', () => {
    const dirs = getDataDirs();
    
    expect(fs.existsSync(dirs.root)).toBe(true);
    expect(fs.existsSync(dirs.db)).toBe(true);
    expect(fs.existsSync(dirs.uploads)).toBe(true);
    expect(fs.existsSync(dirs.outputs)).toBe(true);
    expect(fs.existsSync(dirs.tmp)).toBe(true);
  });
  
  test('should use exactly one database file', () => {
    const dbPath = getDbPath();
    
    // Verify database is in the db subdirectory
    expect(dbPath).toContain(path.join('db', 'projects.sqlite'));
    
    // Verify no legacy database paths exist
    const legacyPaths = [
      path.join(testDataRoot, 'projects.db'),
      path.join(testDataRoot, 'projects.sqlite'),
    ];
    
    for (const legacyPath of legacyPaths) {
      expect(fs.existsSync(legacyPath)).toBe(false);
    }
  });
  
  test('should handle file upload to canonical location', () => {
    const filename = 'test-upload.pdf';
    const uploadPath = getUploadPath(filename);
    const dirs = getDataDirs();
    
    // Verify upload path is in canonical uploads directory
    expect(uploadPath).toBe(path.join(dirs.uploads, filename));
    
    // Simulate file upload
    fs.writeFileSync(uploadPath, 'test content');
    
    // Verify file exists in canonical location
    expect(fs.existsSync(uploadPath)).toBe(true);
    
    // Verify no files in legacy locations
    const legacyUploadPaths = [
      path.join(process.cwd(), 'uploads', filename),
      path.join(process.cwd(), 'src', 'api', 'uploads', filename),
    ];
    
    for (const legacyPath of legacyUploadPaths) {
      expect(fs.existsSync(legacyPath)).toBe(false);
    }
    
    // Clean up
    fs.unlinkSync(uploadPath);
  });
  
  test('should handle render output to canonical location', () => {
    const projectId = 'test-project-123';
    const filename = 'output.mp4';
    const outputPath = getOutputPath(projectId, filename);
    const dirs = getDataDirs();
    
    // Verify output path is in canonical outputs directory
    expect(outputPath).toBe(path.join(dirs.outputs, projectId, filename));
    
    // Simulate render output
    const projectDir = getOutputPath(projectId);
    expect(fs.existsSync(projectDir)).toBe(true); // Should be created by getOutputPath
    
    fs.writeFileSync(outputPath, 'video content');
    
    // Verify file exists in canonical location
    expect(fs.existsSync(outputPath)).toBe(true);
    
    // Verify no files in legacy locations
    const legacyOutputPaths = [
      path.join(process.cwd(), 'output', projectId, filename),
      path.join(process.cwd(), 'out', projectId, filename),
    ];
    
    for (const legacyPath of legacyOutputPaths) {
      expect(fs.existsSync(legacyPath)).toBe(false);
    }
    
    // Clean up
    fs.rmSync(projectDir, { recursive: true, force: true });
  });
  
  test('should handle temporary files in canonical location', () => {
    const dirs = getDataDirs();
    const tmpFile = path.join(dirs.tmp, 'test-temp.txt');
    
    // Create temporary file
    fs.writeFileSync(tmpFile, 'temporary content');
    
    // Verify file exists in canonical tmp directory
    expect(fs.existsSync(tmpFile)).toBe(true);
    
    // Clean up
    fs.unlinkSync(tmpFile);
  });
  
  test('all data should be under single data root', () => {
    const dirs = getDataDirs();
    const dbPath = getDbPath();
    const uploadPath = getUploadPath('test.pdf');
    const outputPath = getOutputPath('project-1', 'video.mp4');
    
    // All paths should start with the test data root
    expect(dirs.db.startsWith(testDataRoot)).toBe(true);
    expect(dirs.uploads.startsWith(testDataRoot)).toBe(true);
    expect(dirs.outputs.startsWith(testDataRoot)).toBe(true);
    expect(dirs.tmp.startsWith(testDataRoot)).toBe(true);
    expect(dbPath.startsWith(testDataRoot)).toBe(true);
    expect(uploadPath.startsWith(testDataRoot)).toBe(true);
    expect(outputPath.startsWith(testDataRoot)).toBe(true);
  });
  
  test('should not create any files outside data root', () => {
    // Create some test files
    const uploadPath = getUploadPath('test.pdf');
    const outputPath = getOutputPath('project-1', 'video.mp4');
    
    fs.writeFileSync(uploadPath, 'test');
    fs.writeFileSync(outputPath, 'test');
    
    // Verify no legacy directories were created
    const legacyDirs = [
      path.join(process.cwd(), 'uploads'),
      path.join(process.cwd(), 'output'),
      path.join(process.cwd(), 'out'),
      path.join(process.cwd(), 'src', 'api', 'uploads'),
    ];
    
    for (const legacyDir of legacyDirs) {
      if (fs.existsSync(legacyDir)) {
        // If it exists, it should be empty or not created by our code
        const contents = fs.readdirSync(legacyDir);
        expect(contents.length).toBe(0);
      }
    }
    
    // Clean up
    fs.unlinkSync(uploadPath);
    fs.rmSync(path.dirname(outputPath), { recursive: true, force: true });
  });
});
