s# Full Server Backup Script
# Captures Apache2 config, SSL certs, system settings, and web content
# Run this to create a complete disaster recovery backup

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Full Ubuntu Server Backup" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Configuration
$SERVER_USER = "ssykes"
$SERVER_HOST = "macminiwebsever"
$SERVER_PORT = "22"
$PROJECT_NAME = "audio_ar"
$BACKUP_DIR = "C:\Users\Steve\ubuntu_backup"
$DATE = Get-Date -Format "yyyyMMdd_HHmmss"
$BACKUP_NAME = "${PROJECT_NAME}_full_backup_$DATE"
$BACKUP_DATE = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
$KEEP_BACKUPS = 5  # Number of backups to keep (auto-cleanup older ones)

# Create backup directory
if (!(Test-Path $BACKUP_DIR)) {
    New-Item -ItemType Directory -Path $BACKUP_DIR | Out-Null
    Write-Host "Created backup directory: $BACKUP_DIR" -ForegroundColor Green
}

$BACKUP_PATH = Join-Path $BACKUP_DIR $BACKUP_NAME
New-Item -ItemType Directory -Path $BACKUP_PATH -Force | Out-Null

Write-Host "Backup folder: $BACKUP_PATH" -ForegroundColor Cyan
Write-Host ""

# SSH and SCP commands
$SSH_CMD = "ssh -p $SERVER_PORT ${SERVER_USER}@${SERVER_HOST}"
$SCP_CMD = "scp -P $SERVER_PORT"

# ========================================
# Step 1: Create backup on server
# ========================================
Write-Host "Step 1: Creating server-side backup archive..." -ForegroundColor Yellow
Write-Host "        This will gather Apache2, SSL, users, and web content" -ForegroundColor Gray
Write-Host ""

# Build the server commands as a single string
$CMD1 = "mkdir -p /tmp/server_backup && cd /tmp/server_backup"
$CMD2 = "mkdir -p apache2 ssl www system ssh_keys database"
$CMD3 = "cp -r /etc/apache2/* apache2/ 2>/dev/null; echo 'Apache2: done'"
$CMD4 = "cp -r /etc/letsencrypt ssl/ 2>/dev/null || cp -r /etc/ssl ssl/ 2>/dev/null; echo 'SSL: done'"
$CMD5 = "cp -r /var/www/html/* www/ 2>/dev/null; echo 'WWW: done'"
$CMD6 = "grep '^ssykes:' /etc/passwd > system/passwd.txt 2>/dev/null; echo 'Users: done'"
$CMD7 = "cp /home/ssykes/.ssh/authorized_keys ssh_keys/ 2>/dev/null; echo 'SSH keys: done'"
$CMD8 = "ufw status verbose > system/ufw_rules.txt 2>/dev/null || iptables -L -n -v > system/iptables_rules.txt 2>/dev/null; echo 'Firewall: done'"
$CMD9 = "dpkg --get-selections > system/package_list.txt 2>/dev/null; echo 'Packages: done'"
$CMD10 = "ip addr show > system/network.txt 2>/dev/null; ip route show >> system/network.txt 2>/dev/null; echo 'Network: done'"
$CMD11 = "crontab -l > system/crontab.txt 2>/dev/null || echo 'none' > system/crontab.txt; echo 'Cron: done'"
$CMD12 = "mysqldump --all-databases > database/mysql_dump.sql 2>/dev/null || echo '-- no mysql' > database/mysql_dump.sql; echo 'DB: done'"
$CMD13 = "cd /tmp && tar -czf server_backup_final.tar.gz server_backup && rm -rf server_backup"
$CMD14 = "echo 'Archive created: /tmp/server_backup_final.tar.gz'"

$SERVER_COMMANDS = "$CMD1 && $CMD2 && $CMD3 && $CMD4 && $CMD5 && $CMD6 && $CMD7 && $CMD8 && $CMD9 && $CMD10 && $CMD11 && $CMD12 && $CMD13 && $CMD14"

Write-Host "        Running backup commands on server..." -ForegroundColor Gray

