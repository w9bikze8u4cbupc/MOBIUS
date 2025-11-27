import React from "react";

export function IngestionReviewStep({
  onRunIngestion,
  ingesting,
  rulebookText,
  ingestionManifest,
  ingestionError,
}) {
  return (
    <div className="pipeline-section">
      <h3>Ingestion & Extraction Review</h3>
      <p className="pipeline-muted">
        Run deterministic ingestion on the parsed rulebook to validate outline and components before generating downstream assets.
      </p>
      <div className="pipeline-actions">
        <button onClick={onRunIngestion} disabled={ingesting || !rulebookText}>
          {ingesting ? "Running ingestion…" : "Run deterministic ingestion"}
        </button>
      </div>
      {ingestionError && <p style={{ color: "red" }}>{ingestionError}</p>}
      {ingestionManifest && (
        <div className="pipeline-section">
          <h4>Ingestion summary</h4>
          <p>
            Headings: {ingestionManifest.outline.length} · Components: {ingestionManifest.components.length} · Pages: {" "}
            {ingestionManifest.stats?.pageCount ?? ingestionManifest.assets?.pages?.length ?? "n/a"}
          </p>
          <ul>
            {ingestionManifest.outline.slice(0, 5).map((heading) => (
              <li key={heading.id}>
                {heading.title} (page {heading.page})
              </li>
            ))}
          </ul>
          {ingestionManifest.outline.length > 5 && <p className="pipeline-muted">Showing first 5 headings.</p>}
        </div>
      )}
    </div>
  );
}
