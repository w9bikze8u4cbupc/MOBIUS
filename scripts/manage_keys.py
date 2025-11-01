#!/usr/bin/env python3
"""Management helpers for API key operations.

This script delegates to :mod:`mobius.observability.security` and adds a
thin audit logging layer so operators have a single place to review
credential changes.
"""

from __future__ import annotations

import argparse
import logging
import os
from pathlib import Path

from mobius.observability.security import (
    APIKeyRotationError,
    APIKeyStore,
    add_api_key_cli,
    handle_api_key_cli,
)

DEFAULT_STORAGE_PATH = Path(os.getenv("MOBIUS_API_KEY_STORE", "var/security/api_keys.json"))


def configure_logging() -> logging.Logger:
    """
    Configure root logging to write INFO-level messages to both stdout and an audit log file and return the named audit logger.
    
    Ensures the directory for the audit log (controlled by the MOBIUS_AUDIT_LOG environment variable, default "logs/audit.log") exists, configures the root logger with a timestamped format and two handlers (stream and file), and returns the logger named "mobius.audit".
    
    Returns:
        logging.Logger: Logger instance named "mobius.audit".
    """
    log_path = Path(os.getenv("MOBIUS_AUDIT_LOG", "logs/audit.log"))
    log_path.parent.mkdir(parents=True, exist_ok=True)
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
        handlers=[logging.StreamHandler(), logging.FileHandler(log_path, encoding="utf-8")],
    )
    return logging.getLogger("mobius.audit")


def build_parser() -> argparse.ArgumentParser:
    """
    Create and configure an ArgumentParser for Mobius API key management.
    
    The parser includes a '--store' option (defaulting to DEFAULT_STORAGE_PATH) to specify the API key storage file and requires a subcommand for the specific API key operation. Subcommands for managing API keys are registered on the parser.
    
    Returns:
        argparse.ArgumentParser: A configured argument parser for the CLI.
    """
    parser = argparse.ArgumentParser(description="Mobius API key management")
    parser.add_argument(
        "--store",
        dest="store_path",
        default=str(DEFAULT_STORAGE_PATH),
        help="Path to the API key storage file",
    )
    subparsers = parser.add_subparsers(dest="command", required=True)
    add_api_key_cli(subparsers)
    return parser


def main(argv: list[str] | None = None) -> int:
    """
    Parse command-line arguments, execute the requested API key operation, and record audit information.
    
    If the operation returns a key record and the parsed arguments include a `label`, an audit entry is written and the created key identifier and secret are printed to stdout.
    
    Parameters:
        argv (list[str] | None): Optional list of argument strings to parse; if `None`, the process's command-line arguments are used.
    
    Returns:
        int: `0` on success, `1` if an `APIKeyRotationError` occurred.
    """
    parser = build_parser()
    args = parser.parse_args(argv)
    audit_logger = configure_logging()
    store = APIKeyStore(args.store_path, audit_logger=audit_logger)
    try:
        record = handle_api_key_cli(store, args)
    except APIKeyRotationError as exc:
        audit_logger.error("API key operation failed", extra={"error": str(exc)})
        return 1
    label = getattr(args, "label", None)
    if record and label:
        audit_logger.info(
            "API key updated",
            extra={"label": label, "key_id": record.key_id, "rotation_due": record.rotation_due.isoformat()},
        )
        print(f"Created key {record.key_id} for {label}")
        print(f"Secret: {record.secret}")
    return 0


if __name__ == "__main__":  # pragma: no cover - CLI entry point
    raise SystemExit(main())