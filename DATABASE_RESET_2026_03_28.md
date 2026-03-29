# Database Reset & PM2 Configuration - 2026-03-28

## Summary
Reset the database and fixed PM2 environment variable caching issues.

---

## Commands to Reset Database

### 1. Drop and recreate database
```bash
sudo -u postgres psql -c "DROP DATABASE IF EXISTS audio_ar WITH (FORCE);"
sudo -u postgres psql -c "CREATE DATABASE audio_ar OWNER ssykes;"
```

### 2. Load schema
```bash
# Copy schema to server first
scp api/database/schema.sql ssykes@macminiwebsever:~/

# Then on server
cat schema.sql | sudo -u postgres psql -d audio_ar
```

### 3. Create app user and grant permissions
```bash
sudo -u postgres psql -c "CREATE USER audio_ar_user WITH PASSWORD '11suSan11';"
sudo -u postgres psql -d audio_ar -c "GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO audio_ar_user;"
sudo -u postgres psql -d audio_ar -c "GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO audio_ar_user;"
```

### 4. Clean up orphaned tables (if any)
```bash
# Note: "user" is a reserved keyword - don't try to drop it!
sudo -u postgres psql -d audio_ar -c 'DROP TABLE IF EXISTS "user";'
```

---

## PM2 Environment Variable Issue

### Problem
After changing `.env`, PM2 continued using cached environment variables, causing:
```
Error: SASL: SCRAM-SERVER-FIRST-MESSAGE: client password must be a string
```

### Root Cause
PM2 caches environment variables when a process starts. Changes to `.env` are **not** automatically picked up on restart.

### Solution: Create `ecosystem.config.js`

**File:** `/var/www/html/api/ecosystem.config.js`

```javascript
module.exports = {
  apps: [{
    name: 'api',
    script: 'server.js',
    cwd: '/var/www/html/api',
    env: {
      NODE_ENV: 'development',
      PORT: 3000
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: 3000
    }
  }]
};
```

### Apply the fix
```bash
pm2 delete api
cd /var/www/html/api && pm2 start ecosystem.config.js
pm2 save
```

### Verify
```bash
# Test DB connection with app's .env
cd /var/www/html/api && node -e "
require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.query('SELECT NOW()', (err, res) => {
  console.log(err || res.rows);
  pool.end();
});
"
```

---

## Key Lessons

| Issue | Solution |
|-------|----------|
| PM2 doesn't reload `.env` on restart | Use `ecosystem.config.js` with `cwd` set to API directory |
| `--update-env` required every time | `ecosystem.config.js` makes this unnecessary |
| Can't drop `user` table | `user` is a reserved SQL keyword (system view), not a real table |
| Permission denied on new tables | Grant permissions to both `ssykes` and `audio_ar_user` |
| `.env` on server differs from local | Always verify with `cat` on the server |

---

## Quick Reference

### Check PM2 environment
```bash
pm2 show api | grep -A20 "env"
```

### Restart with new .env (if not using ecosystem config)
```bash
pm2 restart api --update-env
```

### Test database connection
```bash
PGPASSWORD=11suSan11 psql -h localhost -U audio_ar_user -d audio_ar -c "\dt"
```

### View PM2 logs
```bash
pm2 logs api --lines 50
```

---

## Files Updated
- `/var/www/html/api/.env` - Database credentials
- `/var/www/html/api/ecosystem.config.js` - PM2 configuration (NEW)
- `api/database/schema.sql` - Loaded fresh

---

**Status:** ✅ Resolved - API authentication working
