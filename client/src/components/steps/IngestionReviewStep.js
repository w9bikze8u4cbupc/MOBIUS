import React from "react";

export function IngestionReviewStep({
  onRunIngestion,
  ingesting,
  rulebookText,
  ingestionManifest,
  ingestionError,
}) {
  const hasContent = rulebookText?.trim();
  
  return (
    <div className="pipeline-section fade-in">
      <h3>Ingestion & Extraction Review</h3>
      <p className="pipeline-muted" style={{ marginBottom: 16 }}>
        Analyze your rulebook to extract the outline, components, and structure before generating tutorial assets.
      </p>
      
      <div className="pipeline-actions" style={{ marginBottom: 16 }}>
        <button 
          className="pipeline-btn pipeline-btn-primary"
          onClick={onRunIngestion} 
          disabled={ingesting || !hasContent}
        >
          {ingesting ? (
            <>
              <span className="loading-spinner"></span>
              Analyzing Rulebook...
            </>
          ) : (
            "Run Ingestion Analysis"
          )}
        </button>
        
        {!hasContent && !ingesting && (
          <span className="status-badge status-badge-warning">
            Upload or paste rulebook content first
          </span>
        )}
      </div>
      
      {ingesting && (
        <div className="progress-bar-container">
          <div className="progress-bar-fill progress-bar-indeterminate"></div>
        </div>
      )}
      
      {ingestionError && (
        <div className="status-badge status-badge-error" style={{ display: 'block', padding: '10px 14px', marginBottom: 12 }}>
          {ingestionError}
        </div>
      )}
      
      {ingestionManifest && (
        <div className="pipeline-card fade-in" style={{ marginTop: 16 }}>
          <div className="pipeline-card-header">
            <h4 style={{ margin: 0 }}>Ingestion Results</h4>
            <span className="status-badge status-badge-success">
              Analysis Complete
            </span>
          </div>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16 }}>
            <div className="pipeline-card" style={{ textAlign: 'center', padding: 12 }}>
              <div style={{ fontSize: 24, fontWeight: 'bold', color: '#1976d2' }}>
                {ingestionManifest.outline?.length || 0}
              </div>
              <div className="pipeline-muted">Headings</div>
            </div>
            <div className="pipeline-card" style={{ textAlign: 'center', padding: 12 }}>
              <div style={{ fontSize: 24, fontWeight: 'bold', color: '#43a047' }}>
                {ingestionManifest.components?.length || 0}
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
                  +{ingestionManifest.outline.length - 5} more headings
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
