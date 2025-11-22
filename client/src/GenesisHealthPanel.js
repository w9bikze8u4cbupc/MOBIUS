import React, { useEffect, useState } from "react";
import axios from "axios";

const INITIAL = { loading: true, error: null, data: null };

export function GenesisHealthPanel() {
  const [state, setState] = useState(INITIAL);

  useEffect(() => {
    let cancelled = false;
    setState(INITIAL);

    axios
      .get("/api/system/genesis-health")
      .then((res) => {
        if (cancelled) return;
        setState({ loading: false, error: null, data: res.data });
      })
      .catch((err) => {
        if (cancelled) return;
        setState({
          loading: false,
          error: err.message || "Failed to load GENESIS health.",
          data: null,
        });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (state.loading) {
    return (
      <div className="genesis-health-panel">
        <h3>GENESIS Health</h3>
        <p>Loading…</p>
      </div>
    );
  }

  if (state.error) {
    return (
      <div className="genesis-health-panel genesis-health-panel--error">
        <h3>GENESIS Health</h3>
        <p>{state.error}</p>
      </div>
    );
  }

  const data = state.data || {};
  const grades = data.grades || {};

  return (
    <div className="genesis-health-panel">
      <h3>GENESIS Health</h3>
      <div>
        <strong>Total evaluations:</strong> {data.totalEvaluations}
      </div>
      <div>
        <strong>Last evaluation:</strong> {data.lastEvaluationAtUtc || "none"}
      </div>
      <div>
        <strong>Incompatible evaluations:</strong> {data.incompatibleCount || 0}
      </div>
      <div className="genesis-health-panel__grades">
        <h4>Grade Distribution</h4>
        {Object.keys(grades).length === 0 ? (
          <p>No evaluations yet.</p>
        ) : (
          <ul>
            {Object.entries(grades).map(([grade, count]) => (
              <li key={grade}>
                {grade}: {count}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
