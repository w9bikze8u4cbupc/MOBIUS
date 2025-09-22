import React, { useState, useRef, useEffect } from "react";
import { fetchJson } from "./utils/fetchJson";
import ReactMarkdown from "react-markdown";
import { GlobalWorkerOptions, getDocument } from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.entry";

// Configure PDF.js worker
GlobalWorkerOptions.workerSrc = pdfWorker;

// Backend URL
const BACKEND_URL = "http://localhost:5001";

// Updated VOICE_OPTIONS array with the specified ElevenLabs voices
const VOICE_OPTIONS = [
  { name: "English - Haseeb", id: "dllHSct4GokGc1AH9JwT", language: "english" },
  { name: "English - Stephanie", id: "oAoF4NpW2Aqxplg9HdYB", language: "english" },
  { name: "French - Patrick", id: "XTyroWkQl32ZSd3rRVZ1", language: "french" },
  { name: "French - Louis", id: "j9RedbMRSNQ74PyikQwD", language: "french" },
  { name: "French - Anna", id: "gCux0vt1cPsEXPNSbchu", language: "french" }
];

// Helper function to split markdown text into sections for display/TTS
function splitMarkdownSections(markdown) {
  if (!markdown) return [];
  
  // Split by headers (## and ###) while keeping the headers
  const sections = markdown.split(/(?=^##[^#])/m)
    .filter(section => section.trim())
    .map((section, index) => ({
      id: index,
      content: section.trim()
    }));
  
  return sections;
}


function App() {
  const [rulebookText, setRulebookText] = useState("");
  const [summary, setSummary] = useState("");
  const [editedSummary, setEditedSummary] = useState("");
  const [loading, setLoading] = useState(false);
  const [language, setLanguage] = useState("english"); // Default to English
  const [voice, setVoice] = useState("dllHSct4GokGc1AH9JwT"); // Default to English - Haseeb
  const [gameName, setGameName] = useState(""); // New state for game name
  const [metadata, setMetadata] = useState(null); // State for metadata
  const [showThemePrompt, setShowThemePrompt] = useState(false); // Show theme modal
  const [theme, setTheme] = useState(""); // User input theme
  const [sections, setSections] = useState([]); // Summary split into sections for TTS
  const [audio, setAudio] = useState({}); // Stores Blob URLs for generated audio sections
  const [audioLoading, setAudioLoading] = useState({}); // Loading state for individual audio sections
  const [error, setError] = useState(""); // General error message display
  const [dragActive, setDragActive] = useState(false); // For drag and drop file area
  const fileInputRef = useRef(); // Ref for the hidden file input

  // State for displaying translation status/errors
  const [translationStatus, setTranslationStatus] = useState({
    isTranslating: false,
    error: null, // Stores translation-specific errors/warnings from backend
  });


  // --- Effects ---
  // Effect to set default voice based on language
  useEffect(() => {
    const voices = getLanguageVoices(language);
    if (voices.length > 0) {
      setVoice(voices[0].id);
    }
  }, [language]);

  // Effect to split summary into sections when it changes
  useEffect(() => {
    if (summary) {
      const newSections = splitMarkdownSections(summary);
      setSections(newSections);
      setEditedSummary(summary); // Initialize edited summary
    } else {
      setSections([]);
      setEditedSummary("");
    }
  }, [summary]);

  // Update sections when editedSummary changes
  useEffect(() => {
    if (editedSummary) {
      const newSections = splitMarkdownSections(editedSummary);
      setSections(newSections);
    }
  }, [editedSummary]);

  // --- Helper Functions ---
  // Function to get voices for a specific language
  const getLanguageVoices = (lang) => {
    return VOICE_OPTIONS.filter(option => option.language === lang);
  };

  // Theme confirmation handler
  const confirmTheme = async () => {
    if (!theme.trim()) {
      alert("Please enter a theme for your game.");
      return;
    }

    setShowThemePrompt(false);
    setLoading(true);

    try {
      const response = await fetchJson(`${BACKEND_URL}/summarize`, {
        method: "POST",
        body: {
          rulebookText,
          language,
          theme: theme.trim(),
          metadata
        },
        context: { area: "summarization", action: "withTheme" }
      });

      if (response.summary) {
        setSummary(response.summary);
        setMetadata(response.metadata);
        setError(""); // Clear any previous errors

        // Check for translation warnings/errors from the backend
        if (response.warning) {
          setTranslationStatus({
            isTranslating: false,
            error: response.warning
          });
          console.warn('Backend translation warning:', response.warning);
        } else {
          setTranslationStatus({ isTranslating: false, error: null });
        }
      } else {
        setError("Backend returned an unexpected response.");
        setTranslationStatus({ isTranslating: false, error: null });
      }
    } catch (err) {
      console.error('Error during theme-based summarization:', err);
      setError(err.context?.error || err.message || 'Failed to generate summary');
      setTranslationStatus({ isTranslating: false, error: null });
    } finally {
      setLoading(false);
    }
  };

  // Function to strip markdown formatting for TTS
  const stripMarkdown = (text) => {
    return text
      .replace(/#{1,6}\s+/g, '') // Remove headers
      .replace(/\*\*(.*?)\*\*/g, '$1') // Remove bold
      .replace(/\*(.*?)\*/g, '$1') // Remove italic
      .replace(/`([^`]+)`/g, '$1') // Remove code formatting
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Remove links, keep text
      .replace(/\n+/g, ' ') // Replace newlines with spaces
      .trim();
  };

  // Function to generate audio for a specific section
  const generateAudioForSection = async (idx) => {
    const section = sections[idx];
    if (!section) return null;

    const ttsText = stripMarkdown(section.content);
    if (ttsText.length < 10) {
      console.log(`Section ${idx} has no text after stripping markdown, skipping TTS.`);
      return null; // Skip if no text to speak
    }

    setAudioLoading(prev => ({ ...prev, [idx]: true })); // Set loading for this section

    try {
      const arrayBuffer = await fetchJson(
        `${BACKEND_URL}/tts`,
        {
          method: "POST",
          body: { text: ttsText, voice, language, gameName }, // Send language and voice ID
          responseType: "arrayBuffer", // Receive audio data as array buffer
          context: { area: "tts", action: "generate", section: idx }
        }
      );
      const blob = new Blob([arrayBuffer], { type: "audio/mpeg" });
      const url = URL.createObjectURL(blob); // Create a temporary URL for the audio blob
      // Update audio state for this specific section
      setAudio(prev => ({ ...prev, [idx]: url }));
      return url; // Return the URL
    } catch (err) {
      console.error(`Failed to generate audio for section ${idx}:`, err.context?.error || err.message);
      // Handle errors for individual sections, maybe set an error state for this section?
      // setSectionError(prev => ({ ...prev, [idx]: 'Error generating audio' }));
      return null; // Return null on error
    } finally {
      setAudioLoading(prev => ({ ...prev, [idx]: false })); // Turn off loading for this section
    }
  };

  // Function to generate audio for all sections
  const generateAllAudio = async () => {
    const promises = sections.map((_, idx) => generateAudioForSection(idx));
    await Promise.all(promises);
  };

  // --- Handlers ---

  // Handle file upload
  const handleFileUpload = async (file) => {
    if (!file) return;

    // Check if it's a PDF
    if (file.type === "application/pdf") {
      try {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await getDocument(arrayBuffer).promise;
        const numPages = pdf.numPages;
        let text = "";

        for (let pageNum = 1; pageNum <= numPages; pageNum++) {
          const page = await pdf.getPage(pageNum);
          const textContent = await page.getTextContent();
          const pageText = textContent.items.map(item => item.str).join(' ');
          text += pageText + '\n';
        }

        setRulebookText(text);
      } catch (error) {
        console.error("Error reading PDF:", error);
        setError("Error reading PDF file");
      }
    } else {
      // Handle text files
      const reader = new FileReader();
      reader.onload = (e) => setRulebookText(e.target.result);
      reader.readAsText(file);
    }
  };

  // Handle drag and drop
  const handleDragOver = (e) => {
    e.preventDefault();
    setDragActive(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setDragActive(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragActive(false);
    const files = e.dataTransfer.files;
    if (files && files[0]) {
      handleFileUpload(files[0]);
    }
  };

  // Handle file input change
  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      handleFileUpload(file);
    }
  };

  // Handle summarization
  const handleSummarize = async () => {
    if (!rulebookText.trim()) {
      setError("Please provide rulebook text or upload a file");
      return;
    }

    if (!gameName.trim()) {
      setError("Please provide a game name");
      return;
    }

    setLoading(true);
    setError("");

    // Reset translation status when starting new request
    setTranslationStatus({ isTranslating: false, error: null });

    try {
      console.log(`Sending rulebookText length: ${rulebookText.length} to backend for summarization.`);
      // Make the POST request to the backend's summarize endpoint
      const response = await fetchJson(`${BACKEND_URL}/summarize`, {
        method: "POST",
        body: {
          rulebookText,
          language, // Send the requested output language ('english' or 'french')
          gameName
        },
        context: { area: "summarization", action: "initial" }
      });

      if (response.needsTheme) {
        // If backend needs theme, update metadata and show the prompt
        console.log('Backend requested theme.');
        setMetadata(response.metadata); // Update metadata (should include 'Not found' theme)
        setShowThemePrompt(true); // Show the modal
      } else if (response.summary) {
        // If summary is received, update state
        const generatedSummary = response.summary;
        setSummary(generatedSummary); // This will trigger the effect to set editedSummary and sections
        setMetadata(response.metadata); // Update metadata based on backend response

        // Check for translation warnings/errors from the backend
        if (response.warning) {
          setTranslationStatus({
            isTranslating: false, // Not currently translating, this is a past warning
            error: response.warning // Display the warning message
          });
          console.warn('Backend translation warning:', response.warning);
        } else {
          // Clear any previous translation warnings if successful
          setTranslationStatus({ isTranslating: false, error: null });
        }

      } else {
        // Handle cases where no summary or needsTheme is in the response
        setError("Backend returned an unexpected response.");
        console.error("Unexpected backend response:", response);
        setTranslationStatus({ isTranslating: false, error: null }); // Clear translation status on unexpected response

      }

    } catch (err) {
      // Handle errors from the fetchJson request (e.g., network error, 500 status)
      console.error('Error during summarization request:', err);
      setError(err.context?.error || err.message || 'Failed to generate summary');

      // Check for specific backend errors related to translation failure
      if (err.fallbackLanguage) {
        setTranslationStatus({
          isTranslating: false, // Not currently translating
          error: `Translation to ${language} failed. Generated in ${err.fallbackLanguage} instead.`
        });
      } else {
        setTranslationStatus({ isTranslating: false, error: null }); // Clear translation status for non-translation errors
      }

    } finally {
      setLoading(false);
    }
  };

  // Handle single audio generation
  const handleGenerateAudio = async (idx) => {
    const section = sections[idx];
    if (!section) return;

    const ttsText = stripMarkdown(section.content);
    if (ttsText.length < 10) {
      console.log(`Section ${idx} has no text after stripping markdown, skipping TTS.`);
      return;
    }

    if (!gameName.trim()) {
      alert("Please set a game name before generating audio.");
      return;
    }

    setAudioLoading(prev => ({ ...prev, [idx]: true }));

    try {
      console.log(`Generating audio for section ${idx} (text length: ${ttsText.length})`);
      // Make POST request to the backend's TTS endpoint
      const arrayBuffer = await fetchJson(
        `${BACKEND_URL}/tts`,
        {
          method: "POST",
          body: { text: ttsText, voice, language, gameName }, // Send text, selected voice ID, language, and game name
          responseType: "arrayBuffer", // Expect audio data as array buffer
          context: { area: "tts", action: "single", section: idx }
        }
      );

      // Create a Blob from the audio data and a URL for the Blob
      const blob = new Blob([arrayBuffer], { type: "audio/mpeg" });
      const url = URL.createObjectURL(blob);

      // Revoke previous Blob URL for this section if it exists to free up memory
      if (audio[idx]) {
        URL.revokeObjectURL(audio[idx]);
      }

      // Update audio state for this specific section
      setAudio(prev => ({ ...prev, [idx]: url }));

    } catch (err) {
      console.error(`Failed to generate audio for section ${idx}:`, err.context?.error || err.message);
      // You could set section-specific error state here if needed
    } finally {
      setAudioLoading(prev => ({ ...prev, [idx]: false }));
    }
  };

  // Clear generated data
  const clearData = () => {
    setSummary("");
    setEditedSummary("");
    setSections([]);
    setMetadata(null);
    setError("");
    setTranslationStatus({ isTranslating: false, error: null });
    
    // Revoke all Blob URLs to free up memory
    Object.values(audio).forEach(url => {
      if (url) URL.revokeObjectURL(url);
    });
    setAudio({});
    setAudioLoading({});
  };

  return (
    <div className="container">
      <header>
        <h1>🎲 Mobius Games Tutorial Generator</h1>
        <p>Generate interactive tutorial summaries from game rulebooks with multilingual TTS audio</p>
      </header>

      <main>
        {/* File Upload Area */}
        <div
          className={`file-upload-area ${dragActive ? 'drag-active' : ''}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <div className="file-upload-content">
            <div className="file-upload-icon">📁</div>
            <p>Drop a PDF or text file here, or click to browse</p>
            <p className="file-upload-hint">Supported: .pdf, .txt</p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.txt"
            onChange={handleFileChange}
            style={{ display: 'none' }}
          />
        </div>

        {/* Game Name Input */}
        <div className="input-group">
          <label htmlFor="gameName">Game Name:</label>
          <input
            id="gameName"
            type="text"
            value={gameName}
            onChange={(e) => setGameName(e.target.value)}
            placeholder="Enter the name of the board game"
            className="game-name-input"
          />
        </div>

        {/* Language Selection */}
        <div className="input-group">
          <label htmlFor="language">Output Language:</label>
          <select id="language" value={language} onChange={(e) => setLanguage(e.target.value)}>
            <option value="english">English</option>
            <option value="french">French</option>
          </select>
        </div>

        {/* Voice Selection */}
        <div className="input-group">
          <label htmlFor="voice">TTS Voice:</label>
          <select id="voice" value={voice} onChange={(e) => setVoice(e.target.value)}>
            {getLanguageVoices(language).map(option => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
          </select>
        </div>

        {/* Text Input */}
        <div className="input-group">
          <label htmlFor="rulebookText">Rulebook Text:</label>
          <textarea
            id="rulebookText"
            value={rulebookText}
            onChange={(e) => setRulebookText(e.target.value)}
            placeholder="Paste your game rulebook text here or upload a file above..."
            rows={6}
          />
        </div>

        {/* Action Buttons */}
        <div className="button-group">
          <button 
            onClick={handleSummarize} 
            disabled={loading} 
            className="primary-button"
          >
            {loading ? "⏳ Generating..." : "✨ Generate Summary"}
          </button>
          <button onClick={clearData} className="secondary-button">
            🗑️ Clear
          </button>
          {sections.length > 0 && (
            <button onClick={generateAllAudio} className="audio-button">
              🎵 Generate All Audio
            </button>
          )}
        </div>

        {/* Translation Status/Warning Display */}
        {translationStatus.error && (
          <div className="translation-warning">
            <strong>⚠️ Translation Notice:</strong> {translationStatus.error}
          </div>
        )}

        {/* Error Display */}
        {error && (
          <div className="error-message">
            <strong>❌ Error:</strong> {error}
          </div>
        )}

        {/* Metadata Display */}
        {metadata && (
          <div className="metadata-display">
            <h3>📊 Game Information</h3>
            <div className="metadata-grid">
              <div><strong>Title:</strong> {metadata.title || 'Not found'}</div>
              <div><strong>Publisher:</strong> {metadata.publisher || 'Not found'}</div>
              <div><strong>Year:</strong> {metadata.year || 'Not found'}</div>
              <div><strong>Players:</strong> {metadata.players || 'Not found'}</div>
              <div><strong>Age:</strong> {metadata.age || 'Not found'}</div>
              <div><strong>Duration:</strong> {metadata.duration || 'Not found'}</div>
              <div><strong>Theme:</strong> {metadata.theme || 'Not found'}</div>
            </div>
          </div>
        )}

        {/* Editable Summary */}
        {summary && (
          <div className="summary-section">
            <h3>📝 Generated Summary (Editable)</h3>
            <textarea
              value={editedSummary}
              onChange={(e) => setEditedSummary(e.target.value)}
              rows={15}
              className="summary-textarea"
            />
          </div>
        )}

        {/* Summary Display with TTS */}
        {sections.length > 0 && (
          <div className="sections-display">
            <h3>🎯 Tutorial Sections</h3>
            {sections.map((section, idx) => (
              <div key={section.id} className="section-item">
                <div className="section-content">
                  <ReactMarkdown>{section.content}</ReactMarkdown>
                </div>
                <div className="section-controls">
                  <button 
                    onClick={() => handleGenerateAudio(idx)}
                    disabled={audioLoading[idx]}
                    className="audio-button small"
                  >
                    {audioLoading[idx] ? "🔄" : "🎵"} 
                    {audioLoading[idx] ? " Generating..." : " Generate Audio"}
                  </button>
                  {audio[idx] && (
                    <audio controls className="audio-player">
                      <source src={audio[idx]} type="audio/mpeg" />
                      Your browser does not support the audio element.
                    </audio>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Theme Modal */}
        {showThemePrompt && (
          <div className="modal-overlay">
            <div className="modal">
              <h3>🎯 Game Theme Required</h3>
              <p>We couldn't determine the theme of your game automatically. Please provide it:</p>
              <input
                type="text"
                value={theme}
                onChange={(e) => setTheme(e.target.value)}
                placeholder="e.g., Strategy, Adventure, Card Game, etc."
                className="theme-input"
              />
              <div className="modal-buttons">
                <button onClick={confirmTheme} className="primary-button">
                  ✅ Continue
                </button>
                <button onClick={() => setShowThemePrompt(false)} className="secondary-button">
                  ❌ Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      <footer>
        <div>
          <b>Tip:</b> Upload a PDF or paste the rulebook text for best results.
        </div>
        <div>
          <b>Backend:</b> <code>{BACKEND_URL}</code>
        </div>
      </footer>
    </div>
  );
}

export default App;