# Makefile for Mobius Verification Scripts

# Default target
.PHONY: help
help:
	@echo "Mobius Verification Scripts Makefile"
	@echo ""
	@echo "Available targets:"
	@echo "  smoke-local     Run local smoke test with bash script"
	@echo "  smoke-local-ps  Run local smoke test with PowerShell script"
	@echo "  test            Run all tests"
	@echo "  clean           Clean artifacts directory"
	@echo "  help            Show this help message"

# Run local smoke test with bash script
.PHONY: smoke-local
smoke-local:
	@echo "Running local smoke test with bash script..."
	@./smoke-local.sh

# Run local smoke test with PowerShell script
.PHONY: smoke-local-ps
smoke-local-ps:
	@echo "Running local smoke test with PowerShell script..."
	@pwsh -Command "./smoke-local.ps1"

# Run all tests
.PHONY: test
test:
	@echo "Running all tests..."
	@echo "Note: This requires bats and Pester to be installed"
	@echo "Bash tests: bats test/bash_dry_run_test.bats"
	@echo "PowerShell tests: pwsh -Command \"Invoke-Pester test/powershell_dry_run_test.ps1\""

# Clean artifacts directory
.PHONY: clean
clean:
	@echo "Cleaning artifacts directory..."
	@rm -rf artifacts/
	@mkdir -p artifacts

# Install dependencies (if needed)
.PHONY: install
install:
	@echo "Installing dependencies..."
	@echo "Note: This project requires:"
	@echo "  - Node.js >= 20.11"
	@echo "  - npm"
	@echo "  - ffmpeg and ffprobe"
	@echo "  - tesseract (optional, for OCR)"
	@echo "  - bats (for bash tests)"
	@echo "  - Pester (for PowerShell tests)"