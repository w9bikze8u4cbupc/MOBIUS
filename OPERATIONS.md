# Mobius Games Tutorial Generator - Operations Guide

## Production Image Processing Pipeline

### Overview
The Mobius Games Tutorial Generator implements a production-grade image extraction and processing pipeline with deterministic hashing, confidence mapping, and comprehensive security controls.

## Image Hashing System

### Algorithm & Versioning
- **Hash Algorithm**: `blockhash` (perceptual image hashing)
- **Library Version**: `blockhash-core@1.1.1`
- **Hash Length**: 64 bits
- **Storage Formats**: 
  - Raw (integer)
  - Hexadecimal (16 characters)
  - Base64 (for compact storage)

### Confidence Formula

The confidence calculation uses Hamming distance between image hashes:

```
confidence = 1 - (hamming_distance / bit_length)
```

Where:
- `hamming_distance`: Number of differing bits between two hashes
- `bit_length`: Total number of bits in hash (64)

### Threshold Equivalence Table

| Confidence % | Max Hamming Distance | Use Case |
|-------------|---------------------|----------|
| 99% | 0 bits | Exact matches only |
| 95% | 3 bits | Near-identical images |
| 90% | 6 bits | **Default threshold** - Good similarity |
| 85% | 9 bits | Moderate similarity |
| 80% | 12 bits | Loose similarity |

**Formula for threshold conversion:**
```javascript
max_hamming_distance = Math.floor((1 - confidence_threshold) * 64)
```

## PDF Extraction Pipeline

### Two-Stage Extraction Process

#### Stage 1: Lossless Extraction (pdfimages)
- **Purpose**: Extract embedded images without quality loss
- **Command**: `pdfimages -all -p input.pdf output_prefix`
- **Advantages**: Preserves original image quality and format
- **Fallback**: If no embedded images found, proceeds to Stage 2

#### Stage 2: Page Rendering (pdftoppm)
- **Purpose**: Render PDF pages as high-resolution images
- **Command**: `pdftoppm -png -r 300 input.pdf output_prefix`
- **Resolution**: 300 DPI for archival quality
- **Format**: PNG with lossless compression

#### Stage 3: Library Fallback
- **Library**: `pdf-to-img` Node.js package
- **Use Case**: When system tools unavailable
- **Quality**: Lower than stages 1-2 but ensures compatibility

### Image Derivatives

Each extracted image generates:

1. **Original**: Archival PNG (lossless)
2. **Preview**: 300x300 JPEG (quality: 75%)  
3. **Thumbnail**: 150x150 JPEG (quality: 75%)

## Security Controls

### PDF Input Validation
- **Max File Size**: 50MB per PDF
- **Timeout**: 2 minutes per extraction operation
- **Concurrent Limit**: 3 simultaneous extractions
- **File Validation**: Size and basic format checks

### Sandboxing Recommendations
For production deployment, consider:
- Docker containers for PDF processing
- Restricted file system access
- Resource limits (CPU, memory, disk)
- Network isolation for processing workers

### Security Configuration
```javascript
const PDF_CONFIG = {
  MAX_PDF_SIZE_MB: 50,
  PDF_PROCESSING_TIMEOUT: 120000, // 2 minutes
  MAX_CONCURRENT_EXTRACTIONS: 3,
  // Add custom security settings here
};
```

## Installation & Dependencies

### System Requirements

#### Ubuntu/Debian
```bash
sudo apt-get update
sudo apt-get install poppler-utils
```

#### macOS
```bash
brew install poppler
```

#### Windows
Using Chocolatey:
```cmd
choco install poppler
```

Using winget:
```cmd
winget install poppler
```

**Windows PATH Setup:**
After installation, add Poppler tools to your PATH:
1. Locate installation directory (usually `C:\ProgramData\chocolatey\lib\poppler\tools\poppler\bin`)
2. Add to System PATH environment variable
3. Restart terminal/IDE

### Node.js Dependencies
```bash
npm install blockhash-core sharp
```

## Health Check Endpoint

### Endpoint: `GET /health`

Returns system health and capability status:

```json
{
  "status": "healthy",
  "healthy": true,
  "checks": {
    "pdfimages": true,
    "pdftoppm": true, 
    "pdfToImgLibrary": true,
    "sharp": true,
    "overall": true
  },
  "system": {
    "hashConfig": {
      "algorithm": "blockhash",
      "version": "1.1.1",
      "bits": 64,
      "defaultThreshold": 0.90
    },
    "pdfConfig": {
      "maxSizeMB": 50,
      "timeoutMs": 120000,
      "maxConcurrent": 3
    }
  },
  "recommendations": ["All systems operational ✅"]
}
```

