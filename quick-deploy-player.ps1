# Quick deploy for map_player.html only (no API server restart)
$VERSION = (Get-Date -Format "yyyyMMddHHmmss")

Write-Host "========================================"
Write-Host "  Quick Deploy: map_player.html"
Write-Host "========================================"
Write-Host ""
Write-Host "Version: $VERSION"
Write-Host ""

# Update version in HTML
$HTML_FILE = "map_player.html"
$OLD_VERSION_PATTERN = 'map_player\.js\?v=\d+'
$NEW_VERSION = "map_player.js?v=$VERSION"

Write-Host "Updating cache-busting version..."
$content = Get-Content $HTML_FILE -Raw
$content = $content -replace $OLD_VERSION_PATTERN, $NEW_VERSION
Set-Content $HTML_FILE $content -NoNewline
Write-Host "  Updated: $HTML_FILE ($NEW_VERSION)"
Write-Host ""

# Upload via SCP
Write-Host "Uploading to server..."
scp $HTML_FILE ssykes@macminiwebsever:/var/www/html/$HTML_FILE

if ($LASTEXITCODE -eq 0) {
    Write-Host "  ✅ Upload successful!"
    Write-Host ""
    Write-Host "Test URL: https://ssykes.net/map_player.html?t=$VERSION"
} else {
    Write-Host "  ❌ Upload failed"
}

Write-Host ""
Write-Host "Press Enter to close..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
