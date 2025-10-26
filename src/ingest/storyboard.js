// ESM module: src/ingest/storyboard.js
// Responsibilities:
// - Convert parsedPages + bgg metadata -> minimal storyboard JSON model
// - Provide a few simple heuristics for detecting TOC, headings, and numbered steps

export function generateStoryboard({ parsedPages = [], bgg = null, opts = {} }) {
  const scenes = [];
  // Simple heuristic: find a page containing "setup" or "game setup" or "setup for" and use that as a "Setup" scene
  for (const p of parsedPages) {
    const text = (p.text || '').toLowerCase();
    if (!text) continue;
    if (/\b(setup|game setup|gameplay setup)\b/.test(text)) {
      scenes.push({
        id: `scene-setup-${p.pageNumber || 0}`,
        title: 'Setup',
        duration: 8,
        captions: extractSentencesContainingKeywords(p.text, ['setup', 'place', 'give', 'place the', 'shuffle']),
        assets: [],
        meta: { pageStart: p.pageNumber, pageEnd: p.pageNumber }
      });
    }
    if (/\b(gameplay|game play|the five game rounds|gameplay)\b/.test(text)) {
      scenes.push({
        id: `scene-gameplay-${p.pageNumber || 0}`,
        title: 'Gameplay',
        duration: 12,
        captions: extractSentencesContainingKeywords(p.text, ['gameplay', 'round', 'turn', 'action', 'player']),
        assets: [],
        meta: { pageStart: p.pageNumber, pageEnd: p.pageNumber }
      });
    }
  }

  // If no scenes found, create a single scene with the first non-empty page
  if (scenes.length === 0 && parsedPages.length > 0) {
    const first = parsedPages.find(p => (p.text || '').trim().length > 0) || parsedPages[0];
    scenes.push({ id: 'scene-001', title: 'Introduction', duration: 6, captions: first.text ? first.text.split('\n').slice(0,3) : [], assets: [], meta: { pageStart: first.pageNumber, pageEnd: first.pageNumber } });
  }

  return {
    source: { pdf: parsedPages[0]?.source || null, bgg: bgg?.id || null },
    generatedAt: new Date().toISOString(),
    scenes,
    notes: { heuristic: 'very simple initial POC; refine with more rulebooks' }
  };
}

// New buildStoryboard function for the ingestion pipeline
export async function buildStoryboard({ chunks, toc, bgg, opts = {} }) {
  try {
    // Create chapters from chunks
    const maxChapterLen = opts.maxChapterLen || 10;
    const chapters = [];
    
    // Group chunks into chapters
    for (let i = 0; i < chunks.length; i += maxChapterLen) {
      const chapterChunks = chunks.slice(i, i + maxChapterLen);
      const chapterText = chapterChunks.map(chunk => chunk.text).join('\n\n');
      
      // Extract potential steps from the chapter text
      const steps = extractStepsFromText(chapterText);
      
      chapters.push({
        id: `chapter-${Math.floor(i / maxChapterLen) + 1}`,
        title: `Chapter ${Math.floor(i / maxChapterLen) + 1}`,
        chunks: chapterChunks,
        steps: steps,
        meta: {
          chunkCount: chapterChunks.length,
          wordCount: chapterText.split(/\s+/).length
        }
      });
    }
    
    // If we have a TOC, try to use it to name chapters more meaningfully
    if (toc && toc.text) {
      const tocEntries = parseTocEntries(toc.text);
      for (let i = 0; i < Math.min(tocEntries.length, chapters.length); i++) {
        chapters[i].title = tocEntries[i].title;
      }
    }
    
    return {
      id: `storyboard-${Date.now().toString(36)}`,
      generatedAt: new Date().toISOString(),
      chapters: chapters,
      bgg: bgg ? {
        title: bgg.title,
        year: bgg.year,
        designers: bgg.designers,
        players: bgg.players,
        time: bgg.time
      } : null,
      meta: {
        totalChapters: chapters.length,
        totalChunks: chunks.length,
        tocDetected: !!toc
      }
    };
  } catch (error) {
    throw new Error(`Failed to build storyboard: ${error.message}`);
  }
}

function extractStepsFromText(text) {
  // Simple heuristic to extract steps from text
  const sentences = text.split(/[\.\n\r]+/).map(s => s.trim()).filter(Boolean);
  
  // Look for numbered or bulleted steps
  const steps = [];
  const stepPatterns = [
    /^\d+[\.\)]\s+(.+)$/,  // "1. " or "1) "
    /^[-•]\s+(.+)$/,       // "- " or "• "
    /^\*\s+(.+)$/          // "* "
  ];
  
  for (const sentence of sentences) {
    for (const pattern of stepPatterns) {
      const match = sentence.match(pattern);
      if (match) {
        steps.push({
          id: `step-${steps.length + 1}`,
          text: match[1],
          type: pattern === stepPatterns[0] ? 'numbered' : 
                pattern === stepPatterns[1] ? 'bulleted' : 'asterisk'
        });
        break;
      }
    }
  }
  
  // If no structured steps found, create some from the first few sentences
  if (steps.length === 0) {
    const firstSentences = sentences.slice(0, 5);
    firstSentences.forEach((sentence, index) => {
      steps.push({
        id: `step-${index + 1}`,
        text: sentence,
        type: 'sentence'
      });
    });
  }
  
  return steps;
}

function parseTocEntries(tocText) {
  // Simple parsing of TOC entries
  const lines = tocText.split('\n').map(l => l.trim()).filter(Boolean);
  const entries = [];
  
  for (const line of lines) {
    // Look for patterns like "1. Introduction" or "Chapter 1: Introduction"
    const patterns = [
      /^\d+[\.\)]\s+(.+)$/,
      /^Chapter\s+\d+[:\s]+(.+)$/i,
      /^Section\s+\d+[:\s]+(.+)$/i
    ];
    
    for (const pattern of patterns) {
      const match = line.match(pattern);
      if (match) {
        entries.push({
          title: match[1].trim(),
          pageNumber: null // We don't extract page numbers in this simple implementation
        });
        break;
      }
    }
  }
  
  return entries;
}

function extractSentencesContainingKeywords(text, keywords) {
  const sentences = text.split(/[\.\n\r]+/).map(s => s.trim()).filter(Boolean);
  const out = [];
  for (const s of sentences) {
    const low = s.toLowerCase();
    for (const k of keywords) if (low.includes(k)) { out.push(s); break; }
  }
  return out.slice(0,4);
}

export default { generateStoryboard, buildStoryboard };