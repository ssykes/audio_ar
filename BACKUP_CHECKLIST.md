# 📦 Backup Checklist for Audio AR Server

## Quick Backup Options

### Option 1: Full Server Backup (Recommended - 5 minutes)

This creates a complete disaster recovery backup including Apache2 config, SSL certs, and system settings.

```powershell
.\full-server-backup.ps1
```

**Backs up:**
- Web files (HTML, JS, JSON)
- API server files
- Sound files
- Apache2 configuration (`/etc/apache2`)
- SSL certificates (`/etc/letsencrypt`)
- System user info (ssykes)
- SSH authorized keys
- Firewall rules (UFW/iptables)
- Package list
- Network configuration
- Cron jobs
- Database dumps

**Location:** `C:\Users\Steve\ubuntu_backup\`
**Auto-cleanup:** Keeps last 5 backups (edit `$KEEP_BACKUPS` in script)

---

### Option 2: Project Files Only (Legacy - 2 minutes)

This backs up only the Audio AR project files (faster, but not a full system backup).

```powershell
.\backup-server.ps1
```

**Backs up:**
- Web files (HTML, JS, JSON)
- API server files
- Sound files
- Cloudflare Worker config

**Location:** `C:\Users\Steve\ubuntu_backup\`
**Auto-cleanup:** Keeps last 5 backups (edit `$KEEP_BACKUPS` in script)

---

### 3. Store Externally
- Copy `.zip` to Google Drive / OneDrive
- Or save to USB drive

---

## What to Backup (Checklist)

### ✅ Critical (Must Have)
- [ ] `.htaccess` - Apache security headers
- [ ] All `.html` files - Your web app
- [ ] All `.js` files - Application code
- [ ] `cloudflare-worker.js` - Security headers at edge
- [ ] `wrangler.toml` - Cloudflare Worker config
- [ ] `api/.env` - Database credentials
- [ ] SSH keys (`~/.ssh/id_ed25519`)
- [ ] **Full system backup** (Apache2, SSL, users) - `full-server-backup.ps1`

### ✅ Important (Should Have)
- [ ] `api/server.js` - API server code
- [ ] `api/database/` - Database schema
- [ ] Sound files (if you have custom uploads)
- [ ] `deploy.ps1` - Deployment script

### ✅ Nice to Have
- [ ] `DISASTER_RECOVERY.md` - Recovery guide
- [ ] `CLOUDFLARE_WORKER_README.md` - Worker docs
- [ ] `QWEN.md` - Project notes

---

## Where to Store Backups

| Location | Pros | Cons |
|----------|------|------|
| **External USB Drive** | Fast, offline, one-time cost | Can be lost/damaged |
| **Google Drive / OneDrive** | Accessible anywhere, versioned | Requires internet |
| **GitHub (private repo)** | Version controlled, free | Don't commit secrets! |
| **Multiple locations** | **BEST** - Redundant | More work |

**Recommendation:** USB drive + Cloud storage (redundancy)

---

## Backup Schedule

| Frequency | Task | Time | Script |
|-----------|------|------|--------|
| **Weekly** | Run full server backup | 5 min | `full-server-backup.ps1` |
| **Monthly** | Verify backup extracts correctly | 10 min | Manual |
| **Quarterly** | Test full restore on VM | 1 hour | Manual |
| **After major changes** | Create ad-hoc backup | 5 min | `full-server-backup.ps1` |
| **Daily (optional)** | Project files only backup | 2 min | `backup-server.ps1` |

---

## Restore Test (Do This Quarterly!)

1. **Extract backup .zip** to temp folder
2. **Pick one file** (e.g., `map_placer.html`)
3. **Upload to server:**
   ```powershell
   scp .\backups\backup_*\map_placer.html ssykes@macminiwebsever:/tmp/
   ```
4. **SSH to server and verify:**
   ```bash
   ssh ssykes@macminiwebsever
   cat /tmp/map_placer.html | head
   ```
5. **If it works:** You have a valid backup! ✅

---

## Current Backup Status

| Item | Last Backed Up | Location | Script |
|------|----------------|----------|--------|
| Web files | _Run backup script_ | `C:\Users\Steve\ubuntu_backup\` | `full-server-backup.ps1` |
| API server | _Run backup script_ | `C:\Users\Steve\ubuntu_backup\` | `full-server-backup.ps1` |
| Cloudflare Worker | _Run backup script_ | `C:\Users\Steve\ubuntu_backup\` | `backup-server.ps1` |
| Apache2 config | _Run backup script_ | `C:\Users\Steve\ubuntu_backup\` | `full-server-backup.ps1` |
| SSL certificates | _Run backup script_ | `C:\Users\Steve\ubuntu_backup\` | `full-server-backup.ps1` |
| System users | _Run backup script_ | `C:\Users\Steve\ubuntu_backup\` | `full-server-backup.ps1` |
| SSH Keys | **MANUAL** | Bitwarden or USB | Manual |
| Bitwarden Vault | Always synced | Cloud | Manual |

---

## Next Steps

1. **Run full server backup (recommended):**
   ```powershell
   .\full-server-backup.ps1
   ```

2. **Or run project files backup (quick):**
   ```powershell
   .\backup-server.ps1
   ```

3. **Backup SSH keys manually:**
   ```powershell
   # Copy to USB or Bitwarden Secure Note
   Copy-Item $env:USERPROFILE\.ssh\id_ed25519 E:\BACKUPS\
   ```

4. **Set reminder:**
   - Calendar: "Backup Audio AR server" (weekly)
   - Or use Task Scheduler to run `full-server-backup.ps1` automatically

5. **Store backup externally:**
   - Copy `.zip` from `C:\Users\Steve\ubuntu_backup\` to Google Drive / OneDrive
   - Or save to USB drive

---

**Remember:** A backup is only as good as your last successful restore test!
