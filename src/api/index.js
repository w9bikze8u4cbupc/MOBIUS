
import express from 'express';
import cors from 'cors';
import db from './db.js';
import dotenv from 'dotenv';
import fetchJson from './utils/fetchJson.js';
import * as cheerio from 'cheerio';
import OpenAI from 'openai';
import * as pdfToImg from 'pdf-to-img';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn, execFile } from 'child_process';
import { ensureDir } from 'fs-extra'; // If you use fs-extra for directory creation  
import sharp from 'sharp'; // For image processing
import { dirname } from 'path';
import { XMLParser } from 'fast-xml-parser';
import fs, { promises as fsPromises, existsSync } from 'fs';
import { explainChunkWithAI } from './aiUtils.js';
import { extractTextFromPDF } from './pdfUtils.js';
import { extractComponentsFromText } from './utils.js';
import { extractComponentsWithAI } from './aiUtils.js';
import multer from 'multer';
import pdfParse from 'pdf-parse';
import xml2js from 'xml2js';
import { promisify } from 'node:util';



dotenv.config();
console.log('Loaded OpenAI key:', process.env.OPENAI_API_KEY ? 'Yes' : 'No');

console.log('API file loaded!');

const app = express();
const port = process.env.PORT || 5001;
const bggMetadataCache = new Map();


// Fix for __dirname in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const execFilePromise = promisify(execFile);

