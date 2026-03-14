# Audio AR - Security Documentation

**Last Updated:** March 14, 2026  
**Version:** 4.0 - Multi-User with Server Hardening

---

## 🛡️ Security Overview

This document summarizes the security measures implemented for the Audio AR multi-user soundscape platform.

---

## 🔐 Authentication & Authorization

### User Authentication
- **JWT Tokens**: 7-day expiration for user sessions
- **Password Hashing**: bcrypt with salt (cost factor 10)
- **Password Storage**: Never stored in plain text
- **API Authentication**: Token-based via `Authorization: Bearer <token>` header

### SSH Access (Server Administration)
- **SSH Key Authentication**: ED25519 keys (no password login)
- **Password Authentication**: Disabled (`PasswordAuthentication no`)
- **Root Login**: Disabled (`PermitRootLogin no`)

---

## 🔥 Firewall Configuration (UFW)

### Active Rules
```
Status: active

To                    Action      From
--                    ------      ----
22/tcp (SSH)          ALLOW       Anywhere
80/tcp (HTTP)         ALLOW       Anywhere
443/tcp (HTTPS)       ALLOW       Anywhere
Default: DENY (incoming), ALLOW (outgoing)
```

### Protected Ports
| Port | Service | Access |
|------|---------|--------|
| 22 | SSH | ✅ Allowed (key-based only) |
| 80 | HTTP | ✅ Allowed (redirects to HTTPS) |
| 443 | HTTPS | ✅ Allowed |
| All others | - | ❌ Blocked |

---

## 🚫 Intrusion Prevention (fail2ban)

### SSH Jail Configuration
```ini
[sshd]
enabled = true
port = ssh
filter = sshd
logpath = /var/log/auth.log
maxretry = 5        # Block after 5 failed attempts
findtime = 600      # Count failures within 10 minutes
bantime = 3600      # Block IP for 1 hour
```

### Protection Features
- Monitors SSH login attempts
- Automatically bans IPs after 5 failed attempts
- 1-hour ban duration (configurable)
- Logs all ban/unban events

### Check Ban Status
```bash
# View active bans
sudo fail2ban-client status sshd

# Unban IP (if needed)
sudo fail2ban-client set sshd unbanip <IP_ADDRESS>
```

---

## 🔒 HTTPS Encryption

### Cloudflare SSL
- **Certificate**: Free SSL via Cloudflare
- **Encryption**: Full (end-to-end)
- **Auto-Renewal**: Handled by Cloudflare
- **HTTP Redirect**: All HTTP traffic redirects to HTTPS

### Test HTTPS
```bash
curl -k https://spoot.wtf/api/health
```

---

## 🗄️ Database Security (PostgreSQL)

### User Permissions
| User | Permissions |
|------|-------------|
| `postgres` | Superuser (admin only) |
| `audio_ar_user` | Limited to `audio_ar` database only |

### Security Measures
- **Listen Address**: localhost only (no external connections)
- **Password Hashing**: bcrypt (application layer)
- **SQL Injection Protection**: Parameterized queries

### Check Database Users
```bash
sudo -u postgres psql -d audio_ar -c "\du"
```

---

## 🚀 Service Auto-Start (systemd)

### Configured Services
| Service | Purpose | Auto-Start |
|---------|---------|------------|
| `audio-ar-api` | Node.js API server | ✅ Yes |
| `fail2ban` | Intrusion prevention | ✅ Yes |
| `ssh` | SSH server | ✅ Yes |
| `apache2` | Web server | ✅ Yes |
| `postgresql` | Database | ✅ Yes |

### Check Service Status
```bash
sudo systemctl status audio-ar-api
sudo systemctl status fail2ban
```

---

## 📝 Security Checklist

### Server Hardening ✅
- [x] Firewall enabled (UFW)
- [x] Only essential ports open (22, 80, 443)
- [x] SSH key authentication only
- [x] Password authentication disabled
- [x] Root login disabled
- [x] fail2ban installed and configured
- [x] Automatic security updates enabled

### Application Security ✅
- [x] Password hashing (bcrypt)
- [x] JWT token authentication
- [x] HTTPS enforced (Cloudflare)
- [x] SQL injection protection (parameterized queries)
- [x] CORS configured
- [x] Input validation

### Operational Security ✅
- [x] Services auto-start on boot
- [x] Log monitoring (fail2ban)
- [x] Regular system updates
- [x] SSH access via key only

---

## 🧪 Red Team Testing

### Test Brute Force Protection
```powershell
# From Windows: Try wrong password 5 times
ssh ssykes@macminiwebsever
# Enter wrong password repeatedly

# On server: Check if banned
sudo fail2ban-client status sshd
```

### Test Firewall
```powershell
# Test allowed port
Test-NetConnection macminiwebsever -Port 22    # Should succeed

# Test blocked port
Test-NetConnection macminiwebsever -Port 3306  # Should fail
```

### Test API Authentication
```powershell
# Without token (should fail)
curl https://spoot.wtf/api/soundscapes
# Expected: 401 Unauthorized

# With valid token
curl -H "Authorization: Bearer <token>" https://spoot.wtf/api/soundscapes
# Expected: 200 OK
```

### Test Reboot Resilience
```bash
# Reboot server
sudo reboot

# After reboot, verify services
sudo systemctl status audio-ar-api
sudo systemctl status fail2ban
sudo ufw status
```

---

## 📋 Quick Reference

### SSH Access (from Windows)
```powershell
# Simple SSH (key-based, no password)
ssh ssykes@macminiwebsever
```

### Check Security Status
```bash
# Firewall
sudo ufw status verbose

# fail2ban
sudo fail2ban-client status

# API service
sudo systemctl status audio-ar-api

# SSH service
sudo systemctl status ssh
```

### Emergency Access
If locked out (fail2ban ban or SSH issue):
1. Access server via console/physical access
2. Unban IP: `sudo fail2ban-client set sshd unbanip <YOUR_IP>`
3. Check logs: `sudo tail -50 /var/log/auth.log`

---

## 🔧 Maintenance

### Update System Packages
```bash
sudo apt update
sudo apt upgrade -y
```

### Check for Failed Login Attempts
```bash
sudo tail -100 /var/log/auth.log | grep "Failed password"
```

### View fail2ban Logs
```bash
sudo cat /var/log/fail2ban.log | grep -E "Ban|Unban" | tail -20
```

### Renew SSL Certificate
- Handled automatically by Cloudflare
- Check status: [Cloudflare Dashboard](https://dash.cloudflare.com)

---

## 📞 Security Contacts

| Issue | Action |
|-------|--------|
| Suspected breach | Change all passwords, review logs, rotate JWT secret |
| SSH compromised | Regenerate SSH keys, update `authorized_keys` |
| Database breach | Change database password, review user access |
| fail2ban issues | Check `/var/log/fail2ban.log` |

---

## 📚 Additional Resources

- [Ubuntu Security Features](https://ubuntu.com/security)
- [fail2ban Documentation](https://github.com/fail2ban/fail2ban)
- [UFW Guide](https://help.ubuntu.com/community/UFW)
- [SSH Best Practices](https://www.ssh.com/academy/ssh/best-practices)

---

**This document should be reviewed and updated after any security-related changes.**
