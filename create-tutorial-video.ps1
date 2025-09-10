# Draft Video Assembly Script
# Create tutorial video from extracted images with intro/outro

param(
    [string]$PDF = "https://arxiv.org/pdf/2106.14881.pdf",
    [string]$BaseUrl = "http://localhost:5001",
    [int]$ImageCount = 10,
    [int]$Duration = 4,
    [string]$IntroFile = "intro.mp4",
    [string]$OutroFile = "outro.mp4"
)

Write-Host "🎬 Tutorial Video Assembly" -ForegroundColor Green
Write-Host "PDF: $PDF" -ForegroundColor Cyan
Write-Host "Images: $ImageCount clips of ${Duration}s each" -ForegroundColor Cyan
Write-Host ""

# Step 1: Extract top images
Write-Host "📊 Extracting top $ImageCount images..." -ForegroundColor Yellow
try {
    $encodedPDF = [uri]::EscapeDataString($PDF)
    $url = "$BaseUrl/api/extract-components?pdfUrl=$encodedPDF&minW=300&minH=300&maxAspect=5&embeddedBoost=1.04&boostFactor=1.2&topN=$ImageCount"
    
    $ext = Invoke-RestMethod -Uri $url -TimeoutSec 60
    
    if ($ext.images.Count -gt 0) {
        $imgs = $ext.images | Sort-Object score -Descending | Select-Object -First $ImageCount
        Write-Host "   ✅ Got $($imgs.Count) images from source: $($ext.source)" -ForegroundColor Green
        
        # Display selected images
        Write-Host "   📋 Selected images:" -ForegroundColor Gray
        $imgs | ForEach-Object -Begin { $i = 1 } -Process { 
            Write-Host "      $i. Page $($_.page) | $($_.source) | Score: $([math]::Round($_.score))" -ForegroundColor Gray
            $i++
        }
    } else {
        Write-Host "   ❌ No images available for video" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "   ❌ Failed to extract images: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

Write-Host ""

# Step 2: Create images concat list
Write-Host "📝 Creating FFmpeg concat list..." -ForegroundColor Yellow
try {
    $lines = @()
    foreach ($img in $imgs) {
        if ($img.path) {
            $lines += "file '$($img.path)'"
            $lines += "duration $Duration"
        }
    }
    
    $imagesFile = ".\images.txt"
    Set-Content -Path $imagesFile -Value ($lines -join "`n") -Encoding ascii
    
    Write-Host "   ✅ Created $imagesFile with $($imgs.Count) images" -ForegroundColor Green
} catch {
    Write-Host "   ❌ Failed to create concat list: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# Step 3: Build main video (fit to 1080p with padding)
Write-Host "🎥 Building main tutorial video..." -ForegroundColor Yellow
try {
    $mainVideo = "main_tutorial.mp4"
    $ffmpegCmd = "ffmpeg -y -f concat -safe 0 -i $imagesFile -vf `"scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:black`" -r 30 -pix_fmt yuv420p $mainVideo"
    
    Write-Host "   🔄 Running: $ffmpegCmd" -ForegroundColor Gray
    Invoke-Expression $ffmpegCmd
    
    if (Test-Path $mainVideo) {
        $size = [math]::Round((Get-Item $mainVideo).Length / 1MB, 2)
        Write-Host "   ✅ Created $mainVideo (${size}MB)" -ForegroundColor Green
    } else {
        Write-Host "   ❌ Failed to create main video" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "   ❌ FFmpeg error: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

Write-Host ""

# Step 4: Assemble final video with intro/outro (if available)
Write-Host "🎬 Assembling final video..." -ForegroundColor Yellow

$finalVideo = "tutorial_final.mp4"
$hasIntro = Test-Path $IntroFile
$hasOutro = Test-Path $OutroFile

if ($hasIntro -or $hasOutro) {
    try {
        # Create final concat list
        $finalLines = @()
        if ($hasIntro) { 
            $finalLines += "file '$IntroFile'" 
            Write-Host "   📎 Adding intro: $IntroFile" -ForegroundColor Cyan
        }
        $finalLines += "file '$mainVideo'"
        if ($hasOutro) { 
            $finalLines += "file '$OutroFile'"
            Write-Host "   📎 Adding outro: $OutroFile" -ForegroundColor Cyan
        }
        
        $finalConcatFile = ".\final_concat.txt"
        Set-Content -Path $finalConcatFile -Value ($finalLines -join "`n") -Encoding ascii
        
        $finalCmd = "ffmpeg -y -f concat -safe 0 -i $finalConcatFile -c copy $finalVideo"
        Write-Host "   🔄 Running: $finalCmd" -ForegroundColor Gray
        Invoke-Expression $finalCmd
        
        if (Test-Path $finalVideo) {
            $finalSize = [math]::Round((Get-Item $finalVideo).Length / 1MB, 2)
            Write-Host "   ✅ Created $finalVideo (${finalSize}MB)" -ForegroundColor Green
        } else {
            Write-Host "   ❌ Failed to create final video" -ForegroundColor Red
        }
        
    } catch {
        Write-Host "   ❌ Final assembly error: $($_.Exception.Message)" -ForegroundColor Red
        # Fallback to main video
        Copy-Item $mainVideo $finalVideo
        Write-Host "   📁 Using main video as final output" -ForegroundColor Yellow
    }
} else {
    # No intro/outro, use main video as final
    Copy-Item $mainVideo $finalVideo
    Write-Host "   📁 No intro/outro found, using main video as final" -ForegroundColor Yellow
}

Write-Host ""

# Step 5: Generate YouTube chapters
Write-Host "📺 Generating YouTube chapters..." -ForegroundColor Yellow
try {
    $totalDuration = $imgs.Count * $Duration
    if ($hasIntro) { $totalDuration += 7 }  # Assume 7s intro
    if ($hasOutro) { $totalDuration += 7 }  # Assume 7s outro
    
    $chapters = @()
    $currentTime = 0
    
    if ($hasIntro) {
        $chapters += "0:00 Introduction"
        $currentTime = 7
    }
    
    # Generate chapters for main content
    $sectionsPerImage = [math]::Max(1, [math]::Floor($imgs.Count / 4))  # Roughly 4 main sections
    $sectionNames = @("Overview", "Setup", "Gameplay", "Strategy")
    
    for ($s = 0; $s -lt $sectionNames.Count; $s++) {
        if ($currentTime -lt $totalDuration) {
            $minutes = [math]::Floor($currentTime / 60)
            $seconds = $currentTime % 60
            $timeStamp = "${minutes}:$($seconds.ToString('00'))"
            $chapters += "$timeStamp $($sectionNames[$s])"
            $currentTime += $sectionsPerImage * $Duration
        }
    }
    
    $chaptersFile = ".\youtube_chapters.txt"
    Set-Content -Path $chaptersFile -Value ($chapters -join "`n") -Encoding utf8
    
    Write-Host "   ✅ Created $chaptersFile" -ForegroundColor Green
    Write-Host "   📋 Chapters preview:" -ForegroundColor Gray
    $chapters | ForEach-Object { Write-Host "      $_" -ForegroundColor Gray }
    
} catch {
    Write-Host "   ⚠️  Chapter generation failed: $($_.Exception.Message)" -ForegroundColor Yellow
}

Write-Host ""

# Summary
Write-Host "🎯 Video Assembly Complete!" -ForegroundColor Green
Write-Host "Files created:" -ForegroundColor White
if (Test-Path $finalVideo) { Write-Host "   🎥 $finalVideo (final tutorial)" -ForegroundColor Green }
if (Test-Path $mainVideo) { Write-Host "   📹 $mainVideo (main content)" -ForegroundColor White }
if (Test-Path $imagesFile) { Write-Host "   📝 $imagesFile (image list)" -ForegroundColor White }
if (Test-Path $chaptersFile) { Write-Host "   📺 $chaptersFile (YouTube chapters)" -ForegroundColor White }

Write-Host ""
Write-Host "🚀 Next steps:" -ForegroundColor Cyan
Write-Host "   1. Review the generated video" -ForegroundColor White
Write-Host "   2. Copy chapters to YouTube description" -ForegroundColor White  
Write-Host "   3. Upload and publish your tutorial!" -ForegroundColor White

# Cleanup
Write-Host ""
Write-Host "🧹 Cleanup temporary files? (y/n)" -ForegroundColor Yellow
$cleanup = Read-Host
if ($cleanup -eq 'y' -or $cleanup -eq 'Y') {
    @($imagesFile, $mainVideo, "final_concat.txt") | ForEach-Object {
        if (Test-Path $_) { 
            Remove-Item $_ -Force
            Write-Host "   🗑️  Removed $_" -ForegroundColor Gray
        }
    }
}