# Martinez Integration - Deployment Checklist

**Date:** 2026-03-31  
**Feature:** Intersection-based crossfade for overlapping polygon areas  
**Version:** spatial_audio.js v6.0, spatial_audio_app.js v3.0

---

## ✅ Pre-Deployment Verification

### Files Modified

- [x] `martinez.min.js` - Library added (8 KB)
- [x] `spatial_audio.js` - v6.0: New methods added
- [x] `spatial_audio_app.js` - v3.0: `_mixAreas()` updated
- [x] `map_player.html` - Script tag added
- [x] `map_editor_v2.html` - Script tag added
- [x] `deploy.ps1` - Martinez deployment added
- [x] `cloudflare-worker.js` - CSP comment updated (no functional change)
- [x] `sw.js` - No changes needed (already handles cache-busting)

---

## ✅ Cloudflare Configuration

### 1. Cloudflare Worker (cloudflare-worker.js)

**Status:** ✅ **NO CHANGES NEEDED**

The CSP already allows `'self'` which includes `martinez.min.js`:

```javascript
"script-src 'self' 'unsafe-inline' https://unpkg.com ..."
```

**Action Required:** None - martinez.min.js is served from same origin

**Comment Updated:** Added documentation comment for future reference

### 2. Cloudflare Dashboard Settings

**Verify these settings in Cloudflare Dashboard:**

1. **Caching → Configuration**
   - ✅ Caching Level: `No Query String` (already set per CLOUDFLARE_CACHE_TROUBLESHOOTING.md)
   - This ensures cache-busting versions work correctly

2. **Caching → Browser Cache TTL**
   - ✅ Should be: `Respect Existing Headers`
   - Allows .htaccess no-cache headers to work

3. **Speed → Optimization**
   - ✅ Auto Minify: JavaScript (optional, already minified)

---

## ✅ Service Worker Status

### sw.js Analysis

**Status:** ✅ **NO CHANGES NEEDED**

**Why No Changes Needed:**

1. **Cache-Busting Handled:**
   ```javascript
   // From sw.js line 17:
   // JS/CSS files have cache-busting query strings, don't cache them here
   ```

2. **Network-First for HTML:**
   - HTML pages use network-first with 3s timeout
   - Fresh code deployed every time

3. **Query String Bypass:**
   - `martinez.min.js?v=20260331180813` bypasses SW cache
   - Always loads fresh version from network

**Service Worker Behavior:**

| Request Type | Strategy | Martinez Handling |
|--------------|----------|-------------------|
| `map_player.html` | Network-first | ✅ Fresh HTML |
| `martinez.min.js?v=...` | Not cached by SW | ✅ Fresh JS |
| `spatial_audio.js?v=...` | Not cached by SW | ✅ Fresh JS |
| Map tiles | Cache-first | ✅ Unchanged |
| Audio files | Skipped | ✅ Unchanged |

---

## ✅ Simulator/Map Player Compatibility

### map_player.html

**Status:** ✅ **WILL WORK**

```html
<!-- Line 498 -->
<script src="martinez.min.js?v=20260331180813"></script>
<script src="api-client.js?v=20260331180813"></script>
...
<script src="spatial_audio.js?v=20260331180813"></script>
```

**Load Order:**
1. ✅ martinez.min.js (provides `martinez` global)
2. ✅ spatial_audio.js (uses `martinez` in `GPSUtils.martinezIntersection()`)
3. ✅ spatial_audio_app.js (calls `GPSUtils.martinezIntersection()`)

### map_editor_v2.html

**Status:** ✅ **WILL WORK**

```html
<!-- Line 1270 -->
<script src="martinez.min.js?v=20260331180813"></script>
<script src="api-client.js?v=20260331180813"></script>
...
<script src="spatial_audio.js?v=20260331180813"></script>
```

**Same load order as map_player.html** ✅

---

## ✅ Cache-Busting Implementation

### Deploy Script (deploy.ps1)

**Pattern Definition (Line 118):**
```powershell
$MARTINEZ_PATTERN = 'martinez\.min\.js(\?v=\d+)?'
```

**HTML Update (Lines 217-220):**
```powershell
if ($content -match $MARTINEZ_PATTERN) {
    $content = $content -replace $MARTINEZ_PATTERN, "martinez.min.js?v=$VERSION"
    Set-Content $filePath $content -NoNewline
    Write-Host "  Updated: $htmlFile (martinez.min.js)" -ForegroundColor Green
}
```

**Deployment Copy (Line 303):**
```powershell
$content = $content -replace '(martinez\.min\.js)"', "`${1}?v=$VERSION`""
```

**Files Array (Line 345):**
```powershell
"martinez.min.js"  # ← Included in deployment
```

### Version Update Flow

```
1. Run: & .\deploy.ps1
2. Script generates: $VERSION = "20260331180813"
3. Updates HTML files: martinez.min.js?v=20260331180813
4. Creates .deploy copies with versions
5. Uploads to server
6. Strips versions from working directory (pre-commit hook)
```

**Result:**
- ✅ Server has: `martinez.min.js?v=20260331180813`
- ✅ Working directory has: `martinez.min.js` (clean for git)
- ✅ Browser loads fresh version every deploy

---

## 🚀 Deployment Steps

### 1. Deploy to Test Server

```powershell
& .\deploy.ps1
```

**Expected Output:**
```
Version: 20260331180813

Updating cache-busting version numbers...
  Updated: map_player.html (martinez.min.js)
  Updated: map_editor_v2.html (martinez.min.js)

Files to deploy: 30
Server: ssykes@192.168.86.49:/var/www/html

   Uploading: martinez.min.js [OK]
   Uploading: map_player.html (with cache-busting) [OK]
   Uploading: map_editor_v2.html (with cache-busting) [OK]
   ...
```

