// utils/storyboard.js

/**
 * Build storyboard from detected pages, images, and sections
 * Maps pages to sections and selects top images with intelligent fallbacks
 */
export function buildStoryboard({ detectedPages = [], images = [], sections = [] }) {
  // Group images by page for efficient lookup
  const byPage = new Map();
  for (const img of images) {
    const p = Number.isFinite(img.page) ? img.page : -1;
    if (!byPage.has(p)) byPage.set(p, []);
    byPage.get(p).push(img);
  }
  
  // Sort images within each page by score (descending)
  for (const arr of byPage.values()) {
    arr.sort((a, b) => (b.score || 0) - (a.score || 0));
  }

  // Create global sorted list for fallbacks
  const globalImages = images.slice().sort((a, b) => (b.score || 0) - (a.score || 0));
  let globalIndex = 0;

  const shots = [];
  for (const sec of sections) {
    // Strategy: choose page-matched image first; fallback to global top
    let pick = null;
    
    // First: try to match detected action pages
    for (const p of detectedPages) {
      const arr = byPage.get(p) || [];
      if (arr.length) { 
        pick = arr.shift(); // Remove to avoid reuse
        break; 
      }
    }
    
    // Fallback: use next best global image
    if (!pick && globalIndex < globalImages.length) {
      pick = globalImages[globalIndex++];
    }
    
    // Last resort: reuse first image if nothing available
    if (!pick && globalImages.length > 0) {
      pick = globalImages[0];
    }

    if (pick) {
      shots.push({
        sectionId: sec.id,
        title: sec.title,
        imgUrl: pick.url,
        imgPath: pick.path,     // local path for ffmpeg
        duration: sec.approxSeconds ?? 4.0,
        transition: sec.transition || 'cut',      // or 'crossfade'
        source: pick.source,
        page: pick.page,
        score: pick.score,
        width: pick.width,
        height: pick.height,
        format: pick.format,
      });
    } else {
      // No images available - create placeholder
      shots.push({
        sectionId: sec.id,
        title: sec.title,
        imgUrl: null,
        imgPath: null,
        duration: sec.approxSeconds ?? 4.0,
        transition: 'cut',
        source: 'placeholder',
        page: null,
        score: 0,
      });
    }
  }
  
  return shots;
}

/**
 * Generate sections from detected pages if no sections provided
 */
export function generateSectionsFromPages(detectedPages, defaultDuration = 4.0) {
  if (!detectedPages.length) {
    return [
      { id: 'intro', title: 'Introduction', approxSeconds: defaultDuration },
      { id: 'overview', title: 'Game Overview', approxSeconds: defaultDuration },
      { id: 'setup', title: 'Setup', approxSeconds: defaultDuration },
      { id: 'gameplay', title: 'Gameplay', approxSeconds: defaultDuration },
      { id: 'actions', title: 'Actions', approxSeconds: defaultDuration },
      { id: 'endgame', title: 'End Game', approxSeconds: defaultDuration },
    ];
  }

  return detectedPages.map((page, index) => ({
    id: `section_${page}`,
    title: `Actions Page ${page}`,
    approxSeconds: defaultDuration,
    page: page,
  }));
}

/**
 * Build YouTube chapters from sections
 * Format: "0:00 Introduction\n1:23 Setup\n..." 
 */
export function buildChapters(sections) {
  const fmt = s => `${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,'0')}`;
  let t = 0;
  const chapters = sections.map(sec => {
    const line = `${fmt(t)} ${sec.title}`;
    t += sec.approxSeconds ?? 4;
    return line;
  });
  
  return {
    chapters: chapters.join('\n'),
    totalDuration: t,
    formattedDuration: fmt(t)
  };
}

/**
 * Generate ffmpeg concat file content
 */
export function generateConcatFile(shots) {
  const lines = [];
  for (const shot of shots) {
    if (shot.imgPath) {
      lines.push(`file '${shot.imgPath.replace(/\\/g, '/')}'`);
      lines.push(`duration ${shot.duration}`);
    }
  }
  return lines.join('\n');
}

/**
 * Advanced storyboard with transitions and effects
 */
export function buildAdvancedStoryboard({ 
  detectedPages = [], 
  images = [], 
  sections = [],
  options = {}
}) {
  const defaultOptions = {
    maxImagesPerSection: 1,
    preferEmbedded: true,
    minScore: 0,
    duplicateImageHandling: 'allow', // 'allow', 'skip', 'rotate'
  };
  
  const opts = { ...defaultOptions, ...options };
  
  // Filter images by minimum score
  const filteredImages = images.filter(img => (img.score || 0) >= opts.minScore);
  
  // Prefer embedded images if requested
  const sortedImages = filteredImages.slice().sort((a, b) => {
    const aBonus = opts.preferEmbedded && a.source === 'embedded' ? 10000 : 0;
    const bBonus = opts.preferEmbedded && b.source === 'embedded' ? 10000 : 0;
    return (b.score + bBonus) - (a.score + aBonus);
  });

  const basicStoryboard = buildStoryboard({ 
    detectedPages, 
    images: sortedImages, 
    sections 
  });

  // Add advanced metadata
  return basicStoryboard.map((shot, index) => ({
    ...shot,
    shotIndex: index,
    isPageMatched: detectedPages.includes(shot.page),
    quality: shot.score > 500000 ? 'high' : shot.score > 100000 ? 'medium' : 'low',
    aspectRatio: shot.width && shot.height ? shot.width / shot.height : null,
  }));
}