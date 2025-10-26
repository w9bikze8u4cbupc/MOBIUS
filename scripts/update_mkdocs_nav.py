#!/usr/bin/env python3
"""
Regenerate mkdocs.yml navigation based on docs/* structure.
Keeps section index first, followed by other Markdown files sorted by filename.
"""

from pathlib import Path
import yaml

ROOT = Path(__file__).resolve().parents[1]
MKDOCS_PATH = ROOT / "mkdocs.yml"
DOCS_ROOT = ROOT / "docs"

TAXONOMY = ["overview", "playbooks", "automation", "operations",
            "onboarding", "roadmap", "appendix"]

def collect_section(section: str):
    section_dir = DOCS_ROOT / section
    if not section_dir.exists():
        return []
    files = [p for p in section_dir.glob("*.md") if p.is_file()]
    files.sort()
    # ensure index.md first
    files.sort(key=lambda p: (0 if p.name == "index.md" else 1, p.name))
    return [{format_title(p): f"{section}/{p.name}"} for p in files]

def format_title(path: Path) -> str:
    title = path.stem.replace("-", " ").title()
    return title if path.name != "index.md" else path.parent.name.title()

def build_nav():
    nav = [{"Home": "index.md"}]
    for section in TAXONOMY:
        entries = collect_section(section)
        if entries:
            nav.append({section.title(): entries})
    return nav

def main():
    with MKDOCS_PATH.open("r", encoding="utf-8") as fh:
        config = yaml.safe_load(fh)
    config["nav"] = build_nav()
    with MKDOCS_PATH.open("w", encoding="utf-8") as fh:
        yaml.dump(config, fh, sort_keys=False, allow_unicode=True)
    print("mkdocs.yml navigation updated.")

if __name__ == "__main__":
    main()