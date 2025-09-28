# PowerShell monitoring service for MOBIUS

param(
    [string]$Environment = "staging",
    [int]$MonitoringDuration = 300,  # 5 minutes default
    [int]$ErrorThreshold = 5,        # 5% error rate
    [int]$LatencyThreshold = 2000    # 2000ms latency threshold
)

$ErrorActionPreference = "Stop"

Write-Host "=== MOBIUS Monitoring Service ===" -ForegroundColor Blue

Write-Host "📊 Monitoring Configuration:" -ForegroundColor Yellow
Write-Host "  Environment: $Environment" -ForegroundColor Cyan
Write-Host "  Duration: ${MonitoringDuration}s" -ForegroundColor Cyan
Write-Host "  Error Threshold: ${ErrorThreshold}%" -ForegroundColor Cyan
Write-Host "  Latency Threshold: ${LatencyThreshold}ms" -ForegroundColor Cyan

$StartTime = Get-Date
$EndTime = $StartTime.AddSeconds($MonitoringDuration)

Write-Host "🔍 Starting adaptive monitoring..." -ForegroundColor Yellow

while ((Get-Date) -lt $EndTime) {
    $CurrentTime = Get-Date
    $Elapsed = [int]($CurrentTime - $StartTime).TotalSeconds
    $Remaining = [int]($EndTime - $CurrentTime).TotalSeconds
    
    Write-Host "⏱️  Monitor checkpoint: ${Elapsed}s elapsed, ${Remaining}s remaining" -ForegroundColor Gray
    
    # Mock metrics collection
    $ErrorRate = Get-Random -Minimum 0 -Maximum 10        # Random 0-9%
    $AvgLatency = Get-Random -Minimum 800 -Maximum 1200   # Random 800-1200ms
    $HealthStatus = Get-Random -Minimum 0 -Maximum 100     # 0-99, >95 = unhealthy
    
    Write-Host "📈 Current Metrics:" -ForegroundColor Cyan
    Write-Host "  🔴 Error Rate: ${ErrorRate}%" -ForegroundColor White
    Write-Host "  ⚡ Avg Latency: ${AvgLatency}ms" -ForegroundColor White
    Write-Host "  💚 Health Score: ${HealthStatus}/100" -ForegroundColor White
    
    # Check thresholds
    if ($ErrorRate -gt $ErrorThreshold) {
        Write-Host "🚨 ERROR THRESHOLD EXCEEDED: ${ErrorRate}% > ${ErrorThreshold}%" -ForegroundColor Red
        Write-Host "🔄 AUTO-ROLLBACK TRIGGERED" -ForegroundColor Red
        & ".\scripts\mock-harness\rollback.ps1" -RollbackTarget "previous" -Environment $Environment -DryRun "false"
        & ".\scripts\mock-harness\notify.ps1" -Message "AUTO-ROLLBACK: Error rate ${ErrorRate}% exceeded threshold" -NotificationType "critical"
        exit 1
    }
    
    if ($AvgLatency -gt $LatencyThreshold) {
        Write-Host "🚨 LATENCY THRESHOLD EXCEEDED: ${AvgLatency}ms > ${LatencyThreshold}ms" -ForegroundColor Red
        Write-Host "🔄 AUTO-ROLLBACK TRIGGERED" -ForegroundColor Red
        & ".\scripts\mock-harness\rollback.ps1" -RollbackTarget "previous" -Environment $Environment -DryRun "false"
        & ".\scripts\mock-harness\notify.ps1" -Message "AUTO-ROLLBACK: Latency ${AvgLatency}ms exceeded threshold" -NotificationType "critical"
        exit 1
    }
    
    if ($HealthStatus -lt 90) {
        Write-Host "⚠️  Health degradation detected: ${HealthStatus}/100" -ForegroundColor Yellow
    }
    
    Start-Sleep -Seconds 10  # Check every 10 seconds
}

Write-Host "✅ Monitoring completed successfully - no rollback needed" -ForegroundColor Green
Write-Host "📊 Final Status: System stable within thresholds" -ForegroundColor Cyan

# Send completion notification
& ".\scripts\mock-harness\notify.ps1" -Message "Monitoring completed: System stable for ${MonitoringDuration}s" -NotificationType "success"