### 2. Verify Deployment

**Check martinez.min.js uploaded:**
```powershell
Invoke-WebRequest -Uri "https://ssykes.net/martinez.min.js" -UseBasicParsing | 
    Select-Object StatusCode, Headers
# Expected: StatusCode: 200
```

**Check HTML has cache-busting:**
```powershell
Invoke-WebRequest -Uri "https://ssykes.net/map_player.html" -UseBasicParsing | 
    Select-Object -ExpandProperty Content | 
    Select-String "martinez.min.js"
# Expected: martinez.min.js?v=20260331180813
```

### 3. Test in Browser

**Open test page:**
```
https://ssykes.net/test_martinez.html
```

**Run all tests:**
1. ✅ Library Load Test
2. ✅ Basic Intersection Test
3. ✅ GPSUtils Integration Test
4. ✅ Crossfade Position Test
5. ✅ Map Visualization

**Check console:**
```javascript
// Expected output:
✅ PASS: Martinez library loaded successfully
✅ PASS: Intersection computed successfully
✅ PASS: GPSUtils.martinezIntersection() works
✅ PASS: Crossfade position calculation working
```

### 4. Field Test (Mobile)

**On mobile device:**
1. Navigate to: `https://ssykes.net/map_player.html`
2. Start audio
3. Load soundscape with overlapping polygon areas
4. Walk through intersection
5. Listen for smooth crossfade

**Expected behavior:**
- Area 1 fades out smoothly as you walk toward Area 2
- No abrupt volume changes
- Equal-power crossfade (constant perceived loudness)

**Debug logging (5% throttle):**
```
[AreaManager] Crossfade: pos=0.45, area1=0.78, area2=0.62
```

---

## 🔍 Troubleshooting

### Issue: Martinez Not Loaded

**Symptoms:**
```
Console error: martinez is not defined
```

**Check:**
1. Verify martinez.min.js uploaded:
   ```
   https://ssykes.net/martinez.min.js
   ```
2. Check load order in HTML (martinez must be first)
3. Check browser network tab for 404

**Solution:**
```powershell
# Re-deploy
& .\deploy.ps1
```

### Issue: Crossfade Not Working

**Symptoms:**
- Equal distribution (50/50) instead of position-based

**Check:**
1. Console for errors
2. Debug logging: `[AreaManager] Crossfade: pos=...`
3. Verify 2 areas only (3+ uses fallback)

**Solution:**
- Check `overlapMode: 'mix'` on both areas
- Verify polygons actually overlap
- Check GPSUtils.getCrossfadePosition() returns valid value (0-1)

### Issue: Old Version Cached

**Symptoms:**
- Changes not appearing after deploy

**Check:**
```powershell
# Force Cloudflare cache purge
curl -X POST "https://api.cloudflare.com/client/v4/zones/ZONE_ID/purge_cache" \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  --data '{"files":["https://ssykes.net/martinez.min.js"]}'
```

**Solution:**
1. Hard refresh browser (Ctrl+Shift+R)
2. Clear browser cache
3. Check Cloudflare Caching Level = "No Query String"

---

## 📊 Post-Deployment Verification

### Checklist

- [ ] martinez.min.js accessible: `https://ssykes.net/martinez.min.js`
- [ ] HTML has cache-busting: `martinez.min.js?v=...`
- [ ] No console errors in map_player.html
- [ ] Test page passes all 5 tests
- [ ] Debug logging shows crossfade values
- [ ] Smooth audio transition in field test
- [ ] No performance issues (CPU/memory)

### Performance Metrics

**Expected:**
- Intersection computation: <5ms
- Crossfade calculation: <1ms
- Memory overhead: ~100 bytes per intersection
- No audible glitches during crossfade

**Monitor:**
```javascript
// Console logging (throttled to 5%)
[AreaManager] Crossfade: pos=0.45, area1=0.78, area2=0.62
```

---

## 📝 Rollback Plan

If issues arise:

### 1. Quick Rollback

```powershell
# Revert spatial_audio.js and spatial_audio_app.js to previous versions
git checkout HEAD~1 spatial_audio.js spatial_audio_app.js
git checkout HEAD~1 map_player.html map_editor_v2.html

# Redeploy
& .\deploy.ps1
```

### 2. Disable Martinez (Fallback)

If martinez library causes issues, code falls back to Sutherland-Hodgman:

```javascript
// In spatial_audio.js, line ~360:
if (typeof martinez === 'undefined') {
    console.warn('[GPSUtils] martinez library not loaded, falling back to Sutherland-Hodgman');
    return this.polygonIntersection(subject, clip);
}
```

**To force fallback:**
```html
<!-- Remove martinez script tag temporarily -->
<!-- <script src="martinez.min.js"></script> -->
```

---

## ✅ Summary

| Component | Status | Notes |
|-----------|--------|-------|
| Cloudflare Worker | ✅ No changes | CSP already allows 'self' |
| Service Worker | ✅ No changes | Cache-busting handled |
| map_player.html | ✅ Ready | Script tag added |
| map_editor_v2.html | ✅ Ready | Script tag added |
| deploy.ps1 | ✅ Ready | Martinez deployment added |
| Cache-busting | ✅ Complete | All patterns added |
| .htaccess | ✅ No changes | Already allows same-origin |
| Documentation | ✅ Complete | FEATURE_17_*.md created |

**Ready to Deploy:** ✅ Yes

**Deploy Command:**
```powershell
& .\deploy.ps1
```

**Test URL:**
```
https://ssykes.net/test_martinez.html
```

---

**Last Updated:** 2026-03-31  
**Version:** spatial_audio.js v6.0, spatial_audio_app.js v3.0
