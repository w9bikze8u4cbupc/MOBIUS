import React, { useState, useRef, useEffect } from "react";
import axios from "axios";
import { GlobalWorkerOptions, getDocument } from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.entry";
import { GenesisFeedbackPanel } from "./GenesisFeedbackPanel";
import { GenesisHealthPanel } from "./GenesisHealthPanel";
import { GenesisArtifactsPanel } from "./GenesisArtifactsPanel";
import { GenesisGoalsEditor } from "./GenesisGoalsEditor";
import { GenesisAutoOptimizeButton } from "./GenesisAutoOptimizeButton";
import { GenesisCampaignPanel } from "./GenesisCampaignPanel";
import { GenesisInspector } from "./GenesisInspector";
import { GenesisQaReportButton } from "./GenesisQaReportButton";
import { GenesisDebugBundleButton } from "./GenesisDebugBundleButton";
import { PipelineStepper } from "./components/PipelineStepper";
import { pipelineSteps } from "./components/pipelineSteps";
import { ProjectSetupStep } from "./components/steps/ProjectSetupStep";
import { MetadataInputStep } from "./components/steps/MetadataInputStep";
import { IngestionReviewStep } from "./components/steps/IngestionReviewStep";
import { ImagesStep } from "./components/steps/ImagesStep";
import { ScriptStep } from "./components/steps/ScriptStep";
import { StoryboardStep } from "./components/steps/StoryboardStep";
import { VoiceStep } from "./components/steps/VoiceStep";
import { RenderExportStep } from "./components/steps/RenderExportStep";
import "./styles/pipeline.css";

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

function buildSyntheticPagesFromText(text) {
  const paragraphs = text
    .split(/\n+/)
    .map((chunk) => chunk.trim())
    .filter(Boolean);

  if (!paragraphs.length) {
    return [];
  }

  const chunkSize = 6;
  const pages = [];
  for (let i = 0; i < paragraphs.length; i += chunkSize) {
    const slice = paragraphs.slice(i, i + chunkSize);
    const blocks = slice.map((para, idx) => ({
      text: para,
      fontSize: idx === 0 ? 24 : 14,
      x: 50,
      y: 40 + idx * 30,
      width: 500,
      height: 20,
    }));

    pages.push({
      number: pages.length + 1,
      blocks,
    });
  }

  return pages;
}


