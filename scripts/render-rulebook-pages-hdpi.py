#!/usr/bin/env python3
"""Render selected rulebook pages at high DPI without altering source assets."""

import argparse
from pathlib import Path

import fitz


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--pdf", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--pages", required=True, help="Comma-separated one-based pages")
    parser.add_argument("--dpi", type=int, default=360)
    args = parser.parse_args()

    pdf_path = Path(args.pdf).resolve()
    output_dir = Path(args.out).resolve()
    pages = sorted({int(value.strip()) for value in args.pages.split(",") if value.strip()})
    output_dir.mkdir(parents=True, exist_ok=True)

    document = fitz.open(pdf_path)
    for page_number in pages:
        if page_number < 1 or page_number > document.page_count:
            raise ValueError(f"Page {page_number} outside 1..{document.page_count}")
        pixmap = document[page_number - 1].get_pixmap(dpi=args.dpi, alpha=False)
        pixmap.save(output_dir / f"page-{page_number:02d}-{args.dpi}dpi.png")

    print(output_dir)


if __name__ == "__main__":
    main()