// CORS configuration - MUST be before other middleware/routes
app.use(cors({
  origin: 'http://localhost:3000',
  credentials: true
}));
app.use(express.json());
app.use('/static', express.static(path.join(__dirname, 'uploads')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// --- API Configuration ---
const BACKEND_URL = `http://localhost:${port}`;
const IMAGE_EXTRACTOR_API_KEY = process.env.IMAGE_EXTRACTOR_API_KEY;
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Validate OUTPUT_DIR at startup  
const OUTPUT_DIR = process.env.OUTPUT_DIR || path.join(__dirname, 'uploads', 'MobiusGames');
if (!OUTPUT_DIR || typeof OUTPUT_DIR !== 'string') {
  console.error('Invalid OUTPUT_DIR configuration');
  process.exit(1);  
}

console.log('Starting server...');

// Optional: Suppress specific warnings
const originalWarn = console.warn;
console.warn = function (...args) {
  if (
    typeof args[0] === 'string' &&
    args[0].includes('getPathGenerator - ignoring character')
  ) {
    return; // Do nothing
  }
  originalWarn.apply(console, args);
};

// --- Simple API Key Middleware (Development Mode) ---  
app.use((req, res, next) => {  
  // TODO: Implement proper session-based authentication  
  // For now, skip API key validation in development  
  console.log(`${req.method} ${req.path} - API key validation skipped`);  
  next();  
});



// --- API Endpoint for Explaining Text Chunks ---
app.post('/api/explain-chunk', async (req, res) => {  
  try {  
    const { chunk, language } = req.body;  
    if (!chunk) {  
      return res.status(400).json({ error: 'No text chunk provided.' });  
    }  
    // Default to English if language not specified  
    const lang = language === 'fr' ? 'fr' : 'en';  
    const explanation = await explainChunkWithAI(chunk, lang);  
    res.json({ explanation });  
  } catch (err) {  
    console.error('Error in /api/explain-chunk:', err);  
    res.status(500).json({ error: 'Failed to generate explanation.' });  
  }  
});

// --- Save Project Endpoint ---
app.post('/save-project', (req, res) => {
  const { name, metadata, components, images, script, audio } = req.body;

  db.run(
    `INSERT INTO projects (name, metadata, components, images, script, audio)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      name,
      JSON.stringify(metadata),
      JSON.stringify(components),
      JSON.stringify(images),
      script,
      audio
    ],
    function (err) {
      if (err) {
        console.error(err); // Log full error for debugging
        return res.status(500).json({ error: 'Failed to save project. Please try again later.' });
      }
      res.json({ status: 'success', projectId: this.lastID });
    }
  );
});



// --- Helper Functions ---

// Helper function to extract game ID from BGG URL 
function extractGameIdFromBGGUrl(url) {  
  const match = url.match(/\/boardgame\/(\d+)/);  
  return match ? match[1] : null;  
}  

// Helper function to extract and store images
async function extractAndStoreImages(filePathOrUrl, outputDir = 'uploads/extracted-images') {
  const tempDir = path.join(process.cwd(), outputDir);
  await ensureDir(tempDir);

  let extractedImages = [];

  if (
    path.isAbsolute(filePathOrUrl) ||
    (typeof filePathOrUrl === 'string' &&
      (filePathOrUrl.startsWith('http') || filePathOrUrl.includes('/')))
  ) {
    // Handle URL extraction
    extractedImages = await extractImagesFromUrl(filePathOrUrl, IMAGE_EXTRACTOR_API_KEY, 'basic');
  } else {
    // Handle PDF extraction
    extractedImages = await extractImagesFromPDF(filePathOrUrl, tempDir);
  }

  // Generate previews for all extracted images
  for (const img of extractedImages) {
    await generatePreviewImage(img.path, 'uploads/tmp');
  }

  return extractedImages;
}

// Preview Generation function
async function generatePreviewImage(filePath, outputPath = 'uploads/tmp', quality = 75) {  
  try {  
    const previewDir = path.join(process.cwd(), outputPath);  
    const previewName = path.basename(filePath);  
    const previewPath = path.join(previewDir, previewName);  
  
    await sharp(filePath)  
      .resize(300, 300, {  
        fit: 'inside',  
        withoutEnlargement: true  
      })  
      .jpeg({ quality })  
      .toFile(previewPath);  
  
    return previewPath;  
  } catch (err) {  
    console.error('Error generating preview:', err);  
    return null;  
  }  
}
  
// BGG XML API extraction function  
async function extractBGGMetadataFromAPI(gameId) {  
  try {  
    console.log('🔗 Fetching from BGG API for game ID:', gameId);  
      
    const url = `https://boardgamegeek.com/xmlapi2/thing?id=${gameId}&stats=1`;  
    const xml = await fetchJson(url, {
      method: 'GET',
      headers: { 'User-Agent': 'BoardGameTutorialGenerator/1.0' },
      responseType: 'xml',
      timeout: 10000,
      retries: 3,
      context: { area: 'bgg', action: 'fetch_metadata', gameId }
    });  
  
    const parser = new xml2js.Parser({ explicitArray: false });  
    const result = await parser.parseStringPromise(xml);  
      
    if (!result.items || !result.items.item) {  
      throw new Error('Game not found in BGG API');  
    }  
  
    const item = result.items.item;  
      
    // Handle both single name and array of names  
    const gameName = Array.isArray(item.name)   
      ? item.name.find(n => n.$.type === 'primary')?.$.value || item.name[0].$.value  
      : item.name.$.value;  
  
    // Extract publishers  
    const publishers = item.link   
      ? (Array.isArray(item.link) ? item.link : [item.link])  
          .filter(link => link.$.type === 'boardgamepublisher')  
          .map(link => link.$.value)  
      : [];  
  
    // Extract designers  
    const designers = item.link   
      ? (Array.isArray(item.link) ? item.link : [item.link])  
          .filter(link => link.$.type === 'boardgamedesigner')  
          .map(link => link.$.value)  
      : [];  
  
    // Extract artists  
    const artists = item.link   
      ? (Array.isArray(item.link) ? item.link : [item.link])  
          .filter(link => link.$.type === 'boardgameartist')  
          .map(link => link.$.value)  
      : [];  
  
    return {  
      title: gameName || '',  
      publisher: publishers,  
      player_count: `${item.minplayers?.$.value || '?'}-${item.maxplayers?.$.value || '?'}`,  
      play_time: `${item.playingtime?.$.value || item.maxplaytime?.$.value || '?'} min`,  
      min_age: `${item.minage?.$.value || '?'}+`,  
      theme: '', // Categories would need additional processing  
      mechanics: [], // Mechanics would need additional processing  
      designers: designers,  
      artists: artists,  
      description: item.description || '',  
      average_rating: item.statistics?.ratings?.average?.$.value   
        ? parseFloat(item.statistics.ratings.average.$.value).toFixed(1)  
        : '',  
      bgg_rank: item.statistics?.ratings?.ranks?.rank?.$?.value || '',  
      bgg_id: gameId,  
      cover_image: item.image || '',  
      thumbnail: item.thumbnail || item.image || '',  
    };  
  
  } catch (error) {  
    console.error('❌ Error extracting from BGG API:', error.message);  
    throw error;  
  }  
}


// Helper: Extract BGG game ID from a BGG URL
function extractBGGId(url) {
  const patterns = [
    /boardgame\/(\d+)/,           // Standard format
    /thing\/(\d+)/,               // Alternative format
    /\/(\d+)\//,                  // Just ID in URL
    /id=(\d+)/                    // Query parameter format
  ];
  
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

// Helper: Extract components from BGG description
function extractComponentsFromDescription(description) {
  if (!description) return [];
  
  // Clean HTML tags
  const cleanText = description.replace(/<[^>]*>/g, ' ').replace(/&[^;]+;/g, ' ');
  
  // Look for components section (multiple patterns)
  const patterns = [
    /components?:\s*([\s\S]+?)(?:\n\n|\r\n\r\n|setup|gameplay|overview|$)/i,
    /contents?:\s*([\s\S]+?)(?:\n\n|\r\n\r\n|setup|gameplay|overview|$)/i,
    /includes?:\s*([\s\S]+?)(?:\n\n|\r\n\r\n|setup|gameplay|overview|$)/i,
    /game contains?:\s*([\s\S]+?)(?:\n\n|\r\n\r\n|setup|gameplay|overview|$)/i
  ];
  
  for (const pattern of patterns) {
    const match = cleanText.match(pattern);
    if (match) {
      return match[1]
        .split(/\n|•|–|-|\*/)
        .map(line => line.trim())
        .filter(line => line.length > 3 && !line.match(/^\d+$/))
        .map(line => line.replace(/^\d+\s*x?\s*/i, '').trim())
        .filter(line => line.length > 0)
        .slice(0, 50); // Limit to 50 components max
    }
  }
  
  return [];
}

// Helper: Clean and validate components
function cleanComponents(components) {
  return components
    .map(comp => comp.trim())
    .filter(comp => comp.length > 2)
    .filter(comp => !comp.match(/^(and|or|the|a|an)$/i))
    .map(comp => {
      // Remove quantity prefixes like "1x", "12", etc.
      return comp.replace(/^\d+\s*x?\s*/i, '').trim();
    })
    .filter(comp => comp.length > 0);
}

// Optional: Route to get just components (lighter endpoint)
app.get('/api/bgg-components', async (req, res) => {
  try {
    const { url } = req.query;
    
    if (!url) {
      return res.status(400).json({ error: 'BGG URL is required' });
    }

    const gameId = extractBGGId(url);  // Add this line
    if (!gameId) {  
      return res.status(400).json({ error: 'Invalid BGG URL format' });  
    }

    const apiUrl = `https://boardgamegeek.com/xmlapi2/thing?id=${gameId}`;
    const xml = await fetchJson(apiUrl, {
      method: 'GET',
      responseType: 'xml',
      timeout: 8000,
      retries: 3,
      context: { area: 'bgg', action: 'fetch_components', gameId }
    });
    const parsed = await xml2js.parseStringPromise(xml, { explicitArray: false });
    
    const item = parsed.items.item;
    const description = item.description || '';
    let components = extractComponentsFromDescription(description);
    components = cleanComponents(components);

    const normalizedComponents = components.map(item => {
      if (typeof item === 'string') {
        return { name: item, quantity: null, selected: true };
      } else if (typeof item === 'object' && item.name) {
        return {
          name: item.name,
          quantity: item.quantity || null,
          selected: item.selected !== undefined ? item.selected : true
        };
      } else {
        return { name: String(item), quantity: null, selected: true };
      }
    });
    
    res.json({
      success: true,
      gameId,
      components: normalizedComponents.slice(0, 30),
      extractedAt: new Date().toISOString()
    });

  } catch (error) {
    console.error('BGG components extraction error:', error.message);
    res.status(500).json({ 
      error: 'Failed to extract components',
      details: error.message 
    });
  }
});

app.post('/api/extract-components', async (req, res) => {    
  try {    
    console.log('Starting component extraction...');    
    const pdfPath = req.body.pdfPath;    
    if (!pdfPath) {    
      return res.status(400).json({ error: 'No PDF path provided' });    
    }    
  
    const extractedText = await extractTextFromPDF(pdfPath);
  
    // 1. Section headers (expanded, multi-language, many variations)
    const headers = [
      'components', 'game components', 'contents', 'box contents', 'materials',
      'component list', 'what\'s in the box', 'inside the box', 'game materials',
      'game contents', 'matériel', 'matériel de jeu', 'spielmaterial', 'spielinhalt',
      'componenti', 'componentes', 'conteúdo', 'materiaal', 'inhoud', 'contenu',
      'contenido', 'materiali', 'material', 'what you get', 'game includes', 'includes'
    ];
    
    // 2. Component keywords (expanded, multi-language)
    const componentKeywords = [
      'card', 'cards', 'cartes', 'carte', 'cartas', 'karten',
      'token', 'tokens', 'jeton', 'jetons', 'ficha', 'fichas', 'marker', 'markers',
      'board', 'boards', 'plateau', 'plateaux', 'tablero', 'tableros', 'brett',
      'tile', 'tiles', 'tuile', 'tuiles', 'baldosa', 'baldosas', 'plättchen',
      'piece', 'pieces', 'pièce', 'pièces', 'pieza', 'piezas', 'spielstein',
      'die', 'dice', 'dé', 'dés', 'dado', 'dados', 'würfel',
      'meeple', 'meeples', 'pawn', 'pawns', 'pion', 'pions', 'peón', 'peones',
      'cube', 'cubes', 'chip', 'chips', 'counter', 'counters',
      'miniature', 'miniatures', 'figurine', 'figurines', 'figura', 'figuras',
      'standee', 'standees', 'stand', 'stands',
      'rulebook', 'rules', 'règles', 'reglas', 'regelwerk', 'manual',
      'reference', 'aid', 'sheet', 'sheets', 'pad', 'pads',
      'bag', 'bags', 'sac', 'sacs', 'bolsa', 'bolsas', 'beutel',
      'screen', 'screens', 'écran', 'écrans', 'pantalla', 'pantallas',
      'disc', 'discs', 'disk', 'disks', 'disque', 'disques',
      'cylinder', 'cylinders', 'barrel', 'barrels',
      'resource', 'resources', 'commodity', 'commodities',
      'track', 'tracks', 'tracker', 'trackers',
      'wheel', 'wheels', 'dial', 'dials',
      'mat', 'mats', 'tapis', 'alfombrilla',
      'insert', 'organizer', 'overlay', 'box', 'player aid', 'player aids'
    ];
    
    // 2.1. Negative keywords for filtering components
    const negativeKeywords = [
      "setup", "how to play", "page", "example", "introduction", "scoring", "rules", "contents", "overview", "credits",
      "thank you", "illustration", "illustrations", "designed by", "gameplay", "objectives", "objective", "instructions",
      "for example", "see page", "see", "note", "notes", "important", "tip", "tips", "reminder", "reminders", "appendix",
      "reference", "index", "table of contents", "end of game", "winning", "win", "lose", "loss", "losing", "victory",
      "defeat", "player aid", "player aids", "summary", "summaries", "glossary", "faq", "frequently asked questions",
      "contact", "support", "website", "www", "copyright", "all rights reserved", "printed in", "manufactured by",
      "published by", "edition", "version", "revision", "updated", "update", "errata", "correction", "corrections",
      "clarification", "clarifications", "expansion", "expansions", "promo", "promos", "special thanks", "dedication",
      "dedicated to", "in memory of", "memory", "in honor of", "honor", "with thanks", "thanks"
    ];
    
    function isComponentLine(line) {  
      const lower = line.toLowerCase().trim();  
      if (lower.length < 3) return false; // skip very short lines  
      if (/^\d+$/.test(lower)) return false; // skip lines that are just numbers  
      return !negativeKeywords.some(keyword => lower.includes(keyword));  
    }
    
    // 3. Next section keywords (to stop extraction)
    const nextSectionKeywords = [
      'setup', 'game setup', 'preparation', 'preparing for play', 'setting up',
      'game play', 'gameplay', 'how to play', 'playing the game', 'course of play', 'rules of play',
      'objective', 'game objective', 'goal of the game', 'winning the game',
      'introduction', 'overview', 'foreword', 'summary',
      'game round', 'player turn', 'sequence of play', 'phases of play',
      'appendix', 'glossary', 'index', 'credits', 'clarifications', 'faq'
    ];
    
    // 4. Build regexes
    const headerRegex = new RegExp(
      `^\\s*(${headers.join('|')})\\s*[:\\-–—]?\\s*$`,
      'im'
    );
    
    const nextSectionRegex = new RegExp(
      `^\\s*(${nextSectionKeywords.join('|')})\\s*[:\\-–—]?\\s*$`,
      'im'
    );
    
    const allCapsHeaderRegex = /^[A-Z0-9\sÀ-ÖØ-ÞŸ\-–—:]{5,}[A-Z0-9À-ÖØ-ÞŸ]$/;
    
    // 5. Pre-process and split the text into lines
    let cleanedText = extractedText
      .replace(/<\/?[biup]>|<\/?strong>|<\/?em>|<\/?span>/gi, "") // Remove simple HTML tags
      .replace(/•|◦|▪|▫|►|★|☆|❖|◊/g, '*'); // Normalize bullets
    
    const lines = cleanedText.split(/\r?\n/).map(l => l.trim());
    
    // Track extraction method and stats  
    let extractionMethod = 'unknown';  
    let extractionStats = {  
      totalLines: lines.length,  
      headerFound: false,  
      headerLine: null,  
      componentLinesFound: 0,  
      fallbackUsed: false,  
      processingSteps: []  
    };  
  
    // 6. Find the component section header  
    let startIdx = -1;  
    let foundHeaderLine = "";  
    for (let i = 0; i < lines.length; i++) {  
      if (headerRegex.test(lines[i])) {  
        foundHeaderLine = lines[i].toLowerCase();  
        startIdx = i + 1;  
        console.log(`Found header at line ${i}: "${lines[i]}"`);  
          
        // Update extraction stats  
        extractionMethod = 'header_based';  
        extractionStats.headerFound = true;  
        extractionStats.headerLine = lines[i];  
        extractionStats.processingSteps.push(`Header found at line ${i}: "${lines[i]}"`);  
        break;  
      }  
    }  
  
    // Log if no header was found  
    if (startIdx === -1) {  
      console.log('No component header found, will use fallback method');  
      extractionMethod = 'fallback_scan';  
      extractionStats.fallbackUsed = true;  
      extractionStats.processingSteps.push('No header found, using fallback keyword scanning');  
    }  
      
    // 7. Extract lines after the header (keep your existing logic)  
    let componentLines = [];  
    if (startIdx !== -1) {  
      // [Keep your existing header-based extraction logic exactly as is]  
      for (let i = startIdx; i < lines.length; i++) {  
        const line = lines[i];  
          
        // Stop conditions  
        if (line === '') break;  
        if (nextSectionRegex.test(line)) {  
          extractionStats.processingSteps.push(`Stopped at next section: "${line}"`);  
          break;  
        }  
          
        if (headerRegex.test(line) && line.toLowerCase() !== foundHeaderLine) {  
          extractionStats.processingSteps.push(`Stopped at new header: "${line}"`);  
          break;  
        }  
          
        if (allCapsHeaderRegex.test(line) && line.length > 5 && !/\d/.test(line.substring(0,3)) && line.toLowerCase() !== foundHeaderLine) {  
          const wordsInAllCapsLine = line.split(/\s+/).length;  
          if (wordsInAllCapsLine <= 5 && !componentKeywords.some(kw => line.toLowerCase().includes(kw))) {  
            extractionStats.processingSteps.push(`Stopped at all-caps header: "${line}"`);  
            break;  
          }  
        }  
          
        if (/^[-–—•*]+$/.test(line)) continue;  
        if (/(page \d+|turn to page|see page|continued|setup|overview|goal|objective|winning|end of game)/i.test(line)) continue;  
          
        componentLines.push(line);  
      }  
    } else {  
      // 8. Fallback: scan entire text for component-like lines (keep your existing logic)  
      componentLines = lines.filter(line => {  
        if (!line) return false;  
        if (/(Ltd\.|LLC|Inc\.|Email:|Website:|Designer:|Artist:|Producer:|Original:|Translation:|Proofreading:|Copyright|©|\d{4}\s+\w+\s+Games|www\.)/i.test(line)) return false;  
        if (line.length < 3 || line.length > 80) return false;  
          
        // Enhanced false positive filtering (UPDATED)  
        const actionWords = /(each player|players take|place the|shuffle|deal|draw|roll|move|during|after|before|if you|you may|you must|remove|add|put|take|give|receive|choose|select|pick|discard|return|flip|reveal|look at|check|count|score|gain|lose|pay|spend|use|play|activate)/i;  
        const setupWords = /(setup|preparation|game setup|how to play|rules|objective|goal|winning|end game|designer|artist|illustrator|publisher|copyright|©|www\.|email|website)/i;  
        const pageWords = /(page \d+|see page|turn to|continued on|figure \d+|example|note:|important:|tip:|warning:)/i;  
          
        if (actionWords.test(line) || setupWords.test(line) || pageWords.test(line)) return false;  
          
        const hasNumber = /\b\d+\b/.test(line);  
        const hasComponentKeyword = componentKeywords.some(kw => new RegExp(`\\b${kw}s?\\b`, 'i').test(line));  
          
        // For now, just use exact keyword matching  
        const hasAnyKeyword = hasComponentKeyword;  
          
        if (hasNumber && hasAnyKeyword) return true;  
        if (/^\d+\s+\w/.test(line) && hasAnyKeyword) return true;  
        if (hasAnyKeyword && line.split(/\s+/).length <= 4) return true;  
          
        return false;  
      });  
        
      extractionStats.processingSteps.push(`Fallback scan found ${componentLines.length} potential component lines`);  
    }  
      
    // Update stats  
    extractionStats.componentLinesFound = componentLines.length;  
      
    // [Keep all your existing processing logic: cleaning, expanding, merging, filtering...]  
      
    // 9. Clean up component lines  
    componentLines = componentLines  
      .map(line => line.replace(/^[-–—•*]+\s*/, '').replace(/\s{2,}/g, ' ').trim())  
      .filter(line => line.length > 0);  
      
    // 9.1. Handle inline/paragraph lists (expand lines with multiple components)  
    let expandedLines = [];  
    for (let line of componentLines) {  
      // Find all "number + word(s)" pairs  
      let matches = line.match(/\d+\s+[a-zA-ZÀ-ÿ\-]+/g);  
      if (matches && matches.length > 1) {  
        expandedLines.push(...matches);  
        extractionStats.processingSteps.push(`Expanded line "${line}" into ${matches.length} components`);  
      } else {  
        expandedLines.push(line);  
      }  
    }  
    componentLines = expandedLines;  
      
    // 9.2. Handle multi-line components (merge split lines)  
    let mergedLines = [];  
    for (let i = 0; i < componentLines.length; i++) {  
      let currentLine = componentLines[i];  
        
      // If current line ends with comma or "and", try to merge with next line  
      if (i < componentLines.length - 1 && /[,]$|and\s*$/.test(currentLine)) {  
        let nextLine = componentLines[i + 1];  
          
        // Only merge if next line doesn't start with a number (isn't a new component)  
        if (!/^\d+/.test(nextLine)) {  
          mergedLines.push(currentLine + ' ' + nextLine);  
          extractionStats.processingSteps.push(`Merged lines: "${currentLine}" + "${nextLine}"`);  
          i++; // Skip the next line since we merged it  
          continue;  
        }  
      }  
        
      // If current line is very short and next line doesn't start with number, might be continuation  
      if (i < componentLines.length - 1 && currentLine.length < 15 && !/^\d+/.test(componentLines[i + 1])) {  
        mergedLines.push(currentLine + ' ' + componentLines[i + 1]);  
        extractionStats.processingSteps.push(`Merged short line: "${currentLine}" + "${componentLines[i + 1]}"`);  
        i++; // Skip the next line  
        continue;  
      }  
        
      mergedLines.push(currentLine);  
    }  
    componentLines = mergedLines;  
      
    componentLines = componentLines.filter(isComponentLine);  
      
    // 10. Parse components with improved patterns (keep your existing logic)  
    let components = componentLines.map((line, index) => {    
      console.log(`Parsing line ${index}: "${line}"`);    
      let match;  
      let confidence = 0.5; // Default confidence  
      let parseMethod = 'default';  
  
      // Pattern 1: "7 Cards" or "7x Cards"    
      match = line.match(/^(\d+)\s*[xX×.]?\s*(.+)$/);    
      if (match) {  
        confidence = 0.9;  
        parseMethod = 'quantity_first';  
        return {   
          name: match[2].trim(),   
          quantity: parseInt(match[1]),   
          selected: true,  
          confidence,  
          parseMethod  
        };  
      }  
  
      // Pattern 2: "Cards (7)" or "Cards x7"    
      match = line.match(/^(.+?)\s*[\(xX×]\s*(\d+)[\)]?$/);    
      if (match) {  
        confidence = 0.85;  
        parseMethod = 'quantity_parentheses';  
        return {   
          name: match[1].trim(),   
          quantity: parseInt(match[2]),   
          selected: true,  
          confidence,  
          parseMethod  
        };  
      }  
  
      // Pattern 3: "Cards: 7" or "Cards - 7"    
      match = line.match(/^(.+?)\s*[:\-–—]\s*(\d+)$/);    
      if (match) {  
        confidence = 0.8;  
        parseMethod = 'quantity_separator';  
        return {   
          name: match[1].trim(),   
          quantity: parseInt(match[2]),   
          selected: true,  
          confidence,  
          parseMethod  
        };  
      }  
  
      // Pattern 3.1: "6 of each colour"    
      match = line.match(/^(\d+)\s+of each\s+(.+)$/i);    
      if (match) {  
        confidence = 0.75;  
        parseMethod = 'of_each';  
        return {   
          name: `Each ${match[2]}`,   
          quantity: parseInt(match[1]),   
          selected: true,   
          note: "of each",  
          confidence,  
          parseMethod  
        };  
      }  
  
      // Pattern 3.2: "4 per player"    
      match = line.match(/^(\d+)\s+per player$/i);    
      if (match) {  
        confidence = 0.7;  
        parseMethod = 'per_player';  
        return {   
          name: "Per Player",   
          quantity: parseInt(match[1]),   
          selected: true,   
          note: "per player",  
          confidence,  
          parseMethod  
        };  
      }  
  
      // Pattern 4: "Cards 7" (space separated)    
      match = line.match(/^(.+?)\s+(\d+)$/);    
      if (match && match[1].length > 3) {  
        confidence = 0.65;  
        parseMethod = 'space_separated';  
        return {   
          name: match[1].trim(),   
          quantity: parseInt(match[2]),   
          selected: true,  
          confidence,  
          parseMethod  
        };  
      }  
  
      // Pattern 6: Ranges like "20-30 tokens"    
      match = line.match(/^(\d+)[–\-](\d+)\s+(.+)$/);    
      if (match) {  
        confidence = 0.6;  
        parseMethod = 'quantity_range';  
        return {   
          name: match[3].trim(),   
          quantity: `${match[1]}-${match[2]}`,   
          selected: true,   
          note: "range",  
          confidence,  
          parseMethod  
        };  
      }  
  
      // Pattern 7: "a set of X for each player"    
      match = line.match(/^a set of (\d+)\s+(.+?)\s+for each player/i);    
      if (match) {  
        confidence = 0.7;  
        parseMethod = 'set_per_player';  
        return {   
          name: `Set of ${match[2]} per player`,   
          quantity: parseInt(match[1]),   
          selected: true,   
          note: "per player",  
          confidence,  
          parseMethod  
        };  
      }  
  
      // Pattern 8: "several" or "some"    
      match = line.match(/^(several|some|many|various)\s+([a-zA-ZÀ-ÿ\-\s]+)$/i);    
      if (match) {  
        confidence = 0.4;  
        parseMethod = 'indefinite_quantity';  
        return {   
          name: match[2].trim(),   
          quantity: null,   
          selected: true,   
          note: match[1].toLowerCase(),  
          confidence,  
          parseMethod  
        };  
      }  
  
      // Pattern 9: "X sets of Y"    
      match = line.match(/^(\d+)\s+sets? of\s+(.+)$/i);    
      if (match) {  
        confidence = 0.75;  
        parseMethod = 'sets_of';  
        return {   
          name: `Sets of ${match[2]}`,   
          quantity: parseInt(match[1]),   
          selected: true,   
          note: "sets",  
          confidence,  
          parseMethod  
        };  
      }  
  
      // Default: just the component name    
      confidence = 0.3;  
      parseMethod = 'name_only';  
      return {   
        name: line,   
        quantity: null,   
        selected: true,  
        confidence,  
        parseMethod  
      };    
    });  
  
   // Remove duplicates and merge similar entries    
    const nameMap = new Map();    
    components.forEach(component => {    
      const normalizedName = component.name.toLowerCase()    
        .replace(/s$/, '') // Remove plural 's'    
        .replace(/[^\w\s]/g, '') // Remove punctuation    
        .trim();    
      const existing = nameMap.get(normalizedName);    
      if (!existing) {    
        nameMap.set(normalizedName, component);    
      } else {    
        if (component.quantity && !existing.quantity) {    
          nameMap.set(normalizedName, component);    
        } else if (!component.quantity && existing.quantity) {    
          // Keep existing    
        } else if (component.name.length > existing.name.length) {    
          nameMap.set(normalizedName, { ...component, quantity: existing.quantity || component.quantity });    
        }    
      }    
    });    
  
    const uniqueComponents = Array.from(nameMap.values());    
  
    // Sort components by name    
    uniqueComponents.sort((a, b) => a.name.localeCompare(b.name));    
  
    // Calculate overall extraction confidence  
    const avgConfidence = uniqueComponents.length > 0   
      ? uniqueComponents.reduce((sum, comp) => sum + (comp.confidence || 0.5), 0) / uniqueComponents.length  
      : 0;  
  
    // Update final stats  
    extractionStats.finalComponentCount = uniqueComponents.length;  
    extractionStats.averageConfidence = Math.round(avgConfidence * 100) / 100;  
    extractionStats.processingSteps.push(`Final result: ${uniqueComponents.length} unique components`);  
  
    // Fallback if no components found    
    if (uniqueComponents.length === 0) {    
      const fallbackComponents = [    
        { name: "Game Board", quantity: 1, selected: true, confidence: 0.1, parseMethod: 'fallback' },    
        { name: "Player Cards", quantity: null, selected: true, confidence: 0.1, parseMethod: 'fallback' },    
        { name: "Game Tokens", quantity: null, selected: true, confidence: 0.1, parseMethod: 'fallback' },    
        { name: "Rulebook", quantity: 1, selected: true, confidence: 0.1, parseMethod: 'fallback' }    
      ];  
        
      extractionMethod = 'fallback_defaults';  
      extractionStats.processingSteps.push('No components found, using fallback defaults');  
        
      console.log(`Extraction complete. Using fallback defaults.`);  
      return res.json({   
        success: true,  
        components: fallbackComponents,  
        extractionMethod,  
        extractionStats,  
        message: 'No components found in PDF, using default components'  
      });    
    }    
  
    console.log(`Extraction complete. Found ${uniqueComponents.length} components.`);  
      
    // Enhanced response format  
    res.json({   
      success: true,  
      components: uniqueComponents,  
      extractionMethod,  
      extractionStats,  
      message: `Successfully extracted ${uniqueComponents.length} components using ${extractionMethod} method`  
    });  
  
  } catch (err) {    
    console.error('Component extraction error:', err);    
    res.status(500).json({   
      success: false,  
      error: err.message,  
      extractionMethod: 'error',  
      extractionStats: null  
    });    
  }    
});

async function extractImagesFromUrl(url, apiKey, mode = 'basic') {
  console.log('extractImagesFromUrl called for:', url);
  // 1. Start extraction
  const startRes = await fetchJson(
    'https://api.extract.pics/v0/extractions',
    {
      method: 'POST',
      body: { url, mode },
      headers: {
        'Content-Type': 'application/json'
      },
      token: apiKey,
      timeout: 15000,
      retries: 2,
      context: { area: 'image_extraction', action: 'start', url }
    }
  );
  const extractionId = startRes.data.id;

  // 2. Poll for completion
  let status = startRes.data.data.status;
  let images = [];
  let attempts = 0;
  while (status !== 'done' && status !== 'failed' && attempts < 20) {
    await new Promise(res => setTimeout(res, 2000)); // wait 2 seconds
    const pollRes = await fetchJson(
      `https://api.extract.pics/v0/extractions/${extractionId}`,
      {
        method: 'GET',
        token: apiKey,
        timeout: 10000,
        retries: 3,
        context: { area: 'image_extraction', action: 'poll', extractionId }
      }
    );
    status = pollRes.data.status;
    images = pollRes.data.images || [];
    attempts++;
  }

  if (status === 'done') {
    return images.map(img => img.url);
  } else {
    throw new Error(`Extraction failed or timed out for ${url}`);
  }
}

async function extractImagesFromPDF(pdfPath, outputDir) {  
  const pdfResult = await pdfToImg.pdf(pdfPath);  
  await fsPromises.mkdir(outputDir, { recursive: true }); 
  
  const images = [];  
  let pageIndex = 0;  
  for await (const page of pdfResult) {
    try {
      pageIndex++;
      const pageFileName = `page${pageIndex}.png`;
      const pagePath = path.join(outputDir, pageFileName);
      await fsPromises.writeFile(pagePath, page);
      images.push(pagePath);
    } catch (err) {
      console.error(`Failed to save page ${pageIndex}:`, err);
    }
  }
  return images;  
}


function getDateString() {
  const date = new Date();
  return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
}

function splitIntoSections(text) {
  const regex = /(^|\n)(##? |[A-Z][A-Z\s\d\-\(\)\.]{3,}$|^\d+\.\s)/gm;
  const parts = text.split(regex);
  let sections = [];
  for (let i = 1; i < parts.length; i += 3) {
    const delimiter = parts[i];
    const sectionContent = parts[i + 2];
    if (sectionContent) {
      sections.push((delimiter ? delimiter + '\n' : '') + sectionContent.trim());
    }
  }
  if (parts[0]) {
    sections.unshift(parts[0].trim());
  }
  return sections.filter(Boolean);
}

async function extractMetadata(rulebookText) {
  const prompt = `You are an expert boardgame analyst. Your task is to extract key metadata from the following boardgame rulebook, which is provided in PDF format.   

    Carefully read the entire rulebook and return the metadata in the following structured JSON format:  
      
    {  
      "title": "",  
      "designer": "",  
      "artist": "",  
      "publisher": "",  
      "year_published": "",  
      "player_count": "",  
      "recommended_age": "",  
      "play_time": "",  
      "components": [],  
      "short_description": "",  
      "mechanics": [],  
      "categories": [],  
      "setup_summary": "",  
      "win_condition": "",  
      "notable_rules": []  
    }  
      
    Instructions:  
    - If any field is missing or not specified, return an empty string or empty list for that field.  
    - For "components", list all physical items included in the game.  
    - For "mechanics", list the main gameplay mechanisms (e.g., deck-building, worker placement).  
    - For "categories", list the game’s genres or themes (e.g., strategy, party, fantasy).  
    - For "setup_summary", provide a concise summary of the setup process.  
    - For "win_condition", describe how a player wins the game.  
    - For "notable_rules", list any unique or important rules that distinguish this game.  
    - Do not include any information not found in the rulebook.  
    - Return only the JSON object, with no extra commentary.

  Rulebook text:
  ${rulebookText.slice(0, 2000)}`;
  
  try {
    console.log('Extracting metadata...');
    const response = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        { role: 'system', content: 'You are a precise metadata extractor.' },
        { role: 'user', content: prompt },
      ],
      max_tokens: 500,
      temperature: 0.5,
    });
    
    const metadata = JSON.parse(response.choices[0].message.content.trim());
    return metadata;
  } catch (err) {
    console.error('Error parsing metadata JSON:', err);
    return {
      publisher: 'Not found',
      playerCount: 'Not found',
      gameLength: 'Not found',
      minimumAge: 'Not found',
      theme: 'Not found',
      edition: 'Not found',
    };
  }
}

async function summarizeChunkEnglish(chunk) {
  const prompt = `SYou are an expert boardgame explainer. Your task is to read the following boardgame rulebook text and produce a clear, concise summary of the game’s core rules, suitable for use as a script in a YouTube video tutorial.  
  
Instructions:  
- Focus on the essential rules and gameplay flow, omitting minor details and edge cases unless they are crucial to understanding the game.  
- Structure the summary in logical sections:   
  1. Game overview (theme, objective)  
  2. Components  
  3. Setup  
  4. Turn structure and main actions  
  5. How the game ends and how to win  
  6. Any unique or notable rules/mechanics  
- Use simple, direct language that is easy to follow when spoken aloud.  
- Avoid jargon unless it is explained.  
- Keep each section brief and to the point, aiming for clarity and engagement.  
- Do not include any information not found in the rulebook.  
- Return only the summary script, with no extra commentary or formatting.

${chunk}`;
  
  try {
    console.log(`Summarizing chunk (${chunk.length} chars) in English`);
    const response = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        { role: 'system', content: 'You are a professional boardgame educator and scriptwriter for a popular YouTube channel. Your job is to transform complex boardgame rulebooks into clear, concise, and engaging tutorial scripts that are easy for viewers to understand. You always focus on the core rules, logical structure, and accessible language, making sure the summary is suitable for narration in a video. Avoid unnecessary details, and prioritize clarity, flow, and audience engagement.' },
        { role: 'user', content: prompt },
      ],
      max_tokens: 200,
      temperature: 0.7,
    });
    
    const summary = response.choices[0].message.content.trim();
    console.log(`Chunk summary generated (${summary.length} chars)`);
    return summary;
  } catch (error) {
    console.error('English chunk summarization error:', error);
    return "Error summarizing chunk.";
  }
}

