import React, { useEffect, useState } from "react";
import axios from "axios";
import { GenesisCompatBadge } from "./GenesisCompatBadge";

const INITIAL_STATE = {
  loading: true,
  error: null,
  data: null,
};

export function GenesisFeedbackPanel({ projectId }) {
  const [state, setState] = useState(INITIAL_STATE);

  useEffect(() => {
    if (!projectId) return;

    let cancelled = false;
    setState(INITIAL_STATE);

    axios
      .get(`/api/projects/${projectId}/genesis-feedback`)
      .then((response) => {
        if (cancelled) return;
        setState({
          loading: false,
          error: null,
          data: response.data,
        });
      })
      .catch((err) => {
        if (cancelled) return;
        if (err.response && err.response.status === 404) {
          setState({
            loading: false,
            error: null,
            data: null,
          });
        } else {
          setState({
            loading: false,
            error:
              (err.response && err.response.data && err.response.data.error) ||
              err.message ||
              "Failed to load GENESIS feedback.",
            data: null,
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [projectId]);

  if (!projectId) {
    return null;
  }

  if (state.loading) {
    return (
      <div className="genesis-feedback-panel">
        <h3>GENESIS Feedback</h3>
        <p>Loading feedback…</p>
      </div>
    );
  }

  if (state.error) {
    return (
      <div className="genesis-feedback-panel genesis-feedback-panel--error">
        <h3>GENESIS Feedback</h3>
        <p>{state.error}</p>
      </div>
    );
  }

  if (!state.data) {
    return (
      <div className="genesis-feedback-panel genesis-feedback-panel--empty">
        <h3>GENESIS Feedback</h3>
        <p>No GENESIS feedback available yet for this tutorial.</p>
      </div>
    );
  }

  const bundle = state.data;
  const compat = bundle._compat || null;
  const summary = bundle.summary || {};
  const hints = bundle.mobiusHints || {};
  const recs = bundle.recommendations || [];

  return (
    <div className="genesis-feedback-panel">
      <h3>GENESIS Feedback</h3>

      <GenesisCompatBadge compat={compat} />

      <div className="genesis-feedback-summary">
        <div>
          <strong>Grade:</strong> {summary.grade}
        </div>
        <div>
          <strong>Clarity score:</strong>{" "}
          {summary.clarityScore != null
            ? `${Math.round(summary.clarityScore * 100)}%`
            : "—"}
        </div>
        <div>
          <strong>Distance from centroid:</strong>{" "}
          {summary.distanceFromCentroid != null
            ? summary.distanceFromCentroid.toFixed(3)
            : "—"}
        </div>
      </div>

      <div className="genesis-feedback-hints">
        <h4>Suggested Parameter Ranges</h4>
        <ul>
          <li>
            <strong>Target WPM:</strong>{" "}
            {hints.targetWpmRange
              ? `${hints.targetWpmRange.min}–${hints.targetWpmRange.max}`
              : "—"}
          </li>
          <li>
            <strong>Target caption CPS:</strong>{" "}
            {hints.targetCaptionCpsRange
              ? `${hints.targetCaptionCpsRange.min}–${hints.targetCaptionCpsRange.max}`
              : "—"}
          </li>
          <li>
            <strong>Max motion load:</strong>{" "}
            {hints.maxMotionLoad != null ? hints.maxMotionLoad.toFixed(2) : "—"}
          </li>
          <li>
            <strong>Stronger audio ducking?</strong>{" "}
            {hints.suggestLowerDuckingThreshold ? "Yes" : "No"}
          </li>
          <li>
            <strong>Stronger pause cues?</strong>{" "}
            {hints.suggestStrongerPauseCues ? "Yes" : "No"}
          </li>
        </ul>
      </div>

      {recs.length > 0 && (
        <div className="genesis-feedback-recs">
          <h4>Recommendations</h4>
          <ul>
            {recs.map((rec) => (
              <li key={`${rec.code}-${rec.priority}`}>
                <strong>[{rec.severity.toUpperCase()}]</strong>{" "}
                <strong>{rec.code}</strong> – {rec.message}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
