# A→Z Execution PowerShell Script
# Windows-friendly end-to-end test for tutorial generation pipeline

param(
    [string]$PDF = "https://arxiv.org/pdf/2106.14881.pdf",
    [string]$WEBSITE = "https://example.com",
    [string]$LANG = "fr",
    [string]$BaseUrl = "http://localhost:5001"
)

Write-Host "A-Z Tutorial Generation Pipeline Test" -ForegroundColor Green
Write-Host "PDF: $PDF" -ForegroundColor Cyan
Write-Host "Website: $WEBSITE" -ForegroundColor Cyan
Write-Host "Language: $LANG" -ForegroundColor Cyan
Write-Host ""

# Step 1: Detect Actions Pages
Write-Host "Step 1: Detecting Actions pages..." -ForegroundColor Yellow
try {
    $encodedWebsite = [uri]::EscapeDataString($WEBSITE)
    $detectUrl = "$BaseUrl/api/detect-actions?url=$encodedWebsite" + "&lang=$LANG"
    Write-Host "   Calling: $detectUrl" -ForegroundColor Gray
    
    $detResp = Invoke-WebRequest -UseBasicParsing -Uri $detectUrl -TimeoutSec 30
    $pagesHeader = $detResp.Headers["X-Actions-Pages"]
    $cacheHeader = $detResp.Headers["X-Actions-Cache"]
    
    $pages = @()
    if ($pagesHeader) { 
        $pages = $pagesHeader -split "," | ForEach-Object { [int]($_.Trim()) } 
    }
    
    Write-Host "   Detected pages: $($pages -join ', ')" -ForegroundColor Green
    Write-Host "   Cache status: $cacheHeader" -ForegroundColor Gray
} catch {
    Write-Host "   Actions detection failed: $($_.Exception.Message)" -ForegroundColor Red
    $pages = @()
}

Write-Host ""

# Step 2: Extract Components with Boosts
Write-Host "Step 2: Extracting components with page boosts..." -ForegroundColor Yellow

# Build query string with recommended defaults
$encodedPDF = [uri]::EscapeDataString($PDF)
$qs = "pdfUrl=$encodedPDF" + "&dpi=300&trim=1&convert=1&bgremove=0&minW=300&minH=300&maxAspect=5&embeddedBoost=1.04&boostFactor=1.2"

if ($pages.Count -gt 0) { 
    $qs = "$qs" + "&boostPages=$([string]::Join(',', $pages))" 
    Write-Host "   Applying boosts to pages: $($pages -join ', ')" -ForegroundColor Cyan
}

$extractUrl = "$BaseUrl/api/extract-components?$qs"
Write-Host "   Calling: $extractUrl" -ForegroundColor Gray