// ✅ COMPLETELY FIXED BGG function
async function fetchBGGData(bggUrl) {
  try {
    const bggIdMatch = bggUrl.match(/\/boardgame\/(\d+)/);
    if (!bggIdMatch) {
      throw new Error('Invalid BGG URL format');
    }
    
    const bggId = bggIdMatch[1];
    const apiUrl = `https://boardgamegeek.com/xmlapi2/thing?id=${bggId}&stats=1`;
    
    const response = await fetchJson(apiUrl, { method: 'GET', timeout: 10000, retries: 3 });
    const parser = new xml2js.Parser();
    const result = await parser.parseStringPromise(response);
    
    const item = result.items.item[0];
    
    // Extract basic info
    const title = item.name[0].$.value;
    const year = parseInt(item.yearpublished[0].$.value);
    const bgg_id = parseInt(item.$.id);
    
    // Extract player info
    const minPlayers = parseInt(item.minplayers[0].$.value);
    const maxPlayers = parseInt(item.maxplayers[0].$.value);
    const player_count = minPlayers === maxPlayers ? `${minPlayers}` : `${minPlayers}–${maxPlayers}`;
    
    // Extract time info
    const minPlaytime = parseInt(item.minplaytime[0].$.value);
    const maxPlaytime = parseInt(item.maxplaytime[0].$.value);
    const play_time = minPlaytime === maxPlaytime ? `${minPlaytime} minutes` : `${minPlaytime}–${maxPlaytime} minutes`;
    
    // Extract age
    const min_age = parseInt(item.minage[0].$.value);
    
    // Extract description and create theme
    const description = item.description[0];
    const components = extractComponentsFromDescription(description);
    const theme = extractTheme(description);

    // Extract ratings
    const statistics = item.statistics[0];
    const ratings = statistics.ratings[0];
    const average_rating = parseFloat(ratings.average[0].$.value);
    const bgg_rank = parseInt(ratings.ranks[0].rank[0].$.value);
    
    // Extract images
    const cover_image = item.image[0];
    const thumbnail = item.thumbnail[0];
    
    // Extract people and companies
    const links = item.link || [];
    const designers = links.filter(link => link.$.type === 'boardgamedesigner').map(link => link.$.value);
    const artists = links.filter(link => link.$.type === 'boardgameartist').map(link => link.$.value);
    const publishers = links.filter(link => link.$.type === 'boardgamepublisher').map(link => link.$.value);
    const mechanics = links.filter(link => link.$.type === 'boardgamemechanic').map(link => link.$.value);
    
    // Create edition info
    const edition = `Original (${year})`;
    
    return {
      title,
      year,
      publisher: publishers,    
      designers,
      artists,
      bgg_id,
      edition,
      player_count,
      play_time,
      min_age,
      theme,
      average_rating: Math.round(average_rating * 10) / 10, // Round to 1 decimal
      bgg_rank: bgg_rank === 0 ? 'Not Ranked' : bgg_rank,
      mechanics,
      components,
      images: [cover_image, thumbnail].filter(Boolean),
      cover_image,
      thumbnail
    };
    
  } catch (error) {
    console.error('Error fetching BGG data:', error);
    throw new Error('Failed to fetch BGG data');
  }
}

