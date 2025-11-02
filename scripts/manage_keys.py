"""CLI helper for managing MOBIUS API keys."""

from __future__ import annotations

import argparse
import json
import os
from datetime import timedelta
from pathlib import Path
from typing import Any

from mobius.observability.security import APIKeyStore, APIKeyRecord, handle_api_key_cli

DEFAULT_STORE = Path(os.environ.get("MOBIUS_API_KEY_STORE", "var/security/api_keys.json"))


def _timedelta(value: str) -> timedelta:
    value = value.strip()
    suffix = value[-1]
    multiplier: int
    if suffix == "s":
        multiplier = 1
    elif suffix == "m":
        multiplier = 60
    elif suffix == "h":
        multiplier = 3600
    elif suffix == "d":
        multiplier = 86400
    else:  # pragma: no cover - guarded by argparse
        raise argparse.ArgumentTypeError(f"Unsupported duration suffix: {suffix}")
    return timedelta(seconds=int(value[:-1]) * multiplier)


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--store",
        type=Path,
        default=DEFAULT_STORE,
        help="Path to the API key store (default: %(default)s)",
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    create_parser = subparsers.add_parser("create", help="Create a new API key")
    create_parser.add_argument("label", help="Logical label for the API key")
    create_parser.add_argument("--secret", help="Provide a fixed secret", default=None)
    create_parser.add_argument(
        "--rotation-interval",
        dest="rotation_interval",
        type=_timedelta,
        default=None,
        help="Override the default rotation interval (e.g. 30d)",
    )
    create_parser.add_argument(
        "--grace-period",
        dest="grace_period",
        type=_timedelta,
        default=None,
        help="Override the default grace period (e.g. 2h)",
    )

    rotate_parser = subparsers.add_parser("rotate", help="Rotate an existing API key")
    rotate_parser.add_argument("label", help="Label to rotate")
    rotate_parser.add_argument(
        "--grace-period",
        dest="grace_period",
        type=_timedelta,
        default=None,
        help="Override grace period for retiring key",
    )

    delete_parser = subparsers.add_parser("delete", help="Delete an API key")
    delete_parser.add_argument("label")
    delete_parser.add_argument("secret", help="Secret of the key to delete")

    list_parser = subparsers.add_parser("list", help="List keys for a label")
    list_parser.add_argument("label")

    return parser


def _serialize(result: Any) -> str:
    if isinstance(result, APIKeyRecord):
        payload = result.to_dict()
    elif isinstance(result, list) and result and isinstance(result[0], APIKeyRecord):
        payload = [item.to_dict() for item in result]
    else:
        return json.dumps(result, indent=2, default=str)
    return json.dumps(payload, indent=2)


def main(argv: list[str] | None = None) -> int:
    parser = _build_parser()
    args = parser.parse_args(argv)
    store = APIKeyStore(args.store)
    result = handle_api_key_cli(store, args)
    if result is not None:
        print(_serialize(result))
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
