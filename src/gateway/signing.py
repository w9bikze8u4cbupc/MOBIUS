"""Utilities for creating content signatures."""

from __future__ import annotations

import hashlib
from pathlib import Path


CHUNK_SIZE = 128 * 1024


def sha256_file(path: Path) -> str:
    """Return the hexadecimal SHA-256 digest for *path*."""
    h = hashlib.sha256()
    with path.open("rb") as file_obj:
        for chunk in iter(lambda: file_obj.read(CHUNK_SIZE), b""):
            h.update(chunk)
    return h.hexdigest()
