import React, { useEffect, useState } from "react";
import axios from "axios";

function pct(value) {
  if (value == null) return "—";
  return `${Math.round(value * 100)}%`;
}

export function GenesisInspector({ projectId }) {
  const [state, setState] = useState({
    loading: true,
    error: null,
    data: null,
  });
  const [tab, setTab] = useState("overview");

  useEffect(() => {
    if (!projectId) return;

    let cancelled = false;
    setState({ loading: true, error: null, data: null });

    axios
      .get(`/api/projects/${projectId}/genesis-inspector`)
      .then((res) => {
        if (cancelled) return;
        setState({ loading: false, error: null, data: res.data });
      })
      .catch((err) => {
        if (cancelled) return;
        setState({
          loading: false,
          error:
            err.response?.data?.error ||
            err.message ||
            "Failed to load GENESIS inspector data.",
          data: null,
        });
      });

    return () => {
      cancelled = true;
    };
  }, [projectId]);

  if (!projectId) return null;

  if (state.loading) {
    return (
      <div className="genesis-inspector">
        <h3>GENESIS Inspector</h3>
        <p>Loading…</p>
      </div>
    );
  }

  if (state.error) {
    return (
      <div className="genesis-inspector genesis-inspector--error">
        <h3>GENESIS Inspector</h3>
        <p>{state.error}</p>
      </div>
    );
  }

  const { data } = state;
  const { g3, g4, g5, g6, goals, scenario } = data;

  const renderTabs = () => (
    <div className="genesis-inspector__tabs">
      {["overview", "timeline", "clarity", "context", "artifacts"].map(
        (id) => (
          <button
            key={id}
            className={tab === id ? "active" : ""}
            onClick={() => setTab(id)}
          >
            {id.charAt(0).toUpperCase() + id.slice(1)}
          </button>
        )
      )}
    </div>
  );

  const renderOverview = () => {
    const summary = g6?.summary || {};
    const recs = g6?.recommendations || [];
    return (
      <div className="genesis-inspector__section">
        <h4>Overview</h4>
        <div>
          <strong>Scenario:</strong>{" "}
          {scenario ? scenario.label || scenario.id : "—"}
        </div>
        <div>
          <strong>Grade:</strong> {summary.grade || "—"}
        </div>
        <div>
          <strong>Clarity:</strong> {pct(summary.clarityScore)}
        </div>
        <div>
          <strong>Distance from centroid:</strong>{" "}
          {summary.distanceFromCentroid != null
            ? summary.distanceFromCentroid.toFixed(3)
            : "—"}
        </div>

        {goals && (
          <div className="genesis-inspector__goals">
            <h5>Goals</h5>
            <div>Min grade: {goals.minGrade}</div>
            <div>Min clarity: {goals.minClarity}</div>
            <div>Max distance: {goals.maxDistance}</div>
          </div>
        )}

        {recs.length > 0 && (
          <div className="genesis-inspector__recs">
            <h5>Recommendations</h5>
            <ul>
              {recs.map((r) => (
                <li key={`${r.code}-${r.priority}`}>
                  <strong>[{r.severity.toUpperCase()}]</strong>{" "}
                  <strong>{r.code}</strong> – {r.message}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  };

  const renderTimeline = () => {
    if (!g3) {
      return <p>No G3 visualization timeline available.</p>;
    }
    const segments = g3.timeline || g3.segments || [];
    if (segments.length === 0) {
      return <p>No timeline segments.</p>;
    }

    return (
      <div className="genesis-inspector__section">
        <h4>Timeline (WPM / CPS / Motion)</h4>
        <table className="genesis-inspector__table">
          <thead>
            <tr>
              <th>Start</th>
              <th>End</th>
              <th>WPM</th>
              <th>CPS</th>
              <th>Motion</th>
              <th>Clarity</th>
            </tr>
          </thead>
          <tbody>
            {segments.map((s, idx) => (
              <tr key={idx}>
                <td>{s.t_start_sec?.toFixed?.(2) ?? s.tStart ?? "—"}</td>
                <td>{s.t_end_sec?.toFixed?.(2) ?? s.tEnd ?? "—"}</td>
                <td>{s.wpm ?? "—"}</td>
                <td>{s.cps ?? "—"}</td>
                <td>
                  {s.motion_load != null
                    ? s.motion_load.toFixed(2)
                    : s.motionLoad != null
                    ? s.motionLoad.toFixed(2)
                    : "—"}
                </td>
                <td>
                  {s.clarity_score != null
                    ? s.clarity_score.toFixed(2)
                    : s.clarityScore != null
                    ? s.clarityScore.toFixed(2)
                    : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  const renderClarity = () => {
    if (!g4) {
      return <p>No G4 clarity bundle available.</p>;
    }
    const clarity = g4.clarity || {};
    const issues = (g4.insights && g4.insights.issues) || [];

    return (
      <div className="genesis-inspector__section">
        <h4>Clarity & Issues</h4>
        <div>
          <strong>Clarity score:</strong> {pct(clarity.clarityScore)}
        </div>
        <div>
          <strong>Pacing stability:</strong> {pct(clarity.pacingStability)}
        </div>
        <div>
          <strong>Density variance:</strong> {clarity.densityVariance ?? "—"}
        </div>
        <div>
          <strong>Caption load index:</strong>{" "}
          {clarity.captionLoadIndex != null
            ? clarity.captionLoadIndex.toFixed(2)
            : "—"}
        </div>

        {issues.length > 0 && (
          <>
            <h5>Flagged Issues</h5>
            <ul>
              {issues.map((iss, idx) => (
                <li key={idx}>
                  <strong>{iss.code}</strong> – {iss.message || iss.detail}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    );
  };

  const renderContext = () => {
    if (!g5) {
      return <p>No G5 cross-tutorial analytics available.</p>;
    }
    const comps = g5.tutorialComparisons || [];
    const clusters = g5.clusters || [];
    const drift = g5.drift || {};

    return (
      <div className="genesis-inspector__section">
        <h4>Cross-Tutorial Context</h4>

        <h5>This Tutorial</h5>
        {g6 && (
          <p>
            Tutorial ID: <code>{g6.input?.tutorialId || "unknown"}</code>
          </p>
        )}
        {g6 && (
          <ul>
            <li>
              Distance from centroid:{" "}
              {g6.summary?.distanceFromCentroid != null
                ? g6.summary.distanceFromCentroid.toFixed(3)
                : "—"}
            </li>
          </ul>
        )}

        <h5>Comparisons</h5>
        {comps.length === 0 ? (
          <p>No comparisons in G5 bundle.</p>
        ) : (
          <table className="genesis-inspector__table">
            <thead>
              <tr>
                <th>Tutorial</th>
                <th>Rank</th>
                <th>Distance</th>
                <th>z(clarity)</th>
                <th>z(captions)</th>
                <th>z(motion)</th>
                <th>Flags</th>
              </tr>
            </thead>
            <tbody>
              {comps.map((c) => (
                <tr key={c.tutorialId}>
                  <td>{c.tutorialId}</td>
                  <td>{c.rankIndex}</td>
                  <td>{c.distanceFromCentroid.toFixed(3)}</td>
                  <td>{c.zScores?.clarityScore?.toFixed(2)}</td>
                  <td>{c.zScores?.captionLoadIndex?.toFixed(2)}</td>
                  <td>{c.zScores?.avgMotionLoad?.toFixed(2)}</td>
                  <td>{(c.flags || []).join(", ") || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <h5>Clusters</h5>
        {clusters.length === 0 ? (
          <p>No clusters available.</p>
        ) : (
          <ul>
            {clusters.map((cl) => (
              <li key={cl.clusterId}>
                <strong>{cl.clusterId}</strong> — {cl.members?.length || 0} members, centroid clarity:{" "}
                {cl.centroidClarity != null
                  ? cl.centroidClarity.toFixed(2)
                  : "—"}
              </li>
            ))}
          </ul>
        )}

        <h5>Drift (Global)</h5>
        <ul>
          <li>Clarity drift: {drift.clarityDrift?.toFixed?.(3) ?? "—"}</li>
          <li>
            Caption load drift:{" "}
            {drift.captionLoadTrift?.toFixed?.(3) ?? "—"}
          </li>
          <li>
            Motion load drift: {drift.motionLoadDrift?.toFixed?.(3) ?? "—"}
          </li>
        </ul>
      </div>
    );
  };

  const renderArtifacts = () => (
    <div className="genesis-inspector__section">
      <h4>Artifacts</h4>
      <p>
        For full JSON artifacts, use the <strong>GENESIS Artifacts</strong> panel or direct
        links.
      </p>
      <ul>
        <li>G3 visualization: genesis_visualization_g3_v1.0.0.json</li>
        <li>G4 clarity: genesis_clarity_g4_v1.0.0.json</li>
        <li>G5 analytics: genesis_analytics_g5_v1.0.0.json</li>
        <li>G6 feedback: genesis_feedback_v1.0.0.json</li>
      </ul>
    </div>
  );

  let content;
  switch (tab) {
    case "overview":
      content = renderOverview();
      break;
    case "timeline":
      content = renderTimeline();
      break;
    case "clarity":
      content = renderClarity();
      break;
    case "context":
      content = renderContext();
      break;
    case "artifacts":
      content = renderArtifacts();
      break;
    default:
      content = renderOverview();
  }

  return (
    <div className="genesis-inspector">
      <h3>GENESIS Inspector</h3>
      {renderTabs()}
      {content}
    </div>
  );
}