// Helper function to extract theme from description
function extractTheme(description) {
  if (!description) return 'Theme information not available';
  
  // Remove HTML tags and get first 2 sentences
  const cleanText = description.replace(/<[^>]*>/g, '').trim();
  const sentences = cleanText.split(/[.!?]+/).filter(s => s.trim().length > 0);
  
  if (sentences.length >= 2) {
    return sentences.slice(0, 2).join('. ').trim() + '.';
  } else if (sentences.length === 1) {
    return sentences[0].trim() + '.';
  }
  
  return cleanText.substring(0, 200) + '...';
}

// Helper function to extract components from description
function extractComponents(description) {
  if (!description) return ['Components information not available'];
  
  const cleanText = description.replace(/<[^>]*>/g, '').toLowerCase();
  const components = [];
  
  // Common component patterns
  const patterns = [
    /(\d+)\s*(cards?|deck)/gi,
    /(\d+)\s*(dice|die)/gi,
    /(\d+)\s*(tokens?)/gi,
    /(\d+)\s*(boards?)/gi,
    /(\d+)\s*(tiles?)/gi,
    /(\d+)\s*(pieces?)/gi,
    /(\d+)\s*(markers?)/gi,
    /(\d+)\s*(cubes?)/gi,
    /(\d+)\s*(meeples?)/gi,
    /rulebooks?/gi,
    /player aids?/gi,
    /reference cards?/gi,
    /scoring pads?/gi
  ];
  
  patterns.forEach(pattern => {
    const matches = cleanText.match(pattern);
    if (matches) {
      matches.forEach(match => {
        const formatted = match.charAt(0).toUpperCase() + match.slice(1);
        if (!components.some(comp => comp.toLowerCase().includes(match.toLowerCase()))) {
          components.push(formatted);
        }
      });
    }
  });
  
  // If no components found, provide defaults
  if (components.length === 0) {
    return [
      'Game board',
      'Player pieces',
      'Cards',
      'Tokens',
      'Rulebook'
    ];
  }
  
  return components.slice(0, 10); // Limit to 10 components
}

// --- File Upload Configuration ---
const storage = multer.diskStorage({  
  destination: (req, file, cb) => {  
    const uploadPath = path.join(__dirname, 'uploads'); // ✅ Fixed path
    if (!existsSync(uploadPath)) {  
      fs.mkdirSync(uploadPath, { recursive: true });  
    }  
    cb(null, uploadPath);  
  },
  filename: function (req, file, cb) {
    // Create a safe filename with timestamp
    const timestamp = Date.now();
    const safeName = file.originalname.replace(/[^a-zA-Z0-9.]/g, '_');
    cb(null, `${timestamp}_${safeName}`);
  }
});

const upload = multer({ storage: storage });

// Helper function to identify components using AI  
async function identifyComponents(text) {
  // ...calls OpenAI to extract components as JSON    
  try {
    const prompt = `  
      You are an expert board-game video-tutorial producer.    
      Your task is to read the following rulebook text (extracted from a PDF) and identify **every element needed to create a complete, high-quality YouTube tutorial** for this game.  
        
      Return the information as a single JSON object with exactly these fields:  
        
      {  
        "title": "",  
        "designer": "",  
        "publisher": "",  
        "year_published": "",  
        "physical_components": [],          // list each item exactly as named in the rulebook  
        "video_sections": [                 // recommended chapter list, in logical order  
          "Overview",  
          "Component Tour",  
          "Setup",  
          "Turn Structure",  
          "Scoring / End-Game",  
          "Example Turn",  
          "Common Mistakes",  
          "Winning Tips",  
          "Variants / Expansions",  
          "Recap"  
        ],  
        "visual_assets_needed": {           // what must appear on-screen  
          "close_ups": [],                  // e.g. "Resource tokens", "Player board"  
          "board_states": [],               // e.g. "Setup for 4 players", "Mid-game scoring example"  
          "diagrams": []                    // e.g. "Combat resolution flowchart"  
        },  
        "script_outline": {                 // concise bullet points per video section  
          "Overview": [],  
          "Component Tour": [],  
          "Setup": [],  
          "Turn Structure": [],  
          "Scoring / End-Game": [],  
          "Example Turn": [],  
          "Common Mistakes": [],  
          "Winning Tips": [],  
          "Variants / Expansions": [],  
          "Recap": []  
        },  
        "key_rules_to_emphasize": [],       // rules new players often overlook  
        "example_turn_walkthrough": "",     // 150-200 words, step-by-step  
        "common_mistakes": [],              // typical pitfalls  
        "faq": [],                          // short Q&A pairs if present in the rulebook  
        "advanced_tips": []                 // optional strategy or variant notes  
      }  
        
      Guidelines:  
      1. **Use only information found in the rulebook**; if a field is absent, return an empty string or empty list.  
      2. Keep text concise and tutorial-friendly (spoken-word style).  
      3. Do **not** add any commentary outside the JSON.  
      4. Output valid JSON only`;
    
    const response = await openai.chat.completions.create({  
      model: "gpt-4",
      messages: [  
        {  
          role: "system",  
          content: "You are a veteran board-game educator and video-production consultant. Your mission: extract and structure every detail needed to craft a clear, engaging YouTube tutorial for a given board-game rulebook. Prioritize accuracy, completeness, and concise spoken-word phrasing. Output strictly the requested JSON—no explanations, no additional text."  
        },  
        {  
          role: "user",  
          content: prompt  
        }  
      ],  
      temperature: 0.3,  
      max_tokens: 1000  
    });  
    
    // Parse the response  
    const componentsText = response.choices[0].message.content;  
    let components = [];  
    try {  
      // Try to parse the JSON response  
      components = JSON.parse(componentsText);  
    } catch (parseError) {  
      console.error('Error parsing AI response as JSON:', parseError);  
      // Fallback: return the raw text  
      return [{   
        name: "AI Response",   
        description: componentsText,  
        quantity: "N/A",  
        visualCharacteristics: "N/A"  
      }];  
    }  
    
    return components;  
  } catch (error) {    
    console.error('Error in AI component identification:', error);    
    return [];    
  }  
}

// --- Endpoints ---



// Extract-components endpoint
app.post('/extract-components', async (req, res) => {
  console.log('--- Component extraction started ---');
  console.log('Request body:', req.body);
  
  try {
    const pdfPath = req.body.pdfPath;
    if (!pdfPath) {
      console.log('No PDF path provided');
      return res.status(400).json({ error: "No PDF path provided" });
    }
    
    // 1. Extract text from the PDF
    const rulebookText = await extractTextFromPDF(pdfPath);
    console.log(`Extracted ${rulebookText.length} characters from PDF`);
    
    // 2. Try AI extraction first
    console.log('Trying AI extraction...');
    let componentList = await extractComponentsWithAI(rulebookText);
    let isAISuccessful = Array.isArray(componentList) && componentList.length > 0;

    // 3. Check if AI extraction was successful
    if (!isAISuccessful) {
      console.log('AI extraction failed or returned empty. Trying regex-based extraction...');
      componentList = extractComponentsFromText(rulebookText);
    } else {
      console.log('AI extraction successful, using AI results');
    }
    
    // 5. Return the extracted components
    console.log('Final component list:', componentList.map(c => `${c.name} (${c.quantity || 'N/A'})`));
    res.json({
      components: componentList,
      extractionMethod: isAISuccessful ? 'ai' : 'regex'
    });
  } catch (err) {
    console.error('Component extraction failed:', err);
    res.status(500).json({
      error: 'Failed to extract components',
      details: err.message
    });
  }
});


