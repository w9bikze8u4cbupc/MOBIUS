import argparse, hashlib, json, os, re, sys, time
from pathlib import Path

EXCLUDED_DIRS = {
    ".git", "node_modules", "dist", "build", ".next", ".cache", "__pycache__", ".venv",
    "venv", "coverage", "out", "target", ".idea", ".gradle", ".vscode", "Pods",
    "DerivedData", ".terraform"
}
EXCLUDED_FILE_EXTS = {
    ".png",".jpg",".jpeg",".gif",".svg",".ico",".mp4",".mp3",".mov",".zip",".pdf",
    ".woff",".woff2",".ttf",".otf",".dll",".so",".a",".bin"
}
CODE_EXTS = {".js",".jsx",".ts",".tsx",".py",".java",".go",".rb",".php",".cs",".scala",".kt",".rs",".c",".cpp",".h",".hpp"}

KEY_FILE_NAMES = {
    "README","README.md","README.rst","LICENSE","LICENSE.md",
    "package.json","pnpm-workspace.yaml","yarn.lock","package-lock.json","tsconfig.json","jsconfig.json",
    "next.config.js","next.config.mjs","vite.config.js","vite.config.ts","webpack.config.js","rollup.config.js",
    "jest.config.js","babel.config.js","tailwind.config.js","postcss.config.js",".eslintrc",".eslintrc.js",".eslintrc.json",
    ".prettierrc",".prettierrc.js",".prettierrc.json",".editorconfig",
    "requirements.txt","pyproject.toml","Pipfile","Pipfile.lock","setup.cfg","setup.py","manage.py",
    "Dockerfile","docker-compose.yml","docker-compose.yaml",
    "go.mod","go.sum","Cargo.toml","Gemfile","pom.xml","build.gradle","settings.gradle","gradlew","gradle.properties",
    ".env.example",".env.template"
}

def is_binary_ext(ext: str) -> bool:
    return ext.lower() in EXCLUDED_FILE_EXTS

def should_skip_dir(name: str) -> bool:
    if name in EXCLUDED_DIRS: return True
    if name == ".git": return True
    return False

