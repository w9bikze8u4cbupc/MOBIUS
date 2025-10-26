# Test Fixtures

This directory contains sample PDF files for testing the ingestion pipeline.

## Guidelines

- Place small sample rulebook PDFs here (keep under ~2MB each for CI convenience)
- Recommended filenames:
  - `rulebook-good.pdf` (well-structured PDF with selectable text)
  - `rulebook-scanned.pdf` (badly-scanned PDF requiring OCR)
- Do not check in copyrighted rulebooks for public repos
- For private/internal repos, ensure you have permission to store them here
- Alternatively, store fixtures encrypted or in an internal storage bucket

## Selected Fixtures

Use these uploaded PDFs as CI/local fixtures for the ingestion POC (do NOT commit copyrighted PDFs to a public repo).

Preferred initial fixtures (private/internal repo):
- Wingspan.Rules.en.pdf
- The-Isle-of-Cats.pdf

Optional additional fixtures (for later iterations):
- f9-the-castles-of-burgundy-rulebook.pdf
- Hanamikoji.pdf
- ABYSS.pdf
- Jaipur.pdf
- a5-viticulture-essential-edition-rulebook.pdf

Notes:
- For public/open-source builds, replace with synthetic or redacted fixtures.
- If CI needs OCR tests, run them in a Docker job that has tesseract & pdftoppm installed.