function App() {
  // --- State Variables ---
  const [file, setFile] = useState(null);
  const [rulebookText, setRulebookText] = useState("");
  const [language, setLanguage] = useState("english");
  const [voice, setVoice] = useState(""); // Stores ElevenLabs voice ID
  const [gameName, setGameName] = useState("");
  const [projectId, setProjectId] = useState("");
  const [bggUrl, setBggUrl] = useState("");
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
  const [ingestionManifest, setIngestionManifest] = useState(null);
  const [storyboardManifest, setStoryboardManifest] = useState(null);
  const [ingestionError, setIngestionError] = useState("");
  const [storyboardError, setStoryboardError] = useState("");
  const [ingesting, setIngesting] = useState(false);
  const [storyboarding, setStoryboarding] = useState(false);
  const [renderLang, setRenderLang] = useState("en");
  const [renderResolution, setRenderResolution] = useState("1920x1080");
  const [renderJobConfig, setRenderJobConfig] = useState(null);
  const [renderConfigError, setRenderConfigError] = useState("");
  const [showRenderConfigJson, setShowRenderConfigJson] = useState(false);
  const [renderJobState, setRenderJobState] = useState(null);
  const [renderJobError, setRenderJobError] = useState("");
  const [renderJobLoading, setRenderJobLoading] = useState(false);
  const renderPollRef = useRef(null);
  const [activeStepId, setActiveStepId] = useState(pipelineSteps[0].id);
  const [completedStepIds, setCompletedStepIds] = useState([]);


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

  useEffect(() => {
    return () => {
      if (renderPollRef.current) {
        clearInterval(renderPollRef.current);
      }
    };
  }, []);


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
    setIngestionManifest(null);
    setStoryboardManifest(null);
    setIngestionError("");
    setStoryboardError("");
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
    setIngestionManifest(null);
    setStoryboardManifest(null);
    setIngestionError("");
    setStoryboardError("");

  };

  const handleRunIngestion = async () => {
    if (!rulebookText.trim()) {
      setIngestionError("Upload or paste a rulebook first");
      return;
    }

    setIngesting(true);
    setIngestionError("");
    setStoryboardManifest(null);

    const syntheticPages = buildSyntheticPagesFromText(rulebookText);
    const idSlug = (projectId || gameName || 'rulebook').replace(/\s+/g, '-').toLowerCase();
    const payload = {
      documentId: idSlug || 'rulebook',
      metadata: {
        title: gameName || 'Untitled Rulebook',
        gameId: idSlug || 'rulebook',
        source: 'client-ui'
      },
      pages: syntheticPages,
      bggMetadata: {}
    };

    try {
      const { data } = await axios.post(`${BACKEND_URL}/api/ingest`, payload);
      setIngestionManifest(data.manifest);
    } catch (err) {
      setIngestionManifest(null);
      const apiError = err.response?.data?.code || err.response?.data?.error || err.message;
      setIngestionError(apiError);
    } finally {
      setIngesting(false);
    }
  };

  const handleGenerateStoryboard = async () => {
    if (!ingestionManifest) {
      setStoryboardError("Run deterministic ingestion first");
      return;
    }

    setStoryboarding(true);
    setStoryboardError("");

    try {
      const { data } = await axios.post(`${BACKEND_URL}/api/storyboard`, {
        ingestionManifest,
        options: { includeOverlayHashes: true }
      });
      setStoryboardManifest(data.manifest);
    } catch (err) {
      const apiError = err.response?.data?.code || err.response?.data?.error || err.message;
      setStoryboardError(apiError);
    } finally {
      setStoryboarding(false);
    }
  };

  const handleRenderJobConfig = async () => {
    setRenderConfigError("");
    setShowRenderConfigJson(false);

    if (!projectId.trim()) {
      setRenderConfigError("Project ID is required to generate a render job config.");
      return;
    }

    try {
      const { data } = await axios.get(`${BACKEND_URL}/api/render-job-config`, {
        params: {
          projectId: projectId.trim(),
          lang: renderLang,
          resolution: renderResolution,
        },
      });

      setRenderJobConfig(data.config);
    } catch (err) {
      const apiError = err.response?.data?.error || err.response?.data?.code || err.message;
      setRenderConfigError(apiError);
      setRenderJobConfig(null);
    }
  };

  const fetchRenderArtifacts = async (jobId) => {
    try {
      const { data } = await axios.get(`${BACKEND_URL}/api/render/${jobId}/artifacts`);
      setRenderJobState((prev) => ({
        ...(prev || { id: jobId }),
        artifacts: data.artifacts || [],
      }));
    } catch (err) {
      const apiError = err.response?.data?.error || err.message;
      setRenderJobError(apiError);
    }
  };

  const pollRenderJob = (jobId) => {
    if (renderPollRef.current) {
      clearInterval(renderPollRef.current);
    }

    renderPollRef.current = setInterval(async () => {
      try {
        const { data } = await axios.get(`${BACKEND_URL}/api/render/${jobId}/status`);
        const job = data.job || {};
        setRenderJobState(job);

        if (job.status === 'completed') {
          clearInterval(renderPollRef.current);
          renderPollRef.current = null;
          fetchRenderArtifacts(jobId);
        } else if (job.status === 'failed') {
          clearInterval(renderPollRef.current);
          renderPollRef.current = null;
        }
      } catch (err) {
        const apiError = err.response?.data?.error || err.message;
        setRenderJobError(apiError);
        clearInterval(renderPollRef.current);
        renderPollRef.current = null;
      }
    }, 3000);
  };

  const handleStartRender = async () => {
    setRenderJobError("");
    setRenderJobLoading(true);

    if (renderPollRef.current) {
      clearInterval(renderPollRef.current);
      renderPollRef.current = null;
    }

    try {
      const payload = renderJobConfig
        ? { config: renderJobConfig }
        : {
            projectId: projectId.trim(),
            lang: renderLang,
            resolution: renderResolution,
          };

      if (!payload.projectId && !payload.config) {
        setRenderJobError("Project ID or a precomputed render job config is required.");
        setRenderJobLoading(false);
        return;
      }

      const { data } = await axios.post(`${BACKEND_URL}/api/render`, payload);
      const job = {
        id: data.jobId,
        status: data.status,
        progress: data.progress || 0,
        artifacts: [],
      };

      setRenderJobState(job);
      pollRenderJob(job.id);
    } catch (err) {
      const apiError = err.response?.data?.error || err.response?.data?.code || err.message;
      setRenderJobError(apiError);
    } finally {
      setRenderJobLoading(false);
    }
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

  const goToStep = (stepId) => {
    if (completedStepIds.includes(stepId)) {
      setActiveStepId(stepId);
    }
  };

  const markStepCompleted = (stepId) => {
    setCompletedStepIds((prev) => (prev.includes(stepId) ? prev : [...prev, stepId]));
  };

  const advanceToNextStep = (currentStepId) => {
    const currentIndex = pipelineSteps.findIndex((s) => s.id === currentStepId);
    const next = pipelineSteps[currentIndex + 1];
    if (next) {
      setActiveStepId(next.id);
    }
  };

  const handleConfirmStep = (stepId) => {
    const setAndAdvance = () => {
      markStepCompleted(stepId);
      advanceToNextStep(stepId);
    };

    switch (stepId) {
      case "project": {
        if (!gameName.trim()) {
          setError("Provide a game name before continuing.");
          return;
        }
        setError("");
        setAndAdvance();
        break;
      }
      case "metadata": {
        if (!rulebookText.trim()) {
          setError("Upload a PDF or paste rulebook text to continue.");
          return;
        }
        setError("");
        setAndAdvance();
        break;
      }
      case "ingestion": {
        if (!ingestionManifest) {
          setError("Run deterministic ingestion first.");
          return;
        }
        setError("");
        setAndAdvance();
        break;
      }
      case "images": {
        setError("");
        setAndAdvance();
        break;
      }
      case "script": {
        if (!summary.trim()) {
          setError("Generate and review the script before confirming.");
          return;
        }
        setError("");
        setAndAdvance();
        break;
      }
      case "storyboard": {
        if (!storyboardManifest) {
          setError("Generate the storyboard to proceed.");
          return;
        }
        setError("");
        setAndAdvance();
        break;
      }
      case "voice": {
        if (!sections.length) {
          setError("Generate sectioned audio from the script before confirming.");
          return;
        }
        setError("");
        setAndAdvance();
        break;
      }
      case "render": {
        if (renderJobState?.status !== "completed") {
          setError("Start and finish a render job before final confirmation.");
          return;
        }
        setError("");
        markStepCompleted(stepId);
        break;
      }
      default:
        setAndAdvance();
    }
  };


  
  // --- Rendered Output (JSX) ---
  return (
    <div style={{ maxWidth: "1200px", margin: "24px auto", fontFamily: "sans-serif", padding: 20 }}>
      <h1>Board Game Tutorial Generator</h1>
      <div className="pipeline-layout">
        <div className="pipeline-main">
          <PipelineStepper
            steps={pipelineSteps}
            activeStepId={activeStepId}
            completedStepIds={completedStepIds}
            onStepClick={goToStep}
            onConfirmStep={handleConfirmStep}
          />

          {error && (<div style={{ color: "red", marginBottom: 12 }}>{error}</div>)}
          {translationStatus.error && (<div style={{ color: "orange", marginBottom: 12 }}>{translationStatus.error}</div>)}

          {activeStepId === "project" && (
            <ProjectSetupStep
              projectId={projectId}
              setProjectId={setProjectId}
              gameName={gameName}
              setGameName={setGameName}
              language={language}
              setLanguage={setLanguage}
              voice={voice}
              setVoice={setVoice}
              getLanguageVoices={getLanguageVoices}
              detailPercentage={detailPercentage}
              setDetailPercentage={setDetailPercentage}
              renderLang={renderLang}
              setRenderLang={setRenderLang}
              renderResolution={renderResolution}
              setRenderResolution={setRenderResolution}
            />
          )}

          {activeStepId === "metadata" && (
            <MetadataInputStep
              bggUrl={bggUrl}
              setBggUrl={setBggUrl}
              metadata={metadata}
              handleMetadataChange={handleMetadataChange}
              file={file}
              dragActive={dragActive}
              onDrag={handleDrag}
              onDrop={handleDrop}
              fileInputRef={fileInputRef}
              onFileChange={handleFileChange}
              rulebookText={rulebookText}
              onTextChange={handleTextChange}
              error={error}
            />
          )}

          {activeStepId === "ingestion" && (
            <IngestionReviewStep
              onRunIngestion={handleRunIngestion}
              ingesting={ingesting}
              rulebookText={rulebookText}
              ingestionManifest={ingestionManifest}
              ingestionError={ingestionError}
            />
          )}

          {activeStepId === "images" && <ImagesStep />}

          {activeStepId === "script" && (
            <ScriptStep
              loading={loading}
              rulebookText={rulebookText}
              gameName={gameName}
              onSummarize={handleSummarize}
              summary={summary}
              editedSummary={editedSummary}
              onEdit={handleSummaryEdit}
              onSave={handleSaveSummary}
              translationStatus={translationStatus}
              error={error}
            />
          )}

          {activeStepId === "storyboard" && (
            <StoryboardStep
              onGenerateStoryboard={handleGenerateStoryboard}
              storyboardManifest={storyboardManifest}
              storyboardError={storyboardError}
              storyboarding={storyboarding}
            />
          )}

          {activeStepId === "voice" && (
            <VoiceStep
              sections={sections}
              audio={audio}
              audioLoading={audioLoading}
              onPlayAudio={handlePlayAudio}
            />
          )}

          {activeStepId === "render" && (
            <RenderExportStep
              projectId={projectId}
              renderLang={renderLang}
              setRenderLang={setRenderLang}
              renderResolution={renderResolution}
              setRenderResolution={setRenderResolution}
              onGenerateConfig={handleRenderJobConfig}
              renderJobConfig={renderJobConfig}
              renderConfigError={renderConfigError}
              showRenderConfigJson={showRenderConfigJson}
              setShowRenderConfigJson={setShowRenderConfigJson}
              onStartRender={handleStartRender}
              renderJobState={renderJobState}
              renderJobError={renderJobError}
              renderJobLoading={renderJobLoading}
            />
          )}
        </div>

        <div className="pipeline-sidebar">
          <h3 style={{ marginTop: 0 }}>GENESIS controls</h3>
          <p className="pipeline-muted">Optional QA and campaign helpers.</p>
          {projectId.trim() ? (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
                <GenesisHealthPanel projectId={projectId.trim()} />
                <GenesisArtifactsPanel projectId={projectId.trim()} />
                <GenesisCampaignPanel projectId={projectId.trim()} />
              </div>
              <div style={{ margin: "12px 0" }}>
                <GenesisGoalsEditor projectId={projectId.trim()} />
              </div>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
                <GenesisAutoOptimizeButton projectId={projectId.trim()} />
                <GenesisQaReportButton projectId={projectId.trim()} />
                <GenesisDebugBundleButton projectId={projectId.trim()} />
                <GenesisInspector projectId={projectId.trim()} />
              </div>
              <GenesisFeedbackPanel projectId={projectId.trim()} />
            </>
          ) : (
            <p className="pipeline-muted">Enter a project ID to view GENESIS health, artifacts, and feedback.</p>
          )}
        </div>
      </div>

      {showThemePrompt && (
        <div
          style={{
            position: "fixed",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            background: "#fff",
            padding: 30,
            borderRadius: 8,
            boxShadow: "0 0 20px rgba(0,0,0,0.5)",
            zIndex: 1000,
            minWidth: 300,
            maxWidth: 400,
            textAlign: "center",
          }}
        >
          <h3>Game Theme Required</h3>
          <p>The theme could not be automatically detected. Please enter the game's theme to continue:</p>
          <input
            type="text"
            value={metadata.theme}
            onChange={(e) => handleMetadataChange("theme", e.target.value)}
            placeholder="e.g., Deep-sea Adventure"
            style={{ width: "calc(100% - 22px)", marginBottom: 15, padding: 10 }}
          />
          <button
            onClick={handleThemeSubmit}
            style={{ padding: "10px 20px", background: "#1976d2", color: "#fff", border: "none", borderRadius: 4 }}
          >
            Submit Theme
          </button>
        </div>
      )}
    </div>
  );
}
