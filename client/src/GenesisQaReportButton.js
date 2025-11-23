// client/src/GenesisQaReportButton.js

import React, { useState } from "react";
import axios from "axios";

export function GenesisQaReportButton({ projectId }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  if (!projectId) return null;

  const handleClick = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await axios.post(
        `/api/projects/${projectId}/genesis-report`
      );
      if (res.data && res.data.ok && res.data.path) {
        window.open(res.data.path, "_blank");
      } else {
        setError("Unexpected response from report API.");
      }
    } catch (err) {
      setError(
        err.response?.data?.error || err.message || "Failed to generate report."
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="genesis-qa-report">
      <button onClick={handleClick} disabled={busy}>
        {busy ? "Generating QA report…" : "Export GENESIS QA Report"}
      </button>
      {error && <div className="genesis-qa-report__error">{error}</div>}
    </div>
  );
}
