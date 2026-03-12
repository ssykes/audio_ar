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
$LOCAL_PATH = "e:\vsCode\workspaces\audio_ar"

# Generate version number (YYYYMMDDHHMMSS format for cache-busting)
$VERSION = Get-Date -Format "yyyyMMddHHmmss"
Write-Host "Version: $VERSION" -ForegroundColor Cyan
Write-Host ""

# Update display versions in HTML (e.g., v2.4 → v2.5)
Write-Host "Updating display versions..." -ForegroundColor Yellow

$DISPLAY_VERSION_FILES = @(
    "single_sound_v2.html",
    "index.html",
    "auto_rotate.html",
    "map_placer.html"
)

foreach ($htmlFile in $DISPLAY_VERSION_FILES) {
    $filePath = Join-Path $LOCAL_PATH $htmlFile
    if (Test-Path $filePath) {
        $content = Get-Content $filePath -Raw
        
        # Match version in <span> tags like: v2.4</span>
        if ($content -match '<span[^>]*>v(\d+)\.(\d+)</span>') {
            $major = $matches[1]
            $minor = [int]$matches[2]
            $oldVersion = "v$major.$minor</span>"
            $newMinor = $minor + 1
            $newVersion = "v$major.$newMinor</span>"
            
            $content = $content -replace [regex]::Escape($oldVersion), $newVersion
            Set-Content $filePath $content -NoNewline
            Write-Host "  Updated: $htmlFile ($oldVersion → $newVersion)" -ForegroundColor Green
        }
    }
}

Write-Host ""

# Update HTML files with new version numbers (cache-busting)
Write-Host "Updating cache-busting version numbers..." -ForegroundColor Yellow

$HTML_FILES = @(
    "single_sound_v2.html",
    "index.html",
    "auto_rotate.html",
    "map_placer.html"
)

# Patterns to match existing versioned script tags
$JS_VERSION_PATTERN = "spatial_audio\.js\?v=[\d]+"
$DEBUG_LOGGER_PATTERN = "debug_logger\.js\?v=[\d]+"
$APP_VERSION_PATTERN = "spatial_audio_app\.js\?v=[\d]+"
$WAKE_LOCK_PATTERN = "wake_lock_helper\.js"
$MAP_PLACER_PATTERN = "map_placer\.js"

foreach ($htmlFile in $HTML_FILES) {
    $filePath = Join-Path $LOCAL_PATH $htmlFile
    if (Test-Path $filePath) {
        $content = Get-Content $filePath -Raw

        # Update spatial_audio.js version
        if ($content -match $JS_VERSION_PATTERN) {
            $content = $content -replace $JS_VERSION_PATTERN, "spatial_audio.js?v=$VERSION"
            Set-Content $filePath $content -NoNewline
            Write-Host "  Updated: $htmlFile (spatial_audio.js)" -ForegroundColor Green
        }

        # Update debug_logger.js version
        if ($content -match $DEBUG_LOGGER_PATTERN) {
            $content = $content -replace $DEBUG_LOGGER_PATTERN, "debug_logger.js?v=$VERSION"
            Set-Content $filePath $content -NoNewline
            Write-Host "  Updated: $htmlFile (debug_logger.js)" -ForegroundColor Green
        }

        # Update spatial_audio_app.js version (if present with query string)
        if ($content -match $APP_VERSION_PATTERN) {
            $content = $content -replace $APP_VERSION_PATTERN, "spatial_audio_app.js?v=$VERSION"
            Set-Content $filePath $content -NoNewline
            Write-Host "  Updated: $htmlFile (spatial_audio_app.js)" -ForegroundColor Green
        }

        # Update wake_lock_helper.js version
        if ($content -match $WAKE_LOCK_PATTERN) {
            $content = $content -replace $WAKE_LOCK_PATTERN, "wake_lock_helper.js?v=$VERSION"
            Set-Content $filePath $content -NoNewline
            Write-Host "  Updated: $htmlFile (wake_lock_helper.js)" -ForegroundColor Green
        }

        # Update map_placer.js version
        if ($content -match $MAP_PLACER_PATTERN) {
            $content = $content -replace $MAP_PLACER_PATTERN, "map_placer.js?v=$VERSION"
            Set-Content $filePath $content -NoNewline
            Write-Host "  Updated: $htmlFile (map_placer.js)" -ForegroundColor Green
        }
    }
}

Write-Host ""

# Files to deploy (core files without version - HTML files get updated inline)
$ALL_FILES = @(
    ".htaccess",
    "single_sound_v2.html",
    "spatial_audio_app.js",
    "debug_logger.js",
    "index.html",
    "auto_rotate.html",
    "offline.html",
    "spatial_audio.js",
    "service-worker.js",
    "manifest.json",
    "icon-192.svg",
    "icon-512.svg",
    "deploy.ps1",
    "map_placer.html",
    "map_placer.js",
    "wake_lock_helper.js"
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

# Deploy sound files if they exist
$soundsPath = Join-Path $LOCAL_PATH "sounds"
if (Test-Path $soundsPath) {
    $soundFiles = Get-ChildItem -Path $soundsPath -File -Include *.mp3,*.wav,*.m4a
    if ($soundFiles.Count -gt 0) {
        Write-Host "Uploading sound files..." -ForegroundColor Yellow
        foreach ($soundFile in $soundFiles) {
            $remoteSoundPath = "${SERVER_USER}@${SERVER_HOST}:${SERVER_PATH}/sounds/"
            Write-Host "   Uploading: sounds/$($soundFile.Name)" -NoNewline
            scp $soundFile.FullName $remoteSoundPath 2>$null
            if ($LASTEXITCODE -eq 0) {
                Write-Host " [OK]" -ForegroundColor Green
            } else {
                Write-Host " [FAILED]" -ForegroundColor Red
            }
        }
    } else {
        Write-Host "No sound files found in /sounds/ folder" -ForegroundColor Gray
    }
}

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
Write-Host "Cache-Requestionusting Version: $VERSION" -ForegroundColor Cyan
Write-Host "  (HTML files updated with new version numbers)" -ForegroundColor Gray
Write-Host ""
Write-Host "Test URLs (hard refresh to bypass browser cache):" -ForegroundColor Cyan
Write-Host "   Main App:    http://ssykes.net/audio_ar_app.html" -ForegroundColor White
Write-Host "   Test Page:   http://ssykes.net/index.html" -ForegroundColor White
Write-Host "   Rotate Test: http://ssykes.net/auto_rotate.html" -ForegroundColor White
Write-Host "   Single Sound: http://ssykes.net/single_sound_v2.html" -ForegroundColor White
Write-Host ""
Write-Host "Sound Files:" -ForegroundColor Cyan
Write-Host "   Upload MP3/WAV/M4A files to /sounds/ folder"
Write-Host "   Set USE_SAMPLES = true in audio_ar_app.html"
Write-Host ""
Write-Host "Git Status:" -ForegroundColor Cyan
Write-Host "  Version numbers in HTML files are NOT committed to Git" -ForegroundColor Gray
Write-Host "  (They're updated locally before each deploy)" -ForegroundColor Gray
Write-Host ""
Write-Host "Press Enter to close..." -NoNewline
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
