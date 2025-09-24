# Mobius Games Tutorial Generator

A production-ready pipeline for generating game tutorial videos from structured game rules with advanced image extraction, deterministic hashing, and comprehensive PDF processing capabilities.

## 🚀 Production Features

### Advanced Image Processing Pipeline
- **Two-stage PDF extraction**: Lossless pdfimages → high-quality pdftoppm fallback
- **Deterministic hashing**: 64-bit blockhash with hex + base64 storage formats  
- **Confidence mapping**: `confidence = 1 - (hamming_distance / bit_length)`
- **Image derivatives**: Archival PNG + optimized JPEG previews and thumbnails
- **Cross-platform compatibility**: Ubuntu, macOS, Windows with comprehensive CI

### Security & Performance Controls
- **PDF security validation**: 50MB file limit, 2-minute timeouts, concurrent processing limits
- **Health monitoring**: `/health` endpoint with system capability checks
- **Resource management**: Memory-efficient processing with cleanup controls
- **Error resilience**: Multi-stage fallback with detailed extraction statistics

### Hash Algorithm Specification
- **Algorithm**: `blockhash` (perceptual image hashing)
- **Library**: `blockhash-core@1.1.1` 
- **Bit Length**: 64 bits
- **Storage**: Canonical hex + base64 formats
- **Confidence Thresholds**:
  - 90% = max 6 Hamming distance *(default)*
  - 95% = max 3 Hamming distance  
  - 99% = max 0 Hamming distance *(exact match)*

## 🛠️ Installation

### System Dependencies

#### Ubuntu/Debian
```bash
sudo apt-get update
sudo apt-get install poppler-utils
npm install
```

#### macOS
```bash
brew install poppler
npm install
```

#### Windows
Using Chocolatey:
```cmd
choco install poppler
npm install
```

Using winget:
```cmd
winget install poppler
npm install
```

**Windows PATH Setup**: After Poppler installation, add tools to PATH:
- Locate: `C:\ProgramData\chocolatey\lib\poppler\tools\poppler\bin`
- Add to System PATH environment variable
- Restart terminal/IDE

### Node.js Dependencies
```bash
npm install blockhash-core sharp
```

## 🏥 Health Check

Validate system capabilities:
```bash
curl http://localhost:5001/health
```

**Response includes:**
- PDF processing tool availability (pdfimages, pdftoppm)
- Image processing capabilities (Sharp)  
- Hash algorithm configuration
- Security limits and timeouts
- System recommendations

## 📋 API Endpoints

### Enhanced PDF Processing: `POST /convert-pdf-to-images`

**Features:**
- Two-stage extraction (pdfimages → pdftoppm)
- Deterministic hashing with metadata
- Archival PNG + optimized derivatives
- Comprehensive extraction statistics
- Security validation and timeouts

**Example Response:**
```json
{
  "success": true,
  "images": [
    {
      "original": {
        "path": "/path/to/page1.png",
        "size": 1024000
      },
      "hash": {
        "hex": "a1b2c3d4e5f67890", 
        "base64": "obLD1OX2eJA="
      },
      "hashMetadata": {
        "algorithm": "blockhash",
        "version": "1.1.1", 
        "bits": 64
      },
      "confidence": 1.0
    }
  ],
  "extractionMethod": "pdfimages",
  "hashConfig": {
    "confidenceFormula": "confidence = 1 - (hamming_distance / bit_length)",
    "thresholdExamples": {
      "0.90": "max_hamming = 6",
      "0.95": "max_hamming = 3"
    }
  }
}
```

### Enhanced Image Matching: `POST /match-images-enhanced`

**Features:**
- Configurable confidence thresholds
- Low-confidence queue for manual review
- Comprehensive matching statistics  
- Hash-based similarity detection

## 🧪 Testing & Validation

### Run Core Tests
```bash
npm test
```

### Test PDF Processing
```bash
node -e "
import { healthCheckPdfProcessing } from './src/utils/pdfExtraction.js';
const health = await healthCheckPdfProcessing();
console.log('Health:', health.healthy ? '✅ PASS' : '❌ FAIL');
"
```

