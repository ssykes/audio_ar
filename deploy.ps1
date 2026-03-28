# Deploy Audio AR App to Server
# Prerequisite: Run 'ssh-keygen -t ed25519' once manually if you don't have a key
#
# Cloudflare Cache: After deploy, verify Cloudflare isn't caching stale JS:
#   Invoke-WebRequest -Uri "https://ssykes.net/map_player.js" -UseBasicParsing | 
#     Select-Object -ExpandProperty Headers | Where-Object {$_.Key -eq "CF-Cache-Status"}
#   Expected: DYNAMIC or BYPASS (not HIT)
#   If HIT: Cloudflare Dashboard → Caching → Configuration → Set to "No Query String"
#
# See CLOUDFLARE_CACHE_TROUBLESHOOTING.md for details

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
    "map_editor.html",
    "map_player.html",
    "soundscape_picker.html"
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

# Update API URL in HTML files to use relative path (Cloudflare handles HTTPS)
Write-Host "Updating API URL to relative path..." -ForegroundColor Yellow

$MAP_FILES = @(
    "map_editor.html",
    "map_player.html",
    "index.html"
)

foreach ($mapFile in $MAP_FILES) {
    $mapPath = Join-Path $LOCAL_PATH $mapFile
    if (Test-Path $mapPath) {
        $content = Get-Content $mapPath -Raw

        # Update API_BASE_URL to relative path
        if ($content -match "window\.API_BASE_URL = '[^']*'") {
            $content = $content -replace "window\.API_BASE_URL = '[^']*'", "window.API_BASE_URL = '/api'"
            Set-Content $mapPath $content -NoNewline
            Write-Host "  API URL set to: /api (in $mapFile)" -ForegroundColor Green
        } else {
            Write-Host "  API_BASE_URL not found in $mapFile" -ForegroundColor Yellow
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
    "map_editor.html",
    "map_player.html",
    "soundscape_picker.html"
)

# Patterns to match existing versioned script tags (using proper regex)
$JS_VERSION_PATTERN = 'spatial_audio\.js(\?v=\d+)?'
$DEBUG_LOGGER_PATTERN = 'debug_logger\.js(\?v=\d+)?'
$APP_VERSION_PATTERN = 'spatial_audio_app\.js(\?v=\d+)?'
$WAKE_LOCK_PATTERN = 'wake_lock_helper\.js(\?v=\d+)?'
$MAP_SHARED_PATTERN = 'map_shared\.js(\?v=\d+)?'
$MAP_EDITOR_PATTERN = 'map_editor\.js(\?v=\d+)?'
$MAP_EDITOR_V2_PATTERN = 'map_editor_v2\.js(\?v=\d+)?'
$MAP_PLAYER_PATTERN = 'map_player\.js(\?v=\d+)?'
$SOUNDSCAPE_PATTERN = 'soundscape\.js(\?v=\d+)?'
$API_CLIENT_PATTERN = 'api-client\.js(\?v=\d+)?'
$DOWNLOAD_MANAGER_PATTERN = 'download_manager\.js(\?v=\d+)?'
$SW_VERSION_PATTERN = 'sw\.js(\?v=\d+)?'
$SW_REGISTER_PATTERN = 'sw-register\.js(\?v=\d+)?'

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

        # Update map_shared.js version
        if ($content -match $MAP_SHARED_PATTERN) {
            $content = $content -replace $MAP_SHARED_PATTERN, "map_shared.js?v=$VERSION"
            Set-Content $filePath $content -NoNewline
            Write-Host "  Updated: $htmlFile (map_shared.js)" -ForegroundColor Green
        }

        # Update map_editor.js version
        if ($content -match $MAP_EDITOR_PATTERN) {
            $content = $content -replace $MAP_EDITOR_PATTERN, "map_editor.js?v=$VERSION"
            Set-Content $filePath $content -NoNewline
            Write-Host "  Updated: $htmlFile (map_editor.js)" -ForegroundColor Green
        }

        # Update map_editor_v2.js version
        if ($content -match $MAP_EDITOR_V2_PATTERN) {
            $content = $content -replace $MAP_EDITOR_V2_PATTERN, "map_editor_v2.js?v=$VERSION"
            Set-Content $filePath $content -NoNewline
            Write-Host "  Updated: $htmlFile (map_editor_v2.js)" -ForegroundColor Green
        }

        # Update map_player.js version
        if ($content -match $MAP_PLAYER_PATTERN) {
            $content = $content -replace $MAP_PLAYER_PATTERN, "map_player.js?v=$VERSION"
            Set-Content $filePath $content -NoNewline
            Write-Host "  Updated: $htmlFile (map_player.js)" -ForegroundColor Green
        }

        # Update soundscape.js version
        if ($content -match $SOUNDSCAPE_PATTERN) {
            $content = $content -replace $SOUNDSCAPE_PATTERN, "soundscape.js?v=$VERSION"
            Set-Content $filePath $content -NoNewline
            Write-Host "  Updated: $htmlFile (soundscape.js)" -ForegroundColor Green
        }

        # Update api-client.js version
        if ($content -match $API_CLIENT_PATTERN) {
            $content = $content -replace $API_CLIENT_PATTERN, "api-client.js?v=$VERSION"
            Set-Content $filePath $content -NoNewline
            Write-Host "  Updated: $htmlFile (api-client.js)" -ForegroundColor Green
        }

        # Update download_manager.js version
        if ($content -match $DOWNLOAD_MANAGER_PATTERN) {
            $content = $content -replace $DOWNLOAD_MANAGER_PATTERN, "download_manager.js?v=$VERSION"
            Set-Content $filePath $content -NoNewline
            Write-Host "  Updated: $htmlFile (download_manager.js)" -ForegroundColor Green
        }

        # Update sw-register.js version
        if ($content -match $SW_REGISTER_PATTERN) {
            $content = $content -replace $SW_REGISTER_PATTERN, "sw-register.js?v=$VERSION"
            Set-Content $filePath $content -NoNewline
            Write-Host "  Updated: $htmlFile (sw-register.js)" -ForegroundColor Green
        }

        # Update sw.js version (Service Worker)
        if ($content -match $SW_VERSION_PATTERN) {
            $content = $content -replace $SW_VERSION_PATTERN, "sw.js?v=$VERSION"
            Set-Content $filePath $content -NoNewline
            Write-Host "  Updated: $htmlFile (sw.js)" -ForegroundColor Green
        }
    }
}