# Execute commands on server
$executeResult = & cmd /c "$SSH_CMD `"$SERVER_COMMANDS`"" 2>&1

if ($LASTEXITCODE -ne 0) {
    Write-Host "        Error: Could not execute backup on server" -ForegroundColor Red
    Write-Host "        Make sure SSH is configured and you can connect to $SERVER_HOST" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "        Manual alternative:" -ForegroundColor Cyan
    Write-Host "        1. SSH into server: ssh ${SERVER_USER}@${SERVER_HOST}" -ForegroundColor White
    Write-Host "        2. Run the backup commands manually" -ForegroundColor White
    Write-Host ""
    Write-Host "        Server output:" -ForegroundColor Gray
    Write-Host $executeResult -ForegroundColor Gray
    exit 1
}

Write-Host "        Backup created on server" -ForegroundColor Green
Write-Host ""

# Show server output
Write-Host "        Server output:" -ForegroundColor Gray
Write-Host $executeResult -ForegroundColor Gray
Write-Host ""

# ========================================
# Step 2: Download the backup tarball
# ========================================
Write-Host "Step 2: Downloading backup from server..." -ForegroundColor Yellow

$REMOTE_TARBALL = "/tmp/server_backup_final.tar.gz"
$LOCAL_TARBALL = Join-Path $BACKUP_PATH "server_backup.tar.gz"

$downloadResult = & cmd /c "$SCP_CMD `"${SERVER_USER}@${SERVER_HOST}:${REMOTE_TARBALL}`" `"$LOCAL_TARBALL`"" 2>&1

if ($LASTEXITCODE -eq 0) {
    Write-Host "        Backup downloaded successfully" -ForegroundColor Green
    
    # Get file size
    $fileSize = (Get-Item $LOCAL_TARBALL).Length / 1MB
    Write-Host "        Size: $([math]::Round($fileSize, 2)) MB" -ForegroundColor Gray
    
    # Clean up server tarball
    Write-Host "        Cleaning up server..." -ForegroundColor Gray
    & cmd /c "$SSH_CMD 'rm -f $REMOTE_TARBALL'" 2>$null
    Write-Host "        Server temp files cleaned" -ForegroundColor Green
} else {
    Write-Host "        Error: Could not download backup" -ForegroundColor Red
    Write-Host "        $downloadResult" -ForegroundColor Gray
    Write-Host ""
    Write-Host "        Manual download:" -ForegroundColor Cyan
    Write-Host "        scp -p $SERVER_PORT ${SERVER_USER}@${SERVER_HOST}:/tmp/server_backup_final.tar.gz $LOCAL_TARBALL" -ForegroundColor White
    exit 1
}

Write-Host ""

# ========================================
# Step 3: Create restore instructions
# ========================================
Write-Host "Step 3: Creating restore instructions..." -ForegroundColor Yellow

$RESTORE_PATH = Join-Path $BACKUP_PATH "RESTORE_INSTRUCTIONS.txt"

