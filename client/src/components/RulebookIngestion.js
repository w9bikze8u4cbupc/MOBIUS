// client/src/components/RulebookIngestion.js
import React, { useState, useRef } from 'react';
import { rulebookApi } from '../api/client';
import { useApi } from '../hooks/useApi';
import { isPdfFile, isFileSizeValid, createFileFormData } from '../utils/fileUtils';
import { notify } from '../utils/notifications';

const RulebookIngestion = ({ projectId, onRulebookProcessed }) => {
  const [file, setFile] = useState(null);
  const [text, setText] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef(null);
  
  const { execute: uploadRulebook, loading: uploadLoading } = useApi(rulebookApi.upload);
  const { execute: parseRulebook, loading: parseLoading } = useApi(rulebookApi.parse);
  
  const loading = uploadLoading || parseLoading;
  
  // Handle file selection
  const handleFile = (selectedFile) => {
    // Validate file
    if (!isPdfFile(selectedFile)) {
      notify.error('Please upload a PDF file');
      return;
    }
    
    if (!isFileSizeValid(selectedFile)) {
      notify.error('File size exceeds 50MB limit');
      return;
    }
    
    setFile(selectedFile);
    // Suggest game name from file name
    const name = selectedFile.name.replace(/\.[^/.]+$/, "").replace(/[_-]/g, " ");
    // We could set this in a callback if needed
    
    // Clear text when file is selected
    setText('');
  };
  
  // Drag and drop handlers
  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };
  
  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };
  
  // Handle file input change
  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  };
  
  // Handle text area change
  const handleTextChange = (e) => {
    setText(e.target.value);
    // Clear file when text is entered
    setFile(null);
  };
  
  // Handle upload and parse
  const handleProcess = async () => {
    if (!projectId) {
      notify.error('Please create a project first');
      return;
    }
    
    try {
      let filePath = '';
      
      // Upload file if selected
      if (file) {
        notify.info('Uploading rulebook PDF...');
        const formData = createFileFormData(file, { projectId });
        const uploadResult = await uploadRulebook(formData);
        filePath = uploadResult.file.path;
        notify.success('Rulebook uploaded successfully!');
      } 
      // Or use text if provided
      else if (text.trim()) {
        // For text input, we would need a different endpoint
        // For now, we'll show an error
        notify.error('Text input not yet supported. Please upload a PDF file.');
        return;
      } 
      // No input provided
      else {
        notify.error('Please upload a PDF file or enter rulebook text');
        return;
      }
      
      // Parse the rulebook
      notify.info('Parsing rulebook...');
      const parseResult = await parseRulebook(projectId, filePath);
      notify.success('Rulebook parsed successfully!');
      
      if (onRulebookProcessed) {
        onRulebookProcessed(parseResult);
      }
    } catch (err) {
      notify.error('Failed to process rulebook: ' + (err.response?.data?.error || err.message));
    }
  };
  
  return (
    <div style={{ marginBottom: '2rem', padding: '1rem', border: '1px solid #ddd', borderRadius: '8px' }}>
      <h2>Rulebook Ingestion</h2>
      
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
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf"
          style={{ display: "none" }}
          onChange={handleFileChange}
        />
        <div style={{ fontSize: 18 }}>
          {file ? `Selected: ${file.name}` : "Drag & drop a PDF file here, or click to select"}
        </div>
        {file && !isPdfFile(file) && (
          <div style={{ color: "orange", marginTop: 10 }}>
            Warning: Only PDF files are supported for automatic text extraction.
          </div>
        )}
      </div>
      
      {/* Rulebook Text Area */}
      <div style={{ marginBottom: 20 }}>
        <textarea
          rows={10}
          style={{ width: "100%", padding: 10, boxSizing: "border-box" }}
          placeholder="Or paste rulebook text here..."
          value={text}
          onChange={handleTextChange}
          disabled={!!file} // Disable text input when file is selected
        />
      </div>
      
      <button
        onClick={handleProcess}
        disabled={loading || (!file && !text.trim()) || !projectId}
        style={{
          padding: "0.75rem 1.5rem",
          fontSize: "1rem",
          background: loading || (!file && !text.trim()) || !projectId ? "#b0bec5" : "#1976d2",
          color: "#fff",
          border: "none",
          borderRadius: 4,
          cursor: loading || (!file && !text.trim()) || !projectId ? "not-allowed" : "pointer",
          transition: "background-color 0.2s"
        }}
      >
        {loading ? "Processing..." : "Process Rulebook"}
      </button>
      
      {loading && (
        <div style={{ marginTop: '1rem', color: '#666' }}>
          Processing rulebook, please wait...
        </div>
      )}
    </div>
  );
};

export default RulebookIngestion;