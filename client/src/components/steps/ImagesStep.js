import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL !== undefined 
  ? process.env.REACT_APP_BACKEND_URL 
  : '';

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

  // Automatic image gathering from all sources
  const handleAutoGather = async () => {
    if (!projectId) return;
    setLoading(true);
    setAutoGatherStatus({ status: 'gathering', message: 'Gathering images from all sources...' });
    
    try {
      const results = {
        sources: [],
        totalImages: 0,
        errors: []
      };
      
      // Step 1: Extract images from PDF if available
      if (pdfFile) {
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
        setAutoGatherStatus({
          status: 'complete',
          message: `Found ${results.totalImages} images from ${results.sources.length} sources`,
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
                  {imgs.map((img) => (
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
                        {img.originalUrl ? (
                          <img 
                            src={img.originalUrl} 
                            alt={img.id}
                            style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'cover' }}
                            onError={(e) => { e.target.style.display = 'none'; }}
                          />
                        ) : (
                          <span style={{ color: '#999' }}>📷</span>
                        )}
                      </div>
                      <div style={{ color: '#666', wordBreak: 'break-all' }}>
                        {img.id.substring(0, 20)}...
                      </div>
                      <div style={{ color: '#999', marginTop: 4 }}>
                        {(img.tags || []).slice(0, 2).join(', ')}
                      </div>
                    </div>
                  ))}
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
                    <div style={{ fontSize: 13, color: '#666', marginBottom: 8 }}>
                      Click an image to link/unlink it from this component:
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {localImages.map((img) => {
                        const isLinked = linkedImageIds.includes(img.id);
                        return (
                          <button
                            key={img.id}
                            onClick={() => handleComponentLink(component.id, img.id)}
                            style={{
                              padding: '8px 12px',
                              borderRadius: 6,
                              border: isLinked ? '2px solid #4caf50' : '1px solid #ccc',
                              background: isLinked ? '#e8f5e9' : '#fafafa',
                              cursor: 'pointer',
                              fontSize: 12,
                              display: 'flex',
                              alignItems: 'center',
                              gap: 6
                            }}
                          >
                            {isLinked && <span style={{ color: '#4caf50' }}>✓</span>}
                            <span style={{ color: '#666' }}>{img.source}:</span>
                            <span>{img.id.substring(0, 15)}...</span>
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
