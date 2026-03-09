# Deploy Audio AR App to Server
# Prerequisite: Run 'ssh-keygen -t ed25519' once manually if you don't have a key

Write-Host ""
Write-Host "========================================"
Write-Host "  Audio AR App - Deploy"
Write-Host "========================================"
Write-Host ""

# Configuration
$SERVER_USER = "ssykes"
$SERVER_HOST = "macminiwebsever"
$SERVER_PATH = "/var/www/html"
$LOCAL_PATH = "e:\vsCode\workspaces\wifi_midi_player"

# Files to deploy
$ALL_FILES = @(
    "audio_ar_app.html",
    "index.html",
    "auto_rotate.html",
    "offline.html",
    "spatial_audio.js",
    "service-worker.js",
    "manifest.json",
    "icon-192.svg",
    "icon-512.svg",
    "architecture.md",
    "OFFLINE_SETUP.md",
    "deploy.ps1"
)

Write-Host "Files to deploy: $($ALL_FILES.Count)" -ForegroundColor Yellow
Write-Host "Server: ${SERVER_USER}@${SERVER_HOST}:${SERVER_PATH}" -ForegroundColor Yellow
Write-Host ""
Write-Host "Note: If SSH asks for a password, this is normal for the first time." -ForegroundColor Gray
Write-Host "      After setup, future deploys won't require a password." -ForegroundColor Gray
Write-Host ""

# Upload files
$uploadedCount = 0
$failedCount = 0

foreach ($file in $ALL_FILES) {
    $localFile = Join-Path $LOCAL_PATH $file
    $remotePath = "${SERVER_USER}@${SERVER_HOST}:${SERVER_PATH}/${file}"
    
    if (Test-Path $localFile) {
        Write-Host "   Uploading: $file" -NoNewline
        
        # Upload with scp
        & scp $localFile $remotePath 2>$null
        
        if ($LASTEXITCODE -eq 0) {
            Write-Host " [OK]" -ForegroundColor Green
            $uploadedCount++
        } else {
            Write-Host " [FAILED]" -ForegroundColor Red
            $failedCount++
        }
    } else {
        Write-Host " [NOT FOUND]" -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "========================================"
Write-Host "  Summary"
Write-Host "========================================"
Write-Host ""
Write-Host "   Uploaded: $uploadedCount files" -ForegroundColor Green
Write-Host "   Failed:   $failedCount files" -ForegroundColor $(if ($failedCount -eq 0) { "Green" } else { "Red" })
Write-Host ""

if ($failedCount -eq 0) {
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "  Deploy Complete!" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green
} else {
    Write-Host "========================================" -ForegroundColor Yellow
    Write-Host "  Deploy Partially Complete" -ForegroundColor Yellow
    Write-Host "========================================" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Test URLs:" -ForegroundColor Cyan
Write-Host "   Main App:    http://ssykes.net/audio_ar_app.html"
Write-Host "   Test Page:   http://ssykes.net/index.html"
Write-Host "   Rotate Test: http://ssykes.net/auto_rotate.html"
Write-Host ""
Write-Host "Press Enter to close..." -NoNewline
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