$RESTORE_LINES = @(
    "========================================",
    "SERVER RESTORE INSTRUCTIONS",
    "========================================",
    "",
    "This backup contains:",
    "* Apache2 configuration (/etc/apache2)",
    "* SSL certificates (/etc/letsencrypt or /etc/ssl)",
    "* Web content (/var/www/html)",
    "* System user info (ssykes)",
    "* SSH authorized keys",
    "* Firewall rules (UFW/iptables)",
    "* Installed package list",
    "* Network configuration",
    "* Cron jobs",
    "* Database dumps (MySQL/SQLite)",
    "",
    "PREREQUISITES:",
    "1. Fresh Ubuntu Server installation",
    "2. Root or sudo access",
    "3. Same username (ssykes) or update configs",
    "",
    "RESTORE STEPS:",
    "",
    "1. Extract Backup",
    "   tar -xzf server_backup.tar.gz",
    "   cd server_backup",
    "",
    "2. Create User",
    "   sudo useradd -m -s /bin/bash ssykes",
    "   sudo usermod -aG sudo ssykes",
    "   sudo passwd ssykes",
    "",
    "3. Restore SSH Keys",
    "   mkdir -p /home/ssykes/.ssh",
    "   cp ssh_keys/authorized_keys /home/ssykes/.ssh/",
    "   chown -R ssykes:ssykes /home/ssykes/.ssh",
    "   chmod 700 /home/ssykes/.ssh",
    "   chmod 600 /home/ssykes/.ssh/authorized_keys",
    "",
    "4. Install Packages",
    "   sudo apt update",
    "   sudo apt install apache2 certbot python3-certbot-apache",
    "",
    "5. Restore Apache2 Config",
    "   sudo cp -r apache2/* /etc/apache2/",
    "   sudo chown -R root:root /etc/apache2",
    "",
    "6. Restore SSL Certs",
    "   sudo cp -r ssl/* /etc/letsencrypt/",
    "",
    "7. Restore Web Content",
    "   sudo cp -r www/* /var/www/html/",
    "   sudo chown -R www-data:www-data /var/www/html",
    "",
    "8. Restore Firewall",
    "   sudo ufw reset",
    "   sudo ufw default deny incoming",
    "   sudo ufw default allow outgoing",
    "",
    "9. Restore Cron Jobs",
    "   crontab system/crontab.txt",
    "",
    "10. Restore Database (if applicable)",
    "    mysql < database/mysql_dump.sql",
    "",
    "11. Enable Services",
    "    sudo systemctl enable apache2",
    "    sudo systemctl start apache2",
    "",
    "12. Test",
    "    Visit https://your-domain.com",
    "    Check SSL: https://www.ssllabs.com/ssltest/",
    "",
    "========================================"
)

$RESTORE_LINES | Out-File -FilePath $RESTORE_PATH -Encoding utf8
Write-Host "        Restore instructions saved" -ForegroundColor Green

Write-Host ""

# ========================================
# Step 4: Create backup summary
# ========================================
Write-Host "Step 4: Creating backup summary..." -ForegroundColor Yellow

$SUMMARY_PATH = Join-Path $BACKUP_PATH "BACKUP_SUMMARY.txt"

$SUMMARY_LINES = @(
    "========================================",
    "BACKUP SUMMARY - $PROJECT_NAME",
    "========================================",
    "Date: $BACKUP_DATE",
    "Server: ${SERVER_USER}@${SERVER_HOST}",
    "Backup Location: $BACKUP_DIR",
    "Archive: ${BACKUP_NAME}.zip",
    "",
    "CONTENTS:",
    "* Apache2 configuration (/etc/apache2)",
    "* SSL certificates (/etc/letsencrypt)",
    "* Web content (/var/www/html)",
    "* System user information",
    "* SSH authorized keys",
    "* Firewall rules",
    "* Package list",
    "* Network configuration",
    "* Cron jobs",
    "* Database dumps",
    "",
    "BACKUP FILE:",
    "$LOCAL_TARBALL (inside ${BACKUP_NAME}.zip)",
    "",
    "TO RESTORE:",
    "1. Extract the .zip file",
    "2. Extract server_backup.tar.gz",
    "3. Follow RESTORE_INSTRUCTIONS.txt",
    "",
    "IMPORTANT:",
    "* Store securely (contains sensitive configs)",
    "* Test restore process periodically",
    "* Update after major server changes",
    "",
    "========================================"
)

$SUMMARY_LINES | Out-File -FilePath $SUMMARY_PATH -Encoding utf8
Write-Host "        Summary saved" -ForegroundColor Green

Write-Host ""

# ========================================
# Step 5: Compress for long-term storage
# ========================================
Write-Host "Step 5: Creating compressed archive..." -ForegroundColor Yellow

$ZIP_PATH = Join-Path $BACKUP_DIR "${BACKUP_NAME}.zip"
if (Test-Path $LOCAL_TARBALL) {
    Compress-Archive -Path $BACKUP_PATH -DestinationPath $ZIP_PATH -Force
    Write-Host "        Compressed to: ${BACKUP_NAME}.zip" -ForegroundColor Green
    
    # Get ZIP size
    $zipSize = (Get-Item $ZIP_PATH).Length / 1MB
    Write-Host "        Final size: $([math]::Round($zipSize, 2)) MB" -ForegroundColor Gray
}

