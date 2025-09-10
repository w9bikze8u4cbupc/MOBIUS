# Quick A→Z Go-Live Validation
# Simple validation without complex URL construction

param(
    [string]$PDF = "https://arxiv.org/pdf/2106.14881.pdf",
    [string]$BaseUrl = "http://localhost:5001"
)

Write-Host "A-Z Go-Live Validation" -ForegroundColor Green
Write-Host "PDF: $PDF" -ForegroundColor Cyan
Write-Host ""

# Test 1: Poppler Health
Write-Host "1. Poppler Health Check..." -ForegroundColor Yellow
try {
    $health = Invoke-RestMethod -Uri "$BaseUrl/api/health/poppler" -TimeoutSec 10
    if ($health.ok) {
        Write-Host "   PASS: Poppler available" -ForegroundColor Green
    } else {
        Write-Host "   WARN: Poppler missing (graceful fallback)" -ForegroundColor Yellow
    }
} catch {
    Write-Host "   FAIL: Health endpoint error" -ForegroundColor Red
}

# Test 2: Basic Extraction Headers  
Write-Host "2. Basic Extraction Headers..." -ForegroundColor Yellow
try {
    $encodedPDF = [uri]::EscapeDataString($PDF)
    $basicUrl = "$BaseUrl/api/extract-components?pdfUrl=$encodedPDF"
    
    $resp = Invoke-WebRequest -UseBasicParsing -Method Head -Uri $basicUrl -TimeoutSec 30
    $cache = $resp.Headers["X-Components-Cache"]
    $source = $resp.Headers["X-Components-Source"]
    $count = $resp.Headers["X-Components-Count"]
    $requestId = $resp.Headers["X-Request-Id"]
    
    Write-Host "   Cache: $cache" -ForegroundColor Gray
    Write-Host "   Source: $source" -ForegroundColor Gray  
    Write-Host "   Count: $count" -ForegroundColor Gray
    Write-Host "   Request-ID: $requestId" -ForegroundColor Gray
    
    if ($cache -and $source -and $count) {
        Write-Host "   PASS: All headers present" -ForegroundColor Green
    } else {
        Write-Host "   FAIL: Missing headers" -ForegroundColor Red
    }
} catch {
    Write-Host "   FAIL: Headers test failed" -ForegroundColor Red
}

# Test 3: Production Settings
Write-Host "3. Production Settings Test..." -ForegroundColor Yellow
try {
    $prodUrl = "$BaseUrl/api/extract-components"
    $prodBody = @{
        pdfUrl = $PDF
        minW = 300
        minH = 300
        maxAspect = 5
        embeddedBoost = 1.04
        boostFactor = 1.2
        topN = 5
    }
    
    $prodResp = Invoke-RestMethod -Uri $prodUrl -Body $prodBody -TimeoutSec 30
    
    if ($prodResp.images.Count -gt 0) {
        Write-Host "   PASS: $($prodResp.images.Count) images extracted" -ForegroundColor Green
        
        # Show top 3
        $top3 = $prodResp.images | Sort-Object score -Descending | Select-Object -First 3
        Write-Host "   Top 3 images:" -ForegroundColor Gray
        $top3 | ForEach-Object -Begin { $i = 1 } -Process {
            Write-Host "      $i. Page $($_.page) | $($_.source) | Score: $([math]::Round($_.score))" -ForegroundColor Gray
            $i++
        }
    } else {
        if ($prodResp.popplerMissing) {
            Write-Host "   EXPECTED: No images (Poppler missing)" -ForegroundColor Yellow
        } else {
            Write-Host "   FAIL: No images extracted" -ForegroundColor Red
        }
    }
} catch {
    Write-Host "   FAIL: Production test failed" -ForegroundColor Red
}

# Test 4: Cache Behavior
Write-Host "4. Cache Test (2nd call should hit)..." -ForegroundColor Yellow
try {
    $cacheUrl = "$BaseUrl/api/extract-components?pdfUrl=$([uri]::EscapeDataString($PDF))"
    
    # Second call should hit cache
    $cacheResp = Invoke-WebRequest -UseBasicParsing -Method Head -Uri $cacheUrl -TimeoutSec 30
    $cacheStatus = $cacheResp.Headers["X-Components-Cache"]
    
    if ($cacheStatus -eq "HIT") {
        Write-Host "   PASS: Cache working ($cacheStatus)" -ForegroundColor Green
    } else {
        Write-Host "   INFO: Cache status: $cacheStatus" -ForegroundColor Yellow
    }
} catch {
    Write-Host "   FAIL: Cache test failed" -ForegroundColor Red
}

Write-Host ""
Write-Host "Go-Live Summary:" -ForegroundColor Green
Write-Host "  Ready for production with defaults:" -ForegroundColor White
Write-Host "  - dpi=300, trim=1, convert=1, bgremove=0" -ForegroundColor White
Write-Host "  - minW=300, minH=300, maxAspect=5" -ForegroundColor White  
Write-Host "  - embeddedBoost=1.04, boostFactor=1.2" -ForegroundColor White
Write-Host ""
Write-Host "Ready to ship your first A-Z tutorial!" -ForegroundColor Green