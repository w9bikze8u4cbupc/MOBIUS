import React, { useState, useRef, useEffect } from "react";
import axios from "axios";
import { GlobalWorkerOptions, getDocument } from "pdfjs-dist";
import { GenesisFeedbackPanel } from "./GenesisFeedbackPanel";
import { GenesisHealthPanel } from "./GenesisHealthPanel";
import { GenesisArtifactsPanel } from "./GenesisArtifactsPanel";
import { GenesisGoalsEditor } from "./GenesisGoalsEditor";
import { GenesisAutoOptimizeButton } from "./GenesisAutoOptimizeButton";
import { GenesisCampaignPanel } from "./GenesisCampaignPanel";
import { GenesisInspector } from "./GenesisInspector";
import { GenesisQaReportButton } from "./GenesisQaReportButton";
import { GenesisDebugBundleButton } from "./GenesisDebugBundleButton";
import { PipelineStepper } from "./components/PipelineStepper";
import { pipelineSteps } from "./components/pipelineSteps";
import { ProjectSetupStep } from "./components/steps/ProjectSetupStep";
import { MetadataInputStep } from "./components/steps/MetadataInputStep";
import { IngestionReviewStep } from "./components/steps/IngestionReviewStep";
import { ImagesStep } from "./components/steps/ImagesStep";
import { ScriptStep } from "./components/steps/ScriptStep";
import { StoryboardStep } from "./components/steps/StoryboardStep";
import { VoiceStep } from "./components/steps/VoiceStep";
import { RenderExportStep } from "./components/steps/RenderExportStep";
import {
  buildScriptGenerationRequest,
  createPersistedProjectContext,
  getScriptInputReadiness,
  isTrustedScriptProvenance,
  loadLatestProjectContext,
  SCRIPT_PROVENANCE,
  saveProjectContext,
} from "./projectContext";
import "./styles/pipeline.css";

// Configure PDF.js worker
GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';

// Backend URL - use environment variable or relative path in production
// In development, connects to Express backend on port 8000
const BACKEND_URL = process.env.REACT_APP_BACKEND_URL !== undefined 
  ? process.env.REACT_APP_BACKEND_URL 
  : '';

export function createProjectIdFromFilename(filename, suffix = null) {
  const baseName = String(filename || 'rulebook').replace(/\.[^/.]+$/, '');
  const slug = baseName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'rulebook';
  const uniqueSuffix = suffix || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  return `${slug}-${uniqueSuffix}`;
}

export function createDisplayNameFromFilename(filename) {
  const baseName = String(filename || '')
    .replace(/\.[^/.]+$/, '')
    .replace(/[._-]+/g, ' ')
    .trim();
  if (!baseName) return '';

  return baseName
    .toLowerCase()
    .replace(/\b\p{L}/gu, (letter) => letter.toUpperCase());
}

export function hasValidComponentInventory(components = []) {
  return Array.isArray(components)
    && components.some((component) => isUsableComponentName(component?.name));
}

export function isUsableComponentName(value) {
  const name = String(value || '').trim();
  if (!name || /^(unknown|unknown component|component|components|item|items|n\/a|none|null)$/i.test(name)) return false;
  if (name.split(/\s+/).length > 12 || /[.!?]/.test(name)) return false;
  return true;
}

export function extractPdfPageText(items = []) {
  const entries = items
    .map((item, index) => ({
      text: String(item?.str || '').trim(),
      x: Number(item?.transform?.[4]),
      y: Number(item?.transform?.[5]),
      index,
    }))
    .filter((entry) => entry.text);
  if (entries.length === 0) return '';
  if (!entries.every((entry) => Number.isFinite(entry.x) && Number.isFinite(entry.y))) {
    return entries.map((entry) => entry.text).join('\n');
  }

  const lines = [];
  for (const entry of entries) {
    let line = lines.find((candidate) => Math.abs(candidate.y - entry.y) <= 2);
    if (!line) {
      line = { y: entry.y, entries: [] };
      lines.push(line);
    }
    line.entries.push(entry);
  }
  return lines
    .sort((a, b) => b.y - a.y)
    .map((line) => line.entries.sort((a, b) => a.x - b.x || a.index - b.index).map((entry) => entry.text).join(' '))
    .join('\n');
}

// Updated VOICE_OPTIONS array with the specified ElevenLabs voices
const VOICE_OPTIONS = [
  { name: "English - Adam", id: "pNInz6obpgDQGcFmaJgB", language: "english" },
  { name: "French - Amélie", id: "UJCi4DDncuo0VJDSIegj", language: "french" },
  { name: "French - Félix", id: "RBhYSNMNu6b2CGZ9Fn1M", language: "french" },
];

// Helper function to split markdown text into sections for display/TTS
function splitMarkdownSections(markdown) {
  // Regex to find lines that look like markdown headers (## Title), or lines starting with 3+ caps/digits/-/.
  // This version aims to include the header line with the section content.
  const regex = /(^|\n)(##? .+)/g;
  const sections = [];
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(markdown)) !== null) {
    // Add the text before the header match as a section (if any)
    if (match.index > lastIndex) {
      sections.push(markdown.slice(lastIndex, match.index).trim());
    }
    // Find the end of the header line
    const headerEnd = markdown.indexOf('\n', match.index + match[1].length + match[2].length);
    // The next section starts at the character after the header line break, or end of string
    lastIndex = headerEnd !== -1 ? headerEnd + 1 : markdown.length;
    // Add the header line itself as the start of a new section
    sections.push(match[2].trim());
  }

  // Add any remaining text after the last header
  if (lastIndex < markdown.length) {
    sections.push(markdown.slice(lastIndex).trim());
  }

  // Filter out any empty sections that might have resulted from the split
  return sections.filter(section => section.length > 0);
}

function buildSyntheticPagesFromText(text) {
  const paragraphs = text
    .split(/\n+/)
    .map((chunk) => chunk.trim())
    .filter(Boolean);

  if (!paragraphs.length) {
    return [];
  }

  const chunkSize = 6;
  const pages = [];
  for (let i = 0; i < paragraphs.length; i += chunkSize) {
    const slice = paragraphs.slice(i, i + chunkSize);
    const blocks = slice.map((para, idx) => ({
      text: para,
      fontSize: idx === 0 ? 24 : 14,
      x: 50,
      y: 40 + idx * 30,
      width: 500,
      height: 20,
    }));

    pages.push({
      number: pages.length + 1,
      blocks,
    });
  }

  return pages;
}


const REMOTION_PLACEHOLDER_IMAGE = 'src/remotion/assets/hanamikoji-card-placeholder.svg';
const REMOTION_SCENE_COLORS = ['#E91E63', '#1E88E5', '#43A047', '#FB8C00', '#8E24AA', '#00897B'];

