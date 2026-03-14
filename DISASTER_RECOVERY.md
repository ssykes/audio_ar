# 🚨 Disaster Recovery Guide
# How to restore your Audio AR server if you lose it

---

## 📦 What's Backed Up

| Item | Location | Backup Method | Script |
|------|----------|---------------|--------|
| **Web files** | `/var/www/html/*.html, *.js` | Full backup | `full-server-backup.ps1` |
| **API server** | `/var/www/html/api/` | Full backup | `full-server-backup.ps1` |
| **Sound files** | `/var/www/html/sounds/` | Full backup | `full-server-backup.ps1` |
| **Apache config** | `/etc/apache2/` | Full backup | `full-server-backup.ps1` |
| **SSL certificates** | `/etc/letsencrypt/` | Full backup | `full-server-backup.ps1` |
| **System users** | `/etc/passwd, /etc/group` | Full backup | `full-server-backup.ps1` |
| **SSH authorized keys** | `/home/ssykes/.ssh/` | Full backup | `full-server-backup.ps1` |
| **Firewall rules** | UFW/iptables | Full backup | `full-server-backup.ps1` |
| **Package list** | dpkg selections | Full backup | `full-server-backup.ps1` |
| **Network config** | IP, routes, hosts | Full backup | `full-server-backup.ps1` |
| **Cron jobs** | crontab | Full backup | `full-server-backup.ps1` |
| **Database** | MySQL dump | Full backup | `full-server-backup.ps1` |
| **Cloudflare Worker** | Cloudflare CDN | Project backup | `backup-server.ps1` |
| **Credentials** | Bitwarden vault | Manual | Manual |
| **SSH private keys** | `~/.ssh/id_ed25519` | **MANUAL** | Manual |

