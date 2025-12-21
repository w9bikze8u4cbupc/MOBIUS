from __future__ import annotations

from pathlib import Path
from typing import Iterator

import fitz  # type: ignore[import]


class PdfOpenError(Exception):
    """Raised when a PDF cannot be opened."""


class EncryptedPdfError(PdfOpenError):
    """Raised when a PDF is encrypted and cannot be read."""


class PdfPage:
    def __init__(self, page: fitz.Page, index: int) -> None:
        self._page = page
        self._index = index

    @property
    def index(self) -> int:
        return self._index

    @property
    def width(self) -> float:
        return float(self._page.rect.width)

    @property
    def height(self) -> float:
        return float(self._page.rect.height)

    def as_pymupdf_page(self) -> fitz.Page:
        """Return the underlying PyMuPDF page object."""
        return self._page


class PdfDocument:
    def __init__(self, source: Path | str) -> None:
        self._path = Path(source)
        self._doc = self._open_document(self._path)

    @property
    def path(self) -> Path:
        return self._path

    @property
    def page_count(self) -> int:
        return self._doc.page_count

    def pages(self) -> Iterator[PdfPage]:
        """Iterate over all pages in the document."""
        for i in range(self.page_count):
            yield PdfPage(self._doc.load_page(i), i)

    def close(self) -> None:
        """Close the PDF document and release file handles."""
        if hasattr(self, '_doc') and self._doc is not None:
            self._doc.close()
            self._doc = None

    def __enter__(self) -> PdfDocument:
        return self

    def __exit__(self, exc_type, exc_val, exc_tb) -> None:
        self.close()

    def __del__(self) -> None:
        """Defensive cleanup in case close() wasn't called."""
        try:
            self.close()
        except Exception:
            # Best effort cleanup - don't raise in __del__
            pass

    def _open_document(self, path: Path) -> fitz.Document:
        if not path.exists():
            raise PdfOpenError(f"PDF file does not exist: {path}")
        
        try:
            doc = fitz.open(path)
        except Exception as exc:
            raise PdfOpenError(f"Failed to open PDF: {path}") from exc

        if doc.needs_pass:
            doc.close()  # Close before raising exception
            raise EncryptedPdfError(f"PDF is encrypted: {path}")
        
        return doc