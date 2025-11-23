import React, { useEffect, useState } from "react";
import axios from "axios";

export function GenesisCampaignPanel() {
  const [state, setState] = useState({
    loading: true,
    error: null,
    plan: [],
  });
  const [batchRunning, setBatchRunning] = useState(false);
  const [batchResult, setBatchResult] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setState({ loading: true, error: null, plan: [] });

    axios
      .get("/api/genesis/campaign")
      .then((res) => {
        if (cancelled) return;
        setState({
          loading: false,
          error: null,
          plan: res.data.plan || [],
        });
      })
      .catch((err) => {
        if (cancelled) return;
        setState({
          loading: false,
          error: err.message || "Failed to load campaign plan.",
          plan: [],
        });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const runBatch = async () => {
    setBatchRunning(true);
    setBatchResult(null);
    try {
      const res = await axios.post("/api/genesis/campaign/auto-optimize", {
        limit: 3,
      });
      setBatchResult(res.data);
    } catch (err) {
      setBatchResult({
        error: err.response?.data?.error || err.message || "Batch failed.",
      });
    } finally {
      setBatchRunning(false);
    }
  };

  const runSingle = async (projectId) => {
    await axios.post(`/api/projects/${projectId}/genesis-auto-optimize`);
    // We keep it simple: no plan refresh here; operator can manually refresh page.
    alert(`Auto-optimize triggered for project ${projectId}.`);
  };

  if (state.loading) {
    return (
      <div className="genesis-campaign-panel">
        <h3>GENESIS Campaign</h3>
        <p>Loading plan…</p>
      </div>
    );
  }

  if (state.error) {
    return (
      <div className="genesis-campaign-panel genesis-campaign-panel--error">
        <h3>GENESIS Campaign</h3>
        <p>{state.error}</p>
      </div>
    );
  }

  const plan = state.plan;

  return (
    <div className="genesis-campaign-panel">
      <h3>GENESIS Campaign</h3>

      <button onClick={runBatch} disabled={batchRunning}>
        {batchRunning ? "Running batch auto-optimize…" : "Auto-optimize top 3"}
      </button>

      {batchResult && (
        <div className="genesis-campaign-panel__batch-result">
          {batchResult.error && <p>Error: {batchResult.error}</p>}
          {batchResult.results && (
            <ul>
              {batchResult.results.map((r) => (
                <li key={r.projectId}>
                  {r.projectId}: {r.ok ? "OK" : `Error: ${r.error}`}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {plan.length === 0 ? (
        <p>No evaluated projects found.</p>
      ) : (
        <table className="genesis-campaign-panel__table">
          <thead>
            <tr>
              <th>Project</th>
              <th>Priority</th>
              <th>Goals?</th>
              <th>Compliant?</th>
              <th>Grade</th>
              <th>Clarity</th>
              <th>Distance</th>
              <th>Last Eval</th>
              <th>Auto-optimize</th>
            </tr>
          </thead>
          <tbody>
            {plan.map((p) => (
              <tr key={p.projectId}>
                <td>{p.projectId}</td>
                <td>{p.priorityScore.toFixed(3)}</td>
                <td>{p.goals ? "Yes" : "No"}</td>
                <td>
                  {p.compliant === null
                    ? "—"
                    : p.compliant
                    ? "Yes"
                    : "No"}
                </td>
                <td>{p.latest.grade || "—"}</td>
                <td>
                  {p.latest.clarityScore != null
                    ? `${Math.round(p.latest.clarityScore * 100)}%`
                    : "—"}
                </td>
                <td>
                  {p.latest.distanceFromCentroid != null
                    ? p.latest.distanceFromCentroid.toFixed(3)
                    : "—"}
                </td>
                <td>{p.latest.createdAtUtc || "—"}</td>
                <td>
                  <button onClick={() => runSingle(p.projectId)}>
                    Optimize
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
