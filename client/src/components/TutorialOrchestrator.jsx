import React, { useState, useCallback } from 'react';
import { orchestrateExtractionAdvanced } from '../utils/orchestrate';
import { buildStoryboard, generateSectionsFromPages, buildChapters, generateConcatFile } from '../utils/storyboard';

const TutorialOrchestrator = () => {
  const [pdfUrl, setPdfUrl] = useState('https://arxiv.org/pdf/2106.14881.pdf');
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [language, setLanguage] = useState('fr');
  const [isProcessing, setIsProcessing] = useState(false);
  const [results, setResults] = useState(null);
  const [storyboard, setStoryboard] = useState(null);
  const [chapters, setChapters] = useState(null);
  const [options, setOptions] = useState({
    dpi: '300',
    trim: '1',
    convert: '1',
    bgremove: '0',
    bgthreshold: '245',
    minW: '300',
    minH: '300',
    maxAspect: '5',
    boostFactor: '1.2',
    embeddedBoost: '1.04',
  });

  const handleOrchestrate = useCallback(async () => {
    if (!pdfUrl) {
      alert('Please provide a PDF URL');
      return;
    }

    setIsProcessing(true);
    setResults(null);
    setStoryboard(null);
    setChapters(null);

    try {
      // Step 1: Orchestrate detection + extraction
      const result = await orchestrateExtractionAdvanced({
        pdfUrl,
        websiteUrl,
        lang: language,
        includeWebsite: true,
        options
      });

      setResults(result);

      // Step 2: Generate sections and storyboard
      const sections = generateSectionsFromPages(result.detectedPages, 4.0);
      const shots = buildStoryboard({
        detectedPages: result.detectedPages,
        images: result.extract.images || [],
        sections
      });

      setStoryboard(shots);

      // Step 3: Build YouTube chapters
      const chapterData = buildChapters(sections);
      setChapters(chapterData);

      console.log('🎯 Orchestration complete:', {
        detectedPages: result.detectedPages,
        extractedImages: result.extract.images?.length || 0,
        sections: sections.length,
        shots: shots.length,
        totalDuration: chapterData.totalDuration
      });

    } catch (error) {
      console.error('Orchestration failed:', error);
      alert(`Error: ${error.message}`);
    } finally {
      setIsProcessing(false);
    }
  }, [pdfUrl, websiteUrl, language, options]);

  const downloadConcatFile = useCallback(() => {
    if (!storyboard) return;

    const content = generateConcatFile(storyboard);
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'tutorial_concat.txt';
    a.click();
    URL.revokeObjectURL(url);
  }, [storyboard]);

  const downloadChapters = useCallback(() => {
    if (!chapters) return;

    const content = chapters.chapters;
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'youtube_chapters.txt';
    a.click();
    URL.revokeObjectURL(url);
  }, [chapters]);

  return (
    <div style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto' }}>
      <h1>🎬 A→Z Tutorial Generator</h1>
      
      {/* Input Form */}
      <div style={{ marginBottom: '30px', padding: '20px', border: '1px solid #ddd', borderRadius: '8px' }}>
        <h2>📋 Configuration</h2>
        
        <div style={{ marginBottom: '15px' }}>
          <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
            PDF URL (Required):
          </label>
          <input
            type="url"
            value={pdfUrl}
            onChange={(e) => setPdfUrl(e.target.value)}
            placeholder="https://example.com/rulebook.pdf"
            style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}
          />
        </div>

        <div style={{ marginBottom: '15px' }}>
          <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
            Website URL (Optional):
          </label>
          <input
            type="url"
            value={websiteUrl}
            onChange={(e) => setWebsiteUrl(e.target.value)}
            placeholder="https://boardgamegeek.com/boardgame/..."
            style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}
          />
        </div>

        <div style={{ marginBottom: '15px' }}>
          <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
            Language:
          </label>
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            style={{ padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}
          >
            <option value="en">English</option>
            <option value="fr">Français</option>
            <option value="es">Español</option>
            <option value="de">Deutsch</option>
            <option value="it">Italiano</option>
          </select>
        </div>

        {/* Advanced Options */}
        <details style={{ marginBottom: '15px' }}>
          <summary style={{ cursor: 'pointer', fontWeight: 'bold' }}>⚙️ Advanced Options</summary>
          <div style={{ marginTop: '10px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px' }}>
            {Object.entries(options).map(([key, value]) => (
              <div key={key}>
                <label style={{ display: 'block', fontSize: '12px', marginBottom: '2px' }}>{key}:</label>
                <input
                  type="text"
                  value={value}
                  onChange={(e) => setOptions(prev => ({ ...prev, [key]: e.target.value }))}
                  style={{ width: '100%', padding: '4px', fontSize: '12px', borderRadius: '3px', border: '1px solid #ccc' }}
                />
              </div>
            ))}
          </div>
        </details>

        <button
          onClick={handleOrchestrate}
          disabled={isProcessing}
          style={{
            padding: '12px 24px',
            backgroundColor: isProcessing ? '#ccc' : '#007bff',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: isProcessing ? 'not-allowed' : 'pointer',
            fontSize: '16px',
            fontWeight: 'bold'
          }}
        >
          {isProcessing ? '🔄 Processing...' : '🚀 Generate Tutorial'}
        </button>
      </div>

      {/* Results */}
      {results && (
        <div style={{ marginBottom: '30px' }}>
          <h2>📊 Orchestration Results</h2>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '15px', marginBottom: '20px' }}>
            <div style={{ padding: '15px', backgroundColor: '#f8f9fa', borderRadius: '8px' }}>
              <h3>🎯 Actions Detection</h3>
              <p><strong>Pages Found:</strong> {results.detectedPages.length}</p>
              <p><strong>Pages:</strong> {results.detectedPages.join(', ') || 'None'}</p>
              {results.metadata.detectError && (
                <p style={{ color: 'red', fontSize: '12px' }}>Error: {results.metadata.detectError}</p>
              )}
            </div>

            <div style={{ padding: '15px', backgroundColor: '#f8f9fa', borderRadius: '8px' }}>
              <h3>🖼️ Component Extraction</h3>
              <p><strong>Images:</strong> {results.metadata.imagesExtracted}</p>
              <p><strong>Source:</strong> {results.extract.source}</p>
              <p><strong>Cache:</strong> {results.extract.cache}</p>
              {results.extract.popplerMissing && (
                <p style={{ color: 'orange', fontSize: '12px' }}>⚠️ Poppler missing - PDF extraction disabled</p>
              )}
            </div>

            <div style={{ padding: '15px', backgroundColor: '#f8f9fa', borderRadius: '8px' }}>
              <h3>⚙️ Options Applied</h3>
              <div style={{ fontSize: '12px' }}>
                {Object.entries(results.metadata.options).map(([key, value]) => (
                  <div key={key}><strong>{key}:</strong> {value}</div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Top Images */}
      {results?.extract?.images && results.extract.images.length > 0 && (
        <div style={{ marginBottom: '30px' }}>
          <h2>🏆 Top 5 Images (by Score)</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px' }}>
            {results.extract.images
              .slice()
              .sort((a, b) => (b.score || 0) - (a.score || 0))
              .slice(0, 5)
              .map((img, index) => (
                <div key={index} style={{ border: '1px solid #ddd', borderRadius: '8px', overflow: 'hidden' }}>
                  <div style={{ position: 'relative' }}>
                    <img
                      src={img.url}
                      alt={`Top ${index + 1}`}
                      style={{ width: '100%', height: '150px', objectFit: 'cover' }}
                    />
                    <div style={{ position: 'absolute', top: '5px', left: '5px', display: 'flex', gap: '3px' }}>
                      <span style={{ background: 'rgba(52,152,219,0.9)', color: 'white', padding: '2px 6px', borderRadius: '3px', fontSize: '10px' }}>
                        {img.source}
                      </span>
                      {img.page && (
                        <span style={{ background: 'rgba(155,89,182,0.9)', color: 'white', padding: '2px 6px', borderRadius: '3px', fontSize: '10px' }}>
                          p.{img.page}
                        </span>
                      )}
                      <span style={{ background: 'rgba(231,76,60,0.9)', color: 'white', padding: '2px 6px', borderRadius: '3px', fontSize: '10px' }}>
                        {Math.round((img.score || 0) / 1000)}k
                      </span>
                    </div>
                  </div>
                  <div style={{ padding: '10px', fontSize: '12px' }}>
                    <div><strong>Page:</strong> {img.page || 'N/A'}</div>
                    <div><strong>Size:</strong> {img.width}×{img.height}</div>
                    <div><strong>Score:</strong> {img.score?.toLocaleString() || 'N/A'}</div>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Storyboard */}
      {storyboard && (
        <div style={{ marginBottom: '30px' }}>
          <h2>🎬 Storyboard ({storyboard.length} shots)</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '15px' }}>
            {storyboard.map((shot, index) => (
              <div key={index} style={{ border: '1px solid #ddd', borderRadius: '8px', padding: '15px' }}>
                <h4>{shot.title}</h4>
                {shot.imgUrl ? (
                  <img
                    src={shot.imgUrl}
                    alt={shot.title}
                    style={{ width: '100%', height: '120px', objectFit: 'cover', borderRadius: '4px', marginBottom: '10px' }}
                  />
                ) : (
                  <div style={{ width: '100%', height: '120px', backgroundColor: '#f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '4px', marginBottom: '10px' }}>
                    No Image
                  </div>
                )}
                <div style={{ fontSize: '12px' }}>
                  <div><strong>Duration:</strong> {shot.duration}s</div>
                  <div><strong>Page:</strong> {shot.page || 'N/A'}</div>
                  <div><strong>Source:</strong> {shot.source}</div>
                  <div><strong>Score:</strong> {shot.score?.toLocaleString() || 'N/A'}</div>
                </div>
              </div>
            ))}
          </div>
          
          <div style={{ marginTop: '15px' }}>
            <button
              onClick={downloadConcatFile}
              style={{ padding: '8px 16px', backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: '4px', marginRight: '10px', cursor: 'pointer' }}
            >
              📁 Download FFmpeg Concat File
            </button>
          </div>
        </div>
      )}

      {/* YouTube Chapters */}
      {chapters && (
        <div style={{ marginBottom: '30px' }}>
          <h2>📺 YouTube Chapters</h2>
          <p><strong>Total Duration:</strong> {chapters.formattedDuration}</p>
          <textarea
            value={chapters.chapters}
            readOnly
            style={{
              width: '100%',
              height: '200px',
              padding: '10px',
              border: '1px solid #ddd',
              borderRadius: '4px',
              fontFamily: 'monospace',
              fontSize: '12px',
              marginBottom: '10px'
            }}
          />
          <button
            onClick={downloadChapters}
            style={{ padding: '8px 16px', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
          >
            📁 Download Chapters
          </button>
        </div>
      )}

      {/* FFmpeg Command */}
      {storyboard && (
        <div style={{ marginBottom: '30px', padding: '15px', backgroundColor: '#f8f9fa', borderRadius: '8px' }}>
          <h3>🎥 FFmpeg Video Generation</h3>
          <p>After downloading the concat file, use this command to generate the video:</p>
          <code style={{ display: 'block', padding: '10px', backgroundColor: '#e9ecef', borderRadius: '4px', fontSize: '12px', marginTop: '5px' }}>
            ffmpeg -f concat -safe 0 -i tutorial_concat.txt -vsync vfr -pix_fmt yuv420p -r 30 tutorial_draft.mp4
          </code>
        </div>
      )}
    </div>
  );
};

export default TutorialOrchestrator;