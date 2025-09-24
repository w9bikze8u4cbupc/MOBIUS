# Operations Guide

This document provides operational guidance for deploying and maintaining the Mobius Games Tutorial Generator with DHash image matching.

## System Requirements

### Node.js
- **Version**: Node.js >= 18.0.0
- **NPM**: >= 8.0.0

### Dependencies

#### Cross-Platform
- FFmpeg (video processing)
- Node.js with Sharp (image processing)

#### PDF Processing (Required for image extraction)
- Poppler utilities (pdfimages, pdftoppm)

## Installation Instructions

### Windows Installation

#### Prerequisites
1. **Node.js**
   ```powershell
   # Using winget (Windows Package Manager)
   winget install OpenJS.NodeJS
   
   # Or using Chocolatey
   choco install nodejs --version="18.17.0"
   ```

2. **Poppler (PDF Tools)**
   ```powershell
   # Using Chocolatey (recommended)
   choco install poppler --yes
   
   # Or using winget
   winget install poppler
   
   # Manual installation alternative:
   # Download from: https://github.com/oschwartz10612/poppler-windows/releases
   # Extract to C:\poppler and add C:\poppler\bin to PATH
   ```

3. **FFmpeg**
   ```powershell
   # Using Chocolatey
   choco install ffmpeg --yes
   
   # Using winget
   winget install Gyan.FFmpeg
   ```

#### PATH Configuration
Ensure these directories are in your system PATH:
- `C:\Program Files\nodejs`
- `C:\ProgramData\chocolatey\lib\poppler\tools\poppler-23.08.0\bin` (or your poppler installation path)
- FFmpeg installation directory

#### Verification
```powershell
# Verify installations
node --version          # Should be >= 18.0.0
npm --version           # Should be >= 8.0.0
pdfimages --help       # Should show poppler pdfimages help
pdftoppm --help        # Should show poppler pdftoppm help
ffmpeg -version        # Should show FFmpeg version
```

### Linux Installation (Ubuntu/Debian)

```bash
# Node.js (using NodeSource repository)
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Poppler utilities
sudo apt-get update
sudo apt-get install -y poppler-utils

# FFmpeg
sudo apt-get install -y ffmpeg
```

### macOS Installation

```bash
# Using Homebrew
brew install node@18
brew install poppler
brew install ffmpeg

# Ensure Node 18 is in PATH
echo 'export PATH="/opt/homebrew/opt/node@18/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
```

## DHash Configuration

### Hash Algorithm Settings
- **Algorithm**: `perceptual_dhash`
- **Version**: `1.0.0`
- **Bits**: 64-bit hash
- **Format**: Hex string (16 characters) + Base64 option

### Confidence Threshold Mapping
The confidence to Hamming distance formula is:
```
max_hamming = ⌊(1−confidence) × 64⌋
```

#### Common Thresholds
| Confidence | Max Hamming Distance | Use Case |
|-----------|---------------------|----------|
| 0.95 (95%) | 3 | High precision matching |
| 0.90 (90%) | 6 | Balanced precision/recall |
| 0.85 (85%) | 9 | Moderate similarity |
| 0.80 (80%) | 12 | Loose similarity |
| 0.70 (70%) | 19 | Very loose matching |

## Security Considerations

### PDF Processing Security

#### Sandboxing Recommendations
1. **Process Isolation**: Run PDF tools in separate processes with limited privileges
2. **Resource Limits**: Enforce memory and processing time limits
3. **Input Validation**: Validate PDF signatures before processing

#### Current Mitigations
- 50MB file size limit
- 2-minute processing timeout
- Concurrency limits to prevent resource exhaustion
- CLI argument whitelisting for PDF tools

#### Risk Assessment
- **Medium Risk**: PDF parsing vulnerabilities in poppler utilities
- **Mitigation**: Keep poppler updated, use process sandboxing where possible
- **Monitoring**: Log malformed PDF attempts and processing failures