**Backup Location:** `C:\Users\Steve\ubuntu_backup\`

---

## 🔥 Disaster Scenarios

### Scenario 1: Server Crashes (Hardware Failure)

**Symptoms:** SSH doesn't work, website is down

**Recovery Time:** 30-60 minutes

**Steps:**

1. **Get new server** (Mac mini, VPS, Raspberry Pi, etc.)

2. **Get your full backup:**
   - Download `audio_ar_full_backup_*.zip` from `C:\Users\Steve\ubuntu_backup\`
   - Or retrieve from external storage (Google Drive, USB drive)

3. **Extract the backup:**
   ```powershell
   # On your Windows PC
   Expand-Archive -Path "audio_ar_full_backup_*.zip" -DestinationPath "C:\temp\restore"
   cd C:\temp\restore
   tar -xzf server_backup.tar.gz
   cd server_backup
   ```

4. **Follow RESTORE_INSTRUCTIONS.txt:**
   - The backup contains detailed restore instructions
   - Key steps below:

5. **Install prerequisites on new server:**
   ```bash
   # Install Apache
   sudo apt update
   sudo apt install apache2 -y

   # Enable required modules
   sudo a2enmod headers rewrite ssl
   sudo systemctl restart apache2

   # Install Node.js (for API)
   curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
   sudo apt install nodejs -y
   ```

6. **Restore from backup:**
   ```bash
   # Create user
   sudo useradd -m -s /bin/bash ssykes
   sudo usermod -aG sudo ssykes
   sudo passwd ssykes

   # Restore SSH keys
   mkdir -p /home/ssykes/.ssh
   cp ssh_keys/authorized_keys /home/ssykes/.ssh/
   chown -R ssykes:ssykes /home/ssykes/.ssh
   chmod 700 /home/ssykes/.ssh
   chmod 600 /home/ssykes/.ssh/authorized_keys

   # Restore Apache2 config
   sudo cp -r apache2/* /etc/apache2/
   sudo chown -R root:root /etc/apache2

   # Restore SSL certs
   sudo cp -r ssl/* /etc/letsencrypt/
   sudo chown -R root:root /etc/letsencrypt

   # Restore web content
   sudo cp -r www/* /var/www/html/
   sudo chown -R www-data:www-data /var/www/html

   # Install API dependencies
   cd /var/www/html/api
   npm install

   # Start API server
   nohup node server.js > api.log 2>&1 &

   # Restart Apache
   sudo systemctl restart apache2
   ```

7. **Update DNS** (if IP changed):
   - Go to your domain registrar
   - Update A record to new server IP
   - Wait for propagation (5-30 min)

8. **Test:**
   - Visit `https://ssykes.net/map_placer.html`
   - Check HTTP Observatory

---

### Scenario 2: Accidental File Deletion

**Symptoms:** Some files missing, errors in browser console

**Recovery Time:** 5-10 minutes

**Steps:**

1. **Extract backup .zip** on your PC:
   ```powershell
   Expand-Archive -Path "audio_ar_full_backup_*.zip" -DestinationPath "C:\temp\restore"
   cd C:\temp\restore
   tar -xzf server_backup.tar.gz
   cd server_backup/www
   ```

2. **Re-upload missing files:**
   ```powershell
   # Single file
   scp path\to\file.js ssykes@macminiwebsever:/var/www/html/

   # Or all files
   scp www/* ssykes@macminiwebsever:/var/www/html/
   ```

3. **Test the site**

---

### Scenario 3: Cloudflare Worker Deleted

**Symptoms:** Security headers missing, Observatory score drops

**Recovery Time:** 5 minutes

**Steps:**

1. **Get API token from Bitwarden:**
   - Open Bitwarden
   - Find "Cloudflare API Token - ssykes.net"
   - Copy token

2. **Get Worker code from backup:**
   - Extract `audio_ar_full_backup_*.zip`
   - Find `cloudflare-worker.js` in the extracted contents

3. **Redeploy Worker:**
   ```powershell
   $env:CLOUDFLARE_API_TOKEN="PASTE_FROM_BITWARDEN"
   wrangler deploy --config e:\vsCode\workspaces\audio_ar\wrangler.toml
   ```

4. **Verify:**
   ```bash
   curl -kI https://spoot.wtf/map_placer.html
   ```

---

### Scenario 4: Complete Catastrophe (All Data Lost)

**Symptoms:** No access to server, no backups on server, PC also dead

**Recovery Time:** 2-4 hours

**Prerequisites:**
- Bitwarden account (cloud-based, so you're good)
- Backup .zip stored externally (Google Drive, USB drive, etc.)

**Steps:**

1. **Get new hardware** (server + PC if both lost)

2. **Recover from Bitwarden:**
   - Cloudflare API token
   - SSH keys (if you saved them there)
   - Domain registrar login
   - Database credentials

3. **Recover backup .zip:**
   - Download from cloud storage (Google Drive, OneDrive)
   - Or copy from USB drive
   - Location: `audio_ar_full_backup_*.zip`

4. **Extract and follow RESTORE_INSTRUCTIONS.txt:**
   ```powershell
   Expand-Archive -Path "audio_ar_full_backup_*.zip" -DestinationPath "C:\temp\restore"
   cd C:\temp\restore
   tar -xzf server_backup.tar.gz
   cd server_backup
   # Read RESTORE_INSTRUCTIONS.txt
   ```

5. **Follow Scenario 1 steps** (new server setup)

---

## 🛡️ Proactive Protection

### What You Should Do NOW

1. **Run full server backup regularly:**
   ```powershell
   # Run weekly (add to Task Scheduler)
   .\full-server-backup.ps1
   ```

2. **Store backup externally:**
   - Copy `.zip` from `C:\Users\Steve\ubuntu_backup\` to:
     - Google Drive / OneDrive
     - USB drive (keep offline for ransomware protection)

3. **Backup SSH private keys:**
   ```powershell
   # Copy to Bitwarden (Secure Note) or USB drive
   Copy-Item $env:USERPROFILE\.ssh\id_ed25519 E:\BACKUPS\
   Copy-Item $env:USERPROFILE\.ssh\id_ed25519.pub E:\BACKUPS\
   ```

4. **Test restore quarterly:**
   - Extract backup
   - Verify files are readable
   - Test on a VM if possible

5. **Manage backup storage:**
   - Both scripts auto-cleanup: keeps last 5 backups
   - To change: Edit `$KEEP_BACKUPS` in respective script
   - Manually delete old backups from `C:\Users\Steve\ubuntu_backup\` if needed

---

## 📋 Backup Checklist

Run this checklist monthly:

- [ ] Run `.\full-server-backup.ps1`
- [ ] Copy `.zip` to external storage (Google Drive, USB)
- [ ] Verify backup location: `C:\Users\Steve\ubuntu_backup\`
- [ ] Verify Bitwarden has:
  - [ ] Cloudflare API token
  - [ ] SSH private key (optional but recommended)
  - [ ] Domain registrar login
  - [ ] Database credentials
- [ ] Test one file restore via SCP
- [ ] Check HTTP Observatory score

---

## 🔧 Quick Reference Commands

### Create Full Server Backup (Recommended)
```powershell
.\full-server-backup.ps1
```
**Note:** Auto-cleanup keeps last 5 backups. Edit `$KEEP_BACKUPS` in script to change.

### Create Project Files Backup (Quick)
```powershell
.\backup-server.ps1
```
**Note:** Auto-cleanup keeps last 5 backups. Edit `$KEEP_BACKUPS` in script to change.

### Extract Backup
```powershell
Expand-Archive -Path "audio_ar_full_backup_*.zip" -DestinationPath "C:\temp\restore"
cd C:\temp\restore
tar -xzf server_backup.tar.gz
cd server_backup
```

### Upload File to Server
```powershell
scp path\to\file.js ssykes@macminiwebsever:/var/www/html/
```

### Download File from Server
```powershell
scp ssykes@macminiwebsever:/var/www/html/file.js .\
```

### Deploy Cloudflare Worker
```powershell
$env:CLOUDFLARE_API_TOKEN="FROM_BITWARDEN"
wrangler deploy
```

### Check Server Status
```powershell
ssh ssykes@macminiwebsever "systemctl status apache2"
ssh ssykes@macminiwebsever "ps aux | grep node"
```

### Test Security Headers
```powershell
curl -kI https://spoot.wtf/map_placer.html
```

---

## 📞 Emergency Contacts

| Service | Recovery URL |
|---------|--------------|
| Cloudflare | https://dash.cloudflare.com/ |
| Bitwarden | https://vault.bitwarden.com/ |
| Domain Registrar | (depends on where you registered) |
| HTTP Observatory | https://observatory.mozilla.org/ |

---

## 🎯 Last Updated

This guide: 2026-03-14
Full server backup script: `full-server-backup.ps1`
Project backup script: `backup-server.ps1`
Latest backup: Check `C:\Users\Steve\ubuntu_backup\` folder

---

**Remember:** The best backup is useless if you don't test it. Restore at least once per quarter!