## API Endpoints

### Enhanced PDF Conversion: `POST /convert-pdf-to-images`

**Request:**
```json
{
  "pdfPath": "/path/to/document.pdf"
}
```

**Response:**
```json
{
  "success": true,
  "images": [
    {
      "original": {
        "path": "/path/to/original.png",
        "name": "page1.png",
        "size": 1024000
      },
      "derivatives": {
        "preview": "/path/to/preview.jpg",
        "thumbnail": "/path/to/thumb.jpg"
      },
      "hash": {
        "hex": "a1b2c3d4e5f6789a",
        "base64": "obLD1OX2eJo="
      },
      "hashMetadata": {
        "algorithm": "blockhash",
        "version": "1.1.1",
        "bits": 64
      },
      "confidence": 1.0,
      "timestamp": "2024-01-01T12:00:00Z"
    }
  ],
  "extractionMethod": "pdfimages",
  "extractionStats": {
    "totalImages": 1,
    "processingTime": 2500,
    "securityChecks": {
      "passed": true,
      "fileSizeMB": 2.5
    }
  },
  "hashConfig": {
    "algorithm": "blockhash", 
    "version": "1.1.1",
    "bits": 64,
    "confidenceFormula": "confidence = 1 - (hamming_distance / bit_length)",
    "thresholdExamples": {
      "0.90": "max_hamming = 6",
      "0.95": "max_hamming = 3", 
      "0.99": "max_hamming = 0"
    }
  }
}
```

### Enhanced Image Matching: `POST /match-images-enhanced`

Uses deterministic hashing with configurable confidence thresholds.

**Request:**
```json
{
  "components": [
    {"name": "Game Board", "quantity": 1, "confidence": 0.9}
  ],
  "images": [
    {"name": "board.png", "path": "/path/to/board.png"}
  ],
  "confidenceThreshold": 0.90
}
```

**Response includes:**
- Matched components above threshold
- Low-confidence queue for manual review  
- Comprehensive statistics and metadata
- Hash configuration details

## Performance Benchmarking

### Local Benchmark Script
```bash
# Process test corpus (create your own test PDFs)
node -e "
import { healthCheckPdfProcessing } from './src/utils/pdfExtraction.js';
const start = Date.now();
// Add your benchmark logic here
console.log('Benchmark completed in', Date.now() - start, 'ms');
"
```

### CI Performance Testing
Add to your CI pipeline to validate performance at scale:
```bash
# Example CI job (add to .github/workflows/ci.yml)
- name: Performance benchmark
  run: npm run benchmark
```

## Production Deployment Checklist

- [ ] **System dependencies installed** (poppler-utils)
- [ ] **Security limits configured** (file size, timeouts)  
- [ ] **Health check endpoint accessible**
- [ ] **Hash algorithm metadata documented**
- [ ] **Confidence thresholds tuned for use case**
- [ ] **Error handling and logging implemented**
- [ ] **Resource monitoring setup**
- [ ] **Backup/recovery procedures defined**

## Monitoring & Alerting

### Key Metrics to Monitor
- PDF processing success rate
- Average processing time per PDF
- Hash calculation performance
- Memory usage during processing
- Error rates by extraction method

### Alert Conditions
- Health check fails
- Processing time exceeds 5 minutes
- Memory usage > 80% of available
- Error rate > 5% over 10 minutes

## Troubleshooting

### Common Issues

#### "pdfimages command not found"
**Solution**: Install poppler-utils package for your OS

#### "Sharp installation failed"
**Solution**: 
```bash
npm rebuild sharp
# Or for specific platforms:
npm install --platform=linux --arch=x64 sharp
```

#### "PDF processing timeout"  
**Solutions**:
- Check PDF file size (max 50MB)
- Increase timeout in configuration
- Verify system resources available

#### Windows PATH Issues
**Solution**: 
1. Restart terminal after PATH modification
2. Use full path to poppler tools if needed
3. Check installation directory permissions

## Version History

- **v1.0.0**: Initial production release
- Hash algorithm: blockhash-core@1.1.1
- Default confidence threshold: 90%
- Security controls implemented
- Two-stage extraction pipeline
- Comprehensive test coverage