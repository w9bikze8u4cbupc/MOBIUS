# Phase G1 Summary

## Quick Checklist

- **Offline-first CI**: wheelhouse caching plus `pytest` on Linux, macOS, and Windows.
- **In-repo FastAPI shim**: routing, middleware, responses, and sync `TestClient` for air-gapped runs.
- **Gateway vG1**: secure ZIP exports, traversal/allowlist checks, Unicode `Content-Disposition`, strong RFC caching.
- **Controls & telemetry**: JSONL audit with daily rotation, Prometheus-style metrics, token-bucket rate limiting.
- **Ops kit**: lightweight HTTP server adapter, Docker Compose, operator README.
- **CI hygiene**: bumped to `actions/setup-python@v5` (deprecation cleared).

## Comprehensive Summary

### Goal

Phase G1 hardens the MOBIUS Gateway for production and offline environments by removing external runtime/mirror dependencies and baking in observability and protections.

### What Shipped

- **Framework**: an in-repo FastAPI-compatible shim covering route parameters, middleware stack, `HTTPException` mapping, `Response`/`JSONResponse`/`FileResponse`, and a sync `TestClient` for pure in-process tests.
- **Gateway**: `GET`/`HEAD /exports/{file_path}` (ZIP-only allowlist, traversal defense, `ETag`/`Last-Modified`/`Accept-Ranges`, Unicode-safe headers) and `GET /healthz` (API key).
- **Audit & Metrics**: JSONL logs (timestamp/method/path/status/IP/UA) with day rotation and a Prometheus text endpoint (counters plus latency histogram).
- **Rate limiting**: token-bucket keyed by validated API key (fallback to client IP) with environment-tuned burst/rate limits.
- **Packaging**: Compose file mounting `exports` (read-only) and `logs`, default port 8000, offline CI using wheelhouse and `--no-index`.

### Validation

End-to-end `pytest` covers ZIP allowlist, conditional `304`s, API-key enforcement, audit rotation, security headers, metrics, rate-limit behavior, and Unicode filenames. All tests pass locally and in CI.

### Operational Posture

Runtime is environment-driven (`MOBIUS_API_KEY`, `EXPORTS_DIR`, `LOG_DIR`, `MOBIUS_METRICS_PUBLIC`, `RL_ENABLE`, `RL_BURST`, `RL_RATE_PER_SEC`). Ready to sit behind a CDN; Prometheus scrape is straightforward.

## Decisions & Rationale

- **Offline-first**: in-repo framework and cached wheels remove external SPOFs.
- **Small attack surface**: `GET`/`HEAD` only, explicit ZIP allowlist, strict path and header handling.
- **Lean observability**: plain-text metrics and JSONL logs with zero heavy dependencies.
- **Early throttling**: built-in rate limiting protects the origin pre-CDN.

## Action Items (Pre/Post-merge)

1. **Router query handling**: strip/ignore query when matching paths to prevent cache-bust 404s.
2. **ZIP validation perf**: prefer `ZipFile.infolist()` checks over `testzip()` to avoid decompression.
3. **Rate-limit key**: derive bucket from validated API key; fallback is client IP.
4. **Metrics polish** (optional): add exact duration `_sum` alongside buckets.
5. **Lint/docs**: remove unused params; prefer public header accessors; add one-liner module docstrings.
6. **CDN notes**: document header propagation (`ETag`, `Last-Modified`) and expected `304` behavior.

## Risks & Mitigations

- **Header spoofing** → validate API key before using it for rate-limiting keying; sanitize client-supplied headers.
- **Unicode header regressions** → keep regression cases in tests and verify RFC5987/`filename*` path.
- **Large ZIP throughput** → confirm zero-copy `sendfile` on chosen server and add soak tests.

## Next Session (Phase G2: CDN & Edge)

- **CDN pass-through**: ensure `ETag`/`Last-Modified` propagate; verify `304` at the edge.
- **Cache-key isolation**: exclude `X-Mobius-Key` from cache keys while maintaining auth.
- **/healthz dashboard**: include version/build, counters, rotating summary.
- **Artifact signing**: optional `.sig` (SHA-256 plus ed25519) with golden tests (edge hit/miss, signature verify).
- **Load/soak**: concurrency vs. rate-limit, large ZIPs, metrics stability.

## Coding Style & Preferences

- **Modular, dependency-lean core** with clear separation of concerns.
- **Docs first**: structured Markdown (phase notes, operator guides), tight docstrings, changelogs.
- **Testing discipline**: unit and E2E, deterministic fixtures, Unicode/headers/conditional caching edge cases.
- **Quality gates**: PEP 8, Black/isort/ruff, CI OS matrix, golden checks.
- **Ops/observability**: plaintext metrics, JSONL audits, reproducible builds, Docker/Compose samples.
- **Security by default**: strict input validation, header hardening, API-key auth, rate limiting.

