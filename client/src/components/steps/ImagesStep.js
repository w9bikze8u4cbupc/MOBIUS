import React, { useEffect, useMemo, useState, useCallback } from "react";
import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL !== undefined 
  ? process.env.REACT_APP_BACKEND_URL 
  : '';
const EMPTY_COMPONENTS = [];
const EMPTY_IMAGES = [];
const EMPTY_COMPONENT_IMAGES = {};

const getImageUrl = (projectId, image) => {
  if (!image) return null;
  if (image.originalUrl) return image.originalUrl;
  if (image.localUrl) return `${BACKEND_URL}${image.localUrl}`;
  if (image.fileKey || image.source === 'rulebook' || image.source === 'manual' || image.source === 'ai-crop' || image.source === 'native-pdf' || image.source === 'ai-component-crop' || image.source === 'hephaestus') {
    return `${BACKEND_URL}/api/projects/${projectId}/images/${image.id}/file`;
  }
  return null;
};

const getImageThumbnailUrl = (projectId, image) => {
  if (image?.thumbnailUrl) return `${BACKEND_URL}${image.thumbnailUrl}`;
  if (image?.thumbnailKey) {
    return `${BACKEND_URL}/api/projects/${projectId}/images/${image.id}/file?variant=thumbnail`;
  }
  return getImageUrl(projectId, image);
};

const normalizeVisualType = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  const aliases = {
    boards: 'board', cards: 'card', tiles: 'tile', tokens: 'token',
    markers: 'marker', dice: 'dice', currencies: 'currency', pearls: 'currency',
  };
  return aliases[normalized] || normalized;
};

const imageMatchesComponentVisualType = (component, image) => {
  const componentType = normalizeVisualType(component?.category);
  const imageType = normalizeVisualType(image?.metadata?.classification || image?.type);
  // Do not filter free-form or unknown component classes; all choices still require
  // explicit operator confirmation before they become a component link.
  if (!componentType || componentType === 'other' || !imageType || imageType === 'other') return true;
  return componentType === imageType;
};

const isMatchableComponent = (component) => {
  const name = String(component?.name || '').trim();
  const folded = name.toLowerCase();
  if (!name || component?.matchEligible === false || component?.eligibility === 'excluded') return false;
  const isCanonicalSetupRecord = component?.eligibility === 'setup'
    && component?.inferenceReason === 'Setup-derived physical object; confirm this component before matching.';
  if (component?.reviewRequired === true && !isCanonicalSetupRecord) return false;
  if (/^(?:card|tile|token|track|board|marker|other)s?$/i.test(name)) return false;
  if (/^(?:place|shuffle|turn|then|take|form|put|draw|move|each|randomly)\b/i.test(name)) return false;
  if (/\b(?:front|back|court|council|exploration track|threat track)\b/i.test(name)) return false;
  if (/^(?:merchant\s+)?lord of the lords?$/i.test(name)) return false;
  if (name.split(/\s+/).length > 6 || /[.!?]/.test(name)) return false;
  const letters = name.replace(/[^A-Za-z]/g, '');
  if (letters.length > 2 && letters === letters.toUpperCase()) return false;
  if (/\btracks?\b/i.test(name)) return false;
  return /\b(?:boards?|cards?|tokens?|tiles?|dice|markers?|miniatures?|meeples?|pawns?|standees?|coins?|currency|pearls?|cups?|lords?|locations?)\b/i.test(name)
    && !/^(?:unknown|component|item|none|null)$/.test(folded);
};

// eslint-disable-next-line no-unused-vars
const getSourceLabel = (source) => {
  const labels = {
    'rulebook': 'Rulebook Page',
    'native-pdf': 'Embedded Image',
    'ai-crop': 'AI Detected',
    'ai-component-crop': 'AI Component',
    'bgg': 'BoardGameGeek',
    'manual': 'Manual Upload',
    'bgg-components': 'BGG Components',
    'web-search': 'Web Search',
    'hephaestus': 'HEPHAESTUS'
  };
  return labels[source] || source;
};

// eslint-disable-next-line no-unused-vars
const getSourceColor = (source) => {
  const colors = {
    'rulebook': '#2196f3',
    'native-pdf': '#4caf50',
    'ai-crop': '#9c27b0',
    'ai-component-crop': '#9c27b0',
    'bgg': '#ff9800',
    'manual': '#673ab7',
    'bgg-components': '#ff5722',
    'web-search': '#00bcd4',
    'hephaestus': '#f44336'
  };
  return colors[source] || '#757575';
};