try {
    $extResp = Invoke-WebRequest -UseBasicParsing -Uri $extractUrl -TimeoutSec 60
    $ext = $extResp.Content | ConvertFrom-Json
    
    # Display extraction headers
    $headers = @{
        'Cache' = $extResp.Headers["X-Components-Cache"]
        'Source' = $extResp.Headers["X-Components-Source"] 
        'Count' = $extResp.Headers["X-Components-Count"]
        'Time' = $extResp.Headers["X-Components-Time"]
        'Opts' = $extResp.Headers["X-Components-Opts"]
    }
    
    Write-Host "   Extraction Headers:" -ForegroundColor Gray
    foreach ($key in $headers.Keys) {
        Write-Host "      $key : $($headers[$key])" -ForegroundColor Gray
    }
    
    if ($ext.popplerMissing) {
        Write-Host "   Poppler tools missing - PDF extraction disabled" -ForegroundColor Yellow
        Write-Host "   See TRACK_A_POPPLER_SETUP.md for installation" -ForegroundColor Yellow
    } else {
        Write-Host "   Extracted $($ext.images.Count) images from source: $($ext.source)" -ForegroundColor Green
    }
} catch {
    Write-Host "   Component extraction failed: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

Write-Host ""

# Step 3: Display Top 5 Images 
Write-Host "Step 3: Top 5 extracted images (by score):" -ForegroundColor Yellow

if ($ext.images.Count -gt 0) {
    $top5 = $ext.images | Sort-Object score -Descending | Select-Object -First 5
    
    $top5 | Format-Table @(
        @{Name="Page"; Expression={$_.page}; Width=6}
        @{Name="Source"; Expression={$_.source}; Width=10} 
        @{Name="WxH"; Expression={"$($_.width)x$($_.height)"}; Width=12}
        @{Name="Score"; Expression={$_.score}; Width=10}
        @{Name="Format"; Expression={$_.format}; Width=8}
        @{Name="URL"; Expression={$_.url}; Width=40}
    ) -AutoSize
    
    Write-Host "   Score distribution:" -ForegroundColor Gray
    $scoreStats = $ext.images | Measure-Object score -Maximum -Minimum -Average
    Write-Host "      Max: $([math]::Round($scoreStats.Maximum))" -ForegroundColor Gray
    Write-Host "      Min: $([math]::Round($scoreStats.Minimum))" -ForegroundColor Gray  
    Write-Host "      Avg: $([math]::Round($scoreStats.Average))" -ForegroundColor Gray
} else {
    Write-Host "   No images extracted" -ForegroundColor Yellow
}

Write-Host ""

# Step 4: Generate FFmpeg Concat File (Optional)
Write-Host "Step 4: Generating ffmpeg concat file..." -ForegroundColor Yellow

if ($ext.images.Count -gt 0) {
    $shots = $ext.images | Sort-Object score -Descending | Select-Object -First 8
    $concatLines = @()
    
    foreach ($shot in $shots) {
        if ($shot.path) {
            $concatLines += "file '$($shot.path)'"
            $concatLines += "duration 4"
        }
    }
    
    $concatContent = $concatLines -join "`n"
    $concatFile = ".\images_concat.txt"
    
    try {
        Set-Content -Path $concatFile -Value $concatContent -Encoding ascii
        Write-Host "   Generated: $concatFile ($($shots.Count) images, 4s each)" -ForegroundColor Green
        Write-Host "   To create video: ffmpeg -f concat -safe 0 -i $concatFile -vsync vfr -pix_fmt yuv420p -r 30 draft.mp4" -ForegroundColor Cyan
    } catch {
        Write-Host "   Failed to write concat file: $($_.Exception.Message)" -ForegroundColor Yellow
    }
} else {
    Write-Host "   No images available for video generation" -ForegroundColor Yellow
}

Write-Host ""

# Step 5: Validation Summary
Write-Host "Go/No-Go Validation Summary:" -ForegroundColor Green

$validation = @{
    'Actions Detection' = if ($pages.Count -gt 0) { "PASS: $($pages.Count) pages detected" } else { "WARN: No pages detected" }
    'Component Extraction' = if ($ext.images.Count -gt 0) { "PASS: $($ext.images.Count) images extracted" } else { "FAIL: No images" }
    'Cache Working' = if ($headers.Cache -eq 'HIT' -or $headers.Cache -eq 'STORE') { "PASS: $($headers.Cache)" } else { "WARN: Cache: $($headers.Cache)" }
    'Source Quality' = if ($headers.Source -ne 'none') { "PASS: $($headers.Source)" } else { "WARN: No source" }
    'Poppler Status' = if ($ext.popplerMissing) { "WARN: Missing (website-only mode)" } else { "PASS: Available" }
}

foreach ($key in $validation.Keys) {
    Write-Host "   $key : $($validation[$key])" -ForegroundColor White
}

Write-Host ""
Write-Host "A-Z Pipeline Test Complete!" -ForegroundColor Green

if ($ext.images.Count -gt 0) {
    Write-Host "Next Steps:" -ForegroundColor Cyan
    Write-Host "   1. Review top images for storyboard quality" -ForegroundColor White
    Write-Host "   2. Generate sections and narration text" -ForegroundColor White
    Write-Host "   3. Build YouTube chapters with buildChapters()" -ForegroundColor White
    Write-Host "   4. Assemble video with ffmpeg or video generation tool" -ForegroundColor White
} else {
    Write-Host "Action Required:" -ForegroundColor Yellow
    Write-Host "   - Install Poppler tools for PDF extraction" -ForegroundColor White
    Write-Host "   - Or verify PDF URL accessibility" -ForegroundColor White
}