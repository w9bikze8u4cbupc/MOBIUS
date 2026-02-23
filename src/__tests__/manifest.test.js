// src/__tests__/manifest.test.js
// Unit tests for manifest generation

import { calculateChecksum, getFileSize } from '../render/manifest.js';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';

describe('Manifest Generation', () => {
  describe('calculateChecksum', () => {
    test('should calculate SHA-256 checksum', async () => {
      // Create a temporary file
      const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mobius-manifest-'));
      const testFile = path.join(tmpDir, 'test.txt');
      const testContent = 'Hello, World!';
      
      await fs.writeFile(testFile, testContent, 'utf-8');
      
      // Calculate checksum
      const checksum = await calculateChecksum(testFile);
      
      // Verify checksum matches expected value
      const expectedChecksum = crypto.createHash('sha256').update(testContent).digest('hex');
      expect(checksum).toBe(expectedChecksum);
      
      // Cleanup
      await fs.rm(tmpDir, { recursive: true, force: true });
    });
    
    test('should return null for non-existent file', async () => {
      const checksum = await calculateChecksum('/nonexistent/file.txt');
      expect(checksum).toBeNull();
    });
    
    test('should produce different checksums for different content', async () => {
      const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mobius-manifest-'));
      const file1 = path.join(tmpDir, 'file1.txt');
      const file2 = path.join(tmpDir, 'file2.txt');
      
      await fs.writeFile(file1, 'Content A', 'utf-8');
      await fs.writeFile(file2, 'Content B', 'utf-8');
      
      const checksum1 = await calculateChecksum(file1);
      const checksum2 = await calculateChecksum(file2);
      
      expect(checksum1).not.toBe(checksum2);
      
      // Cleanup
      await fs.rm(tmpDir, { recursive: true, force: true });
    });
  });
  
  describe('getFileSize', () => {
    test('should return file size in bytes', async () => {
      const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mobius-manifest-'));
      const testFile = path.join(tmpDir, 'test.txt');
      const testContent = 'Hello, World!';
      
      await fs.writeFile(testFile, testContent, 'utf-8');
      
      const size = await getFileSize(testFile);
      
      expect(size).toBe(Buffer.byteLength(testContent, 'utf-8'));
      
      // Cleanup
      await fs.rm(tmpDir, { recursive: true, force: true });
    });
    
    test('should return 0 for non-existent file', async () => {
      const size = await getFileSize('/nonexistent/file.txt');
      expect(size).toBe(0);
    });
    
    test('should handle empty files', async () => {
      const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mobius-manifest-'));
      const testFile = path.join(tmpDir, 'empty.txt');
      
      await fs.writeFile(testFile, '', 'utf-8');
      
      const size = await getFileSize(testFile);
      
      expect(size).toBe(0);
      
      // Cleanup
      await fs.rm(tmpDir, { recursive: true, force: true });
    });
  });
});
