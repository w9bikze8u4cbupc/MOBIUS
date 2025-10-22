import React from "react";

const healthPalette = {
  operational: { label: "Operational", color: "#2e7d32" },
  degraded: { label: "Degraded", color: "#f9a825" },
  offline: { label: "Offline", color: "#c62828" },
  pending: { label: "Pending", color: "#546e7a" },
};

const qcStatusPalette = {
  pass: { label: "Pass", color: "#2e7d32" },
  warn: { label: "Warning", color: "#f9a825" },
  fail: { label: "Fail", color: "#c62828" },
};

function getHealthBadge(health) {
  const palette = healthPalette[health?.status] || healthPalette.pending;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "4px 10px",
        borderRadius: 999,
        fontSize: 14,
        background: `${palette.color}1a`,
        color: palette.color,
        fontWeight: 600,
      }}
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: palette.color,
        }}
      />
      {palette.label}
    </span>
  );
}

function deriveMetrics(report) {
  if (!report?.json) return null;
  const { measurement, normalized, config, adjustments, evaluation } = report.json;
  return {
    integratedBefore: measurement.integratedLufs,
    integratedAfter: normalized.integratedLufs,
    target: config.targetLufs,
    tolerance: config.tolerance,
    truePeakBefore: measurement.truePeakDb,
    truePeakAfter: normalized.truePeakDb,
    peakLimit: config.peakLimit,
    gain: adjustments.gainDb,
    limitedByPeak: adjustments.limitedByPeak,
    status: evaluation.status,
    messages: evaluation.messages,
  };
}

function formatNumber(value) {
  if (value === null || value === undefined) {
    return "—";
  }
  return Number(value).toFixed(2);
}

function OperatorControls({
  presets,
  selectedPreset,
  onPresetChange,
  profile,
}) {
  if (!presets || presets.length === 0) {
    return null;
  }

  const metrics = deriveMetrics(profile?.qc?.report);
  const qcPalette = metrics ? qcStatusPalette[metrics.status] || qcStatusPalette.warn : qcStatusPalette.warn;
  const correctiveActions = React.useMemo(() => {
    const baseline = profile?.qc?.correctiveActions || [];
    if (!metrics || metrics.status === 'pass') {
      return baseline;
    }
    const evalMessages = metrics.messages || [];
    const combined = [...baseline, ...evalMessages.map(msg => `Investigate: ${msg}`)];
    return Array.from(new Set(combined));
  }, [metrics, profile]);

  return (
    <section
      style={{
        marginBottom: 30,
        padding: 20,
        borderRadius: 12,
        background: "#f5f5f5",
        border: "1px solid #d7d7d7",
      }}
    >
      <header style={{ marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>Operator Controls</h2>
        <p style={{ margin: "6px 0 0", color: "#455a64" }}>
          {profile?.description || "Select a preset to review QC readiness and artifacts."}
        </p>
      </header>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "center" }}>
        <label style={{ display: "flex", flexDirection: "column", fontWeight: 600 }}>
          Preset
          <select
            value={selectedPreset}
            onChange={event => onPresetChange(event.target.value)}
            style={{
              marginTop: 6,
              padding: "8px 12px",
              minWidth: 220,
              borderRadius: 6,
              border: "1px solid #b0bec5",
              fontSize: 15,
            }}
          >
            {presets.map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <div>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Pipeline Health</div>
          {getHealthBadge(profile?.health)}
          <div style={{ fontSize: 13, color: "#546e7a", marginTop: 4 }}>
            {profile?.health?.message || 'Awaiting status update.'}
          </div>
          <div style={{ fontSize: 12, color: "#90a4ae", marginTop: 2 }}>
            Updated: {profile?.health?.lastUpdated || '—'}
          </div>
        </div>
        {metrics && (
          <div>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>QC Status</div>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "4px 10px",
                borderRadius: 999,
                fontSize: 14,
                background: `${qcPalette.color}1a`,
                color: qcPalette.color,
                fontWeight: 600,
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: qcPalette.color,
                }}
              />
              {qcPalette.label}
            </span>
          </div>
        )}
      </div>

      {metrics && (
        <div style={{ marginTop: 24 }}>
          <h3 style={{ marginBottom: 8 }}>LUFS Metrics</h3>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              background: "white",
              borderRadius: 8,
              overflow: "hidden",
            }}
          >
            <thead>
              <tr style={{ background: "#eceff1" }}>
                <th style={{ textAlign: "left", padding: 10 }}>Metric</th>
                <th style={{ textAlign: "right", padding: 10 }}>Before</th>
                <th style={{ textAlign: "right", padding: 10 }}>After</th>
                <th style={{ textAlign: "right", padding: 10 }}>Target / Limit</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ padding: 10 }}>Integrated LUFS</td>
                <td style={{ padding: 10, textAlign: 'right' }}>{formatNumber(metrics.integratedBefore)}</td>
                <td style={{ padding: 10, textAlign: 'right' }}>{formatNumber(metrics.integratedAfter)}</td>
                <td style={{ padding: 10, textAlign: 'right' }}>
                  {`${formatNumber(metrics.target)} ±${formatNumber(metrics.tolerance)}`}
                </td>
              </tr>
              <tr>
                <td style={{ padding: 10 }}>True Peak (dBTP)</td>
                <td style={{ padding: 10, textAlign: 'right' }}>{formatNumber(metrics.truePeakBefore)}</td>
                <td style={{ padding: 10, textAlign: 'right' }}>{formatNumber(metrics.truePeakAfter)}</td>
                <td style={{ padding: 10, textAlign: 'right' }}>{formatNumber(metrics.peakLimit)}</td>
              </tr>
              <tr>
                <td style={{ padding: 10 }}>Gain Applied (dB)</td>
                <td style={{ padding: 10, textAlign: 'right' }} colSpan={2}>
                  {formatNumber(metrics.gain)}
                </td>
                <td style={{ padding: 10, textAlign: 'right' }}>
                  {metrics.limitedByPeak ? 'Peak guard engaged' : 'No limiting'}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      <div style={{ marginTop: 24 }}>
        <h3 style={{ marginBottom: 8 }}>Artifacts</h3>
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          {(profile?.qc?.artifacts || []).map(artifact => (
            <li key={artifact.href} style={{ marginBottom: 4 }}>
              <a href={artifact.href} style={{ color: "#1976d2", textDecoration: "none" }}>
                {artifact.label}
              </a>
              <span style={{ marginLeft: 6, color: "#90a4ae", fontSize: 12 }}>({artifact.type})</span>
            </li>
          ))}
          {(!profile?.qc?.artifacts || profile.qc.artifacts.length === 0) && (
            <li style={{ color: "#90a4ae" }}>No artifacts registered yet.</li>
          )}
        </ul>
      </div>

      <div style={{ marginTop: 24 }}>
        <h3 style={{ marginBottom: 8 }}>Corrective Actions</h3>
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          {correctiveActions.length > 0 ? (
            correctiveActions.map(action => (
              <li key={action} style={{ marginBottom: 4 }}>
                {action}
              </li>
            ))
          ) : (
            <li style={{ color: "#90a4ae" }}>No follow-up required.</li>
          )}
        </ul>
      </div>
    </section>
  );
}

export default OperatorControls;
