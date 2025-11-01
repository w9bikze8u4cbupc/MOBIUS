"""Prepare sample export artifacts and populate CI environment variables for gateway tests."""
from __future__ import annotations

import os
from pathlib import Path
import zipfile


def main() -> None:
    root = Path("tests/exports/sample")
    root.mkdir(parents=True, exist_ok=True)
    hello_file = root / "hello.txt"
    hello_file.write_text("hello\n", encoding="utf-8")
    zip_path = root / "sample.zip"
    with zipfile.ZipFile(zip_path, "w") as archive:
        archive.write(hello_file, arcname="hello.txt")

    env_path = os.environ.get("GITHUB_ENV")
    if env_path:
        export_root = root.parent.resolve()
        with open(env_path, "a", encoding="utf-8") as handle:
            handle.write(f"MOBIUS_EXPORT_ROOT={export_root}\n")
            handle.write("MOBIUS_API_KEY=test-key\n")


if __name__ == "__main__":
    main()
