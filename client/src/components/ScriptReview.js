// client/src/components/ScriptReview.js
// Script Review UI - Review and confirm script candidates
// PHASE F: Script authority workflow

import React, { useState, useEffect } from 'react';
import ConfidenceBadge from './ConfidenceBadge';

/**
 * ScriptReview Component
 * Displays script candidates, violations, and allows confirmation
 */
function ScriptReview({ projectId, onComplete }) {
  const [candidates, setCandidates] = useState([]);
  const [authoritative, setAuthoritative] = useState(null);
  const [selectedCandidate, setSelectedCandidate] = useState(null);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [confirming, setConfirming] = useState(false);

  // Fetch candidates and authoritative script
  useEffect(() => {
    fetchScripts();
  }, [projectId]);

  const fetchScripts = async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch candidates
      const candidatesRes = await fetch(`/api/projects/${projectId}/script/candidates`);
      const candidatesData = await candidatesRes.json();

      if (!candidatesData.success) {
        throw new Error('Failed to fetch script candidates');
      }

      setCandidates(candidatesData.candidates || []);

      // Fetch authoritative (may not exist)
      try {
        const authRes = await fetch(`/api/projects/${projectId}/script/authoritative`);
        if (authRes.ok) {
          const authData = await authRes.json();
          setAuthoritative(authData.script);
        }
      } catch (err) {
        // No authoritative script yet - this is OK
        setAuthoritative(null);
      }

      setLoading(false);
    } catch (err) {
      console.error('Error fetching scripts:', err);
      setError(err.message);
      setLoading(false);
    }
  };

  const handleConfirm = async (candidateId) => {
    try {
      setConfirming(true);
      setError(null);

      const response = await fetch(`/api/projects/${projectId}/script/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ candidateId, notes })
      });

      const data = await response.json();

      if (!response.ok) {
        if (data.code === 'SCRIPT_HAS_VIOLATIONS') {
          throw new Error(`Cannot confirm: ${data.violations.length} blocking violations found`);
        }
        throw new Error(data.error || 'Failed to confirm script');
      }

      // Success - refresh and notify parent
      await fetchScripts();
      setNotes('');
      setSelectedCandidate(null);
      
      if (onComplete) {
        onComplete();
      }

      alert('✅ Script confirmed as authoritative!');
    } catch (err) {
      console.error('Error confirming script:', err);
      setError(err.message);
    } finally {
      setConfirming(false);
    }
  };

  const getStatusBadge = (status) => {
    const styles = {
      candidate: 'bg-yellow-100 text-yellow-800',
      authoritative: 'bg-green-100 text-green-800',
      rejected: 'bg-red-100 text-red-800'
    };

    return (
      <span className={`px-2 py-1 rounded text-sm font-medium ${styles[status] || 'bg-gray-100 text-gray-800'}`}>
        {status.toUpperCase()}
      </span>
    );
  };

  const hasBlockingViolations = (candidate) => {
    return candidate.violations?.some(v => v.severity === 'error');
  };

  if (loading) {
    return (
      <div className="p-6 text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
        <p className="mt-4 text-gray-600">Loading scripts...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded p-4">
          <h3 className="text-red-800 font-semibold">Error</h3>
          <p className="text-red-600">{error}</p>
          <button
            onClick={fetchScripts}
            className="mt-2 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const canProceed = authoritative !== null;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h2 className="text-2xl font-bold mb-4">Script Review</h2>

      {/* Status Banner */}
      {canProceed ? (
        <div className="bg-green-50 border border-green-200 rounded p-4 mb-6">
          <h3 className="text-green-800 font-semibold flex items-center">
            <span className="mr-2">✅</span>
            Ready to Proceed
          </h3>
          <p className="text-green-700 mt-1">
            Authoritative script confirmed. You can proceed to TTS generation.
          </p>
        </div>
      ) : (
        <div className="bg-yellow-50 border border-yellow-200 rounded p-4 mb-6">
          <h3 className="text-yellow-800 font-semibold flex items-center">
            <span className="mr-2">⚠️</span>
            Action Required
          </h3>
          <p className="text-yellow-700 mt-1">
            Review script candidates and confirm one as authoritative before proceeding.
          </p>
        </div>
      )}

      {/* Authoritative Script */}
      {authoritative && (
        <div className="mb-6 bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold">Authoritative Script</h3>
            {getStatusBadge('authoritative')}
          </div>
          <div className="grid grid-cols-2 gap-4 text-sm text-gray-600 mb-4">
            <div>
              <span className="font-medium">Language:</span> {authoritative.language}
            </div>
            <div>
              <span className="font-medium">Word Count:</span> {authoritative.metadata?.wordCount || 'N/A'}
            </div>
            <div>
              <span className="font-medium">Segments:</span> {authoritative.metadata?.segmentCount || 'N/A'}
            </div>
            <div>
              <span className="font-medium">Created:</span> {new Date(authoritative.createdAt).toLocaleString()}
            </div>
          </div>
          <details className="mt-4">
            <summary className="cursor-pointer text-blue-600 hover:text-blue-800 font-medium">
              View Script
            </summary>
            <pre className="mt-2 p-4 bg-gray-50 rounded text-sm overflow-auto max-h-96 whitespace-pre-wrap">
              {authoritative.rawScript}
            </pre>
          </details>
        </div>
      )}

      {/* Candidates List */}
      <div className="mb-6">
        <h3 className="text-lg font-semibold mb-4">
          Script Candidates ({candidates.length})
        </h3>

        {candidates.length === 0 ? (
          <div className="bg-gray-50 border border-gray-200 rounded p-6 text-center text-gray-600">
            <p>No script candidates found.</p>
            <p className="text-sm mt-2">Generate a script to begin the review process.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {candidates.map((candidate) => {
              const isSelected = selectedCandidate === candidate.id;
              const blocking = hasBlockingViolations(candidate);
              const isAuthoritative = candidate.status === 'authoritative';

              return (
                <div
                  key={candidate.id}
                  className={`border rounded-lg p-4 ${
                    isAuthoritative ? 'border-green-300 bg-green-50' : 'border-gray-200 bg-white'
                  } ${isSelected ? 'ring-2 ring-blue-500' : ''}`}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        {getStatusBadge(candidate.status)}
                        <span className="text-sm text-gray-500">
                          {new Date(candidate.createdAt).toLocaleString()}
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-4 text-sm text-gray-600">
                        <div>
                          <span className="font-medium">Language:</span> {candidate.language}
                        </div>
                        <div>
                          <span className="font-medium">Words:</span> {candidate.metadata?.wordCount || 'N/A'}
                        </div>
                        <div>
                          <span className="font-medium">Model:</span> {candidate.model}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Violations */}
                  {candidate.violations && candidate.violations.length > 0 && (
                    <div className="mb-3">
                      <h4 className="text-sm font-semibold text-red-700 mb-2">
                        ❌ Violations ({candidate.violations.length})
                      </h4>
                      <ul className="space-y-1">
                        {candidate.violations.map((v, idx) => (
                          <li key={idx} className="text-sm text-red-600 bg-red-50 p-2 rounded">
                            <span className="font-medium">{v.type}:</span> {v.message}
                            {v.suggestion && (
                              <div className="text-xs text-red-500 mt-1">💡 {v.suggestion}</div>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Warnings */}
                  {candidate.warnings && candidate.warnings.length > 0 && (
                    <div className="mb-3">
                      <h4 className="text-sm font-semibold text-yellow-700 mb-2">
                        ⚠️ Warnings ({candidate.warnings.length})
                      </h4>
                      <ul className="space-y-1">
                        {candidate.warnings.map((w, idx) => (
                          <li key={idx} className="text-sm text-yellow-600 bg-yellow-50 p-2 rounded">
                            <span className="font-medium">{w.type}:</span> {w.message}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Actions */}
                  {!isAuthoritative && (
                    <div className="flex items-center gap-3 mt-4">
                      <button
                        onClick={() => setSelectedCandidate(isSelected ? null : candidate.id)}
                        className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm"
                      >
                        {isSelected ? 'Collapse' : 'Review'}
                      </button>
                      {isSelected && (
                        <>
                          <input
                            type="text"
                            placeholder="Optional notes..."
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            className="flex-1 px-3 py-2 border border-gray-300 rounded text-sm"
                          />
                          <button
                            onClick={() => handleConfirm(candidate.id)}
                            disabled={blocking || confirming}
                            className={`px-4 py-2 rounded text-sm font-medium ${
                              blocking
                                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                : 'bg-green-600 text-white hover:bg-green-700'
                            }`}
                            title={blocking ? 'Resolve violations first' : 'Confirm as authoritative'}
                          >
                            {confirming ? 'Confirming...' : 'Confirm'}
                          </button>
                        </>
                      )}
                    </div>
                  )}

                  {/* Script Preview */}
                  {isSelected && (
                    <details className="mt-4">
                      <summary className="cursor-pointer text-blue-600 hover:text-blue-800 font-medium text-sm">
                        View Full Script
                      </summary>
                      <pre className="mt-2 p-4 bg-gray-50 rounded text-xs overflow-auto max-h-96 whitespace-pre-wrap">
                        {candidate.rawScript}
                      </pre>
                    </details>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="flex justify-between items-center pt-6 border-t">
        <button
          onClick={() => window.history.back()}
          className="px-4 py-2 border border-gray-300 rounded hover:bg-gray-50"
        >
          ← Back
        </button>
        <button
          onClick={onComplete}
          disabled={!canProceed}
          className={`px-6 py-2 rounded font-medium ${
            canProceed
              ? 'bg-blue-600 text-white hover:bg-blue-700'
              : 'bg-gray-300 text-gray-500 cursor-not-allowed'
          }`}
          title={canProceed ? 'Proceed to next step' : 'Confirm a script first'}
        >
          Continue to TTS →
        </button>
      </div>
    </div>
  );
}

export default ScriptReview;
