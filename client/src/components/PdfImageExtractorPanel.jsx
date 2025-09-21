import React, { useState } from 'react';
import { extractPdfImages } from '../api/extractPdfImages';
import {
  extractActionsByUrl,
  sortImagesForPicking,
} from '../api/extractActions';
import ImageSelectModal from './ImageSelectModal';

export default function PdfImageExtractorPanel({ onUse }) {
  const [pdfUrl, setPdfUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingActions, setLoadingActions] = useState(false);
  const [images, setImages] = useState([]);
  const [jobId, setJobId] = useState(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState(null);
  const [extractionType, setExtractionType] = useState('all'); // 'all' or 'actions'

  const run = async () => {
    setError(null);
    setLoading(true);
    setExtractionType('all');
    try {
      const res = await extractPdfImages(pdfUrl);
      setImages(res.images || []);
      setJobId(res.jobId);
      setOpen(true);
    } catch (e) {
      setError(e?.message || 'Extraction failed');
    } finally {
      setLoading(false);
    }
  };

  const runActions = async () => {
    setError(null);
    setLoadingActions(true);
    setExtractionType('actions');
    try {
      if (!pdfUrl) {
        setError('Please provide a PDF URL first.');
        return;
      }

      const actionImages = await extractActionsByUrl(pdfUrl);

      if (actionImages.length === 0) {
        setError(
          'No "Actions" images found. Try another PDF or adjust keywords.'
        );
        return;
      }

      // Apply GPT-5 suggested sorting for better UX
      const sortedImages = sortImagesForPicking(actionImages);
      setImages(sortedImages);
      setJobId('actions');
      setOpen(true);
    } catch (e) {
      setError(`extract-actions failed: ${e?.message || e}`);
    } finally {
      setLoadingActions(false);
    }
  };

  const handleUse = selected => {
    // Pipe selected into your pipeline with extraction type context
    onUse?.(selected, { jobId, pdfUrl, extractionType });
    setOpen(false);
  };

  return (
    <div
      style={{
        border: '1px solid #333',
        borderRadius: 8,
        padding: 12,
        background: '#0e0e0e',
      }}
    >
      <div
        style={{
          display: 'flex',
          gap: 8,
          alignItems: 'center',
          flexWrap: 'wrap',
        }}
      >
        <input
          value={pdfUrl}
          onChange={e => setPdfUrl(e.target.value)}
          placeholder="https://example.com/rulebook.pdf"
          style={{ width: 480, maxWidth: '90vw', padding: 8 }}
        />
        <button
          onClick={run}
          disabled={!pdfUrl || loading || loadingActions}
          style={{
            background: '#f39c12',
            color: '#000',
            padding: '8px 12px',
            borderRadius: 6,
          }}
        >
          {loading ? 'Extracting…' : 'Extract PDF Images'}
        </button>
        <button
          onClick={runActions}
          disabled={!pdfUrl || loading || loadingActions}
          style={{
            background: '#e74c3c',
            color: '#fff',
            padding: '8px 12px',
            borderRadius: 6,
          }}
        >
          {loadingActions ? 'Finding Actions…' : 'Choose Actions Image'}
        </button>
        {jobId ? (
          <span style={{ color: '#bbb' }}>Last job: {jobId}</span>
        ) : null}
      </div>
      {error ? (
        <div style={{ color: '#ff6b6b', marginTop: 8 }}>{error}</div>
      ) : null}

      <ImageSelectModal
        isOpen={open}
        images={images}
        onClose={() => setOpen(false)}
        onConfirm={handleUse}
        title={
          extractionType === 'actions' ? 'Choose Action Image' : 'Choose Images'
        }
      />
    </div>
  );
}
