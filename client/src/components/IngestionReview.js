// client/src/components/IngestionReview.js
// Main UI panel for reviewing ingestion reports and confirming truth gates

import React, { useState, useEffect } from 'react';
import ConfidenceBadge from './ConfidenceBadge';

const GateStatus = {
  PENDING: 'pending',
  CONFIRMED: 'confirmed',
  CORRECTED: 'corrected',
  REJECTED: 'rejected'
};

const GateDefinitions = {
  confirm_metadata: {
    title: 'Confirm Game Metadata',
    description: 'Verify game title, designer, publisher, player count, and other basic information'
  },
  confirm_components: {
    title: 'Confirm Game Components',
    description: 'Verify the list of physical components extracted from the rulebook'
  },
  confirm_setup_logic: {
    title: 'Confirm Setup Instructions',
    description: 'Verify the game setup sequence and initial board state'
  },
  confirm_turn_structure: {
    title: 'Confirm Turn Structure',
    description: 'Verify the turn sequence and player actions'
  },
  confirm_ocr_hazards: {
    title: 'Confirm OCR Extraction Quality',
    description: 'Review text extracted via OCR for potential errors or misreadings'
  }
};

const IngestionReview = ({ projectId, onComplete }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [report, setReport] = useState(null);
  const [gateStates, setGateStates] = useState({});
  const [requiredGateIds, setRequiredGateIds] = useState([]);
  const [satisfied, setSatisfied] = useState(false);
  const [blockedReasons, setBlockedReasons] = useState([]);
  const [editingGate, setEditingGate] = useState(null);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchData();
  }, [projectId]);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch ingestion report
      const reportRes = await fetch(`/api/projects/${projectId}/ingestion/report`);
      if (!reportRes.ok) {
        if (reportRes.status === 404) {
          setError('No ingestion report found for this project');
          return;
        }
        throw new Error('Failed to fetch ingestion report');
      }
      const reportData = await reportRes.json();
      setReport(reportData.report);

      // Fetch gate states
      const gatesRes = await fetch(`/api/projects/${projectId}/ingestion/gates`);
      if (!gatesRes.ok) {
        throw new Error('Failed to fetch gate states');
      }
      const gatesData = await gatesRes.json();
      setGateStates(gatesData.gateStates || {});
      setRequiredGateIds(gatesData.requiredGateIds || []);
      setSatisfied(gatesData.satisfied);
      setBlockedReasons(gatesData.blockedReasons || []);
    } catch (err) {
      console.error('Error fetching ingestion data:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async (gateId, status) => {
    try {
      setSubmitting(true);
      setError(null);

      const payload = {
        gateId,
        status,
        notes: notes.trim() || null
      };

      const res = await fetch(`/api/projects/${projectId}/ingestion/gates/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to confirm gate');
      }

      const data = await res.json();
      setGateStates(data.gateStates);
      setSatisfied(data.satisfied);
      setBlockedReasons(data.blockedReasons);
      setEditingGate(null);
      setNotes('');

      // If all gates satisfied, notify parent
      if (data.satisfied && onComplete) {
        onComplete();
      }
    } catch (err) {
      console.error('Error confirming gate:', err);
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case GateStatus.CONFIRMED:
        return 'text-green-600 bg-green-50 border-green-200';
      case GateStatus.CORRECTED:
        return 'text-blue-600 bg-blue-50 border-blue-200';
      case GateStatus.REJECTED:
        return 'text-red-600 bg-red-50 border-red-200';
      default:
        return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case GateStatus.CONFIRMED:
        return '✓';
      case GateStatus.CORRECTED:
        return '✎';
      case GateStatus.REJECTED:
        return '✗';
      default:
        return '○';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-gray-600">Loading ingestion review...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded">
        <div className="text-red-800 font-semibold">Error</div>
        <div className="text-red-600">{error}</div>
        <button
          onClick={fetchData}
          className="mt-2 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="p-4 bg-yellow-50 border border-yellow-200 rounded">
        <div className="text-yellow-800">No ingestion report available for this project.</div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-4">Ingestion Review</h1>

      {/* PHASE 3: Clear BLOCKING vs READY Status Banner */}
      <div className={`mb-6 p-4 border-2 rounded-lg ${
        satisfied 
          ? 'bg-green-50 border-green-500' 
          : 'bg-red-50 border-red-500'
      }`}>
        <div className="flex items-center gap-3">
          <div className="text-3xl">
            {satisfied ? '✅' : '🚫'}
          </div>
          <div className="flex-1">
            <div className={`text-xl font-bold ${
              satisfied ? 'text-green-800' : 'text-red-800'
            }`}>
              {satisfied ? 'READY TO PROCEED' : 'WORKFLOW BLOCKED'}
            </div>
            <div className={`text-sm ${
              satisfied ? 'text-green-700' : 'text-red-700'
            }`}>
              {satisfied 
                ? 'All required confirmations complete. You may proceed to script generation.'
                : `${blockedReasons.length} confirmation(s) required before proceeding to downstream stages.`
              }
            </div>
          </div>
        </div>
      </div>

      {/* Summary */}
      <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded">
        <h2 className="text-lg font-semibold mb-2">Summary</h2>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="font-medium">Project:</span> {report.projectName}
          </div>
          <div>
            <span className="font-medium">Extracted:</span>{' '}
            {new Date(report.createdAt).toLocaleString()}
          </div>
          <div>
            <span className="font-medium">Overall Confidence:</span>{' '}
            {report.overallConfidence && (
              <ConfidenceBadge confidence={report.overallConfidence} />
            )}
          </div>
          <div>
            <span className="font-medium">Required Gates:</span>{' '}
            <span className="font-semibold">
              {requiredGateIds.length} total
            </span>
          </div>
        </div>

        {report.warnings && report.warnings.length > 0 && (
          <div className="mt-3 p-2 bg-yellow-50 border border-yellow-200 rounded">
            <div className="font-medium text-sm text-yellow-800">Warnings:</div>
            <ul className="list-disc list-inside text-sm text-yellow-700">
              {report.warnings.map((w, idx) => (
                <li key={idx}>{w.message}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Required Confirmations */}
      <div className="mb-6">
        <h2 className="text-lg font-semibold mb-3">Required Confirmations</h2>
        <div className="space-y-3">
          {requiredGateIds.map((gateId) => {
            const gate = gateStates[gateId] || { status: GateStatus.PENDING };
            const def = GateDefinitions[gateId] || { title: gateId, description: '' };
            const isEditing = editingGate === gateId;

            return (
              <div
                key={gateId}
                className={`p-4 border rounded ${getStatusColor(gate.status)}`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-2xl">{getStatusIcon(gate.status)}</span>
                      <div>
                        <div className="font-semibold">{def.title}</div>
                        <div className="text-sm opacity-75">{def.description}</div>
                      </div>
                    </div>

                    {gate.notes && (
                      <div className="mt-2 p-2 bg-white bg-opacity-50 rounded text-sm">
                        <span className="font-medium">Notes:</span> {gate.notes}
                      </div>
                    )}

                    {gate.confirmedAt && (
                      <div className="mt-1 text-xs opacity-75">
                        {gate.status} at {new Date(gate.confirmedAt).toLocaleString()}
                      </div>
                    )}
                  </div>

                  <div className="flex gap-2">
                    {gate.status === GateStatus.PENDING && !isEditing && (
                      <button
                        onClick={() => setEditingGate(gateId)}
                        className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm"
                        disabled={submitting}
                      >
                        Review
                      </button>
                    )}
                  </div>
                </div>

                {isEditing && (
                  <div className="mt-4 p-3 bg-white rounded border">
                    <div className="mb-3">
                      <label className="block text-sm font-medium mb-1">
                        Notes (optional)
                      </label>
                      <textarea
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        className="w-full px-3 py-2 border rounded text-sm"
                        rows="3"
                        placeholder="Add any notes or corrections..."
                      />
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={() => handleConfirm(gateId, GateStatus.CONFIRMED)}
                        className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 text-sm"
                        disabled={submitting}
                      >
                        ✓ Confirm
                      </button>
                      <button
                        onClick={() => handleConfirm(gateId, GateStatus.REJECTED)}
                        className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 text-sm"
                        disabled={submitting}
                      >
                        ✗ Reject
                      </button>
                      <button
                        onClick={() => {
                          setEditingGate(null);
                          setNotes('');
                        }}
                        className="px-4 py-2 bg-gray-300 text-gray-700 rounded hover:bg-gray-400 text-sm"
                        disabled={submitting}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Extracted Fields Preview */}
      {report.fields && Object.keys(report.fields).length > 0 && (
        <div className="mb-6">
          <h2 className="text-lg font-semibold mb-3">Extracted Data</h2>
          <div className="space-y-2">
            {Object.entries(report.fields).map(([fieldName, field]) => (
              <div key={fieldName} className="p-3 bg-gray-50 border rounded">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="font-medium text-sm">{fieldName}</div>
                    <div className="text-sm mt-1">
                      {typeof field.value === 'object'
                        ? JSON.stringify(field.value)
                        : String(field.value)}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      Source: {field.source}
                    </div>
                  </div>
                  <div>
                    {field.confidence && <ConfidenceBadge confidence={field.confidence} />}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Continue Button */}
      <div className="flex justify-end">
        <button
          onClick={onComplete}
          disabled={!satisfied}
          className={`px-6 py-3 rounded font-semibold ${
            satisfied
              ? 'bg-green-600 text-white hover:bg-green-700'
              : 'bg-gray-300 text-gray-500 cursor-not-allowed'
          }`}
        >
          {satisfied ? 'Continue to Next Stage →' : 'Complete All Confirmations First'}
        </button>
      </div>
    </div>
  );
};

export default IngestionReview;
