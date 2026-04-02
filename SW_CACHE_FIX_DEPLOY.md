# Service Worker Cache Fix - Deploy Instructions

**Date:** 2026-04-02  
**Issue:** Service Worker not properly implemented - stale code could get stuck in cache

---

## Changes Made

### 1. **sw.js** - Added sw-register.js to cache
- **File:** `sw.js`
- **Change:** Added `'sw-register.js'` to `FILES_TO_CACHE` array
- **Why:** Required for offline support when pages use the shared registration module

### 2. **soundscape_picker.html** - Use sw-register.js
- **File:** `soundscape_picker.html`
- **Change:** Replaced inline SW registration with `<script src="sw-register.js?v=...">`
- **Why:** Enables auto-reload when new SW activates, version checking, BroadcastChannel notifications

### 3. **map_player.html** - Use sw-register.js
- **File:** `map_player.html`
- **Change:** Replaced inline SW registration with `<script src="sw-register.js?v=...">`
- **Why:** Enables auto-reload when new SW activates, version checking, BroadcastChannel notifications

### 4. **cloudflare-worker.js** - Bypass cache for .js files
- **File:** `cloudflare-worker.js`
- **Change:** Added explicit cache bypass for `.js`, `.html`, `.css` files
- **Why:** Cloudflare was caching `sw.js` with `CF-Cache-Status: HIT` (4-hour TTL), preventing users from getting updates

---

## Deploy Steps

### Step 1: Deploy Cloudflare Worker First

**IMPORTANT:** Deploy this BEFORE running `deploy.ps1` to ensure fresh SW is served immediately.

1. Go to https://dash.cloudflare.com/
2. Navigate to **Workers & Pages**
3. Select your worker (e.g., "security-headers-spoot")
4. Click **Edit Code**
5. Replace entire code with contents of `cloudflare-worker.js`
6. Click **Save and Deploy**
7. Wait 30 seconds for propagation

### Step 2: Verify Cloudflare Cache Fix

```powershell
powershell -Command "$headers = (Invoke-WebRequest -Uri 'https://ssykes.net/sw.js' -UseBasicParsing).Headers; $headers.GetEnumerator() | Where-Object {$_.Key -like '*cache*'} | ForEach-Object { Write-Host $_.Key ':' $_.Value }"
```

**Expected Output:**
```
CF-Cache-Status : DYNAMIC
Cache-Control   : no-cache, no-store, must-revalidate
```

If you still see `HIT`, wait 1-2 minutes and try again.

### Step 3: Run Deploy Script

```powershell
& .\deploy.ps1
```

This will:
- Update all cache-busting versions
- Upload all files to server
- Update `sw.js` internal `CACHE_VERSION`

### Step 4: Verify Service Worker Registration

1. Open `https://ssykes.net/soundscape_picker.html`
2. Open browser DevTools (F12)
3. Go to **Console** tab
4. Look for:
   ```
   [sw-register.js] Loaded v1.2
   [SW] 📡 Registering new Service Worker...
   [SW] ✅ Registered: https://ssykes.net/
   ```

### Step 5: Verify Cache Version

In browser console:
```javascript
navigator.serviceWorker.getRegistration().then(reg => {
  if (reg && reg.active) {
    const channel = new MessageChannel();
    channel.port1.onmessage = (e) => {
      console.log('SW Version:', e.data.version);
    };
    reg.active.postMessage({ type: 'CACHE_VERSION' }, [channel.port2]);
  }
});
```

**Expected:** Version matches the timestamp from `deploy.ps1` output.

### Step 6: Test Auto-Reload on Next Deploy

1. Make a small change to any JS file
2. Run `& .\deploy.ps1` again
3. Refresh `soundscape_picker.html`
4. You should see:
   ```
   [SW] 🔄 Version changed (OLD → NEW) - unregistering old SW
   [SW] 📡 Registering new Service Worker...
   [SW] 🔄 Auto-reloading to use new SW
   ```
