// src/api/ingest.js
// New ingestion endpoint for PDF processing with canonical data directory structure

import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { getDataDir, getUploadsDir } from './utils.js';
import { ingestPdf } from '../ingest/pdf.js';
import { fetchBggMetadata } from '../ingest/bgg.js';
import { generateStoryboard } from '../ingest/storyboard.js';
import db from './db.js';

// Fix for __dirname in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const router = express.Router();

// Get canonical data directory
const DATA_DIR = getDataDir();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadsDir = getUploadsDir();
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    // Create a safe filename with timestamp
    const timestamp = Date.now();
    const safeName = file.originalname.replace(/[^a-zA-Z0-9.]/g, '_');
    cb(null, `${timestamp}_${safeName}`);
  }
});

const upload = multer({ storage: storage });

/**
 * Ingest a PDF file and extract components
 */
router.post('/ingest', upload.single('file'), async (req, res) => {
  try {
    // Generate request ID for tracing
    const requestId = Math.random().toString(36).substring(2, 15) + 
                     Math.random().toString(36).substring(2, 15);
    
    console.log(`[${requestId}] Starting PDF ingestion`);
    
    if (!req.file) {
      console.log(`[${requestId}] No file uploaded`);
      return res.status(400).json({ 
        success: false, 
        error: 'No file uploaded' 
      });
    }
    
    const pdfPath = req.file.path;
    console.log(`[${requestId}] PDF uploaded to: ${pdfPath}`);
    
    // Extract text and images from PDF
    console.log(`[${requestId}] Extracting text and images from PDF`);
    const pdfResult = await ingestPdf(pdfPath);
    
    // Generate storyboard
    console.log(`[${requestId}] Generating storyboard`);
    const storyboard = generateStoryboard({ 
      parsedPages: pdfResult.parsedPages,
      opts: { heuristic: 'simple' }
    });
    
    // Save to database
    console.log(`[${requestId}] Saving to database`);
    const stmt = db.prepare(`
      INSERT INTO projects (name, metadata, components, images, script, audio)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    
    const projectId = stmt.run(
      req.file.originalname,
      JSON.stringify({ 
        source: 'pdf', 
        pages: pdfResult.parsedPages.length,
        images: pdfResult.images.length // Store number of extracted images
      }),
      JSON.stringify(storyboard.scenes),
      JSON.stringify(pdfResult.images), // Store extracted images
      null,
      null
    ).lastInsertRowid;
    
    console.log(`[${requestId}] Ingestion completed successfully. Project ID: ${projectId}`);
    
    res.json({
      success: true,
      projectId: projectId,
      fileName: req.file.originalname,
      pages: pdfResult.parsedPages.length,
      images: pdfResult.images.length,
      scenes: storyboard.scenes.length,
      requestId: requestId
    });
    
  } catch (error) {
    console.error('Ingestion error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

/**
 * Fetch BGG metadata by ID or URL (GET endpoint)
 */
router.get('/bgg', async (req, res) => {
  try {
    const { url } = req.query;
    
    if (!url) {
      return res.status(400).json({ 
        success: false, 
        error: 'BGG URL is required as query parameter' 
      });
    }
    
    const metadata = await fetchBggMetadata(url);
    
    res.json({
      success: true,
      metadata: metadata
    });
    
  } catch (error) {
    console.error('BGG fetch error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

/**
 * Fetch BGG metadata by ID or URL
 */
router.post('/bgg', async (req, res) => {
  try {
    const { bggIdOrUrl } = req.body;
    
    if (!bggIdOrUrl) {
      return res.status(400).json({ 
        success: false, 
        error: 'BGG ID or URL is required' 
      });
    }
    
    const metadata = await fetchBggMetadata(bggIdOrUrl);
    
    res.json({
      success: true,
      metadata: metadata
    });
    
  } catch (error) {
    console.error('BGG fetch error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

export default router;