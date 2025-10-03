import React from 'react';
import { orchestrateExtractionAdvanced } from '../utils/orchestrate';
import {
  buildStoryboard,
  generateSectionsFromPages,
  buildChapters,
  generateConcatFile,
} from '../utils/storyboard';
// Import the env helper
import { getShowTutorial } from '../utils/env';

const TutorialOrchestrator = () => {
  // Check if tutorial should be shown based on environment variable
  const showTutorial = getShowTutorial();
  
  // Diagnostic log for development
  console.debug('REACT_APP_SHOW_TUTORIAL=', process.env.REACT_APP_SHOW_TUTORIAL, 'showTutorial=', showTutorial);

  // If not showing tutorial, render nothing
  if (!showTutorial) {
    return null;
  }

  // Render the actual UI component
  return React.createElement(TutorialOrchestratorContent);
};

// Extract all hook logic into a separate component
function TutorialOrchestratorContent() {
  const [pdfUrl, setPdfUrl] = React.useState(
    'https://arxiv.org/pdf/2106.14881.pdf'
  );
  const [websiteUrl, setWebsiteUrl] = React.useState('');
  const [language, setLanguage] = React.useState('fr');
  const [isProcessing, setIsProcessing] = React.useState(false);
  const [results, setResults] = React.useState(null);
  const [storyboard, setStoryboard] = React.useState(null);
  const [chapters, setChapters] = React.useState(null);
  const [options, setOptions] = React.useState({
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

  const handleOrchestrate = React.useCallback(async () => {
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
        options,
      });

      setResults(result);

      // Step 2: Generate sections and storyboard
      const sections = generateSectionsFromPages(result.detectedPages, 4.0);
      const shots = buildStoryboard({
        detectedPages: result.detectedPages,
        images: result.extract.images || [],
        sections,
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
        totalDuration: chapterData.totalDuration,
      });
    } catch (error) {
      console.error('Orchestration failed:', error);
      alert(`Error: ${error.message}`);
    } finally {
      setIsProcessing(false);
    }
  }, [pdfUrl, websiteUrl, language, options]);

  const downloadConcatFile = React.useCallback(() => {
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

  const downloadChapters = React.useCallback(() => {
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

  return React.createElement(
    'div',
    { style: { padding: '20px', maxWidth: '1200px', margin: '0 auto' } },
    React.createElement('h1', null, '🎬 A→Z Tutorial Generator'),

    // Input Form
    React.createElement(
      'div',
      {
        style: {
          marginBottom: '30px',
          padding: '20px',
          border: '1px solid #ddd',
          borderRadius: '8px',
        },
      },
      React.createElement('h2', null, '📋 Configuration'),

      React.createElement(
        'div',
        { style: { marginBottom: '15px' } },
        React.createElement(
          'label',
          {
            style: {
              display: 'block',
              marginBottom: '5px',
              fontWeight: 'bold',
            },
          },
          'PDF URL (Required):'
        ),
        React.createElement('input', {
          type: 'url',
          value: pdfUrl,
          onChange: e => setPdfUrl(e.target.value),
          placeholder: 'https://example.com/rulebook.pdf',
          style: {
            width: '100%',
            padding: '8px',
            borderRadius: '4px',
            border: '1px solid #ccc',
          },
        })
      ),

      React.createElement(
        'div',
        { style: { marginBottom: '15px' } },
        React.createElement(
          'label',
          {
            style: {
              display: 'block',
              marginBottom: '5px',
              fontWeight: 'bold',
            },
          },
          'Website URL (Optional):'
        ),
        React.createElement('input', {
          type: 'url',
          value: websiteUrl,
          onChange: e => setWebsiteUrl(e.target.value),
          placeholder: 'https://boardgamegeek.com/boardgame/...',
          style: {
            width: '100%',
            padding: '8px',
            borderRadius: '4px',
            border: '1px solid #ccc',
          },
        })
      ),

      React.createElement(
        'div',
        { style: { marginBottom: '15px' } },
        React.createElement(
          'label',
          {
            style: {
              display: 'block',
              marginBottom: '5px',
              fontWeight: 'bold',
            },
          },
          'Language:'
        ),
        React.createElement(
          'select',
          {
            value: language,
            onChange: e => setLanguage(e.target.value),
            style: {
              padding: '8px',
              borderRadius: '4px',
              border: '1px solid #ccc',
            },
          },
          React.createElement('option', { value: 'en' }, 'English'),
          React.createElement('option', { value: 'fr' }, 'Français'),
          React.createElement('option', { value: 'es' }, 'Español'),
          React.createElement('option', { value: 'de' }, 'Deutsch'),
          React.createElement('option', { value: 'it' }, 'Italiano')
        )
      ),

      // Advanced Options
      React.createElement(
        'details',
        { style: { marginBottom: '15px' } },
        React.createElement(
          'summary',
          { style: { cursor: 'pointer', fontWeight: 'bold' } },
          '⚙️ Advanced Options'
        ),
        React.createElement(
          'div',
          {
            style: {
              marginTop: '10px',
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '10px',
            },
          },
          Object.entries(options).map(([key, value]) =>
            React.createElement(
              'div',
              { key: key },
              React.createElement(
                'label',
                {
                  style: {
                    display: 'block',
                    fontSize: '12px',
                    marginBottom: '2px',
                  },
                },
                key + ':'
              ),
              React.createElement('input', {
                type: 'text',
                value: value,
                onChange: e =>
                  setOptions(prev => ({ ...prev, [key]: e.target.value })),
                style: {
                  width: '100%',
                  padding: '4px',
                  fontSize: '12px',
                  borderRadius: '3px',
                  border: '1px solid #ccc',
                },
              })
            )
          )
        )
      ),

      React.createElement(
        'button',
        {
          onClick: handleOrchestrate,
          disabled: isProcessing,
          style: {
            padding: '12px 24px',
            backgroundColor: isProcessing ? '#ccc' : '#007bff',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: isProcessing ? 'not-allowed' : 'pointer',
            fontSize: '16px',
            fontWeight: 'bold',
          },
        },
        isProcessing ? '🔄 Processing...' : '🚀 Generate Tutorial'
      )
    ),

    // Results
    results &&
      React.createElement(
        'div',
        { style: { marginBottom: '30px' } },
        React.createElement('h2', null, '📊 Orchestration Results'),
        React.createElement(
          'div',
          {
            style: {
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
              gap: '15px',
              marginBottom: '20px',
            },
          },
          React.createElement(
            'div',
            {
              style: {
                padding: '15px',
                backgroundColor: '#f8f9fa',
                borderRadius: '8px',
              },
            },
            React.createElement('h3', null, '🎯 Actions Detection'),
            React.createElement(
              'p',
              null,
              React.createElement('strong', null, 'Pages Found:'),
              ' ',
              results.detectedPages.length
            ),
            React.createElement(
              'p',
              null,
              React.createElement('strong', null, 'Pages:'),
              ' ',
              results.detectedPages.join(', ') || 'None'
            ),
            results.metadata.detectError &&
              React.createElement(
                'p',
                {
                  style: { color: 'red', fontSize: '12px' },
                },
                'Error: ',
                results.metadata.detectError
              )
          ),

          React.createElement(
            'div',
            {
              style: {
                padding: '15px',
                backgroundColor: '#f8f9fa',
                borderRadius: '8px',
              },
            },
            React.createElement('h3', null, '🖼️ Component Extraction'),
            React.createElement(
              'p',
              null,
              React.createElement('strong', null, 'Images:'),
              ' ',
              results.metadata.imagesExtracted
            ),
            React.createElement(
              'p',
              null,
              React.createElement('strong', null, 'Source:'),
              ' ',
              results.extract.source
            ),
            React.createElement(
              'p',
              null,
              React.createElement('strong', null, 'Cache:'),
              ' ',
              results.extract.cache
            ),
            results.extract.popplerMissing &&
              React.createElement(
                'p',
                {
                  style: { color: 'orange', fontSize: '12px' },
                },
                '⚠️ Poppler missing - PDF extraction disabled'
              )
          ),

          React.createElement(
            'div',
            {
              style: {
                padding: '15px',
                backgroundColor: '#f8f9fa',
                borderRadius: '8px',
              },
            },
            React.createElement('h3', null, '⚙️ Options Applied'),
            React.createElement(
              'div',
              { style: { fontSize: '12px' } },
              Object.entries(results.metadata.options).map(([key, value]) =>
                React.createElement(
                  'div',
                  { key: key },
                  React.createElement('strong', null, key + ':'),
                  ' ',
                  value
                )
              )
            )
          )
        )
      ),

    // Top Images
    results?.extract?.images &&
      results.extract.images.length > 0 &&
      React.createElement(
        'div',
        { style: { marginBottom: '30px' } },
        React.createElement('h2', null, '🏆 Top 5 Images (by Score)'),
        React.createElement(
          'div',
          {
            style: {
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '15px',
            },
          },
          results.extract.images
            .slice()
            .sort((a, b) => (b.score || 0) - (a.score || 0))
            .slice(0, 5)
            .map((img, index) =>
              React.createElement(
                'div',
                {
                  key: index,
                  style: {
                    border: '1px solid #ddd',
                    borderRadius: '8px',
                    overflow: 'hidden',
                  },
                },
                React.createElement(
                  'div',
                  { style: { position: 'relative' } },
                  React.createElement('img', {
                    src: img.url,
                    alt: `Top ${index + 1}`,
                    style: {
                      width: '100%',
                      height: '150px',
                      objectFit: 'cover',
                    },
                  }),
                  React.createElement(
                    'div',
                    {
                      style: {
                        position: 'absolute',
                        top: '5px',
                        left: '5px',
                        display: 'flex',
                        gap: '3px',
                      },
                    },
                    React.createElement(
                      'span',
                      {
                        style: {
                          background: 'rgba(52,152,219,0.9)',
                          color: 'white',
                          padding: '2px 6px',
                          borderRadius: '3px',
                          fontSize: '10px',
                        },
                      },
                      img.source
                    ),
                    img.page &&
                      React.createElement(
                        'span',
                        {
                          style: {
                            background: 'rgba(155,89,182,0.9)',
                            color: 'white',
                            padding: '2px 6px',
                            borderRadius: '3px',
                            fontSize: '10px',
                          },
                        },
                        'p.' + img.page
                      ),
                    React.createElement(
                      'span',
                      {
                        style: {
                          background: 'rgba(231,76,60,0.9)',
                          color: 'white',
                          padding: '2px 6px',
                          borderRadius: '3px',
                          fontSize: '10px',
                        },
                      },
                      Math.round((img.score || 0) / 1000) + 'k'
                    )
                  )
                ),
                React.createElement(
                  'div',
                  { style: { padding: '10px', fontSize: '12px' } },
                  React.createElement(
                    'div',
                    null,
                    React.createElement('strong', null, 'Page:'),
                    ' ',
                    img.page || 'N/A'
                  ),
                  React.createElement(
                    'div',
                    null,
                    React.createElement('strong', null, 'Size:'),
                    ' ',
                    img.width + '×' + img.height
                  ),
                  React.createElement(
                    'div',
                    null,
                    React.createElement('strong', null, 'Score:'),
                    ' ',
                    img.score?.toLocaleString() || 'N/A'
                  )
                )
              )
            )
        )
      ),

    // Storyboard
    storyboard &&
      React.createElement(
        'div',
        { style: { marginBottom: '30px' } },
        React.createElement(
          'h2',
          null,
          '🎬 Storyboard (' + storyboard.length + ' shots)'
        ),
        React.createElement(
          'div',
          {
            style: {
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
              gap: '15px',
            },
          },
          storyboard.map((shot, index) =>
            React.createElement(
              'div',
              {
                key: index,
                style: {
                  border: '1px solid #ddd',
                  borderRadius: '8px',
                  padding: '15px',
                },
              },
              React.createElement('h4', null, shot.title),
              shot.imgUrl
                ? React.createElement('img', {
                  src: shot.imgUrl,
                  alt: shot.title,
                  style: {
                    width: '100%',
                    height: '120px',
                    objectFit: 'cover',
                    borderRadius: '4px',
                    marginBottom: '10px',
                  },
                })
                : React.createElement(
                    'div',
                    {
                      style: {
                        width: '100%',
                        height: '120px',
                        backgroundColor: '#f0f0f0',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderRadius: '4px',
                        marginBottom: '10px',
                      },
                    },
                    'No Image'
                  ),
              React.createElement(
                'div',
                { style: { fontSize: '12px' } },
                React.createElement(
                  'div',
                  null,
                  React.createElement('strong', null, 'Duration:'),
                  ' ',
                  shot.duration + 's'
                ),
                React.createElement(
                  'div',
                  null,
                  React.createElement('strong', null, 'Page:'),
                  ' ',
                  shot.page || 'N/A'
                ),
                React.createElement(
                  'div',
                  null,
                  React.createElement('strong', null, 'Source:'),
                  ' ',
                  shot.source
                ),
                React.createElement(
                  'div',
                  null,
                  React.createElement('strong', null, 'Score:'),
                  ' ',
                  shot.score?.toLocaleString() || 'N/A'
                )
              )
            )
          )
        ),

        React.createElement(
          'div',
          { style: { marginTop: '15px' } },
          React.createElement(
            'button',
            {
              onClick: downloadConcatFile,
              style: {
                padding: '8px 16px',
                backgroundColor: '#28a745',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                marginRight: '10px',
                cursor: 'pointer',
              },
            },
            '📁 Download FFmpeg Concat File'
          )
        )
      ),

    // YouTube Chapters
    chapters &&
      React.createElement(
        'div',
        { style: { marginBottom: '30px' } },
        React.createElement('h2', null, '📺 YouTube Chapters'),
        React.createElement(
          'p',
          null,
          React.createElement('strong', null, 'Total Duration:'),
          ' ',
          chapters.formattedDuration
        ),
        React.createElement('textarea', {
          value: chapters.chapters,
          readOnly: true,
          style: {
            width: '100%',
            height: '200px',
            padding: '10px',
            border: '1px solid #ddd',
            borderRadius: '4px',
            fontFamily: 'monospace',
            fontSize: '12px',
            marginBottom: '10px',
          },
        }),
        React.createElement(
          'button',
          {
            onClick: downloadChapters,
            style: {
              padding: '8px 16px',
              backgroundColor: '#dc3545',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
            },
          },
          '📁 Download Chapters'
        )
      ),

    // FFmpeg Command
    storyboard &&
      React.createElement(
        'div',
        {
          style: {
            marginBottom: '30px',
            padding: '15px',
            backgroundColor: '#f8f9fa',
            borderRadius: '8px',
          },
        },
        React.createElement('h3', null, '🎥 FFmpeg Video Generation'),
        React.createElement(
          'p',
          null,
          'After downloading the concat file, use this command to generate the video:'
        ),
        React.createElement(
          'code',
          {
            style: {
              display: 'block',
              padding: '10px',
              backgroundColor: '#e9ecef',
              borderRadius: '4px',
              fontSize: '12px',
              marginTop: '5px',
            },
          },
          'ffmpeg -f concat -safe 0 -i tutorial_concat.txt -vsync vfr -pix_fmt yuv420p -r 30 tutorial_draft.mp4'
        )
      )
  );
}

export default TutorialOrchestrator;