def sha1_of_file(p: Path) -> str:
    h = hashlib.sha1()
    with p.open("rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            h.update(chunk)
    return h.hexdigest()

def safe_read_text(p: Path, max_chars: int = 20000) -> str:
    try:
        with p.open("r", encoding="utf-8", errors="ignore") as f:
            s = f.read(max_chars + 1)
            return s[:max_chars]
    except Exception:
        return ""

def first_lines(p: Path, max_lines: int = 60, max_chars: int = 4000) -> str:
    out, chars = [], 0
    try:
        with p.open("r", encoding="utf-8", errors="ignore") as f:
            for i, line in enumerate(f):
                if i >= max_lines or chars >= max_chars: break
                out.append(line.rstrip("\n"))
                chars += len(line)
    except Exception:
        return ""
    return "\n".join(out)

def extract_imports_exports(text: str, ext: str, max_scan_lines: int = 300):
    lines = text.splitlines()[:max_scan_lines]
    imports, exports, symbols = [], [], []
    if ext in {".py"}:
        imp_re = re.compile(r'^\s*(?:from\s+\S+\s+import\s+\S+|import\s+\S+)')
        def_re = re.compile(r'^\s*def\s+([A-Za-z_]\w*)\s*\(')
        cls_re = re.compile(r'^\s*class\s+([A-Za-z_]\w*)\s*[\(:]')
        for ln in lines:
            if imp_re.match(ln): imports.append(ln.strip())
            m = def_re.match(ln)
            if m: symbols.append(f"def {m.group(1)}")
            m = cls_re.match(ln)
            if m: symbols.append(f"class {m.group(1)}")
    elif ext in {".js",".jsx",".ts",".tsx"}:
        imp_re = re.compile(r'^\s*(?:import\s.+?from\s+[\'"].+?[\'"];?|const\s+\w+\s*=\s*require\([\'"].+?[\'"]\))')
        exp_re = re.compile(r'^\s*export\s+(?:default\s+)?(function|class|const|let|var|type|interface)\s+([A-Za-z_]\w*)')
        fn_re  = re.compile(r'^\s*(?:function|const|let|var|class|interface|type)\s+([A-Za-z_]\w*)')
        for ln in lines:
            if imp_re.match(ln): imports.append(ln.strip())
            m = exp_re.match(ln)
            if m:
                kind, name = m.groups()
                exports.append(f"export {kind} {name}")
                symbols.append(f"{kind} {name}")
            else:
                m = fn_re.match(ln)
                if m: symbols.append(m.group(1))
    return imports[:50], exports[:50], symbols[:100]

def build_tree_text(root: Path, max_depth: int = 6):
    lines = []
    def walk(d: Path, depth: int):
        if depth > max_depth: return
        try:
            entries = sorted([e for e in d.iterdir()], key=lambda p: (p.is_file(), p.name.lower()))
        except Exception:
            return
        for e in entries:
            name = e.name
            if e.is_dir():
                if should_skip_dir(name): continue
                lines.append("  " * depth + f"- {name}/")
                walk(e, depth + 1)
            else:
                if is_binary_ext(e.suffix): continue
                lines.append("  " * depth + f"- {name}")
    lines.append(f"- {root.name}/")
    walk(root, 1)
    return "\n".join(lines)

def collect(root: Path, out_dir: Path, max_depth: int, max_lines: int):
    out_dir.mkdir(parents=True, exist_ok=True)
    summary = {
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "root": root.name,
        "excludes": sorted(list(EXCLUDED_DIRS)),
        "stats": {"files": 0, "dirs": 0, "loc_estimate": 0, "by_ext": {}},
        "key_files": {},
        "manifests": {"node": [], "python": [], "other": []},
        "files": {}
    }

    tree_text = build_tree_text(root, max_depth=max_depth)
    (out_dir / "project_tree.txt").write_text(tree_text, encoding="utf-8")

    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if not should_skip_dir(d)]
        rel_dir = os.path.relpath(dirpath, root)
        if rel_dir == ".": rel_dir = ""
        summary["stats"]["dirs"] += 1

        for fname in filenames:
            p = Path(dirpath) / fname
            ext = p.suffix
            if is_binary_ext(ext): continue
            rel = str(Path(rel_dir, fname)) if rel_dir else fname
            try:
                size = p.stat().st_size
            except Exception:
                continue

            if fname in KEY_FILE_NAMES:
                content = safe_read_text(p, max_chars=20000)
                summary["key_files"][rel] = {"size": size, "content": content}
                if fname == "package.json":
                    try:
                        pkg = json.loads(content or "{}")
                        deps = sorted(list((pkg.get("dependencies") or {}).keys()))
                        dev_deps = sorted(list((pkg.get("devDependencies") or {}).keys()))
                        summary["manifests"]["node"].append({"path": rel, "name": pkg.get("name"), "workspaces": pkg.get("workspaces"), "deps": deps, "devDeps": dev_deps})
                    except Exception:
                        summary["manifests"]["node"].append({"path": rel, "name": None, "workspaces": None, "deps": [], "devDeps": []})
                elif fname == "requirements.txt":  
    reqs = [ln.strip() for ln in safe_read_text(p, 20000).splitlines() if ln.strip() and not ln.strip().startswith("#")]  
    summary["manifests"]["python"].append({"path": rel, "requirements": reqs})
                else:
                    summary["manifests"]["other"].append(rel)

            info = {"size": size, "ext": ext}
            if ext in CODE_EXTS and size < 800_000:
                head = first_lines(p, max_lines=max_lines, max_chars=4000)
                imports, exports, symbols = extract_imports_exports(head, ext, max_scan_lines=300)
                loc = head.count("\n") + 1 if head else 0
                summary["stats"]["loc_estimate"] += loc
                info.update({
                    "first_lines": head,
                    "imports": imports,
                    "exports": exports,
                    "symbols": symbols,
                    "loc_head": loc
                })
            try:
                info["sha1"] = sha1_of_file(p)
            except Exception:
                info["sha1"] = None

            summary["files"][rel] = info
            summary["stats"]["files"] += 1
            summary["stats"]["by_ext"][ext or ""] = summary["stats"]["by_ext"].get(ext or "", 0) + 1

    with (out_dir / "project_index.json").open("w", encoding="utf-8") as f:
        json.dump(summary, f, indent=2)

def main():
    ap = argparse.ArgumentParser(description="Export a sanitized, LLM-friendly project index.")
    ap.add_argument("root", help="Path to the project root")
    ap.add_argument("--out", default="./project_export", help="Output directory")
    ap.add_argument("--max-depth", type=int, default=6, help="Max directory depth for tree view")
    ap.add_argument("--max-lines", type=int, default=60, help="Max lines captured per file head")
    args = ap.parse_args()

    root = Path(args.root).resolve()
    out_dir = Path(args.out).resolve()
    if not root.exists() or not root.is_dir():
        print("Root path is not a directory or does not exist.", file=sys.stderr)
        sys.exit(1)
    collect(root, out_dir, args.max_depth, args.max_lines)
    print(f"Exported tree and index to: {out_dir}")

if __name__ == "__main__":
    main()
