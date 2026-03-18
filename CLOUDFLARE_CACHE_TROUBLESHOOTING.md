# Cloudflare Cache Troubleshooting Guide

## ⚠️ Current Status for ssykes.net (Updated 2026-03-18)

**Diagnosis:** Cloudflare **IS** caching JavaScript files despite `.htaccess` no-cache headers.

**Test Command:**
```powershell
Invoke-WebRequest -Uri "https://ssykes.net/map_player.js" -UseBasicParsing | 
    Select-Object -ExpandProperty Headers | 
    Where-Object {$_.Key -eq "CF-Cache-Status"}
```

**Result:**
```
CF-Cache-Status: HIT  ← Cloudflare is caching!
Cache-Control: max-age=14400  ← Cached for 4 hours
```

**Problem:** Cloudflare is overriding your origin's `no-cache` headers and caching JS files for 4 hours.

**Solution:** Change Cloudflare cache settings (see **Option 3** below - recommended for ssykes.net).

---

## Quick Check: Is Cloudflare Caching My JavaScript?

### Method 1: Check Response Headers (Fastest)

**Browser DevTools:**
1. Open DevTools (F12)
2. Go to **Network** tab
3. Load your page
4. Click on a `.js` file
5. Look for `cf-cache-status` header

**Expected values:**
| Value | Meaning | Action Needed? |
|-------|---------|----------------|
| `DYNAMIC` | ✅ Cloudflare respecting origin headers | No |
| `BYPASS` | ✅ Cloudflare skipping cache | No |
| `MISS` | ✅ Cloudflare fetched from origin | No |
| `HIT` | ⚠️ Cloudflare served from cache | Maybe |
| `EXPIRED` | ⚠️ Cache was stale, just refreshed | Maybe |

### Method 2: PowerShell Test

```powershell
# Check Cloudflare cache status for a specific file
$response = Invoke-WebRequest -Uri "https://ssykes.net/map_player.js" -Method Head
$response.Headers["cf-cache-status"]
```

---

## If Cloudflare IS Caching (cf-cache-status: HIT)

### Option 1: Purge Cache via Script

```powershell
# Purge specific file
.\purge-cloudflare-cache.ps1 -File map_player.js

# Purge everything
.\purge-cloudflare-cache.ps1
```

**Note:** Requires API token configuration in the script.

**⚠️ For ssykes.net:** This is a temporary fix. Cache will rebuild after 4 hours. Use Option 3 for permanent fix.

### Option 2: Purge via Cloudflare Dashboard

1. Go to https://dash.cloudflare.com/
2. Select `ssykes.net`
3. **Caching** → **Configuration**
4. Click **Purge Everything** (or **Custom Purge** for specific files)
5. Wait 30 seconds
6. Hard refresh browser: `Ctrl+Shift+R`

**⚠️ For ssykes.net:** This is a temporary fix. Cache will rebuild after 4 hours. Use Option 3 for permanent fix.

### Option 3: Change Caching Level (RECOMMENDED for ssykes.net)

**This is the permanent fix for ssykes.net!**

**Why this works:**
- Your HTML uses query strings: `map_player.js?v=20260317233153`
- "No Query String" mode tells Cloudflare: "Don't cache URLs with query strings"
- Your JS files will show `CF-Cache-Status: DYNAMIC` instead of `HIT`

**Steps:**
1. Cloudflare Dashboard → **Caching** → **Configuration**
2. Set **Caching Level** to **`No Query String`**
3. Wait 1-2 minutes for changes to propagate
4. Test: Run the PowerShell test command above
5. Expected result: `CF-Cache-Status: DYNAMIC` or `BYPASS`

**Alternative: Set to "Standard"**
- If "No Query String" breaks other things, use "Standard"
- Then add Cache Rule from Option 4 below

### Option 4: Add Cache Rule to Bypass JavaScript

**Use this if Option 3 doesn't work or you need more control:**

**Permanent fix - tells Cloudflare to never cache JS:**

1. Cloudflare Dashboard → **Caching** → **Cache Rules**
2. Click **Create Rule**
3. Configure:
   ```
   Rule name: Bypass Cache for JavaScript
   If...: File Extension → equals → js
   Then...: Cache Level → Bypass
   ```
4. Click **Deploy**

**For ssykes.net:** Add these rules:
| Rule Name | Condition | Action |
|-----------|-----------|--------|
| Bypass JavaScript | File Extension = js | Cache Level = Bypass |
| Bypass HTML | File Extension = html | Cache Level = Bypass |
| Bypass CSS | File Extension = css | Cache Level = Bypass |

### Option 5: Check Page Rules (Legacy)

**Older Cloudflare accounts may have Page Rules:**