export function ImagesStep({ 
  projectId, 
  components = EMPTY_COMPONENTS,
  images = EMPTY_IMAGES,
  componentImages = EMPTY_COMPONENT_IMAGES,
  imageReviewSummary = null,
  imageReviewStatus = null,
  onImagesUpdated,
  onSourcePdfUpdated,
  gameName = '',
  bggUrl = '',
  pdfFile = null,
  sourcePdf = null
}) {
  const [loading, setLoading] = useState(false);
  const [autoGatherStatus, setAutoGatherStatus] = useState(null);
  const [matchingStatus, setMatchingStatus] = useState(null);
  const [matchingCandidates, setMatchingCandidates] = useState({});
  const [croppingStatus, setCroppingStatus] = useState(null);
  const [manualBggUrl, setManualBggUrl] = useState(bggUrl || "");
  const [manualPdfPath, setManualPdfPath] = useState("");
  const [manualFile, setManualFile] = useState(null);
  const [localImages, setLocalImages] = useState(images);
  const [localLinks, setLocalLinks] = useState(componentImages || {});
  const matchingComponents = useMemo(() => (components || []).filter(isMatchableComponent), [components]);
  const [selectedComponent, setSelectedComponent] = useState(null);
  const [expandedSources, setExpandedSources] = useState({});
  const [feedbackMode, setFeedbackMode] = useState(false);
  const [feedbackStatus, setFeedbackStatus] = useState({});
  const [hephaestusStatus, setHephaestusStatus] = useState(null);
  const [recurationStatus, setRecurationStatus] = useState(null);
  const [readinessError, setReadinessError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [previewImageId, setPreviewImageId] = useState(null);
  const [previewComponentId, setPreviewComponentId] = useState(null);
  const [showAllCandidates, setShowAllCandidates] = useState({});
  const [contextualRenderStatus, setContextualRenderStatus] = useState(null);

  const normalizedProjectId = String(projectId || '').trim();
  const sourceStatus = sourcePdf?.status || (pdfFile ? 'pending_contextual_render' : 'legacy_adoption_required');
  const sourceIsUsable = Boolean(pdfFile) || (Boolean(sourcePdf?.sourceId)
    && ['available', 'pending_contextual_render'].includes(sourceStatus));
  const imageActionsReady = Boolean(normalizedProjectId && sourceIsUsable);
  const sourceReadinessMessage = sourceStatus === 'available'
    ? 'Source PDF available.'
    : sourceStatus === 'pending_contextual_render'
      ? 'Source PDF pending contextual render.'
      : sourceStatus === 'tampered' || sourceStatus === 'missing'
        ? 'Source PDF missing/tampered; contextual evidence is blocked.'
        : 'Legacy project requires explicit adoption.';
  const readinessMessages = [
    !normalizedProjectId && 'Project identifier is missing. Return to Project Setup and enter or generate a Project ID.',
    !sourceIsUsable && sourceReadinessMessage,
  ].filter(Boolean);

  useEffect(() => {
    setLocalImages(images || []);
  }, [images]);

  useEffect(() => {
    setLocalLinks(componentImages || {});
  }, [componentImages]);

  useEffect(() => {
    if (!normalizedProjectId) return;
    const load = async () => {
      try {
        const res = await axios.get(`${BACKEND_URL}/api/projects/${normalizedProjectId}/images`);
        onImagesUpdated?.(res.data || {});
      } catch (err) {
        console.error("Failed to load images", err);
      }
    };
    load();
  }, [normalizedProjectId, onImagesUpdated]);

  const curatedImages = useMemo(() => (localImages || []).filter((image) => {
    const curation = image.curation || image.metadata?.curation;
    return image.source !== 'hephaestus' || curation?.candidate !== false;
  }), [localImages]);
  const rawHephaestusImages = useMemo(() => (localImages || []).filter((image) => image.source === 'hephaestus'), [localImages]);
  const reviewSummary = useMemo(() => imageReviewSummary || {
    curatedCandidateCount: curatedImages.length,
    approvedLinkCount: Object.values(localLinks || {}).reduce((count, links) => count + new Set(Array.isArray(links) ? links : []).size, 0),
    unresolvedComponentCount: matchingComponents.filter((component) => !(localLinks?.[component.id] || []).length).length,
  }, [curatedImages.length, imageReviewSummary, localLinks, matchingComponents]);

  const groupedImages = useMemo(() => {
    return curatedImages.reduce((acc, img) => {
      const bucket = img.source || "unknown";
      acc[bucket] = acc[bucket] || [];
      acc[bucket].push(img);
      return acc;
    }, {});
  }, [curatedImages]);

  const refreshState = (payload) => {
    setLocalImages(payload.images || []);
    setLocalLinks(payload.componentImages || {});
    onImagesUpdated?.(payload);
  };

  const handleRenderContextualEvidence = async () => {
    if (!normalizedProjectId || !sourcePdf?.sourceId || sourceStatus !== 'pending_contextual_render') return;
    setContextualRenderStatus({ status: 'rendering', message: 'Rendering verified contextual rulebook pages...' });
    try {
      const { data } = await axios.post(`${BACKEND_URL}/api/projects/${normalizedProjectId}/contextual-evidence/render`);
      if (!data?.contextualEvidence?.available) throw new Error('Contextual evidence was not confirmed.');
      onSourcePdfUpdated?.({ ...sourcePdf, status: 'available' });
      setContextualRenderStatus({ status: 'complete', message: 'Contextual rulebook evidence is available.' });
    } catch (error) {
      setContextualRenderStatus({ status: 'error', message: error.response?.data?.error || 'Contextual rulebook rendering could not complete.' });
    }
  };

  // Canonical local image gathering: HEPHAESTUS uses the PyMuPDF path and never falls back to legacy rendering.
  const handleAutoGather = async () => {
    if (!normalizedProjectId) {
      setReadinessError('Project identifier is missing. Return to Project Setup and enter or generate a Project ID.');
      return;
    }
    if (!sourceIsUsable) {
      setReadinessError(sourceReadinessMessage);
      return;
    }

    setReadinessError('');
    setLoading(true);
    setAutoGatherStatus({ status: 'gathering', message: 'Running local HEPHAESTUS extraction...' });
    try {
      const formData = new FormData();
      if (pdfFile) formData.append('file', pdfFile);
      formData.append('minWidth', '1');
      formData.append('minHeight', '1');
      const { data } = await axios.post(
        `${BACKEND_URL}/api/projects/${normalizedProjectId}/images/extract-hephaestus`,
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } },
      );

      refreshState(data || {});
      const count = data?.imagesCount ?? data?.images?.length ?? 0;
      setAutoGatherStatus({
        status: 'complete',
        message: `Extracted ${count} local images using HEPHAESTUS.`,
        sources: [{ source: 'hephaestus', count }],
      });
    } catch (err) {
      console.warn('Local HEPHAESTUS extraction failed:', err?.message || 'unknown error');
      setAutoGatherStatus({
        status: 'error',
        message: err.response?.data?.error || 'Local HEPHAESTUS extraction failed. Check the server diagnostic and try again.',
      });
    } finally {
      setLoading(false);
    }
  };

  // NEW: Multi-stage pipeline for component detection (CV + OCR + LLM)
  const handleDetectComponents = async (forceRetry = false) => {
    if (!projectId) return;
    if (loading) return;
    
    const rulebookImages = localImages.filter(img => img.source === 'rulebook');
    if (rulebookImages.length === 0) {
      setCroppingStatus({ 
        status: 'error', 
        message: 'No rulebook pages found. Click "Auto-Gather All Images" first to extract pages from the PDF.' 
      });
      return;
    }
    
    if (!components || components.length === 0) {
      setCroppingStatus({ 
        status: 'warning', 
        message: 'No components found. Go to Step 3 to extract game components first, then return here to detect images.' 
      });
      return;
    }
    
    setLoading(true);
    setCroppingStatus({ 
      status: 'cropping', 
      message: `Running multi-stage pipeline on ${rulebookImages.length} pages for ${components.length} components...` 
    });
    
    try {
      const res = await axios.post(`${BACKEND_URL}/api/projects/${normalizedProjectId}/images/detect-components`, {
        components: components.map(c => ({
          name: c.name,
          category: c.category,
          quantity: c.quantity,
          details: c.details
        })),
        force: forceRetry
      });
      
      if (res.data?.images) {
        refreshState(res.data);
      }
      
      if (res.data.cropsCount > 0) {
        const stats = res.data.stats || {};
        const highConf = stats.highConfidence || 0;
        const needsReview = stats.needsReview || 0;
        const missing = stats.componentsMissing?.length || 0;
        
        let statusMessage = `Found ${res.data.cropsCount} component images!`;
        if (highConf > 0) statusMessage += ` (${highConf} high confidence)`;
        if (needsReview > 0) statusMessage += ` (${needsReview} need review)`;
        if (missing > 0) statusMessage += ` Missing: ${stats.componentsMissing.join(', ')}`;
        
        setCroppingStatus({
          status: 'complete',
          message: statusMessage,
          stats: stats
        });
      } else {
        setCroppingStatus({
          status: 'warning',
          message: 'No component photos detected. The rulebook may use illustrations rather than photos.'
        });
      }
    } catch (err) {
      console.error('Component detection failed:', err);
      const errorData = err.response?.data || {};
      if (errorData.inProgress) {
        setCroppingStatus({ 
          status: 'stuck', 
          message: `Pipeline in progress. Click "Force Retry" to restart.`,
          canForce: true
        });
      } else {
        setCroppingStatus({ 
          status: 'error', 
          message: errorData.error || 'Failed to detect components' 
        });
      }
    } finally {
      setLoading(false);
    }
  };

  // Legacy: AI-powered component cropping (single-pass method)
  const handleCropComponents = async (forceRetry = false) => {
    if (!projectId) return;
    if (loading) return;
    
    const rulebookImages = localImages.filter(img => img.source === 'rulebook');
    if (rulebookImages.length === 0) {
      setCroppingStatus({ 
        status: 'error', 
        message: 'No rulebook pages found. Click "Auto-Gather All Images" first to extract pages from the PDF.' 
      });
      return;
    }
    
    if (!components || components.length === 0) {
      setCroppingStatus({ 
        status: 'warning', 
        message: 'No components found. Go to Step 3 to extract game components first, then return here to crop images.' 
      });
      return;
    }
    
    setLoading(true);
    setCroppingStatus({ 
      status: 'cropping', 
      message: `Searching ${rulebookImages.length} pages for ${components.length} component photos...` 
    });
    
    try {
      const res = await axios.post(`${BACKEND_URL}/api/projects/${normalizedProjectId}/images/crop-components`, {
        components: components.map(c => ({
          name: c.name,
          category: c.category,
          quantity: c.quantity,
          details: c.details
        })),
        force: forceRetry
      });
      
      if (res.data?.images) {
        refreshState(res.data);
      }
      
      if (res.data.cropsCount > 0) {
        setCroppingStatus({
          status: 'complete',
          message: res.data.message || `Found ${res.data.cropsCount} component images!`
        });
      } else {
        setCroppingStatus({
          status: 'warning',
          message: 'No distinct component images detected. The rulebook may use embedded graphics rather than photos.'
        });
      }
    } catch (err) {
      console.error('Component cropping failed:', err);
      const errorData = err.response?.data || {};
      if (errorData.inProgress) {
        setCroppingStatus({ 
          status: 'stuck', 
          message: `Detection in progress (${errorData.elapsedSeconds || '?'}s). Click "Force Retry" if stuck.`,
          canForce: true
        });
      } else {
        setCroppingStatus({ 
          status: 'error', 
          message: errorData.error || 'Failed to detect components in images' 
        });
      }
    } finally {
      setLoading(false);
    }
  };

  // Deterministic component-to-image matching; suggestions remain operator review only.
  const handleAutoMatch = async () => {
    if (!projectId || localImages.length === 0 || matchingComponents.length === 0) return;
    setLoading(true);
    setMatchingStatus({ status: 'matching', message: 'Matching strict physical components using deterministic evidence...' });
    
    try {
      const res = await axios.post(`${BACKEND_URL}/api/projects/${normalizedProjectId}/images/auto-match`, {
        components: matchingComponents,
        gameName
      });
      
      refreshState(res.data || {});
      setMatchingCandidates(res.data?.candidates || {});
      
      const stats = res.data.stats || {};
      const matched = res.data.matched || 0;
      const total = stats.total || matchingComponents.length;
      const ruleMatched = stats.ruleMatched || 0;
      
      let message = `Automatically linked ${matched}/${total} components at 90% or higher`;
      if (ruleMatched > 0) {
        message += ` (${ruleMatched} by deterministic rules)`;
      }
      if (stats.unmatched > 0) {
        message += `. ${stats.unmatched} have review suggestions only.`;
      }
      
      setMatchingStatus({
        status: matched === total ? 'complete' : 'partial',
        message,
        stats
      });
    } catch (err) {
      console.error('Auto-match failed:', err);
      setMatchingStatus({ 
        status: 'error', 
        message: err.response?.data?.error || 'Failed to match components' 
      });
    } finally {
      setLoading(false);
    }
  };

  const handleFetchBgg = async () => {
    if (!projectId || !manualBggUrl) return;
    setLoading(true);
    try {
      const res = await axios.post(`${BACKEND_URL}/api/projects/${normalizedProjectId}/images/fetch-bgg`, { bggUrl: manualBggUrl });
      refreshState(res.data || {});
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleExtractRulebook = async () => {
    if (!projectId || !manualPdfPath) return;
    setLoading(true);
    try {
      const res = await axios.post(`${BACKEND_URL}/api/projects/${normalizedProjectId}/images/extract-rulebook`, { pdfPath: manualPdfPath });
      refreshState(res.data || {});
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleManualUpload = async () => {
    if (!projectId || !manualFile) return;
    setLoading(true);
    try {
      const form = new FormData();
      form.append("file", manualFile);
      const res = await axios.post(`${BACKEND_URL}/api/projects/${normalizedProjectId}/images/manual`, form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      refreshState(res.data || {});
      setManualFile(null);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleHephaestusExtract = async () => {
    if (!normalizedProjectId) {
      setReadinessError('Project identifier is missing. Return to Project Setup and enter or generate a Project ID.');
      return;
    }
    if (!sourceIsUsable) {
      setReadinessError(sourceReadinessMessage);
      return;
    }
    setReadinessError("");
    setLoading(true);
    setHephaestusStatus({ status: 'extracting', message: 'Running HEPHAESTUS extraction pipeline...' });
    
    try {
      const formData = new FormData();
      if (pdfFile) formData.append('file', pdfFile);
      formData.append('minWidth', '1');
      formData.append('minHeight', '1');
      
      const res = await axios.post(
        `${BACKEND_URL}/api/projects/${normalizedProjectId}/images/extract-hephaestus`,
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } }
      );
      
      refreshState(res.data || {});
      
      const count = res.data?.imagesCount || 0;
      const stats = res.data?.stats || {};
      setHephaestusStatus({
        status: 'complete',
        message: `Extracted ${count} component images using HEPHAESTUS`,
        stats
      });
    } catch (err) {
      console.error('HEPHAESTUS extraction failed:', err);
      setHephaestusStatus({ 
        status: 'error', 
        message: err.response?.data?.error || 'HEPHAESTUS extraction failed' 
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRecurateHephaestus = async () => {
    if (!normalizedProjectId || rawHephaestusImages.length === 0 || loading) return;
    setLoading(true);
    setRecurationStatus({ status: 'running', message: 'Re-curating stored HEPHAESTUS assets…' });
    try {
      const { data } = await axios.post(`${BACKEND_URL}/api/projects/${normalizedProjectId}/images/recurate-hephaestus`);
      refreshState(data || {});
      const stats = data?.stats || {};
      setRecurationStatus({
        status: 'complete',
        message: `Re-curated ${stats.rawCount || 0} stored HEPHAESTUS assets. ${stats.curatedCount || 0} canonical candidates remain after ${stats.duplicateCount || 0} exact duplicates were suppressed.`,
      });
    } catch (error) {
      setRecurationStatus({ status: 'error', message: error.response?.data?.error || 'HEPHAESTUS re-curation failed.' });
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveLink = async (componentId, imageId) => {
    if (!projectId || !componentId || !imageId) return;
    const next = new Set(localLinks[componentId] || []);
    if (!next.has(imageId)) return;
    next.delete(imageId);
    try {
      const res = await axios.post(`${BACKEND_URL}/api/projects/${normalizedProjectId}/components/${componentId}/images`, {
        imageIds: Array.from(next),
        manualImageIds: [],
      });
      refreshState(res.data || {});
    } catch (err) {
      console.error(err);
    }
  };

  const handleRepresentativeLink = async (componentId, imageId) => {
    if (!projectId || !componentId || !imageId) return;
    const next = new Set(localLinks[componentId] || []);
    next.add(imageId);
    try {
      const res = await axios.post(`${BACKEND_URL}/api/projects/${normalizedProjectId}/components/${componentId}/images`, {
        imageIds: Array.from(next),
        manualImageIds: [imageId],
      });
      refreshState(res.data || {});
    } catch (err) {
      console.error(err);
    }
  };

  const toggleSourceExpand = (source) => {
    setExpandedSources(prev => ({ ...prev, [source]: !prev[source] }));
  };

  const getLinkedImagesCount = (componentId) => {
    return (localLinks[componentId] || []).length;
  };

  const handleFeedback = async (component, imageId, isCorrect, correctedImageId = null) => {
    if (!projectId) return;
    
    const image = localImages.find(img => img.id === imageId);
    if (!image) return;
    
    try {
      await axios.post(`${BACKEND_URL}/api/projects/${normalizedProjectId}/match-feedback`, {
        gameName,
        componentId: component.id,
        componentName: component.name,
        componentCategory: component.category,
        imageId,
        imageTags: image.tags || [],
        imageSource: image.source,
        isCorrect,
        correctedImageId,
      });
      
      setFeedbackStatus(prev => ({
        ...prev,
        [`${component.id}-${imageId}`]: isCorrect ? 'confirmed' : 'rejected'
      }));
    } catch (err) {
      console.error('Failed to save feedback:', err);
    }
  };

  const getImageById = useCallback((imageId) => {
    return localImages.find(img => img.id === imageId);
  }, [localImages]);

  const getCategoryIcon = (category) => {
    const icons = {
      cards: '🃏',
      card: '🃏',
      tokens: '🔘',
      token: '🔘',
      boards: '🎲',
      board: '🎲',
      tiles: '🧩',
      tile: '🧩',
      dice: '🎯',
      meeples: '👤',
      miniatures: '🏰',
      markers: '📍',
      cubes: '🟦',
      other: '📦'
    };
    return icons[category] || '📦';
  };

  return (
    <div className="pipeline-section">
      <style>{`
        .image-thumbnail-btn {
          transition: transform 0.2s ease, z-index 0s;
          position: relative;
        }
        .image-thumbnail-btn:hover {
          transform: scale(2.5);
          z-index: 100;
          box-shadow: 0 8px 24px rgba(0,0,0,0.3);
        }
      `}</style>
      <h3>Images</h3>
      <p className="pipeline-muted">
        Gather images from the PDF rulebook, BoardGameGeek, and other sources. 
        Then match them to your game components for the tutorial.
      </p>
      <section
        aria-label="Image storyboard review summary"
        style={{ marginBottom: 20, padding: 14, borderRadius: 8, background: '#fff8e1', border: '1px solid #f0c36d', fontSize: 14 }}
      >
        <strong>{reviewSummary.curatedCandidateCount || 0} curated candidates / {reviewSummary.approvedLinkCount || 0} approved links / {reviewSummary.unresolvedComponentCount || 0} components awaiting storyboard review</strong>
        {reviewSummary.approvedLinkCount === 0 && <p style={{ margin: '8px 0 0' }}>No component links have been approved yet. Nothing will be selected automatically to satisfy this workflow step.</p>}
        <p style={{ margin: '8px 0 0' }}>The next review gate is Storyboard, where intent-specific visual selection and contextual rulebook pages are available. Voice and release rendering remain blocked until required scene coverage is resolved or explicitly documented.</p>
        {imageReviewStatus?.status === 'pending_visual_storyboard_review' && <p style={{ margin: '8px 0 0' }}>Images have been handed off for scene-by-scene storyboard review; this is not visual-coverage approval.</p>}
      </section>

      {/* Image extraction readiness */}
      <div
        role="status"
        aria-label="Image extraction readiness"
        style={{
          marginBottom: 20,
          padding: 14,
          borderRadius: 8,
          background: imageActionsReady ? '#e8f5e9' : '#fff3e0',
          border: `1px solid ${imageActionsReady ? '#81c784' : '#ffb74d'}`,
          fontSize: 14,
        }}
      >
        <div><strong>Image extraction readiness</strong></div>
        <div>Project ID: {normalizedProjectId || 'Missing'}</div>
        <div><strong>{sourceReadinessMessage}</strong></div>
        {sourcePdf?.filename && <div>Stored source: {sourcePdf.filename} ({sourcePdf.pageCount} page{sourcePdf.pageCount === 1 ? '' : 's'})</div>}
        {!imageActionsReady && (
          <div role="alert" style={{ marginTop: 6, color: '#a44a00' }}>
            {readinessError || readinessMessages.join(' ')}
          </div>
        )}
        {readinessError && imageActionsReady && (
          <div role="alert" style={{ marginTop: 6, color: '#b71c1c' }}>{readinessError}</div>
        )}
        {sourceStatus === 'pending_contextual_render' && sourcePdf?.sourceId && (
          <div style={{ marginTop: 10 }}>
            <button type="button" onClick={handleRenderContextualEvidence} disabled={contextualRenderStatus?.status === 'rendering'}>
              {contextualRenderStatus?.status === 'rendering' ? 'Rendering contextual evidence...' : 'Render contextual evidence'}
            </button>
            {contextualRenderStatus && (
              <div role={contextualRenderStatus.status === 'error' ? 'alert' : 'status'} style={{ marginTop: 6, color: contextualRenderStatus.status === 'error' ? '#b71c1c' : '#2e7d32' }}>
                {contextualRenderStatus.message}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Auto-gather section */}
      <div style={{ 
        background: 'linear-gradient(135deg, #e3f2fd 0%, #bbdefb 100%)', 
        padding: 20, 
        borderRadius: 12, 
        marginBottom: 20 
      }}>
        <h4 style={{ margin: '0 0 12px 0', color: '#1565c0' }}>
          Automatic Image Collection
        </h4>
        <p style={{ margin: '0 0 16px 0', color: '#555', fontSize: 14 }}>
          Click the button below to extract local rulebook images with HEPHAESTUS (PyMuPDF). No external image sources are queried.
        </p>
        
        <button 
          onClick={handleAutoGather} 
          disabled={loading || !imageActionsReady}
          style={{
            padding: '12px 24px',
            fontSize: 16,
            fontWeight: 'bold',
            background: loading ? '#90caf9' : !imageActionsReady ? '#90a4ae' : '#1976d2',
            color: 'white',
            border: 'none',
            borderRadius: 8,
            cursor: loading ? 'wait' : !imageActionsReady ? 'not-allowed' : 'pointer',
            opacity: imageActionsReady ? 1 : 0.6,
            display: 'flex',
            alignItems: 'center',
            gap: 8
          }}
        >
          {loading && autoGatherStatus?.status === 'gathering' ? (
            <>
              <span className="loading-spinner" style={{ width: 20, height: 20 }}></span>
              Gathering Images...
            </>
          ) : (
            <>📷 Auto-Gather All Images</>
          )}
        </button>
        
        {!imageActionsReady && (
          <p style={{ margin: '10px 0 0', color: '#7a4b00', fontSize: 13 }}>
            Auto-Gather is unavailable until both a Project ID and a verified stored source PDF are available.
          </p>
        )}
        {rawHephaestusImages.length > 0 && (
          <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid #90caf9' }}>
            <strong>Improve existing HEPHAESTUS review</strong>
            <p style={{ margin: '6px 0 10px', color: '#555', fontSize: 13 }}>
              Re-curation groups exact pixel duplicates before storyboard review. It preserves stored files and manual component links; it does not create or approve any association.
            </p>
            <button type="button" onClick={handleRecurateHephaestus} disabled={loading}>
              {loading && recurationStatus?.status === 'running' ? 'Re-curating HEPHAESTUS assets…' : 'Re-curate existing HEPHAESTUS assets'}
            </button>
            {recurationStatus && <div role={recurationStatus.status === 'error' ? 'alert' : 'status'} style={{ marginTop: 8, color: recurationStatus.status === 'error' ? '#b71c1c' : '#1b5e20', fontSize: 13 }}>{recurationStatus.message}</div>}
          </div>
        )}
        {autoGatherStatus && (
          <div style={{ 
            marginTop: 12, 
            padding: 12, 
            background: autoGatherStatus.status === 'error' ? '#ffebee' : '#e8f5e9',
            borderRadius: 8,
            fontSize: 14
          }}>
            <strong>{autoGatherStatus.status === 'error' ? '❌' : '✅'}</strong> {autoGatherStatus.message}
            {autoGatherStatus.sources && autoGatherStatus.sources.length > 0 && (
              <div style={{ marginTop: 8 }}>
                {autoGatherStatus.sources.map((s, i) => (
                  <span key={i} style={{ 
                    display: 'inline-block',
                    background: '#c8e6c9',
                    padding: '2px 8px',
                    borderRadius: 4,
                    marginRight: 8,
                    fontSize: 12
                  }}>
                    {s.source}: {s.count} images
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* AI Component Detection Section - Multi-Stage Pipeline */}
      {localImages.filter(img => img.source === 'rulebook').length > 0 && (
        <div style={{ 
          background: 'linear-gradient(135deg, #e8f5e9 0%, #c8e6c9 100%)', 
          padding: 20, 
          borderRadius: 12, 
          marginBottom: 20,
          border: '2px solid #4caf50'
        }}>
          <h4 style={{ margin: '0 0 8px 0', color: '#2e7d32' }}>
            Smart Component Detection (Recommended)
          </h4>
          <p style={{ margin: '0 0 16px 0', color: '#555', fontSize: 14 }}>
            Multi-stage AI pipeline: Page triage → CV region detection → Photo classification → OCR matching.
            More accurate than single-pass detection.
          </p>
          
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <button 
              onClick={() => handleDetectComponents(false)} 
              disabled={loading}
              style={{
                padding: '12px 24px',
                fontSize: 16,
                fontWeight: 'bold',
                background: loading && croppingStatus?.status === 'cropping' ? '#81c784' : '#4caf50',
                color: 'white',
                border: 'none',
                borderRadius: 8,
                cursor: loading ? 'wait' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 8
              }}
            >
              {loading && croppingStatus?.status === 'cropping' ? (
                <>
                  <span className="loading-spinner" style={{ width: 20, height: 20 }}></span>
                  Running Pipeline...
                </>
              ) : (
                <>Detect Component Images</>
              )}
            </button>
            
            {croppingStatus?.canForce && (
              <button 
                onClick={() => handleDetectComponents(true)} 
                disabled={loading}
                style={{
                  padding: '12px 24px',
                  fontSize: 16,
                  fontWeight: 'bold',
                  background: '#ff5722',
                  color: 'white',
                  border: 'none',
                  borderRadius: 8,
                  cursor: loading ? 'wait' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8
                }}
              >
                Force Retry
              </button>
            )}
          </div>
          
          {croppingStatus && (
            <div style={{ 
              marginTop: 12, 
              padding: 12, 
              background: croppingStatus.status === 'error' ? '#ffebee' : 
                         croppingStatus.status === 'warning' ? '#fff8e1' : 
                         croppingStatus.status === 'stuck' ? '#fff3e0' :
                         croppingStatus.status === 'cropping' ? '#e8f5e9' : '#e8f5e9',
              borderRadius: 8,
              fontSize: 14
            }}>
              <strong>
                {croppingStatus.status === 'error' ? '' : 
                 croppingStatus.status === 'warning' ? '' : 
                 croppingStatus.status === 'stuck' ? '' :
                 croppingStatus.status === 'cropping' ? '' : ''}
              </strong> {croppingStatus.message}
              
              {croppingStatus.stats && (
                <div style={{ marginTop: 8, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  {croppingStatus.stats.highConfidence > 0 && (
                    <span style={{ background: '#c8e6c9', padding: '2px 8px', borderRadius: 4, fontSize: 12 }}>
                      High confidence: {croppingStatus.stats.highConfidence}
                    </span>
                  )}
                  {croppingStatus.stats.needsReview > 0 && (
                    <span style={{ background: '#fff9c4', padding: '2px 8px', borderRadius: 4, fontSize: 12 }}>
                      Needs review: {croppingStatus.stats.needsReview}
                    </span>
                  )}
                  {croppingStatus.stats.pagesAnalyzed && (
                    <span style={{ background: '#e3f2fd', padding: '2px 8px', borderRadius: 4, fontSize: 12 }}>
                      Pages analyzed: {croppingStatus.stats.pagesAnalyzed}
                    </span>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* HEPHAESTUS: PyMuPDF-based Component Extraction */}
      <div style={{
          background: 'linear-gradient(135deg, #ffebee 0%, #ffcdd2 100%)', 
          padding: 20, 
          borderRadius: 12, 
          marginBottom: 20,
          border: '2px solid #f44336'
        }}>
          <h4 style={{ margin: '0 0 8px 0', color: '#c62828' }}>
            HEPHAESTUS Extraction (Recommended for PDFs)
          </h4>
          <p style={{ margin: '0 0 16px 0', color: '#555', fontSize: 14 }}>
            Advanced PyMuPDF-based extraction with hybrid classification and perceptual deduplication.
            Directly extracts embedded images from PDF with smart component detection.
          </p>
          {!imageActionsReady && (
            <p style={{ margin: '-8px 0 16px', color: '#7a1c1c', fontSize: 13 }}>
              HEPHAESTUS is unavailable until both a Project ID and a verified stored source PDF are available.
            </p>
          )}
          
          <button 
            onClick={handleHephaestusExtract} 
            disabled={loading || !imageActionsReady}
            style={{
              padding: '12px 24px',
              fontSize: 16,
              fontWeight: 'bold',
              background: loading && hephaestusStatus?.status === 'extracting' ? '#ef9a9a' : !imageActionsReady ? '#b0bec5' : '#f44336',
              color: 'white',
              border: 'none',
              borderRadius: 8,
              cursor: loading ? 'wait' : !imageActionsReady ? 'not-allowed' : 'pointer',
              opacity: imageActionsReady ? 1 : 0.6,
              display: 'flex',
              alignItems: 'center',
              gap: 8
            }}
          >
            {loading && hephaestusStatus?.status === 'extracting' ? (
              <>
                <span className="loading-spinner" style={{ width: 20, height: 20 }}></span>
                Running HEPHAESTUS...
              </>
            ) : (
              <>Extract with HEPHAESTUS</>
            )}
          </button>
          
          {hephaestusStatus && (
            <div style={{ 
              marginTop: 12, 
              padding: 12, 
              background: hephaestusStatus.status === 'error' ? '#ffebee' : 
                         hephaestusStatus.status === 'extracting' ? '#fff3e0' : '#e8f5e9',
              borderRadius: 8,
              fontSize: 14
            }}>
              <strong>
                {hephaestusStatus.status === 'error' ? 'Error: ' : 
                 hephaestusStatus.status === 'extracting' ? 'Processing: ' : 'Success: '}
              </strong> {hephaestusStatus.message}
              
              {hephaestusStatus.stats && (
                <div style={{ marginTop: 8, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  {hephaestusStatus.stats.components > 0 && (
                    <span style={{ background: '#c8e6c9', padding: '2px 8px', borderRadius: 4, fontSize: 12 }}>
                      Components: {hephaestusStatus.stats.components}
                    </span>
                  )}
                  {hephaestusStatus.stats.non_components > 0 && (
                    <span style={{ background: '#fff9c4', padding: '2px 8px', borderRadius: 4, fontSize: 12 }}>
                      Non-components: {hephaestusStatus.stats.non_components}
                    </span>
                  )}
                  {hephaestusStatus.stats.total_items > 0 && (
                    <span style={{ background: '#e3f2fd', padding: '2px 8px', borderRadius: 4, fontSize: 12 }}>
                      Total images: {hephaestusStatus.stats.total_items}
                    </span>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      }
      
      {/* Legacy AI Component Cropping (fallback) */}
      {localImages.filter(img => img.source === 'rulebook').length > 0 && (
        <details style={{ marginBottom: 20 }}>
          <summary style={{ cursor: 'pointer', color: '#666', fontSize: 14, marginBottom: 8 }}>
            Legacy Single-Pass Detection (if new method fails)
          </summary>
          <div style={{ 
            background: 'linear-gradient(135deg, #f3e5f5 0%, #e1bee7 100%)', 
            padding: 16, 
            borderRadius: 8
          }}>
            <button 
              onClick={() => handleCropComponents(false)} 
              disabled={loading}
              style={{
                padding: '10px 20px',
                fontSize: 14,
                background: loading ? '#ce93d8' : '#9c27b0',
                color: 'white',
                border: 'none',
                borderRadius: 6,
                cursor: loading ? 'wait' : 'pointer'
              }}
            >
              {loading ? 'Detecting...' : 'Legacy Crop Components'}
            </button>
          </div>
        </details>
      )}

      {/* Curated image gallery */}
      {curatedImages.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <h4 style={{ margin: 0 }}>Curated Component Candidates ({curatedImages.length})</h4>
            <button
              onClick={async () => {
                setRefreshing(true);
                try {
                  const res = await axios.get(`${BACKEND_URL}/api/projects/${normalizedProjectId}/images`);
                  console.log('Refresh loaded', res.data?.images?.length, 'images');
                  refreshState(res.data || {});
                } catch (err) {
                  console.error('Failed to refresh images', err);
                } finally {
                  setRefreshing(false);
                }
              }}
              disabled={refreshing}
              style={{
                padding: '6px 12px',
                fontSize: 13,
                background: refreshing ? '#e3f2fd' : '#f5f5f5',
                border: '1px solid #ddd',
                borderRadius: 4,
                cursor: refreshing ? 'wait' : 'pointer',
                opacity: refreshing ? 0.7 : 1
              }}
            >
              {refreshing ? '⏳ Loading...' : '🔄 Refresh'}
            </button>
          </div>
          {Object.entries(groupedImages).map(([source, imgs]) => (
            <div key={source} style={{ marginBottom: 16 }}>
              <div 
                onClick={() => toggleSourceExpand(source)}
                style={{ 
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  cursor: 'pointer',
                  padding: '8px 12px',
                  background: '#f5f5f5',
                  borderRadius: 6,
                  fontWeight: 600
                }}
              >
                <span>{expandedSources[source] ? '▼' : '▶'}</span>
                <span style={{ textTransform: 'capitalize' }}>{source}</span>
                <span style={{ 
                  background: '#1976d2', 
                  color: 'white', 
                  padding: '2px 8px', 
                  borderRadius: 12,
                  fontSize: 12
                }}>
                  {imgs.length}
                </span>
              </div>
              
              {expandedSources[source] && (
                <div style={{ 
                  display: 'grid', 
                  gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', 
                  gap: 10,
                  marginTop: 10,
                  padding: 10,
                  background: '#fafafa',
                  borderRadius: 6
                }}>
                  {imgs.map((img) => {
                    const imgUrl = getImageThumbnailUrl(projectId, img);
                    return (
                      <div 
                        key={img.id} 
                        style={{ 
                          border: '1px solid #ddd', 
                          borderRadius: 6, 
                          padding: 8,
                          background: 'white',
                          fontSize: 11
                        }}
                      >
                        <div style={{ 
                          width: '100%', 
                          height: 80, 
                          background: '#e0e0e0', 
                          borderRadius: 4,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          marginBottom: 6,
                          overflow: 'hidden'
                        }}>
                          {imgUrl ? (
                            <img 
                              src={imgUrl} 
                              alt={img.id}
                              style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'cover' }}
                              onError={(e) => { e.target.style.display = 'none'; e.target.parentElement.innerHTML = '<span style="color:#999">📷</span>'; }}
                            />
                          ) : (
                            <span style={{ color: '#999' }}>📷</span>
                          )}
                        </div>
                        <div style={{ color: '#666', wordBreak: 'break-all', fontWeight: (img.source === 'ai-crop' || img.source === 'ai-component-crop') ? 600 : 400 }}>
                          {img.name || img.aiLabels?.[0] || (img.tags || []).find(t => t.startsWith('page-')) || img.id.substring(0, 15)}
                        </div>
                        {img.source === 'ai-component-crop' && img.confidence && (
                          <div style={{ 
                            display: 'inline-block',
                            padding: '2px 6px', 
                            background: img.confidence >= 0.7 ? '#e8f5e9' : img.confidence >= 0.5 ? '#fff3e0' : '#fce4ec',
                            color: img.confidence >= 0.7 ? '#2e7d32' : img.confidence >= 0.5 ? '#f57c00' : '#c62828',
                            borderRadius: 4,
                            fontSize: 9,
                            marginTop: 4
                          }}>
                            {(img.confidence * 100).toFixed(0)}% confidence
                          </div>
                        )}
                        {img.source === 'ai-crop' && img.confidence && (
                          <div style={{ 
                            display: 'inline-block',
                            padding: '2px 6px', 
                            background: img.confidence === 'high' ? '#e8f5e9' : img.confidence === 'medium' ? '#fff3e0' : '#fce4ec',
                            color: img.confidence === 'high' ? '#2e7d32' : img.confidence === 'medium' ? '#f57c00' : '#c62828',
                            borderRadius: 4,
                            fontSize: 9,
                            marginTop: 4
                          }}>
                            {img.confidence} confidence
                          </div>
                        )}
                        <div style={{ color: '#999', marginTop: 4, fontSize: 10 }}>
                          {img.parentPage ? `Page ${img.parentPage}` : (img.tags || []).filter(t => !t.startsWith('page-')).slice(0, 2).join(', ')}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {rawHephaestusImages.length > 0 && (
        <details style={{ marginBottom: 20 }}>
          <summary style={{ cursor: 'pointer', color: '#666', fontSize: 14 }}>
            Raw extracted assets ({rawHephaestusImages.length}) — advanced/debug view
          </summary>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10, padding: 10, background: '#fafafa', borderRadius: 8 }}>
            {rawHephaestusImages.map((image) => {
              const thumbnailUrl = getImageThumbnailUrl(projectId, image);
              return (
                <button key={image.id} type="button" onClick={() => setPreviewImageId(image.id)} style={{ width: 88, padding: 4, border: '1px solid #ddd', background: 'white', borderRadius: 4 }}>
                  {thumbnailUrl && <img src={thumbnailUrl} alt={image.label || image.id} style={{ width: 76, height: 56, objectFit: 'contain' }} />}
                  <div style={{ fontSize: 9, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{image.label || image.id}</div>
                  <div style={{ fontSize: 9, color: '#777' }}>{image.metadata?.curation?.reasons?.join(', ') || 'raw asset'}</div>
                </button>
              );
            })}
          </div>
        </details>
      )}

      {/* Component matching section */}
      {matchingComponents.length > 0 && curatedImages.length > 0 && (
        <div style={{ 
          background: 'linear-gradient(135deg, #fff3e0 0%, #ffe0b2 100%)', 
          padding: 20, 
          borderRadius: 12, 
          marginBottom: 20 
        }}>
          <h4 style={{ margin: '0 0 12px 0', color: '#e65100' }}>
            Component-to-Image Matching
          </h4>
          <p style={{ margin: '0 0 16px 0', color: '#555', fontSize: 14 }}>
            Strictly eligible physical components are ranked with deterministic category, name/OCR, and source-page evidence. Only explainable matches at 90% or higher are linked automatically.
          </p>
          
          <button 
            onClick={handleAutoMatch} 
            disabled={loading || localImages.length === 0}
            style={{
              padding: '12px 24px',
              fontSize: 16,
              fontWeight: 'bold',
              background: loading ? '#ffcc80' : '#ff9800',
              color: 'white',
              border: 'none',
              borderRadius: 8,
              cursor: loading ? 'wait' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8
            }}
          >
            {loading && matchingStatus?.status === 'matching' ? (
              <>
                <span className="loading-spinner" style={{ width: 20, height: 20 }}></span>
                Matching Components...
              </>
            ) : (
              <>🔗 Auto-Match Components to Images</>
            )}
          </button>
          
          {matchingStatus && (
            <div style={{ 
              marginTop: 12, 
              padding: 12, 
              background: matchingStatus.status === 'error' ? '#ffebee' : 
                         matchingStatus.status === 'partial' ? '#fff3e0' : '#e8f5e9',
              borderRadius: 8,
              fontSize: 14
            }}>
              <strong>
                {matchingStatus.status === 'error' ? '❌' : 
                 matchingStatus.status === 'partial' ? '⚠️' : 
                 matchingStatus.status === 'matching' ? '🔄' : '✅'}
              </strong> {matchingStatus.message}
              {matchingStatus.stats && matchingStatus.status !== 'matching' && (
                <div style={{ marginTop: 8, fontSize: 12, color: '#666' }}>
                  <span style={{ marginRight: 16 }}>📋 Rule-based: {matchingStatus.stats.ruleMatched || 0}</span>
                  <span>❓ Review suggestions: {matchingStatus.stats.unmatched || 0}</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Learning mode toggle */}
      {Object.keys(localLinks).length > 0 && (
        <div style={{ 
          background: feedbackMode ? '#e8f5e9' : '#f5f5f5', 
          padding: 16, 
          borderRadius: 8, 
          marginBottom: 16,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <div>
            <strong>Learning Mode</strong>
            <p style={{ margin: '4px 0 0 0', fontSize: 13, color: '#666' }}>
              {feedbackMode 
                ? 'Confirm or reject matches to help MOBIUS learn and improve future matching.' 
                : 'Enable to review and confirm component matches.'}
            </p>
          </div>
          <button
            onClick={() => setFeedbackMode(!feedbackMode)}
            style={{
              padding: '8px 16px',
              background: feedbackMode ? '#4caf50' : '#1976d2',
              color: 'white',
              border: 'none',
              borderRadius: 6,
              cursor: 'pointer',
              fontWeight: 'bold'
            }}
          >
            {feedbackMode ? '✓ Learning Active' : 'Enable Learning'}
          </button>
        </div>
      )}

      {/* Component list with linked images */}
      <div style={{ marginTop: 24 }}>
        <h4>Component Image Links</h4>
        {matchingComponents.length === 0 && (
          <p className="pipeline-muted">No components detected. Go to Step 3 to extract components first.</p>
        )}
        
        <div style={{ display: 'grid', gap: 12 }}>
          {matchingComponents.map((component) => {
            const linkedCount = getLinkedImagesCount(component.id);
            const linkedImageIds = localLinks[component.id] || [];
            const isSelected = selectedComponent === component.id;
            
            return (
              <div 
                key={component.id} 
                style={{ 
                  border: isSelected ? '2px solid #1976d2' : '1px solid #e0e0e0',
                  borderRadius: 8, 
                  padding: 12,
                  background: linkedCount > 0 ? '#f1f8e9' : 'white'
                }}
              >
                <div 
                  style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'space-between',
                    cursor: 'pointer'
                  }}
                  onClick={() => {
                    setSelectedComponent(isSelected ? null : component.id);
                    setPreviewImageId(null);
                    setPreviewComponentId(null);
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 20 }}>{getCategoryIcon(component.category)}</span>
                    <div>
                      <div style={{ fontWeight: 600 }}>{component.name}</div>
                      <div style={{ fontSize: 12, color: '#666' }}>
                        {component.quantity} × {component.category}
                        {component.details && ` • ${component.details}`}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {/* Show linked image thumbnails */}
                    {linkedImageIds.slice(0, 3).map(imgId => {
                      const img = getImageById(imgId);
                      const imgUrl = img ? getImageThumbnailUrl(projectId, img) : null;
                      return imgUrl ? (
                        <div 
                          key={imgId}
                          style={{
                            width: 36,
                            height: 36,
                            borderRadius: 4,
                            overflow: 'hidden',
                            border: '1px solid #ddd',
                            background: '#f5f5f5',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}
                        >
                          <img 
                            src={imgUrl} 
                            alt=""
                            style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                          />
                        </div>
                      ) : null;
                    })}
                    {linkedImageIds.length > 3 && (
                      <span style={{ fontSize: 11, color: '#999' }}>+{linkedImageIds.length - 3}</span>
                    )}
                    <span style={{ 
                      background: linkedCount > 0 ? '#4caf50' : '#ffeb3b',
                      color: linkedCount > 0 ? 'white' : '#333',
                      padding: '4px 10px',
                      borderRadius: 12,
                      fontSize: 12,
                      fontWeight: 'bold'
                    }}>
                      {linkedCount} {linkedCount === 1 ? 'image' : 'images'}
                    </span>
                    <span style={{ color: '#999' }}>{isSelected ? '▲' : '▼'}</span>
                  </div>
                </div>

                {matchingCandidates[component.id]?.length > 0 && (() => {
                  const candidates = matchingCandidates[component.id];
                  const showingAll = Boolean(showAllCandidates[component.id]);
                  const visibleCandidates = showingAll ? candidates : candidates.slice(0, 6);
                  return (
                    <div style={{ marginTop: 10, padding: 10, background: '#f3f8ff', borderRadius: 6 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>
                        Top review suggestions{candidates.length > 6 ? ` (showing ${visibleCandidates.length} of ${candidates.length})` : ''}
                      </div>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {visibleCandidates.map((candidate) => {
                          const candidateImage = getImageById(candidate.imageId);
                          const candidateUrl = candidateImage ? getImageThumbnailUrl(projectId, candidateImage) : null;
                          const isCandidateSelected = previewComponentId === component.id && previewImageId === candidate.imageId;
                          const score = Math.round(candidate.score * 100);
                          return (
                            <button
                              key={candidate.imageId}
                              type="button"
                              aria-pressed={isCandidateSelected}
                              aria-label={`Select ${candidateImage?.label || candidate.imageId} for ${component.name}; ${score}% ${candidate.autoLink ? 'automatic link' : 'review suggestion'}`}
                              onClick={() => {
                                setSelectedComponent(component.id);
                                setPreviewImageId(candidate.imageId);
                                setPreviewComponentId(component.id);
                              }}
                              title={candidate.reasons.join('; ')}
                              style={{
                                padding: 4,
                                border: isCandidateSelected ? '3px solid #1976d2' : candidate.autoLink ? '2px solid #43a047' : '1px solid #90a4ae',
                                background: isCandidateSelected ? '#e3f2fd' : 'white',
                                borderRadius: 5,
                                width: 100,
                              }}
                            >
                              {candidateUrl && <img src={candidateUrl} alt="" style={{ width: 88, height: 56, objectFit: 'contain' }} />}
                              <div style={{ fontSize: 10, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{candidateImage?.label || candidate.imageId}</div>
                              <div style={{ fontSize: 10 }}>{score}% {candidate.autoLink ? 'auto-link' : 'Review suggestion'}</div>
                            </button>
                          );
                        })}
                      </div>
                      {candidates.length > 6 && (
                        <button
                          type="button"
                          onClick={() => setShowAllCandidates((previous) => ({ ...previous, [component.id]: !showingAll }))}
                          style={{ marginTop: 10 }}
                        >
                          {showingAll ? 'Show top 6 suggestions' : `View all ${candidates.length} candidates`}
                        </button>
                      )}
                    </div>
                  );
                })()}

                {isSelected && (
                  <>
                    {previewComponentId === component.id && previewImageId && (() => {
                      const previewImage = localImages.find((image) => image.id === previewImageId);
                      if (!previewImage) return null;
                      const selectedCandidate = (matchingCandidates[component.id] || []).find((candidate) => candidate.imageId === previewImageId);
                      const isLinked = linkedImageIds.includes(previewImageId);
                      const detectedCategory = previewImage.metadata?.classification || previewImage.type || 'other';
                      const width = previewImage.width || previewImage.metadata?.dimensions?.width || previewImage.metadata?.originalDimensions?.width;
                      const height = previewImage.height || previewImage.metadata?.dimensions?.height || previewImage.metadata?.originalDimensions?.height;
                      const sourcePage = previewImage.metadata?.page ?? previewImage.page ?? previewImage.parentPage;
                      return (
                        <div role="dialog" aria-label="Selected image preview" style={{ marginTop: 12, padding: 12, background: '#fffde7', border: '1px solid #fbc02d', borderRadius: 6 }}>
                          <div style={{ fontWeight: 600, marginBottom: 8 }}>Selected image preview</div>
                          <img
                            src={getImageUrl(projectId, previewImage)}
                            alt={previewImage.label || previewImage.name || previewImageId}
                            style={{ maxWidth: '100%', maxHeight: 420, objectFit: 'contain', display: 'block', marginBottom: 8 }}
                          />
                          <dl style={{ margin: '0 0 12px', display: 'grid', gridTemplateColumns: 'max-content 1fr', gap: '4px 10px', fontSize: 13 }}>
                            <dt>Label</dt><dd style={{ margin: 0 }}>{previewImage.label || previewImage.name || previewImageId}</dd>
                            <dt>Category</dt><dd style={{ margin: 0, textTransform: 'capitalize' }}>{detectedCategory}</dd>
                            <dt>Dimensions</dt><dd style={{ margin: 0 }}>{width && height ? `${width} × ${height}` : 'Not available'}</dd>
                            <dt>Source page</dt><dd style={{ margin: 0 }}>{sourcePage ?? 'Not available'}</dd>
                            <dt>Suggestion</dt><dd style={{ margin: 0 }}>{selectedCandidate ? `${Math.round(selectedCandidate.score * 100)}% — ${selectedCandidate.reasons.join('; ')}` : 'Selected manually from the curated gallery'}</dd>
                          </dl>
                          {!isLinked ? (
                            <button
                              type="button"
                              className="pipeline-btn pipeline-btn-primary"
                              onClick={() => {
                                handleRepresentativeLink(component.id, previewImageId);
                                setPreviewImageId(null);
                                setPreviewComponentId(null);
                              }}
                            >
                              Link selected image to {component.name}
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="pipeline-btn"
                              onClick={() => handleRemoveLink(component.id, previewImageId)}
                            >
                              Remove link
                            </button>
                          )}
                          <button type="button" className="pipeline-btn" onClick={() => { setPreviewImageId(null); setPreviewComponentId(null); }} style={{ marginLeft: 8 }}>
                            Close preview
                          </button>
                        </div>
                      );
                    })()}
                    <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #e0e0e0' }}>
                    {/* Show currently linked images with thumbnails */}
                    {linkedImageIds.length > 0 && (
                      <div style={{ marginBottom: 16 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
                          Linked Images:
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                          {linkedImageIds.map(imgId => {
                            const img = getImageById(imgId);
                            const imgUrl = img ? getImageThumbnailUrl(projectId, img) : null;
                            const feedbackKey = `${component.id}-${imgId}`;
                            const status = feedbackStatus[feedbackKey];
                            
                            return (
                              <div 
                                key={imgId}
                                style={{
                                  border: status === 'confirmed' ? '3px solid #4caf50' : 
                                         status === 'rejected' ? '3px solid #f44336' : '2px solid #1976d2',
                                  borderRadius: 8,
                                  padding: 4,
                                  background: 'white'
                                }}
                              >
                                <div style={{
                                  width: 100,
                                  height: 80,
                                  borderRadius: 4,
                                  overflow: 'hidden',
                                  background: '#f5f5f5',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center'
                                }}>
                                  {imgUrl ? (
                                    <img 
                                      src={imgUrl} 
                                      alt=""
                                      style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                                    />
                                  ) : (
                                    <span style={{ color: '#999' }}>📷</span>
                                  )}
                                </div>
                                <div style={{ fontSize: 10, color: '#666', textAlign: 'center', marginTop: 4 }}>
                                  {img?.metadata?.classification || img?.tags?.find(t => t.startsWith('page-')) || 'Image'}
                                </div>
                                <button
                                  type="button"
                                  onClick={() => handleRemoveLink(component.id, imgId)}
                                  style={{ width: '100%', marginTop: 4, fontSize: 10 }}
                                >
                                  Remove link
                                </button>
                                
                                {/* Feedback buttons in learning mode */}
                                {feedbackMode && !status && (
                                  <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                                    <button
                                      onClick={(e) => { e.stopPropagation(); handleFeedback(component, imgId, true); }}
                                      style={{
                                        flex: 1,
                                        padding: '4px 6px',
                                        background: '#4caf50',
                                        color: 'white',
                                        border: 'none',
                                        borderRadius: 4,
                                        fontSize: 10,
                                        cursor: 'pointer'
                                      }}
                                    >
                                      ✓ Correct
                                    </button>
                                    <button
                                      onClick={(e) => { 
                                        e.stopPropagation(); 
                                        handleFeedback(component, imgId, false);
                                        handleRemoveLink(component.id, imgId);
                                      }}
                                      style={{
                                        flex: 1,
                                        padding: '4px 6px',
                                        background: '#f44336',
                                        color: 'white',
                                        border: 'none',
                                        borderRadius: 4,
                                        fontSize: 10,
                                        cursor: 'pointer'
                                      }}
                                    >
                                      ✗ Wrong
                                    </button>
                                  </div>
                                )}
                                {status && (
                                  <div style={{ 
                                    fontSize: 10, 
                                    textAlign: 'center', 
                                    marginTop: 4,
                                    color: status === 'confirmed' ? '#4caf50' : '#f44336' 
                                  }}>
                                    {status === 'confirmed' ? '✓ Confirmed' : '✗ Rejected'}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    
                    <div style={{ fontSize: 13, color: '#666', marginBottom: 8 }}>
                      Select an image to inspect it, then explicitly confirm a link for this component:
                    </div>
                    {(() => {
                      const compatibleCandidates = curatedImages.filter((img) => imageMatchesComponentVisualType(component, img));
                      const visibleCandidates = showAllCandidates[component.id] || compatibleCandidates.length === 0
                        ? curatedImages
                        : compatibleCandidates;
                      return <>
                    {compatibleCandidates.length > 0 && compatibleCandidates.length < curatedImages.length && (
                      <button
                        type="button"
                        onClick={() => setShowAllCandidates((previous) => ({ ...previous, [component.id]: !previous[component.id] }))}
                        style={{ marginBottom: 8, fontSize: 12 }}
                      >
                        {showAllCandidates[component.id]
                          ? `Show ${compatibleCandidates.length} type-compatible candidates`
                          : `Show all ${curatedImages.length} candidates`}
                      </button>
                    )}
                    <div style={{ 
                      display: 'grid', 
                      gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))', 
                      gap: 8 
                    }}>
                      {[...visibleCandidates]
                        .sort((a, b) => {
                          // Prioritize HEPHAESTUS images
                          if (a.source === 'hephaestus' && b.source !== 'hephaestus') return -1;
                          if (b.source === 'hephaestus' && a.source !== 'hephaestus') return 1;
                          // Then sort by classification match with component category
                          const compCat = (component.category || '').toLowerCase();
                          const aClass = (a.metadata?.classification || '').toLowerCase();
                          const bClass = (b.metadata?.classification || '').toLowerCase();
                          const aMatch = compCat.includes(aClass) || aClass.includes(compCat);
                          const bMatch = compCat.includes(bClass) || bClass.includes(compCat);
                          if (aMatch && !bMatch) return -1;
                          if (bMatch && !aMatch) return 1;
                          return 0;
                        })
                        .map((img) => {
                        const isLinked = linkedImageIds.includes(img.id);
                        const isPreviewSelected = previewComponentId === component.id && previewImageId === img.id;
                        const imgUrl = getImageThumbnailUrl(projectId, img);
                        return (
                          <button
                            key={img.id}
                            className="image-thumbnail-btn"
                            type="button"
                            aria-pressed={previewComponentId === component.id && previewImageId === img.id}
                            aria-label={`Select ${img.label || img.name || img.id} for ${component.name}`}
                            onClick={() => { setSelectedComponent(component.id); setPreviewImageId(img.id); setPreviewComponentId(component.id); }}
                            style={{
                              padding: 4,
                              borderRadius: 6,
                              border: isPreviewSelected ? '3px solid #1976d2' : isLinked ? '3px solid #4caf50' : '1px solid #ccc',
                              background: isPreviewSelected ? '#e3f2fd' : isLinked ? '#e8f5e9' : '#fafafa',
                              cursor: 'pointer',
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'center'
                            }}
                          >
                            <div style={{
                              width: '100%',
                              height: 80,
                              borderRadius: 4,
                              overflow: 'hidden',
                              background: '#f5f5f5',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center'
                            }}>
                              {imgUrl ? (
                                <img 
                                  src={imgUrl} 
                                  alt=""
                                  style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                                />
                              ) : (
                                <span style={{ color: '#999' }}>📷</span>
                              )}
                            </div>
                            <div style={{ fontSize: 9, color: '#666', marginTop: 4, textAlign: 'center' }}>
                              {isLinked && <span style={{ color: '#4caf50' }}>✓ </span>}
                              {img.metadata?.classification || img.tags?.find(t => t.startsWith('page-')) || img.source}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                    </>;
                    })()}
                  </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Manual options (collapsed by default) */}
      <details style={{ marginTop: 24 }}>
        <summary style={{ cursor: 'pointer', fontWeight: 600, color: '#666' }}>
          Manual Image Sources
        </summary>
        <div style={{ 
          display: "grid", 
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", 
          gap: 12,
          marginTop: 12 
        }}>
          <div className="card">
            <h4>BGG</h4>
            <input
              type="text"
              placeholder="BGG URL or ID"
              value={manualBggUrl}
              onChange={(e) => setManualBggUrl(e.target.value)}
              style={{ width: "100%" }}
            />
            <button onClick={handleFetchBgg} disabled={loading || !manualBggUrl} style={{ marginTop: 8 }}>
              Fetch BGG images
            </button>
          </div>

          <div className="card">
            <h4>Rulebook PDF</h4>
            <input
              type="text"
              placeholder="Rulebook PDF path"
              value={manualPdfPath}
              onChange={(e) => setManualPdfPath(e.target.value)}
              style={{ width: "100%" }}
            />
            <button onClick={handleExtractRulebook} disabled={loading || !manualPdfPath} style={{ marginTop: 8 }}>
              Extract rulebook images
            </button>
          </div>

          <div className="card">
            <h4>Manual upload</h4>
            <input type="file" onChange={(e) => setManualFile(e.target.files?.[0] || null)} />
            <button onClick={handleManualUpload} disabled={loading || !manualFile} style={{ marginTop: 8 }}>
              Add manual image
            </button>
          </div>
        </div>
      </details>
    </div>
  );
}
