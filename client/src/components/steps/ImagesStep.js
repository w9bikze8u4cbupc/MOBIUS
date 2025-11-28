import React, { useEffect, useMemo, useState, useCallback } from "react";
import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL !== undefined 
  ? process.env.REACT_APP_BACKEND_URL 
  : '';

const getImageUrl = (projectId, image) => {
  if (!image) return null;
  if (image.originalUrl) return image.originalUrl;
  if (image.fileKey || image.source === 'rulebook' || image.source === 'manual' || image.source === 'ai-crop') {
    return `${BACKEND_URL}/api/projects/${projectId}/images/${image.id}/file`;
  }
  return null;
};

const getSourceLabel = (source) => {
  const labels = {
    'rulebook': 'Rulebook Page',
    'ai-crop': 'AI Detected',
    'bgg': 'BoardGameGeek',
    'manual': 'Manual Upload',
    'bgg-components': 'BGG Components',
    'web-search': 'Web Search'
  };
  return labels[source] || source;
};

const getSourceColor = (source) => {
  const colors = {
    'rulebook': '#2196f3',
    'ai-crop': '#9c27b0',
    'bgg': '#ff9800',
    'manual': '#4caf50',
    'bgg-components': '#ff5722',
    'web-search': '#00bcd4'
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
  const [manualBggUrl, setManualBggUrl] = useState(bggUrl || "");
  const [manualPdfPath, setManualPdfPath] = useState("");
  const [manualFile, setManualFile] = useState(null);
  const [localImages, setLocalImages] = useState(images);
  const [localLinks, setLocalLinks] = useState(componentImages || {});
  const [selectedComponent, setSelectedComponent] = useState(null);
  const [expandedSources, setExpandedSources] = useState({});
  const [feedbackMode, setFeedbackMode] = useState(false);
  const [feedbackStatus, setFeedbackStatus] = useState({});

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

  // Automatic image gathering with intelligent cropping
  const handleAutoGather = async () => {
    if (!projectId) return;
    setLoading(true);
    setAutoGatherStatus({ status: 'gathering', message: 'Gathering images from all sources...' });
    
    try {
      const results = {
        sources: [],
        totalImages: 0,
        errors: [],
        cropsFound: 0
      };
      
      // Step 1: Extract component images from PDF using AI vision
      if (pdfFile && components.length > 0) {
        try {
          setAutoGatherStatus({ 
            status: 'gathering', 
            message: 'AI is scanning PDF for component images...' 
          });
          const formData = new FormData();
          formData.append('file', pdfFile);
          formData.append('components', JSON.stringify(components));
          
          const cropRes = await axios.post(
            `${BACKEND_URL}/api/projects/${projectId}/images/extract-crops`,
            formData,
            { headers: { 'Content-Type': 'multipart/form-data' } }
          );
          
          if (cropRes.data?.images) {
            const mode = cropRes.data.mode;
            const count = mode === 'crops' ? cropRes.data.cropsCount : cropRes.data.pagesCount;
            results.sources.push({ 
              source: mode === 'crops' ? 'ai-crops' : 'rulebook', 
              count 
            });
            results.totalImages += cropRes.data.images.length;
            results.cropsFound = cropRes.data.cropsCount || 0;
            refreshState(cropRes.data);
            
            if (mode === 'crops') {
              setAutoGatherStatus({ 
                status: 'gathering', 
                message: `Found ${count} component images, now checking other sources...` 
              });
            }
          }
        } catch (err) {
          console.error('AI crop extraction failed:', err);
          results.errors.push({ source: 'ai-crops', error: err.message });
          
          // Fallback to full page extraction
          if (pdfFile) {
            try {
              setAutoGatherStatus({ status: 'gathering', message: 'Extracting full pages from PDF...' });
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
      } else if (pdfFile) {
        // No components yet, just extract full pages
        try {
          setAutoGatherStatus({ status: 'gathering', message: 'Extracting images from PDF rulebook...' });
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
        } catch (err) {
          console.error('PDF extraction failed:', err);
          results.errors.push({ source: 'rulebook', error: err.message });
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

  // Automatic component-to-image matching
  const handleAutoMatch = async () => {
    if (!projectId || localImages.length === 0) return;
    setLoading(true);
    setMatchingStatus({ status: 'matching', message: 'AI is analyzing images and matching to components...' });
    
    try {
      const res = await axios.post(`${BACKEND_URL}/api/projects/${projectId}/images/auto-match`, {
        components,
        gameName
      });
      
      refreshState(res.data || {});
      
      const matched = res.data.matched || 0;
      setMatchingStatus({
        status: 'complete',
        message: `Matched ${matched} components to images`
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

      {/* Image gallery */}
      {localImages.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <h4>Available Images ({localImages.length})</h4>
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
                        <div style={{ color: '#666', wordBreak: 'break-all', fontWeight: img.source === 'ai-crop' ? 600 : 400 }}>
                          {img.aiLabels?.[0] || (img.tags || []).find(t => t.startsWith('page-')) || img.id.substring(0, 15)}
                        </div>
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
              background: matchingStatus.status === 'error' ? '#ffebee' : '#e8f5e9',
              borderRadius: 8,
              fontSize: 14
            }}>
              <strong>{matchingStatus.status === 'error' ? '❌' : '✅'}</strong> {matchingStatus.message}
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
                            width: 32,
                            height: 32,
                            borderRadius: 4,
                            overflow: 'hidden',
                            border: '1px solid #ddd'
                          }}
                        >
                          <img 
                            src={imgUrl} 
                            alt=""
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
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
                                  height: 75,
                                  borderRadius: 4,
                                  overflow: 'hidden',
                                  background: '#e0e0e0',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center'
                                }}>
                                  {imgUrl ? (
                                    <img 
                                      src={imgUrl} 
                                      alt=""
                                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                    />
                                  ) : (
                                    <span style={{ color: '#999' }}>📷</span>
                                  )}
                                </div>
                                <div style={{ fontSize: 10, color: '#666', textAlign: 'center', marginTop: 4 }}>
                                  {img?.tags?.find(t => t.startsWith('page-')) || 'Image'}
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
                      {localImages.map((img) => {
                        const isLinked = linkedImageIds.includes(img.id);
                        const imgUrl = getImageUrl(projectId, img);
                        return (
                          <button
                            key={img.id}
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
                              height: 60,
                              borderRadius: 4,
                              overflow: 'hidden',
                              background: '#e0e0e0',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center'
                            }}>
                              {imgUrl ? (
                                <img 
                                  src={imgUrl} 
                                  alt=""
                                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                />
                              ) : (
                                <span style={{ color: '#999' }}>📷</span>
                              )}
                            </div>
                            <div style={{ fontSize: 9, color: '#666', marginTop: 4 }}>
                              {isLinked && <span style={{ color: '#4caf50' }}>✓ </span>}
                              {img.tags?.find(t => t.startsWith('page-')) || img.source}
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
