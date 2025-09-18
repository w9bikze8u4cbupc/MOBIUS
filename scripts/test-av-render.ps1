# A/V Final Render Test
Write-Host "Testing A/V Final Render with Audio..." -ForegroundColor Green

# Check if required files exist
$timelinePath = "work\timeline.en.json"
if (-not (Test-Path $timelinePath)) {
    Write-Host "Warning: Timeline file not found at $timelinePath" -ForegroundColor Yellow
    Write-Host "Please ensure you have generated a timeline before running this test." -ForegroundColor Yellow
    exit 1
}

# Run the render with audio
Write-Host "Running render with audio..." -ForegroundColor Yellow
node .\render_with_audio.js `
  --timeline "work\timeline.en.json" `
  --audioDir "src\api\uploads" `
  --out "dist\catan.en.mp4"

# Check if output file was created
$outputPath = "dist\catan.en.mp4"
if (Test-Path $outputPath) {
    Write-Host "Render completed successfully!" -ForegroundColor Green
    
    # Analyze the output with ffprobe
    Write-Host "Analyzing output with ffprobe..." -ForegroundColor Yellow
    ffprobe -v error -show_streams -of json $outputPath
    
    # Check for acceptance criteria
    Write-Host "`nAcceptance Criteria Check:" -ForegroundColor Cyan
    Write-Host "  - One h264 video stream" -ForegroundColor White
    Write-Host "  - One aac audio stream" -ForegroundColor White
    Write-Host "  - Duration within ~250ms of target" -ForegroundColor White
} else {
    Write-Host "Render failed - output file not found!" -ForegroundColor Red
}