import React, { useEffect, useState } from "react";
import axios from "axios";

export function GenesisHistoryPanel({ projectId }) {
  const [state, setState] = useState({
    loading: true,
    error: null,
    history: [],
  });

  useEffect(() => {
    if (!projectId) return;

    let cancelled = false;
    setState({ loading: true, error: null, history: [] });

    axios
      .get(`/api/projects/${projectId}/genesis-history?limit=5`)
      .then((res) => {
        if (cancelled) return;
        setState({
          loading: false,
          error: null,
          history: res.data.history || [],
        });
      })
      .catch((err) => {
        if (cancelled) return;
        setState({
          loading: false,
          error: err.message || "Failed to load GENESIS history.",
          history: [],
        });
      });

    return () => {
      cancelled = true;
    };
  }, [projectId]);

  if (!projectId) return null;

  if (state.loading) {
    return (
      <div className="genesis-history-panel">
        <h4>GENESIS History</h4>
        <p>Loading…</p>
      </div>
    );
  }

  if (state.error) {
    return (
      <div className="genesis-history-panel genesis-history-panel--error">
        <h4>GENESIS History</h4>
        <p>{state.error}</p>
      </div>
    );
  }

  const history = state.history;
  if (!history || history.length === 0) {
    return (
      <div className="genesis-history-panel">
        <h4>GENESIS History</h4>
        <p>No past evaluations recorded for this project.</p>
      </div>
    );
  }

  const current = history[0];
  const previous = history[1] || null;

  const clarityPct = (v) =>
    v == null ? "—" : `${Math.round((v || 0) * 100)}%`;

  const clarityDelta =
    previous && current
      ? (current.clarityScore || 0) - (previous.clarityScore || 0)
      : null;

  const distanceDelta =
    previous && current
      ? (current.distanceFromCentroid || 0) -
        (previous.distanceFromCentroid || 0)
      : null;

  const formatDelta = (v, decimals) => {
    if (v == null) return "—";
    const sign = v > 0 ? "+" : "";
    return `${sign}${v.toFixed(decimals)}`;
  };

  return (
    <div className="genesis-history-panel">
      <h4>GENESIS History</h4>

      <div className="genesis-history-panel__summary">
        <div>
          <strong>Latest grade:</strong> {current.grade || "—"}
        </div>
        {previous && (
          <div>
            <strong>Previous grade:</strong> {previous.grade || "—"}
          </div>
        )}
        <div>
          <strong>Latest clarity:</strong> {clarityPct(current.clarityScore)}
        </div>
        {previous && (
          <div>
            <strong>Clarity change:</strong>{" "}
            {formatDelta(clarityDelta, 2)}
          </div>
        )}
        {previous && (
          <div>
            <strong>Distance change:</strong>{" "}
            {formatDelta(distanceDelta, 3)}
          </div>
        )}
        <div>
          <strong>Last evaluated at:</strong>{" "}
          {current.createdAtUtc || "unknown"}
        </div>
      </div>

      <div className="genesis-history-panel__list">
        <h5>Recent Evaluations</h5>
        <ul>
          {history.map((h, idx) => (
            <li key={`${h.createdAtUtc}-${idx}`}>
              <div>
                <strong>{h.createdAtUtc}</strong>
              </div>
              <div>
                Grade: {h.grade || "—"} · Clarity:{" "}
                {clarityPct(h.clarityScore)} · Distance:{" "}
                {h.distanceFromCentroid != null
                  ? h.distanceFromCentroid.toFixed(3)
                  : "—"}{" "}
                · Compatible: {h.compatible ? "yes" : "no"}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
