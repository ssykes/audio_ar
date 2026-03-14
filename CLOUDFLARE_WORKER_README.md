# Cloudflare Worker Deployment Guide

## Quick Deploy (5 minutes)

### Option 1: Cloudflare Dashboard (Easiest - No Installation)

1. **Go to Cloudflare Dashboard**
   - Visit: https://dash.cloudflare.com/
   - Select your account → `spoot.wtf`

2. **Create the Worker**
   - Left sidebar: **Workers & Pages** → **Create application**
   - Click: **Create Worker**
   - Name: `security-headers-spoot`
   - Click: **Deploy**

3. **Edit the Worker Code**
   - Click: **Edit code**
   - Delete the default code
   - Copy entire contents of `cloudflare-worker.js`
   - Paste into the editor
   - Click: **Save and deploy**

4. **Route the Worker to Your Site**
   - Go to: **Workers & Pages** → Select your worker
   - Click: **Settings** → **Triggers**
   - Under **Routes**, click: **Add route**
   - Route: `spoot.wtf/*`
   - Worker: `security-headers-spoot`
   - Click: **Add route**

5. **Test It**
   - Wait 1-2 minutes for propagation
   - Visit: https://observatory.mozilla.org/
   - Scan: `spoot.wtf`
   - Expected: **Score 100/100 (A+)**

---

### Option 2: Wrangler CLI (For Developers)

**Prerequisites:** Node.js installed

```bash
# Install Wrangler CLI
npm install -g wrangler

# Login to Cloudflare
wrangler login

# Initialize new worker
wrangler init security-headers-spoot
cd security-headers-spoot

# Replace worker.js content
# Copy cloudflare-worker.js content to src/index.js

# Update wrangler.toml
# Change name to "security-headers-spoot"
# Add route: spoot.wtf/*

# Deploy
wrangler deploy
```

**wrangler.toml configuration:**
```toml
name = "security-headers-spoot"
main = "src/index.js"
compatibility_date = "2024-01-01"

[[routes]]
pattern = "spoot.wtf/*"
zone_name = "spoot.wtf"
```

---

## Verification

After deployment, verify headers are working:

### Method 1: Browser DevTools
1. Open `https://spoot.wtf/map_placer.html`
2. Press F12 → **Network** tab
3. Refresh page
4. Click on `map_placer.html` request
5. Check **Response Headers** section
6. Look for:
   - `Content-Security-Policy`
   - `Strict-Transport-Security`
   - `X-Content-Type-Options`
   - `X-Frame-Options`
   - `Referrer-Policy`

### Method 2: Command Line
```bash
curl -kI https://spoot.wtf/map_placer.html
```

Expected output should include all security headers.

### Method 3: HTTP Observatory
```
https://observatory.mozilla.org/analyze/spoot.wtf
```

---

## Troubleshooting

### Headers Not Showing?

1. **Check Worker is Active**
   - Cloudflare Dashboard → Workers & Pages
   - Verify worker status is "Deployed"

2. **Check Route Configuration**
   - Worker → Settings → Triggers → Routes
   - Ensure `spoot.wtf/*` route exists and points to your worker

3. **Purge Cloudflare Cache**
   - Cloudflare Dashboard → Caching → Configuration
   - Click: **Purge Everything**
   - Wait 1-2 minutes

4. **Check Worker Logs**
   - Worker → Overview → **View logs**
   - Look for errors in real-time

### CSP Blocking Resources?

If legitimate resources are blocked:

1. Edit the Worker code
2. Add domains to the CSP `script-src`, `style-src`, etc.
3. Example: Add `https://maps.example.com` to `connect-src`
4. Save and redeploy

### HSTS Preload Warning?

The `preload` directive tells browsers to always use HTTPS.
Before submitting to preload list:
1. Test for 2 weeks with `includeSubDomains`
2. Verify all subdomains work on HTTPS
3. Then submit: https://hstspreload.org/

---

## Cost

- **Free Tier**: 100,000 requests/day (plenty for testing)
- **Paid**: $5/month for 10M requests

---

## Files

- `cloudflare-worker.js` - The Worker code (deploy this)
- `CLOUDFLARE_WORKER_README.md` - This guide

---

## Next Steps

After getting A+ rating:
1. Commit changes to Git
2. Document the Worker deployment for team
3. Set up monitoring (optional)
4. Consider HSTS preload list submission (after 2 weeks)