### Recommended Deployment Security
1. Run services with minimal privileges
2. Use container isolation when possible
3. Implement request rate limiting
4. Monitor for suspicious PDF uploads

## Monitoring and Observability

### Key Metrics to Monitor

#### Extraction Performance
- `extraction_method_count`: Count by method (pdfimages, pdftoppm, fallback)
- `extraction_failures`: Failed extraction attempts
- `avg_hash_time`: Average time to calculate dhash
- `p95_hash_time`: 95th percentile hash calculation time

#### Queue Management
- `low_confidence_queue_length`: Number of matches requiring manual review
- `match_confidence_distribution`: Distribution of match confidences

#### Resource Usage
- PDF processing memory usage
- Concurrent extraction operations
- Storage usage for extracted images

### Alert Thresholds (Recommended)
- **Extraction failures**: > 5% over 5-minute window
- **Low confidence queue**: > 100 pending items
- **Hash calculation time**: p95 > 5 seconds
- **PDF processing failures**: > 10% over 10-minute window

### Logging Best Practices
- Log all PDF processing attempts with file hashes
- Record dhash calculation times and success rates
- Track confidence scores for analysis
- Alert on suspicious input patterns

## Migration from Blockhash

### Migration Process
1. **Backup**: Always backup existing library.json files
2. **Dual-hash mode**: Use migration tool in dual-hash mode initially
3. **Testing**: Validate match results with existing data
4. **Gradual rollout**: Migrate in stages by game/collection
5. **Monitoring**: Watch for confidence score changes

### Migration Tool Usage
```bash
# Dual-hash migration (recommended)
node scripts/migrate-to-dhash.js -i library.json -m dual --verbose

# Complete replacement (after validation)
node scripts/migrate-to-dhash.js -i library.json -m replace --verbose
```

### Validation Steps
1. Run migration tool in dual-hash mode
2. Compare blockhash vs dhash match results on sample data
3. Analyze confidence score distributions
4. Adjust thresholds if needed
5. Complete migration to dhash-only

## Troubleshooting

### Common Issues

#### Windows PATH Problems
```powershell
# Check if tools are in PATH
where node
where pdfimages
where pdftoppm
where ffmpeg

# Add to PATH if missing
$env:PATH += ";C:\path\to\tool\bin"
```

#### Permission Issues (Windows)
- Run PowerShell as Administrator for chocolatey operations
- Ensure user has permissions to install to system directories

#### Poppler Version Conflicts
- Use specific version: `choco install poppler --version="23.08.0"`
- Check installed version: `pdfimages -v`

#### Memory Issues with Large PDFs
- Increase Node.js memory limit: `node --max-old-space-size=4096`
- Implement streaming processing for large files

### Performance Optimization

#### Image Processing
- Use Sharp's built-in optimization settings
- Implement caching for repeated hash calculations
- Consider batch processing for multiple images

#### Resource Management
- Set appropriate concurrency limits based on available CPU cores
- Monitor memory usage during batch operations
- Implement graceful degradation for resource-constrained environments

## Backup and Recovery

### Critical Data
- `library.json` files (contains all hash metadata)
- `images.json` files (image references and hashes)
- Extracted image files (if stored locally)

### Backup Strategy
1. **Daily**: Automated backup of library files
2. **Before migration**: Manual backup with timestamp
3. **Version control**: Track library.json changes
4. **Offsite**: Regular offsite backup of critical collections

### Recovery Procedures
1. Stop services
2. Restore from most recent clean backup
3. Re-run dhash calculation on any missing entries
4. Validate hash consistency
5. Resume operations

## Support and Maintenance

### Regular Maintenance Tasks
- Update poppler utilities monthly for security patches
- Monitor hash calculation performance trends
- Review low-confidence matches for quality improvement
- Clean up temporary files and logs

### Version Updates
- Test dhash algorithm changes on sample data first
- Maintain backward compatibility during transitions
- Document any breaking changes in hash format or calculation