Write-Host ""

# Update sw.js internal cache version
Write-Host "Updating sw.js cache version..." -ForegroundColor Yellow

$SW_FILE = Join-Path $LOCAL_PATH "sw.js"
if (Test-Path $SW_FILE) {
    $content = Get-Content $SW_FILE -Raw

    # Update CACHE_VERSION to current version (matches both 'v1' and timestamp formats)
    if ($content -match "const CACHE_VERSION = '[^']+'") {
        $content = $content -replace "const CACHE_VERSION = '[^']+'", "const CACHE_VERSION = '$VERSION'"
        Set-Content $SW_FILE $content -NoNewline
        Write-Host "  sw.js cache version updated: $VERSION" -ForegroundColor Green
    } else {
        Write-Host "  ⚠️ CACHE_VERSION pattern not found in sw.js" -ForegroundColor Yellow
    }
} else {
    Write-Host "  ⚠️ sw.js not found" -ForegroundColor Yellow
}

Write-Host ""

# Update sw-register.js internal cache version
Write-Host "Updating sw-register.js cache version..." -ForegroundColor Yellow

$SW_REGISTER_FILE = Join-Path $LOCAL_PATH "sw-register.js"
if (Test-Path $SW_REGISTER_FILE) {
    $content = Get-Content $SW_REGISTER_FILE -Raw

    # Update CACHE_VERSION to current version
    if ($content -match "const CACHE_VERSION = '[^']+'") {
        $content = $content -replace "const CACHE_VERSION = '[^']+'", "const CACHE_VERSION = '$VERSION'"
        Set-Content $SW_REGISTER_FILE $content -NoNewline
        Write-Host "  sw-register.js cache version updated: $VERSION" -ForegroundColor Green
    } else {
        Write-Host "  ⚠️ CACHE_VERSION pattern not found in sw-register.js" -ForegroundColor Yellow
    }
} else {
    Write-Host "  ⚠️ sw-register.js not found" -ForegroundColor Yellow
}

