# Purge Cloudflare Cache
# Quick script to purge Cloudflare cache for specific files or everything
#
# Usage:
#   .\purge-cloudflare-cache.ps1              # Purge everything
#   .\purge-cloudflare-cache.ps1 -File file.js  # Purge specific file
#
# Requires: Cloudflare API Token (set in script below)

param(
    [string]$File  # Optional: specific file to purge (e.g., "map_player.js")
)

# Configuration - Get your API token from Cloudflare Dashboard
# Dashboard → Profile → API Tokens → Create Token (use "Edit Cloudflare Apps" template)
$CLOUDFLARE_API_TOKEN = "YOUR_API_TOKEN_HERE"
$ZONE_ID = "YOUR_ZONE_ID_HERE"  # Find in Cloudflare Dashboard → Overview

# Check if configuration is set
if ($CLOUDFLARE_API_TOKEN -eq "YOUR_API_TOKEN_HERE" -or $ZONE_ID -eq "YOUR_ZONE_ID_HERE") {
    Write-Host ""
    Write-Host "❌ Cloudflare API not configured!" -ForegroundColor Red
    Write-Host ""
    Write-Host "To configure:" -ForegroundColor Yellow
    Write-Host "1. Get your API token:" -ForegroundColor White
    Write-Host "   https://dash.cloudflare.com/profile/api-tokens" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "2. Create token with 'Edit Cloudflare Apps' permissions" -ForegroundColor White
    Write-Host ""
    Write-Host "3. Find your Zone ID:" -ForegroundColor White
    Write-Host "   https://dash.cloudflare.com/ → Select domain → Overview" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "4. Update this script with your API token and Zone ID" -ForegroundColor White
    Write-Host ""
    exit 1
}

# Headers for API requests
$HEADERS = @{
    "Authorization" = "Bearer $CLOUDFLARE_API_TOKEN"
    "Content-Type" = "application/json"
}

# Purge specific file
if ($File) {
    Write-Host "Purging Cloudflare cache for: $File" -ForegroundColor Cyan
    
    $url = "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/purge_cache"
    $body = @{
        files = @("https://ssykes.net/$File")
    } | ConvertTo-Json
    
    try {
        $response = Invoke-RestMethod -Uri $url -Method Post -Headers $HEADERS -Body $body
        
        if ($response.success) {
            Write-Host "✓ Cache purged successfully!" -ForegroundColor Green
            Write-Host "  File: $File" -ForegroundColor Gray
            Write-Host "  Wait ~30 seconds for changes to propagate" -ForegroundColor Yellow
        } else {
            Write-Host "❌ Purge failed!" -ForegroundColor Red
            Write-Host $response | ConvertTo-Json
        }
    } catch {
        Write-Host "❌ Error: $($_.Exception.Message)" -ForegroundColor Red
    }
} else {
    # Purge everything
    Write-Host "Purging ALL Cloudflare cache..." -ForegroundColor Cyan
    Write-Host "This will take ~30 seconds to propagate" -ForegroundColor Yellow
    
    $url = "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/purge_cache"
    $body = @{
        purge_everything = $true
    } | ConvertTo-Json
    
    try {
        $response = Invoke-RestMethod -Uri $url -Method Post -Headers $HEADERS -Body $body
        
        if ($response.success) {
            Write-Host "✓ All cache purged successfully!" -ForegroundColor Green
            Write-Host "  Wait ~30 seconds for changes to propagate" -ForegroundColor Yellow
            Write-Host ""
            Write-Host "Test URLs (hard refresh after 30s):" -ForegroundColor Cyan
            Write-Host "  https://ssykes.net/" -ForegroundColor White
            Write-Host "  https://ssykes.net/map_player.html" -ForegroundColor White
            Write-Host "  https://ssykes.net/map_editor.html" -ForegroundColor White
        } else {
            Write-Host "❌ Purge failed!" -ForegroundColor Red
            Write-Host $response | ConvertTo-Json
        }
    } catch {
        Write-Host "❌ Error: $($_.Exception.Message)" -ForegroundColor Red
    }
}

Write-Host ""
