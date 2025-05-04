import React, { useState, useRef, useEffect } from "react";
import axios from "axios";
import ReactMarkdown from "react-markdown";
import { GlobalWorkerOptions, getDocument } from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.entry";

GlobalWorkerOptions.workerSrc = pdfWorker;

const BACKEND_URL = "http://localhost:5000";

const VOICE_OPTIONS = [
  { name: "English - Hope", id: "tnSpp4vdxKPjI9w0GnoV", language: "english" },
  { name: "English - Adam", id: "pNInz6obpgDQGcFmaJgB", language: "english" },
  { name: "English - Bella", id: "EXAVITQu4vr4xnSDxMaL", language: "english" },
  { name: "French - Patrick", id: "rPtBTsmbA2jLKTe6xbNh", language: "french" },
  { name: "French - Declan", id: "kqVT88a5QfII1HNAEPTJ", language: "french" },
  { name: "French - Adina", id: "FvmvwvObRqIHojkEGh5N", language: "french" },
  { name: "French - Marco", id: "1e772jvf7it56XMrbdci", language: "french" },
];

function splitMarkdownSections(markdown) {
  const regex = /(^|\n)(## .+)/g;
  let match, indices = [];
  while ((match = regex.exec(markdown)) !== null) {
    indices.push(match.index + (match[1] ? match[1].length : 0));
  }
  indices.push(markdown.length);

  let sections = [];
  for (let i = 0; i < indices.length - 1; i++) {
    const section = markdown.slice(indices[i], indices[i + 1]).trim();
    if (section) sections.push(section);
  }
  return sections;
}

function App() {  
  const [file, setFile] = useState(null);  
  const [text, setText] = useState("");  
  const [language, setLanguage] = useState("english");  
  const [loading, setLoading] = useState(false);  
  const [summary, setSummary] = useState("");  
  const [sections, setSections] = useState([]);  
  const [audio, setAudio] = useState({});  
  const [audioLoading, setAudioLoading] = useState({});  
  const [error, setError] = useState("");  
  const [dragActive, setDragActive] = useState(false);  
  const fileInputRef = useRef();  
  const [voice, setVoice] = useState("");

  const [gameName, setGameName] = useState("");
 
  // PDF text extraction
  const extractTextFromPDF = async (file) => {
    setError("");
    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await getDocument({ data: arrayBuffer }).promise;
      let fullText = "";
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        const pageText = content.items.map((item) => item.str).join(" ");
        fullText += pageText + "\n";
      }
      return fullText;
    } catch (err) {
      setError("Failed to extract text from PDF. Try another file.");
      return "";
    }
  };

 const getLanguageVoices = (language) => {
  return VOICE_OPTIONS.filter((voice) => voice.language === language);
 };

 useEffect(() => {
   const languageVoices = getLanguageVoices(language);  
   if (languageVoices.length > 0) {  
     setVoice(languageVoices[0].id);  
   }  
 }, [language]);

  // Handle file upload (PDF or TXT)
  const handleFile = async (file) => {
    setFile(file);
  const name = file.name.replace(/\.[^/.]+$/, "").replace(/[_-]/g, " ");  
    setGameName(name);
    setText("");
    setSummary("");
    setSections([]);
    setAudio({});
    setError("");
    if (file.type === "text/plain") {
      const reader = new FileReader();
      reader.onload = (evt) => setText(evt.target.result);
      reader.readAsText(file);
    } else if (file.type === "application/pdf") {
      setLoading(true);
      const extracted = await extractTextFromPDF(file);
      setText(extracted);
      setLoading(false);
    } else {
      setError("Unsupported file type. Please upload a PDF or TXT file.");
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
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  };

  // Handle direct text input
  const handleTextChange = (e) => {
    setText(e.target.value);
    setFile(null);
    setSummary("");
    setSections([]);
    setAudio({});
    setError("");
  };

  // Submit for summarization
  const handleSummarize = async () => {
    setLoading(true);
    setSummary("");
    setSections([]);
    setAudio({});
    setError("");
    try {
      let extractedText = text;
      if (!extractedText.trim()) {
        setError("Please provide rulebook text or upload a .txt or .pdf file.");
        setLoading(false);
        return;
      }
      const res = await axios.post(`${BACKEND_URL}/summarize`, {
        extractedText,
        language,
        gameName,
      });
      setSummary(res.data.summary);
      setSections(splitMarkdownSections(res.data.summary));
    } catch (err) {
      setError(
        err.response?.data?.error ||
          "Failed to summarize. Check backend and API keys."
      );
    }
    setLoading(false);
  };
  
  // Function to strip markdown formatting  
  function stripMarkdown(text) {  
    // Remove markdown headers (e.g., ## Title)  
    text = text.replace(/^#+\s+/gm, "");  
    // Remove bold and italics  
    text = text.replace(/(\*\*|__)(.*?)\1/g, "$2");  
    text = text.replace(/(\*|_)(.*?)\1/g, "$2");  
    // Remove inline code  
    text = text.replace(/`([^`]+)`/g, "$1");  
    // Remove links but keep the text  
    text = text.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");  
    // Remove images  
    text = text.replace(/!\[([^\]]*)\]\([^)]+\)/g, "");  
    // Remove unordered and ordered list markers  
    text = text.replace(/^\s*[-*+]\s+/gm, "");  
    text = text.replace(/^\s*\d+\.\s+/gm, "");  
    // Remove blockquotes  
    text = text.replace(/^\s*>\s?/gm, "");  
    // Remove extra spaces at start/end of lines  
    text = text.replace(/^\s+|\s+$/gm, "");  
    // Remove multiple blank lines  
    text = text.replace(/\n{2,}/g, "\n\n");  
    return text.trim();  
  }

  // Request TTS for a section
  const handlePlayAudio = async (section, idx) => {
    setAudioLoading((prev) => ({ ...prev, [idx]: true }));
    setError("");
    try {
      // Remove markdown
      let ttsText = stripMarkdown(section);
  
      if (idx === 0) {
        // Remove any leading "Introduction" (case-insensitive, with or without whitespace)  
        ttsText = ttsText.replace(/^Introduction\s*/i, '').trim();
      }
  
      console.log("Original section:", section);
      console.log("After processing:", ttsText);
      console.log("Section index:", idx);
  
      if (!ttsText) {
        setError("No text to send to TTS for this section.");
        setAudioLoading((prev) => ({ ...prev, [idx]: false }));
        return;
      }
  
      const res = await axios.post(
        `${BACKEND_URL}/tts`,
        {
          text: ttsText,
          language,
          voice,
        },
        { responseType: "arraybuffer" }
      );
      const contentType = res.headers["content-type"];
      if (!contentType.startsWith("audio/")) {
        setError("TTS failed: " + new TextDecoder().decode(res.data));
        setAudioLoading((prev) => ({ ...prev, [idx]: false }));
        return;
      }
      const blob = new Blob([res.data], { type: "audio/mpeg" });
      const url = URL.createObjectURL(blob);
      if (audio[idx]) {
        URL.revokeObjectURL(audio[idx]);
      }
      setAudio((prev) => ({ ...prev, [idx]: url }));
    } catch (err) {
      setError(
        err.response?.data?.error ||
          "Failed to generate audio. Check ElevenLabs API key."
      );
    }
    setAudioLoading((prev) => ({ ...prev, [idx]: false }));
  };
      
  return (
    <div style={{ maxWidth: 800, margin: "40px auto", fontFamily: "sans-serif" }}>
      <h1>Board Game Rulebook Summarizer & Video Script Generator</h1>
      <div style={{ marginBottom: 20 }}>
        <label>
          <b>Language:</b>{" "}
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            style={{ marginRight: 20 }}
          >
            <option value="english">English</option>
            <option value="french">French</option>
          </select>
        </label>
      </div>
      <div style={{ marginBottom: 20 }}>
        <label>
         <b>Game Name:</b>{" "}
         <input
           type="text"
           value={gameName}
           onChange={e => setGameName(e.target.value)}
           placeholder="Enter the game name"
           style={{ marginRight: 20 }}
         />
       </label>
      </div>
      <div style={{ marginBottom: 20 }}>
        <label>
          <b>Voice:</b>{" "}
          <select
            value={voice}
            onChange={(e) => setVoice(e.target.value)}
            style={{ marginRight: 20 }}
          >
            {getLanguageVoices(language).map((voiceOption) => (
              <option key={voiceOption.id} value={voiceOption.id}>
                {voiceOption.name}
              </option>
            ))}
          </select>
        </label>
      </div>
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
        }}
        onClick={() => fileInputRef.current.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".txt,application/pdf"
          style={{ display: "none" }}
          onChange={handleFileChange}
        />
        <div style={{ fontSize: 18 }}>
          {file
            ? `Selected: ${file.name}`
            : "Drag & drop a PDF or TXT file here, or click to select"}
        </div>
      </div>
      <div style={{ marginBottom: 20 }}>
        <textarea
          rows={10}
          style={{ width: "100%" }}
          placeholder="Paste rulebook text here..."
          value={text}
          onChange={handleTextChange}
        />
      </div>
      <button
        onClick={handleSummarize}
        disabled={loading}
        style={{
          padding: "10px 30px",
          fontSize: 18,
          background: "#1976d2",
          color: "#fff",
          border: "none",
          borderRadius: 4,
          cursor: "pointer",
        }}
      >
        {loading ? "Processing..." : "Summarize & Generate Script"}
      </button>
      {error && (
        <div style={{ color: "red", marginTop: 20, fontWeight: "bold" }}>
          {error}
        </div>
      )}
      {loading && (  
        <div style={{ marginTop: 20, color: "#1976d2", fontWeight: "bold", fontSize: 18, display: "flex", alignItems: "center", gap: 10 }}>  
         <span className="spinning-hourglass" role="img" aria-label="hourglass">⏳</span>  
         Summarizing the rulebook... Please wait  
       </div>  
      )}
      {summary && (
        <div style={{ marginTop: 40 }}>
          <h2>📖 Tutorial Script</h2>
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
              <ReactMarkdown>{section}</ReactMarkdown>
              <button
                onClick={() => handlePlayAudio(section, idx)}
                disabled={audioLoading[idx]}
                style={{
                  marginTop: 10,
                  background: "#43a047",
                  color: "#fff",
                  border: "none",
                  borderRadius: 4,
                  padding: "6px 18px",
                  fontSize: 16,
                  cursor: "pointer",
                }}
              >
                {audioLoading[idx] ? "Loading audio..." : "🔊 Play Audio"}
              </button>
              <audio
                id={`audio-${idx}`}
                controls
                style={{ display: audio[idx] ? "block" : "none", marginTop: 10 }}
                src={audio[idx]}
              />
            </div>
          ))}
        </div>
      )}
      <footer style={{ marginTop: 60, color: "#888", fontSize: 14 }}>
        <div>
          <b>Tip:</b> For best results, upload a PDF/TXT or paste the rulebook text.
        </div>
        <div>
          <b>Backend:</b> <code>{BACKEND_URL}</code>
        </div>
      </footer>
    </div>
  );
}

export default App;