import React, { useState, useRef, useEffect } from "react";
import axios from "axios";
import ReactMarkdown from "react-markdown";
import { GlobalWorkerOptions, getDocument } from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.entry";
import { GenesisFeedbackPanel } from "./GenesisFeedbackPanel";
import { GenesisHealthPanel } from "./GenesisHealthPanel";
import { GenesisArtifactsPanel } from "./GenesisArtifactsPanel";
import { GenesisGoalsEditor } from "./GenesisGoalsEditor";
import { GenesisAutoOptimizeButton } from "./GenesisAutoOptimizeButton";
import { GenesisCampaignPanel } from "./GenesisCampaignPanel";

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
  // Regex to find lines that look like markdown headers (## Title), or lines starting with 3+ caps/digits/-/.
  // This version aims to include the header line with the section content.
  const regex = /(^|\n)(##? .+)/g;
  const sections = [];
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(markdown)) !== null) {
    // Add the text before the header match as a section (if any)
    if (match.index > lastIndex) {
      sections.push(markdown.slice(lastIndex, match.index).trim());
    }
    // Find the end of the header line
    const headerEnd = markdown.indexOf('\n', match.index + match[1].length + match[2].length);
    // The next section starts at the character after the header line break, or end of string
    lastIndex = headerEnd !== -1 ? headerEnd + 1 : markdown.length;
    // Add the header line itself as the start of a new section
    sections.push(match[2].trim());
  }

  // Add any remaining text after the last header
  if (lastIndex < markdown.length) {
    sections.push(markdown.slice(lastIndex).trim());
  }

  // Filter out any empty sections that might have resulted from the split
  return sections.filter(section => section.length > 0);
}


