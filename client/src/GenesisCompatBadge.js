import React from "react";

export function GenesisCompatBadge({ compat }) {
  if (!compat) return null;

  const { compatible, reason, mobiusAppVersion, g6Version, g5Version, g4Version, exportVersion } =
    compat;

  const statusText = compatible ? "Compatible" : "Compatibility Warning";
  const statusClass = compatible ? "ok" : "warn";

  return (
    <div className={`genesis-compat-badge genesis-compat-badge--${statusClass}`}>
      <div className="genesis-compat-badge__status">{statusText}</div>
      <div className="genesis-compat-badge__versions">
        <div>
          <strong>MOBIUS app</strong>: {mobiusAppVersion || "unknown"}
        </div>
        <div>
          <strong>G6</strong>: {g6Version || "unknown"}
        </div>
        <div>
          <strong>G5</strong>: {g5Version || "unknown"}
        </div>
        <div>
          <strong>G4</strong>: {g4Version || "unknown"}
        </div>
        <div>
          <strong>Export bundle</strong>: {exportVersion || "unknown"}
        </div>
      </div>
      <div className="genesis-compat-badge__reason">{reason}</div>
    </div>
  );
}
