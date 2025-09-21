// Example integration for App.js or main component
// This shows how to use the PdfImageExtractorPanel with actions support

import React, { useState } from 'react';
import PdfImageExtractorPanel from './components/PdfImageExtractorPanel';

function App() {
  const [selectedImages, setSelectedImages] = useState([]);
  const [extractionContext, setExtractionContext] = useState(null);

  const handleImageSelection = (images, context) => {
    setSelectedImages(images);
    setExtractionContext(context);

    console.log('Selected images:', images);
    console.log('Extraction context:', context);

    // Handle different extraction types
    if (context.extractionType === 'actions') {
      console.log(
        'User selected action images from pages:',
        images.map(img => img.page).filter(Boolean)
      );
      // Process action images - these are specifically from "Actions" pages
      // They could be embedded images or 200 DPI page snapshots
    } else {
      console.log('User selected general PDF images');
      // Process general PDF extraction results
    }

    // Example: Add to your tutorial or game state
    // images.forEach(img => {
    //   addImageToTutorial(img, context.extractionType);
    // });
  };

  return (
    <div className="app">
      <h1>🎲 Mobius Games Tutorial Generator</h1>

      <PdfImageExtractorPanel onUse={handleImageSelection} />

      {selectedImages.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <h3>
            Selected Images ({extractionContext?.extractionType || 'general'})
          </h3>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
              gap: 10,
            }}
          >
            {selectedImages.map((img, i) => (
              <div
                key={i}
                style={{
                  border: '1px solid #ccc',
                  padding: 10,
                  borderRadius: 8,
                }}
              >
                <img
                  src={img.url}
                  alt={img.name}
                  style={{ width: '100%', height: 150, objectFit: 'contain' }}
                />
                <div style={{ fontSize: 12, marginTop: 5 }}>
                  <strong>{img.name}</strong>
                  <br />
                  {img.width}×{img.height}px
                  <br />
                  {img.page && `Page ${img.page}`}
                  <br />
                  {img.isActionImage && (
                    <span style={{ color: '#e74c3c' }}>🎯 Action Image</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