### Test Image Hashing
```bash
node -e "
import { calculateConfidence, getMaxHammingDistance } from './src/utils/imageHashing.js';
console.log('90% threshold max Hamming:', getMaxHammingDistance(0.90)); // Should be 6
console.log('95% threshold max Hamming:', getMaxHammingDistance(0.95)); // Should be 3  
"
```

### Create Test Fixtures
```bash
node tests/createFixtures.js
```

Creates test PDF and reference images in `tests/fixtures/` for pipeline validation.

## 📊 Performance Benchmarking

### Local Benchmark
```bash
# Process test corpus (create test-corpus/ directory with PDFs)
time node -e "
import { extractImagesFromPDF } from './src/utils/pdfExtraction.js';
// Add your performance testing logic here
"
```

### CI Performance Testing
Automated benchmarking runs in CI across Ubuntu, macOS, and Windows.

## 🔧 Configuration

### Security Limits
```javascript
const PDF_CONFIG = {
  MAX_PDF_SIZE_MB: 50,           // Maximum PDF file size
  PDF_PROCESSING_TIMEOUT: 120000, // 2-minute timeout
  MAX_CONCURRENT_EXTRACTIONS: 3   // Limit concurrent processing
};
```

### Hash Configuration  
```javascript
const HASH_CONFIG = {
  ALGORITHM: 'blockhash',
  VERSION: '1.1.1',
  BITS: 64,
  DEFAULT_CONFIDENCE_THRESHOLD: 0.90
};
```

## 🚨 Production Deployment Checklist

- [ ] **System dependencies installed** (poppler-utils)
- [ ] **Security limits configured** (file size, timeouts)
- [ ] **Health check endpoint accessible** (`GET /health`)
- [ ] **Hash algorithm metadata documented** (algorithm, version, bits)  
- [ ] **Confidence thresholds tuned** (90% default recommended)
- [ ] **Cross-platform CI validated** (Ubuntu, macOS, Windows)
- [ ] **Error handling and logging implemented**
- [ ] **Resource monitoring setup** (memory, CPU, disk usage)
- [ ] **Backup/recovery procedures defined**

## 📖 Documentation

- **[OPERATIONS.md](./OPERATIONS.md)**: Complete operations guide with confidence formulas, security controls, and troubleshooting
- **[API Documentation](./src/api/README.md)**: Detailed endpoint specifications *(if exists)*
- **[Test Fixtures](./tests/fixtures/)**: Reference PDFs and images for validation

## 🔍 Monitoring & Alerting

### Key Metrics
- PDF processing success rate  
- Average processing time per PDF
- Hash calculation performance
- Memory usage during processing
- Error rates by extraction method

### Alert Conditions
- Health check fails
- Processing time > 5 minutes  
- Memory usage > 80%
- Error rate > 5% over 10 minutes

## 🐛 Troubleshooting

### Common Issues

**"pdfimages command not found"**
- Install poppler-utils for your operating system

**"Sharp installation failed"**  
```bash
npm rebuild sharp
```

**"PDF processing timeout"**
- Check file size (max 50MB)
- Increase timeout in configuration
- Verify system resources

**Windows PATH Issues**
- Restart terminal after PATH modification
- Use full path to poppler tools if needed
- Check installation directory permissions

## 🏆 Production Ready Features

✅ **Lossless-first extraction** (pdfimages → pdftoppm)  
✅ **Deterministic blockhash matching** (64-bit, hex + base64)  
✅ **Cross-platform CI** (Ubuntu, macOS, Windows)  
✅ **Comprehensive testing** (unit, integration, fixtures)  
✅ **Production operations** (health checks, monitoring, docs)  
✅ **Security hardening** (file limits, timeouts, validation)  
✅ **Algorithm versioning** (blockhash@1.1.1 metadata tracking)  
✅ **Confidence mapping** (documented formula + threshold examples)

---

**Version**: 1.0.0  
**License**: MIT  
**Node.js**: >=18.0.0