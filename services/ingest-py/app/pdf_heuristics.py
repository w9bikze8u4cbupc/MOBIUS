"""Utilities for extracting components and setup instructions from rulebook text."""
from __future__ import annotations

import itertools
import re
import unicodedata
from typing import Dict, Iterable, List, Sequence


COMPONENT_HEADINGS: Sequence[str] = (
    "components",
    "component list",
    "game components",
    "contents",
    "materials",
    "matériel",
)

SETUP_HEADINGS: Sequence[str] = (
    "setup",
    "game setup",
    "set-up",
    "setup overview",
    "mise en place",
    "mise-en-place",
)

BULLET_PATTERN = re.compile(r"^[\s\-•\u2022\*\d\.]+\s*(.+)$")
QTY_PATTERN = re.compile(r"(?P<qty>\d+)[\sx×]*(?P<name>[\w\-\s\(\)\[\]'“”'’]+)", re.IGNORECASE)


def _normalize_heading(value: str) -> str:
    value = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode("ascii")
    return value.strip().casefold()


def _is_heading(value: str, headings: Iterable[str]) -> bool:
    normalized = _normalize_heading(value)
    return any(normalized.startswith(h) for h in headings)


def _collect_sections(lines: Sequence[str]) -> Dict[str, List[str]]:
    sections: Dict[str, List[str]] = {"components": [], "setup": []}
    current_section: str | None = None

    for line in lines:
        stripped = line.strip()
        if not stripped:
            continue

        if _is_heading(stripped, COMPONENT_HEADINGS):
            current_section = "components"
            continue
        if _is_heading(stripped, SETUP_HEADINGS):
            current_section = "setup"
            continue

        if current_section:
            sections[current_section].append(stripped)

    return sections


def _parse_components(lines: Sequence[str]) -> List[Dict[str, object]]:
    components: List[Dict[str, object]] = []
    for raw_line in lines:
        match = BULLET_PATTERN.match(raw_line)
        line = match.group(1) if match else raw_line

        qty_match = QTY_PATTERN.search(line)
        if qty_match:
            qty = int(qty_match.group("qty"))
            name = qty_match.group("name").strip(" .:-")
        else:
            qty = 1
            name = line.strip(" .:-")
        if not name:
            continue
        components.append({"name": name, "qty": qty})
    return components


def _normalize_setup_steps(lines: Sequence[str]) -> List[str]:
    steps: List[str] = []
    for line in lines:
        match = BULLET_PATTERN.match(line)
        cleaned = match.group(1) if match else line
        cleaned = cleaned.strip()
        if not cleaned:
            continue
        steps.append(cleaned)
    # Coalesce sentences separated by blank lines by splitting on numbering
    merged_steps: List[str] = []
    for key, group in itertools.groupby(steps, key=lambda s: bool(re.match(r"^\d", s))):
        if key:
            merged_steps.extend(group)
        else:
            merged_steps.extend(group)
    return merged_steps


def extract_pdf_heuristics(text: str) -> Dict[str, List[Dict[str, object]]]:
    """Extract component and setup heuristics from raw text.

    The heuristics are intentionally simple and deterministic so that they can
    operate offline without heavyweight NLP dependencies.
    """

    if not text:
        return {"components": [], "setup": []}

    # Replace carriage returns to avoid unexpected blank lines
    normalized_text = text.replace("\r", "\n")
    lines = [line.strip() for line in normalized_text.splitlines()]
    sections = _collect_sections(lines)

    components = _parse_components(sections.get("components", []))
    setup_lines = sections.get("setup", [])
    setup = [
        {"order": idx + 1, "text": step, "imageIds": []}
        for idx, step in enumerate(_normalize_setup_steps(setup_lines))
    ]

    return {"components": components, "setup": setup}


__all__ = ["extract_pdf_heuristics"]
