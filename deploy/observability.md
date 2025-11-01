# Observability and Security Operations

## API key store operations

The API key store persists secrets to a JSON file. The on-disk file is
updated atomically and is intended for a **single writer**. When running
multiple processes, ensure only one instance has write access to the
persistent volume. If multi-writer scenarios cannot be avoided, protect
the file with OS-level locking (for example `fcntl`/`flock` on Linux or
`msvcrt.locking` on Windows) or migrate to a shared backend such as
SQLite or Redis.

The store writes secrets in plaintext. For production environments,
restrict the file mode to `0600` and consider integrating with a managed
KMS/HSM service for envelope encryption.

## Audit data retention

Audit logs emitted by the gateway contain `client_id` and source IP
addresses. Treat these values as personal data: configure retention
policies, ensure access is restricted, and apply redaction or
pseudonymisation where appropriate.
