# Mobius Games Tutorial Generator

A production-ready pipeline for generating game tutorial videos with advanced image matching using deterministic perceptual hashing (DHash).

## Features

- **Deterministic DHash**: 64-bit perceptual hashing with full metadata support
- **Secure PDF Processing**: Sandboxed extraction with security controls
- **Migration Tools**: Seamless transition from blockhash to dhash
- **Cross-Platform CI**: Automated testing on Linux, macOS, and Windows
- **Observability**: Built-in metrics and monitoring
- **Manual Review Queue**: Low-confidence match handling

## DHash Image Matching

### Confidence Mapping Formula

The system converts confidence percentages to Hamming distance thresholds using:

```
max_hamming = ⌊(1−confidence) × bit_length⌋
```

#### Common Confidence Thresholds

| Confidence | Max Hamming Distance | Use Case |
|-----------|---------------------|----------|
| **0.95 (95%)** | **3** | High precision matching |
| **0.90 (90%)** | **6** | Balanced precision/recall |
| 0.85 (85%) | 9 | Moderate similarity |
| 0.80 (80%) | 12 | Loose similarity |

**Examples:**
- `0.90 confidence → max_hamming = 6` (⌊(1-0.9) × 64⌋ = 6)
- `0.95 confidence → max_hamming = 3` (⌊(1-0.95) × 64⌋ = 3)

### Migration from Blockhash

```bash
# Dual-hash mode (recommended for production transition)
node scripts/migrate-to-dhash.js -i library.json -m dual --verbose

# Complete replacement mode (after validation)
node scripts/migrate-to-dhash.js -i library.json -m replace --verbose
```

## Installation

### Windows
```powershell
# Using Chocolatey (recommended)
choco install nodejs --version="18.17.0"
choco install poppler --yes
choco install ffmpeg --yes
```

### Linux (Ubuntu/Debian)
```bash
sudo apt-get install -y nodejs npm poppler-utils ffmpeg
```

### macOS
```bash
brew install node@18 poppler ffmpeg
```

See [OPERATIONS.md](OPERATIONS.md) for detailed operational guidance.

## License

MIT
