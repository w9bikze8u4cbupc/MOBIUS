import React, { useEffect, useState, useCallback, useRef } from 'react';
import { DragDropContext, Droppable, Draggable } from 'react-beautiful-dnd';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:5001';
const FETCH_TIMEOUT = 10000; // 10 seconds
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // 1 second

function ImageMatcher({
  components = [],
  extractedImages = [],
  onMatchingComplete = () => {},
  projectId = null
}) {
  const [matchingComponents, setMatchingComponents] = useState([]);
  const [availableImages, setAvailableImages] = useState([]);
  const [matches, setMatches] = useState({}); // { componentId: imageId }
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [uploadingImage, setUploadingImage] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  // Use ref to track if component is still mounted
  const isMountedRef = useRef(true);
  const abortControllerRef = useRef(null);
  const fileInputRef = useRef(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    };
  }, []);

  // Input validation helper
  const validateInputs = useCallback((comps, imgs) => {
    if (!Array.isArray(comps)) {
      throw new Error('Components must be an array');
    }
    if (!Array.isArray(imgs)) {
      throw new Error('ExtractedImages must be an array');
    }
    return true;
  }, []);

  // Safe data normalization
  const normalizeComponent = useCallback((comp, index) => {
    if (typeof comp === 'string') {
      return { id: `comp-${index}`, name: comp.trim() };
    }
    if (comp && typeof comp === 'object') {
      return {
        id: comp.id || `comp-${index}`,
        name: String(comp.name || comp.label || 'unnamed-component').trim()
      };
    }
    return { id: `comp-${index}`, name: 'unknown-component' };
  }, []);

  const normalizeImage = useCallback((img, index) => {
    if (typeof img === 'string') {
      return { 
        id: `img-${index}`, 
        name: img.trim(), 
        path: img.trim(),
        preview: img.trim()
      };
    }
    if (img && typeof img === 'object') {
      return {
        id: img.id || `img-${index}`,
        name: String(img.name || img.filename || 'unknown-image').trim(),
        path: String(img.path || img.url || img.src || '').trim(),
        preview: String(img.preview || img.thumbnail || img.path || img.url || img.src || '').trim()
      };
    }
    return { 
      id: `img-${index}`, 
      name: 'unknown-image', 
      path: '',
      preview: ''
    };
  }, []);

  // Fetch with timeout and retry logic
  const fetchWithRetry = useCallback(async (url, options, retries = MAX_RETRIES) => {
    for (let attempt = 0; attempt <= retries; attempt++) {
      let controller = null;
      let timeoutId = null;

      try {
        controller = new window.AbortController();
        abortControllerRef.current = controller;

        timeoutId = setTimeout(() => {
          if (controller) {
            controller.abort();
          }
        }, FETCH_TIMEOUT);

        const response = await fetch(url, {
          ...options,
          signal: controller.signal
        });

        if (timeoutId) {
          clearTimeout(timeoutId);
        }

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        return await response.json();
      } catch (err) {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }

        if (err.name === 'AbortError') {
          throw new Error('Request timed out');
        }

        if (attempt === retries) {
          throw err;
        }

        // Wait before retry (exponential backoff)
        await new Promise(resolve =>
          setTimeout(resolve, RETRY_DELAY * Math.pow(2, attempt))
        );
      }
    }
  }, []);

  // Main data fetching logic
  const fetchMatchingData = useCallback(async (comps, imgs, callback) => {
    if (!isMountedRef.current) return;

    try {
      validateInputs(comps, imgs);

      if (comps.length === 0 && imgs.length === 0) {
        setLoading(false);
        return;
      }

      setLoading(true);
      setError('');
      setRetryCount(prev => prev + 1);

      const normalizedComponents = comps.map(normalizeComponent);
      const normalizedImages = imgs.map(normalizeImage);

      const payload = {
        components: normalizedComponents.map(c => c.name),
        previouslyExtractedImages: normalizedImages,
        metadata: {
          timestamp: new Date().toISOString(),
          componentCount: normalizedComponents.length,
          imageCount: normalizedImages.length
        }
      };

      const data = await fetchWithRetry(`${BACKEND_URL}/match-images`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!isMountedRef.current) return;

      if (data && data.success) {
        const safeComponents = Array.isArray(data.components) 
          ? data.components.map(normalizeComponent)
          : normalizedComponents;
        const safeImages = Array.isArray(data.images) 
          ? data.images.map(normalizeImage)
          : normalizedImages;

        setMatchingComponents(safeComponents);
        setAvailableImages(safeImages);

        if (typeof callback === 'function') {
          try {
            callback({
              components: safeComponents,
              images: safeImages,
              success: true
            });
          } catch (callbackError) {
            console.warn('onMatchingComplete callback error:', callbackError);
          }
        }
      } else {
        throw new Error(data && (data.error || data.message) || 'Unknown server error');
      }
    } catch (err) {
      if (!isMountedRef.current) return;

      console.error('ImageMatcher fetch error:', err);
      const errorMessage = err.message || 'An unexpected error occurred';
      setError(errorMessage);

      if (typeof callback === 'function') {
        try {
          callback({
            components: [],
            images: [],
            success: false,
            error: errorMessage
          });
        } catch (callbackError) {
          console.warn('onMatchingComplete callback error:', callbackError);
        }
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
      if (abortControllerRef.current) {
        abortControllerRef.current = null;
      }
    }
  }, [validateInputs, normalizeComponent, normalizeImage, fetchWithRetry]);

  useEffect(() => {
    fetchMatchingData(components, extractedImages, onMatchingComplete);
  }, [components, extractedImages, onMatchingComplete, fetchMatchingData]);

  // Handle drag end
  const handleDragEnd = useCallback((result) => {
    const { destination, source, draggableId } = result;

    // If dropped outside a droppable area
    if (!destination) {
      return;
    }

    // If dropped in the same place
    if (destination.droppableId === source.droppableId && 
        destination.index === source.index) {
      return;
    }

    // Handle image to component matching
    if (source.droppableId === 'available-images' && 
        destination.droppableId.startsWith('component-')) {
      const componentId = destination.droppableId.replace('component-', '');
      const imageId = draggableId;
      
      setMatches(prev => ({
        ...prev,
        [componentId]: imageId
      }));
    }

    // Handle removing match (dragging back to available images)
    if (source.droppableId.startsWith('component-') && 
        destination.droppableId === 'available-images') {
      const componentId = source.droppableId.replace('component-', '');
      
      setMatches(prev => {
        const newMatches = { ...prev };
        delete newMatches[componentId];
        return newMatches;
      });
    }
  }, []);

  // Handle image upload
  const handleImageUpload = useCallback(async (event) => {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;

    setUploadingImage(true);
    setError('');

    try {
      const formData = new FormData();
      files.forEach(file => {
        formData.append('images', file);
      });

      if (projectId) {
        formData.append('projectId', projectId);
      }

      const response = await fetchWithRetry(`${BACKEND_URL}/upload-images`, {
        method: 'POST',
        body: formData
      });

      if (response && response.success) {
        const newImages = response.images.map(normalizeImage);
        setAvailableImages(prev => [...prev, ...newImages]);
      } else {
        throw new Error(response?.error || 'Failed to upload images');
      }
    } catch (err) {
      console.error('Image upload error:', err);
      setError(`Upload failed: ${err.message}`);
    } finally {
      setUploadingImage(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }, [projectId, fetchWithRetry, normalizeImage]);

  // Save matches
  const saveMatches = useCallback(async () => {
    if (Object.keys(matches).length === 0) {
      setError('No matches to save');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const payload = {
        projectId,
        matches,
        timestamp: new Date().toISOString()
      };

      const response = await fetchWithRetry(`${BACKEND_URL}/save-matches`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (response && response.success) {
        // Success feedback could go here
        console.log('Matches saved successfully');
      } else {
        throw new Error(response?.error || 'Failed to save matches');
      }
    } catch (err) {
      console.error('Save matches error:', err);
      setError(`Save failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [matches, projectId, fetchWithRetry]);

  const handleRetry = useCallback(() => {
    setError('');
    fetchMatchingData(components, extractedImages, onMatchingComplete);
  }, [components, extractedImages, onMatchingComplete, fetchMatchingData]);

  const handleImageError = useCallback((e, imgName) => {
    if (e && e.target) {
      e.target.style.backgroundColor = '#f0f0f0';
      e.target.style.border = '2px dashed #ccc';
      e.target.alt = `Failed to load: ${imgName}`;
      e.target.title = `Image failed to load: ${imgName}`;
    }
  }, []);

  // Get available images (not currently matched)
  const getAvailableImages = useCallback(() => {
    const matchedImageIds = Object.values(matches);
    return availableImages.filter(img => !matchedImageIds.includes(img.id));
  }, [availableImages, matches]);

  if (loading && matchingComponents.length === 0) {
    return (
      <div style={{
        padding: '20px',
        textAlign: 'center',
        border: '1px solid #ddd',
        borderRadius: '8px',
        backgroundColor: '#f9f9f9'
      }}>
        <div style={{ marginBottom: '10px' }}>Loading matching interface...</div>
        {retryCount > 1 && (
          <div style={{ fontSize: '12px', color: '#666' }}>
            Attempt {retryCount}
          </div>
        )}
      </div>
    );
  }

  if (error && matchingComponents.length === 0) {
    return (
      <div style={{
        padding: '20px',
        color: '#d32f2f',
        border: '2px solid #d32f2f',
        borderRadius: '8px',
        backgroundColor: '#ffebee'
      }}>
        <div style={{ fontWeight: 'bold', marginBottom: '10px' }}>
          Error Loading Matching Interface
        </div>
        <div style={{ marginBottom: '15px' }}>{error}</div>
        <button
          onClick={handleRetry}
          style={{
            padding: '8px 16px',
            backgroundColor: '#d32f2f',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
          onMouseOver={(e) => e.target.style.backgroundColor = '#b71c1c'}
          onMouseOut={(e) => e.target.style.backgroundColor = '#d32f2f'}
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <div style={{
        margin: '32px 0',
        border: '2px solid #1976d2',
        borderRadius: '8px',
        padding: '24px',
        backgroundColor: '#f5faff'
      }}>
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          marginBottom: '20px'
        }}>
          <h2 style={{ margin: 0, color: '#1976d2' }}>
            Component to Image Matching
          </h2>
          
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*"
              onChange={handleImageUpload}
              style={{ display: 'none' }}
            />
            
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingImage}
              style={{
                padding: '8px 16px',
                backgroundColor: '#4caf50',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: uploadingImage ? 'not-allowed' : 'pointer',
                opacity: uploadingImage ? 0.6 : 1
              }}
            >
              {uploadingImage ? 'Uploading...' : 'Upload Images'}
            </button>

            <button
              onClick={saveMatches}
              disabled={loading || Object.keys(matches).length === 0}
              style={{
                padding: '8px 16px',
                backgroundColor: '#2196f3',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: (loading || Object.keys(matches).length === 0) ? 'not-allowed' : 'pointer',
                opacity: (loading || Object.keys(matches).length === 0) ? 0.6 : 1
              }}
            >
              {loading ? 'Saving...' : `Save Matches (${Object.keys(matches).length})`}
            </button>
          </div>
        </div>

        {error && (
          <div style={{
            padding: '10px',
            marginBottom: '20px',
            backgroundColor: '#ffebee',
            border: '1px solid #f44336',
            borderRadius: '4px',
            color: '#d32f2f'
          }}>
            {error}
          </div>
        )}

        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 2fr 1fr',
          gap: '20px',
          minHeight: '400px'
        }}>
          {/* Components Column */}
          <div>
            <h3 style={{ marginTop: 0 }}>
              Components ({matchingComponents.length})
            </h3>
            <div style={{
              maxHeight: '500px',
              overflowY: 'auto',
              border: '1px solid #ddd',
              borderRadius: '4px',
              padding: '8px'
            }}>
              {matchingComponents.map((comp) => {
                const matchedImageId = matches[comp.id];
                const matchedImage = matchedImageId 
                  ? availableImages.find(img => img.id === matchedImageId)
                  : null;

                return (
                  <Droppable key={comp.id} droppableId={`component-${comp.id}`}>
                    {(provided, snapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                        style={{
                          padding: '12px',
                          margin: '8px 0',
                          backgroundColor: snapshot.isDraggingOver 
                            ? '#e8f5e8' 
                            : matchedImage 
                              ? '#e3f2fd' 
                              : '#f5f5f5',
                          borderRadius: '4px',
                          border: snapshot.isDraggingOver 
                            ? '2px dashed #4caf50' 
                            : matchedImage 
                              ? '2px solid #2196f3'
                              : '1px solid #ddd',
                          minHeight: '60px',
                          display: 'flex',
                          flexDirection: 'column',
                          justifyContent: 'center'
                        }}
                      >
                        <div style={{ 
                          fontWeight: 'bold', 
                          marginBottom: matchedImage ? '8px' : '0'
                        }}>
                          {comp.name}
                        </div>
                        
                        {matchedImage && (
                          <Draggable draggableId={matchedImage.id} index={0}>
                            {(provided, snapshot) => (
                              <div
                                ref={provided.innerRef}
                                {...provided.draggableProps}
                                {...provided.dragHandleProps}
                                style={{
                                  ...provided.draggableProps.style,
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '8px',
                                  padding: '4px',
                                  backgroundColor: snapshot.isDragging ? '#fff' : 'transparent',
                                  borderRadius: '2px',
                                  cursor: 'grab'
                                }}
                              >
                                <img
                                  src={`${BACKEND_URL}${matchedImage.preview}`}
                                  alt={matchedImage.name}
                                  style={{
                                    width: '40px',
                                    height: '40px',
                                    objectFit: 'contain',
                                    borderRadius: '2px',
                                    border: '1px solid #ccc',
                                    background: '#f8f8f8'
                                  }}
                                  onError={(e) => handleImageError(e, matchedImage.name)}
                                />
                                <span style={{ fontSize: '12px', color: '#666' }}>
                                  {matchedImage.name}
                                </span>
                              </div>
                            )}
                          </Draggable>
                        )}
                        
                        {!matchedImage && (
                          <div style={{ 
                            fontSize: '12px', 
                            color: '#999',
                            fontStyle: 'italic'
                          }}>
                            Drag an image here
                          </div>
                        )}
                        
                        {provided.placeholder}
                      </div>
                    )}
                  </Droppable>
                );
              })}
            </div>
          </div>

          {/* Available Images Column */}
          <div>
            <h3 style={{ marginTop: 0 }}>
              Available Images ({getAvailableImages().length})
            </h3>
            <Droppable droppableId="available-images" direction="horizontal">
              {(provided, snapshot) => (
                <div
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
                    gap: '10px',
                    maxHeight: '500px',
                    overflowY: 'auto',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                    padding: '8px',
                    backgroundColor: snapshot.isDraggingOver ? '#f0f8ff' : 'white'
                  }}
                >
                  {getAvailableImages().map((img, index) => (
                    <Draggable key={img.id} draggableId={img.id} index={index}>
                      {(provided, snapshot) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.draggableProps}
                          {...provided.dragHandleProps}
                          style={{
                            ...provided.draggableProps.style,
                            textAlign: 'center',
                            cursor: 'grab',
                            opacity: snapshot.isDragging ? 0.8 : 1,
                            transform: snapshot.isDragging 
                              ? `${provided.draggableProps.style?.transform} rotate(5deg)`
                              : provided.draggableProps.style?.transform
                          }}
                        >
                          <img
                            src={`${BACKEND_URL}${img.preview}`}
                            alt={img.name}
                            title={img.name}
                            style={{
                              width: '120px',
                              height: '120px',
                              objectFit: 'contain',
                              border: '1px solid #ccc',
                              borderRadius: '4px',
                              backgroundColor: 'white',
                              transition: 'transform 0.2s'
                            }}
                            onError={(e) => handleImageError(e, img.name)}
                          />
                          <div style={{
                            fontSize: '12px',
                            marginTop: '4px',
                            wordBreak: 'break-word',
                            maxWidth: '120px',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap'
                          }}
                          title={img.name}
                          >
                            {img.name}
                          </div>
                        </div>
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                  
                  {getAvailableImages().length === 0 && (
                    <div style={{
                      gridColumn: '1 / -1',
                      color: '#666',
                      fontStyle: 'italic',
                      textAlign: 'center',
                      padding: '40px 20px'
                    }}>
                      {availableImages.length === 0 
                        ? 'No images available. Upload some images to get started.'
                        : 'All images are currently matched. Upload more images if needed.'
                      }
                    </div>
                  )}
                </div>
              )}
            </Droppable>
          </div>

          {/* Matches Summary Column */}
          <div>
            <h3 style={{ marginTop: 0 }}>
              Matches ({Object.keys(matches).length})
            </h3>
            <div style={{
              fontSize: '14px',
              border: '1px solid #ddd',
              borderRadius: '4px',
              padding: '8px',
              maxHeight: '500px',
              overflowY: 'auto',
              backgroundColor: 'white'
            }}>
              {Object.entries(matches).map(([componentId, imageId]) => {
                const component = matchingComponents.find(c => c.id === componentId);
                const image = availableImages.find(i => i.id === imageId);
                
                if (!component || !image) return null;
                
                return (
                  <div
                    key={`match-${componentId}-${imageId}`}
                    style={{
                      marginBottom: '12px',
                      padding: '8px',
                      backgroundColor: '#f9f9f9',
                      borderRadius: '4px',
                      border: '1px solid #e0e0e0'
                    }}
                  >
                    <div style={{ 
                      fontWeight: 'bold', 
                      marginBottom: '4px',
                      color: '#1976d2'
                    }}>
                      {component.name}
                    </div>
                    <div style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: '8px'
                    }}>
                      <img
                        src={`${BACKEND_URL}${image.preview}`}
                        alt={image.name}
                        style={{
                          width: '30px',
                          height: '30px',
                          objectFit: 'contain',
                          borderRadius: '2px',
                          border: '1px solid #ccc',
                          background: '#f8f8f8'
                        }}
                        onError={(e) => handleImageError(e, image.name)}
                      />
                      <span style={{ 
                        fontSize: '12px', 
                        color: '#666',
                        wordBreak: 'break-word'
                      }}>
                        {image.name}
                      </span>
                    </div>
                  </div>
                );
              })}
              
              {Object.keys(matches).length === 0 && (
                <div style={{
                  color: '#666',
                  fontStyle: 'italic',
                  textAlign: 'center',
                  padding: '20px'
                }}>
                  No matches yet. Drag images onto components to create matches.
                </div>
              )}
            </div>
          </div>
        </div>

        {process.env.NODE_ENV === 'development' && (
          <div style={{
            marginTop: '20px',
            padding: '10px',
            backgroundColor: '#f0f0f0',
            borderRadius: '4px',
            fontSize: '12px',
            color: '#666'
          }}>
            <strong>Debug Info:</strong> Components: {components.length},
            Images: {extractedImages.length},
            Available: {getAvailableImages().length},
            Matches: {Object.keys(matches).length},
            Retries: {retryCount}
          </div>
        )}
      </div>
    </DragDropContext>
  );
}

export default ImageMatcher;