import React, { useCallback, useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";

const STORAGE_KEY = "mobius.operator.reports";

const structuredLog = (level, message, context = {}) => {
  const payload = {
    ts: new Date().toISOString(),
    level,
    message,
    ...context,
  };

  if (level === "error" || level === "warn") {
    console.error(JSON.stringify(payload));
  } else {
    console.log(JSON.stringify(payload));
  }
};

const sanitizeMarkdown = (markdown) =>
  markdown.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "");

const getDefaultStreamUrl = () => {
  if (typeof process !== "undefined" && process.env.REACT_APP_ORCHESTRATOR_URL) {
    return process.env.REACT_APP_ORCHESTRATOR_URL;
  }

  if (typeof window !== "undefined" && window.location) {
    return `${window.location.origin}/orchestrator`; // default relative orchestrator proxy
  }

  return "http://localhost:7100/orchestrator";
};

const restoreCachedReports = () => {
  if (typeof window === "undefined" || !window.sessionStorage) {
    return [];
  }

  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed;
    }
  } catch (err) {
    structuredLog("warn", "operator_cache_restore_failed", { error: String(err) });
  }

  return [];
};

const cacheReports = (reports) => {
  if (typeof window === "undefined" || !window.sessionStorage) {
    return;
  }

  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(reports));
  } catch (err) {
    structuredLog("warn", "operator_cache_write_failed", { error: String(err) });
  }
};

const parseEventPayload = (data) => {
  try {
    const parsed = JSON.parse(data);
    if (parsed && typeof parsed === "object") {
      const markdown = typeof parsed.markdown === "string" ? parsed.markdown : parsed.report;
      const id = parsed.id || parsed.noteId || parsed.timestamp || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const meta = parsed.meta || parsed.metadata || {};

      if (typeof markdown === "string") {
        return {
          id,
          markdown,
          metadata: meta,
          receivedAt: new Date().toISOString(),
        };
      }
    }
  } catch (err) {
    // fall through to treat payload as raw markdown
    structuredLog("warn", "operator_event_parse_warning", { error: String(err) });
  }

  return {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    markdown: data,
    metadata: {},
    receivedAt: new Date().toISOString(),
  };
};

const limitReports = (reports, limit = 20) => reports.slice(0, limit);

const OperatorTelemetryPanel = () => {
  const [reports, setReports] = useState(() => restoreCachedReports());
  const [isLoading, setIsLoading] = useState(reports.length === 0);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState(null);
  const [reconnectToken, setReconnectToken] = useState(0);

  const streamUrl = useMemo(() => {
    const base = getDefaultStreamUrl();
    return base.endsWith("/stream") ? base : `${base.replace(/\/$/, "")}/stream`;
  }, []);

  const handleMessage = useCallback((event) => {
    if (!event?.data) {
      return;
    }

    const parsed = parseEventPayload(event.data);
    const sanitized = sanitizeMarkdown(parsed.markdown || "");

    setReports((current) => {
      const withoutDuplicate = current.filter((entry) => entry.id !== parsed.id);
      const nextReports = limitReports([
        { ...parsed, markdown: sanitized },
        ...withoutDuplicate,
      ]);
      cacheReports(nextReports);
      return nextReports;
    });
  }, []);

  const connectStream = useCallback(() => {
    if (typeof window === "undefined" || typeof window.EventSource === "undefined") {
      structuredLog("error", "operator_stream_unavailable_in_environment");
      setError("Streaming not supported in this environment");
      setIsLoading(false);
      return undefined;
    }

    structuredLog("info", "operator_stream_connecting", { url: streamUrl });

    const source = new window.EventSource(`${streamUrl}?client=operator-ui`);

    source.onopen = () => {
      structuredLog("info", "operator_stream_opened", { url: streamUrl });
      setIsConnected(true);
      setIsLoading(false);
      setError(null);
    };

    source.onmessage = (event) => {
      structuredLog("info", "operator_stream_event", { bytes: event.data?.length || 0 });
      handleMessage(event);
    };

    source.onerror = (event) => {
      structuredLog("error", "operator_stream_error", { detail: JSON.stringify(event) });
      setIsConnected(false);
      setError("Live telemetry temporarily unavailable. Showing cached data.");
      setIsLoading(false);
      source.close();
    };

    return source;
  }, [handleMessage, streamUrl]);

  useEffect(() => {
    let eventSource = connectStream();

    return () => {
      if (eventSource) {
        eventSource.close();
        structuredLog("info", "operator_stream_closed");
      }
    };
  }, [connectStream, reconnectToken]);

  const handleReconnect = () => {
    structuredLog("info", "operator_stream_reconnect_requested");
    setIsLoading(true);
    setError(null);
    setIsConnected(false);
    cacheReports(reports);
    setReconnectToken((value) => value + 1);
  };

  return (
    <section
      style={{
        marginTop: 48,
        padding: 24,
        border: "1px solid #d0d7de",
        borderRadius: 12,
        background: "#f6f8fa",
      }}
    >
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <h2 style={{ margin: "0 0 4px" }}>Operator Controls — Live Telemetry</h2>
          <p style={{ margin: 0, color: "#57606a" }}>
            Streaming markdown reports directly from the orchestration service.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              fontSize: 14,
              color: isConnected ? "#1a7f37" : "#9e2146",
              fontWeight: 600,
            }}
          >
            <span
              style={{
                display: "inline-block",
                width: 10,
                height: 10,
                borderRadius: "50%",
                background: isConnected ? "#2da44e" : "#cf222e",
              }}
            />
            {isConnected ? "Live" : "Offline"}
          </span>
          <button
            type="button"
            onClick={handleReconnect}
            style={{
              padding: "6px 14px",
              borderRadius: 6,
              border: "1px solid #0969da",
              background: "#0969da",
              color: "#ffffff",
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            Reconnect
          </button>
        </div>
      </header>

      {isLoading && (
        <div style={{ marginTop: 24, color: "#57606a" }}>Connecting to orchestrator feed…</div>
      )}

      {error && (
        <div
          style={{
            marginTop: 16,
            padding: 12,
            borderRadius: 8,
            background: "#fff3cd",
            color: "#5f3b00",
          }}
        >
          {error}
        </div>
      )}

      <div style={{ marginTop: 24, display: "grid", gap: 16 }}>
        {reports.length === 0 && !isLoading ? (
          <div style={{ color: "#57606a" }}>No telemetry reports available.</div>
        ) : (
          reports.map((report) => (
            <article
              key={report.id}
              style={{
                background: "#ffffff",
                borderRadius: 10,
                padding: 16,
                boxShadow: "0 1px 2px rgba(27, 31, 35, 0.1)",
              }}
            >
              <header style={{ marginBottom: 12, display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontWeight: 600 }}>Report {report.metadata?.tag || report.id}</span>
                <time style={{ color: "#57606a", fontSize: 13 }}>
                  {report.metadata?.timestamp || report.receivedAt}
                </time>
              </header>
              <ReactMarkdown>{report.markdown}</ReactMarkdown>
            </article>
          ))
        )}
      </div>
    </section>
  );
};

export default OperatorTelemetryPanel;