// Save component-image matches
app.post('/save-matches', async (req, res) => {
  try {
    const { projectId, matches, timestamp } = req.body;

    if (!matches || Object.keys(matches).length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'No matches to save' 
      });
    }

    // Here you would typically save to a database
    // For now, we'll save to a JSON file
    const matchesData = {
      projectId,
      matches,
      timestamp: timestamp || new Date().toISOString(),
      savedAt: new Date().toISOString()
    };

    const matchesDir = path.join(__dirname, 'saved-matches');
    if (!fs.existsSync(matchesDir)) {
      fs.mkdirSync(matchesDir, { recursive: true });
    }

    const filename = `matches_${projectId || 'default'}_${Date.now()}.json`;
    const filepath = path.join(matchesDir, filename);
    
    fs.writeFileSync(filepath, JSON.stringify(matchesData, null, 2));

    res.json({
      success: true,
      message: 'Matches saved successfully',
      filename,
      matchCount: Object.keys(matches).length
    });

  } catch (error) {
    console.error('Save matches error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});


// Upload additional images
app.post('/upload-images', upload.array('images', 10), async (req, res) => {
  try {
    const { projectId } = req.body;
    const uploadedFiles = req.files || [];

    if (uploadedFiles.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No images uploaded'
      });
    }

    const processedImages = [];

    for (const file of uploadedFiles) {
      // Generate thumbnail
      const thumbnailPath = path.join(
        'uploads',
        'thumbnails',
        `thumb_${Date.now()}_${file.filename}`
      );

      await sharp(file.path)
        .resize(200, 200, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 80 })
        .toFile(thumbnailPath);

      processedImages.push({
        id: `uploaded-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        name: file.originalname,
        path: `/uploads/${file.filename}`,
        preview: `/uploads/thumbnails/${path.basename(thumbnailPath)}`,
        size: file.size,
        uploadedAt: new Date().toISOString()
      });
    }

    res.json({
      success: true,
      images: processedImages,
      count: processedImages.length
    });

  } catch (error) {
    console.error('Upload images error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});


app.post('/summarize', async (req, res) => {
  console.log('--- Summarization started ---');
  
  try {
    const {
      rulebookText,
      language = 'english',
      gameName,
      metadata,
      detailPercentage = 25,
      resummarize = false,
      baseWordCount = 0,
      previousSummary = '',
      components = []
    } = req.body;
    
    console.log('Received rulebookText length:', rulebookText ? rulebookText.length : 'undefined');
    console.log('Requested output language:', language);
    console.log('Previous summary length:', previousSummary ? previousSummary.length : 'None');
    console.log('Components received:', components ? components.length : 'None');
    
    if (!rulebookText) {
      console.error('No rulebook text provided');
      return res.status(400).json({ error: 'No rulebook text provided' });
    }
    
    if (!gameName) {
      console.error('No game name provided');
      return res.status(400).json({ error: 'No game name provided' });
    }
    
    // Metadata Extraction and Merging
    const extractedMetadata = await extractMetadata(rulebookText);
    let tempMetadata = {
      publisher: metadata?.publisher || extractedMetadata.publisher,
      playerCount: metadata?.playerCount || extractedMetadata.playerCount,
      gameLength: metadata?.gameLength || extractedMetadata.gameLength,
      minimumAge: metadata?.minimumAge || extractedMetadata.minimumAge,
      theme: metadata?.theme || extractedMetadata.theme,
      edition: metadata?.edition || extractedMetadata.edition,
    };
    
    const metadataForPrompt = {};
    const fieldsToCustomize = {
      publisher: "Publisher",
      playerCount: "Player Count",
      gameLength: "Game Length",
      minimumAge: "Minimum Age",
      theme: "Theme",
      edition: "Edition"
    };
    
    for (const key in fieldsToCustomize) {
      metadataForPrompt[key] = tempMetadata[key] && tempMetadata[key] !== 'Not found' ? tempMetadata[key] : 'Not found';
    }
    
    console.log('Metadata used for prompt/frontend:', metadataForPrompt);
    
    if (metadataForPrompt.theme === 'Not found') {
      console.log('Theme is missing, requesting from user.');
      return res.status(200).json({ needsTheme: true, metadata: metadataForPrompt });
    }
    
    // Chunk Summarization
    const chunks = splitIntoSections(rulebookText);
    console.log(`Text split into ${chunks.length} potential sections/chunks.`);
    
    const chunkSummaries = [];
    const maxChunks = 15;
    const chunksToProcess = Math.min(chunks.length, maxChunks);
    const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
    
    console.log(`Processing ${chunksToProcess} chunks for initial summarization.`);
    
    for (let i = 0; i < chunksToProcess; i++) {
      const summary = await summarizeChunkEnglish(chunks[i]);
      chunkSummaries.push(summary);
      await delay(1000);
    }
    
    console.log(`Generated summaries for ${chunkSummaries.length} chunks.`);  
  
    // --- Resummarize logic ---
    let targetWordCount = 0;
    if (resummarize && baseWordCount > 0 && previousSummary) {
      targetWordCount = Math.round(baseWordCount * (1 + detailPercentage / 100));
    }
    
    // Final Script Generation
      const englishBasePrompt = `You are an expert boardgame educator and scriptwriter for a top YouTube channel. Your task is to write a complete, engaging, and fun script for a boardgame tutorial video, using the following rulebook text. The script will be used to create a high-quality, visually rich, and accessible video for new and casual players, but should also respect experienced gamers.

      Instructions:

      Follow this structure and style exactly:

      Engaging Introduction (10–20 seconds):
      Warmly greet viewers.
      State the game’s name, theme, and what makes it special.
      Briefly outline what the video will cover.
      Component Overview:
      Clearly name and describe each component.
      Suggest where to use close-ups and on-screen labels.
      Highlight any unique or unusual pieces.
      Setup:
      Walk through the setup step-by-step.
      Indicate where to use overhead shots, diagrams, or graphics.
      Point out common setup mistakes to avoid.
      Objective:
      Clearly state how to win, using simple, direct language.
      Gameplay Flow:
      Break down the turn structure and main actions.
      Use examples and suggest visuals for each action.
      Emphasize the “why” behind actions, not just the “how.”
      Key Rules & Special Cases:
      Highlight rules that are often missed or misunderstood.
      Suggest callouts or pop-up graphics for emphasis.
      Example Turn:
      Narrate a full turn or round, explaining each decision and its impact.
      End Game & Scoring:
      Explain how the game ends and how to tally scores.
      Include a scoring example if possible.
      Tips, Strategy, and Common Mistakes:
      Offer beginner-friendly advice and tips.
      Mention common pitfalls to avoid.
      Variants & Expansions (if relevant):
      Briefly mention any official variants or expansions.
      Recap & Call to Action:
      Summarize the core gameplay in 1–2 sentences.
      Invite viewers to comment, like, and subscribe.

      Scriptwriting Style:
      Use conversational, enthusiastic, and friendly language.
      Avoid jargon, or explain it simply if used.
      Keep sentences short and direct.
      Use analogies or storytelling to clarify complex rules.
      Write for spoken delivery—make it sound natural and engaging.
      Visual Planning:
      Suggest visuals, graphics, or animations for each section (e.g., “Show a close-up of the player board here”).
      Indicate pacing—avoid static visuals for more than 10 seconds.
      Recommend bright, clear lighting and high-contrast backgrounds for components.
      Final Output:
      Write the script as it should be spoken, including all presenter lines and visual cues in brackets (e.g., [Show close-up of cards], [Overhead shot of setup]).
      Do not include any information not found in the rulebook.
      Make the script concise (aim for 5–15 minutes for most games, up to 20–30 for complex games).
      Ensure the script is fun, friendly, and easy to follow.

      Here is the rulebook text:
      `;

      const finalPrompt =
      (resummarize && previousSummary)
      ? englishBasePrompt.replace(
      'Here is the rulebook text:',
      `Here is the rulebook text and additional context:

      Components List: JSON.stringify(components)∗∗GameMetadata:∗∗JSON.stringify(components)∗∗GameMetadata:∗∗{JSON.stringify(metadata)}
      Previous Summary: ${previousSummary}

      Rulebook Text:        )       : englishBasePrompt           .replace(             'Here is the rulebook text:',            Here is the rulebook text and additional context:

      Components List: JSON.stringify(components)∗∗GameMetadata:∗∗JSON.stringify(components)∗∗GameMetadata:∗∗{JSON.stringify(metadata)}

      Rulebook Text:          )           .replace(             'Component Overview:',            Component Overview:

          Use the provided components list: ${JSON.stringify(components)}
          Provide exact quantities and clear descriptions for each component
          Add visual cues like "[Show close-up of resource tokens]" or "[Display all cards fanned out]"
          Mention any unique or unusual pieces that distinguish this game        )         .replace(           'Setup:',          Setup:
          Reference the components list for accurate quantities: ${JSON.stringify(components)}
          Walk through setup step-by-step with detailed instructions (e.g., "Shuffle the 40 mission cards thoroughly, then place them face-down in the center")
          Add visual placeholders like "[Overhead shot: Initial board setup]" or "[Animation: Card placement]"
          Highlight common setup mistakes and how to avoid them`
          );

      console.log('Final prompt (truncated):', finalPrompt.slice(0, 500));
      
// Generate the summary
console.log('Generating final English script using OpenAI...')
    const englishSummaryResponse = await openai.chat.completions.create({  
      model: 'gpt-4',  
      messages: [  
        {  
          role: 'system',  
          content: "YoYou are a master boardgame educator, scriptwriter, and video production consultant for a leading YouTube channel. Your role is to transform complex boardgame rulebooks into clear, engaging, and visually dynamic tutorial scripts. You always write in a friendly, enthusiastic, and conversational style, making the rules accessible for new and casual players while still respecting experienced gamers. You structure every script in logical, easy-to-follow sections, include visual cues and editing notes, and ensure the script is ready for high-quality video production. Your explanations are concise, step-by-step, and always highlight key rules, common mistakes, and tips for success. You never add information not found in the rulebook or provided data, and you always write for spoken delivery.",  
        },  
        { role: 'user', content: finalPrompt }, // Use finalPrompt instead of englishFinalPrompt  
      ],  
      max_tokens: 4096,  
      temperature: 0.7,  
    });  
    
    const englishSummary = englishSummaryResponse.choices[0].message.content.trim();  
    console.log('Generated English script length:', englishSummary.length);  
    
    let finalOutputSummary = englishSummary;  
    
    // If French is requested, use GPT-4 to translate  
    if (language === 'french') {  
      console.log('Translation to French requested. Using GPT-4 for translation...');  
      try {  
        const translationPrompt = `Please translate the following English board game tutorial script into French.

            Maintain the same friendly, conversational, and engaging tone as the original.
            Keep all formatting, including markdown, section headers, and any special markers such as [SHORT PAUSE] or [Show close-up of cards].
            Ensure the translation is natural, idiomatic French that sounds appropriate for a YouTube tutorial and is easy to follow when spoken aloud.
            Do not omit or add any content; translate everything as faithfully as possible.

        Here is the script to translate:  
        ${englishSummary}`;  
        
        const translationResponse = await openai.chat.completions.create({  
          model: 'gpt-4',  
          messages: [  
            {  
              role: 'system',  
              content: "You are a You are a professional English-to-French translator specializing in boardgame content and YouTube video scripts. Your translations are always natural, idiomatic, and engaging, perfectly suited for spoken delivery in a friendly, casual, and accessible style. You preserve all formatting, markdown, section headers, and special markers (such as [SHORT PAUSE] or [Show close-up of cards]) exactly as in the original. You never omit, add, or alter content—your goal is to deliver a faithful, high-quality French version that feels as lively and clear as the English script.",  
            },  
            { role: 'user', content: translationPrompt },  
          ],  
          max_tokens: 4096,  
          temperature: 0.3,  
        });  
        
        finalOutputSummary = translationResponse.choices[0].message.content.trim();  
        console.log('Successfully translated summary to French.');  
      } catch (translateError) {  
        console.error('An error occurred during translation:', translateError);  
        return res.status(500).json({  
          error: 'Translation failed',  
          summary: englishSummary,  
          metadata: metadataForPrompt,  
          warning: 'Translation failed. Showing English version instead.'  
        });  
      }  
    }  
    
    // Save and Respond    
    console.log(`Saving summary file in ${language} language.`);    
    const gameDir = path.join(OUTPUT_DIR, `${gameName.replace(/[^a-zA-Z0-9]/g, '_')}_${getDateString()}`);    
    await ensureDir(gameDir);    
    
    const summaryContent = `# ${gameName} Tutorial Script\n` +    
      `**Generated on**: ${new Date().toISOString()}\n` +    
      `**Language**: ${language}\n` +    
      `**Publisher**: ${metadataForPrompt.publisher}\n` +    
      `**Player Count**: ${metadataForPrompt.playerCount}\n` +    
      `**Game Length**: ${metadataForPrompt.gameLength}\n` +    
      `**Minimum Age**: ${metadataForPrompt.minimumAge}\n` +    
      `**Theme**: ${metadataForPrompt.theme}\n` +    
      `**Edition**: ${metadataForPrompt.edition}\n` +    
      finalOutputSummary;    
    
    const summaryPath = path.join(gameDir, `summary_${language}.md`);    
    await fsPromises.writeFile(summaryPath, summaryContent); // ✅ Fixed
    console.log('Summary saved to:', summaryPath);    
    console.log('Sending summary response to frontend.');    
    res.json({ summary: finalOutputSummary, metadata: metadataForPrompt, components: components });    
  } catch (error) {    
    console.error('An unexpected error occurred during summarization:', error);    
    res.status(500).json({ error: 'Failed to generate summary', details: error.message });    
  }    
});

// New endpoint: Extract BGG metadata by scraping HTML + LLM extraction
app.post('/api/extract-bgg-html', async (req, res) => {  
  try {  
    const { url } = req.body;  
    console.log("URL received in backend:", url);
    
    if (!url || !url.match(/^https?:\/\/boardgamegeek\.com\/boardgame\/\d+(\/.*)?$/)) {
      return res.status(400).json({ error: 'Invalid or missing BGG boardgame URL' });
    }
  
    // Check cache first  
    if (bggMetadataCache.has(url)) {  
      console.log('Returning cached metadata for:', url);  
      return res.json({ success: true, metadata: bggMetadataCache.get(url) });  
    }

    console.log('🎲 Starting BGG metadata extraction for:', url);
    
    // First, try the XML API (more reliable)
    const gameId = extractGameIdFromBGGUrl(url);
    if (gameId) {
      try {
        console.log('🔄 Trying BGG XML API first...');
        const apiData = await extractBGGMetadataFromAPI(gameId);
        console.log('✅ Successfully extracted from BGG API');
        
        // Cache the result
        bggMetadataCache.set(url, apiData);
        return res.json({ success: true, metadata: apiData });
        
      } catch (apiError) {
        console.log('⚠️ BGG API failed, falling back to HTML scraping...', apiError.message);
      }
    }

    // Fallback to your existing HTML scraping + OpenAI approach
    console.log('🔄 Trying HTML scraping + OpenAI...');
    
    const html = await fetchJson(url, { {
      headers: { 
        'User-Agent': 'BoardGameTutorialGenerator/1.0',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Connection': 'keep-alive'
      },
      timeout: 15000
    });

    console.log("HTML length:", html.length);  
    console.log("HTML preview:", html.slice(0, 500));

    // Try OpenGraph tags first (faster than OpenAI)
    const $ = cheerio.load(html);
    const ogTitle = $('meta[property="og:title"]').attr('content') || '';
    const ogDescription = $('meta[property="og:description"]').attr('content') || '';
    const ogImage = $('meta[property="og:image"]').attr('content') || '';
    
    console.log('🏷️ OpenGraph - Title:', ogTitle ? '✅' : '❌');
    console.log('📝 OpenGraph - Description:', ogDescription ? '✅' : '❌');
    console.log('🖼️ OpenGraph - Image:', ogImage ? '✅' : '❌');

    // If we have good OpenGraph data, use it
    if (ogTitle && ogDescription) {
      const quickMetadata = {
        title: ogTitle,
        publisher: [],
        player_count: '',
        play_time: '',
        min_age: '',
        theme: '',
        mechanics: [],
        designers: [],
        artists: [],
        description: ogDescription,
        average_rating: '',
        bgg_rank: '',
        bgg_id: gameId || '',
        cover_image: ogImage,
        thumbnail: ogImage,
      };
      
      console.log('✅ Using OpenGraph metadata');
      bggMetadataCache.set(url, quickMetadata);
      return res.json({ success: true, metadata: quickMetadata });
    }

    // Fall back to your existing OpenAI approach
let mainContentText = $('#mainbody').text().trim() || $('body').text().trim();
console.log(`Sending ${mainContentText.length} characters of text to OpenAI for metadata extraction.`);

console.log("h1 text:", $('h1').first().text().trim());
console.log('span[itemprop="name"]:', $('span[itemprop="name"]').first().text().trim());
console.log('span[itemprop="description"]:', $('span[itemprop="description"]').first().text().trim());

const prompt = `
You are an expert boardgame data extractor specializing in gathering information for creating high-quality YouTube tutorial videos. Extract the following metadata from the text below, focusing on details that will help create engaging, accurate, and comprehensive tutorial content:

Required fields (return empty string if not found):
- name: The exact game title
- publisher: Publishing company
- player_count: Player range (e.g., "2-4 players")
- play_time: Duration (e.g., "30-60 minutes")
- minimum_age: Age recommendation
- category: Game genres/themes (e.g., ["Strategy", "Fantasy"])
- mechanics: Core gameplay mechanisms (e.g., ["Deck Building", "Worker Placement"])
- designers: Game designer names
- artists: Artist names
- description: Concise game overview (2-3 sentences max)
- complexity_rating: Complexity level (1-5 scale if available)
- year_published: Publication year

Tutorial-specific fields:
- components_list: Detailed list of all game components with quantities
- setup_complexity: Brief assessment of setup difficulty
- teaching_difficulty: How hard is this game to teach/learn
- common_rules_mistakes: Any frequently misunderstood rules mentioned
- notable_mechanics: Unique or standout gameplay features
- target_audience: Who this game is best for
- similar_games: Games it's often compared to

Optional fields:
- image_urls: Any image URLs found
- average_rating: User rating if available
- bgg_rank: BoardGameGeek ranking if mentioned
- expansions: Any expansions mentioned

Return the data as a clean JSON object with these exact keys. Focus on accuracy and completeness for tutorial creation purposes.

Text:
"""${mainContentText}"""
`;

if (!mainContentText || mainContentText.length < 30) {
  console.error('❌ Not enough extractable content to send to OpenAI.');
  return res.status(400).json({ error: 'No extractable content found on the page.' });
}

    const response = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        { role: 'system', content: 'You are an expert boardgame metadata analyst and content strategist for YouTube tutorial videos. Your job is to extract all relevant information from provided boardgame text, focusing on details that will help create clear, engaging, and comprehensive video tutorials. You always prioritize accuracy, completeness, and clarity. You understand what information is most useful for teaching, explaining, and visually presenting boardgames to new and casual players. You return only the requested data as a clean, well-structured JSON object, using empty strings or empty arrays for any missing fields. You never add commentary or invent information' },
        { role: 'user', content: prompt }
      ],
      temperature: 0,
      max_tokens: 800,
    });

    const content = response.choices[0].message.content;

    let rawMetadata;
    try {
      rawMetadata = JSON.parse(content);
    } catch (parseError) {
      console.error('Failed to parse JSON from OpenAI response:', content);
      return res.status(500).json({ 
        error: 'Failed to parse metadata JSON from OpenAI response',
        rawResponse: content
      });
    }

    const mappedMetadata = {
      title: rawMetadata.name || '',
      publisher: Array.isArray(rawMetadata.publisher) ? rawMetadata.publisher : (rawMetadata.publisher ? [rawMetadata.publisher] : []),
      player_count: rawMetadata['player count'] || '',
      play_time: rawMetadata['play time'] || '',
      min_age: rawMetadata['minimum age'] || '',
      theme: rawMetadata.category || '',
      mechanics: Array.isArray(rawMetadata.mechanics) ? rawMetadata.mechanics : (rawMetadata.mechanics ? [rawMetadata.mechanics] : []),
      designers: Array.isArray(rawMetadata.designers) ? rawMetadata.designers : (rawMetadata.designers ? [rawMetadata.designers] : []),
      artists: Array.isArray(rawMetadata.artists) ? rawMetadata.artists : (rawMetadata.artists ? [rawMetadata.artists] : []),
      description: rawMetadata.description || '',
      average_rating: rawMetadata['average rating'] || '',
      bgg_rank: rawMetadata['BGG rank'] || '',
      bgg_id: gameId || '',
      cover_image: (rawMetadata['image URLs'] && rawMetadata['image URLs'][0]) || '',
      thumbnail: (rawMetadata['image URLs'] && rawMetadata['image URLs'][0]) || '',
    };
    
    bggMetadataCache.set(url, mappedMetadata);  
    res.json({ success: true, metadata: mappedMetadata });  
  
  } catch (error) {  
    console.error('Error in /api/extract-bgg-html:', error.message);  
    res.status(500).json({ error: 'Failed to extract BGG metadata from HTML' });  
  }  
});

