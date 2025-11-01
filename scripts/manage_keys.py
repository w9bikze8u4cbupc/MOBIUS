#!/usr/bin/env python3
"""CLI utilities for managing Mobius API keys."""

from __future__ import annotations

import argparse
import logging
from datetime import timedelta
from pathlib import Path
from typing import Iterable, Optional

from mobius.observability.security import APIKeyStore

AUDIT_LOGGER_NAME = "mobius.audit.keys"
audit_logger = logging.getLogger(AUDIT_LOGGER_NAME)


def _parse_grace(value: Optional[int]) -> Optional[timedelta]:
    if value is None:
        return None
    if value < 0:
        raise argparse.ArgumentTypeError("grace period must be non-negative")
    return timedelta(seconds=value)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Manage API keys stored on disk")
    parser.add_argument(
        "action",
        choices=["create", "rotate", "revoke", "list", "prune", "verify"],
        help="Operation to perform",
    )
    parser.add_argument("--store", default="api_keys.json", help="Path to the key store file")
    parser.add_argument("--label", help="Label for the API key")
    parser.add_argument("--key-id", dest="key_id", help="Key identifier for revoke")
    parser.add_argument("--candidate", help="Candidate secret for verify")
    parser.add_argument("--secret", help="Optional secret to use instead of generating one")
    parser.add_argument(
        "--grace",
        type=int,
        help="Grace period in seconds when rotating keys",
    )
    parser.add_argument(
        "--print-secret",
        action="store_true",
        help="Print the secret to stdout (unsafe in CI logs)",
    )
    return parser


def _ensure_label(parser: argparse.ArgumentParser, label: Optional[str]) -> str:
    if not label:
        parser.error("--label is required for this action")
    return label


def _configure_logging() -> None:
    if not logging.getLogger().handlers:
        logging.basicConfig(level=logging.INFO)


def _fmt_records(records: Iterable) -> str:
    lines = []
    for record in records:
        grace = record.grace_until.isoformat() if record.grace_until else "-"
        lines.append(
            f"{record.label}: {record.key_id} created={record.created_at.isoformat()} grace_until={grace}"
        )
    return "\n".join(lines)


def main(argv: Optional[Iterable[str]] = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    _configure_logging()

    store_path = Path(args.store)
    store = APIKeyStore(store_path)
    label = args.label

    if args.action == "list":
        for label in store.list_labels():
            text = _fmt_records(store.list_keys(label))
            if text:
                print(text)
        return 0

    if args.action == "prune":
        store.prune()
        print("Expired keys pruned")
        return 0

    if args.action == "verify":
        label = _ensure_label(parser, label)
        if not args.candidate:
            parser.error("--candidate is required for verify")
        is_valid = store.verify(label, args.candidate)
        print("valid" if is_valid else "invalid")
        return 0 if is_valid else 1

    if args.action == "revoke":
        label = _ensure_label(parser, label)
        if not args.key_id:
            parser.error("--key-id is required for revoke")
        removed = store.revoke_key(label, args.key_id)
        if removed:
            audit_logger.info(
                "API key revoked",
                extra={"label": label, "key_id": args.key_id},
            )
            print(f"Revoked key {args.key_id} for {label}")
            return 0
        print("Key not found")
        return 1

    # create and rotate share the same behaviour: create_key handles grace
    # periods for existing entries.
    label = _ensure_label(parser, label)
    grace = _parse_grace(args.grace) if args.grace is not None else None
    record = store.create_key(label, secret=args.secret, grace_period=grace)
    audit_logger.info(
        "API key updated",
        extra={
            "label": label,
            "key_id": record.key_id,
            "action": args.action,
        },
    )
    print(f"Created key {record.key_id} for {label}")
    if args.print_secret:
        print(f"Secret: {record.secret}")
    else:
        print("Secret suppressed. Re-run with --print-secret to display.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
