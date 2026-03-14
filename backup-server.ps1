# Server Backup Script
# Run this to backup all your webserver configuration and files
# Centralized backup location for all projects

Write-Host ""
Write-Host "========================================"
Write-Host "  Audio AR Server Backup"
Write-Host "========================================"
Write-Host ""

# Configuration
$SERVER_USER = "ssykes"
$SERVER_HOST = "macminiwebsever"
$SERVER_PATH = "/var/www/html"
$BACKUP_DIR = "C:\Users\Steve\ubuntu_backup"
$DATE = Get-Date -Format "yyyyMMdd_HHmmss"
$PROJECT_NAME = "audio_ar"
$BACKUP_NAME = "${PROJECT_NAME}_backup_$DATE"
$KEEP_BACKUPS = 5  # Number of backups to keep (auto-cleanup older ones)

# Create backup directory
if (!(Test-Path $BACKUP_DIR)) {
    New-Item -ItemType Directory -Path $BACKUP_DIR | Out-Null
    Write-Host "Created backup directory: $BACKUP_DIR" -ForegroundColor Green
}

$BACKUP_PATH = Join-Path $BACKUP_DIR $BACKUP_NAME
New-Item -ItemType Directory -Path $BACKUP_PATH | Out-Null
Write-Host "Backup folder: $BACKUP_PATH" -ForegroundColor Cyan
Write-Host ""

# ========================================
# 1. Download files from server via SCP
# ========================================
Write-Host "1. Downloading server files..." -ForegroundColor Yellow

$FILES_TO_BACKUP = @(
    ".htaccess",
    "index.html",
    "map_placer.html",
    "map_placer.js",
    "soundscape.js",
    "spatial_audio.js",
    "spatial_audio_app.js",
    "single_sound_v2.html",
    "auto_rotate.html",
    "service-worker.js",
    "manifest.json",
    "api-client.js",
    "debug_logger.js",
    "wake_lock_helper.js"
)

foreach ($file in $FILES_TO_BACKUP) {
    $localFile = Join-Path $BACKUP_PATH $file
    $remotePath = "${SERVER_USER}@${SERVER_HOST}:${SERVER_PATH}/${file}"
    
    Write-Host "   Downloading: $file" -NoNewline
    & scp $remotePath $localFile 2>$null
    if ($LASTEXITCODE -eq 0) {
        Write-Host " [OK]" -ForegroundColor Green
    } else {
        Write-Host " [SKIPPED]" -ForegroundColor Yellow
    }
}

# Backup API folder
$API_BACKUP_PATH = Join-Path $BACKUP_PATH "api"
New-Item -ItemType Directory -Path $API_BACKUP_PATH | Out-Null

$API_FILES = @(
    "package.json",
    "server.js",
    ".env",
    "database/index.js",
    "database/schema.sql",
    "middleware/auth.js",
    "routes/auth.js",
    "routes/soundscapes.js"
)

Write-Host "   Downloading API files..." -ForegroundColor Gray
foreach ($file in $API_FILES) {
    $localFile = Join-Path $API_BACKUP_PATH $file
    $remotePath = "${SERVER_USER}@${SERVER_HOST}:${SERVER_PATH}/api/${file}"
    
    Write-Host "   Downloading: api/$file" -NoNewline
    & scp $remotePath $localFile 2>$null
    if ($LASTEXITCODE -eq 0) {
        Write-Host " [OK]" -ForegroundColor Green
    } else {
        Write-Host " [SKIPPED]" -ForegroundColor Yellow
    }
}

# Backup sounds folder
$SOUNDS_BACKUP_PATH = Join-Path $BACKUP_PATH "sounds"
New-Item -ItemType Directory -Path $SOUNDS_BACKUP_PATH | Out-Null
Write-Host "   Downloading sound files..." -ForegroundColor Gray
& scp "${SERVER_USER}@${SERVER_HOST}:${SERVER_PATH}/sounds/*" $SOUNDS_BACKUP_PATH 2>$null
if ($LASTEXITCODE -eq 0) {
    Write-Host "   Sounds downloaded" -ForegroundColor Green
} else {
    Write-Host "   No sound files found" -ForegroundColor Gray
}

Write-Host ""

# ========================================
# 2. Backup Cloudflare Worker
# ========================================
Write-Host "2. Backing up Cloudflare Worker..." -ForegroundColor Yellow

$WORKER_BACKUP = Join-Path $BACKUP_PATH "cloudflare-worker.js"
Copy-Item "e:\vsCode\workspaces\audio_ar\cloudflare-worker.js" $WORKER_BACKUP
Write-Host "   Cloudflare Worker saved" -ForegroundColor Green

$WRANGLER_BACKUP = Join-Path $BACKUP_PATH "wrangler.toml"
Copy-Item "e:\vsCode\workspaces\audio_ar\wrangler.toml" $WRANGLER_BACKUP
Write-Host "   Wrangler config saved" -ForegroundColor Green

Write-Host ""

# ========================================
# 3. Backup local project files
# ========================================
Write-Host "3. Backing up local project files..." -ForegroundColor Yellow

$LOCAL_FILES = @(
    "deploy.ps1",
    "CLOUDFLARE_WORKER_README.md",
    ".htaccess"
)