// This assumes your page images are stored in './uploads/pages/' and named like 'page1.png', 'page2.png', etc.
app.get('/list-page-images', (req, res) => {
  const pdfPath = req.query.pdfPath;
  if (!pdfPath) {
    return res.status(400).json({ error: 'Missing pdfPath parameter' });
  }

  // You may want to use a unique folder per PDF, but for now, let's assume all page images are in one folder
  const pagesDir = path.join(__dirname, 'uploads', 'pages');
  if (!existsSync(pagesDir)) {  
    return res.json({ pageImages: [] });  
  }

  // List all files in the pages directory
  const files = fsPromises.readdir(pagesDir)
    .filter(f => f.match(/^page\d+\.png$/))
    .sort((a, b) => {
      // Sort by page number
      const numA = parseInt(a.match(/^page(\d+)\.png$/)[1]);
      const numB = parseInt(b.match(/^page(\d+)\.png$/)[1]);
      return numA - numB;
    });

  // Build URLs for the frontend
  const pageImages = files.map(f => `/uploads/pages/${f}`);
  res.json({ pageImages });
});

// TTS Endpoint
app.post('/tts', async (req, res) => {
  const { text, voice, language, gameName } = req.body;
  if (!text) return res.status(400).json({ error: 'No text provided for TTS' });
  if (!gameName) return res.status(400).json({ error: 'No game name provided' });
  
  try {
    console.log(`Generating TTS for text length ${text.length} in ${language} with voice ${voice}`);
    const response = await fetchJson(
      `https://api.elevenlabs.io/v1/text-to-speech/${voice}`,
      {
        method: 'POST',
        body: { text, model_id: 'eleven_multilingual_v2' },
        headers: {
          'xi-api-key': process.env.ELEVENLABS_API_KEY,
          'Content-Type': 'application/json'
        },
        responseType: 'arrayBuffer',
        timeout: 30000,
        retries: 2,
        context: { area: 'elevenlabs', action: 'generate_tts', voice, textLength: text.length }
      }
    );
    
    const gameDir = path.join(OUTPUT_DIR, `${gameName.replace(/[^a-zA-Z0-9]/g, '_')}_${getDateString()}`);
    await ensureDir(gameDir);
    
    const audioPath = path.join(gameDir, `audio_section_${language}_${Date.now()}.mp3`);
    await fsPromises.writeFile(audioPath, response); // ✅ Fixed
    
    console.log('Audio saved to:', audioPath);
    res.type('audio/mpeg').send(response);
  } catch (error) {
    console.error('TTS error:', error);
    
    if (error.response) {
      console.error('ElevenLabs Error Details:', {
        status: error.response.status,
        data: error.response.toString()
      });
      
      if (error.response.status === 401 && error.response.toString().includes('quota_exceeded')) {
        return res.status(400).json({
          error: 'ElevenLabs quota exceeded. Please check your subscription or try again later.',
        });
      }
      
      if (error.response.status === 400) {
        return res.status(400).json({
          error: 'ElevenLabs processing error: ' + error.response.toString(),
          details: error.message
        });
      }
    }
    
    res.status(500).json({ error: 'Failed to generate audio', details: error.message });
  }
});

// Extract-images
app.post('/extract-images', async (req, res) => {
  try {
    const { sources } = req.body;
    if (!sources || !sources.length) {
      return res.status(400).json({ error: 'No image sources provided' });
    }

    const imageUrls = [];
    for (const source of sources) {
      // Use the new helper and centralized directory
      const extracted = await extractAndStoreImages(source, 'uploads/extracted-images');
      imageUrls.push(...extracted);
    }

    // Return preview info for each image
    return res.json({
      success: true,
      images: imageUrls.map(img => ({
        preview: `/uploads/extracted-images/${img.name}`,
        name: img.name,
        path: img.path
      })),
      totalFound: imageUrls.length
    });
  } catch (err) {
    console.error('Error extracting images:', err);
    res.status(500).json({ error: 'Failed to extract images', details: err.message });
  }
});

// --- Crop Component Endpoint ---
app.post('/crop-component', async (req, res) => {
  console.log('--- Component cropping started ---');
  try {
    const { imagePath, x, y, width, height, name, gameName } = req.body;
    if (!imagePath || !width || !height || !name || !gameName) {
      console.error('Missing required parameters');
      return res.status(400).json({ error: 'Missing required parameters' });
    }
    console.log(`Cropping component "${name}" from ${imagePath} at (${x},${y}) with size ${width}x${height}`);
    
    // Create game-specific directory for components
    const gameDir = path.join(OUTPUT_DIR, `${gameName.replace(/[^a-zA-Z0-9]/g, '_')}_${getDateString()}`);
    const componentsDir = path.join(gameDir, 'components');
    await ensureDir(componentsDir);
    
    // Sanitize component name for filename
    const safeName = name.replace(/[^a-zA-Z0-9]/g, '_') || `component_${Date.now()}`;
    const outPath = path.join(componentsDir, `${safeName}.png`);
    
    // Crop the component
    await sharp(path.join(OUTPUT_DIR, imagePath))
      .extract({ 
        left: Math.max(0, x), 
        top: Math.max(0, y), 
        width, 
        height 
      })
      .toFile(outPath);
    
    console.log(`Saved component to ${outPath}`);
    res.json({
      name: safeName,
      path: path.relative(OUTPUT_DIR, outPath),
      fullPath: outPath
    });
  } catch (err) {
    console.error('Component cropping error:', err);
    res.status(500).json({ 
      error: 'Failed to crop component', 
      details: err.message 
    });
  }
});

