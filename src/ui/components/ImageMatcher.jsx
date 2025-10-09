import React, { useEffect, useState, useCallback } from 'react';

const ItemTypes = {
  ASSET: 'asset',
  SLOT: 'slot'
};

export default function ImageMatcher({ projectId, chapters, matches, dispatch }) {
  const [assets, setAssets] = useState([]);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  // Mock asset loading - in a real implementation, this would fetch from the backend
  useEffect(() => {
    let mounted = true;
    setIsLoading(true);
    
    // Simulate API call
    setTimeout(() => {
      if (!mounted) return;
      
      // Mock asset library
      const mockAssets = [
        { id: 'asset1', fileName: 'board.png', previewUrl: 'https://placehold.co/100x100?text=Board', dimensions: '1920x1080' },
        { id: 'asset2', fileName: 'cards.png', previewUrl: 'https://placehold.co/100x100?text=Cards', dimensions: '1920x1080' },
        { id: 'asset3', fileName: 'tokens.png', previewUrl: 'https://placehold.co/100x100?text=Tokens', dimensions: '1920x1080' },
        { id: 'asset4', fileName: 'dice.png', previewUrl: 'https://placehold.co/100x100?text=Dice', dimensions: '1920x1080' },
      ];
      
      setAssets(mockAssets);
      setError(null);
      setIsLoading(false);
    }, 500);
    
    return () => {
      mounted = false;
    };
  }, [projectId]);

  const handleDrop = useCallback(
    ({ assetId, stepId }) => {
      dispatch({
        type: 'MATCH_ASSET_TO_STEP',
        payload: { stepId, assetId }
      });
    },
    [dispatch]
  );

  return (
    <div className="image-matcher">
      <header>
        <h2>Image Matcher</h2>
        <p>Drag assets onto steps to bind visuals. Autosaves with script state.</p>
        {isLoading && <span className="status loading">Loading library…</span>}
        {error && <span className="status error">{error}</span>}
      </header>

      <div className="matcher-body">
        <AssetLibrary assets={assets} />
        <ChapterMatchGrid
          chapters={chapters}
          matches={matches}
          onDrop={handleDrop}
          onRemove={(stepId) =>
            dispatch({
              type: 'UNMATCH_ASSET_FROM_STEP',
              payload: { stepId }
            })
          }
        />
      </div>
    </div>
  );
}

function AssetLibrary({ assets }) {
  return (
    <section className="asset-library" aria-label="Asset library">
      <h3>Available assets</h3>
      <ul>
        {assets.map((asset) => (
          <AssetCard key={asset.id} asset={asset} />
        ))}
      </ul>
    </section>
  );
}

function AssetCard({ asset }) {
  return (
    <li className="asset-card" draggable data-asset-id={asset.id}>
      <figure>
        <img src={asset.previewUrl} alt={asset.fileName} />
      </figure>
      <div className="asset-meta">
        <span className="asset-name">{asset.fileName}</span>
        <span className="asset-size">{asset.dimensions}</span>
      </div>
    </li>
  );
}

function ChapterMatchGrid({ chapters, matches, onDrop, onRemove }) {
  return (
    <section className="match-grid" aria-label="Chapter asset matches">
      {chapters.map((chapter) => (
        <ChapterMatches
          key={chapter.id}
          chapter={chapter}
          matches={matches}
          onDrop={onDrop}
          onRemove={onRemove}
        />
      ))}
    </section>
  );
}

function ChapterMatches({ chapter, matches, onDrop, onRemove }) {
  return (
    <div className="match-chapter">
      <h4>{chapter.title}</h4>
      <ol>
        {chapter.steps.map((step) => (
          <MatchSlot
            key={step.id}
            step={step}
            assetId={matches[step.id]}
            onDrop={onDrop}
            onRemove={onRemove}
          />
        ))}
      </ol>
    </div>
  );
}

function MatchSlot({ step, assetId, onDrop, onRemove }) {
  const handleDrop = (e) => {
    e.preventDefault();
    const assetId = e.dataTransfer.getData('text/plain');
    if (assetId) {
      onDrop({ stepId: step.id, assetId });
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  return (
    <li className="match-slot">
      <div className="slot-header">
        <span className="step-title">{step.text.substring(0, 30)}{step.text.length > 30 ? '...' : ''}</span>
        {assetId && (
          <button onClick={() => onRemove(step.id)} className="remove">
            Remove
          </button>
        )}
      </div>
      <div 
        className={`slot-canvas ${assetId ? 'filled' : 'empty'}`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
      >
        {assetId ? (
          <img src={`https://placehold.co/100x100?text=Asset+${assetId}`} alt={`Asset ${assetId}`} />
        ) : (
          <span className="placeholder">Drop asset here</span>
        )}
      </div>
    </li>
  );
}