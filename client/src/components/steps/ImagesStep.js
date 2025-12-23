import React, { useEffect, useMemo, useState, useCallback } from "react";
import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL !== undefined 
  ? process.env.REACT_APP_BACKEND_URL 
  : '';

const getImageUrl = (projectId, image) => {
  if (!image) return null;
  if (image.originalUrl) return image.originalUrl;
  if (image.fileKey || image.source === 'rulebook' || image.source === 'manual' || image.source === 'ai-crop' || image.source === 'native-pdf' || image.source === 'ai-component-crop' || image.source === 'hephaestus') {
    return `${BACKEND_URL}/api/projects/${projectId}/images/${image.id}/file`;
  }
  return null;
};

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
  components = [], 
  images = [], 
  componentImages = {}, 
  onImagesUpdated,
  gameName = '',
  bggUrl = '',
  pdfFile = null
}) {
  const [loading, setLoading] = useState(false);
  const [autoGatherStatus, setAutoGatherStatus] = useState(null);
  const [matchingStatus, setMatchingStatus] = useState(null);
  const [croppingStatus, setCroppingStatus] = useState(null);
  const [manualBggUrl, setManualBggUrl] = useState(bggUrl || "");
  const [manualPdfPath, setManualPdfPath] = useState("");
  const [manualFile, setManualFile] = useState(null);
  const [localImages, setLocalImages] = useState(images);
  const [localLinks, setLocalLinks] = useState(componentImages || {});
  const [selectedComponent, setSelectedComponent] = useState(null);
  const [expandedSources, setExpandedSources] = useState({});
  const [feedbackMode, setFeedbackMode] = useState(false);
  const [feedbackStatus, setFeedbackStatus] = useState({});
  const [hephaestusStatus, setHephaestusStatus] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    setLocalImages(images || []);
  }, [images]);

  useEffect(() => {
    setLocalLinks(componentImages || {});
  }, [componentImages]);

  useEffect(() => {
    if (!projectId) return;
    const load = async () => {
      try {
        const res = await axios.get(`${BACKEND_URL}/api/projects/${projectId}/images`);
        onImagesUpdated?.(res.data || {});
      } catch (err) {
        console.error("Failed to load images", err);
      }
    };
    load();
  }, [projectId, onImagesUpdated]);

  const groupedImages = useMemo(() => {
    return (localImages || []).reduce((acc, img) => {
      const bucket = img.source || "unknown";
      acc[bucket] = acc[bucket] || [];
      acc[bucket].push(img);
      return acc;
    }, {});
  }, [localImages]);

  const refreshState = (payload) => {
    setLocalImages(payload.images || []);
    setLocalLinks(payload.componentImages || {});
    onImagesUpdated?.(payload);
  };

  // Automatic image gathering - uses native extraction first, then page-level fallback
  const handleAutoGather = async () => {
    if (!projectId) return;
    setLoading(true);
    setAutoGatherStatus({ status: 'gathering', message: 'Gathering images from all sources...' });
    
    try {
      const results = {
        sources: [],
        totalImages: 0,
        errors: [],
        nativeFound: 0
      };
      
      // Step 1: Try native embedded image extraction first (best quality)
      if (pdfFile) {
        try {
          setAutoGatherStatus({ 
            status: 'gathering', 
            message: 'Extracting embedded images from PDF...' 
          });
          const formData = new FormData();
          formData.append('file', pdfFile);
          
          const nativeRes = await axios.post(
            `${BACKEND_URL}/api/projects/${projectId}/images/extract-native`,
            formData,
            { headers: { 'Content-Type': 'multipart/form-data' } }
          );
          
          if (nativeRes.data?.images) {
            const mode = nativeRes.data.mode;
            const count = mode === 'native' ? nativeRes.data.nativeCount : nativeRes.data.pagesCount;
            results.sources.push({ 
              source: mode === 'native' ? 'native-pdf' : 'rulebook', 
              count 
            });
            results.totalImages += nativeRes.data.images.length;
            results.nativeFound = nativeRes.data.nativeCount || 0;
            refreshState(nativeRes.data);
            
            if (mode === 'native' && count > 0) {
              setAutoGatherStatus({ 
                status: 'gathering', 
                message: `Found ${count} embedded images, checking other sources...` 
              });
            } else {
              setAutoGatherStatus({ 
                status: 'gathering', 
                message: `Extracted ${count} pages, checking other sources...` 
              });
            }
          }
        } catch (err) {
          console.error('Native extraction failed:', err);
          results.errors.push({ source: 'native-pdf', error: err.message });
          
          // Fallback to full page extraction
          try {
            setAutoGatherStatus({ status: 'gathering', message: 'Extracting pages from PDF...' });
            const formData = new FormData();
            formData.append('file', pdfFile);
            
            const pdfRes = await axios.post(
              `${BACKEND_URL}/api/projects/${projectId}/images/extract-pdf`,
              formData,
              { headers: { 'Content-Type': 'multipart/form-data' } }
            );
            
            if (pdfRes.data?.images) {
              results.sources.push({ source: 'rulebook', count: pdfRes.data.images.length });
              results.totalImages += pdfRes.data.images.length;
              refreshState(pdfRes.data);
            }
          } catch (fallbackErr) {
            console.error('Fallback PDF extraction failed:', fallbackErr);
          }
        }
      }
      
      // Step 2: Fetch BGG images
      if (gameName) {
        try {
          setAutoGatherStatus({ status: 'gathering', message: 'Searching BoardGameGeek for images...' });
          const bggRes = await axios.post(
            `${BACKEND_URL}/api/projects/${projectId}/images/fetch-bgg`,
            { bggUrl: manualBggUrl || bggUrl || gameName }
          );
          
          if (bggRes.data?.images) {
            const newCount = bggRes.data.images.length - results.totalImages;
            if (newCount > 0) {
              results.sources.push({ source: 'bgg', count: newCount });
              results.totalImages = bggRes.data.images.length;
            }
            refreshState(bggRes.data);
          }
        } catch (err) {
          console.error('BGG fetch failed:', err);
          results.errors.push({ source: 'bgg', error: err.message });
        }
      }
      
      const state = await axios.get(`${BACKEND_URL}/api/projects/${projectId}/images`);
      refreshState(state.data || {});
      
      if (results.totalImages === 0 && results.errors.length === 0) {
        setAutoGatherStatus({
          status: 'warning',
          message: 'No images found. Try uploading a PDF or providing a BGG URL.',
          sources: results.sources,
          errors: results.errors
        });
      } else {
        const cropsMsg = results.cropsFound > 0 ? ` (${results.cropsFound} AI-detected component crops)` : '';
        setAutoGatherStatus({
          status: 'complete',
          message: `Found ${results.totalImages} images from ${results.sources.length} sources${cropsMsg}`,
          sources: results.sources,
          errors: results.errors
        });
      }
    } catch (err) {
      console.error('Auto-gather failed:', err);
      setAutoGatherStatus({ 
        status: 'error', 
        message: err.response?.data?.error || 'Failed to gather images' 
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
      const res = await axios.post(`${BACKEND_URL}/api/projects/${projectId}/images/detect-components`, {
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
      const res = await axios.post(`${BACKEND_URL}/api/projects/${projectId}/images/crop-components`, {
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

  // Hybrid component-to-image matching (rule-based + AI vision)
  const handleAutoMatch = async () => {
    if (!projectId || localImages.length === 0) return;
    setLoading(true);
    setMatchingStatus({ status: 'matching', message: 'Stage 1: Rule-based matching by component type...' });
    
    try {
      const res = await axios.post(`${BACKEND_URL}/api/projects/${projectId}/images/auto-match`, {
        components,
        gameName
      });
      
      refreshState(res.data || {});
      
      const stats = res.data.stats || {};
      const matched = res.data.matched || 0;
      const total = stats.total || components.length;
      const ruleMatched = stats.ruleMatched || 0;
      const visionMatched = stats.visionMatched || 0;
      
      let message = `Matched ${matched}/${total} components`;
      if (ruleMatched > 0 || visionMatched > 0) {
        message += ` (${ruleMatched} by rules, ${visionMatched} by AI vision)`;
      }
      if (stats.unmatched > 0) {
        message += `. ${stats.unmatched} need manual matching.`;
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
      const res = await axios.post(`${BACKEND_URL}/api/projects/${projectId}/images/fetch-bgg`, { bggUrl: manualBggUrl });
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
      const res = await axios.post(`${BACKEND_URL}/api/projects/${projectId}/images/extract-rulebook`, { pdfPath: manualPdfPath });
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
      const res = await axios.post(`${BACKEND_URL}/api/projects/${projectId}/images/manual`, form, {
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
    if (!projectId || !pdfFile) return;
    setLoading(true);
    setHephaestusStatus({ status: 'extracting', message: 'Running HEPHAESTUS extraction pipeline...' });
    
    try {
      const formData = new FormData();
      formData.append('file', pdfFile);
      formData.append('minWidth', '100');
      formData.append('minHeight', '100');
      
      const res = await axios.post(
        `${BACKEND_URL}/api/projects/${projectId}/images/extract-hephaestus`,
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

  const handleComponentLink = async (componentId, imageId) => {
    if (!projectId || !componentId) return;
    const next = new Set(localLinks[componentId] || []);
    if (next.has(imageId)) {
      next.delete(imageId);
    } else {
      next.add(imageId);
    }
    try {
      const res = await axios.post(`${BACKEND_URL}/api/projects/${projectId}/components/${componentId}/images`, {
        imageIds: Array.from(next),
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
      await axios.post(`${BACKEND_URL}/api/projects/${projectId}/match-feedback`, {
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
      tokens: '🔘',
      boards: '🎲',
      tiles: '🧩',
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
          Click the button below to automatically gather images from the rulebook PDF, 
          BoardGameGeek, and web search.
        </p>
        
        <button 
          onClick={handleAutoGather} 
          disabled={loading || !projectId}
          style={{
            padding: '12px 24px',
            fontSize: 16,
            fontWeight: 'bold',
            background: loading ? '#90caf9' : '#1976d2',
            color: 'white',
            border: 'none',
            borderRadius: 8,
            cursor: loading ? 'wait' : 'pointer',
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
      {pdfFile && (
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
          
          <button 
            onClick={handleHephaestusExtract} 
            disabled={loading}
            style={{
              padding: '12px 24px',
              fontSize: 16,
              fontWeight: 'bold',
              background: loading && hephaestusStatus?.status === 'extracting' ? '#ef9a9a' : '#f44336',
              color: 'white',
              border: 'none',
              borderRadius: 8,
              cursor: loading ? 'wait' : 'pointer',
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
      )}
      
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

      {/* Image gallery */}
      {localImages.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <h4 style={{ margin: 0 }}>Available Images ({localImages.length})</h4>
            <button
              onClick={async () => {
                setRefreshing(true);
                try {
                  const res = await axios.get(`${BACKEND_URL}/api/projects/${projectId}/images`);
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
                    const imgUrl = getImageUrl(projectId, img);
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

      {/* Component matching section */}
      {components.length > 0 && localImages.length > 0 && (
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
            AI will analyze your images and automatically match them to the game components.
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
                  <span style={{ marginRight: 16 }}>👁️ AI Vision: {matchingStatus.stats.visionMatched || 0}</span>
                  <span>❓ Unmatched: {matchingStatus.stats.unmatched || 0}</span>
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
        {components.length === 0 && (
          <p className="pipeline-muted">No components detected. Go to Step 3 to extract components first.</p>
        )}
        
        <div style={{ display: 'grid', gap: 12 }}>
          {components.map((component) => {
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
                  onClick={() => setSelectedComponent(isSelected ? null : component.id)}
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
                      const imgUrl = img ? getImageUrl(projectId, img) : null;
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
                
                {isSelected && (
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
                            const imgUrl = img ? getImageUrl(projectId, img) : null;
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
                                        handleComponentLink(component.id, imgId);
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
                      Click an image to link/unlink it from this component:
                    </div>
                    <div style={{ 
                      display: 'grid', 
                      gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))', 
                      gap: 8 
                    }}>
                      {[...localImages]
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
                        const imgUrl = getImageUrl(projectId, img);
                        return (
                          <button
                            key={img.id}
                            className="image-thumbnail-btn"
                            onClick={() => handleComponentLink(component.id, img.id)}
                            style={{
                              padding: 4,
                              borderRadius: 6,
                              border: isLinked ? '3px solid #4caf50' : '1px solid #ccc',
                              background: isLinked ? '#e8f5e9' : '#fafafa',
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
                  </div>
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
