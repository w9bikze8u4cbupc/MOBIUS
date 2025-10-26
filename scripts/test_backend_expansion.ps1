# Test script for expanded backend validation
Write-Host "Testing expanded backend functionality..." -ForegroundColor Green

# Test PDF upload with embedded images
Write-Host "Testing PDF upload with embedded images..." -ForegroundColor Yellow
try {
    # Create a simple test PDF (in a real test, we would use an actual PDF with images)
    $testPdfPath = "data\test_rulebook.pdf"
    
    # For now, we'll create a simple text file as a placeholder
    "Test PDF content for validation" | Out-File -FilePath $testPdfPath -Encoding UTF8
    
    # Upload the PDF
    $response = Invoke-RestMethod -Uri "http://localhost:5001/api/ingest" -Method Post -Form @{
        file = Get-Item $testPdfPath
    }
    
    Write-Host "PDF upload test: Success" -ForegroundColor Green
    Write-Host "Project ID: $($response.projectId)" -ForegroundColor Cyan
    Write-Host "Pages processed: $($response.pages)" -ForegroundColor Cyan
    Write-Host "Images extracted: $($response.images)" -ForegroundColor Cyan
    
    # Clean up test file
    Remove-Item $testPdfPath -Force
}
catch {
    Write-Host "PDF upload test failed: $($_.Exception.Message)" -ForegroundColor Red
}

# Test BGG metadata fetch
Write-Host "Testing BGG metadata fetch..." -ForegroundColor Yellow
try {
    # Test with a known game (Catan)
    $body = @{
        bggIdOrUrl = "13"
    } | ConvertTo-Json

    $response = Invoke-RestMethod -Uri "http://localhost:5001/api/bgg" -Method Post -Body $body -ContentType "application/json"
    
    if ($response.success) {
        Write-Host "BGG metadata fetch test: Success" -ForegroundColor Green
        Write-Host "Game name: $($response.metadata.name)" -ForegroundColor Cyan
        Write-Host "Year published: $($response.metadata.yearPublished)" -ForegroundColor Cyan
    } else {
        Write-Host "BGG metadata fetch test failed: $($response.error)" -ForegroundColor Red
    }
}
catch {
    Write-Host "BGG metadata fetch test failed: $($_.Exception.Message)" -ForegroundColor Red
}

# Test preview generation
Write-Host "Testing preview generation..." -ForegroundColor Yellow
try {
    $body = @{
        chapterId = "test-chapter-1"
        chapters = @(
            @{
                id = "test-chapter-1"
                title = "Test Chapter"
                steps = @(
                    @{ id = "step-1"; text = "First step" },
                    @{ id = "step-2"; text = "Second step" }
                )
            }
        )
    } | ConvertTo-Json

    $response = Invoke-RestMethod -Uri "http://localhost:5001/preview/preview" -Method Post -Body $body -ContentType "application/json"
    
    Write-Host "Preview generation test: Success" -ForegroundColor Green
    Write-Host "Preview ID: $($response.previewId)" -ForegroundColor Cyan
    Write-Host "Estimated duration: $($response.estimatedDuration) seconds" -ForegroundColor Cyan
}
catch {
    Write-Host "Preview generation test failed: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "Expanded backend testing completed." -ForegroundColor Green