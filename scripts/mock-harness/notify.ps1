# PowerShell notification service for MOBIUS

param(
    [string]$Message = "Default notification message",
    [string]$NotificationType = "info",
    [string]$OutputDir = "./notifications_out"
)

$ErrorActionPreference = "Stop"

Write-Host "=== MOBIUS Notification Service ===" -ForegroundColor Green

# Ensure output directory exists
if (-not (Test-Path $OutputDir)) {
    New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null
}

$Timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$NotificationFile = "$OutputDir\notification_$Timestamp.json"

Write-Host "📢 Sending notification: $NotificationType" -ForegroundColor Yellow
Write-Host "💬 Message: $Message" -ForegroundColor Cyan

# Create notification payload
$notification = @{
    timestamp = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
    type = $NotificationType
    message = $Message
    source = "mobius-deploy"
    environment = if ($env:ENVIRONMENT) { $env:ENVIRONMENT } else { "staging" }
    status = "sent"
} | ConvertTo-Json -Depth 3

$notification | Out-File -FilePath $NotificationFile -Encoding UTF8

# Mock notification sending (replace with real notification logic)
Write-Host "📡 Notification channels:" -ForegroundColor Yellow

# Mock Slack notification
Write-Host "  📱 Slack: #deployment-notifications" -ForegroundColor Cyan
Write-Host "    Status: sent (mock)" -ForegroundColor Green

# Mock email notification  
Write-Host "  📧 Email: ops@company.com" -ForegroundColor Cyan
Write-Host "    Status: sent (mock)" -ForegroundColor Green

# Mock webhook notification
Write-Host "  🔗 Webhook: https://api.company.com/notifications" -ForegroundColor Cyan
Write-Host "    Status: sent (mock)" -ForegroundColor Green

Write-Host "✅ Notification sent successfully" -ForegroundColor Green
Write-Host "📄 Notification logged: $NotificationFile" -ForegroundColor Cyan

# Output for other scripts
if ($env:GITHUB_OUTPUT) {
    "NOTIFICATION_FILE=$NotificationFile" | Out-File -FilePath $env:GITHUB_OUTPUT -Append -Encoding UTF8
}