Write-Host ""

# ========================================
# Step 6: Auto-cleanup old backups
# ========================================
Write-Host "Step 6: Cleaning up old backups (keeping last $KEEP_BACKUPS)..." -ForegroundColor Yellow

# Get all backup files for this project
$backupPattern = "${PROJECT_NAME}_full_backup_*.zip"
$allBackups = Get-ChildItem -Path $BACKUP_DIR -Filter $backupPattern -File | Sort-Object LastWriteTime -Descending

if ($allBackups.Count -gt $KEEP_BACKUPS) {
    $toDelete = $allBackups | Select-Object -Skip $KEEP_BACKUPS
    $deletedCount = 0
    
    foreach ($backup in $toDelete) {
        Write-Host "        Deleting old backup: $($backup.Name)" -ForegroundColor Gray
        Remove-Item -Path $backup.FullName -Force
        $deletedCount++
        
        # Also delete associated summary files if they exist
        $baseName = $backup.BaseName
        $summaryFile = Join-Path $BACKUP_DIR "$baseName\BACKUP_SUMMARY.txt"
        $restoreFile = Join-Path $BACKUP_DIR "$baseName\RESTORE_INSTRUCTIONS.txt"
        
        if (Test-Path $summaryFile) { Remove-Item -Path $summaryFile -Force }
        if (Test-Path $restoreFile) { Remove-Item -Path $restoreFile -Force }
        
        # Try to delete the folder (may not exist if already compressed)
        $backupFolder = Join-Path $BACKUP_DIR $baseName
        if (Test-Path $backupFolder) {
            Remove-Item -Path $backupFolder -Force -Recurse -ErrorAction SilentlyContinue
        }
    }
    
    Write-Host "        Deleted $deletedCount old backup(s)" -ForegroundColor Green
} else {
    Write-Host "        No old backups to clean up (have $($allBackups.Count), keeping $KEEP_BACKUPS)" -ForegroundColor Gray
}

Write-Host ""

# ========================================
# Summary
# ========================================
Write-Host "========================================" -ForegroundColor Green
Write-Host "  Full Server Backup Complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Backup location: $BACKUP_DIR" -ForegroundColor Cyan
Write-Host "Compressed file: ${BACKUP_NAME}.zip" -ForegroundColor Cyan
Write-Host ""
Write-Host "Contents:" -ForegroundColor Yellow
Write-Host "  Apache2 configuration" -ForegroundColor Green
Write-Host "  SSL certificates (Let's Encrypt)" -ForegroundColor Green
Write-Host "  Web content (/var/www/html)" -ForegroundColor Green
Write-Host "  System user info (ssykes)" -ForegroundColor Green
Write-Host "  SSH authorized keys" -ForegroundColor Green
Write-Host "  Firewall rules" -ForegroundColor Green
Write-Host "  Package list" -ForegroundColor Green
Write-Host "  Network configuration" -ForegroundColor Green
Write-Host "  Cron jobs" -ForegroundColor Green
Write-Host "  Database dumps (if applicable)" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "  1. Verify backup by extracting and checking contents" -ForegroundColor White
Write-Host "  2. Store .zip in secure location (encrypted drive/cloud)" -ForegroundColor White
Write-Host "  3. Schedule regular backups (monthly or after changes)" -ForegroundColor White
Write-Host "  4. Test restore process on a VM periodically" -ForegroundColor White
Write-Host ""
Write-Host "Auto-cleanup:" -ForegroundColor Cyan
Write-Host "  Keeping last $KEEP_BACKUPS backups (older ones auto-deleted)" -ForegroundColor White
Write-Host "  To change: Edit KEEP_BACKUPS in full-server-backup.ps1" -ForegroundColor Gray
Write-Host ""
Write-Host "Files created:" -ForegroundColor Cyan
Write-Host "  - ${BACKUP_NAME}.zip (complete backup)" -ForegroundColor White
Write-Host "  - RESTORE_INSTRUCTIONS.txt (step-by-step guide)" -ForegroundColor White
Write-Host "  - BACKUP_SUMMARY.txt (overview)" -ForegroundColor White
Write-Host ""
