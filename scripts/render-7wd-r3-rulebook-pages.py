from pathlib import Path
import fitz

root = Path(__file__).resolve().parents[1]
pdf = Path(r"C:\mobius-games-tutorial-generator-runtime\data\6b-7-wonders-duel-8b05c4ce1c4f\source\rulebook.pdf")
out = root / "out" / "publishability-r3" / "7-wonders-duel" / "rulebook-pages"
out.mkdir(parents=True, exist_ok=True)
doc = fitz.open(pdf)
for page_number in (6, 7, 10, 11, 12, 13, 20):
    page = doc[page_number - 1]
    pix = page.get_pixmap(dpi=300, alpha=False)
    pix.save(out / f"page-{page_number:02d}.png")
print(out)
