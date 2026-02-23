// client/src/components/PdfImageExtraction.js
// HEPHAESTUS PDF Image Extraction UI
// Operator workflow: Run extraction → Review crops → Import selected assets

import React, { useState, useEffect } from 'react';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:5001';

/**
 * PdfImageExtraction Component
 * Provides UI for HEPHAESTUS extraction workflow
 */
function PdfImageExtraction({ projectId, pdfPath }) {
  const [loading, setLoading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [extractions, setExtractions] = useState([]);
  const [selectedExtraction, setSelectedExtraction] = useState(null);
  const [imageAssets, setImageAssets] = useState([]);
  const [selectedAssets, setSelectedAssets] = useState(new Set());
  const [importNotes, setImportNotes] = useState('');
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // Load extraction status on mount
  useEffect(() => {
    loadExtractionStatus();
  }, [projectId]);

  /**
   * Load extraction status from server
   */
  const loadExtractionStatus = async () => {
    try {
      setLoading(true);
      const response = await axios.get(
        `${BACKEND_URL}/api/projects/${projectId}/pdf/extract-images/status`
      );
      
      if (response.data.success) {
        setExtractions(response.data.extractions || []);
      }
    } catch (err) {
      console.error('Error loading extraction status:', err);
      setError(err.response?.data?.error || 'Failed to load extraction status');
    } finally {
      setLoading(false);
    }
  };

  /**
   * Trigger new extraction
   */
  const runExtraction = async () => {
    if (!pdfPath) {
      setError('PDF path is required');
      return;
    }

    try {
      setExtracting(true);
      setError(null);
      setSuccess(null);

      const response = await axios.post(
        `${BACKEND_URL}/api/projects/${projectId}/pdf/extract-images`,
        {
          pdfPath,
          options: {
            minConfidence: 0.7,
            cropPadding: 10
          }
        }
      );

      if (response.data.success) {
        setSuccess(`Extracted ${response.data.stats.imagesExtracted} images`);
        setImageAssets(response.data.imageAssets || []);
        setSelectedExtraction(response.data.extractionId);
        
        // Reload extraction list
        await loadExtractionStatus();
      }
    } catch (err) {
      console.error('Error running extraction:', err);
      setError(err.response?.data?.error || 'Extraction failed');
      
      // Show detailed error if available
      if (err.response?.data?.reason) {
        setError(`${err.response.data.error}: ${err.response.data.reason}`);
      }
    } finally {
      setExtracting(false);
    }
  };

  /**
   * Load extraction results
   */
  const loadExtraction = async (extractionId) => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await axios.get(
        `${BACKEND_URL}/api/projects/${projectId}/pdf/extract-images/status`
      );
      
      if (response.data.success) {
        const extraction = response.data.extractions.find(
          e => e.extractionId === extractionId
        );
        
        if (extraction && extraction.manifest) {
          setImageAssets(extraction.manifest.images || []);
          setSelectedExtraction(extractionId);
          setSelectedAssets(new Set());
        }
      }
    } catch (err) {
      console.error('Error loading extraction:', err);
      setError('Failed to load extraction results');
    } finally {
      setLoading(false);
    }
  };

  /**
   * Toggle asset selection
   */
  const toggleAsset = (assetId) => {
    const newSelected = new Set(selectedAssets);
    if (newSelected.has(assetId)) {
      newSelected.delete(assetId);
    } else {
      newSelected.add(assetId);
    }
    setSelectedAssets(newSelected);
  };

  /**
   * Select all assets
   */
  const selectAll = () => {
    setSelectedAssets(new Set(imageAssets.map(a => a.id)));
  };

  /**
   * Deselect all assets
   */
  const deselectAll = () => {
    setSelectedAssets(new Set());
  };

  /**
   * Import selected assets
   */
  const importAssets = async () => {
    if (selectedAssets.size === 0) {
      setError('No assets selected');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      setSuccess(null);

      const response = await axios.post(
        `${BACKEND_URL}/api/projects/${projectId}/images/import-hephaestus`,
        {
          extractionId: selectedExtraction,
          selectedAssetIds: Array.from(selectedAssets),
          notes: importNotes || null
        }
      );

      if (response.data.success) {
        setSuccess(`Imported ${response.data.importedCount} component images`);
        setSelectedAssets(new Set());
        setImportNotes('');
        
        // Reload extraction status
        await loadExtractionStatus();
      }
    } catch (err) {
      console.error('Error importing assets:', err);
      setError(err.response?.data?.error || 'Failed to import assets');
    } finally {
      setLoading(false);
    }
  };

  /**
   * Get confidence badge color
   */
  const getConfidenceBadge = (confidence) => {
    if (confidence >= 0.8) return 'bg-green-100 text-green-800';
    if (confidence >= 0.6) return 'bg-yellow-100 text-yellow-800';
    return 'bg-red-100 text-red-800';
  };

  /**
   * Get type badge color
   */
  const getTypeBadge = (type) => {
    const colors = {
      card: 'bg-blue-100 text-blue-800',
      token: 'bg-purple-100 text-purple-800',
      board: 'bg-indigo-100 text-indigo-800',
      piece: 'bg-pink-100 text-pink-800',
      tile: 'bg-orange-100 text-orange-800',
      die: 'bg-red-100 text-red-800',
      marker: 'bg-teal-100 text-teal-800',
      unknown: 'bg-gray-100 text-gray-800'
    };
    return colors[type] || colors.unknown;
  };

  return (
    <div className="pdf-image-extraction p-6 bg-white rounded-lg shadow">
      <h2 className="text-2xl font-bold mb-4">Component Image Extraction</h2>
      <p className="text-gray-600 mb-6">
        Extract component images from PDF using HEPHAESTUS AI detection
      </p>

      {/* Error/Success Messages */}
      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded text-red-800">
          <strong>Error:</strong> {error}
        </div>
      )}
      
      {success && (
        <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded text-green-800">
          <strong>Success:</strong> {success}
        </div>
      )}

      {/* Run Extraction Button */}
      <div className="mb-6">
        <button
          onClick={runExtraction}
          disabled={extracting || !pdfPath}
          className={`px-6 py-3 rounded font-semibold ${
            extracting || !pdfPath
              ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
              : 'bg-blue-600 text-white hover:bg-blue-700'
          }`}
        >
          {extracting ? 'Extracting...' : 'Run Extraction'}
        </button>
        {!pdfPath && (
          <p className="mt-2 text-sm text-gray-500">
            Upload a PDF first to enable extraction
          </p>
        )}
      </div>

      {/* Extraction History */}
      {extractions.length > 0 && (
        <div className="mb-6">
          <h3 className="text-lg font-semibold mb-3">Extraction History</h3>
          <div className="space-y-2">
            {extractions.map((extraction) => (
              <div
                key={extraction.extractionId}
                className={`p-4 border rounded cursor-pointer hover:bg-gray-50 ${
                  selectedExtraction === extraction.extractionId
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200'
                }`}
                onClick={() => loadExtraction(extraction.extractionId)}
              >
                <div className="flex justify-between items-center">
                  <div>
                    <p className="font-medium">
                      {new Date(extraction.timestamp).toLocaleString()}
                    </p>
                    <p className="text-sm text-gray-600">
                      Status: {extraction.status}
                    </p>
                  </div>
                  {extraction.manifest && (
                    <div className="text-right">
                      <p className="text-sm font-medium">
                        {extraction.manifest.images?.length || 0} images
                      </p>
                      {extraction.manifest.stats?.averageConfidence && (
                        <p className="text-sm text-gray-600">
                          Avg confidence: {(extraction.manifest.stats.averageConfidence * 100).toFixed(0)}%
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Image Assets Grid */}
      {imageAssets.length > 0 && (
        <div>
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold">
              Extracted Images ({imageAssets.length})
            </h3>
            <div className="space-x-2">
              <button
                onClick={selectAll}
                className="px-3 py-1 text-sm bg-gray-200 hover:bg-gray-300 rounded"
              >
                Select All
              </button>
              <button
                onClick={deselectAll}
                className="px-3 py-1 text-sm bg-gray-200 hover:bg-gray-300 rounded"
              >
                Deselect All
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mb-6">
            {imageAssets.map((asset) => (
              <div
                key={asset.id}
                className={`border rounded p-2 cursor-pointer ${
                  selectedAssets.has(asset.id)
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-400'
                }`}
                onClick={() => toggleAsset(asset.id)}
              >
                <div className="aspect-square bg-gray-100 rounded mb-2 flex items-center justify-center overflow-hidden">
                  <img
                    src={`${BACKEND_URL}/static/project_${projectId}/extracted_images/extraction_${selectedExtraction}/${asset.relativePath}`}
                    alt={asset.filename}
                    className="max-w-full max-h-full object-contain"
                    onError={(e) => {
                      e.target.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="100" height="100"%3E%3Crect fill="%23ddd" width="100" height="100"/%3E%3Ctext x="50%25" y="50%25" text-anchor="middle" dy=".3em" fill="%23999"%3ENo Image%3C/text%3E%3C/svg%3E';
                    }}
                  />
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-medium truncate">{asset.filename}</p>
                  <div className="flex gap-1">
                    <span className={`text-xs px-2 py-0.5 rounded ${getConfidenceBadge(asset.confidence)}`}>
                      {(asset.confidence * 100).toFixed(0)}%
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded ${getTypeBadge(asset.detectedType)}`}>
                      {asset.detectedType}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500">Page {asset.pageNumber}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Import Section */}
          <div className="border-t pt-4">
            <h3 className="text-lg font-semibold mb-3">
              Import Selected ({selectedAssets.size} selected)
            </h3>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Notes (optional)
              </label>
              <textarea
                value={importNotes}
                onChange={(e) => setImportNotes(e.target.value)}
                placeholder="Add notes about this import..."
                className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                rows={3}
              />
            </div>
            <button
              onClick={importAssets}
              disabled={loading || selectedAssets.size === 0}
              className={`px-6 py-3 rounded font-semibold ${
                loading || selectedAssets.size === 0
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : 'bg-green-600 text-white hover:bg-green-700'
              }`}
            >
              {loading ? 'Importing...' : `Import ${selectedAssets.size} Images`}
            </button>
            <p className="mt-2 text-sm text-gray-600">
              Importing will confirm the CONFIRM_COMPONENT_IMAGES gate
            </p>
          </div>
        </div>
      )}

      {/* Empty State */}
      {!loading && extractions.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          <p className="text-lg mb-2">No extractions yet</p>
          <p className="text-sm">Run an extraction to get started</p>
        </div>
      )}
    </div>
  );
}

export default PdfImageExtraction;
