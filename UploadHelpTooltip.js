import React, { useState } from 'react';

// Help tooltip component for PDF upload form
const UploadHelpTooltip = () => {
  const [isVisible, setIsVisible] = useState(false);
  
  const toggleTooltip = () => {
    setIsVisible(!isVisible);
  };
  
  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <button
        onClick={toggleTooltip}
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          fontSize: '16px',
          marginLeft: '10px',
          padding: '0',
          color: '#007bff'
        }}
        aria-label="Help"
      >
        ?
      </button>
      
      {isVisible && (
        <div
          style={{
            position: 'absolute',
            bottom: '100%',
            left: '50%',
            transform: 'translateX(-50%)',
            backgroundColor: '#fff',
            border: '1px solid #ccc',
            borderRadius: '5px',
            boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
            padding: '15px',
            minWidth: '300px',
            maxWidth: '400px',
            zIndex: 1000,
            marginBottom: '10px'
          }}
        >
          <div style={{ fontWeight: 'bold', marginBottom: '10px' }}>Supported PDFs</div>
          <div style={{ fontSize: '14px', marginBottom: '10px' }}>
            <p>• <strong>Text-based PDFs</strong> work best (most digital rulebooks)</p>
            <p>• Scanned PDFs require OCR to be enabled</p>
            <p>• Maximum file size: 50MB</p>
            <p>• Must contain a clear "Components" or "Contents" section</p>
          </div>
          
          <div style={{ fontWeight: 'bold', marginBottom: '10px' }}>OCR Enablement</div>
          <div style={{ fontSize: '14px', marginBottom: '10px' }}>
            <p>To enable OCR for scanned PDFs:</p>
            <p>1. Install Tesseract OCR on the server</p>
            <p>2. Set <code>OCR_ENABLE=true</code> in environment variables</p>
            <p>3. Optionally set <code>OCR_TIMEOUT_MS=30000</code> for timeout control</p>
            <p>4. Worker pool keeps low page concurrency for OCR (1-2 pages at a time)</p>
            <p>5. Workers are recycled after N jobs to prevent memory leaks</p>
          </div>
          
          <button
            onClick={toggleTooltip}
            style={{
              position: 'absolute',
              top: '5px',
              right: '10px',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: '16px',
              padding: '0'
            }}
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
};

export default UploadHelpTooltip;