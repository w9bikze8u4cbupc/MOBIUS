import React, { useEffect, useState } from "react";
import axios from "axios";

export function GenesisArtifactsPanel({ projectId }) {
  const [state, setState] = useState({
    loading: true,
    error: null,
    artifacts: {},
  });

  useEffect(() => {
    if (!projectId) return;

    let cancelled = false;
    setState({ loading: true, error: null, artifacts: {} });

    axios
      .get(`/api/projects/${projectId}/genesis-artifacts`)
      .then((res) => {
        if (cancelled) return;
        setState({ loading: false, error: null, artifacts: res.data });
      })
      .catch((err) => {
        if (cancelled) return;
        setState({
          loading: false,
          error: err.message || "Failed to load GENESIS artifacts.",
          artifacts: {},
        });
      });

    return () => {
      cancelled = true;
    };
  }, [projectId]);

  if (!projectId) return null;

  if (state.loading) {
    return (
      <div className="genesis-artifacts-panel">
        <h3>GENESIS Artifacts</h3>
        <p>Loading…</p>
      </div>
    );
  }

  if (state.error) {
    return (
      <div className="genesis-artifacts-panel genesis-artifacts-panel--error">
        <h3>GENESIS Artifacts</h3>
        <p>{state.error}</p>
      </div>
    );
  }

  const artifacts = state.artifacts || {};
  const entries = Object.entries(artifacts);

  if (entries.length === 0) {
    return (
      <div className="genesis-artifacts-panel">
        <h3>GENESIS Artifacts</h3>
        <p>No artifacts found for this project.</p>
      </div>
    );
  }

  return (
    <div className="genesis-artifacts-panel">
      <h3>GENESIS Artifacts</h3>
      <ul>
        {entries.map(([key, info]) => (
          <li key={key}>
            <strong>{key}</strong>: {" "}
            <a href={info.path} target="_blank" rel="noreferrer">
              {info.filename}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
