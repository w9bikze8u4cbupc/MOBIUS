import React, { useState, useRef, useEffect, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.entry';
import { ClipLoader } from 'react-spinners';
import PdfImageExtractorPanel from './components/PdfImageExtractorPanel';
import TutorialOrchestrator from './components/TutorialOrchestrator';
import { useToast } from './contexts/ToastContext';
import { extractBggHtml } from './api/extractBggHtml';
import { searchImages } from './api/searchImages';
import DevTestPage from './components/DevTestPage';

const API_BASE = process.env.REACT_APP_API_BASE || ''; // if you already have this, keep your version

async function handleExtractMetadata(
  bggUrl,
  setMetadata,
  setBggMetadata,
  addToast
) {
  // Optionally clear existing toasts if you want a fresh run:
  // clearDedupe?.();

  try {
    const res = await extractBggHtml({
      apiBase: API_BASE,
      bggUrl,
      addToast,
    });

    // Adapt this to your existing state updates:
    // Assuming res contains something like { html, meta, ... }
    if (res && res.metadata) {
      setMetadata(res.metadata);
      setBggMetadata(res.metadata);
      localStorage.setItem('bggMetadata', JSON.stringify(res.metadata));
    } else {
      alert('No metadata found for this URL.');
    }

    // Optional success toast
    addToast?.({
      variant: 'success',
      message: 'BGG metadata extracted',
      // Use distinct dedupe key so it doesn't collapse with the error key
      dedupeKey: 'extract-bgg-html:success',
    });

    return res;
  } catch (err) {
    // fetchJson already mapped and toasted errors
    // You can add scoped logging if needed:
    // console.error('handleExtractMetadata failed', err);
    return null;
  }
}

// Enhanced automatic matching function with smarter image analysis
function improvedMatchComponentsToImages(components, allImages) {
  if (
    !components ||
    !allImages ||
    components.length === 0 ||
    allImages.length === 0
  ) {
    return (components || []).map(comp => ({
      ...comp,
      suggestedImage: null,
      matchConfidence: 0,
      matchReason: 'No images available',
      alternativeMatches: [],
    }));
  }

  // Enhanced synonym dictionary for board game components
  const synonymGroups = {
    cards: [
      'card',
      'cards',
      'deck',
      'playing card',
      'game card',
      'action card',
      'event card',
      'character card',
      'spell card',
      'treasure card',
    ],
    dice: [
      'die',
      'dice',
      'd6',
      'd4',
      'd8',
      'd10',
      'd12',
      'd20',
      'six-sided',
      'four-sided',
      'custom die',
    ],
    tokens: [
      'token',
      'tokens',
      'marker',
      'markers',
      'chip',
      'chips',
      'counter',
      'counters',
      'disc',
      'discs',
    ],
    meeples: [
      'meeple',
      'meeples',
      'figure',
      'figures',
      'pawn',
      'pawns',
      'worker',
      'workers',
      'piece',
      'pieces',
    ],
    boards: [
      'board',
      'gameboard',
      'game board',
      'main board',
      'player board',
      'side board',
    ],
    tiles: ['tile', 'tiles', 'hex', 'hexes', 'hexagon', 'square', 'squares'],
    cubes: ['cube', 'cubes', 'wooden cube', 'resource cube', 'block', 'blocks'],
    money: [
      'money',
      'coin',
      'coins',
      'currency',
      'cash',
      'gold',
      'silver',
      'bronze',
    ],
    miniatures: [
      'miniature',
      'miniatures',
      'mini',
      'minis',
      'figurine',
      'figurines',
      'standee',
      'standees',
    ],
  };

  function getComponentCategory(name) {
    const nameLower = name.toLowerCase();
    for (const [category, synonyms] of Object.entries(synonymGroups)) {
      if (synonyms.some(syn => nameLower.includes(syn))) {
        return category;
      }
    }
    return null;
  }

  function calculateImageScore(component, image) {
    const componentName = (component.name || '').toLowerCase();
    const imageName = (
      image.name ||
      image.description ||
      image.filename ||
      ''
    ).toLowerCase();
    const imagePath = (image.path || '').toLowerCase();

    let score = 0;
    let reasons = [];

    // 1. Exact name matching (highest priority)
    if (
      imageName.includes(componentName) ||
      componentName.includes(imageName)
    ) {
      score += 0.9;
      reasons.push('exact name match');
    }

    // 2. Category-based matching using synonyms
    const componentCategory = getComponentCategory(componentName);
    if (componentCategory) {
      const categoryWords = synonymGroups[componentCategory];
      const imageWordsMatch = categoryWords.some(
        word => imageName.includes(word) || imagePath.includes(word)
      );
      if (imageWordsMatch) {
        score += 0.7;
        reasons.push(`category match (${componentCategory})`);
      }
    }

    // 3. Word-by-word matching
    const componentWords = componentName.split(/\s+/).filter(w => w.length > 2);
    const imageWords = imageName.split(/\s+/);
    const matchingWords = componentWords.filter(cw =>
      imageWords.some(iw => iw.includes(cw) || cw.includes(iw))
    );
    if (matchingWords.length > 0) {
      const wordScore = (matchingWords.length / componentWords.length) * 0.6;
      score += wordScore;
      reasons.push(`${matchingWords.length} word matches`);
    }

    // 4. File path analysis (images in specific folders)
    if (
      imagePath.includes('component') ||
      imagePath.includes('token') ||
      imagePath.includes('card')
    ) {
      score += 0.2;
      reasons.push('component folder');
    }

    // 5. Image metadata scoring (size, format preferences)
    if (image.format === 'png') score += 0.1; // PNG often has transparency, good for components
    if (image.hasAlpha) score += 0.1; // Transparency suggests it's a component image
    if (image.width && image.height) {
      const aspectRatio = image.width / image.height;
      if (aspectRatio >= 0.5 && aspectRatio <= 2) score += 0.1; // Reasonable aspect ratio
    }

    // 6. Boost scores for high-quality images
    const area = (image.width || 0) * (image.height || 0);
    if (area > 100000) score += 0.1; // High resolution bonus

    return {
      score: Math.min(score, 1.0), // Cap at 1.0
      reasons: reasons.join(', '),
      image,
    };
  }

  return components.map(component => {
    const scoredImages = allImages
      .filter(img => img && img.path)
      .map(image => calculateImageScore(component, image))
      .sort((a, b) => b.score - a.score);

    const bestMatch = scoredImages[0];
    const alternatives = scoredImages
      .slice(1, 4)
      .filter(match => match.score > 0.3);

    // Auto-assign if confidence is high enough (> 0.6)
    const autoAssign = bestMatch && bestMatch.score > 0.6;

    return {
      ...component,
      suggestedImage:
        bestMatch && bestMatch.score > 0.2 ? bestMatch.image : null,
      matchConfidence: bestMatch ? bestMatch.score : 0,
      matchReason: bestMatch
        ? `${autoAssign ? 'Auto-matched: ' : ''}${bestMatch.reasons} (${Math.round(bestMatch.score * 100)}%)`
        : 'No good match found',
      alternativeMatches: alternatives.map(alt => ({
        image: alt.image,
        score: alt.score,
      })),
      autoAssigned: autoAssign,
    };
  });
}

// Configure PDF.js worker
GlobalWorkerOptions.workerSrc = pdfWorker;

// Split voices: TTS vs Storyboard display voices to avoid collisions
const TTS_VOICES = [
  { name: 'English - Haseeb', id: 'dllHSct4GokGc1AH9JwT', language: 'english' },
  {
    name: 'English - Stephanie',
    id: 'oAoF4NpW2Aqxplg9HdYB',
    language: 'english',
  },
  { name: 'French - Louis', id: 'j9RedbMRSNQ74PyikQwD', language: 'french' },
  { name: 'French - Anna', id: 'gCux0vt1cPsEXPNSbchu', language: 'french' },
];

const STORY_VOICES = {
  en: [
    { id: 'en-US-Female-1', label: 'English (US) – Female (calm)' },
    { id: 'en-US-Male-1', label: 'English (US) – Male (neutral)' },
    { id: 'en-GB-Female-1', label: 'English (UK) – Female (clear)' },
  ],
  fr: [
    { id: 'fr-FR-Female-1', label: 'Français (FR) – Femme (posé)' },
    { id: 'fr-CA-Female-1', label: 'Français (CA) – Femme (chaleureux)' },
    { id: 'fr-FR-Male-1', label: 'Français (FR) – Homme (neutre)' },
  ],
};

// Helpers
function ensureArray(val) {
  if (typeof val === 'string')
    return val
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
  if (Array.isArray(val)) return val;
  return [];
}

function splitMarkdownSections(markdown) {
  const regex = /(^|\n)(##? .+)/g;
  const sections = [];
  let lastIndex = 0;
  let match;
  while ((match = regex.exec(markdown)) !== null) {
    if (match.index > lastIndex)
      sections.push(markdown.slice(lastIndex, match.index).trim());
    const headerEnd = markdown.indexOf(
      '\n',
      match.index + match[1].length + match[2].length
    );
    lastIndex = headerEnd !== -1 ? headerEnd + 1 : markdown.length;
    sections.push(match[2].trim());
  }
  if (lastIndex < markdown.length)
    sections.push(markdown.slice(lastIndex).trim());
  return sections.filter(section => section.length > 0);
}

function countWords(text) {
  return text.trim().split(/\s+/).length;
}

function normalizeExtraImageUrls(input) {
  if (!input) return { urls: [], invalid: [] };
  const parts = Array.isArray(input) ? input : String(input).split(/,|\n|;/);
  const seen = new Set();
  const urls = [];
  const invalid = [];
  for (const raw of parts) {
    const u = raw.trim();
    if (!u) continue;
    if (!/^https?:\/\//i.test(u)) {
      invalid.push(u);
      continue;
    }
    if (!seen.has(u)) {
      seen.add(u);
      urls.push(u);
    }
  }
  return { urls, invalid };
}

function stripMarkdown(text) {
  let plainText = text;
  plainText = plainText.replace(/\[.*?\]/g, '');
  plainText = plainText.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
  plainText = plainText.replace(/!\[([^\]]*)\]\([^)]+\)/g, '');
  plainText = plainText.replace(/(\*\*|__)(.*?)\1/g, '$2');
  plainText = plainText.replace(/(\*|_)(.*?)\1/g, '$2');
  plainText = plainText.replace(/`([^`]+)`/g, '$1');
  plainText = plainText.replace(/^\s*>\s?/gm, '');
  plainText = plainText.replace(/^\s*[-*+]\s+/gm, '');
  plainText = plainText.replace(/^\s*\d+\.\s+/gm, '');
  plainText = plainText.replace(/^#+\s+.*$/gm, '');
  plainText = plainText.replace(/\n{3,}/g, '\n\n');
  plainText = plainText
    .split('\n')
    .map(line => line.trim())
    .join('\n')
    .trim();
  return plainText;
}

function extractScriptSection(text) {
  const match = text.match(/\[START OF SCRIPT\]([\s\S]*?)\[END OF SCRIPT\]/i);
  return match ? match[1].trim() : text;
}

function displayImageUrl(img) {
  if (!img || !img.path) return '';
  if (img.path.startsWith('http')) return img.path;
  const base = process.env.REACT_APP_API_BASE || '';
  return `${base}${img.path}`;
}

function App() {
  useEffect(() => {
    localStorage.removeItem('bggMetadata');
  }, []);

  const [file, setFile] = useState(null);
  const [rulebookText, setRulebookText] = useState('');
  const [lightbox, setLightbox] = useState({ open: false, src: null, alt: '' });

  const openLightbox = (src, alt = '') => setLightbox({ open: true, src, alt });
  const closeLightbox = () => setLightbox({ open: false, src: null, alt: '' });

  // Optional: press ESC to close
  useEffect(() => {
    if (!lightbox.open) return;
    const onKeyDown = e => {
      if (e.key === 'Escape') closeLightbox();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [lightbox.open]);

  const [pdfPath, setPdfPath] = useState('');
  const [language, setLanguage] = useState('english');
  const [isLoading, setIsLoading] = useState(false);
  const [bggImages, setBggImages] = useState([]);
  const [voice, setVoice] = useState('');
  const [extraImages, setExtraImages] = useState([]);
  const [bggUrl, setBggUrl] = useState(
    () => localStorage.getItem('bggUrl') || ''
  );
  const [isExtractingImages, setIsExtractingImages] = useState(false);
  const [gameName, setGameName] = useState('');
  const [metadata, setMetadata] = useState({
    title: '',
    year: '',
    publisher: [],
    designers: [],
    artists: [],
    bgg_id: '',
    edition: '',
    player_count: '',
    play_time: '',
    min_age: '',
    theme: '',
    average_rating: '',
    bgg_rank: '',
    mechanics: [],
    components: [],
    images: [],
    cover_image: '',
    thumbnail: '',
  });
  const [detailPercentage, setDetailPercentage] = useState(35);
  const [showThemePrompt, setShowThemePrompt] = useState(false);
  const [excludedImageIds, setExcludedImageIds] = useState(() => new Set());
  const [extractionMethod, setExtractionMethod] = useState('');
  const [extractionStats, setExtractionStats] = useState(null);
  const [extractionMessage, setExtractionMessage] = useState('');
  const [storyboard, setStoryboard] = useState(null);
  const [storyLang, setStoryLang] = useState('en');
  const [isGeneratingStoryboard, setIsGeneratingStoryboard] = useState(false);
  const [loading, setLoading] = useState(false);
  const [generateProgress, setGenerateProgress] = useState(0);
  const [generateStage, setGenerateStage] = useState('');
  const [isProcessingPdf, setIsProcessingPdf] = useState(false);
  const [pdfStatus, setPdfStatus] = useState('');
  const [summary, setSummary] = useState('');
  const [bggMetadata, setBggMetadata] = useState(null);
  const [bggError, setBggError] = useState(null);
  const [editedSummary, setEditedSummary] = useState('');
  const [components, setComponents] = useState([]);
  const [componentsConfirmed, setComponentsConfirmed] = useState(false);
  const [copySbFeedback, setCopySbFeedback] = useState('');
  const [sections, setSections] = useState([]);
  const [audio, setAudio] = useState({});
  const [bggData, setBggData] = useState({ images: [] });
  const [fetchingBGG, setFetchingBGG] = useState(false);
  const [allImages, setAllImages] = useState([]);
  const [newComponentName, setNewComponentName] = useState('');
  const [newComponentQuantity, setNewComponentQuantity] = useState('');
  const [audioLoading, setAudioLoading] = useState({});
  const [componentValidation, setComponentValidation] = useState({});
  const [showValidationSummary, setShowValidationSummary] = useState(false);
  const [extractedImages, setExtractedImages] = useState([]);
  const [extraImageUrls, setExtraImageUrls] = useState('');
  const [url, setUrl] = useState('');
  const [selectedImages, setSelectedImages] = useState([]);
  const [error, setError] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const [projectId, setProjectId] = '';

  // DevTestPage state
  const [showDevTest, setShowDevTest] = useState(
    process.env.REACT_APP_SHOW_DEV_TEST === 'true'
  );

  // Tab state for navigation
  const [activeTab, setActiveTab] = useState('classic'); // "tutorial" | "classic"

  // Story voice selection
  const [storyVoice, setStoryVoice] = useState('en-US-Female-1');
  useEffect(() => {
    const first = STORY_VOICES[storyLang]?.[0]?.id;
    if (first) setStoryVoice(first);
  }, [storyLang]);

  // TTS voice selection
  useEffect(() => {
    const options = TTS_VOICES.filter(v => v.language === language);
    if (options.length > 0) setVoice(prev => prev || options[0].id);
    else setVoice('');
  }, [language]);

  const { addToast } = useToast();

  // Image overrides and multi-select state MUST be defined before we derive matchedComponents
  const [compImageOverrides, setCompImageOverrides] = useState({});
  const [compImageMulti, setCompImageMulti] = useState({}); // { [componentIndex]: string[] }

  // Thumbnail size — set this to match the size used in your Images section
  const THUMB_SIZE = 160;

  // Per-component image picker modal state
  const [pickerOpenIdx, setPickerOpenIdx] = useState(null); // number | null
  const [pickerTemp, setPickerTemp] = useState([]); // string[] of (id|path) keys

  // Web search modal state
  const [webModalOpen, setWebModalOpen] = useState(false); // show/hide modal
  const [webModalMode, setWebModalMode] = useState('single'); // 'single' | 'batch'
  const [webTargetIdx, setWebTargetIdx] = useState(null); // component index in single mode
  const [webBatchTargetIdx, setWebBatchTargetIdx] = useState(null); // current component in batch mode
  const [webQuery, setWebQuery] = useState(''); // display/query text (UX only)
  const [webPageLimit, setWebPageLimit] = useState(2); // how many BGG gallery pages to fetch (1–5)
  const [webResults, setWebResults] = useState([]); // results of last fetch
  const [webSelected, setWebSelected] = useState([]); // selected image keys in the modal
  const [webLoading, setWebLoading] = useState(false);

  function openWebSearchForComponent(idx) {
    const compName = components[idx]?.name || '';
    const q = [gameName, compName].filter(Boolean).join(' ');

    setWebModalMode('single');
    setWebTargetIdx(idx);
    setWebBatchTargetIdx(null); // important to clear any batch target
    setWebQuery(q);
    setWebResults([]);
    setWebSelected([]);
    setWebModalOpen(true);

    // Optional: auto-run the search so results load immediately
    runWebSearch();
  }

  function openWebSearchBatch() {
    const q = [gameName, 'components'].filter(Boolean).join(' ');
    // Default to first component with no images; else first component
    const emptyIndices = matchedComponents.reduce((arr, c, i) => {
      const hasAny =
        Boolean(c.suggestedImage) ||
        (c.selectedImages && c.selectedImages.length > 0);
      if (!hasAny) arr.push(i);
      return arr;
    }, []);
    setWebModalMode('batch');
    setWebTargetIdx(null);
    setWebBatchTargetIdx(emptyIndices[0] ?? 0);
    setWebQuery(q);
    setWebResults([]);
    setWebSelected([]);
    setWebModalOpen(true);
  }

  function toggleWebSelect(img) {
    const key = imgKey(img);
    setWebSelected(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
  }

  async function runWebSearch() {
    // Build the query object to match the API expectations
    const query = {
      gameName: gameName || '',
      bggId: metadata?.bgg_id || bggMetadata?.bgg_id || null,
      pageLimit: webPageLimit,
      max: 80,
    };

    // Show loading state
    setWebLoading(true);

    try {
      const res = await searchImages({
        apiBase: API_BASE,
        query,
        addToast,
      });

      // Extract images from the response
      const imgs = Array.isArray(res?.images) ? res.images : [];

      // Merge into allImages with dedupe, and keep a copy for the modal grid
      setAllImages(prev => dedupeImages([...prev, ...imgs]));
      setWebResults(imgs);

      // Show success toast
      addToast?.({
        variant: 'success',
        message: `Found ${imgs.length} images`,
        dedupeKey: 'search-images:success',
      });

      return imgs;
    } catch (e) {
      // fetchJson already toasted the mapped error
      setError(e.response?.data?.error || e.message || 'Image search failed');
      return [];
    } finally {
      setWebLoading(false);
    }
  }

  function applyWebSelectionToComponent(targetIdx) {
    if (targetIdx == null) return;
    if (webSelected.length === 0) return;

    // merge selections into component multi-select
    setCompImageMulti(prev => {
      const set = new Set(prev[targetIdx] || []);
      webSelected.forEach(k => set.add(k));
      return { ...prev, [targetIdx]: Array.from(set) };
    });
    // set primary if none yet
    setCompImageOverrides(prev => {
      if (prev[targetIdx]) return prev;
      return { ...prev, [targetIdx]: webSelected[0] };
    });

    // Clear selected, keep modal open so user can switch target in batch mode
    setWebSelected([]);
  }

  // Single-mode: assign selected web images, close modal, then open the picker
  const handleUseSelectedSingle = idx => {
    if (idx == null || webSelected.length === 0) return;

    applyWebSelectionToComponent(idx);
    setWebModalOpen(false);

    // Avoid double-modal flicker by deferring the picker open
    setTimeout(() => {
      openImagePickerForComponent(idx);
    }, 0);
  };

  function imgKey(img) {
    return img?.id || img?.path;
  }

  function dedupeImages(arr) {
    const seen = new Set();
    const out = [];
    for (const img of arr) {
      const key = img?.id || img?.path;
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(img);
    }
    return out;
  }

  function openImagePickerForComponent(idx) {
    const current = compImageMulti[idx] || [];
    setPickerTemp(current);
    setPickerOpenIdx(idx);
  }

  function closeImagePicker() {
    setPickerOpenIdx(null);
    setPickerTemp([]);
  }

  function togglePickerImage(img) {
    const key = imgKey(img);
    setPickerTemp(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
  }

  function applyPickerSelection() {
    if (pickerOpenIdx === null) return;
    setCompImageMulti(prev => ({ ...prev, [pickerOpenIdx]: pickerTemp }));

    // If no primary set yet, default to first selected
    if (!compImageOverrides[pickerOpenIdx] && pickerTemp.length > 0) {
      setCompImageOverrides(prev => ({
        ...prev,
        [pickerOpenIdx]: pickerTemp[0],
      }));
    }
    closeImagePicker();
  }

  function setPrimaryForPicker(img) {
    if (pickerOpenIdx === null) return;
    const key = imgKey(img);
    setCompImageOverrides(prev => ({ ...prev, [pickerOpenIdx]: key }));
  }

  function isPickerSelected(img) {
    return pickerTemp.includes(imgKey(img));
  }

  function isPickerPrimary(img) {
    if (pickerOpenIdx === null) return false;
    return compImageOverrides[pickerOpenIdx] === imgKey(img);
  }

  const matchedComponents = useMemo(() => {
    const base = improvedMatchComponentsToImages(components, allImages);

    // Apply automatic assignments for high-confidence matches
    const processed = base.map((c, idx) => {
      const overrideKey = compImageOverrides[idx];
      const selectedImgs = (compImageMulti[idx] || [])
        .map(k => allImages.find(i => (i.id || i.path) === k))
        .filter(Boolean);

      // If there's a manual override, use it
      if (overrideKey) {
        const img = allImages.find(i => (i.id || i.path) === overrideKey);
        return img
          ? {
              ...c,
              suggestedImage: img,
              selectedImages: selectedImgs,
              matchConfidence: 1,
              matchReason: 'Manual assignment',
            }
          : { ...c, selectedImages: selectedImgs };
      }

      // Auto-assign high-confidence matches to overrides
      if (c.autoAssigned && c.suggestedImage && !overrideKey) {
        const imageKey = c.suggestedImage.id || c.suggestedImage.path;
        // Set this as both override and multi-selection
        setCompImageOverrides(prev => ({ ...prev, [idx]: imageKey }));
        setCompImageMulti(prev => ({ ...prev, [idx]: [imageKey] }));
      }

      return { ...c, selectedImages: selectedImgs };
    });

    return processed;
  }, [components, allImages, compImageOverrides, compImageMulti]);

  const handleDropOnComponent = compIndex => e => {
    // uses compImageMulti state declared above
    e.preventDefault();
    const imageKey = e.dataTransfer.getData('application/image-id');
    if (!imageKey) return;
    setCompImageOverrides(prev => ({ ...prev, [compIndex]: imageKey }));
    setCompImageMulti(prev => {
      const set = new Set(prev[compIndex] || []);
      set.add(imageKey);
      return { ...prev, [compIndex]: Array.from(set) };
    });
  };

  const toggleImageForComponent = (compIndex, imageKey) => {
    setCompImageMulti(prev => {
      const prevArr = prev[compIndex] || [];
      const exists = prevArr.includes(imageKey);
      const nextArr = exists
        ? prevArr.filter(k => k !== imageKey)
        : [...prevArr, imageKey];
      if (!exists && !compImageOverrides[compIndex]) {
        setCompImageOverrides(o => ({ ...o, [compIndex]: imageKey }));
      }
      return { ...prev, [compIndex]: nextArr };
    });
  };

  const isImgSelected = (compIndex, imageKey) => {
    return (compImageMulti[compIndex] || []).includes(imageKey);
  };

  const handleSubmit = async e => {
    e.preventDefault();
    setError(null);
    try {
      await handleExtractMetadata(bggUrl);
    } catch (err) {
      setError(err?.message || 'Failed to fetch metadata');
    }
  };

  const toggleExcluded = key =>
    setExcludedImageIds(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  const applyImageSelection = () => {
    setAllImages(prev =>
      prev.filter(img => !excludedImageIds.has(img.id || img.path))
    );
    setExtractedImages(prev =>
      prev.filter(img => !excludedImageIds.has(img.id || img.path))
    );
    setExcludedImageIds(new Set());
  };

  const handleCopyStoryboardJson = async () => {
    try {
      if (!storyboard) return;
      const text = JSON.stringify(storyboard, null, 2);
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setCopySbFeedback('Copied!');
      setTimeout(() => setCopySbFeedback(''), 1500);
    } catch (err) {
      console.error('Copy failed:', err);
      setCopySbFeedback('Copy failed');
      setTimeout(() => setCopySbFeedback(''), 2000);
    }
  };

  useEffect(() => {
    if (bggMetadata) {
      setMetadata(prev => ({
        ...prev,
        title: bggMetadata.title || '',
        publisher: Array.isArray(bggMetadata.publisher)
          ? bggMetadata.publisher.join(', ')
          : bggMetadata.publisher || '',
        player_count: bggMetadata.player_count || '',
        play_time: bggMetadata.play_time || '',
        min_age: bggMetadata.min_age || '',
        theme: Array.isArray(bggMetadata.theme)
          ? bggMetadata.theme.join(', ')
          : bggMetadata.theme || '',
        edition: '',
        bgg_id: bggMetadata.bgg_id || '',
        bgg_rank: bggMetadata.bgg_rank || '',
        mechanics: Array.isArray(bggMetadata.mechanics)
          ? bggMetadata.mechanics.join(', ')
          : bggMetadata.mechanics || '',
        artists: Array.isArray(bggMetadata.artists)
          ? bggMetadata.artists.join(', ')
          : bggMetadata.artists || '',
        designers: Array.isArray(bggMetadata.designers)
          ? bggMetadata.designers.join(', ')
          : bggMetadata.designers || '',
        average_rating: bggMetadata.average_rating || '',
        cover_image: bggMetadata.cover_image || '',
      }));
      setGameName(bggMetadata.title || '');
    }
  }, [bggMetadata]);

  useEffect(() => {
    const savedMetadata = localStorage.getItem('bggMetadata');
    if (savedMetadata) setBggMetadata(JSON.parse(savedMetadata));
  }, []);

  useEffect(() => {
    setSelectedImages(extractedImages.map(() => true));
  }, [extractedImages]);

  const validateComponent = comp => {
    const issues = [];
    const suggestions = [];
    if (comp.name && typeof comp.name === 'string') {
      const name = comp.name.trim();
      if (name.length < 2) {
        issues.push('Component name too short');
        suggestions.push('This might be an incomplete extraction');
      }
      if (/^\d+/.test(name)) {
        issues.push('Name starts with number');
        const cleanName = name.replace(/^\d+\s*x?\s*/i, '').trim();
        if (cleanName) suggestions.push(`Try: "${cleanName}"`);
      }
      if (name === name.toUpperCase() && name.length > 3) {
        issues.push('All caps detected');
        const titleCase = name
          .toLowerCase()
          .replace(/\b\w/g, l => l.toUpperCase());
        suggestions.push(`Try: "${titleCase}"`);
      }
      if (/[•·▪▫■□]/.test(name)) {
        issues.push('Contains bullet points');
        const cleaned = name.replace(/[•·▪▫■□]\s*/g, '').trim();
        suggestions.push(`Try: "${cleaned}"`);
      }
      if (name.length > 50) {
        issues.push('Very long name');
        suggestions.push('Consider shortening to just the component name');
      }
    }
    if (comp.confidence !== undefined) {
      if (comp.confidence < 0.3) issues.push('Very low extraction confidence');
      else if (comp.confidence < 0.5) issues.push('Low extraction confidence');
    }
    if (comp.quantity && (comp.quantity < 1 || comp.quantity > 1000)) {
      issues.push('Unusual quantity value');
    }
    return {
      hasIssues: issues.length > 0,
      issues,
      suggestions,
      severity:
        issues.length > 2 ? 'high' : issues.length > 0 ? 'medium' : 'low',
    };
  };

  const validateAllComponents = () => {
    const validation = {};
    components.forEach((comp, idx) => {
      validation[idx] = validateComponent(comp, idx);
    });
    setComponentValidation(validation);
    return validation;
  };

  const applyAutoFix = (idx, suggestion) => {
    const updated = [...components];
    const match = suggestion.match(/Try: "(.+)"/);
    if (match) {
      updated[idx].name = match[1];
      setComponents(updated);
      saveComponentsToLocalStorage(updated);
      setTimeout(() => validateAllComponents(), 100);
    }
  };

  const saveComponentsToLocalStorage = components => {
    if (!pdfPath) return;
    localStorage.setItem(`components_${pdfPath}`, JSON.stringify(components));
  };

  const handleGenerateStoryboard = async () => {
    try {
      setIsGeneratingStoryboard(true);
      setError('');
      const payload = {
        metadata: {
          ...(metadata || {}),
          ...(bggMetadata || {}),
          title: metadata?.title || bggMetadata?.title || '', // fixed here
        },
        images: allImages || [],
        components: components || [],
        language: storyLang,
        compImageOverrides: compImageOverrides || {},
        compImageMulti: compImageMulti || {},
      };
      const res = await generateStoryboard({
        apiBase: API_BASE,
        payload,
        addToast,
      });
      setStoryboard(res.storyboard || null);
    } catch (err) {
      console.error('Storyboard generation failed:', err);
      setError(
        'Failed to generate storyboard: ' +
          (err.response?.data?.error || err.message)
      );
    } finally {
      setIsGeneratingStoryboard(false);
    }
  };

  const handleExtractBGG = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await extractBggHtmlDirect({
        apiBase: API_BASE,
        url: bggUrl,
        addToast,
      });
      if (response && response.success && response.metadata) {
        setBggMetadata(response.metadata);
        localStorage.setItem('bggMetadata', JSON.stringify(response.metadata));
      } else {
        setError('No metadata found in response.');
      }
    } catch (err) {
      setError(err.message || 'Failed to extract metadata.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleStartExtraction = async () => {
    try {
      const { urls, invalid } = normalizeExtraImageUrls(extraImageUrls);
      if (invalid.length > 0) {
        setError(
          `Some entries are not valid URLs and were ignored: ${invalid.join(', ')}`
        );
      }
      const hasBGG = Boolean(bggUrl && bggUrl.trim());
      const hasExtra = urls.length > 0;
      if (!hasBGG && !hasExtra) {
        alert('Please enter a valid BGG URL and/or valid extra image URLs.');
        return;
      }
      if (hasBGG) {
        await handleExtractBGG();
      }
      if (hasExtra) {
        const response = await extractExtraImages({
          apiBase: API_BASE,
          extraImageUrls: urls.join(','),
          addToast,
        });
        if (response && response.extraImages) {
          setExtractedImages(prev => [...prev, ...response.extraImages]);
          setAllImages(prev => [...prev, ...response.extraImages]);
        }
        alert('Extra images extraction complete!');
      }
    } catch (err) {
      alert('Extraction failed: ' + (err.response?.data?.error || err.message));
    }
  };

  const getLanguageVoices = lang => TTS_VOICES.filter(v => v.language === lang);

  const handleFetchBGGImages = async () => {
    if (!gameName.trim()) {
      setError('Please provide a game name first');
      return;
    }
    setFetchingBGG(true);
    setError('');
    try {
      if (bggUrl && bggUrl.trim()) {
        await handleExtractBGG();
      }
      const response = await fetchBggImages({
        apiBase: API_BASE,
        gameName,
        addToast,
      });
      if (response.success) {
        const bggImgs = Array.isArray(response.images) ? response.images : [];
        setBggImages(bggImgs);
        setAllImages(prev => [...prev, ...bggImgs]);
      } else {
        setError('Failed to fetch images from BGG');
      }
    } catch (error) {
      console.error('BGG fetch error:', error);
      setError(error.response?.data?.error || 'Failed to fetch BGG images');
    } finally {
      setFetchingBGG(false);
    }
  };

  // Handle PDF images selected from the extractor panel
  const handlePdfImagesSelected = (selectedImages, metadata) => {
    console.log(
      'PDF images selected:',
      selectedImages,
      'Job metadata:',
      metadata
    );

    // Add selected images to the general image pool
    setExtractedImages(prev => [...prev, ...selectedImages]);
    setAllImages(prev => {
      // Dedupe by url
      const existing = new Set(prev.map(img => img.url || img.path));
      const newImages = selectedImages.filter(
        img => !existing.has(img.url || img.path)
      );
      return [...prev, ...newImages];
    });

    // Show success message
    const count = selectedImages.length;
    setError(
      `✓ Successfully added ${count} image${count !== 1 ? 's' : ''} from PDF extraction (Job: ${metadata?.jobId})`
    );
    setTimeout(() => setError(''), 3000); // Clear success message after 3 seconds
  };

  useEffect(() => {
    const lastPdfPath = localStorage.getItem('lastPdfPath');
    if (lastPdfPath) {
      setPdfPath(lastPdfPath);
      localStorage.removeItem(`components_${lastPdfPath}`);
      localStorage.removeItem(`componentsConfirmed_${lastPdfPath}`);
    }
  }, []);

  useEffect(() => {
    if (!pdfPath) return;
    const saved = localStorage.getItem(`components_${pdfPath}`);
    if (saved) {
      const parsed = JSON.parse(saved);
      const withSelected = parsed.map(comp => ({
        ...comp,
        selected: typeof comp.selected === 'boolean' ? comp.selected : true,
      }));
      setComponents(withSelected);
    }
  }, [pdfPath]);

  useEffect(() => {
    setEditedSummary(summary);
    if (summary) {
      const newSections = splitMarkdownSections(summary);
      setSections(newSections);
      setAudio({});
    } else {
      setSections([]);
      setAudio({});
    }
  }, [summary]);

  const confirmComponents = async () => {
    setComponentsConfirmed(true);
    localStorage.setItem(`componentsConfirmed_${pdfPath}`, 'true');
    if (gameName.trim()) {
      await handleFetchBGGImages();
    }
  };

  const extractTextFromPDFFrontend = async file => {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await getDocument({ data: arrayBuffer }).promise;
      let fullText = '';
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        const pageText = content.items.map(item => item.str).join(' ');
        fullText += pageText + '\n';
      }
      if (!fullText.trim())
        throw new Error('No readable text found in the PDF');
      return fullText;
    } catch (err) {
      throw new Error(
        "Failed to extract text from PDF. Please ensure it's a text-based PDF, not just images."
      );
    }
  };

  const handleFile = async file => {
    setFile(file);
    setLoading(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('pdf', file);
      const uploadRes = await uploadPdf({
        apiBase: API_BASE,
        formData,
        addToast,
      });
      const pdfPath = uploadRes.pdfPath;
      const imagesFromPDF = uploadRes.images || [];
      setPdfPath(pdfPath);
      setExtractedImages(prev => [...prev, ...imagesFromPDF]);
      setAllImages(prev => [...prev, ...imagesFromPDF]);
      localStorage.setItem('lastPdfPath', pdfPath);
      localStorage.removeItem(`components_${pdfPath}`);
      localStorage.removeItem(`componentsConfirmed_${pdfPath}`);
      const compRes = await extractComponents({
        apiBase: API_BASE,
        pdfPath,
        addToast,
      });
      const extractedComponents = compRes.components || [];
      setComponents(extractedComponents);
      setExtractionMethod(compRes.extractionMethod || '');
      setExtractionStats(compRes.extractionStats || null);
      setExtractionMessage(compRes.message || '');
      setTimeout(() => {
        const validation = validateAllComponents();
        const hasIssues = Object.values(validation).some(v => v.hasIssues);
        setShowValidationSummary(hasIssues);
      }, 200);
      if (extractedComponents.length > 0) {
        localStorage.setItem(
          `components_${pdfPath}`,
          JSON.stringify(extractedComponents)
        );
      }
      const name = file.name.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' ');
      setGameName(name);
      setRulebookText('');
      setSummary('');
      setEditedSummary('');
      setSections([]);
      setAudio({});
      setAudioLoading({});
      setShowThemePrompt(false);
      if (file.type === 'application/pdf') {
        const extracted = await extractTextFromPDFFrontend(file);
        setRulebookText(extracted);
      } else {
        setError('Please upload a PDF file');
      }
    } catch (err) {
      console.error('Error processing file:', err);
      setError(
        err?.response?.data?.error ||
          err?.response?.data?.details ||
          err.message ||
          'Failed to process the file'
      );
      setPdfPath('');
      setComponents([]);
      setExtractedImages([]);
      setAllImages([]);
      setRulebookText('');
      setSummary('');
      setEditedSummary('');
      setSections([]);
      setAudio({});
      setAudioLoading({});
      setMetadata({
        title: '',
        year: '',
        publisher: [],
        designers: [],
        artists: [],
        bgg_id: '',
        edition: '',
        player_count: '',
        play_time: '',
        min_age: '',
        theme: '',
        average_rating: '',
        bgg_rank: '',
        mechanics: [],
        components: [],
        images: [],
        cover_image: '',
        thumbnail: '',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleExtractExtraImages = async () => {
    setIsExtractingImages(true);
    try {
      setError('');
      const { urls, invalid } = normalizeExtraImageUrls(extraImageUrls);
      if (invalid.length > 0) {
        setError(
          `Some entries are not valid URLs and were ignored: ${invalid.join(', ')}`
        );
      }
      if (urls.length === 0) {
        setError(
          prev => prev || 'Please provide at least one valid http(s) URL.'
        );
        return;
      }
      const response = await extractExtraImages({
        apiBase: API_BASE,
        extraImageUrls: urls.join(','),
        addToast,
      });
      const newImages = response.extraImages || [];
      setExtractedImages(prev => [...prev, ...newImages]);
      setAllImages(prev => [...prev, ...newImages]);
    } catch (error) {
      console.error('Extra image extraction error:', error);
      setError(
        'Error extracting extra images: ' +
          (error.response?.data?.error || error.message)
      );
    } finally {
      setIsExtractingImages(false);
    }
  };

  const pdfPageImages = useMemo(() => {
    return extractedImages.filter(img => {
      const path = img?.path || '';
      const name = (img?.name || img?.description || '').toLowerCase();
      return (
        img?.source === 'pdf' ||
        /\/pdf[-_]?pages?\//i.test(path) ||
        /^page\s*\d+/.test(name)
      );
    });
  }, [extractedImages]);

  const handleDrag = e => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') setDragActive(true);
    else if (e.type === 'dragleave') setDragActive(false);
  };

  const handleDrop = e => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const file = e.dataTransfer.files && e.dataTransfer.files[0];
    if (!file) return;
    if (file.type !== 'application/pdf') {
      setError('Only PDF files are supported.');
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    setError('');
    handleFile(file);
  };

  const handleTextChange = e => {
    setRulebookText(e.target.value);
    setFile(null);
    setSummary('');
    setEditedSummary('');
    setSections([]);
    setAudio({});
    setAudioLoading({});
    setMetadata({
      title: '',
      year: '',
      publisher: [],
      designers: [],
      artists: [],
      bgg_id: '',
      edition: '',
      player_count: '',
      play_time: '',
      min_age: '',
      theme: '',
      average_rating: '',
      bgg_rank: '',
      mechanics: [],
      components: [],
      images: [],
      cover_image: '',
      thumbnail: '',
    });
    setShowThemePrompt(false);
    setError('');
  };

  const handleMetadataChange = (field, value) => {
    setMetadata(prev => ({
      ...prev,
      [field]:
        field === 'publisher' ||
        field === 'designers' ||
        field === 'mechanics' ||
        field === 'artists'
          ? value
              .split(',')
              .map(s => s.trim())
              .filter(Boolean)
          : value,
    }));
  };

  const handleThemeSubmit = async () => {
    if (!metadata.theme.trim() || metadata.theme === 'Not found') {
      setError('Please provide a valid theme for the game');
      return;
    }
    setShowThemePrompt(false);
    handleSummarize();
  };

  const handleSummaryEdit = e => {
    if (!e || !e.target) return;
    setEditedSummary(e.target.value);
  };

  const handleSaveSummary = async () => {
    setLoading(true);
    setError('');
    try {
      setSummary(editedSummary);
    } catch (err) {
      setError('Failed to save edited summary');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveAndContinue = async () => {
    setLoading(true);
    setError('');
    setAudio({});
    try {
      const currentSections = splitMarkdownSections(editedSummary);
      setSections(currentSections);
      const audioPromises = currentSections.map(async (section, idx) => {
        let ttsText = stripMarkdown(section);
        if (!ttsText.trim()) return null;
        setAudioLoading(prev => ({ ...prev, [idx]: true }));
        try {
          const response = await generateTts({
            apiBase: API_BASE,
            payload: { text: ttsText, voice, language, gameName },
            addToast,
          });
          // Handle the response as needed
          setAudio(prev => ({ ...prev, [idx]: response.audioUrl }));
          return response.audioUrl;
        } catch (err) {
          return null;
        } finally {
          setAudioLoading(prev => ({ ...prev, [idx]: false }));
        }
      });
      await Promise.all(audioPromises);
    } catch (err) {
      setError(
        err.response?.data?.error || 'Failed to save and generate audio'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleSummarize = async () => {
    setLoading(true);
    setError('');
    setSummary('');
    setEditedSummary('');
    setSections([]);
    setAudio({});
    setAudioLoading({});
    setShowThemePrompt(false);

    // Initialize progress tracking
    setGenerateProgress(0);
    setGenerateStage('Validating inputs...');

    if (!rulebookText.trim()) {
      setError('Please provide rulebook text.');
      setLoading(false);
      setGenerateProgress(0);
      setGenerateStage('');
      return;
    }
    if (!gameName.trim()) {
      setError('Please provide a game name.');
      setLoading(false);
      setGenerateProgress(0);
      setGenerateStage('');
      return;
    }

    try {
      // Update progress
      setGenerateProgress(10);
      setGenerateStage('Calculating tutorial length...');

      // Calculate target length based on rulebook word count and detail percentage
      const rulebookWordCount = countWords(rulebookText);
      const baseTargetWords = Math.round(rulebookWordCount * 0.15); // Base: 15% of rulebook length
      const adjustedTargetWords = Math.round(
        baseTargetWords * (detailPercentage / 35)
      ); // Adjust by detail percentage (35% is baseline)

      // Progress update
      setGenerateProgress(25);
      setGenerateStage('Sending request to AI...');

      const response = await summarizeText({
        apiBase: API_BASE,
        payload: {
          rulebookText,
          language,
          gameName,
          metadata,
          components,
          detailPercentage,
          targetWordCount: adjustedTargetWords,
          rulebookWordCount,
        },
        addToast,
      });

      // Progress update
      setGenerateProgress(60);
      setGenerateStage('AI is analyzing rulebook...');

      // Simulate AI processing time with progress updates
      const progressInterval = setInterval(() => {
        setGenerateProgress(prev => {
          if (prev < 85) {
            return prev + 2;
          }
          return prev;
        });
      }, 500);

      // Wait a bit to show progress, then continue with response handling
      setTimeout(() => {
        clearInterval(progressInterval);
        setGenerateProgress(90);
        setGenerateStage('Processing response...');

        if (response.needsTheme) {
          setMetadata(response.metadata);
          setShowThemePrompt(true);
          setGenerateProgress(100);
          setGenerateStage('Complete');
        } else if (response.summary) {
          const extractedSummary = extractScriptSection(response.summary);
          setSummary(extractedSummary);
          setEditedSummary(extractedSummary);
          setMetadata(response.metadata);
          if (response.components && Array.isArray(response.components)) {
            setComponents(
              response.components.map(c => ({ ...c, selected: true }))
            );
          }
          setGenerateProgress(100);
          setGenerateStage('Script generated successfully!');
        } else {
          setError('Backend returned an unexpected response.');
          setGenerateProgress(0);
          setGenerateStage('');
        }

        // Clear progress after a delay
        setTimeout(() => {
          setGenerateProgress(0);
          setGenerateStage('');
        }, 2000);
      }, 1000);
    } catch (error) {
      console.error('Error generating summary:', error);

      let errorMessage = 'Failed to generate summary';

      if (error.code === 'ECONNABORTED' || error.response?.status === 408) {
        errorMessage =
          '⏱️ Request timeout - The AI processing took too long. Try:\n• Reducing the rulebook text length\n• Lowering the detail percentage\n• Breaking long rulebooks into sections';
      } else if (error.response?.status === 429) {
        errorMessage =
          '🙅 Rate limit exceeded - Please wait a moment and try again.';
      } else if (error.response?.data?.error) {
        errorMessage = error.response.data.error;
      } else {
        errorMessage += `: ${error.message}`;
      }

      setError(errorMessage);
      setGenerateProgress(0);
      setGenerateStage('');
    } finally {
      setLoading(false);
    }
  };

  const handleResummarize = async () => {
    setLoading(true);
    setError('');
    try {
      const currentSummary = summary || editedSummary;
      const baseWordCount = countWords(currentSummary);

      const response = await summarizeText({
        apiBase: API_BASE,
        payload: {
          rulebookText,
          language,
          gameName,
          metadata: {
            ...metadata,
            publisher: ensureArray(metadata.publisher),
            designers: ensureArray(metadata.designers),
            artists: ensureArray(metadata.artists),
            mechanics: ensureArray(metadata.mechanics),
            components: ensureArray(metadata.components),
            images: ensureArray(metadata.images),
          },
          detailPercentage,
          resummarize: true,
          baseWordCount,
          previousSummary: currentSummary,
        },
        addToast,
      });

      if (response.summary) {
        const extractedSummary = extractScriptSection(response.summary);
        setSummary(extractedSummary);
        setEditedSummary(extractedSummary);
        setMetadata(response.metadata);
      } else {
        setError('Backend returned an unexpected response.');
      }
    } catch (error) {
      let errorMessage = 'Failed to re-summarize';

      if (error.code === 'ECONNABORTED' || error.response?.status === 408) {
        errorMessage =
          '⏱️ Re-summarization timeout - Try reducing the detail percentage or summary length.';
      } else if (error.response?.status === 429) {
        errorMessage =
          '🙅 Rate limit exceeded - Please wait a moment and try again.';
      } else if (error.response?.data?.error) {
        errorMessage = error.response.data.error;
      }

      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleChangeLanguageAndGenerateAudio = async () => {
    try {
      setLoading(true);
      setError('');
      if (!editedSummary) throw new Error('No summary text available');
      if (!gameName) throw new Error('Game name is required');

      const newSections = splitMarkdownSections(editedSummary);
      if (!newSections.length) throw new Error('No sections found in the text');
      setSections(newSections);
      setAudio({});
      setAudioLoading({});

      for (let i = 0; i < newSections.length; i++) {
        try {
          setAudioLoading(prev => ({ ...prev, [i]: true }));
          const response = await generateTts({
            apiBase: API_BASE,
            payload: {
              text: stripMarkdown(newSections[i]),
              voice,
              language,
              gameName,
            },
            addToast,
          });
          // Handle the response as needed
          setAudio(prev => ({ ...prev, [i]: response.audioUrl }));
        } catch (sectionError) {
          console.error(
            `Error generating audio for section ${i + 1}:`,
            sectionError
          );

          let errorMsg = `Section ${i + 1}: `;
          if (
            sectionError.code === 'ECONNABORTED' ||
            sectionError.response?.status === 408
          ) {
            errorMsg += 'Timeout - Try shortening this section';
          } else if (sectionError.response?.status === 429) {
            errorMsg += 'Rate limit - Wait and try again';
          } else {
            errorMsg += sectionError.message;
          }

          setError(prev => (prev ? prev + '\n' : '') + errorMsg);
        } finally {
          setAudioLoading(prev => ({ ...prev, [i]: false }));
        }
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    } catch (error) {
      console.error('Error in audio generation process:', error);
      setError(`Failed to process audio generation: ${error.message}`);
      setAudioLoading({});
    } finally {
      setLoading(false);
    }
  };

  const fileInputRef = useRef();

  const handleFileChange = e => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    if (file.type !== 'application/pdf') {
      setError('Only PDF files are supported.');
      setFile(null);
      e.target.value = '';
      return;
    }
    setError('');
    handleFile(file);
  };

  const handleSaveProject = async () => {
    setLoading(true);
    setError('');
    try {
      const payload = {
        name: gameName,
        metadata: {
          ...metadata,
          publisher: ensureArray(metadata.publisher),
          designers: ensureArray(metadata.designers),
          artists: ensureArray(metadata.artists),
          mechanics: ensureArray(metadata.mechanics),
          components: ensureArray(metadata.components),
          images: ensureArray(metadata.images),
        },
        components,
        images: allImages,
        script: editedSummary,
        audio: audio,
      };
      const response = await saveProject({
        apiBase: API_BASE,
        payload,
        addToast,
      });
      if (response.status === 'success') {
        alert(`Project saved! ID: ${response.projectId}`);
      } else {
        setError(response.error || 'Failed to save project.');
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save project.');
    } finally {
      setLoading(false);
    }
    setIsProcessingPdf(false);
    setPdfStatus(`${gameName || file?.name || 'PDF'} processed`);
  };

  const handleComponentChange = (idx, field, value) => {
    const updated = [...components];
    updated[idx] = {
      ...updated[idx],
      [field]:
        field === 'quantity' ? (value === '' ? '' : Number(value)) : value,
    };
    setComponents(updated);
    saveComponentsToLocalStorage(updated);
  };

  const toggleComponentSelected = idx => {
    const updated = [...components];
    updated[idx] = { ...updated[idx], selected: !updated[idx].selected };
    setComponents(updated);
    saveComponentsToLocalStorage(updated);
  };

  const handleAddComponent = () => {
    if (!newComponentName.trim()) return;
    const newComp = {
      name: newComponentName.trim(),
      quantity: newComponentQuantity ? Number(newComponentQuantity) : null,
      selected: true,
    };
    const updated = [...components, newComp];
    setComponents(updated);
    setNewComponentName('');
    setNewComponentQuantity('');
    saveComponentsToLocalStorage(updated);
    validateAllComponents();
  };

  const handleRemoveComponent = idx => {
    const updated = components.filter((_, i) => i !== idx);
    setComponents(updated);
    saveComponentsToLocalStorage(updated);
    validateAllComponents();
  };

  return (
    <div
      style={{
        maxWidth: 1100,
        margin: '40px auto',
        fontFamily: 'sans-serif',
        padding: 20,
      }}
    >
      <h1>Board Game Tutorial Generator</h1>

      {/* Tab Navigation */}
      <div style={{ marginBottom: 20, borderBottom: '2px solid #e0e0e0' }}>
        <div style={{ display: 'flex', gap: '0' }}>
          <button
            onClick={() => setActiveTab('tutorial')}
            style={{
              padding: '12px 24px',
              border: 'none',
              background: activeTab === 'tutorial' ? '#1976d2' : 'transparent',
              color: activeTab === 'tutorial' ? 'white' : '#666',
              cursor: 'pointer',
              borderBottom:
                activeTab === 'tutorial'
                  ? '3px solid #1976d2'
                  : '3px solid transparent',
              fontSize: '16px',
              fontWeight: activeTab === 'tutorial' ? '600' : 'normal',
            }}
          >
            🎬 A→Z Tutorial Generator
          </button>
          <button
            onClick={() => setActiveTab('classic')}
            style={{
              padding: '12px 24px',
              border: 'none',
              background: activeTab === 'classic' ? '#1976d2' : 'transparent',
              color: activeTab === 'classic' ? 'white' : '#666',
              cursor: 'pointer',
              borderBottom:
                activeTab === 'classic'
                  ? '3px solid #1976d2'
                  : '3px solid transparent',
              fontSize: '16px',
              fontWeight: activeTab === 'classic' ? '600' : 'normal',
            }}
          >
            📝 Classic Builder
          </button>
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === 'tutorial' ? (
        <TutorialOrchestrator />
      ) : (
        // Classic Builder Tab Content
        <div>
          {error && (
            <div
              style={{
                marginBottom: 16,
                padding: 12,
                borderRadius: 6,
                background: '#ffebee',
                border: '1px solid #ef5350',
                color: '#c62828',
              }}
            >
              {error}
            </div>
          )}

          <div
            style={{
              marginBottom: '2em',
              padding: '20px',
              border: '2px solid #1976d2',
              borderRadius: '8px',
              backgroundColor: '#f5f9ff',
            }}
          >
            <h2>Start a New Tutorial Project</h2>
            <div style={{ marginBottom: '1em' }}>
              <label>
                <strong>BoardGameGeek URL:</strong>
                <input
                  type="text"
                  value={bggUrl}
                  onChange={e => setBggUrl(e.target.value)}
                  onBlur={() => {
                    if (
                      bggUrl.match(
                        /^https?:\/\/boardgamegeek\.com\/boardgame\/\d+/
                      )
                    ) {
                      handleExtractMetadata(bggUrl);
                    }
                  }}
                  placeholder="Paste the BGG game page URL here"
                  style={{
                    width: '100%',
                    marginTop: '0.5em',
                    marginBottom: '1em',
                    padding: '8px',
                    borderRadius: '4px',
                    border: '1px solid #ccc',
                  }}
                />
                <button
                  type="button"
                  onClick={() => handleExtractMetadata(bggUrl)}
                  style={{
                    marginBottom: '1em',
                    padding: '8px 16px',
                    borderRadius: '4px',
                    border: 'none',
                    background: '#1976d2',
                    color: '#fff',
                    cursor: 'pointer',
                  }}
                >
                  Extract Metadata
                </button>
              </label>
              <label>
                <strong>
                  Extra URLs for Image Extraction (comma separated):
                </strong>
                <input
                  type="text"
                  value={extraImageUrls}
                  onChange={e => setExtraImageUrls(e.target.value)}
                  placeholder="Paste any extra URLs here, separated by commas"
                  style={{
                    width: '100%',
                    marginTop: '0.5em',
                    padding: '8px',
                    borderRadius: '4px',
                    border: '1px solid #ccc',
                  }}
                />
              </label>
            </div>

            {bggMetadata && (
              <div
                style={{
                  margin: '1em 0',
                  padding: '1em',
                  background: '#e3f2fd',
                  borderRadius: 8,
                }}
              >
                <h3>Extracted BGG Metadata</h3>
                <ul style={{ listStyle: 'none', padding: 0 }}>
                  <li>
                    <b>Title:</b> {bggMetadata.title}
                  </li>
                  <li>
                    <b>Publisher:</b>{' '}
                    {Array.isArray(bggMetadata.publisher)
                      ? bggMetadata.publisher.join(', ')
                      : bggMetadata.publisher || ''}
                  </li>
                  <li>
                    <b>Players:</b> {bggMetadata.player_count}
                  </li>
                  <li>
                    <b>Play Time:</b> {bggMetadata.play_time}
                  </li>
                  <li>
                    <b>Age:</b> {bggMetadata.min_age}
                  </li>
                  <li>
                    <b>Theme:</b> {bggMetadata.theme}
                  </li>
                  <li>
                    <b>Rating:</b> {bggMetadata.average_rating}
                  </li>
                  <li>
                    <b>BGG Rank:</b> {bggMetadata.bgg_rank}
                  </li>
                  <li>
                    <b>Box Cover:</b>
                    <br />
                    {bggMetadata.cover_image && (
                      <img
                        src={bggMetadata.cover_image}
                        alt="Box Cover"
                        style={{
                          maxWidth: 120,
                          marginTop: 8,
                          borderRadius: 4,
                          border: '1px solid #ccc',
                        }}
                      />
                    )}
                  </li>
                </ul>
              </div>
            )}

            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <button
                onClick={handleStartExtraction}
                style={{
                  padding: '0.5em 1.5em',
                  fontSize: '1em',
                  backgroundColor: '#1976d2',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                }}
              >
                Start Extraction
              </button>
              <button
                onClick={async () => {
                  if (!bggUrl.trim() && !extraImageUrls.trim()) {
                    alert('Please enter a BGG URL and/or extra image URLs.');
                    return;
                  }
                  setIsExtractingImages(true);
                  try {
                    if (bggUrl && bggUrl.trim()) await handleExtractBGG();
                    if (extraImageUrls && extraImageUrls.trim())
                      await handleExtractExtraImages();
                    alert('Both extractions completed!');
                  } catch (err) {
                    alert('Extraction failed: ' + err.message);
                  }
                  setIsExtractingImages(false);
                }}
                disabled={
                  (!bggUrl.trim() && !extraImageUrls.trim()) ||
                  isExtractingImages
                }
                style={{
                  padding: '0.5em 1.5em',
                  fontSize: '1em',
                  backgroundColor:
                    (!bggUrl.trim() && !extraImageUrls.trim()) ||
                    isExtractingImages
                      ? '#b0bec5'
                      : '#ff9800',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor:
                    (!bggUrl.trim() && !extraImageUrls.trim()) ||
                    isExtractingImages
                      ? 'not-allowed'
                      : 'pointer',
                }}
              >
                {isExtractingImages ? 'Extracting...' : 'Extract Both'}
              </button>
            </div>
          </div>

          <div
            onDragEnter={handleDrag}
            onDragOver={handleDrag}
            onDragLeave={handleDrag}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            style={{
              marginBottom: 20,
              padding: 30,
              border: `2px dashed ${dragActive ? '#1976d2' : '#ccc'}`,
              borderRadius: 8,
              background: dragActive ? '#f0f7ff' : '#fafafa',
              textAlign: 'center',
              cursor: 'pointer',
            }}
          >
            <div style={{ marginBottom: 8, fontWeight: 600 }}>
              Drop your PDF rulebook here, or click to browse
            </div>
            <div style={{ fontSize: 12, color: '#666' }}>
              Only .pdf files are supported
            </div>
            <input
              type="file"
              accept="application/pdf"
              ref={fileInputRef}
              onChange={handleFileChange}
              style={{ display: 'none' }}
            />
          </div>

          {loading && (
            <div
              style={{
                marginBottom: 16,
                padding: 12,
                borderRadius: 6,
                background: '#f5f5f5',
                border: '1px solid #ddd',
              }}
            >
              Working... <ClipLoader size={16} color="#1976d2" />
            </div>
          )}

          <div
            style={{
              marginBottom: 20,
              display: 'flex',
              flexWrap: 'wrap',
              gap: 20,
            }}
          >
            <div>
              <label>
                <b>Language:</b>{' '}
                <select
                  value={language}
                  onChange={e => setLanguage(e.target.value)}
                >
                  <option value="english">English</option>
                  <option value="french">French</option>
                </select>
              </label>
            </div>
            <div>
              <label>
                <b>Voice:</b>{' '}
                <select
                  value={voice}
                  onChange={e => setVoice(e.target.value)}
                  disabled={getLanguageVoices(language).length === 0}
                >
                  {getLanguageVoices(language).map(v => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
                  {getLanguageVoices(language).length === 0 && (
                    <option value="">No voices available</option>
                  )}
                </select>
              </label>
            </div>
          </div>

          <div style={{ marginBottom: 20 }}>
            <label>
              <b>Game Name:</b>{' '}
              <input
                type="text"
                value={gameName}
                onChange={e => setGameName(e.target.value)}
                placeholder="Enter the game name"
                style={{ width: 'calc(100% - 110px)', marginRight: 10 }}
              />
            </label>
          </div>

          <input
            type="text"
            value={metadata.title}
            onChange={e => handleMetadataChange('title', e.target.value)}
            placeholder="Game Title (e.g., Wingspan)"
            style={{ width: '100%', marginBottom: 10 }}
          />
          <div style={{ marginBottom: 20 }}>
            <h3>
              Game Metadata (Optional - will attempt extraction if left blank)
            </h3>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
                gap: 10,
              }}
            >
              <input
                type="text"
                value={
                  Array.isArray(metadata.publisher)
                    ? metadata.publisher.join(', ')
                    : metadata.publisher || ''
                }
                onChange={e =>
                  handleMetadataChange('publisher', e.target.value)
                }
                placeholder="Publisher (e.g., Bombyx)"
              />
              <input
                type="text"
                value={metadata.player_count}
                onChange={e =>
                  handleMetadataChange('player_count', e.target.value)
                }
                placeholder="Player Count (e.g., 2-4)"
              />
              <input
                type="text"
                value={metadata.play_time}
                onChange={e =>
                  handleMetadataChange('play_time', e.target.value)
                }
                placeholder="Game Length (e.g., 30-60 min)"
              />
              <input
                type="text"
                value={metadata.min_age}
                onChange={e => handleMetadataChange('min_age', e.target.value)}
                placeholder="Minimum Age (e.g., 10+)"
              />
              <input
                type="text"
                value={
                  Array.isArray(metadata.designers)
                    ? metadata.designers.join(', ')
                    : metadata.designers || ''
                }
                onChange={e =>
                  handleMetadataChange('designers', e.target.value)
                }
                placeholder="Designers (comma separated)"
              />
              <input
                type="text"
                value={
                  Array.isArray(metadata.artists)
                    ? metadata.artists.join(', ')
                    : metadata.artists || ''
                }
                onChange={e => handleMetadataChange('artists', e.target.value)}
                placeholder="Artists (comma separated)"
              />
              <input
                type="text"
                value={
                  Array.isArray(metadata.mechanics)
                    ? metadata.mechanics.join(', ')
                    : metadata.mechanics || ''
                }
                onChange={e =>
                  handleMetadataChange('mechanics', e.target.value)
                }
                placeholder="Mechanics (comma separated)"
              />
              <input
                type="text"
                value={metadata.theme}
                onChange={e => handleMetadataChange('theme', e.target.value)}
                placeholder="Theme (e.g., Fantasy)"
              />
            </div>
          </div>

          {pdfPageImages.length > 0 && (
            <div
              style={{
                margin: '24px 0',
                padding: 20,
                border: '2px solid #9c27b0',
                borderRadius: 8,
                background: '#faf5ff',
              }}
            >
              <h2>PDF Page Previews</h2>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
                  gap: 10,
                }}
              >
                {pdfPageImages.map((img, idx) => (
                  <div
                    key={img.id || idx}
                    style={{
                      background: '#fff',
                      border: '1px solid #eee',
                      borderRadius: 6,
                      padding: 6,
                      textAlign: 'center',
                    }}
                  >
                    <img
                      src={displayImageUrl(img)}
                      alt={`PDF page ${idx + 1}`}
                      onClick={() =>
                        openLightbox(displayImageUrl(img), `Page ${idx + 1}`)
                      }
                      style={{
                        width: '100%',
                        height: 160,
                        objectFit: 'contain',
                        borderRadius: 6,
                        border: '1px solid #ddd',
                        cursor: 'pointer',
                        background: '#f8f8f8',
                      }}
                    />
                    <div style={{ fontSize: 12, marginTop: 6, color: '#666' }}>
                      {img.name || `Page ${idx + 1}`}
                    </div>
                    <div style={{ fontSize: 10, color: '#999' }}>
                      Click to enlarge
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div
            style={{
              margin: '24px 0',
              padding: 20,
              border: '2px solid #ff5722',
              borderRadius: 8,
              background: '#fff8f5',
            }}
          >
            <h2>Components</h2>
            {components.length === 0 ? (
              <div style={{ color: '#888' }}>
                No components extracted yet. Upload a PDF or provide sources to
                extract from.
              </div>
            ) : (
              <>
                <div
                  style={{
                    marginBottom: 12,
                    display: 'flex',
                    gap: 8,
                    alignItems: 'center',
                    flexWrap: 'wrap',
                  }}
                >
                  <span style={{ color: '#555' }}>
                    {components.filter(c => c?.selected !== false).length}{' '}
                    components found.
                  </span>

                  {!componentsConfirmed && (
                    <button
                      type="button"
                      onClick={confirmComponents}
                      style={{ padding: '6px 12px' }}
                    >
                      Confirm components
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      // Force re-run the matching algorithm and auto-assign high confidence matches
                      const matchedComps = improvedMatchComponentsToImages(
                        components,
                        allImages
                      );
                      const newOverrides = {};
                      const newMulti = {};
                      let autoAssignedCount = 0;

                      matchedComps.forEach((comp, idx) => {
                        if (comp.autoAssigned && comp.suggestedImage) {
                          const imageKey =
                            comp.suggestedImage.id || comp.suggestedImage.path;
                          newOverrides[idx] = imageKey;
                          newMulti[idx] = [imageKey];
                          autoAssignedCount++;
                        }
                      });

                      setCompImageOverrides(prev => ({
                        ...prev,
                        ...newOverrides,
                      }));
                      setCompImageMulti(prev => ({ ...prev, ...newMulti }));

                      setError(
                        `✨ Auto-matched ${autoAssignedCount} components with high confidence!`
                      );
                      setTimeout(() => setError(''), 3000);
                    }}
                    style={{
                      padding: '6px 12px',
                      background: '#10b981',
                      color: 'white',
                      border: 'none',
                      borderRadius: 4,
                      cursor: 'pointer',
                    }}
                    title="Automatically match components to images with high confidence scores"
                  >
                    🤖 Auto-Match
                  </button>

                  <button
                    type="button"
                    onClick={openWebSearchBatch}
                    style={{
                      padding: '6px 12px',
                      background: '#0ea5e9',
                      color: 'white',
                      border: 0,
                      borderRadius: 6,
                      cursor: 'pointer',
                    }}
                    title="Fetch game images once and assign them to multiple components"
                  >
                    Find web images for empty components
                  </button>
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th
                        style={{
                          textAlign: 'left',
                          padding: 8,
                          border: '1px solid #c8e6c9',
                        }}
                      >
                        Component
                      </th>
                      <th
                        style={{
                          textAlign: 'left',
                          padding: 8,
                          border: '1px solid #c8e6c9',
                        }}
                      >
                        Qty
                      </th>
                      <th
                        style={{
                          textAlign: 'left',
                          padding: 8,
                          border: '1px solid #c8e6c9',
                        }}
                      >
                        Match / Selection
                      </th>
                      <th
                        style={{
                          textAlign: 'left',
                          padding: 8,
                          border: '1px solid #c8e6c9',
                        }}
                      >
                        Confidence
                      </th>
                      <th
                        style={{
                          textAlign: 'left',
                          padding: 8,
                          border: '1px solid #c8e6c9',
                        }}
                      >
                        Reason
                      </th>
                      <th
                        style={{
                          textAlign: 'left',
                          padding: 8,
                          border: '1px solid #c8e6c9',
                        }}
                      >
                        Alternatives
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {matchedComponents.map((comp, idx) => (
                      <tr key={idx}>
                        <td style={{ padding: 8, border: '1px solid #c8e6c9' }}>
                          {comp.name}
                        </td>
                        <td style={{ padding: 8, border: '1px solid #c8e6c9' }}>
                          {comp.quantity ?? ''}
                        </td>

                        <td
                          style={{
                            padding: 8,
                            border: '1px solid #c8e6c9',
                            verticalAlign: 'top',
                          }}
                          onDragOver={e => e.preventDefault()}
                          onDrop={handleDropOnComponent(idx)}
                        >
                          <div style={{ marginBottom: 8 }}>
                            {comp.suggestedImage ? (
                              <img
                                src={displayImageUrl(comp.suggestedImage)}
                                alt={comp.suggestedImage.name || 'Component'}
                                style={{
                                  maxWidth: 60,
                                  maxHeight: 60,
                                  borderRadius: 4,
                                  border: '1px solid #ccc',
                                  objectFit: 'contain',
                                  background: '#f8f8f8',
                                }}
                              />
                            ) : (
                              <span style={{ color: '#aaa' }}>
                                Drop an image here
                              </span>
                            )}
                          </div>

                          {/* Currently selected thumbnails */}
                          <div
                            style={{
                              display: 'flex',
                              gap: 8,
                              flexWrap: 'wrap',
                              marginBottom: 8,
                            }}
                          >
                            {(comp.selectedImages || []).map(img => (
                              <img
                                key={
                                  (img && (img.id || img.path)) || Math.random()
                                }
                                src={displayImageUrl(img)}
                                alt={
                                  (img && (img.description || img.name)) ||
                                  'selected'
                                }
                                style={{
                                  width: 60,
                                  height: 60,
                                  objectFit: 'contain',
                                  borderRadius: 6,
                                  border: '1px solid #ddd',
                                  background: '#f8f8f8',
                                }}
                              />
                            ))}
                          </div>

                          {/* Open the large-thumbnail picker modal */}
                          <button
                            type="button"
                            onClick={() => openImagePickerForComponent(idx)}
                            style={{
                              padding: '8px 12px',
                              background: '#155eef',
                              color: 'white',
                              border: 0,
                              borderRadius: 6,
                              cursor: 'pointer',
                            }}
                          >
                            Choose images
                          </button>
                        </td>

                        <td style={{ padding: 8, border: '1px solid #c8e6c9' }}>
                          {Math.round((comp.matchConfidence || 0) * 100)}%
                        </td>
                        <td style={{ padding: 8, border: '1px solid #c8e6c9' }}>
                          {comp.matchReason}
                        </td>
                        <td style={{ padding: 8, border: '1px solid #c8e6c9' }}>
                          {comp.alternativeMatches &&
                          comp.alternativeMatches.length > 0 ? (
                            comp.alternativeMatches.map((alt, i) => (
                              <img
                                key={i}
                                src={displayImageUrl(alt.image)}
                                alt={alt.image.name || 'Alternative'}
                                style={{
                                  maxWidth: 40,
                                  maxHeight: 40,
                                  marginRight: 4,
                                  borderRadius: 3,
                                  border: '1px solid #eee',
                                }}
                              />
                            ))
                          ) : (
                            <span style={{ color: '#aaa' }}>None</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* MODAL */}
                {pickerOpenIdx !== null && (
                  <div
                    role="dialog"
                    aria-modal="true"
                    style={{
                      position: 'fixed',
                      inset: 0,
                      background: 'rgba(0,0,0,0.5)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      zIndex: 1000,
                      padding: 16,
                    }}
                    onClick={closeImagePicker}
                  >
                    <div
                      style={{
                        background: 'white',
                        borderRadius: 12,
                        width: 'min(1100px, 96vw)',
                        maxHeight: '85vh',
                        display: 'flex',
                        flexDirection: 'column',
                        boxShadow: '0 10px 30px rgba(0,0,0,0.2)',
                      }}
                      onClick={e => e.stopPropagation()}
                    >
                      {/* Picker actions */}
                      <div
                        style={{
                          display: 'flex',
                          gap: 8,
                          flexWrap: 'wrap',
                          padding: '12px 16px',
                          borderBottom: '1px solid #eee',
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            const currentIdx = pickerOpenIdx;
                            closeImagePicker();
                            setTimeout(
                              () => openWebSearchForComponent(currentIdx),
                              0
                            );
                          }}
                          style={{
                            padding: '8px 12px',
                            background: '#0ea5e9',
                            color: 'white',
                            border: 0,
                            borderRadius: 6,
                            cursor: 'pointer',
                          }}
                          title={`Search web images for ${gameName ? `${gameName} ${matchedComponents[pickerOpenIdx]?.name || ''}` : matchedComponents[pickerOpenIdx]?.name || ''}`}
                        >
                          Find on the web
                        </button>
                      </div>

                      <div style={{ padding: 16, overflow: 'hidden' }}>
                        <div
                          style={{
                            display: 'grid',
                            gridTemplateColumns: `repeat(auto-fill, minmax(${THUMB_SIZE}px, 1fr))`,
                            gap: 12,
                            maxHeight: '58vh',
                            overflowY: 'auto',
                            paddingRight: 4,
                          }}
                        >
                          {allImages
                            .filter(
                              img =>
                                img &&
                                img.path &&
                                !excludedImageIds.has(imgKey(img))
                            )
                            .map(img => {
                              const key = imgKey(img);
                              const selected = isPickerSelected(img);
                              const primary = isPickerPrimary(img);
                              return (
                                <div
                                  key={key}
                                  style={{
                                    border: selected
                                      ? '2px solid #155eef'
                                      : '1px solid #e5e7eb',
                                    borderRadius: 10,
                                    padding: 8,
                                    background: selected ? '#eff4ff' : 'white',
                                    boxShadow: selected
                                      ? '0 0 0 4px rgba(21,94,239,0.08)'
                                      : 'none',
                                  }}
                                >
                                  <div style={{ position: 'relative' }}>
                                    <img
                                      src={displayImageUrl(img)}
                                      alt={
                                        img.description ||
                                        img.name ||
                                        img.filename ||
                                        'image'
                                      }
                                      style={{
                                        width: '100%',
                                        height: THUMB_SIZE,
                                        objectFit: 'contain',
                                        borderRadius: 8,
                                        display: 'block',
                                        background: '#f8f8f8',
                                      }}
                                      onClick={() => togglePickerImage(img)}
                                    />
                                    {primary && (
                                      <div
                                        title="Primary"
                                        style={{
                                          position: 'absolute',
                                          top: 8,
                                          left: 8,
                                          background: '#155eef',
                                          color: 'white',
                                          fontSize: 12,
                                          padding: '2px 6px',
                                          borderRadius: 6,
                                        }}
                                      >
                                        Primary
                                      </div>
                                    )}
                                  </div>

                                  <div
                                    style={{
                                      display: 'flex',
                                      gap: 8,
                                      marginTop: 8,
                                    }}
                                  >
                                    <button
                                      type="button"
                                      onClick={() => togglePickerImage(img)}
                                      style={{
                                        padding: '6px 10px',
                                        borderRadius: 6,
                                        border: '1px solid #d1d5db',
                                        background: selected
                                          ? '#111827'
                                          : 'white',
                                        color: selected ? 'white' : '#111827',
                                        cursor: 'pointer',
                                        flex: 1,
                                      }}
                                    >
                                      {selected ? 'Remove' : 'Add'}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setPrimaryForPicker(img)}
                                      style={{
                                        padding: '6px 10px',
                                        borderRadius: 6,
                                        border: primary
                                          ? '1px solid #155eef'
                                          : '1px solid #d1d5db',
                                        background: primary
                                          ? '#eff4ff'
                                          : 'white',
                                        color: primary ? '#155eef' : '#111827',
                                        cursor: 'pointer',
                                        flex: 1,
                                      }}
                                    >
                                      {primary ? 'Primary ✓' : 'Make primary'}
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                        </div>
                      </div>

                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'flex-end',
                          gap: 8,
                          padding: 16,
                          borderTop: '1px solid #eee',
                        }}
                      >
                        <button
                          type="button"
                          onClick={closeImagePicker}
                          style={{
                            padding: '8px 12px',
                            borderRadius: 8,
                            border: '1px solid #d1d5db',
                            background: 'white',
                            cursor: 'pointer',
                          }}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={applyPickerSelection}
                          style={{
                            padding: '8px 12px',
                            borderRadius: 8,
                            border: 0,
                            background: '#155eef',
                            color: 'white',
                            cursor: 'pointer',
                          }}
                        >
                          Use selected
                        </button>
                      </div>
                    </div>
                  </div>
                )}
                {/* WEB SEARCH MODAL */}
                {webModalOpen && (
                  <div
                    role="dialog"
                    aria-modal="true"
                    style={{
                      position: 'fixed',
                      inset: 0,
                      background: 'rgba(0,0,0,0.55)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      zIndex: 1100,
                      padding: 16,
                    }}
                    onClick={() => setWebModalOpen(false)}
                  >
                    <div
                      style={{
                        background: 'white',
                        borderRadius: 12,
                        width: 'min(1200px, 96vw)',
                        maxHeight: '88vh',
                        display: 'flex',
                        flexDirection: 'column',
                        boxShadow: '0 10px 30px rgba(0,0,0,0.25)',
                      }}
                      onClick={e => e.stopPropagation()}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          padding: 16,
                          borderBottom: '1px solid #eee',
                          gap: 12,
                          flexWrap: 'wrap',
                        }}
                      >
                        <h4
                          style={{
                            margin: 0,
                            fontSize: 18,
                            fontWeight: 600,
                            flex: 1,
                          }}
                        >
                          Find images on the web
                        </h4>

                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            flexWrap: 'wrap',
                          }}
                        >
                          <input
                            type="text"
                            value={webQuery}
                            onChange={e => setWebQuery(e.target.value)}
                            placeholder="Search query"
                            style={{
                              minWidth: 240,
                              padding: '6px 8px',
                              borderRadius: 6,
                              border: '1px solid #d1d5db',
                            }}
                          />
                          <label
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 6,
                            }}
                          >
                            Pages:
                            <select
                              value={webPageLimit}
                              onChange={e =>
                                setWebPageLimit(Number(e.target.value))
                              }
                            >
                              <option value={1}>1</option>
                              <option value={2}>2</option>
                              <option value={3}>3</option>
                              <option value={4}>4</option>
                              <option value={5}>5</option>
                            </select>
                          </label>
                          <button
                            type="button"
                            onClick={runWebSearch}
                            disabled={webLoading}
                            style={{
                              padding: '8px 12px',
                              background: '#0ea5e9',
                              color: 'white',
                              border: 0,
                              borderRadius: 6,
                              cursor: 'pointer',
                            }}
                          >
                            {webLoading ? 'Searching…' : 'Search'}
                          </button>
                        </div>
                      </div>

                      <div
                        style={{
                          padding: 16,
                          borderBottom: '1px solid #eee',
                          display: 'flex',
                          gap: 12,
                          alignItems: 'center',
                          flexWrap: 'wrap',
                        }}
                      >
                        <div>
                          Mode:{' '}
                          <strong>
                            {webModalMode === 'single'
                              ? 'Single Component'
                              : 'Batch (assign to multiple components from one fetch)'}
                          </strong>
                        </div>

                        {webModalMode === 'single' && webTargetIdx != null && (
                          <div style={{ color: '#334155' }}>
                            Target:{' '}
                            <strong>
                              {matchedComponents[webTargetIdx]?.name ||
                                `Component ${webTargetIdx + 1}`}
                            </strong>
                          </div>
                        )}

                        {webModalMode === 'batch' && (
                          <label
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 6,
                            }}
                          >
                            Target component:
                            <select
                              value={webBatchTargetIdx ?? 0}
                              onChange={e =>
                                setWebBatchTargetIdx(Number(e.target.value))
                              }
                            >
                              {components.map((c, i) => (
                                <option key={i} value={i}>
                                  {c?.name || `Component ${i + 1}`}
                                </option>
                              ))}
                            </select>
                          </label>
                        )}
                      </div>

                      <div style={{ padding: 16, overflow: 'hidden' }}>
                        {webLoading ? (
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 8,
                            }}
                          >
                            <ClipLoader size={18} color="#0ea5e9" />
                            Fetching images from BoardGameGeek gallery…
                          </div>
                        ) : webResults.length === 0 ? (
                          <div style={{ color: '#64748b' }}>
                            No results yet. Enter a query and click Search. Tip:
                            the query is prefilled as “{gameName} + component”
                            for single component mode.
                          </div>
                        ) : (
                          <div
                            style={{
                              display: 'grid',
                              gridTemplateColumns:
                                'repeat(auto-fill, minmax(160px, 1fr))',
                              gap: 12,
                              maxHeight: '58vh',
                              overflowY: 'auto',
                              paddingRight: 4,
                            }}
                          >
                            {webResults.map(img => {
                              const key = imgKey(img);
                              const selected = webSelected.includes(key);
                              return (
                                <div
                                  key={key}
                                  style={{
                                    border: selected
                                      ? '2px solid #0ea5e9'
                                      : '1px solid #e5e7eb',
                                    borderRadius: 10,
                                    padding: 8,
                                    background: selected ? '#e0f2fe' : 'white',
                                    boxShadow: selected
                                      ? '0 0 0 4px rgba(14,165,233,0.08)'
                                      : 'none',
                                  }}
                                >
                                  <div style={{ position: 'relative' }}>
                                    <img
                                      src={displayImageUrl(img)}
                                      alt={
                                        img.description || img.name || 'image'
                                      }
                                      style={{
                                        width: '100%',
                                        height: 140,
                                        objectFit: 'contain',
                                        borderRadius: 8,
                                        display: 'block',
                                        background: '#f8f8f8',
                                      }}
                                      onClick={() => toggleWebSelect(img)}
                                      onDoubleClick={() =>
                                        openLightbox(
                                          displayImageUrl(img),
                                          img.name || 'Image'
                                        )
                                      }
                                    />
                                    {selected && (
                                      <div
                                        style={{
                                          position: 'absolute',
                                          top: 8,
                                          left: 8,
                                          background: '#0ea5e9',
                                          color: 'white',
                                          fontSize: 12,
                                          padding: '2px 6px',
                                          borderRadius: 6,
                                        }}
                                      >
                                        Selected
                                      </div>
                                    )}
                                  </div>
                                  <div
                                    style={{
                                      marginTop: 8,
                                      fontSize: 12,
                                      color: '#334155',
                                      overflow: 'hidden',
                                      textOverflow: 'ellipsis',
                                      whiteSpace: 'nowrap',
                                    }}
                                  >
                                    {img.name || 'Image'}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'flex-end',
                          gap: 8,
                          padding: 16,
                          borderTop: '1px solid #eee',
                        }}
                      >
                        {webModalMode === 'single' && webTargetIdx != null && (
                          <button
                            type="button"
                            onClick={() =>
                              handleUseSelectedSingle(webTargetIdx)
                            }
                            disabled={webSelected.length === 0}
                            style={{
                              padding: '8px 12px',
                              borderRadius: 8,
                              border: 0,
                              background: '#0ea5e9',
                              color: 'white',
                              cursor: 'pointer',
                            }}
                            title="Assign selected images to this component"
                          >
                            {`Use selected for "${matchedComponents[webTargetIdx]?.name || `Component ${webTargetIdx + 1}`}"`}
                          </button>
                        )}

                        {webModalMode === 'batch' && (
                          <button
                            type="button"
                            onClick={() =>
                              applyWebSelectionToComponent(webBatchTargetIdx)
                            }
                            disabled={
                              webSelected.length === 0 ||
                              webBatchTargetIdx == null
                            }
                            style={{
                              padding: '8px 12px',
                              borderRadius: 8,
                              border: 0,
                              background: '#0ea5e9',
                              color: 'white',
                              cursor: 'pointer',
                            }}
                            title="Assign selected images to the chosen component, then change target to continue without re-searching"
                          >
                            Add selected to component
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => setWebModalOpen(false)}
                          style={{
                            padding: '8px 12px',
                            borderRadius: 8,
                            border: '1px solid #d1d5db',
                            background: 'white',
                            cursor: 'pointer',
                          }}
                        >
                          Close
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {allImages.length > 0 && (
            <div
              style={{
                margin: '24px 0',
                padding: 20,
                border: '2px solid #009688',
                borderRadius: 8,
                background: '#f0fffc',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <h2 style={{ margin: 0 }}>Images</h2>
                <button
                  onClick={handleFetchBGGImages}
                  disabled={fetchingBGG}
                  style={{
                    padding: '8px 16px',
                    borderRadius: 4,
                    border: 'none',
                    background: '#009688',
                    color: '#fff',
                    cursor: 'pointer',
                  }}
                >
                  {fetchingBGG ? 'Fetching BGG Images...' : 'Fetch BGG Images'}
                </button>
              </div>

              {/* PDF Image Extractor Panel */}
              <PdfImageExtractorPanel onUse={handlePdfImagesSelected} />

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
                  gap: 12,
                  marginTop: 12,
                }}
              >
                {allImages.map(img => {
                  const key = img.id || img.path;
                  return (
                    <div
                      key={key}
                      style={{
                        width: '100%',
                        padding: 8,
                        background: '#fff',
                        border: '1px solid #eaeaea',
                        borderRadius: 8,
                        boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                      }}
                    >
                      <div
                        style={{
                          width: '100%',
                          height: 140,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          background: '#fff',
                          border: '1px solid #eee',
                          borderRadius: 6,
                          overflow: 'hidden',
                        }}
                      >
                        <img
                          src={displayImageUrl(img)}
                          alt={img.name || 'Image'}
                          title={img.name || img.path}
                          draggable
                          onDragStart={e =>
                            e.dataTransfer.setData('application/image-id', key)
                          }
                          onDoubleClick={() =>
                            openLightbox(
                              displayImageUrl(img),
                              img.name || 'Image'
                            )
                          }
                          style={{
                            maxWidth: '100%',
                            maxHeight: '100%',
                            objectFit: 'contain',
                          }}
                        />
                      </div>
                      <div
                        style={{
                          marginTop: 8,
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                        }}
                      >
                        <span
                          style={{
                            fontSize: 12,
                            color: '#555',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {img.name || 'Image'}
                        </span>
                        <label
                          style={{
                            fontSize: 12,
                            color: '#333',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4,
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={!excludedImageIds.has(key)}
                            onChange={() => toggleExcluded(key)}
                          />
                          Use
                        </label>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
                <button
                  onClick={applyImageSelection}
                  style={{ padding: '6px 12px' }}
                >
                  Update Images
                </button>
                <button
                  onClick={() =>
                    setExcludedImageIds(
                      new Set(allImages.map(i => i.id || i.path))
                    )
                  }
                  style={{ padding: '6px 12px' }}
                >
                  Select None
                </button>
                <button
                  onClick={() => setExcludedImageIds(new Set())}
                  style={{ padding: '6px 12px' }}
                >
                  Select All
                </button>
              </div>
            </div>
          )}

          <section
            style={{
              marginTop: '2rem',
              padding: '1rem',
              border: '1px solid #eee',
              borderRadius: '8px',
            }}
          >
            <h3>Storyboard</h3>
            <div
              style={{
                display: 'flex',
                gap: '1rem',
                alignItems: 'center',
                marginBottom: '0.75rem',
              }}
            >
              <label>
                Language:{' '}
                <select
                  value={storyLang}
                  onChange={e => setStoryLang(e.target.value)}
                >
                  <option value="en">English</option>
                  <option value="fr">Français</option>
                </select>
              </label>
              <label>
                Voice:{' '}
                <select
                  value={storyVoice}
                  onChange={e => setStoryVoice(e.target.value)}
                >
                  {(STORY_VOICES[storyLang] || []).map(v => (
                    <option key={v.id} value={v.id}>
                      {v.label}
                    </option>
                  ))}
                </select>
              </label>
              <button
                onClick={handleGenerateStoryboard}
                disabled={isGeneratingStoryboard}
              >
                {isGeneratingStoryboard ? 'Generating…' : 'Generate Storyboard'}
              </button>
              <button
                onClick={handleCopyStoryboardJson}
                disabled={!storyboard}
                title="Copy storyboard JSON to clipboard"
              >
                Copy JSON
              </button>
              {storyboard && (
                <span style={{ color: '#555' }}>
                  Estimated total: {Math.round(storyboard.totalDurationSec)}s
                </span>
              )}
              {copySbFeedback && (
                <span
                  style={{
                    marginLeft: 8,
                    color: copySbFeedback === 'Copied!' ? 'green' : 'crimson',
                  }}
                >
                  {copySbFeedback}
                </span>
              )}
            </div>

            {storyboard && (
              <div>
                {storyboard.scenes.map(scene => (
                  <div
                    key={scene.id}
                    style={{
                      marginBottom: '1rem',
                      padding: '0.75rem',
                      background: '#fafafa',
                      borderRadius: '6px',
                    }}
                  >
                    <div style={{ fontWeight: 600, marginBottom: '0.5rem' }}>
                      {storyLang === 'fr'
                        ? scene.titleFr || scene.title
                        : scene.title}
                    </div>
                    {(scene.segments || []).map(seg => (
                      <div
                        key={seg.id}
                        style={{
                          display: 'flex',
                          gap: '0.75rem',
                          alignItems: 'center',
                          marginBottom: '0.5rem',
                        }}
                      >
                        {seg.image && (
                          <img
                            src={displayImageUrl(seg.image)}
                            alt={seg.image.name || 'segment'}
                            style={{
                              width: 96,
                              height: 64,
                              objectFit: 'cover',
                              borderRadius: '4px',
                              border: '1px solid #ddd',
                            }}
                          />
                        )}
                        <div style={{ flex: 1 }}>
                          <div style={{ color: '#333' }}>
                            {storyLang === 'fr' ? seg.textFr : seg.textEn}
                          </div>
                          <div
                            style={{
                              fontSize: 12,
                              color: '#777',
                              marginTop: 4,
                            }}
                          >
                            Duration: {seg.durationSec}s
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </section>

          <div
            style={{
              margin: '32px 0',
              padding: 20,
              border: '2px solid #3f51b5',
              borderRadius: 8,
              background: '#f5f6ff',
            }}
          >
            <h2>Script</h2>
            <div style={{ marginBottom: 10, color: '#666' }}>
              {rulebookText
                ? `Rulebook text loaded (${countWords(rulebookText)} words).`
                : 'Paste rulebook text below or upload a PDF to extract it automatically.'}
            </div>
            <textarea
              value={rulebookText}
              onChange={handleTextChange}
              placeholder="Paste the full rulebook text here (optional if you upload the PDF)"
              rows={6}
              style={{
                width: '100%',
                marginBottom: 12,
                borderRadius: 6,
                border: '1px solid #ccc',
                padding: 10,
              }}
            />
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 10,
                marginBottom: 12,
              }}
            >
              <div style={{ position: 'relative' }}>
                <button
                  onClick={handleSummarize}
                  disabled={loading}
                  style={{
                    padding: '8px 16px',
                    borderRadius: 4,
                    border: 'none',
                    background: loading ? '#ccc' : '#3f51b5',
                    color: '#fff',
                    cursor: loading ? 'not-allowed' : 'pointer',
                    minWidth: '120px',
                  }}
                >
                  {loading ? 'Generating...' : 'Generate Script'}
                </button>
                {loading && generateProgress > 0 && (
                  <div
                    style={{
                      position: 'absolute',
                      top: '100%',
                      left: 0,
                      right: 0,
                      marginTop: 4,
                      background: '#f0f0f0',
                      borderRadius: 8,
                      overflow: 'hidden',
                      height: 20,
                    }}
                  >
                    <div
                      style={{
                        width: `${generateProgress}%`,
                        height: '100%',
                        background: 'linear-gradient(90deg, #3f51b5, #5c6bc0)',
                        transition: 'width 0.3s ease',
                        borderRadius: 8,
                      }}
                    />
                    <div
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 11,
                        fontWeight: 'bold',
                        color: '#333',
                      }}
                    >
                      {generateProgress}%
                    </div>
                  </div>
                )}
                {loading && generateStage && (
                  <div
                    style={{
                      position: 'absolute',
                      top: '100%',
                      left: 0,
                      right: 0,
                      marginTop: 28,
                      fontSize: 12,
                      color: '#666',
                      textAlign: 'center',
                    }}
                  >
                    {generateStage}
                  </div>
                )}
              </div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  marginLeft: loading ? 60 : 0,
                }}
              >
                <label style={{ fontWeight: 600 }}>Detail %:</label>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={detailPercentage}
                  onChange={e => setDetailPercentage(Number(e.target.value))}
                />
                <span>{detailPercentage}%</span>
                <button
                  onClick={handleResummarize}
                  style={{
                    padding: '8px 16px',
                    borderRadius: 4,
                    border: 'none',
                    background: '#8e24aa',
                    color: '#fff',
                    cursor: 'pointer',
                  }}
                >
                  Re-summarize
                </button>
              </div>
              <button
                onClick={handleSaveSummary}
                style={{
                  padding: '8px 16px',
                  borderRadius: 4,
                  border: 'none',
                  background: '#009688',
                  color: '#fff',
                  cursor: 'pointer',
                }}
              >
                Save Script
              </button>
              <button
                onClick={handleSaveAndContinue}
                style={{
                  padding: '8px 16px',
                  borderRadius: 4,
                  border: 'none',
                  background: '#ff5722',
                  color: '#fff',
                  cursor: 'pointer',
                }}
              >
                Generate Audio (per section)
              </button>
            </div>

            <textarea
              value={editedSummary}
              onChange={handleSummaryEdit}
              placeholder="Your generated script will appear here. Edit freely."
              rows={16}
              style={{
                width: '100%',
                borderRadius: 6,
                border: '1px solid #ccc',
                padding: 10,
              }}
            />

            {sections.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <h3>Sections & Audio</h3>
                {sections.map((sec, idx) => (
                  <div
                    key={idx}
                    style={{
                      marginBottom: 16,
                      padding: 12,
                      background: '#fff',
                      border: '1px solid #e0e0e0',
                      borderRadius: 6,
                    }}
                  >
                    <div style={{ marginBottom: 8, fontWeight: 600 }}>
                      Section {idx + 1}
                    </div>
                    <div style={{ marginBottom: 8, color: '#444' }}>
                      <ReactMarkdown>{sec}</ReactMarkdown>
                    </div>
                    {audioLoading[idx] ? (
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                        }}
                      >
                        <ClipLoader size={16} color="#ff5722" /> Generating
                        audio...
                      </div>
                    ) : audio[idx] ? (
                      <audio
                        controls
                        src={audio[idx]}
                        style={{ width: '100%' }}
                      />
                    ) : (
                      <div style={{ color: '#999' }}>
                        No audio generated for this section yet.
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={{ margin: '24px 0', textAlign: 'right' }}>
            <button
              onClick={handleSaveProject}
              style={{
                padding: '10px 18px',
                borderRadius: 6,
                border: 'none',
                background: '#1976d2',
                color: '#fff',
                cursor: 'pointer',
              }}
            >
              Save Project
            </button>
          </div>
        </div>
      )}

      {showDevTest && <DevTestPage onClose={() => setShowDevTest(false)} />}

      {lightbox.open && (
        <div className="lightbox-backdrop" onClick={closeLightbox}>
          <img
            className="lightbox-image"
            src={lightbox.src}
            alt={lightbox.alt}
            onClick={e => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}

export default App;
