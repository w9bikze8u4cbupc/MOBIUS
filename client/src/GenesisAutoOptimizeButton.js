import React, { useState } from "react";
import axios from "axios";

export function GenesisAutoOptimizeButton({ projectId }) {
  const [running, setRunning] = useState(false);
  const [error, setError] = useState(null);
  const [lastResult, setLastResult] = useState(null);

  if (!projectId) return null;

  const handleClick = async () => {
    setRunning(true);
    setError(null);
    setLastResult(null);

    try {
      const res = await axios.post(
        `/api/projects/${projectId}/genesis-auto-optimize`
      );
      setLastResult(res.data || { ok: true });
    } catch (err) {
      setError(
        err.response?.data?.error || err.message || "Auto-optimize failed."
      );
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="genesis-auto-optimize">
      <button onClick={handleClick} disabled={running}>
        {running ? "Auto-optimizing…" : "Auto-optimize to Goals"}
      </button>
      {error && <div className="genesis-auto-optimize__error">{error}</div>}
      {lastResult && lastResult.ok && !error && (
        <div className="genesis-auto-optimize__status">
          Auto-optimization sequence completed. Check history & feedback.
        </div>
      )}
    </div>
  );
}