1. Cloudflare Dashboard → **Rules** → **Page Rules**
2. Look for rules matching `ssykes.net/*.js`
3. Check if "Cache Level" is set to "Cache Everything"
4. If yes, either:
   - Delete the rule, OR
   - Change to "Bypass Cache"

---

## Prevention: Configure Cloudflare Correctly

### Recommended Settings for ssykes.net

**⚠️ Important:** Your `.htaccess` no-cache headers are being **ignored** by Cloudflare.
You must configure Cloudflare dashboard settings - origin headers alone won't work.

**Caching → Configuration:**
| Setting | Value | Why |
|---------|-------|-----|
| Caching Level | **`No Query String`** | Your JS/CSS use `?v=` query strings - this bypasses cache automatically |
| Browser Cache TTL | `Respect Existing Headers` | Lets browsers respect your .htaccess |

**Alternative (if "No Query String" breaks things):**
| Setting | Value |
|---------|-------|
| Caching Level | `Standard` |
| Cache Rules | Add rules below |

**Caching → Cache Rules (if using "Standard" mode):**
| Rule Name | Condition | Action |
|-----------|-----------|--------|
| Bypass JavaScript | File Extension = js | Cache Level = Bypass |
| Bypass HTML | File Extension = html | Cache Level = Bypass |
| Bypass CSS | File Extension = css | Cache Level = Bypass |

### Your Current .htaccess (Good, but Overridden by Cloudflare!)

```apache
# Disable caching for HTML and JavaScript files
<FilesMatch "\.(html|htm|js)$">
    Header set Cache-Control "no-cache, no-store, must-revalidate"
    Header set Pragma "no-cache"
    Header set Expires "0"
</FilesMatch>
```

**Problem:** Cloudflare is ignoring these headers and caching for 4 hours (`max-age=14400`).

**Solution:** Use Cloudflare Dashboard settings above (Option 3) to make Cloudflare respect your origin headers.

**After fixing Cloudflare settings, expected behavior:**
```
Origin sends: Cache-Control: no-cache, no-store
Cloudflare sees: cf-cache-status: DYNAMIC
Cloudflare does: NOT cache the file
Browser gets: Fresh file every time
```

---

## Testing After Changes

### 1. Clear Everything Locally
```
1. Clear browser history (all time)
2. Close browser completely
3. Reopen browser
```

### 2. Test with Fresh Request
```powershell
# Add timestamp to force fresh request
$url = "https://ssykes.net/map_player.js?t=$(Get-Date -Format yyyyMMddHHmmss)"
Invoke-WebRequest -Uri $url -Method Head | Select-Object -ExpandProperty Headers
```

### 3. Check cf-cache-status
- Should be `DYNAMIC`, `BYPASS`, or `MISS`
- If still `HIT`, Cloudflare is caching despite your settings

---

## Quick Reference Commands

```powershell
# Check cache status
curl -I https://ssykes.net/map_player.js | findstr cf-cache-status

# Purge specific file (if script configured)
.\purge-cloudflare-cache.ps1 -File map_player.js

# Purge everything (if script configured)
.\purge-cloudflare-cache.ps1

# Test with no-cache header
curl -I -H "Cache-Control: no-cache" https://ssykes.net/map_player.js
```

---

## Common Issues

### Issue: cf-cache-status still shows HIT after purge

**Causes:**
- Multiple Cloudflare data centers (some may have old cache)
- Browser service worker caching
- Corporate proxy caching

**Solutions:**
1. Wait 5 minutes (some edge cases take longer)
2. Check for service workers: DevTools → Application → Service Workers → Unregister
3. Test from different network (phone on cellular)

### Issue: Query strings not working (?v= still cached)

**Cause:** Cloudflare caching query string URLs

**Solution:**
1. Cloudflare Dashboard → **Caching** → **Configuration**
2. Set **Caching Level** to `No Query String`
3. This tells Cloudflare: "Ignore query strings for caching"

### Issue: API script fails with 403

**Cause:** Invalid API token

**Solution:**
1. Cloudflare Dashboard → **Profile** → **API Tokens**
2. Create new token with "Edit Cloudflare Apps" template
3. Copy token to `purge-cloudflare-cache.ps1`
4. Find Zone ID in Dashboard → Overview (right sidebar)

---

## Contact Info

If you're still having cache issues:
1. Check all the above steps
2. Contact Cloudflare support (if on paid plan)
3. Or post in Cloudflare community forums

**Useful diagnostic info to gather:**
- `cf-cache-status` header value
- Your Cloudflare Caching Level setting
- Any Page Rules or Cache Rules you have configured
- Output from: `curl -I https://ssykes.net/map_player.js`