function App() {
  // --- State Variables ---
  const [file, setFile] = useState(null);
  const [rulebookText, setRulebookText] = useState("");
  const [language, setLanguage] = useState("english");
  const [voice, setVoice] = useState(""); // Stores ElevenLabs voice ID
  const [gameName, setGameName] = useState("");
  const [projectId, setProjectId] = useState("");
  const [metadata, setMetadata] = useState({
    publisher: "",
    playerCount: "",
    gameLength: "",
    minimumAge: "",
    theme: "",
    edition: "",
  });
  const [detailPercentage, setDetailPercentage] = useState(25);
  const [showThemePrompt, setShowThemePrompt] = useState(false); // To show the theme input modal
  const [loading, setLoading] = useState(false); // For main processing loading state
  const [summary, setSummary] = useState(""); // The generated script (Markdown)
  const [editedSummary, setEditedSummary] = useState(""); // The script in the editable textarea
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
    } else {
      setVoice(""); // Clear voice if no voices for language
    }
  }, [language]); // Rerun when language changes

  // Effect to update editedSummary when summary changes (after generation)
  useEffect(() => {
    setEditedSummary(summary);
    // Automatically split sections when summary is updated
    if (summary) {
      const newSections = splitMarkdownSections(summary);
      console.log('Sections created:', newSections);
      setSections(newSections);
      setAudio({}); // Clear existing audio when summary changes
    } else {
      setSections([]);
      setAudio({});
    }
  }, [summary]); // Rerun when summary changes


  // --- Helper Functions ---
  // Get available voice options filtered by language
  const getLanguageVoices = (lang) => VOICE_OPTIONS.filter(v => v.language === lang);

  // Extract text from a PDF file using pdfjs-dist
  const extractTextFromPDF = async (file) => {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await getDocument({ data: arrayBuffer }).promise;
      let fullText = "";
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        // Use a space or newline to join items, depending on desired word separation
        const pageText = content.items.map(item => item.str).join(" ");
        fullText += pageText + "\n";
      }
      console.log('Extracted PDF text length:', fullText.length);
      if (!fullText.trim()) {
        throw new Error("No readable text found in the PDF");
      }
      return fullText;
    } catch (err) {
      console.error('PDF extraction error:', err);
      // Re-throw with a user-friendly message
      throw new Error("Failed to extract text from PDF. Please ensure it's a text-based PDF, not just images.");
    }
  };

  // --- File Handling ---
  // Process a file (either from drag/drop or file input)
  const handleFile = async (file) => {
    // Reset relevant state variables before processing new file
    setFile(file);
    // Suggest game name from file name (clean up extension and separators)
    const name = file.name.replace(/\.[^/.]+$/, "").replace(/[_-]/g, " ");
    setGameName(name);
    setRulebookText("");
    setSummary("");
    setEditedSummary("");
    setSections([]);
    setAudio({});
    setAudioLoading({});
    // Reset metadata to empty strings
    setMetadata({ publisher: "", playerCount: "", gameLength: "", minimumAge: "", theme: "", edition: "" });
    setShowThemePrompt(false);
    setError("");
    setTranslationStatus({ isTranslating: false, error: null });


    try {
      if (file.type === "application/pdf") {
        setLoading(true); // Show loading only for PDF extraction
        const extracted = await extractTextFromPDF(file);
        setRulebookText(extracted);
      } else {
        setError("Please upload a PDF file");
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Drag and drop handlers
  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") setDragActive(true);
    else if (e.type === "dragleave") setDragActive(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    // Check if files were dropped and process the first one
    if (e.dataTransfer.files && e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
  };

  // Handler for standard file input change
  const handleFileChange = (e) => {
    // Check if files were selected and process the first one
    if (e.target.files && e.target.files[0]) handleFile(e.target.files[0]);
  };

  // Handler for manual text area changes
  const handleTextChange = (e) => {
    // Reset states similar to file handling, except don't clear gameName based on file
    setRulebookText(e.target.value);
    setFile(null); // Clear file if user starts typing
    setSummary("");
    setEditedSummary("");
    setSections([]);
    setAudio({});
    setAudioLoading({});
    // Keep existing metadata or reset based on preference, here resetting to empty
    setMetadata({ publisher: "", playerCount: "", gameLength: "", minimumAge: "", theme: "", edition: "" });
    setShowThemePrompt(false);
    setError("");
    setTranslationStatus({ isTranslating: false, error: null });

  };


  // --- Metadata Handling ---
  // Handle changes to metadata input fields
  const handleMetadataChange = (field, value) => {
    setMetadata(prev => ({ ...prev, [field]: value }));
  };

  // Handle submission of the theme prompt modal
  const handleThemeSubmit = async () => {
    if (!metadata.theme.trim() || metadata.theme === "Not found") {
      setError("Please provide a valid theme for the game");
      return;
    }
    // Proceed with summarization after theme is provided
    setShowThemePrompt(false); // Hide the modal
    // Now call the main handleSummarize function to regenerate with theme included
    handleSummarize(); // Call the main handler
  };


  // --- Summary Editing and Saving ---
  // Handle changes in the edited summary textarea
  const handleSummaryEdit = (e) => {
    if (!e || !e.target) {
      console.error('handleSummaryEdit: Event or e.target is undefined');
      return;
    }
    setEditedSummary(e.target.value);
  };

  // Save edited summary and re-split sections
  const handleSaveSummary = async () => {
    setLoading(true); // Maybe a different loading state for saving?
    setError("");
    try {
      setSummary(editedSummary); // Update the official summary state
      // Sections and audio effects will trigger automatically when summary state changes
      console.log('Edited summary saved and sections re-split.');
    } catch (err) {
      setError("Failed to save edited summary");
    } finally {
      setLoading(false);
    }
  };

  // Save edited summary and proceed to generate audio for all sections
  const handleSaveAndContinue = async () => {
    setLoading(true);
    setError("");
    setAudio({}); // Clear previous audio

    try {
      // Ensure sections state is up-to-date with edited summary
      const currentSections = splitMarkdownSections(editedSummary);
      setSections(currentSections); // Update sections state if necessary

      // Generate audio for each section in parallel
      const audioPromises = currentSections.map(async (section, idx) => {
        let ttsText = stripMarkdown(section);
        if (!ttsText.trim()) {
          console.log(`Section ${idx} has no text after stripping markdown, skipping TTS.`);
          return null; // Skip if no text to speak
        }

        setAudioLoading(prev => ({ ...prev, [idx]: true })); // Set loading for this section

        try {
          const res = await axios.post(
            `${BACKEND_URL}/tts`,
            { text: ttsText, voice, language, gameName }, // Send language and voice ID
            { responseType: "arraybuffer" } // Receive audio data as array buffer
          );
          const blob = new Blob([res.data], { type: "audio/mpeg" });
          const url = URL.createObjectURL(blob); // Create a temporary URL for the audio blob
          // Update audio state for this specific section
          setAudio(prev => ({ ...prev, [idx]: url }));
          return url; // Return the URL
        } catch (err) {
          console.error(`Failed to generate audio for section ${idx}:`, err.response?.data?.error || err.message);
          // Handle errors for individual sections, maybe set an error state for this section?
          // setSectionError(prev => ({ ...prev, [idx]: 'Error generating audio' }));
          return null; // Return null on error
        } finally {
          setAudioLoading(prev => ({ ...prev, [idx]: false })); // Turn off loading for this section
        }
      });

      // Wait for all audio generations to complete
      await Promise.all(audioPromises);
      console.log('All audio generation attempts completed.');

    } catch (err) {
      // Catch errors from Promise.all if any promise rejected
      setError(err.response?.data?.error || "Failed to save and generate audio");
    } finally {
      setLoading(false);
    }
  };


  // --- Main Summarization Handler ---
  const handleSummarize = async () => {
    // Reset relevant states for a new summarization request
    setLoading(true);
    setError("");
    setSummary("");
    setEditedSummary("");
    setSections([]);
    setAudio({});
    setAudioLoading({});
    setShowThemePrompt(false); // Hide prompt if it was showing
    setTranslationStatus({ isTranslating: false, error: null }); // Reset translation status

    // Basic input validation
    if (!rulebookText.trim()) {
      setError("Please provide rulebook text.");
      setLoading(false);
      return;
    }
    if (!gameName.trim()) {
      setError("Please provide a game name.");
      setLoading(false);
      return;
    }

    try {
      console.log(`Sending rulebookText length: ${rulebookText.length} to backend for summarization.`);
      // Make the POST request to the backend's summarize endpoint
      const response = await axios.post(`${BACKEND_URL}/summarize`, {
        rulebookText,
        language, // Send the requested output language ('english' or 'french')
        gameName,
        metadata, // Send the current metadata state
        detailPercentage // Send the detail percentage
      });

      // Handle the backend response
      console.log('Received response from backend /summarize.');
      console.log('Received summary length:', response.data?.summary?.length);


      if (response.data.needsTheme) {
        // If backend needs theme, update metadata and show the prompt
        console.log('Backend requested theme.');
        setMetadata(response.data.metadata); // Update metadata (should include 'Not found' theme)
        setShowThemePrompt(true); // Show the modal
      } else if (response.data.summary) {
        // If summary is received, update state
        const generatedSummary = response.data.summary;
        setSummary(generatedSummary); // This will trigger the effect to set editedSummary and sections
        setMetadata(response.data.metadata); // Update metadata based on backend response

        // Check for translation warnings/errors from the backend
        if (response.data.warning) {
          setTranslationStatus({
            isTranslating: false, // Not currently translating, this is a past warning
            error: response.data.warning // Display the warning message
          });
          console.warn('Backend translation warning:', response.data.warning);
        } else {
          // Clear any previous translation warnings if successful
          setTranslationStatus({ isTranslating: false, error: null });
        }

      } else {
        // Handle cases where no summary or needsTheme is in the response
        setError("Backend returned an unexpected response.");
        console.error("Unexpected backend response:", response.data);
        setTranslationStatus({ isTranslating: false, error: null }); // Clear translation status on unexpected response

      }

    } catch (err) {
      // Handle errors from the axios request (e.g., network error, 500 status)
      console.error('Error during summarization request:', err);
      setError(err.response?.data?.error || `Failed to generate summary: ${err.message}`);

      // Check for specific backend errors related to translation failure
      if (err.response?.data?.fallbackLanguage) {
        setTranslationStatus({
          isTranslating: false, // Not currently translating
          error: `Translation failed. Showing ${err.response.data.fallbackLanguage} version. Details: ${err.response.data.error}`
        });
        // Optionally set the received fallback summary if provided
        if (err.response.data.summary) {
          setSummary(err.response.data.summary); // This will trigger useEffect to update editedSummary/sections
        }

      } else {
        setTranslationStatus({ isTranslating: false, error: null }); // Clear translation status on unrelated error
      }


    } finally {
      setLoading(false); // Turn off loading state
    }
  };

  // Function to strip markdown for TTS (simplified, might need refinement)
  const stripMarkdown = (text) => {
    let plainText = text;

    // Remove specific bracketed tags like [Page:x], [Image:x], [SHORT PAUSE] etc.
    plainText = plainText.replace(/\[.*?\]/g, "");

    // Remove markdown links [text](url) keeping only text
    plainText = plainText.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");

    // Remove markdown images ![alt text](url)
    plainText = plainText.replace(/!\[([^\]]*)\]\([^)]+\)/g, "");

    // Remove bold and italics markers (**strong**, *emphasis*)
    plainText = plainText.replace(/(\*\*|__)(.*?)\1/g, "$2");
    plainText = plainText.replace(/(\*|_)(.*?)\1/g, "$2");

    // Remove inline code backticks (`code`)
    plainText = plainText.replace(/`([^`]+)`/g, "$1");

    // Remove blockquotes (lines starting with >)
    plainText = plainText.replace(/^\s*>\s?/gm, "");

    // Remove list markers (-, *, +, or number. ) at the start of lines
    plainText = plainText.replace(/^\s*[-*+]\s+/gm, "");
    plainText = plainText.replace(/^\s*\d+\.\s+/gm, "");

    // Remove markdown headers (#, ##, ###, etc.) - Keep the header text? Or remove?
    // If the header is part of the section, maybe keep the text but remove #?
    // For TTS, usually you don't want the header title read out unless it's integrated
    // Let's remove the whole header line for simplicity for TTS
    plainText = plainText.replace(/^#+\s+.*$/gm, "");


    // Replace multiple newlines with at most two to preserve paragraphs
    plainText = plainText.replace(/\n{3,}/g, "\n\n");

    // Trim leading/trailing whitespace from lines and the whole text
    plainText = plainText.split('\n').map(line => line.trim()).join('\n').trim();


    return plainText;
  };


  // --- Audio Playback for a single section (used by "Play Audio" button) ---
  const handlePlayAudio = async (section, idx) => {
    // Check if audio already exists for this section
    if (audio[idx]) {
      // If audio exists, just play it
      const audioPlayer = document.getElementById(`audio-${idx}`);
      if (audioPlayer) {
        audioPlayer.play();
        return;
      }
    }

    // If audio doesn't exist, generate it
    setAudioLoading(prev => ({ ...prev, [idx]: true })); // Set loading for this section
    setError(""); // Clear general errors

    try {
      // Strip markdown from the section text for TTS
      let ttsText = stripMarkdown(section);

      if (!ttsText.trim()) {
        setError("No narratable text available for this section after stripping markdown.");
        console.warn(`Attempted to generate audio for empty text in section ${idx} after stripping.`);
        return; // Exit if no text remains
      }

      console.log(`Generating audio for section ${idx} (text length: ${ttsText.length})`);
      // Make POST request to the backend's TTS endpoint
      const res = await axios.post(
        `${BACKEND_URL}/tts`,
        { text: ttsText, voice, language, gameName }, // Send text, selected voice ID, language, and game name
        { responseType: "arraybuffer" } // Expect audio data as array buffer
      );

      // Create a Blob from the audio data and a URL for the Blob
      const blob = new Blob([res.data], { type: "audio/mpeg" });
      const url = URL.createObjectURL(blob);

      // Revoke previous Blob URL for this section if it exists to free up memory
      if (audio[idx]) {
        URL.revokeObjectURL(audio[idx]);
      }

      // Update audio state with the new Blob URL for this section
      setAudio(prev => ({ ...prev, [idx]: url }));

      console.log(`Audio generated and stored for section ${idx}. URL: ${url}`);
      // Optionally play the audio automatically after generation
      // const audioPlayer = document.getElementById(`audio-${idx}`);
      // if (audioPlayer) {
      //   audioPlayer.play();
      // }

    } catch (err) {
      console.error(`Error generating audio for section ${idx}:`, err);
      setError(err.response?.data?.error || `Failed to generate audio for section ${idx}.`);
    } finally {
      setAudioLoading(prev => ({ ...prev, [idx]: false })); // Turn off loading state for this section
    }
  };


  // --- Rendered Output (JSX) ---
  return (
    <div style={{ maxWidth: 800, margin: "40px auto", fontFamily: "sans-serif", padding: 20 }}>
      <h1>Board Game Tutorial Generator</h1>

      {/* --- Input Controls --- */}
      <div style={{ marginBottom: 20, display: "flex", flexWrap: "wrap", gap: 20 }}>
        {/* Language Select */}
        <div>
          <label>
            <b>Language:</b>{" "}
            <select value={language} onChange={e => setLanguage(e.target.value)}>
              <option value="english">English</option>
              <option value="french">French</option>
            </select>
          </label>
        </div>

        {/* Voice Select */}
        <div>
          <label>
            <b>Voice:</b>{" "}
            <select value={voice} onChange={e => setVoice(e.target.value)} disabled={getLanguageVoices(language).length === 0}>
              {getLanguageVoices(language).map(v => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
              {getLanguageVoices(language).length === 0 && <option value="">No voices available</option>}
          </select>
          </label>
        </div>

        {/* Detail Percentage */}
        <div>
          <label>
            <b>Detail % Increase:</b>{" "}
            <select value={detailPercentage} onChange={e => setDetailPercentage(Number(e.target.value))}>
              <option value={5}>5%</option>
              <option value={10}>10%</option>
              <option value={25}>25%</option>
              <option value={50}>50%</option>
            </select>
          </label>
        </div>
      </div>

      {/* Game Name Input */}
      <div style={{ marginBottom: 20 }}>
        <label>
          <b>Game Name:</b>{" "}
          <input
            type="text"
            value={gameName}
            onChange={e => setGameName(e.target.value)}
            placeholder="Enter the game name"
            style={{ width: "calc(100% - 110px)", marginRight: 10 }}
          />
        </label>
      </div>


      {/* Metadata Inputs */}
      <div style={{ marginBottom: 20 }}>
        <h3>Game Metadata (Optional - will attempt extraction if left blank)</h3>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: 10 }}>
        {/* Map over metadata keys to create inputs */}
        {Object.keys(metadata).map(key => (
            <input
              key={key}
              type="text"
              value={metadata[key]}
              onChange={e => handleMetadataChange(key, e.target.value)}
              placeholder={key.charAt(0).toUpperCase() + key.slice(1) + " (e.g., " + (key === 'playerCount' ? '2-4' : key === 'gameLength' ? '30-60 min' : key === 'minimumAge' ? '8+' : key === 'theme' ? 'Deep-sea Adventure' : key === 'edition' ? 'Third Edition' : 'Publisher') + ")"}
              // Apply red color if backend returned 'Not found' and user hasn't edited
              style={{ color: metadata[key] === "Not found" ? "red" : "black" }}
            />
          ))}
        </div>
      </div>

      {/* GENESIS Observability */}
      <div
        style={{
          marginBottom: 20,
          padding: 16,
          border: "1px solid #ddd",
          borderRadius: 8,
          background: "#f8f9fb",
        }}
      >
        <h3>GENESIS Observability</h3>
        <div style={{ marginBottom: 12 }}>
          <GenesisCampaignPanel />
        </div>
        <div style={{ marginBottom: 12 }}>
          <GenesisHealthPanel />
        </div>
        <div style={{ marginBottom: 12 }}>
          <label>
            <b>Project ID:</b>{" "}
            <input
              type="text"
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              placeholder="Enter project ID to load feedback"
              style={{ width: "240px", marginLeft: 8 }}
            />
          </label>
        </div>
        {projectId.trim() ? (
          <>
            <div style={{ marginBottom: 12 }}>
              <GenesisArtifactsPanel projectId={projectId.trim()} />
            </div>
            <div style={{ marginBottom: 12 }}>
              <GenesisGoalsEditor projectId={projectId.trim()} />
            </div>
            <div style={{ marginBottom: 12 }}>
              <GenesisAutoOptimizeButton projectId={projectId.trim()} />
            </div>
            <GenesisFeedbackPanel projectId={projectId.trim()} />
          </>
        ) : (
          <p style={{ color: "#666" }}>
            Enter a project ID to view GENESIS health, artifacts, and feedback.
          </p>
        )}
      </div>

      {/* File Upload Area */}
      <div
        onDragEnter={handleDrag}
        onDragOver={handleDrag}
        onDragLeave={handleDrag}
        onDrop={handleDrop}
        style={{
          border: dragActive ? "2px solid #1976d2" : "2px dashed #aaa",
          borderRadius: 8,
          padding: 30,
          textAlign: "center",
          background: dragActive ? "#e3f2fd" : "#fafbfc",
          marginBottom: 20,
          cursor: "pointer",
          transition: "border-color 0.2s, background-color 0.2s"
        }}
        onClick={() => fileInputRef.current.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf" // Accept only PDF files
          style={{ display: "none" }} // Hide the actual file input
          onChange={handleFileChange}
        />
        <div style={{ fontSize: 18 }}>
          {file ? `Selected: ${file.name}` : "Drag & drop a PDF file here, or click to select"}
        </div>
        {file && file.type !== "application/pdf" && (
          <div style={{ color: "orange", marginTop: 10 }}>Warning: Only PDF files are supported for automatic text extraction.</div>
        )}
      </div>

      {/* Rulebook Text Area */}
      <div style={{ marginBottom: 20 }}>
        <textarea
          rows={10}
          style={{ width: "100%", padding: 10, boxSizing: "border-box" }}
          placeholder="Or paste rulebook text here..."
          value={rulebookText}
          onChange={handleTextChange}
        />
      </div>

      {/* Generate Button */}
      <button
        onClick={handleSummarize}
        disabled={loading || !rulebookText.trim() || !gameName.trim()} // Disable if loading or required fields are empty
        style={{
          padding: "10px 30px",
          fontSize: 18,
          background: loading || !rulebookText.trim() || !gameName.trim() ? "#b0bec5" : "#1976d2", // Grey out if disabled
          color: "#fff",
          border: "none",
          borderRadius: 4,
          cursor: loading || !rulebookText.trim() || !gameName.trim() ? "not-allowed" : "pointer",
          marginRight: 10,
          transition: "background-color 0.2s"
        }}
      >
        {loading ? "Processing..." : "Generate Tutorial Script"}
      </button>

      {/* Error Message Display */}
      {error && (
        <div style={{ color: "red", marginTop: 20, fontWeight: "bold" }}>
          {error}
        </div>
      )}
      {/* Translation Status/Warning Display */}
      {translationStatus.error && (
        <div style={{ color: "orange", marginTop: 10, fontWeight: "bold" }}>
          {translationStatus.error}
        </div>
      )}


      {/* Theme Prompt Modal */}
      {showThemePrompt && (
        <div style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          background: "#fff",
          padding: 30,
          borderRadius: 8,
          boxShadow: "0 0 20px rgba(0,0,0,0.5)",
          zIndex: 1000, // Ensure modal is on top
          minWidth: 300,
          maxWidth: 400,
          textAlign: "center"
        }}>
          <h3>Game Theme Required</h3>
          <p>The theme could not be automatically detected. Please enter the game's theme to continue:</p>
          <input
            type="text"
            value={metadata.theme}
            onChange={e => handleMetadataChange("theme", e.target.value)}
            placeholder="e.g., Deep-sea Adventure"
            style={{ width: "calc(100% - 22px)", marginBottom: 15, padding: 10 }} // Adjust width for padding/border
          />
          <button
            onClick={handleThemeSubmit}
            disabled={loading || !metadata.theme.trim() || metadata.theme === "Not found"} // Disable if loading or theme is empty/default
            style={{
              padding: "10px 20px",
              background: loading || !metadata.theme.trim() || metadata.theme === "Not found" ? "#b0bec5" : "#43a047",
              color: "#fff",
              border: "none",
              borderRadius: 4,
              cursor: loading || !metadata.theme.trim() || metadata.theme === "Not found" ? "not-allowed" : "pointer",
            }}
          >
            {loading ? "Processing..." : "Submit Theme"}
          </button>
        </div>
      )}


      {/* Generated Summary Display and Edit */}
      {summary && (
        <>
          <div style={{ marginTop: 40 }}>
            <h2>📖 Tutorial Script Preview</h2>
            {/* Metadata Display */}
            <div style={{ marginBottom: 20, padding: 15, background: "#e0e0e0", borderRadius: 8 }}>
              <h3>Metadata</h3>
              {/* Display metadata from state, applying red style if it's the 'Not found' placeholder */}
              {Object.keys(metadata).map(key => (
                <p key={key} style={{ margin: '5px 0' }}>
                  <b>{key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, ' $1').trim()}:</b>{" "} {/* Format key like 'playerCount' to 'Player Count' */}
                  <span style={{ color: metadata[key] === "Not found" ? "red" : "black" }}>
                    {metadata[key] === "Not found" ? `${key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, ' $1').trim()} is missing` : metadata[key]}
                  </span>
                </p>
              ))}
            </div>

            {/* Editable Summary Textarea */}
            <textarea
              rows={20}
              style={{ width: "100%", marginBottom: 10, padding: 10, boxSizing: "border-box" }}
              value={editedSummary}
              onChange={handleSummaryEdit}
              placeholder="Edit the tutorial script here..."
            />

            {/* Edit Action Buttons */}
            <button
              onClick={handleSaveSummary}
              disabled={loading || editedSummary === summary} // Disable if loading or no changes made
              style={{
                padding: "10px 20px",
                fontSize: 16,
                background: loading || editedSummary === summary ? "#b0bec5" : "#43a047",
                color: "#fff",
                border: "none",
                borderRadius: 4,
                cursor: loading || editedSummary === summary ? "not-allowed" : "pointer",
                marginRight: 10,
                transition: "background-color 0.2s"
              }}
            >
              Save Edited Script
            </button>
            <button
              onClick={handleSaveAndContinue}
              disabled={loading || sections.length === 0} // Disable if loading or no sections
              style={{
                padding: "10px 20px",
                fontSize: 16,
                background: loading || sections.length === 0 ? "#b0bec5" : "#1976d2",
                color: "#fff",
                border: "none",
                borderRadius: 4,
                cursor: loading || sections.length === 0 ? "not-allowed" : "pointer",
                transition: "background-color 0.2s"
              }}
            >
              Save and Generate Audio
            </button>
          </div>

          {/* Script Sections with Audio Players */}
          <div style={{ marginTop: 20 }}>
            <h3>Script Sections</h3>
            {sections.map((section, idx) => (
              <div
                key={idx}
                style={{
                  border: "1px solid #ddd",
                  borderRadius: 6,
                  marginBottom: 24,
                  padding: 16,
                  background: "#fafbfc",
                }}
              >
                {/* Render section markdown */}
                <ReactMarkdown>{section}</ReactMarkdown>

                {/* Audio Play Button */}
                <button
                  onClick={() => handlePlayAudio(section, idx)}
                  disabled={audioLoading[idx] || !voice} // Disable if loading or no voice selected
                  style={{
                    marginTop: 10,
                    background: audioLoading[idx] || !voice ? "#b0bec5" : "#43a047",
                    color: "#fff",
                    border: "none",
                    borderRadius: 4,
                    padding: "6px 18px",
                    fontSize: 16,
                    cursor: audioLoading[idx] || !voice ? "not-allowed" : "pointer",
                    transition: "background-color 0.2s"
                  }}
                >
                  {audioLoading[idx] ? "Loading audio..." : "🔊 Play Audio"}
                </button>
                {/* Audio Player */}
                <audio
                  id={`audio-${idx}`}
                  controls
                  style={{ display: audio[idx] ? "block" : "none", marginTop: 10 }}
                  src={audio[idx]} // Set the audio source URL
                  onEnded={() => console.log(`Audio for section ${idx} ended.`)} // Optional: Add event handlers
                  onError={(e) => console.error(`Audio playback error for section ${idx}:`, e)}
                />
              </div>
            ))}
          </div>
        </>
      )}


      {/* Footer */}
      <footer style={{ marginTop: 60, color: "#888", fontSize: 14, textAlign: "center" }}>
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