5. Page should auto-reload automatically

---

## What Was Fixed

### Before (❌ Broken)
```
User → Cloudflare (cached sw.js for 4h) → Old Service Worker → Stale Cache
```

**Problems:**
- Cloudflare cached `sw.js` for 4 hours
- No version checking on page load
- No auto-reload when SW updated
- Users had to manually clear cache

### After (✅ Fixed)
```
User → Cloudflare (DYNAMIC, no cache) → sw-register.js → Version Check → Fresh Service Worker → Auto-Reload
```

**Improvements:**
- Cloudflare bypasses cache for `.js` files
- `sw-register.js` handles registration with version checking
- Auto-reload when new SW activates
- BroadcastChannel notifies all tabs of updates

---

## Files Modified

| File | Change | Deploy Action |
|------|--------|---------------|
| `sw.js` | Added `sw-register.js` to cache list | Auto-uploaded by `deploy.ps1` |
| `soundscape_picker.html` | Use `sw-register.js` | Auto-uploaded by `deploy.ps1` |
| `map_player.html` | Use `sw-register.js` | Auto-uploaded by `deploy.ps1` |
| `cloudflare-worker.js` | Bypass cache for `.js` | **Manual deploy to Cloudflare** |
| `sw-register.js` | No change (already correct) | Auto-uploaded by `deploy.ps1` |

---

## Rollback Plan

If issues occur, revert to direct SW registration:

### Option 1: Quick Rollback (soundscape_picker.html)
```html
<!-- Replace this line: -->
<script src="sw-register.js?v=20260402125004"></script>

<!-- With this: -->
<script>
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js?v=20260402125004')
            .then((reg) => console.log('✅ SW registered:', reg.scope))
            .catch((err) => console.error('❌ SW registration failed:', err));
    }
</script>
```

### Option 2: Disable Cloudflare Worker
1. Cloudflare Dashboard → **Workers & Pages**
2. Select your worker
3. Click **Delete** or **Disable Route**
4. Wait 1 minute

---

## Testing Checklist

- [ ] Cloudflare shows `CF-Cache-Status: DYNAMIC` for `sw.js`
- [ ] `soundscape_picker.html` loads without errors
- [ ] Console shows `[sw-register.js] Loaded`
- [ ] Console shows `[SW] ✅ Registered`
- [ ] Service Worker version matches deploy timestamp
- [ ] Offline mode still works (airplane mode test)
- [ ] Auto-reload works on next deploy

---

## Troubleshooting

### Issue: CF-Cache-Status still shows HIT

**Solution:**
1. Wait 2-3 minutes (Cloudflare propagation)
2. Purge Cloudflare cache: Dashboard → Caching → Configuration → Purge Everything
3. Check Cloudflare Worker is actually deployed (Workers → View Code)

### Issue: sw-register.js not loading

**Solution:**
1. Check browser console for 404 errors
2. Verify file exists: `https://ssykes.net/sw-register.js`
3. Check `deploy.ps1` uploaded it (look for "sw-register.js 100% [OK]")

### Issue: Auto-reload not working

**Solution:**
1. Check console for `[SW] 🔄 Version changed` message
2. Verify BroadcastChannel not blocked (check browser settings)
3. Test in different browser (Chrome recommended)

### Issue: Offline mode broken

**Solution:**
1. Check `sw.js` cached `sw-register.js`: DevTools → Application → Cache → Cache Storage → audio-ar-VERSION
2. If missing, re-run deploy
3. Clear cache and reload: `caches.delete('audio-ar-VERSION')` then reload page

---

## Next Steps

After successful deploy:
1. Test on mobile device (phone/tablet)
2. Test offline mode (airplane mode)
3. Monitor for any user reports of stale content
4. Consider adding cache integrity checks (see SERVICE_WORKER_DOCUMENTATION.md)

---

**Last Updated:** 2026-04-02  
**Status:** Ready to deploy