foreach ($file in $LOCAL_FILES) {
    $dest = Join-Path $BACKUP_PATH "local_$file"
    if (Test-Path "e:\vsCode\workspaces\audio_ar\$file") {
        Copy-Item "e:\vsCode\workspaces\audio_ar\$file" $dest
        Write-Host "   $file" -ForegroundColor Green
    }
}

Write-Host ""

# ========================================
# 4. Create backup manifest
# ========================================
Write-Host "4. Creating backup manifest..." -ForegroundColor Yellow

$MANIFEST = @"
========================================
BACKUP MANIFEST
========================================
Date: $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")
Backup Folder: $BACKUP_NAME
Server: ${SERVER_USER}@${SERVER_HOST}
Server Path: $SERVER_PATH

FILES INCLUDED:
- Web files (HTML, JS, CSS, JSON)
- API server files (Node.js, database schema)
- Sound files (if any)
- Cloudflare Worker configuration
- Deployment scripts

TO RESTORE:
1. Copy files from this backup to new server
2. Upload to /var/www/html/ via SCP
3. Deploy Cloudflare Worker:
   - Run: wrangler deploy --config wrangler.toml
4. Update DNS if needed
5. Test at: https://observatory.mozilla.org/

CREDENTIALS (Stored in Bitwarden):
- Cloudflare API Token: "Cloudflare API Token - ssykes.net"
- Server SSH Key: ~/.ssh/id_ed25519
- API Database: Check .env file for credentials

========================================
"@

$MANIFEST_PATH = Join-Path $BACKUP_PATH "BACKUP_MANIFEST.txt"
$MANIFEST | Out-File -FilePath $MANIFEST_PATH -Encoding utf8
Write-Host "   Manifest created" -ForegroundColor Green

Write-Host ""

# ========================================
# 5. Compress backup
# ========================================
Write-Host "5. Compressing backup..." -ForegroundColor Yellow

$ZIP_PATH = Join-Path $BACKUP_DIR "${BACKUP_NAME}.zip"
Compress-Archive -Path $BACKUP_PATH -DestinationPath $ZIP_PATH -Force
Write-Host "   Compressed to: ${BACKUP_NAME}.zip" -ForegroundColor Green

# Clean up uncompressed folder (optional - comment out to keep both)
# Remove-Item -Recurse -Force $BACKUP_PATH
# Write-Host "   Removed uncompressed folder" -ForegroundColor Gray

Write-Host ""

# ========================================
# 6. Auto-cleanup old backups
# ========================================
Write-Host "6. Cleaning up old backups (keeping last $KEEP_BACKUPS)..." -ForegroundColor Yellow

# Get all backup files for this project
$backupPattern = "${PROJECT_NAME}_backup_*.zip"
$allBackups = Get-ChildItem -Path $BACKUP_DIR -Filter $backupPattern -File | Sort-Object LastWriteTime -Descending

if ($allBackups.Count -gt $KEEP_BACKUPS) {
    $toDelete = $allBackups | Select-Object -Skip $KEEP_BACKUPS
    $deletedCount = 0
    
    foreach ($backup in $toDelete) {
        Write-Host "   Deleting old backup: $($backup.Name)" -ForegroundColor Gray
        Remove-Item -Path $backup.FullName -Force
        $deletedCount++
        
        # Also delete associated folder if it exists
        $baseName = $backup.BaseName
        $backupFolder = Join-Path $BACKUP_DIR $baseName
        if (Test-Path $backupFolder) {
            Remove-Item -Path $backupFolder -Force -Recurse -ErrorAction SilentlyContinue
        }
    }
    
    Write-Host "   Deleted $deletedCount old backup(s)" -ForegroundColor Green
} else {
    Write-Host "   No old backups to clean up (have $($allBackups.Count), keeping $KEEP_BACKUPS)" -ForegroundColor Gray
}

Write-Host ""

# ========================================
# Summary
# ========================================
Write-Host "========================================" -ForegroundColor Green
Write-Host "  Backup Complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Backup location: $BACKUP_DIR" -ForegroundColor Cyan
Write-Host "Compressed file: ${BACKUP_NAME}.zip" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "  1. Copy .zip to external drive or cloud storage" -ForegroundColor White
Write-Host "  2. Verify backup by extracting and checking files" -ForegroundColor White
Write-Host "  3. Schedule regular backups (weekly recommended)" -ForegroundColor White
Write-Host ""
Write-Host "Auto-cleanup:" -ForegroundColor Cyan
Write-Host "  Keeping last $KEEP_BACKUPS backups (older ones auto-deleted)" -ForegroundColor White
Write-Host "  To change: Edit KEEP_BACKUPS in backup-server.ps1" -ForegroundColor Gray
Write-Host ""
Write-Host "To restore on new server:" -ForegroundColor Yellow
Write-Host "  1. Extract backup .zip" -ForegroundColor White
Write-Host "  2. SCP files to new server: /var/www/html/" -ForegroundColor White
Write-Host "  3. Deploy Cloudflare Worker (see CLOUDFLARE_WORKER_README.md)" -ForegroundColor White
Write-Host "  4. Update DNS if server IP changed" -ForegroundColor White
Write-Host ""
