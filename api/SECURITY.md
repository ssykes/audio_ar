# Audio AR API Security

## ✅ Current Security Measures

### 1. **Authentication**
- ✅ JWT tokens (7-day expiry)
- ✅ bcrypt password hashing (salt rounds: 10)
- ✅ Token-based API access
- ✅ User isolation (can only access own soundscapes)

### 2. **Rate Limiting** (Added 2026-03-14)
- ✅ **Auth endpoints**: 5 requests per 15 minutes
- ✅ **Soundscape operations**: 30 requests per minute
- ✅ Prevents spam and brute-force attacks

### 3. **Input Validation**
- ✅ Email format validation
- ✅ Password minimum length (6 chars)
- ✅ Parameterized SQL queries (SQL injection protection)

### 4. **CSP Headers**
- ✅ Content Security Policy via Cloudflare Worker
- ✅ X-Frame-Options, X-Content-Type-Options
- ✅ HTTPS enforcement (HSTS)

---

## 🚨 Known Limitations

### Not Implemented (Low Priority)
| Feature | Risk Level | Why Not Critical |
|---------|------------|------------------|
| Email verification | Low | Personal project, not public |
| Password reset | Low | You know your password |
| Account deletion UI | Low | Can delete via DB directly |
| 2FA/MFA | Low | Single user trust model |
| Login attempt logging | Low | Rate limiting prevents brute force |

---

## 🛠️ Maintenance

### Install Dependencies (On Server)
```bash
cd /var/www/html/api
npm install
```

### Test Rate Limiting
```bash
# Try to register 6 times quickly (6th should fail)
for i in {1..6}; do
  curl -X POST http://localhost:3000/api/auth/register \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"test$i@test.com\",\"password\":\"123456\"}"
done
```

### Cleanup Inactive Users
```bash
# On Mac mini server
cd /var/www/html/api

# Preview users to delete (30 days inactive)
node scripts/cleanup-users.js 30

# Actually delete them
CONFIRM_CLEANUP=yes node scripts/cleanup-users.js 30
```

### Manual Database Cleanup
```bash
# SSH to server
ssh ssykes@macminiwebsever

# Connect to PostgreSQL
sudo -u postgres psql audio_ar

# See all users
SELECT id, email, created_at FROM users ORDER BY created_at;

# Delete specific user (CASCades to soundscapes, waypoints, behaviors)
DELETE FROM users WHERE email = 'spam@test.com';

# See table sizes
SELECT 
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
```

---

## 🔐 Security Headers (spoot.wtf)

Cloudflare Worker adds these headers:

```
Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline' ...
Strict-Transport-Security: max-age=31536000; includeSubDomains
X-Content-Type-Options: nosniff
X-Frame-Options: SAMEORIGIN
Referrer-Policy: strict-origin-when-cross-origin
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Resource-Policy: same-origin
Permissions-Policy: geolocation=(self), microphone=(self), ...
```

---

## 📊 Attack Scenarios & Protections

| Attack | Protection | Status |
|--------|------------|--------|
| Brute force login | Rate limit (5/15min) + bcrypt | ✅ Protected |
| Spam registration | Rate limit (5/15min) + email validation | ✅ Protected |
| SQL injection | Parameterized queries | ✅ Protected |
| XSS | CSP headers | ✅ Protected |
| Clickjacking | X-Frame-Options | ✅ Protected |
| Unauthorized API access | JWT tokens | ✅ Protected |
| Data tampering | User isolation in queries | ✅ Protected |
| DDoS | Rate limiting (basic) | ⚠️ Partial (need Cloudflare Pro for advanced) |

---

## 🎯 Recommendations

### For Personal Use (Current)
✅ **Current security is SUFFICIENT**
- You're the only user
- Rate limiting prevents spam
- JWT + bcrypt protect auth
- CSP prevents XSS

### If Going Public (Future)
If you open this to the public, add:
1. **Email verification** (send confirmation link)
2. **Password reset flow** (email-based)
3. **reCAPTCHA** on registration (prevent bots)
4. **Account deletion UI** (GDPR compliance)
5. **Activity logging** (audit trail)
6. **Cloudflare Bot Protection** (advanced DDoS)

---

## 📝 Security Checklist

Before deploying updates:

```
[ ] npm install (install new dependencies)
[ ] Test rate limiting works
[ ] Verify JWT auth still works
[ ] Check CSP headers in browser console
[ ] Test on both macminiwebsever and spoot.wtf
[ ] Database backup before migrations
```

---

## 🆘 Emergency Procedures

### If Spam Attack Happens
```bash
# 1. Enable stricter rate limiting temporarily
# Edit api/middleware/rateLimiter.js, reduce max to 3

# 2. Delete spam users
CONFIRM_CLEANUP=yes node scripts/cleanup-users.js 7

# 3. Check server logs
tail -f /var/www/html/api/api.log

# 4. Consider IP blocking if persistent
# sudo ufw deny from ATTACKER_IP
```

### If Database Compromised
```bash
# 1. Take server offline temporarily
sudo systemctl stop apache2
sudo systemctl stop api-server

# 2. Change JWT_SECRET in .env
# Edit /var/www/html/api/.env, generate new secret:
# node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# 3. Restart services
sudo systemctl start api-server
sudo systemctl start apache2

# 4. All tokens invalidated, users must re-login
```

---

**Last Updated:** 2026-03-14  
**Security Level:** ✅ Suitable for personal/small group use