function cleanRemotionText(value) {
  return String(value || '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^[#>\s]+/gm, '')
    .replace(/[*_`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function splitRemotionSections(script, gameName) {
  const normalizedScript = String(script || '').trim();
  if (!normalizedScript) {
    return [];
  }

  const headings = [...normalizedScript.matchAll(/^#{1,6}\s+(.+)$/gm)];
  if (headings.length === 0) {
    return [{
      sectionTitle: cleanRemotionText(gameName) || 'Tutorial',
      narrationText: cleanRemotionText(normalizedScript),
    }];
  }

  const result = [];
  const introduction = cleanRemotionText(normalizedScript.slice(0, headings[0].index));
  if (introduction) {
    result.push({
      sectionTitle: cleanRemotionText(gameName) || 'Introduction',
      narrationText: introduction,
    });
  }

  headings.forEach((heading, index) => {
    const bodyStart = heading.index + heading[0].length;
    const nextHeading = headings[index + 1];
    const narrationText = cleanRemotionText(
      normalizedScript.slice(bodyStart, nextHeading ? nextHeading.index : normalizedScript.length),
    );
    const sectionTitle = cleanRemotionText(heading[1]) || `Step ${index + 1}`;
    result.push({
      sectionTitle,
      narrationText: narrationText || sectionTitle,
    });
  });

  return result;
}

function getRemotionImagePath(image) {
  const fileKey = typeof image?.fileKey === 'string' ? image.fileKey.trim().replace(/\\/g, '/') : '';
  if (!fileKey || pathIsAbsolute(fileKey)) {
    return null;
  }
  if (fileKey.startsWith('src/api/uploads/')) {
    return `/uploads/${fileKey.slice('src/api/uploads/'.length)}`;
  }
  if (fileKey.startsWith('uploads/')) {
    return `/${fileKey}`;
  }
  return fileKey.startsWith('data/') ? fileKey : null;
}

function pathIsAbsolute(filePath) {
  return /^([a-zA-Z]:)?\//.test(filePath);
}

export function buildRemotionScenes({ script, gameName, images, componentImageLinks }) {
  const sections = splitRemotionSections(script, gameName);
  const linkedImageIds = new Set(
    Object.values(componentImageLinks || {}).flat().filter(Boolean),
  );
  const selectedImages = linkedImageIds.size > 0
    ? (images || []).filter((image) => linkedImageIds.has(image.id))
    : (images || []);
  const imageUrls = selectedImages
    .map((image) => getRemotionImagePath(image))
    .filter(Boolean);

  return sections.map((section, index) => {
    const wordCount = section.narrationText.split(/\s+/).filter(Boolean).length;
    return {
      id: `scene-${index + 1}`,
      sectionTitle: section.sectionTitle,
      narrationText: section.narrationText,
      imageUrls: imageUrls.length > 0
        ? [imageUrls[index % imageUrls.length]]
        : [REMOTION_PLACEHOLDER_IMAGE],
      themeBorderColor: REMOTION_SCENE_COLORS[index % REMOTION_SCENE_COLORS.length],
      durationInFrames: Math.max(90, Math.round((wordCount / 150) * 60 * 30)),
    };
  });
}

function App() {
  // --- State Variables ---
  const [file, setFile] = useState(null);
  const [rulebookText, setRulebookText] = useState("");
  const [language, setLanguage] = useState("english");
  const [voice, setVoice] = useState(""); // Stores ElevenLabs voice ID
  const [gameName, setGameName] = useState("");
  const [projectId, setProjectId] = useState("");
  const [bggUrl, setBggUrl] = useState("");
  const [metadata, setMetadata] = useState({
    publisher: "",
    playerCount: "",
    gameLength: "",
    minimumAge: "",
    theme: "",
    edition: "",
  });
  const [detailPercentage, setDetailPercentage] = useState(25);
  const [showThemePrompt, setShowThemePrompt] = useState(false); // To show the theme input modal
  const [loading, setLoading] = useState(false); // For main processing loading state
  const [summary, setSummary] = useState(""); // The generated script (Markdown)
  const [generatedScript, setGeneratedScript] = useState(false);
  const [scriptProvenance, setScriptProvenance] = useState(null);
  const [editedSummary, setEditedSummary] = useState(""); // The script in the editable textarea
  const [sections, setSections] = useState([]); // Summary split into sections for TTS
  const [audio, setAudio] = useState({}); // Stores Blob URLs for generated audio sections
  const [audioLoading, setAudioLoading] = useState({}); // Loading state for individual audio sections
  const [error, setError] = useState(""); // General error message display
  const [summaryWarning, setSummaryWarning] = useState("");
  const [generationStatus, setGenerationStatus] = useState(null);
  // eslint-disable-next-line no-unused-vars
const [dragActive, setDragActive] = useState(false); // For drag and drop file area
  // eslint-disable-next-line no-unused-vars
const fileInputRef = useRef(); // Ref for the hidden file input
  const hasHydratedProjectContextRef = useRef(false);
  const previousProjectIdRef = useRef("");

  // State for displaying translation status/errors
  const [translationStatus, setTranslationStatus] = useState({
    isTranslating: false,
    error: null, // Stores translation-specific errors/warnings from backend
  });
  const [ingestionManifest, setIngestionManifest] = useState(null);
  const [storyboardManifest, setStoryboardManifest] = useState(null);
  const [ingestionError, setIngestionError] = useState("");
  const [storyboardError, setStoryboardError] = useState("");
  const [ingesting, setIngesting] = useState(false);
  const [storyboarding, setStoryboarding] = useState(false);
  const [renderJobState, setRenderJobState] = useState(null);
  const [renderJobError, setRenderJobError] = useState("");
  const [renderJobLoading, setRenderJobLoading] = useState(false);
  const [backgroundMusicFile, setBackgroundMusicFile] = useState(null);
  const [backgroundMusicVolume, setBackgroundMusicVolume] = useState(0.12);
  const renderPollRef = useRef(null);
  const [activeStepId, setActiveStepId] = useState(pipelineSteps[0].id);
  const [completedStepIds, setCompletedStepIds] = useState([]);
  const [projectImages, setProjectImages] = useState([]);
  const [componentImageLinks, setComponentImageLinks] = useState({});
  const [extractingName, setExtractingName] = useState(false);
  const [bggLookupLoading, setBggLookupLoading] = useState(false);
  const [metadataWarning, setMetadataWarning] = useState('');
  const [gameComponents, setGameComponents] = useState([]);
  const [componentExtraction, setComponentExtraction] = useState(null);
  const [rulebookPages, setRulebookPages] = useState([]);
  const [extractingComponents, setExtractingComponents] = useState(false);
  const [aiStatus, setAiStatus] = useState({
    configured: false,
    provider: null,
    model: null,
    ready: false,
    message: 'AI readiness has not been checked yet.',
  });
  const [aiStatusLoading, setAiStatusLoading] = useState(false);


  // --- Effects ---
  // Effect to set default voice based on language
  useEffect(() => {
    const voices = getLanguageVoices(language);
    if (voices.length > 0) {
      setVoice(voices[0].id);
    } else {
      setVoice(""); // Clear voice if no voices for language
    }
  }, [language]); // Rerun when language changes

  // Effect to update editedSummary when summary changes (after generation)
  useEffect(() => {
    setEditedSummary(summary);
    // Automatically split sections when summary is updated
    if (summary) {
      const newSections = splitMarkdownSections(summary);
      console.log('Sections created:', newSections);
      setSections(newSections);
      setAudio({}); // Clear existing audio when summary changes
    } else {
      setSections([]);
      setAudio({});
    }
  }, [summary]); // Rerun when summary changes

  useEffect(() => {
    return () => {
      if (renderPollRef.current) {
        clearInterval(renderPollRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      hasHydratedProjectContextRef.current = true;
      return;
    }

    const context = loadLatestProjectContext(window.localStorage);
    if (context) {
      setProjectId(context.projectId);
      setGameName(context.gameName);
      setLanguage(context.language);
      setRulebookText(context.rulebookText);
      setRulebookPages(context.rulebookPages);
      setGameComponents(context.components);
      setMetadata(context.metadata);
      setProjectImages(context.images);
      setComponentImageLinks(context.componentImageLinks);
      setSummary(context.script);
      setGeneratedScript(context.generatedScript);
      setScriptProvenance(context.scriptProvenance);
      setEditedSummary(context.script);
      setGenerationStatus(null);
      if (context.scriptProvenance === SCRIPT_PROVENANCE.LEGACY_INVALID_FALLBACK) {
        setSummaryWarning('A previous incomplete fallback was discarded. Generate a source-complete script to continue.');
      }
      setActiveStepId(context.activeStepId);
      setCompletedStepIds(context.completedStepIds);
      previousProjectIdRef.current = context.projectId;
    }
    hasHydratedProjectContextRef.current = true;
  }, []);

  useEffect(() => {
    if (!hasHydratedProjectContextRef.current || !projectId.trim() || typeof window === 'undefined') return;
    saveProjectContext(window.localStorage, createPersistedProjectContext({
      projectId,
      gameName,
      language,
      rulebookText,
      rulebookPages,
      components: gameComponents,
      metadata,
      images: projectImages,
      componentImageLinks,
      script: editedSummary || summary,
      generatedScript,
      scriptProvenance,
      activeStepId,
      completedStepIds,
    }));
  }, [
    activeStepId,
    completedStepIds,
    componentImageLinks,
    editedSummary,
    gameComponents,
    gameName,
    generatedScript,
    language,
    metadata,
    projectId,
    projectImages,
    rulebookPages,
    rulebookText,
    scriptProvenance,
    summary,
  ]);

  useEffect(() => {
    if (!previousProjectIdRef.current) {
      previousProjectIdRef.current = projectId;
      return;
    }
    if (previousProjectIdRef.current !== projectId) {
      previousProjectIdRef.current = projectId;
      setProjectImages([]);
      setComponentImageLinks({});
    }
  }, [projectId]);

  // Loading the Script step reads configuration only; it never probes the provider.
  useEffect(() => {
    if (activeStepId !== 'script') return;
    let active = true;
    setAiStatusLoading(true);
    axios.get(`${BACKEND_URL}/api/ai/status`)
      .then(({ data }) => {
        if (active) setAiStatus(data);
      })
      .catch(() => {
        if (active) {
          setAiStatus({
            configured: false,
            provider: null,
            model: null,
            ready: false,
            message: 'AI status is unavailable. Confirm that the backend is running, then refresh AI status.',
          });
        }
      })
      .finally(() => {
        if (active) setAiStatusLoading(false);
      });
    return () => { active = false; };
  }, [activeStepId]);

  // Ref to track auto-extraction state without causing re-renders
  const autoExtractionRef = useRef({ triggered: false, processedHash: '' });

  // Auto-trigger extraction when entering Step 3 (Ingestion Review)
  useEffect(() => {
    if (activeStepId !== 'ingestion') return;
    
    const hasContent = rulebookText?.trim();
    if (!hasContent) return;
    
    const textHash = rulebookText.substring(0, 100);
    const ref = autoExtractionRef.current;
    
    // Skip if already triggered for this content
    if (ref.triggered && ref.processedHash === textHash) return;
    
    // Skip if already processing
    if (ingesting || extractingComponents) return;
    
    // Skip if we already have components for this content
    if (gameComponents.length > 0 && ref.processedHash === textHash) return;
    
    // Mark as triggered
    ref.triggered = true;
    ref.processedHash = textHash;
    
    const runAutoExtraction = async () => {
      console.log('Auto-triggering component extraction and document analysis...');
      
      // Extract components
      try {
        setExtractingComponents(true);
        setIngestionError("");
        const { data } = await axios.post(`${BACKEND_URL}/api/extract-game-components`, {
          text: rulebookText,
          pages: rulebookPages,
          gameName: gameName || null
        });
        const componentsWithIds = (data.components || [])
          .filter((comp) => comp && typeof comp === 'object')
          .map((comp, idx) => ({
            ...comp,
            id: comp.id || `comp-${Date.now()}-${idx}`
          }));
        setGameComponents(componentsWithIds);
        setComponentExtraction(data);
        if (componentsWithIds.length === 0) {
          setIngestionError(data.message || 'No named physical components were found. Add the inventory manually for review.');
        }
      } catch (err) {
        console.error('Auto component extraction failed:', err);
        setIngestionError(`Component extraction failed: ${err.response?.data?.error || err.message}`);
      } finally {
        setExtractingComponents(false);
      }
      
      // Run document analysis
      try {
        setIngesting(true);
        const syntheticPages = buildSyntheticPagesFromText(rulebookText);
        const idSlug = (projectId || gameName || 'rulebook').replace(/\s+/g, '-').toLowerCase();
        const { data } = await axios.post(`${BACKEND_URL}/api/ingest`, {
          documentId: idSlug || 'rulebook',
          metadata: { title: gameName || 'Untitled Rulebook', gameId: idSlug || 'rulebook', source: 'client-ui' },
          pages: syntheticPages,
          bggMetadata: {}
        });
        setIngestionManifest(data.manifest);
      } catch (err) {
        console.error('Auto ingestion failed:', err);
      } finally {
        setIngesting(false);
      }
    };
    
    const timer = setTimeout(runAutoExtraction, 300);
    return () => clearTimeout(timer);
  }, [activeStepId, rulebookText, rulebookPages, ingesting, extractingComponents, gameComponents.length, gameName, projectId]);

  // Reset auto-trigger when PDF changes
  useEffect(() => {
    if (file) {
      autoExtractionRef.current = { triggered: false, processedHash: '' };
    }
  }, [file]);



  // --- Helper Functions ---
  const checkAiStatus = async ({ checkAccess = false } = {}) => {
    const suffix = checkAccess ? '?check=1' : '';
    const { data } = await axios.get(`${BACKEND_URL}/api/ai/status${suffix}`);
    setAiStatus(data);
    return data;
  };

  const refreshAiStatus = async () => {
    setAiStatusLoading(true);
    try {
      return await checkAiStatus({ checkAccess: true });
    } catch (_error) {
      const unavailable = {
        configured: false,
        provider: null,
        model: null,
        ready: false,
        message: 'AI status is unavailable. Confirm that the backend is running, then refresh AI status.',
      };
      setAiStatus(unavailable);
      return unavailable;
    } finally {
      setAiStatusLoading(false);
    }
  };

  const requireAiPreflight = async () => {
    const status = await checkAiStatus({ checkAccess: true });
    if (!status?.ready) {
      throw new Error(status?.message || 'AI script generation is unavailable. Refresh AI status and update the local configuration.');
    }
    return status;
  };

  // Get available voice options filtered by language
  const getLanguageVoices = (lang) => VOICE_OPTIONS.filter(v => v.language === lang);

  // Extract text from a PDF file using pdfjs-dist
  const extractTextFromPDF = async (file) => {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await getDocument({ data: arrayBuffer }).promise;
      const pages = [];
      let fullText = "";
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        const pageText = extractPdfPageText(content.items);
        pages.push({ number: i, text: pageText });
        fullText += pageText + "\n";
      }
      console.log('Extracted PDF text length:', fullText.length);
      if (!fullText.trim()) {
        throw new Error("No readable text found in the PDF");
      }
      return { text: fullText, pages };
    } catch (err) {
      console.error('PDF extraction error message:', err?.message || 'No message'); console.error('PDF extraction error stack:', err?.stack || 'No stack');
      // Re-throw with a user-friendly message
      throw new Error("Failed to extract text from PDF. Please ensure it's a text-based PDF, not just images.");
    }
  };

  // Optional AI enrichment. A caller must explicitly mark this as an operator request.
  const extractGameInfoFromText = async ({ operatorInitiated = false } = {}) => {
    if (!operatorInitiated) return;
    if (!rulebookText.trim()) {
      setMetadataWarning('Upload a readable PDF before requesting optional AI metadata.');
      return;
    }

    try {
      setExtractingName(true);
      setMetadataWarning('');
      await requireAiPreflight();
      const { data } = await axios.post(`${BACKEND_URL}/api/extract-game-name`, {
        text: rulebookText.substring(0, 8000),
      });
      const extractedName = String(data?.gameName || '').trim();
      if (extractedName) setGameName(extractedName);
      setMetadata((previous) => ({
        ...previous,
        publisher: previous.publisher || data?.publisher || '',
        playerCount: previous.playerCount || data?.playerCount || '',
        gameLength: previous.gameLength || data?.gameLength || '',
        minimumAge: previous.minimumAge || data?.minimumAge || '',
        theme: previous.theme || data?.theme || '',
        edition: previous.edition || data?.edition || '',
      }));
    } catch (err) {
      setMetadataWarning(
        err.response?.data?.error
          || err.message
          || 'AI game-info extraction could not complete. You can continue with the editable filename-derived name.',
      );
    } finally {
      setExtractingName(false);
    }
  };

  const lookupBggMetadata = async () => {
    const name = gameName.trim();
    if (!name) {
      setMetadataWarning('Enter a game name before requesting an optional BGG lookup.');
      return;
    }

    try {
      setBggLookupLoading(true);
      setMetadataWarning('');
      const { data } = await axios.get(`${BACKEND_URL}/api/bgg-search`, { params: { gameName: name } });
      if (!data?.found) {
        setMetadataWarning(data?.reason || 'No BoardGameGeek match was found for this game name.');
        return;
      }

      setBggUrl(data.bggUrl || '');
      setMetadata((previous) => ({
        ...previous,
        publisher: previous.publisher || data.publisher || '',
        playerCount: previous.playerCount || data.playerCount || '',
        gameLength: previous.gameLength || data.gameLength || '',
        minimumAge: previous.minimumAge || data.minimumAge || '',
        theme: previous.theme || data.theme || '',
      }));
    } catch (err) {
      setMetadataWarning(err.response?.data?.error || 'BGG lookup could not complete. You can continue without external metadata.');
    } finally {
      setBggLookupLoading(false);
    }
  };

  // --- File Handling ---
  // Process a file (either from drag/drop or file input)
  const handleFile = async (file) => {
    // Reset relevant state variables before processing new file
    setFile(file);
    setGameName("");
    setProjectId("");
    setBggUrl("");
    setMetadataWarning("");
    setBggLookupLoading(false);
    setRulebookText("");
    setSummary("");
    setGeneratedScript(false);
    setScriptProvenance(null);
    setGenerationStatus(null);
    setEditedSummary("");
    setSections([]);
    setAudio({});
    setAudioLoading({});
    setBackgroundMusicFile(null);
    setBackgroundMusicVolume(0.12);
    setIngestionManifest(null);
    setStoryboardManifest(null);
    setIngestionError("");
    setStoryboardError("");
    setGameComponents([]);
    setComponentExtraction(null);
    setRulebookPages([]);
    setCompletedStepIds([]);
    setMetadata({ publisher: "", playerCount: "", gameLength: "", minimumAge: "", theme: "", edition: "" });
    setShowThemePrompt(false);
    setError("");
    setSummaryWarning("");
    setTranslationStatus({ isTranslating: false, error: null });


    try {
      if (file.type === "application/pdf") {
        setProjectId(createProjectIdFromFilename(file.name));
        setGameName(createDisplayNameFromFilename(file.name));
        setLoading(true);
        const extracted = await extractTextFromPDF(file);
        setRulebookText(extracted.text);
        setRulebookPages(extracted.pages);
        setLoading(false);
      } else {
        setError("Please upload a PDF file");
      }
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  // Drag and drop handlers

  // eslint-disable-next-line no-unused-vars
  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") setDragActive(true);
    else if (e.type === "dragleave") setDragActive(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    // Check if files were dropped and process the first one
    if (e.dataTransfer.files && e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
  };

  // Handler for standard file input change
  const handleFileChange = (e) => {
    // Check if files were selected and process the first one
    if (e.target.files && e.target.files[0]) handleFile(e.target.files[0]);
  };

  // Handler for manual text area changes
  // eslint-disable-next-line no-unused-vars
  const handleTextChange = (e) => {
    // Reset states similar to file handling, except don't clear gameName based on file
    setRulebookText(e.target.value);
    setFile(null); // Clear file if user starts typing
    setSummary("");
    setGeneratedScript(false);
    setScriptProvenance(null);
    setGenerationStatus(null);
    setEditedSummary("");
    setSections([]);
    setAudio({});
    setAudioLoading({});
    // Keep existing metadata or reset based on preference, here resetting to empty
    setMetadata({ publisher: "", playerCount: "", gameLength: "", minimumAge: "", theme: "", edition: "" });
    setShowThemePrompt(false);
    setError("");
    setSummaryWarning("");
    setTranslationStatus({ isTranslating: false, error: null });
    setIngestionManifest(null);
    setStoryboardManifest(null);
    setIngestionError("");
    setStoryboardError("");
    setGameComponents([]);
    setComponentExtraction(null);
    setRulebookPages([]);

  };

  const handleRunIngestion = async () => {
    if (!rulebookText.trim()) {
      setIngestionError("Upload or paste a rulebook first");
      return;
    }

    setIngesting(true);
    setError("");
    setIngestionError("");
    setStoryboardManifest(null);

    const syntheticPages = buildSyntheticPagesFromText(rulebookText);
    const idSlug = (projectId || gameName || 'rulebook').replace(/\s+/g, '-').toLowerCase();
    const payload = {
      documentId: idSlug || 'rulebook',
      metadata: {
        title: gameName || 'Untitled Rulebook',
        gameId: idSlug || 'rulebook',
        source: 'client-ui'
      },
      pages: syntheticPages,
      bggMetadata: {}
    };

    try {
      const { data } = await axios.post(`${BACKEND_URL}/api/ingest`, payload);
      setIngestionManifest(data.manifest);
    } catch (err) {
      setIngestionManifest(null);
      const apiError = err.response?.data?.code || err.response?.data?.error || err.message || 'Unknown error';
      setIngestionError(`Document structure analysis failed: ${apiError}`);
    } finally {
      setIngesting(false);
    }
  };

  // Extract game components using AI
  const handleExtractComponents = async () => {
    if (!rulebookText.trim()) {
      setIngestionError("Upload or paste a rulebook first");
      return;
    }

    setExtractingComponents(true);
    setIngestionError("");

    try {
      console.log('Extracting game components...');
      const { data } = await axios.post(`${BACKEND_URL}/api/extract-game-components`, {
        text: rulebookText,
        pages: rulebookPages,
        gameName: gameName || null
      });
      
      console.log('Extracted components:', data.components);
      
      const componentsWithIds = (data.components || [])
        .filter((comp) => comp && typeof comp === 'object')
        .map((comp, idx) => ({
          ...comp,
          id: comp.id || `comp-${Date.now()}-${idx}`
        }));
      setGameComponents(componentsWithIds);
      setComponentExtraction(data);
      if (componentsWithIds.length === 0) {
        setIngestionError(data.message || 'No named physical components were found. Add the inventory manually for review.');
      }

    } catch (err) {
      console.error('Component extraction error:', err);
      const apiError = err.response?.data?.error || err.message;
      setIngestionError(`Component extraction failed: ${apiError}`);
    } finally {
      setExtractingComponents(false);
    }
  };

  const handleGenerateStoryboard = async () => {
    if (!ingestionManifest) {
      setStoryboardError("Run deterministic ingestion first");
      return;
    }

    setStoryboarding(true);
    setStoryboardError("");

    try {
      const { data } = await axios.post(`${BACKEND_URL}/api/storyboard`, {
        ingestionManifest,
        options: { includeOverlayHashes: true }
      });
      setStoryboardManifest(data.manifest);
    } catch (err) {
      const apiError = err.response?.data?.code || err.response?.data?.error || err.message;
      setStoryboardError(apiError);
    } finally {
      setStoryboarding(false);
    }
  };

  const handleStartRender = async () => {
    setRenderJobError("");
    setRenderJobLoading(true);
    setRenderJobState(null);

    if (renderPollRef.current) {
      clearInterval(renderPollRef.current);
      renderPollRef.current = null;
    }

    try {
      const script = (editedSummary || summary).trim();
      if (!script) {
        throw new Error("Generate or save a tutorial script before rendering.");
      }
      if (!voice.trim()) {
        throw new Error("Select a narration voice before rendering.");
      }
      if (!backgroundMusicFile) {
        throw new Error("Choose a background-music file before rendering.");
      }

      const scenes = buildRemotionScenes({
        script,
        gameName,
        images: projectImages,
        componentImageLinks,
      });
      if (scenes.length === 0) {
        throw new Error("The tutorial script does not contain renderable scenes.");
      }

      const renderMetadata = {
        ...metadata,
        renderState: {
          ...(metadata.renderState || {}),
          ingestionManifest,
          storyboardManifest,
        },
      };
      const projectContext = createPersistedProjectContext({
        projectId,
        gameName,
        language,
        rulebookText,
        rulebookPages,
        components: gameComponents,
        metadata,
        images: projectImages,
        componentImageLinks,
        script,
        generatedScript,
        activeStepId,
        completedStepIds,
      });
      const { data: savedProject } = await axios.post(`${BACKEND_URL}/save-project`, {
        name: gameName.trim() || projectId.trim() || "MOBIUS tutorial",
        metadata: renderMetadata,
        projectContext,
        components: gameComponents.length > 0 ? gameComponents : (ingestionManifest?.components || []),
        images: projectImages,
        script,
        audio: "",
        scenes,
      });
      if (!savedProject?.projectId) {
        throw new Error("The project could not be persisted for Remotion rendering.");
      }

      const musicFormData = new FormData();
      musicFormData.append("backgroundMusic", backgroundMusicFile);
      musicFormData.append("volume", String(backgroundMusicVolume));
      const { data: uploadedMusic } = await axios.post(
        `${BACKEND_URL}/api/render-remotion/background-music?projectId=${encodeURIComponent(savedProject.projectId)}`,
        musicFormData,
      );
      if (!uploadedMusic?.backgroundMusicPath) {
        throw new Error("The background-music file could not be saved for rendering.");
      }
      setBackgroundMusicFile(null);

      const { data } = await axios.post(`${BACKEND_URL}/api/render-remotion`, {
        projectId: savedProject.projectId,
        voiceId: voice.trim(),
      });
      if (!data?.ok || !data.outputPath) {
        throw new Error(data?.error || "Remotion did not return an output video.");
      }

      setRenderJobState({
        id: data.projectId,
        status: "completed",
        progress: 100,
        outputFilePath: data.outputPath,
        resultPaths: data.outputPaths || [data.outputPath],
        artifacts: [],
        renderer: "remotion",
      });
    } catch (err) {
      const apiError = err.response?.data?.error || err.response?.data?.code || err.message;
      setRenderJobError(apiError);
    } finally {
      setRenderJobLoading(false);
    }
  };


 // --- Metadata Handling ---
  // Handle changes to metadata input fields
  const handleMetadataChange = (field, value) => {
    setMetadata(prev => ({ ...prev, [field]: value }));
  };

  // Handle submission of the theme prompt modal
  const handleThemeSubmit = async () => {
    if (!metadata.theme.trim() || metadata.theme === "Not found") {
      setSummaryWarning("Please provide a valid theme for the optional AI summary.");
      return;
    }
    // Proceed with summarization after theme is provided
    setShowThemePrompt(false); // Hide the modal
    // Now call the main handleSummarize function to regenerate with theme included
    handleSummarize(); // Call the main handler
  };


  // --- Summary Editing and Saving ---
  // Handle changes in the edited summary textarea
  const handleSummaryEdit = (e) => {
    if (!e || !e.target) {
      console.error('handleSummaryEdit: Event or e.target is undefined');
      return;
    }
    const nextScript = e.target.value;
    setEditedSummary(nextScript);
    setScriptProvenance(nextScript.trim() ? SCRIPT_PROVENANCE.MANUAL : null);
    setGeneratedScript(false);
    setGenerationStatus(null);
  };

  // Save edited summary and re-split sections
  const handleSaveSummary = async () => {
    setLoading(true); // Maybe a different loading state for saving?
    setError("");
    try {
      setSummary(editedSummary); // Update the official summary state
      setGeneratedScript(false);
      setScriptProvenance(editedSummary.trim() ? SCRIPT_PROVENANCE.MANUAL : null);
      setGenerationStatus(null);
      // Sections and audio effects will trigger automatically when summary state changes
      console.log('Edited summary saved and sections re-split.');
    } catch (err) {
      setError("Failed to save edited summary");
    } finally {
      setLoading(false);
    }
  };

  // Save edited summary and proceed to generate audio for all sections

  // eslint-disable-next-line no-unused-vars
  const handleSaveAndContinue = async () => {
    setLoading(true);
    setError("");
    setAudio({}); // Clear previous audio

    try {
      // Ensure sections state is up-to-date with edited summary
      const currentSections = splitMarkdownSections(editedSummary);
      setSections(currentSections); // Update sections state if necessary

      // Generate audio for each section in parallel
      const audioPromises = currentSections.map(async (section, idx) => {
        let ttsText = stripMarkdown(section);
        if (!ttsText.trim()) {
          console.log(`Section ${idx} has no text after stripping markdown, skipping TTS.`);
          return null; // Skip if no text to speak
        }

        setAudioLoading(prev => ({ ...prev, [idx]: true })); // Set loading for this section

        try {
          const res = await axios.post(
            `${BACKEND_URL}/tts`,
            { text: ttsText, voice, language, gameName }, // Send language and voice ID
            { responseType: "arraybuffer" } // Receive audio data as array buffer
          );
          const blob = new Blob([res.data], { type: "audio/mpeg" });
          const url = URL.createObjectURL(blob); // Create a temporary URL for the audio blob
          // Update audio state for this specific section
          setAudio(prev => ({ ...prev, [idx]: url }));
          return url; // Return the URL
        } catch (err) {
          console.error(`Failed to generate audio for section ${idx}:`, err.response?.data?.error || err.message);
          // Handle errors for individual sections, maybe set an error state for this section?
          // setSectionError(prev => ({ ...prev, [idx]: 'Error generating audio' }));
          return null; // Return null on error
        } finally {
          setAudioLoading(prev => ({ ...prev, [idx]: false })); // Turn off loading for this section
        }
      });

      // Wait for all audio generations to complete
      await Promise.all(audioPromises);
      console.log('All audio generation attempts completed.');

    } catch (err) {
      // Catch errors from Promise.all if any promise rejected
      setError(err.response?.data?.error || "Failed to save and generate audio");
    } finally {
      setLoading(false);
    }
  };


  const handleScriptGenerationFailure = ({ warning, status }) => {
    setGeneratedScript(false);
    setGenerationStatus(status || null);
    setSummaryWarning(warning);
    setTranslationStatus({ isTranslating: false, error: null });

    const hasRetainedTrustedScript = isTrustedScriptProvenance(scriptProvenance)
      && Boolean(editedSummary.trim());
    if (!hasRetainedTrustedScript) {
      setSummary('');
      setEditedSummary('');
      setScriptProvenance(SCRIPT_PROVENANCE.GENERATION_FAILED);
      setCompletedStepIds((previous) => previous.filter((stepId) => stepId !== 'script'));
    }
  };

  // --- Main Summarization Handler ---
  const handleSummarize = async () => {
    const scriptContext = {
      projectId,
      gameName,
      language,
      rulebookText,
      components: gameComponents,
      metadata,
    };
    const { request, readiness } = buildScriptGenerationRequest(scriptContext);
    if (!request) {
      setSummaryWarning(readiness.message);
      return;
    }

    setLoading(true);
    // A new attempt invalidates the current-attempt success indicator immediately,
    // while provenance keeps a previously trusted script available for review.
    setGeneratedScript(false);
    setSummaryWarning("");
    setGenerationStatus(null);
    setShowThemePrompt(false);
    setTranslationStatus({ isTranslating: false, error: null });

    try {
      await requireAiPreflight();
      console.log(`Sending rulebookText length: ${rulebookText.length} to backend for summarization.`);
      // Make the POST request to the backend's summarize endpoint
      const response = await axios.post(`${BACKEND_URL}/summarize`, request);

      // Handle the backend response
      console.log('Received response from backend /summarize.');
      console.log('Received summary length:', response.data?.summary?.length);


            const sourceComplete = response.data?.sourceCompleteness?.complete === true
        && response.data?.generationStatus?.sourceComplete === true;
      if (response.data.generated === true && sourceComplete && typeof response.data.summary === 'string' && response.data.summary.trim()) {
        const generatedSummary = response.data.summary.trim();
        setSummary(generatedSummary);
        setGeneratedScript(true);
        setScriptProvenance(SCRIPT_PROVENANCE.GENERATED_SOURCE_COMPLETE);
        setGenerationStatus(response.data.generationStatus);
        setSummaryWarning(response.data.metadataWarning || '');

        // Check for translation warnings/errors from the backend
        if (response.data.warning) {
          setTranslationStatus({
            isTranslating: false, // Not currently translating, this is a past warning
            error: response.data.warning // Display the warning message
          });
          console.warn('Backend translation warning:', response.data.warning);
        } else {
          // Clear any previous translation warnings if successful
          setTranslationStatus({ isTranslating: false, error: null });
        }

      } else {
        // Handle cases where no summary or needsTheme is in the response
        handleScriptGenerationFailure({
          status: response.data?.generationStatus,
          warning: response.data?.error || "Optional AI summary returned an unexpected response.",
        });
        console.error("Unexpected backend response:", response.data);
        setTranslationStatus({ isTranslating: false, error: null }); // Clear translation status on unexpected response

      }

    } catch (err) {
      // Handle errors from the axios request (e.g., network error, 500 status)
      console.error('Error during summarization request:', err);
      handleScriptGenerationFailure({
        status: err.response?.data?.generationStatus,
        warning: err.response?.data?.error || `Optional AI summary failed: ${err.message}`,
      });

      // Check for specific backend errors related to translation failure
      if (err.response?.data?.fallbackLanguage) {
        setTranslationStatus({
          isTranslating: false,
          error: `Translation failed. ${err.response.data.error}`
        });
      } else {
        setTranslationStatus({ isTranslating: false, error: null });
      }


    } finally {
      setLoading(false); // Turn off loading state
    }
  };

  // Function to strip markdown for TTS (simplified, might need refinement)
  const stripMarkdown = (text) => {
    let plainText = text;

    // Remove specific bracketed tags like [Page:x], [Image:x], [SHORT PAUSE] etc.
    plainText = plainText.replace(/\[.*?\]/g, "");

    // Remove markdown links [text](url) keeping only text
    plainText = plainText.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");

    // Remove markdown images ![alt text](url)
    plainText = plainText.replace(/!\[([^\]]*)\]\([^)]+\)/g, "");

    // Remove bold and italics markers (**strong**, *emphasis*)
    plainText = plainText.replace(/(\*\*|__)(.*?)\1/g, "$2");
    plainText = plainText.replace(/(\*|_)(.*?)\1/g, "$2");

    // Remove inline code backticks (`code`)
    plainText = plainText.replace(/`([^`]+)`/g, "$1");

    // Remove blockquotes (lines starting with >)
    plainText = plainText.replace(/^\s*>\s?/gm, "");

    // Remove list markers (-, *, +, or number. ) at the start of lines
    plainText = plainText.replace(/^\s*[-*+]\s+/gm, "");
    plainText = plainText.replace(/^\s*\d+\.\s+/gm, "");

    // Remove markdown headers (#, ##, ###, etc.) - Keep the header text? Or remove?
    // If the header is part of the section, maybe keep the text but remove #?
    // For TTS, usually you don't want the header title read out unless it's integrated
    // Let's remove the whole header line for simplicity for TTS
    plainText = plainText.replace(/^#+\s+.*$/gm, "");


    // Replace multiple newlines with at most two to preserve paragraphs
    plainText = plainText.replace(/\n{3,}/g, "\n\n");

    // Trim leading/trailing whitespace from lines and the whole text
    plainText = plainText.split('\n').map(line => line.trim()).join('\n').trim();


    return plainText;
  };


  // --- Audio Playback for a single section (used by "Play Audio" button) ---
  const handlePlayAudio = async (section, idx) => {
    // Check if audio already exists for this section
    if (audio[idx]) {
      // If audio exists, just play it
      const audioPlayer = document.getElementById(`audio-${idx}`);
      if (audioPlayer) {
        audioPlayer.play();
        return;
      }
    }

    // If audio doesn't exist, generate it
    setAudioLoading(prev => ({ ...prev, [idx]: true })); // Set loading for this section
    setError(""); // Clear general errors

    try {
      // Strip markdown from the section text for TTS
      let ttsText = stripMarkdown(section);

      if (!ttsText.trim()) {
        setError("No narratable text available for this section after stripping markdown.");
        console.warn(`Attempted to generate audio for empty text in section ${idx} after stripping.`);
        return; // Exit if no text remains
      }

      console.log(`Generating audio for section ${idx} (text length: ${ttsText.length})`);
      // Make POST request to the backend's TTS endpoint
      const res = await axios.post(
        `${BACKEND_URL}/tts`,
        { text: ttsText, voice, language, gameName }, // Send text, selected voice ID, language, and game name
        { responseType: "arraybuffer" } // Expect audio data as array buffer
      );

      // Create a Blob from the audio data and a URL for the Blob
      const blob = new Blob([res.data], { type: "audio/mpeg" });
      const url = URL.createObjectURL(blob);

      // Revoke previous Blob URL for this section if it exists to free up memory
      if (audio[idx]) {
        URL.revokeObjectURL(audio[idx]);
      }

      // Update audio state with the new Blob URL for this section
      setAudio(prev => ({ ...prev, [idx]: url }));

      console.log(`Audio generated and stored for section ${idx}. URL: ${url}`);
      // Optionally play the audio automatically after generation
      // const audioPlayer = document.getElementById(`audio-${idx}`);
      // if (audioPlayer) {
      //   audioPlayer.play();
      // }

    } catch (err) {
      console.error(`Error generating audio for section ${idx}:`, err);
      setError(err.response?.data?.error || `Failed to generate audio for section ${idx}.`);
    } finally {
      setAudioLoading(prev => ({ ...prev, [idx]: false })); // Turn off loading state for this section
    }
  };

  const goToStep = (stepId) => {
    if (completedStepIds.includes(stepId)) {
      setActiveStepId(stepId);
    }
  };

  const markStepCompleted = (stepId) => {
    setCompletedStepIds((prev) => (prev.includes(stepId) ? prev : [...prev, stepId]));
  };

  const advanceToNextStep = (currentStepId) => {
    const currentIndex = pipelineSteps.findIndex((s) => s.id === currentStepId);
    const next = pipelineSteps[currentIndex + 1];
    if (next) {
      setActiveStepId(next.id);
    }
  };

  const handleConfirmStep = async (stepId) => {
    const setAndAdvance = () => {
      markStepCompleted(stepId);
      advanceToNextStep(stepId);
    };

    switch (stepId) {
      case "project": {
        if (!rulebookText.trim()) {
          setError("Upload a rulebook PDF before continuing.");
          return;
        }
        if (!gameName.trim()) {
          setError("Enter a game name before continuing.");
          return;
        }

        if (!projectId.trim()) {
          setProjectId(createProjectIdFromFilename(file?.name || "rulebook.pdf"));
        }

        setError("");
        setAndAdvance();
        break;
      }
      case "metadata": {
        if (!rulebookText.trim()) {
          setError("Upload a PDF or paste rulebook text to continue.");
          return;
        }
        setError("");
        setAndAdvance();
        break;
      }
      case "ingestion": {
        if (!ingestionManifest) {
          setError("Run deterministic ingestion first.");
          return;
        }
        if (!hasValidComponentInventory(gameComponents)) {
          setError("Add at least one named physical component to the inventory before continuing.");
          return;
        }
        setError("");
        setAndAdvance();
        break;
      }
      case "images": {
        const hasLinked = Object.values(componentImageLinks || {}).some((links) => (links || []).length > 0);
        if (!hasLinked) {
          setError("Link at least one image to a component before confirming.");
          return;
        }
        setError("");
        setAndAdvance();
        break;
      }
      case "script": {
        if (!canConfirmScript) {
          setError("Enter or retain a trusted manual or source-complete generated script before confirming.");
          return;
        }
        setError("");
        setAndAdvance();
        break;
      }
      case "storyboard": {
        if (!storyboardManifest) {
          setError("Generate the storyboard to proceed.");
          return;
        }
        setError("");
        setAndAdvance();
        break;
      }
      case "voice": {
        if (!sections.length) {
          setError("Generate sectioned audio from the script before confirming.");
          return;
        }
        setError("");
        setAndAdvance();
        break;
      }
      case "render": {
        if (renderJobState?.status !== "completed") {
          setError("Start and finish a render job before final confirmation.");
          return;
        }
        setError("");
        markStepCompleted(stepId);
        break;
      }
      default:
        setAndAdvance();
    }
  };


  
  const effectiveScript = editedSummary.trim();
  const canConfirmScript = Boolean(effectiveScript)
    && isTrustedScriptProvenance(scriptProvenance);
  const scriptInputReadiness = getScriptInputReadiness({
    projectId,
    gameName,
    language,
    rulebookText,
    components: gameComponents,
  });

  // --- Rendered Output (JSX) ---
  return (
    <div style={{ maxWidth: "1200px", margin: "24px auto", fontFamily: "sans-serif", padding: 20 }}>
      <h1>Board Game Tutorial Generator</h1>
      <div className="pipeline-layout">
        <div className="pipeline-main">
          <PipelineStepper
            steps={pipelineSteps}
            activeStepId={activeStepId}
            completedStepIds={completedStepIds}
            onStepClick={goToStep}
            onConfirmStep={handleConfirmStep}
            canConfirmStep={(stepId) => stepId !== 'script' || canConfirmScript}
          />

          {error && (<div style={{ color: "red", marginBottom: 12 }}>{error}</div>)}

          {activeStepId === "project" && (
            <ProjectSetupStep
              projectId={projectId}
              setProjectId={setProjectId}
              gameName={gameName}
              setGameName={setGameName}
              language={language}
              setLanguage={setLanguage}
              voice={voice}
              setVoice={setVoice}
              getLanguageVoices={getLanguageVoices}
              detailPercentage={detailPercentage}
              setDetailPercentage={setDetailPercentage}
              file={file}
              rulebookText={rulebookText}
              onFileChange={handleFileChange}
              onDrop={handleDrop}
              extractingName={extractingName}
              loading={loading}
              metadata={metadata}
              setMetadata={setMetadata}
              bggUrl={bggUrl}
              onExtractGameInfo={() => extractGameInfoFromText({ operatorInitiated: true })}
              metadataWarning={metadataWarning}
            />
          )}

          {activeStepId === "metadata" && (
            <MetadataInputStep
              bggUrl={bggUrl}
              setBggUrl={setBggUrl}
              metadata={metadata}
              handleMetadataChange={handleMetadataChange}
              gameName={gameName}
              file={file}
              onLookupBgg={lookupBggMetadata}
              bggLookupLoading={bggLookupLoading}
              bggLookupWarning={metadataWarning}
            />
          )}

          {activeStepId === "ingestion" && (
            <IngestionReviewStep
              onRunIngestion={handleRunIngestion}
              ingesting={ingesting}
              rulebookText={rulebookText}
              ingestionManifest={ingestionManifest}
              ingestionError={ingestionError}
              gameName={gameName}
              gameComponents={gameComponents}
              componentExtraction={componentExtraction}
              setGameComponents={setGameComponents}
              onExtractComponents={handleExtractComponents}
              extractingComponents={extractingComponents}
            />
          )}

          {activeStepId === "images" && (
            <ImagesStep
              projectId={projectId}
              components={gameComponents}
              images={projectImages}
              componentImages={componentImageLinks}
              onImagesUpdated={({ images, componentImages }) => {
                setProjectImages(images || []);
                setComponentImageLinks(componentImages || {});
              }}
              gameName={gameName}
              bggUrl={bggUrl}
              pdfFile={file}
            />
          )}

          {activeStepId === "script" && (
            <ScriptStep
              loading={loading}
              projectId={projectId}
              rulebookText={rulebookText}
              gameName={gameName}
              language={language}
              components={gameComponents}
              scriptInputReadiness={scriptInputReadiness}
              onSummarize={handleSummarize}
              hasGeneratedScript={generatedScript}
              scriptProvenance={scriptProvenance}
              summary={summary}
              editedSummary={editedSummary}
              onEdit={handleSummaryEdit}
              onSave={handleSaveSummary}
              translationStatus={translationStatus}
              summaryWarning={summaryWarning}
              generationStatus={generationStatus}
              aiStatus={aiStatus}
              aiStatusLoading={aiStatusLoading}
              onRefreshAiStatus={refreshAiStatus}
            />
          )}

          {activeStepId === "storyboard" && (
            <StoryboardStep
              onGenerateStoryboard={handleGenerateStoryboard}
              storyboardManifest={storyboardManifest}
              storyboardError={storyboardError}
              storyboarding={storyboarding}
            />
          )}

          {activeStepId === "voice" && (
            <VoiceStep
              sections={sections}
              audio={audio}
              audioLoading={audioLoading}
              onPlayAudio={handlePlayAudio}
            />
          )}

          {activeStepId === "render" && (
            <RenderExportStep
              onStartRender={handleStartRender}
              renderJobState={renderJobState}
              renderJobError={renderJobError}
              renderJobLoading={renderJobLoading}
              backgroundMusicFile={backgroundMusicFile}
              setBackgroundMusicFile={setBackgroundMusicFile}
              backgroundMusicVolume={backgroundMusicVolume}
              setBackgroundMusicVolume={setBackgroundMusicVolume}
            />
          )}

          <div style={{ marginTop: 16, textAlign: 'right' }}>
            <button
              className="confirm-step-btn"
              onClick={() => handleConfirmStep(activeStepId)}
              disabled={activeStepId === 'script' && !canConfirmScript}
              style={{
                background: 'linear-gradient(90deg, #1565c0, #1976d2)',
                color: 'white',
                border: 'none',
                padding: '12px 24px',
                borderRadius: 8,
                fontSize: 15,
                fontWeight: 'bold',
                cursor: 'pointer',
                textTransform: 'uppercase'
              }}
            >
              Confirm {pipelineSteps.find(s => s.id === activeStepId)?.label} & Continue
            </button>
          </div>
        </div>

        <div className="pipeline-sidebar">
          <h3 style={{ marginTop: 0 }}>GENESIS controls</h3>
          <p className="pipeline-muted">Optional QA and campaign helpers.</p>
          {projectId.trim() ? (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
                <GenesisHealthPanel projectId={projectId.trim()} />
                <GenesisArtifactsPanel projectId={projectId.trim()} />
                <GenesisCampaignPanel projectId={projectId.trim()} />
              </div>
              <div style={{ margin: "12px 0" }}>
                <GenesisGoalsEditor projectId={projectId.trim()} />
              </div>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
                <GenesisAutoOptimizeButton projectId={projectId.trim()} />
                <GenesisQaReportButton projectId={projectId.trim()} />
                <GenesisDebugBundleButton projectId={projectId.trim()} />
                <GenesisInspector projectId={projectId.trim()} />
              </div>
              <GenesisFeedbackPanel projectId={projectId.trim()} />
            </>
          ) : (
            <p className="pipeline-muted">Enter a project ID to view GENESIS health, artifacts, and feedback.</p>
          )}
        </div>
      </div>

      {showThemePrompt && (
        <div
          style={{
            position: "fixed",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            background: "#fff",
            padding: 30,
            borderRadius: 8,
            boxShadow: "0 0 20px rgba(0,0,0,0.5)",
            zIndex: 1000,
            minWidth: 300,
            maxWidth: 400,
            textAlign: "center",
          }}
        >
          <h3>Game Theme Required</h3>
          <p>The theme could not be automatically detected. Please enter the game's theme to continue:</p>
          <input
            type="text"
            value={metadata.theme}
            onChange={(e) => handleMetadataChange("theme", e.target.value)}
            placeholder="e.g., Deep-sea Adventure"
            style={{ width: "calc(100% - 22px)", marginBottom: 15, padding: 10 }}
          />
          <button
            onClick={handleThemeSubmit}
            style={{ padding: "10px 20px", background: "#1976d2", color: "#fff", border: "none", borderRadius: 4 }}
          >
            Submit Theme
          </button>
        </div>
      )}
    </div>
  );
}

export default App;