// ExtractExtraImagesURLs
app.post('/extract-extra-images', async (req, res) => {
  console.log('POST /extract-extra-images called');
  console.log('--- [extract-extra-images] Endpoint called ---');
  console.log('Request body:', req.body);
  
  try {
    const { extraImageUrls } = req.body;
    console.log('Received extraImageUrls:', extraImageUrls);
    
    if (!extraImageUrls) {
      console.log('No extraImageUrls provided, returning error');
      return res.status(400).json({ error: 'No extra image URLs provided' });
    }

    const urls = extraImageUrls.split(',').map(u => u.trim()).filter(Boolean);
    console.log('Parsed URLs:', urls);
    
    const extraImages = [];

    for (const url of urls) {
      console.log(`Extracting images from: ${url}`);
      try {
        // Check if IMAGE_EXTRACTOR_API_KEY exists
        if (!IMAGE_EXTRACTOR_API_KEY) {
          console.error('IMAGE_EXTRACTOR_API_KEY is not set');
          continue;
        }
        
        const imageUrls = await extractImagesFromUrl(url, IMAGE_EXTRACTOR_API_KEY, 'basic');
        console.log(`Found ${imageUrls.length} images from ${url}`);
        
        for (const imgUrl of imageUrls) {
          extraImages.push({
            path: imgUrl,
            source: 'image_extractor',
            type: 'Component',
            description: '',
            name: `Image from ${url}`,
            originalUrl: url
          });
        }
      } catch (err) {
        console.error(`Failed to extract from ${url}:`, err);
        // Continue with other URLs even if one fails
      }
    }

    console.log(`Returning ${extraImages.length} extraImages`);
    console.log('Returning response...');
    
    // Always send a response!
    return res.json({ 
      success: true,
      extraImages,
      totalFound: extraImages.length 
    });
    
  } catch (err) {
    console.log('Error caught in catch block');
    console.error('Extra image extraction error:', err);
    return res.status(500).json({
      error: 'Failed to extract extra images',
      details: err.message
    });
  }
});

// --- Upload PDF Endpoint ---
app.post('/upload-pdf', upload.single('pdf'), async (req, res) => {
  console.log('--- PDF upload started ---');
  try {
    if (!req.file) {
      console.error('No file uploaded');
      return res.status(400).json({ error: 'No file uploaded' });
    }
    console.log(`Uploaded file: ${req.file.originalname} (${req.file.size} bytes)`);
    console.log(`Saved to: ${req.file.path}`);

    const pdfPath = req.file.path;  // Use the real uploaded file path
    const outputDir = './uploads/images';  // Or wherever you want to save images

    // Extract images from the uploaded PDF
    const images = await extractImagesFromPDF(pdfPath, outputDir);

    // Respond with file info and extracted images
    res.json({ 
      pdfPath: req.file.path,
      originalName: req.file.originalname,
      size: req.file.size,
      images
    });

  } catch (err) {
    console.error('PDF upload error:', err);
    res.status(500).json({ 
      error: 'Failed to upload PDF', 
      details: err.message 
    });
  }
});

// BGG Image Fetching Endpoint
app.post('/fetch-bgg-images', async (req, res) => {
  try {
    const { gameName } = req.body;
    if (!gameName) {
      return res.status(400).json({ error: 'Game name is required' });
    }

    console.log(`Fetching BGG images for: ${gameName}`);
    
    // Search for the game on BGG
    const searchUrl = `https://boardgamegeek.com/xmlapi2/search?query=${encodeURIComponent(gameName)}&type=boardgame`;
    const searchResponse = await fetchJson(searchUrl, { method: 'GET', responseType: 'xml', timeout: 8000, retries: 3, context: { area: 'bgg', action: 'search' } });
    const searchData = searchResponse;

    // Parse XML to find game ID
    const gameMatch = searchData.match(/<item[^>]*id="(\d+)"[^>]*>/);
    if (!gameMatch) {
      return res.status(404).json({ error: 'Game not found on BGG' });
    }

    const gameId = gameMatch[1];
    console.log(`Found game ID: ${gameId}`);

    // Get game details including images
    const gameUrl = `https://boardgamegeek.com/xmlapi2/thing?id=${gameId}`;
    const gameResponse = await fetchJson(gameUrl, { method: 'GET', responseType: 'xml', timeout: 8000, retries: 3, context: { area: 'bgg', action: 'game_data' } });
    const gameData = gameResponse;

    // Extract image URLs from the XML
    const imageUrls = [];
    const imageMatches = gameData.match(/<image[^>]*>([^<]+)<\/image>/g);
    const thumbnailMatches = gameData.match(/<thumbnail[^>]*>([^<]+)<\/thumbnail>/g);

    if (imageMatches) {
      imageMatches.forEach(match => {
        const url = match.replace(/<\/?image[^>]*>/g, '');
        if (url && url.startsWith('http')) {
          imageUrls.push({ url, type: 'image' });
        }
      });
    }

    if (thumbnailMatches) {
      thumbnailMatches.forEach(match => {
        const url = match.replace(/<\/?thumbnail[^>]*>/g, '');
        if (url && url.startsWith('http')) {
          imageUrls.push({ url, type: 'thumbnail' });
        }
      });
    }

    if (imageUrls.length === 0) {
      return res.status(404).json({ error: 'No images found for this game' });
    }

    // Download images
    const images = [];
    const OUTPUT_DIR = path.join(__dirname, 'uploads', 'images');
    
    // Ensure output directory exists
    if (!fs.existsSync(OUTPUT_DIR)) {
      fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }

    for (let i = 0; i < imageUrls.length; i++) {
      try {
        const { url, type } = imageUrls[i];
        const response = await fetchJson(url, {
          method: 'GET',
          responseType: 'stream',
          timeout: 15000,
          retries: 3,
          context: { area: 'bgg', action: 'download_image', url }
        });
        
        const filename = `bgg_${gameName.replace(/[^a-zA-Z0-9]/g, '_')}_${type}_${i + 1}.jpg`;
        const filepath = path.join(OUTPUT_DIR, filename);
        
        const writer = fs.createWriteStream(filepath);
        response.pipe(writer);

        await new Promise((resolve, reject) => {
          writer.on('finish', resolve);
          writer.on('error', reject);
        });

        // Push to images array after successful download
        if (existsSync(filepath)) {
          images.push({
            filename: filename,
            path: path.relative(path.join(__dirname, 'uploads'), filepath),
            type: type,
            source: 'BGG'
          });
        }
        
        
        console.log(`Downloaded: ${filename}`);
      } catch (downloadError) {
        console.error(`Failed to download image ${i + 1}:`, downloadError.message);
        // Continue with next image instead of failing completely
      }
    }

    // Filter out any images without a valid path (extra safety)
    const validImages = images.filter(
      img => img && img.path && existsSync(path.join(__dirname, 'uploads', img.path))
    );
    res.json({ success: true, images: validImages });

  } catch (error) {
    console.error('BGG fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch BGG images: ' + error.message });
  }
});

// Match-images endpoint: Enhances images with preview and thumbnail paths
app.post('/match-images', async (req, res) => {
  try {
    const { components, previouslyExtractedImages } = req.body;

    if (!components || !Array.isArray(components)) {
      return res.status(400).json({ error: 'No components provided' });
    }

    // Enhance each image with preview and thumbnail paths
    const enhancedImages = previouslyExtractedImages.map(img => ({
      ...img,
      preview: `/uploads/tmp/${img.name}`, // 300x300 preview
      thumbPreview: `/uploads/tmp/thumb_${img.name}` // If you want to add a smaller thumbnail version later
    }));

    res.json({
      success: true,
      components,
      images: enhancedImages
    });

  } catch (err) {
    console.error('Error matching images:', err);
    res.status(500).json({ error: 'Failed to match images', details: err.message });
  }
});

