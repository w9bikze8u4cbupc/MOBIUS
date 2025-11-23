// client/src/GenesisDebugBundleButton.js

import React, { useState } from "react";

export function GenesisDebugBundleButton({ projectId }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  if (!projectId) return null;

  const handleClick = async () => {
    setBusy(true);
    setError(null);
    try {
      // Just open the download endpoint in a new tab
      // (no need to fetch via XHR, we want a file)
      window.open(
        `/api/projects/${projectId}/genesis-debug-bundle/download`,
        "_blank"
      );
    } catch (err) {
      setError(err.message || "Failed to download debug bundle.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="genesis-debug-bundle">
      <button onClick={handleClick} disabled={busy}>
        {busy ? "Preparing debug bundle…" : "Download GENESIS Debug Bundle"}
      </button>
      {error && <div className="genesis-debug-bundle__error">{error}</div>}
    </div>
  );
}
