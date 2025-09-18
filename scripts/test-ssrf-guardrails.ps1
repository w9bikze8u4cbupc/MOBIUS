# SSRF Guardrail Tests
Write-Host "Testing SSRF Guardrails..." -ForegroundColor Green

# Test cases
$testCases = @(
    @{ 
        url = "http://127.0.0.1/"; 
        expected = "Blocked"; 
        description = "Private/loopback IPv4"
    },
    @{ 
        url = "http://192.168.1.10/foo.pdf"; 
        expected = "Blocked"; 
        description = "Private network IPv4"
    },
    @{ 
        url = "http://169.254.169.254/latest/meta-data/"; 
        expected = "Blocked"; 
        description = "Link-local/metadata services"
    },
    @{ 
        url = "http://[::1]/"; 
        expected = "Blocked"; 
        description = "IPv6 loopback"
    },
    @{ 
        url = "https://example.com/file.pdf"; 
        expected = "Allowed"; 
        description = "Public domain (adjust allowlist/env)"
    }
)

$passed = 0
$total = $testCases.Count

foreach ($testCase in $testCases) {
    Write-Host "Testing: $($testCase.description) - $($testCase.url)" -ForegroundColor Yellow
    
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:5001/api/extract-components" -Method POST -Body (@{pdfUrl=$testCase.url} | ConvertTo-Json) -ContentType "application/json" -ErrorAction Stop
        if ($testCase.expected -eq "Blocked") {
            Write-Host "  FAIL: Expected block but got status $($response.StatusCode)" -ForegroundColor Red
        } else {
            Write-Host "  PASS: Request allowed as expected" -ForegroundColor Green
            $passed++
        }
    } catch {
        if ($testCase.expected -eq "Blocked") {
            # Check if it's a 400/403 error
            if ($_.Exception.Response.StatusCode -eq 400 -or $_.Exception.Response.StatusCode -eq 403) {
                Write-Host "  PASS: Request blocked with status $($_.Exception.Response.StatusCode) as expected" -ForegroundColor Green
                $passed++
            } else {
                Write-Host "  FAIL: Expected 400/403 but got $($_.Exception.Response.StatusCode)" -ForegroundColor Red
            }
        } else {
            Write-Host "  FAIL: Unexpected error - $($_.Exception.Message)" -ForegroundColor Red
        }
    }
}

Write-Host "`nSSRF Guardrail Test Results: $passed/$total tests passed" -ForegroundColor Cyan
if ($passed -eq $total) {
    Write-Host "All SSRF guardrail tests PASSED!" -ForegroundColor Green
} else {
    Write-Host "Some SSRF guardrail tests FAILED!" -ForegroundColor Red
}