import React, { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";

const DEFAULT_POLL_INTERVAL_MS = 10_000;

const sanitizeMarkdown = (markdown) => markdown || "";

const OperatorTelemetryPanel = ({
  orchestratorUrl,
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
  logger = console,
}) => {
  const [telemetry, setTelemetry] = useState(null);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const abortControllerRef = useRef(null);
  const isMountedRef = useRef(false);

  const fetchTelemetry = useMemo(
    () =>
      async (signal) => {
        try {
          logger.info?.("[telemetry] fetching", { orchestratorUrl });
          const response = await fetch(orchestratorUrl, {
            headers: { Accept: "application/json" },
            signal,
          });
          if (!response.ok) {
            throw new Error(`Telemetry fetch failed: ${response.status}`);
          }
          const payload = await response.json();
          const { markdown = "", ...rest } = payload;
          const sanitized = sanitizeMarkdown(markdown);
          if (!isMountedRef.current) return;
          setTelemetry({ markdown: sanitized, raw: payload.markdown, meta: rest });
          setLastUpdated(new Date().toISOString());
          setError(null);
          logger.info?.("[telemetry] fetch success", { status: response.status, meta: rest });
        } catch (err) {
          if (signal?.aborted) {
            logger.warn?.("[telemetry] fetch aborted");
            return;
          }
          logger.error?.("[telemetry] fetch error", { message: err.message });
          if (!isMountedRef.current) return;
          setError(err);
        }
      },
    [logger, orchestratorUrl]
  );

  useEffect(() => {
    isMountedRef.current = true;
    abortControllerRef.current = new AbortController();
    fetchTelemetry(abortControllerRef.current.signal);

    const intervalId = setInterval(() => {
      abortControllerRef.current?.abort();
      abortControllerRef.current = new AbortController();
      fetchTelemetry(abortControllerRef.current.signal);
    }, pollIntervalMs);

    return () => {
      isMountedRef.current = false;
      clearInterval(intervalId);
      abortControllerRef.current?.abort();
    };
  }, [fetchTelemetry, pollIntervalMs]);

  const handleManualRefresh = () => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();
    fetchTelemetry(abortControllerRef.current.signal);
  };

  return (
    <section className="operator-telemetry-panel">
      <header className="operator-telemetry-panel__header">
        <h2>Operator Telemetry</h2>
        <div className="operator-telemetry-panel__controls">
          <button type="button" onClick={handleManualRefresh}>
            Refresh
          </button>
          <span className="operator-telemetry-panel__status">
            {lastUpdated ? `Last updated: ${lastUpdated}` : "Awaiting data..."}
          </span>
        </div>
      </header>

      {error && (
        <div className="operator-telemetry-panel__error" role="alert">
          <strong>Error:</strong> {error.message}
        </div>
      )}

      {telemetry ? (
        <article className="operator-telemetry-panel__content">
          <ReactMarkdown skipHtml>{telemetry.markdown}</ReactMarkdown>
        </article>
      ) : (
        !error && <p>Loading telemetry…</p>
      )}
    </section>
  );
};

export default OperatorTelemetryPanel;
