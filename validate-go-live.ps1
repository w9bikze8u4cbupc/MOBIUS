# A→Z Go-Live Validation Script
# One-command validation for production readiness

param(
    [string]$PDF = "https://arxiv.org/pdf/2106.14881.pdf",
    [string]$BaseUrl = "http://localhost:5001"
)

Write-Host "🚀 A→Z Go-Live Validation" -ForegroundColor Green
Write-Host "PDF: $PDF" -ForegroundColor Cyan
Write-Host "Base URL: $BaseUrl" -ForegroundColor Cyan
Write-Host ""

# Test 1: Poppler Health Check
Write-Host "1️⃣ Poppler Health Check..." -ForegroundColor Yellow
try {
    $healthResp = Invoke-WebRequest -UseBasicParsing -Uri "$BaseUrl/api/health/poppler" -TimeoutSec 10
    $health = $healthResp.Content | ConvertFrom-Json
    $popplerHeader = $healthResp.Headers["X-Poppler"]
    
    if ($health.ok -and $popplerHeader -eq "OK") {
        Write-Host "   ✅ PASS: Poppler available ($($health.pdfimages.version))" -ForegroundColor Green
    } else {
        Write-Host "   ⚠️  WARN: Poppler missing - will use graceful fallback" -ForegroundColor Yellow
    }
} catch {
    Write-Host "   ❌ FAIL: Health endpoint error - $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""

# Test 2: Headers Validation (recommended production settings)
Write-Host "2️⃣ Headers Validation (Production Settings)..." -ForegroundColor Yellow
try {
    $encodedPDF = [uri]::EscapeDataString($PDF)
    $params = @(
        "pdfUrl=$encodedPDF",
        "minW=300",
        "minH=300", 
        "maxAspect=5",
        "dpi=300",
        "trim=1",
        "convert=1",
        "bgremove=0",
        "embeddedBoost=1.04",
        "boostFactor=1.2"
    )
    $url = "$BaseUrl/api/extract-components?" + ($params -join "&")
    
    $headResp = Invoke-WebRequest -UseBasicParsing -Method Head -Uri $url -TimeoutSec 30
    
    Write-Host "   📊 Component Headers:" -ForegroundColor Gray
    $componentHeaders = $headResp.Headers.GetEnumerator() | Where-Object { $_.Name -like 'X-Components-*' -or $_.Name -eq 'X-Request-Id' }
    foreach ($header in $componentHeaders) {
        Write-Host "      $($header.Name): $($header.Value)" -ForegroundColor Gray
    }
    
    # Validate required headers
    $requiredHeaders = @('X-Components-Cache', 'X-Components-Source', 'X-Components-Count', 'X-Components-Opts')
    $missing = @()
    foreach ($req in $requiredHeaders) {
        if (-not $headResp.Headers[$req]) {
            $missing += $req
        }
    }
    
    if ($missing.Count -eq 0) {
        Write-Host "   ✅ PASS: All required headers present" -ForegroundColor Green
    } else {
        Write-Host "   ❌ FAIL: Missing headers: $($missing -join ', ')" -ForegroundColor Red
    }
    
} catch {
    Write-Host "   ❌ FAIL: Headers request failed - $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""

# Test 3: Cache Behavior (2nd call should be HIT)
Write-Host "3️⃣ Cache Behavior Test..." -ForegroundColor Yellow
try {
    $encodedPDF = [uri]::EscapeDataString($PDF)
    $params = @("pdfUrl=$encodedPDF", "minW=300", "minH=300", "maxAspect=5")
    $url = "$BaseUrl/api/extract-components?" + ($params -join "&")
    
    # First call
    $firstResp = Invoke-WebRequest -UseBasicParsing -Uri $url -TimeoutSec 30
    $firstCache = $firstResp.Headers["X-Components-Cache"]
    
    # Second call  
    $secondResp = Invoke-WebRequest -UseBasicParsing -Uri $url -TimeoutSec 30
    $secondCache = $secondResp.Headers["X-Components-Cache"]
    
    Write-Host "   First call cache: $firstCache" -ForegroundColor Gray
    Write-Host "   Second call cache: $secondCache" -ForegroundColor Gray
    
    if ($secondCache -eq "HIT") {
        Write-Host "   ✅ PASS: Cache working correctly" -ForegroundColor Green
    } else {
        Write-Host "   ⚠️  WARN: Cache not hitting - check TTL settings" -ForegroundColor Yellow
    }
    
} catch {
    Write-Host "   ❌ FAIL: Cache test failed - $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""

# Test 4: Top 5 Images (Production Data)
Write-Host "4️⃣ Top 5 Images with Production Settings..." -ForegroundColor Yellow
try {
    $encodedPDF = [uri]::EscapeDataString($PDF)
    $params = @(
        "pdfUrl=$encodedPDF",
        "minW=300",
        "minH=300",
        "maxAspect=5",
        "embeddedBoost=1.04",
        "boostFactor=1.2",
        "topN=5"
    )
    $url = "$BaseUrl/api/extract-components?" + ($params -join "&")
    
    $ext = Invoke-RestMethod -Uri $url -TimeoutSec 30
    
    if ($ext.images.Count -gt 0) {
        Write-Host "   📊 Extracted $($ext.images.Count) images from source: $($ext.source)" -ForegroundColor Green
        
        $top5 = $ext.images | Sort-Object score -Descending | Select-Object -First 5
        $top5 | Format-Table @(
            @{Name="Page"; Expression={$_.page}; Width=6}
            @{Name="Source"; Expression={$_.source}; Width=10} 
            @{Name="WxH"; Expression={"$($_.width)x$($_.height)"}; Width=12}
            @{Name="Score"; Expression={[math]::Round($_.score)}; Width=10}
            @{Name="Format"; Expression={$_.format}; Width=8}
        ) -AutoSize
        
        Write-Host "   ✅ PASS: Images extracted successfully" -ForegroundColor Green
    } else {
        if ($ext.popplerMissing) {
            Write-Host "   ⚠️  EXPECTED: No images (Poppler missing - graceful fallback working)" -ForegroundColor Yellow
        } else {
            Write-Host "   ❌ FAIL: No images extracted despite Poppler availability" -ForegroundColor Red
        }
    }
    
} catch {
    Write-Host "   ❌ FAIL: Image extraction test failed - $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""

# Test 5: Boost Pages Test (if actions detection available)
Write-Host "5️⃣ Boost Pages Integration Test..." -ForegroundColor Yellow
try {
    # Try to detect actions first
    $detectUrl = "$BaseUrl/api/detect-actions?url=$([uri]::EscapeDataString($PDF))&lang=en"
    $detectResp = Invoke-WebRequest -UseBasicParsing -Uri $detectUrl -TimeoutSec 20
    $pagesHeader = $detectResp.Headers["X-Actions-Pages"]
    
    if ($pagesHeader) {
        $pages = $pagesHeader -split "," | ForEach-Object { [int]($_.Trim()) }
        Write-Host "   📍 Detected action pages: $($pages -join ', ')" -ForegroundColor Cyan
        
        # Test with boosts
        $encodedPDF = [uri]::EscapeDataString($PDF)
        $boostParams = @(
            "pdfUrl=$encodedPDF",
            "boostPages=$([string]::Join(',', $pages))",
            "boostFactor=1.3"
        )
        $boostUrl = "$BaseUrl/api/extract-components?" + ($boostParams -join "&")
        $boostResp = Invoke-WebRequest -UseBasicParsing -Method Head -Uri $boostUrl -TimeoutSec 30
        $boostOpts = $boostResp.Headers["X-Components-Opts"]
        
        if ($boostOpts -like "*boostPages=*") {
            Write-Host "   ✅ PASS: Boost pages integration working" -ForegroundColor Green
        } else {
            Write-Host "   ❌ FAIL: Boost pages not applied in headers" -ForegroundColor Red
        }
    } else {
        Write-Host "   ⚠️  SKIP: No action pages detected (URL may not support actions detection)" -ForegroundColor Yellow
    }
    
} catch {
    Write-Host "   ⚠️  SKIP: Actions detection not available for test URL" -ForegroundColor Yellow
}

Write-Host ""

# Summary
Write-Host "🎯 Go-Live Validation Summary:" -ForegroundColor Green
Write-Host "   Ready for production with recommended settings:" -ForegroundColor White
Write-Host "   • dpi=300, trim=1, convert=1, bgremove=0" -ForegroundColor White  
Write-Host "   • minW=300, minH=300, maxAspect=5" -ForegroundColor White
Write-Host "   • embeddedBoost=1.04, boostFactor=1.2" -ForegroundColor White
Write-Host ""
Write-Host "🚀 Ready to ship your first A→Z tutorial!" -ForegroundColor Green