// Add this new endpoint after your existing ones
app.post('/convert-pdf-to-images', async (req, res) => {
  try {
    const { pdfPath } = req.body;
    
    if (!pdfPath) {
      return res.status(400).json({ error: 'PDF path is required' });
    }

    // Create output directory for this PDF's images
    const pdfName = path.basename(pdfPath, '.pdf');
    const outputDir = path.join(__dirname, 'uploads', 'images', pdfName);
    
    // Call your Python script
    const pythonProcess = spawn('python', ['pdf_to_images.py', pdfPath, outputDir]);
    
    pythonProcess.on('close', (code) => {
      if (code === 0) {
        // Get list of generated images
        const imageFiles = fsPromises.readdir(outputDir)
          .filter(file => file.endsWith('.png'))
          .sort((a, b) => {
            const numA = parseInt(a.match(/page_(\d+)/)[1]);
            const numB = parseInt(b.match(/page_(\d+)/)[1]);
            return numA - numB;
          })
          .map(file => `/uploads/images/${pdfName}/${file}`);
        
        res.json({ 
          success: true, 
          images: imageFiles,
          totalPages: imageFiles.length 
        });
      } else {
        res.status(500).json({ error: 'Failed to convert PDF to images' });
      }
    });
    
  } catch (error) {
    console.error('Error converting PDF to images:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});


// --- Start Extraction Endpoint ---
app.post('/start-extraction', async (req, res) => {  
  try {  
    const { bggUrl, extraImageUrls } = req.body;  
  
    if (!bggUrl && !extraImageUrls) {  
      return res.status(400).json({ error: 'Provide at least a BGG URL or Extra Image URLs.' });  
    }  
  
    let gameInfo = {};  
    let components = [];
    
    if (bggUrl) {  
      // Extract game ID from URL  
      const bggIdMatch = bggUrl.match(/boardgame\/(\d+)/);  
      if (!bggIdMatch) {  
        return res.status(400).json({ error: 'Invalid BGG URL format' });  
      }  
      const gameId = bggIdMatch[1];  
      console.log(`Extracting info for BGG ID: ${gameId}`);  
    
      // Use BGG XML API for reliable data  
      const detailUrl = `https://boardgamegeek.com/xmlapi2/thing?id=${gameId}&type=boardgame&stats=1`;  
      console.log(`Fetching game details: ${detailUrl}`);  
    
      const xml = await fetchJson(detailUrl, {
        method: 'GET',
        responseType: 'xml',
        timeout: 10000,
        headers: { 'User-Agent': 'BoardGameTutorialGenerator/1.0' },
        retries: 3,
        context: { area: 'bgg', action: 'fetch_detail', gameId }
      });  
    
      const parser = new XMLParser({  
        ignoreAttributes: false,  
        attributeNamePrefix: "@_"  
      });  
    
      const data = parser.parse(xml);  
      const game = data.items?.item;  
    
      if (!game) {  
        throw new Error('Game not found on BGG');  
      }  
    
      // Helper function to extract values from BGG XML structure  
      const extractValue = (field) => {  
        if (!field) return '';  
        if (Array.isArray(field)) {  
          return field.map(item => item['@_value'] || item).join(', ');  
        }  
        return field['@_value'] || field;  
      };  
    
      // Extract all the metadata  
      gameInfo = {  
        success: true,  
        bggId: gameId,  
        gameName: extractValue(game.name),  
        imageUrl: game.image || '',  
        thumbnailUrl: game.thumbnail || '',  
        description: game.description || '',  
        yearPublished: extractValue(game.yearpublished) || '',  
        minPlayers: game.minplayers ? game.minplayers['@_value'] : '',  
        maxPlayers: game.maxplayers ? game.maxplayers['@_value'] : '',  
        minPlayTime: game.minplaytime ? game.minplaytime['@_value'] : '',  
        maxPlayTime: game.maxplaytime ? game.maxplaytime['@_value'] : '',  
        playingTime: game.playingtime ? game.playingtime['@_value'] : '',  
        minAge: game.minage ? game.minage['@_value'] : '',  
        publishers: [],  
        designers: [],  
        artists: [],  
        categories: [],  
        mechanics: [],  
        rating: '',  
        rank: '',  
        bggUrl  
      };  
    
      // Extract publishers, designers, artists, categories, mechanics  
      if (game.link && Array.isArray(game.link)) {  
        game.link.forEach(link => {  
          const type = link['@_type'];  
          const value = link['@_value'];  
          switch (type) {  
            case 'boardgamepublisher':  
              gameInfo.publishers.push(value);  
              break;  
            case 'boardgamedesigner':  
              gameInfo.designers.push(value);  
              break;  
            case 'boardgameartist':  
              gameInfo.artists.push(value);  
              break;  
            case 'boardgamecategory':  
              gameInfo.categories.push(value);  
              break;  
            case 'boardgamemechanic':  
              gameInfo.mechanics.push(value);  
              break;  
          }  
        });  
      }  
    
      // Extract rating and rank from stats  
      if (game.statistics?.ratings) {  
        const ratings = game.statistics.ratings;  
        gameInfo.rating = ratings.average ? ratings.average['@_value'] : '';  
        if (ratings.ranks?.rank) {  
          const ranks = Array.isArray(ratings.ranks.rank) ? ratings.ranks.rank : [ratings.ranks.rank];  
          const overallRank = ranks.find(r => r['@_name'] === 'boardgame');  
          gameInfo.rank = overallRank ? overallRank['@_value'] : '';  
        }  
      }

      // **NEW: Use robust BGG component extraction as source of truth**
      try {
        // Call your new BGG extraction endpoint
        const bggExtractionResponse = await fetchJson(`http://localhost:${port}/api/bgg-components?url=${encodeURIComponent(bggUrl)}`, {
          method: 'GET',
          timeout: 10000,
          retries: 2,
          context: { area: 'bgg', action: 'extract_components', bggUrl }
        });
        const extractedComponents = bggExtractionResponse.components || [];

        // Convert to the format expected by your frontend
        components = extractedComponents.map(componentName => ({
          name: componentName,
          quantity: null,
          selected: true,
          source: 'BGG_robust_extraction'
        }));

        console.log(`Successfully extracted ${components.length} components from BGG using robust extraction`);
      } catch (bggExtractionError) {
        console.error('Error with robust BGG extraction, falling back to old method:', bggExtractionError.message);
        
        if (game.description) {
          const desc = game.description.toLowerCase();
          const extracted = extractComponentsFromText(desc);
          extracted.forEach(comp => {
            if (!components.some(c => c.name.toLowerCase() === comp.name.toLowerCase())) {
              components.push({
                ...comp,
                selected: true,
                source: 'BGG_description_fallback'
              });
            }
          });
        }
      } 

      // Add default components if none found from any method
      if (components.length === 0) {
        components = [
          { name: 'Game Board', quantity: 1, selected: true, source: 'default' },
          { name: 'Rulebook', quantity: 1, selected: true, source: 'default' },
          { name: 'Cards', quantity: null, selected: true, source: 'default' },
          { name: 'Tokens', quantity: null, selected: true, source: 'default' }
        ];
      }
    }

    // --- Extra Image Extraction Logic ---  
    let extraImages = [];
    if (extraImageUrls) {
      const urls = extraImageUrls.split(',').map(u => u.trim()).filter(Boolean);
      for (const url of urls) {
        try {
          const imageUrls = await extractImagesFromUrl(url, IMAGE_EXTRACTOR_API_KEY, 'basic');
          for (const imgUrl of imageUrls) {
            extraImages.push({
              path: imgUrl,
              source: 'image_extractor',
              type: 'Component',
              description: '',
              name: `Image from ${url}`,
              originalUrl: url
            });
          }
        } catch (err) {  
          console.error(`Failed to extract from ${url}:`, err); // log the full error, not just err.message  
        }
      }
    }

    // Add BGG images to allImages
    const bggImages = [];
    if (gameInfo.imageUrl) {
      bggImages.push({
        path: gameInfo.imageUrl,
        source: 'BGG',
        type: 'cover',
        name: 'Box Cover',
        description: 'Game box cover from BoardGameGeek'
      });
    }
    if (gameInfo.thumbnailUrl && gameInfo.thumbnailUrl !== gameInfo.imageUrl) {
      bggImages.push({
        path: gameInfo.thumbnailUrl,
        source: 'BGG',
        type: 'thumbnail',
        name: 'Thumbnail',
        description: 'Game thumbnail from BoardGameGeek'
      });
    }

    // Combine all images
    const allImages = [...bggImages, ...extraImages];

    // Format data for frontend auto-fill
    const formattedGameInfo = {
      success: true,
      bgg_id: gameInfo.bggId || '',
      title: gameInfo.gameName || '',
      cover_image: gameInfo.imageUrl || '',
      thumbnail: gameInfo.thumbnailUrl || '',
      description: gameInfo.description || '',
      year: gameInfo.yearPublished || '',
      publisher: gameInfo.publishers || [],
      player_count: gameInfo.minPlayers && gameInfo.maxPlayers
        ? `${gameInfo.minPlayers}-${gameInfo.maxPlayers}`
        : (gameInfo.minPlayers || gameInfo.maxPlayers || ''),
      play_time: gameInfo.minPlayTime && gameInfo.maxPlayTime
        ? `${gameInfo.minPlayTime}-${gameInfo.maxPlayTime} min`
        : (gameInfo.playingTime ? `${gameInfo.playingTime} min` : ''),
      min_age: gameInfo.minAge ? `${gameInfo.minAge}+` : '',
      theme: gameInfo.categories || [],
      edition: gameInfo.yearPublished || '',
      designers: gameInfo.designers || [],
      mechanics: gameInfo.mechanics || [],
      artists: gameInfo.artists || [],
      average_rating: gameInfo.rating || '',
      bgg_rank: gameInfo.rank || '',
      bggUrl: gameInfo.bggUrl || '',
      allImages,
      components
    };

    res.json(formattedGameInfo);

  } catch (error) {
    console.error('Extraction error:', error);
    res.status(500).json({
      error: 'Failed to extract info: ' + error.message
    });
  }
});

// --- NEW: BGG HTML Metadata Extraction Endpoint ---
app.post('/api/extract-bgg-html', async (req, res) => {
  try {
    const { url } = req.body;
    console.log("URL received in backend:", url);

    if (!url || !url.match(/^https?:\/\/boardgamegeek\.com\/boardgame\/\d+(\/.*)?$/)) {
      return res.status(400).json({ error: 'Invalid or missing BGG boardgame URL' });
    }

    // Check cache first
    if (bggMetadataCache.has(url)) {
      console.log('Returning cached metadata for:', url);
      return res.json({ success: true, metadata: bggMetadataCache.get(url) });
    }

    // Fetch the HTML
    const html = await fetchJson(url, { {
      headers: { 'User-Agent': 'BoardGameTutorialGenerator/1.0' }
    });

    const $ = cheerio.load(html);

    // ----------- 🧠 Try to extract clean fields ------------
    const ogTitle = $('meta[property="og:title"]').attr('content') || '';
    const ogDesc = $('meta[property="og:description"]').attr('content') || '';
    const ogImage = $('meta[property="og:image"]').attr('content') || '';
    const rating = $('span.rating-score').first().text().trim();

    // Also get a bit more page content, in case the above isn't enough
    const fullDescription = $('div#mainbody script[type="application/ld+json"]').first().html();

    let jsonLdData = {};
    if (fullDescription) {
      try {
        jsonLdData = JSON.parse(fullDescription);
      } catch (e) {
        console.warn("❌ Couldn't parse JSON-LD block");
      }
    }

    // ----------- ✅ Final fallback content ------------
    const fallbackBody = $('body').text().replace(/\s+/g, ' ').trim().slice(0, 2000); // 2k chars from page

    const gameTitle = ogTitle || jsonLdData.name || '';
    const description = ogDesc || jsonLdData.description || '';
    const imageUrl = ogImage || '';
    const publishers = Array.isArray(jsonLdData.publisher)
      ? jsonLdData.publisher.map(p => p.name).join(', ')
      : jsonLdData.publisher?.name || '';

    const mainContentText = `
    Title: ${gameTitle}
    Description: ${description}
    Image URL: ${imageUrl}
    Publisher(s): ${publishers}
    Average Rating: ${rating}
    `.trim() + '\n\nFallback:\n' + fallbackBody;

    console.log("✅ Sending", mainContentText.length, "characters of text to OpenAI for metadata extraction.");

    // Fallback to raw body text if it's too short
    if (!mainContentText || mainContentText.length < 100) {
      mainContentText = $('body').text().trim().slice(0, 3000);
      console.log("⚠️ Fallback extracted text preview:\n", mainContentText.slice(0, 500));
    }

    if (!mainContentText || mainContentText.length < 30) {
      return res.status(400).json({ error: 'No extractable content found on the page' });
    }

    console.log("✅ Extracted text preview:\n", mainContentText.slice(0, 500));

    // Build GPT prompt
    const prompt = `
    Extract the following metadata from the boardgame content below, focusing on information essential for creating high-quality YouTube tutorial videos:

    **Core Game Information:**
    - name: Exact game title
    - publisher: Publishing company
    - player_count: Player range (e.g., "2-4 players")
    - play_time: Duration (e.g., "30-60 minutes")
    - minimum_age: Age recommendation
    - year_published: Publication year
    - designers: Game designer names (array)
    - artists: Artist names (array)
    - description: Concise game overview (2-3 sentences, tutorial-friendly)

    **Tutorial-Critical Information:**
    - category: Game genres/themes (array, e.g., ["Strategy", "Fantasy"])
    - mechanics: Core gameplay mechanisms (array, e.g., ["Deck Building", "Worker Placement"])
    - components_list: Detailed list of all game components with quantities (array)
    - complexity_rating: Complexity level (1-5 scale if available, or "Light/Medium/Heavy")
    - setup_time: Estimated setup duration
    - teaching_difficulty: How challenging to teach/learn ("Easy", "Medium", "Hard")
    - unique_features: Standout mechanics or features that distinguish this game (array)
    - target_audience: Primary audience (e.g., "Families", "Strategy gamers", "Beginners")

    **Optional Enhancement Data:**
    - image_urls: Any image URLs found (array)
    - average_rating: User rating if available
    - bgg_rank: BoardGameGeek ranking if mentioned
    - expansions: Any expansions mentioned (array)
    - similar_games: Games it's compared to (array)
    - common_mistakes: Frequently misunderstood rules or setup errors mentioned (array)

    Return a clean, valid JSON object with these exact keys. Use empty strings for missing text fields, empty arrays for missing lists, and null for missing numbers. Focus on accuracy and completeness for tutorial video creation.

    Content:
    """${mainContentText.slice(0, 8000)}"""
    `;

    const response = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        { 
          role: 'system', 
          content: 'You are an expert boardgame metadata analyst specializing in extracting information for YouTube tutorial video production. You prioritize accuracy, completeness, and tutorial-relevant details. You always return properly formatted JSON with no additional commentary.' 
        },
        { role: 'user', content: prompt }
      ],
      temperature: 0,
      max_tokens: 1200,
    });

    const content = response.choices[0].message.content;

    let rawMetadata;
    try {
      rawMetadata = JSON.parse(content);
    } catch (parseError) {
      console.error('❌ Failed to parse JSON from OpenAI response:', content);
      return res.status(500).json({
        error: 'Failed to parse metadata JSON from OpenAI response',
        rawResponse: content
      });
    }

    const mappedMetadata = {
      title: rawMetadata.name || '',
      publisher: Array.isArray(rawMetadata.publisher) ? rawMetadata.publisher : (rawMetadata.publisher ? [rawMetadata.publisher] : []),
      player_count: rawMetadata['player count'] || '',
      play_time: rawMetadata['play time'] || '',
      min_age: rawMetadata['minimum age'] || '',
      theme: rawMetadata.category || '',
      mechanics: Array.isArray(rawMetadata.mechanics) ? rawMetadata.mechanics : (rawMetadata.mechanics ? [rawMetadata.mechanics] : []),
      designers: Array.isArray(rawMetadata.designers) ? rawMetadata.designers : (rawMetadata.designers ? [rawMetadata.designers] : []),
      artists: Array.isArray(rawMetadata.artists) ? rawMetadata.artists : (rawMetadata.artists ? [rawMetadata.artists] : []),
      description: rawMetadata.description || '',
      average_rating: rawMetadata['average rating'] || '',
      bgg_rank: rawMetadata['BGG rank'] || '',
      bgg_id: rawMetadata['bgg_id'] || '',
      cover_image: (rawMetadata['image URLs'] && rawMetadata['image URLs'][0]) || '',
      thumbnail: (rawMetadata['image URLs'] && rawMetadata['image URLs'][0]) || '',
    };

    // Cache the result
    bggMetadataCache.set(url, mappedMetadata);

    res.json({ success: true, metadata: mappedMetadata });

  } catch (error) {
    console.error('🔥 Error in /api/extract-bgg-html:', error);
    res.status(500).json({ error: 'Failed to extract BGG metadata from HTML' });
  }
});


// Load project endpoint
app.get('/load-project/:id', (req, res) => {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey || apiKey !== process.env.API_KEY) {
    return res.status(401).json({ error: 'Unauthorized: Invalid API key' });
  }
  const projectId = req.params.id;
  db.get(
    `SELECT * FROM projects WHERE id = ?`,
    [projectId],
    (err, row) => {
      if (err) {
        console.error(err); // Log full error for debugging
        return res.status(500).json({ error: 'Failed to load project' });
      }
      if (!row) {
        return res.status(404).json({ error: 'Project not found' });
      }
      try {
        res.json({
          id: row.id,
          name: row.name,
          metadata: JSON.parse(row.metadata),
          components: JSON.parse(row.components),
          images: JSON.parse(row.images),
          script: row.script,
          audio: row.audio,
          created_at: row.created_at
        });
      } catch (parseErr) {
        console.error('Failed to parse project data:', parseErr);
        return res.status(500).json({ error: 'Failed to parse project data' });
      }
    }
  );
});

const PORT = process.env.PORT || 5001;
app.listen(PORT, () => {
    console.log(`🚀 Server is running on port ${PORT}`);
    console.log(`📱 Frontend should connect to: http://localhost:${PORT}`);
});