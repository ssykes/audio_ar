# Deploy Security Updates to Mac Mini

## Quick Deploy (5 minutes)

### 1. SSH to Server
```powershell
ssh ssykes@macminiwebsever
```

### 2. Install New Dependency
```bash
cd /var/www/html/api
npm install express-rate-limit
```

### 3. Deploy Updated Files
```powershell
# From your PC (PowerShell)
scp api/routes/auth.js ssykes@macminiwebsever:/var/www/html/api/routes/
scp api/routes/soundscapes.js ssykes@macminiwebsever:/var/www/html/api/routes/
scp api/middleware/rateLimiter.js ssykes@macminiwebsever:/var/www/html/api/middleware/
scp api/scripts/cleanup-users.js ssykes@macminiwebsever:/var/www/html/api/scripts/
scp api/SECURITY.md ssykes@macminiwebsever:/var/www/html/api/
```

### 4. Restart API Server
```bash
# On Mac mini
cd /var/www/html/api
pkill -f "node server.js"
nohup node server.js > api.log 2>&1 &

# Verify it's running
ps aux | grep node
curl http://localhost:3000/api/health
```

---

## Test Rate Limiting

### Test Auth Rate Limit (Should fail on 6th attempt)
```bash
# On Mac mini
for i in {1..6}; do
  echo "Attempt $i:"
  curl -X POST http://localhost:3000/api/auth/register \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"test$i@test.com\",\"password\":\"123456\"}" \
    | grep -E "(error|token)"
  echo ""
done
```

Expected: First 5 succeed, 6th returns `"error": "Too many requests"`

### Test Invalid Email (Should reject)
```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"notanemail\",\"password\":\"123456\"}"
```

Expected: `"error": "Invalid email format"`

### Test Short Password (Should reject)
```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"test@test.com\",\"password\":\"123\"}"
```

Expected: `"error": "Password must be at least 6 characters"`

---

## Verify Security Headers

```bash
# Check CSP headers
curl -I https://spoot.wtf/map_editor.html | grep -i "content-security-policy"

# Should include:
# - https://unpkg.com
# - https://tile.openstreetmap.org
# - NO Cross-Origin-Embedder-Policy: require-corp
```

---

## Cleanup Old Test Users (Optional)

```bash
# Preview users to delete (30 days inactive)
cd /var/www/html/api
node scripts/cleanup-users.js 30

# Actually delete them
CONFIRM_CLEANUP=yes node scripts/cleanup-users.js 30
```

---

## Troubleshooting

### API Won't Start
```bash
# Check logs
cat /var/www/html/api/api.log

# Check Node version
node --version  # Should be v16+

# Check dependencies
cd /var/www/html/api
npm install
```

### Rate Limiting Not Working
```bash
# Check if middleware loaded
grep -r "rateLimit" /var/www/html/api/

# Restart API server
pkill -f "node server.js"
nohup node server.js > api.log 2>&1 &
```

---

**Deployed:** 2026-03-14  
**Security Level:** ✅ Rate-limited + validated