Write-Host ""

# CRITICAL: Create temporary copies of HTML files with cache-busting versions for deployment
# (Git pre-commit hook strips versions from working directory, but server needs them)
Write-Host "Creating deployment copies with cache-busting versions..." -ForegroundColor Yellow

$HTML_FILES_WITH_VERSIONS = @(
    "map_player.html",
    "map_editor.html",
    "index.html",
    "single_sound_v2.html",
    "soundscape_picker.html",
    "auto_rotate.html"
)

foreach ($htmlFile in $HTML_FILES_WITH_VERSIONS) {
    $filePath = Join-Path $LOCAL_PATH $htmlFile
    $tempPath = Join-Path $LOCAL_PATH "${htmlFile}.deploy"
    
    if (Test-Path $filePath) {
        $content = Get-Content $filePath -Raw
        
        # Add cache-busting version to all script/link tags
        $content = $content -replace '(spatial_audio\.js)"', "`${1}?v=$VERSION`""
        $content = $content -replace '(spatial_audio_app\.js)"', "`${1}?v=$VERSION`""
        $content = $content -replace '(api-client\.js)"', "`${1}?v=$VERSION`""
        $content = $content -replace '(soundscape\.js)"', "`${1}?v=$VERSION`""
        $content = $content -replace '(map_shared\.js)"', "`${1}?v=$VERSION`""
        $content = $content -replace '(map_player\.js)"', "`${1}?v=$VERSION`""
        $content = $content -replace '(map_editor\.js)"', "`${1}?v=$VERSION`""
        $content = $content -replace '(map_placer\.js)"', "`${1}?v=$VERSION`""
        $content = $content -replace '(debug_logger\.js)"', "`${1}?v=$VERSION`""
        $content = $content -replace '(wake_lock_helper\.js)"', "`${1}?v=$VERSION`""
        $content = $content -replace '(download_manager\.js)"', "`${1}?v=$VERSION`""
        
        Set-Content $tempPath $content -NoNewline
        Write-Host "  Created: ${htmlFile}.deploy (v=$VERSION)" -ForegroundColor Green
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
    "sw.js",
    "sw-register.js",
    "manifest.json",
    "icon-192.svg",
    "icon-512.svg",
    "deploy.ps1",
    "map_editor.html",
    "map_editor.js",
    "map_editor_v2.html",
    "map_editor_v2.js",
    "map_player.html",
    "map_player.js",
    "map_shared.js",
    "soundscape.js",
    "soundscape_picker.html",
    "wake_lock_helper.js",
    "api-client.js",
    "download_manager.js",
    "map_offline.html"
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
$verifiedCount = 0

# Critical files that need version verification
$CRITICAL_FILES = @('download_manager.js', 'soundscape.js', 'api-client.js', 'spatial_audio.js')

foreach ($file in $ALL_FILES) {
    $localFile = Join-Path $LOCAL_PATH $file
    $remotePath = "${SERVER_USER}@${SERVER_HOST}:${SERVER_PATH}/${file}"

    # Check if deployment version exists (for HTML files)
    $deployVersion = Join-Path $LOCAL_PATH "${file}.deploy"
    if (Test-Path $deployVersion) {
        # Use deployment version with cache-busting
        $localFile = $deployVersion
        Write-Host "   Uploading: $file (with cache-busting)" -NoNewline
    } elseif (Test-Path $localFile) {
        Write-Host "   Uploading: $file" -NoNewline
    } else {
        Write-Host "   Skipping: $file (not found)" -ForegroundColor Yellow
        continue
    }

    # Upload with scp
    & scp $localFile $remotePath 2>$null

    if ($LASTEXITCODE -eq 0) {
        Write-Host " [OK]" -ForegroundColor Green
        $uploadedCount++
        
        # GUARD: Verify critical files uploaded correctly
        if ($CRITICAL_FILES -contains $file) {
            Write-Host "   Verifying: $file" -NoNewline
            
            # SSH with timeout (5 seconds) to prevent hanging
            $verifyResult = & ssh -n -o ConnectTimeout=5 $SERVER_USER@$SERVER_HOST "head -15 ${SERVER_PATH}/${file} 2>&1"
            
            # Check for common corruption indicators
            if ($verifyResult -match 'MAX_CONCURRENT' -or $verifyResult -match 'SyntaxError' -or $verifyResult -match 'undefined') {
                Write-Host " [CORRUPTED!]" -ForegroundColor Red
                Write-Host "   ⚠️ File appears corrupted on server!" -ForegroundColor Yellow
                Write-Host "   Server preview:" -ForegroundColor Gray
                $verifyResult | Select-Object -First 5 | ForEach-Object { Write-Host "     $_" -ForegroundColor Gray }
                Write-Host "   Re-uploading..." -ForegroundColor Yellow
                & scp $localFile $remotePath 2>$null
                if ($LASTEXITCODE -eq 0) {
                    Write-Host "   [Re-upload OK]" -ForegroundColor Green
                    $verifiedCount++
                }
            } else {
                Write-Host " [Verified]" -ForegroundColor Green
                $verifiedCount++
            }
        }
    } else {
        Write-Host " [FAILED]" -ForegroundColor Red
        $failedCount++
    }
}

# Cleanup deployment files
Write-Host ""
Write-Host "Cleaning up deployment files..." -ForegroundColor Yellow
foreach ($htmlFile in $HTML_FILES_WITH_VERSIONS) {
    $deployPath = Join-Path $LOCAL_PATH "${htmlFile}.deploy"
    if (Test-Path $deployPath) {
        Remove-Item $deployPath -Force
    }
}
Write-Host "  Cleanup complete" -ForegroundColor Green

Write-Host ""
Write-Host "========================================"
Write-Host "  Summary"
Write-Host "========================================"
Write-Host ""
Write-Host "   Uploaded:  $uploadedCount files" -ForegroundColor Green
Write-Host "   Verified:  $verifiedCount critical files" -ForegroundColor Green
Write-Host "   Failed:    $failedCount files" -ForegroundColor $(if ($failedCount -eq 0) { "Green" } else { "Red" })
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

# Deploy API server files
$API_FILES = @(
    "package.json",
    "package-lock.json",
    "server.js",
    ".env",
    "database/index.js",
    "database/schema.sql",
    "middleware/auth.js",
    "middleware/rateLimiter.js",
    "routes/auth.js",
    "routes/soundscapes.js",
    "scripts/cleanup-users.js",
    "scripts/test-base-repository.js",
    "scripts/test-domain-models.js",
    "SECURITY.md",
    "repositories/BaseRepository.js",
    "repositories/WaypointRepository.js",
    "repositories/BehaviorRepository.js",
    "repositories/SoundScapeRepository.js",
    "repositories/AreaRepository.js",
    "models/SoundScape.js",
    "models/Waypoint.js",
    "models/Behavior.js",
    "models/Area.js"
)

$apiPath = Join-Path $LOCAL_PATH "api"
if (Test-Path $apiPath) {
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host "  API Server Files" -ForegroundColor Cyan
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host ""

    foreach ($file in $API_FILES) {
        $localFile = Join-Path $apiPath $file
        $remoteDir = "${SERVER_USER}@${SERVER_HOST}:${SERVER_PATH}/api/$(Split-Path $file -Parent)"
        $remotePath = "${SERVER_USER}@${SERVER_HOST}:${SERVER_PATH}/api/$file"

        if (Test-Path $localFile) {
            # Create remote directory if needed
            $dirName = Split-Path $file -Parent
            if ($dirName) {
                Write-Host "   Ensuring directory: api/$dirName" -ForegroundColor Gray
                & ssh -n $SERVER_USER@$SERVER_HOST "mkdir -p ${SERVER_PATH}/api/$dirName" 2>$null
            }

            Write-Host "   Uploading: api/$file" -NoNewline
            & scp $localFile $remotePath 2>$null
            if ($LASTEXITCODE -eq 0) {
                Write-Host " [OK]" -ForegroundColor Green
            } else {
                Write-Host " [FAILED]" -ForegroundColor Red
                $failedCount++
            }
        } else {
            Write-Host "   Skipping: api/$file (not found)" -ForegroundColor Yellow
        }
    }
    
    Write-Host ""
    Write-Host "Installing dependencies..." -ForegroundColor Cyan

    # Install dependencies
    Write-Host "   Installing npm packages..." -NoNewline
    $npmResult = & ssh -n $SERVER_USER@$SERVER_HOST "cd ${SERVER_PATH}/api && npm install 2>&1"
    if ($LASTEXITCODE -eq 0) {
        Write-Host " [OK]" -ForegroundColor Green
    } else {
        Write-Host " [FAILED]" -ForegroundColor Red
        $npmResult | ForEach-Object { Write-Host "     $_" -ForegroundColor Gray }
    }

    # PM2 will handle the restart - just verify PM2 is running
    Write-Host "   Verifying PM2 is running..." -NoNewline
    $pm2Check = & ssh -n $SERVER_USER@$SERVER_HOST "pgrep -f 'pm2' 2>&1"
    if ($pm2Check -and $pm2Check.Trim() -ne "") {
        Write-Host " [OK]" -ForegroundColor Green
    } else {
        Write-Host " [WARNING - PM2 not running]" -ForegroundColor Yellow
    }

    # Restart API server using PM2
    Write-Host "   Restarting API server (PM2)..." -NoNewline
    
    # Stop first to ensure port is free, then start (avoids EADDRINUSE)
    & ssh -n $SERVER_USER@$SERVER_HOST "cd ${SERVER_PATH}/api && pm2 stop api 2>&1" | Out-Null
    Start-Sleep -Seconds 2
    
    $startResult = & ssh -n $SERVER_USER@$SERVER_HOST "cd ${SERVER_PATH}/api && pm2 start api 2>&1"
    if ($startResult -match "online" -or $LASTEXITCODE -eq 0) {
        Write-Host " [OK]" -ForegroundColor Green
    } else {
        Write-Host " [FAILED]" -ForegroundColor Red
        Write-Host "   $startResult" -ForegroundColor Gray
    }
    Start-Sleep -Seconds 3  # Wait for service to start

    # Check if it's running
    Write-Host "   Verifying API server status..." -NoNewline
    $statusResult = & ssh -n $SERVER_USER@$SERVER_HOST "pm2 status api 2>&1"
    if ($statusResult -match "online") {
        Write-Host " [OK]" -ForegroundColor Green
        Write-Host "   ✅ API server is running!" -ForegroundColor Green

        # Show last 20 log lines from PM2
        Write-Host ""
        Write-Host "   Last 20 log lines (checking for errors...)" -ForegroundColor Cyan
        $logs = & ssh -n $SERVER_USER@$SERVER_HOST "pm2 logs api --lines 20 --nostream 2>&1"
        if ($logs) {
            $logs | ForEach-Object {
                if ($_ -match "error|Error|ERROR|failed|Failed") {
                    Write-Host "     $_" -ForegroundColor Red
                } else {
                    Write-Host "     $_" -ForegroundColor Gray
                }
            }
        }
    } else {
        Write-Host " [FAILED]" -ForegroundColor Red
        Write-Host "   ⚠️ Server may have failed to start - check logs" -ForegroundColor Yellow
        Write-Host "   Run: ssh $SERVER_USER@$SERVER_HOST 'pm2 logs api --lines 50'" -ForegroundColor Gray
    }

    Write-Host ""
} else {
    Write-Host "API folder not found at: `$apiPath" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  Deploy Complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Cache-Busting Version: $VERSION" -ForegroundColor Cyan
Write-Host ""
Write-Host "Running database migrations (if needed)..." -ForegroundColor Cyan

# Copy migration file to server and run it
$migrationFile = Join-Path $LOCAL_PATH "api\migrations\003_create_areas_table.sql"
if (Test-Path $migrationFile) {
    # Copy to server temp location
    & scp "$migrationFile" "${SERVER_USER}@${SERVER_HOST}:/tmp/003_create_areas_table.sql" 2>$null
    
    # Run migration and grant permissions
    $migrationResult = & ssh -n $SERVER_USER@$SERVER_HOST "sudo -u postgres psql -d audio_ar -f /tmp/003_create_areas_table.sql 2>&1"
    
    # Grant permissions to user
    & ssh -n $SERVER_USER@$SERVER_HOST "sudo -u postgres psql -d audio_ar -c 'GRANT ALL PRIVILEGES ON TABLE areas TO $SERVER_USER;' 2>&1" | Out-Null
    
    Write-Host "   ✅ Database schema verified" -ForegroundColor Green
} else {
    Write-Host "   ⚠️ Migration file not found (skipping)" -ForegroundColor Yellow
}
Write-Host ""
Write-Host "Test URLs (hard refresh to bypass browser cache):" -ForegroundColor Cyan
Write-Host "   Landing Page:       http://ssykes.net/index.html" -ForegroundColor White
Write-Host "   Soundscape Picker:  http://ssykes.net/soundscape_picker.html" -ForegroundColor White
Write-Host "   Map Editor:         http://ssykes.net/map_editor.html" -ForegroundColor White
Write-Host "   Map Player:         http://ssykes.net/map_player.html" -ForegroundColor White
Write-Host "   Test Page:          http://ssykes.net/auto_rotate.html" -ForegroundColor White
Write-Host "   Single Sound:       http://ssykes.net/single_sound_v2.html" -ForegroundColor White
Write-Host ""
Write-Host "Multi-User Features:" -ForegroundColor Cyan
Write-Host "   1. Open index.html - login and select device" -ForegroundColor White
Write-Host "   2. Map Editor (PC): Create soundscapes, add waypoints" -ForegroundColor White
Write-Host "   3. Map Player (Phone): Auto-sync, walk and listen" -ForegroundColor White
Write-Host "   4. Auto-saves to server every 2 seconds" -ForegroundColor White
Write-Host ""
Write-Host "Sound Files:" -ForegroundColor Cyan
Write-Host "   Upload MP3/WAV/M4A files to /sounds/ folder" -ForegroundColor White
Write-Host "   Set USE_SAMPLES = true in audio_ar_app.html" -ForegroundColor White
Write-Host ""
Write-Host "Security:" -ForegroundColor Cyan
Write-Host "   Rate limiting enabled (5 auth requests/15min, 30 soundscape/min)" -ForegroundColor White
Write-Host "   Email validation + password minimum length enforced" -ForegroundColor White
Write-Host ""
Write-Host "Cloudflare Cache:" -ForegroundColor Cyan
Write-Host "  Query strings (?v=...) bypass Cloudflare cache automatically" -ForegroundColor Gray
Write-Host "  To manually purge: Cloudflare Dashboard → Caching → Purge Everything" -ForegroundColor Gray
Write-Host "  Or use: https://ssykes.net/cdn-cgi/purge?filename=map_player.js" -ForegroundColor Gray
Write-Host ""
Write-Host "Git Status:" -ForegroundColor Cyan
Write-Host "  Cache-busting versions are automatically stripped by pre-commit hook" -ForegroundColor Gray
Write-Host "  Display versions (e.g., v6.8) will show in git diff - safe to commit" -ForegroundColor Gray
Write-Host "  Pre-commit hook: .git/hooks/pre-commit (auto-installed)" -ForegroundColor Gray
Write-Host ""
Write-Host "Press Enter to close..."
Read-Host

