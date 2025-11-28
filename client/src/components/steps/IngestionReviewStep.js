import React, { useState } from "react";

export function IngestionReviewStep({
  onRunIngestion,
  ingesting,
  rulebookText,
  ingestionManifest,
  ingestionError,
  gameName,
  gameComponents,
  setGameComponents,
  onExtractComponents,
  extractingComponents,
}) {
  const hasContent = rulebookText?.trim();
  const [editingComponent, setEditingComponent] = useState(null);
  const [newComponent, setNewComponent] = useState({ name: '', quantity: '', category: 'other', details: '' });
  const [showAddForm, setShowAddForm] = useState(false);
  
  const categoryIcons = {
    cards: '🃏',
    tokens: '🪙',
    boards: '📋',
    tiles: '🧩',
    dice: '🎲',
    meeples: '🧍',
    miniatures: '🎭',
    markers: '📍',
    cubes: '🔲',
    other: '📦'
  };
  
  const categoryColors = {
    cards: '#e3f2fd',
    tokens: '#fff3e0',
    boards: '#e8f5e9',
    tiles: '#fce4ec',
    dice: '#f3e5f5',
    meeples: '#e0f7fa',
    miniatures: '#fff8e1',
    markers: '#ede7f6',
    cubes: '#e8eaf6',
    other: '#f5f5f5'
  };
  
  const handleUpdateComponent = (id, field, value) => {
    setGameComponents(prev => prev.map(comp => 
      comp.id === id ? { ...comp, [field]: value } : comp
    ));
  };
  
  const handleDeleteComponent = (id) => {
    setGameComponents(prev => prev.filter(comp => comp.id !== id));
  };
  
  const handleAddComponent = () => {
    if (newComponent.name.trim()) {
      const id = `comp-${Date.now()}`;
      setGameComponents(prev => [...prev, { ...newComponent, id }]);
      setNewComponent({ name: '', quantity: '', category: 'other', details: '' });
      setShowAddForm(false);
    }
  };
  
  const groupedComponents = gameComponents?.reduce((acc, comp) => {
    const cat = comp.category || 'other';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(comp);
    return acc;
  }, {}) || {};
  
  return (
    <div className="pipeline-section fade-in">
      <h3>Ingestion & Component Extraction</h3>
      <p className="pipeline-muted" style={{ marginBottom: 16 }}>
        Analyze your rulebook to extract the complete list of game components with exact quantities.
      </p>
      
      <div className="pipeline-actions" style={{ marginBottom: 16, display: 'flex', gap: 12 }}>
        <button 
          className="pipeline-btn pipeline-btn-primary"
          onClick={onExtractComponents} 
          disabled={extractingComponents || !hasContent}
        >
          {extractingComponents ? (
            <>
              <span className="loading-spinner"></span>
              Extracting Components...
            </>
          ) : (
            <>
              📦 Extract Game Components
            </>
          )}
        </button>
        
        <button 
          className="pipeline-btn"
          onClick={onRunIngestion} 
          disabled={ingesting || !hasContent}
          style={{ background: '#f5f5f5' }}
        >
          {ingesting ? (
            <>
              <span className="loading-spinner"></span>
              Analyzing Structure...
            </>
          ) : (
            "Analyze Document Structure"
          )}
        </button>
        
        {!hasContent && !ingesting && (
          <span className="status-badge status-badge-warning">
            Upload or paste rulebook content first
          </span>
        )}
      </div>
      
      {(ingesting || extractingComponents) && (
        <div className="progress-bar-container">
          <div className="progress-bar-fill progress-bar-indeterminate"></div>
        </div>
      )}
      
      {ingestionError && (
        <div className="status-badge status-badge-error" style={{ display: 'block', padding: '10px 14px', marginBottom: 12 }}>
          {ingestionError}
        </div>
      )}
      
      {/* Game Components Section */}
      {gameComponents && gameComponents.length > 0 && (
        <div className="pipeline-card fade-in" style={{ marginTop: 16 }}>
          <div className="pipeline-card-header" style={{ marginBottom: 16 }}>
            <h4 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
              📦 Game Components
              <span className="status-badge status-badge-success">
                {gameComponents.length} items found
              </span>
            </h4>
            <button 
              className="pipeline-btn"
              onClick={() => setShowAddForm(true)}
              style={{ fontSize: 13, padding: '4px 12px' }}
            >
              + Add Component
            </button>
          </div>
          
          {/* Add Component Form */}
          {showAddForm && (
            <div className="pipeline-card" style={{ marginBottom: 16, background: '#f8f9fa', padding: 16 }}>
              <h5 style={{ margin: '0 0 12px 0' }}>Add New Component</h5>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 2fr', gap: 8, marginBottom: 12 }}>
                <input
                  type="text"
                  placeholder="Component name"
                  value={newComponent.name}
                  onChange={(e) => setNewComponent(prev => ({ ...prev, name: e.target.value }))}
                  className="pipeline-input"
                />
                <input
                  type="text"
                  placeholder="Quantity"
                  value={newComponent.quantity}
                  onChange={(e) => setNewComponent(prev => ({ ...prev, quantity: e.target.value }))}
                  className="pipeline-input"
                />
                <select
                  value={newComponent.category}
                  onChange={(e) => setNewComponent(prev => ({ ...prev, category: e.target.value }))}
                  className="pipeline-input"
                >
                  <option value="cards">Cards</option>
                  <option value="tokens">Tokens</option>
                  <option value="boards">Boards</option>
                  <option value="tiles">Tiles</option>
                  <option value="dice">Dice</option>
                  <option value="meeples">Meeples</option>
                  <option value="miniatures">Miniatures</option>
                  <option value="markers">Markers</option>
                  <option value="cubes">Cubes</option>
                  <option value="other">Other</option>
                </select>
                <input
                  type="text"
                  placeholder="Details (colors, materials, etc.)"
                  value={newComponent.details}
                  onChange={(e) => setNewComponent(prev => ({ ...prev, details: e.target.value }))}
                  className="pipeline-input"
                />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="pipeline-btn pipeline-btn-primary" onClick={handleAddComponent}>
                  Add
                </button>
                <button className="pipeline-btn" onClick={() => setShowAddForm(false)}>
                  Cancel
                </button>
              </div>
            </div>
          )}
          
          {/* Components grouped by category */}
          {Object.entries(groupedComponents).map(([category, components]) => (
            <div key={category} style={{ marginBottom: 20 }}>
              <h5 style={{ 
                margin: '0 0 10px 0', 
                display: 'flex', 
                alignItems: 'center', 
                gap: 8,
                color: '#555',
                textTransform: 'capitalize'
              }}>
                {categoryIcons[category] || '📦'} {category}
                <span style={{ 
                  fontSize: 12, 
                  background: '#e0e0e0', 
                  padding: '2px 8px', 
                  borderRadius: 10,
                  fontWeight: 'normal'
                }}>
                  {components.length}
                </span>
              </h5>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {components.map((comp) => (
                  <div 
                    key={comp.id}
                    style={{ 
                      display: 'grid',
                      gridTemplateColumns: editingComponent === comp.id ? '2fr 1fr 2fr auto' : '2fr 1fr 2fr auto',
                      gap: 12,
                      alignItems: 'center',
                      padding: '10px 14px',
                      background: categoryColors[category] || '#f5f5f5',
                      borderRadius: 8,
                      border: '1px solid #e0e0e0'
                    }}
                  >
                    {editingComponent === comp.id ? (
                      <>
                        <input
                          type="text"
                          value={comp.name}
                          onChange={(e) => handleUpdateComponent(comp.id, 'name', e.target.value)}
                          className="pipeline-input"
                          style={{ fontSize: 14 }}
                        />
                        <input
                          type="text"
                          value={comp.quantity}
                          onChange={(e) => handleUpdateComponent(comp.id, 'quantity', e.target.value)}
                          className="pipeline-input"
                          style={{ fontSize: 14 }}
                        />
                        <input
                          type="text"
                          value={comp.details}
                          onChange={(e) => handleUpdateComponent(comp.id, 'details', e.target.value)}
                          className="pipeline-input"
                          placeholder="Details"
                          style={{ fontSize: 14 }}
                        />
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button 
                            className="pipeline-btn pipeline-btn-primary"
                            onClick={() => setEditingComponent(null)}
                            style={{ padding: '4px 10px', fontSize: 12 }}
                          >
                            Done
                          </button>
                          <button 
                            className="pipeline-btn"
                            onClick={() => handleDeleteComponent(comp.id)}
                            style={{ padding: '4px 10px', fontSize: 12, color: '#d32f2f' }}
                          >
                            Delete
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        <div style={{ fontWeight: 500 }}>{comp.name}</div>
                        <div style={{ 
                          fontWeight: 600, 
                          color: '#1976d2',
                          background: 'white',
                          padding: '2px 8px',
                          borderRadius: 4,
                          textAlign: 'center',
                          fontSize: 13
                        }}>
                          {comp.quantity}
                        </div>
                        <div style={{ color: '#666', fontSize: 13 }}>
                          {comp.details || '-'}
                        </div>
                        <button 
                          className="pipeline-btn"
                          onClick={() => setEditingComponent(comp.id)}
                          style={{ padding: '4px 10px', fontSize: 12 }}
                        >
                          Edit
                        </button>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      
      {/* Document Structure Section */}
      {ingestionManifest && (
        <div className="pipeline-card fade-in" style={{ marginTop: 16 }}>
          <div className="pipeline-card-header">
            <h4 style={{ margin: 0 }}>Document Structure</h4>
            <span className="status-badge status-badge-success">
              Analysis Complete
            </span>
          </div>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16 }}>
            <div className="pipeline-card" style={{ textAlign: 'center', padding: 12 }}>
              <div style={{ fontSize: 24, fontWeight: 'bold', color: '#1976d2' }}>
                {ingestionManifest.outline?.length || 0}
              </div>
              <div className="pipeline-muted">Sections</div>
            </div>
            <div className="pipeline-card" style={{ textAlign: 'center', padding: 12 }}>
              <div style={{ fontSize: 24, fontWeight: 'bold', color: '#43a047' }}>
                {gameComponents?.length || ingestionManifest.components?.length || 0}
              </div>
              <div className="pipeline-muted">Components</div>
            </div>
            <div className="pipeline-card" style={{ textAlign: 'center', padding: 12 }}>
              <div style={{ fontSize: 24, fontWeight: 'bold', color: '#f57c00' }}>
                {ingestionManifest.stats?.pageCount ?? ingestionManifest.assets?.pages?.length ?? 'N/A'}
              </div>
              <div className="pipeline-muted">Pages</div>
            </div>
          </div>
          
          {ingestionManifest.outline?.length > 0 && (
            <>
              <h5 style={{ marginBottom: 8 }}>Document Outline</h5>
              <ul style={{ margin: 0, paddingLeft: 20 }}>
                {ingestionManifest.outline.slice(0, 5).map((heading) => (
                  <li key={heading.id} style={{ marginBottom: 4 }}>
                    <strong>{heading.title}</strong>
                    <span className="pipeline-muted"> (page {heading.page})</span>
                  </li>
                ))}
              </ul>
              {ingestionManifest.outline.length > 5 && (
                <p className="pipeline-muted" style={{ marginTop: 8 }}>
                  +{ingestionManifest.outline.length - 5} more sections
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
