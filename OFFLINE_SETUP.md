# Audio AR - Offline PWA Setup

## What Was Created

### Files
| File | Purpose |
|------|---------|
| `service-worker.js` | Background worker that caches files |
| `manifest.json` | Makes app installable on devices |
| `icon-192.svg` | App icon (192x192) |
| `icon-512.svg` | App icon (512x512) |
| `offline.html` | Shown when completely offline |

### Updated Files
- `audio_ar_app.html` - Registers service worker
- `index.html` - Registers service worker
- `auto_rotate.html` - Registers service worker

---

## How It Works

### First Visit (Requires Internet)
1. User visits `http://ssykes.net/audio_ar_app.html`
2. Service Worker downloads and caches:
   - All HTML pages
   - `spatial_audio.js` library
   - Icons and manifest
3. App works normally

### Subsequent Visits (No Internet Needed)
1. User visits the page
2. Service Worker serves cached files
3. **App works completely offline**
4. GPS still works (doesn't need internet)

### When Back Online
1. Service Worker checks for updates every hour
2. If files changed, updates cache in background
3. Next visit uses new version

---

## How to Use

### Step 1: Upload All Files
```powershell
scp e:\vsCode\workspaces\wifi_midi_player\*.html ssykes@macminiwebsever:/var/www/html/
scp e:\vsCode\workspaces\wifi_midi_player\*.js ssykes@macminiwebsever:/var/www/html/
scp e:\vsCode\workspaces\wifi_midi_player\*.json ssykes@macminiwebsever:/var/www/html/
scp e:\vsCode\workspaces\wifi_midi_player\*.svg ssykes@macminiwebsever:/var/www/html/
```

### Step 2: Visit Once with WiFi
- Go to `http://ssykes.net/audio_ar_app.html`
- Wait for page to fully load
- Check browser console for: `✅ Service Worker registered`

### Step 3: Go Offline
- Turn off WiFi/cellular
- Visit the page again
- **It should work!**

---

## Install as App (Optional)

### On Android (Chrome)
1. Visit the page
2. Tap menu (⋮) → "Install app" or "Add to Home screen"
3. App appears on home screen
4. Opens like native app (no browser UI)

### On iOS (Safari)
1. Visit the page
2. Tap Share button → "Add to Home Screen"
3. App appears on home screen
4. Opens in standalone mode

---

## What's Cached

### Always Cached
- ✅ `audio_ar_app.html` - Main app
- ✅ `spatial_audio.js` - Audio library
- ✅ `index.html` - Panning test
- ✅ `auto_rotate.html` - Rotate test
- ✅ `manifest.json` - App config
- ✅ Icons

### Not Cached (Always Fresh)
- ❌ GPS data (live from device)
- ❌ Compass heading (live from device)
- ❌ Large audio files (unless you add them)

---

## Testing Offline Mode

### Chrome DevTools
1. Open page
2. Press F12 → Application tab
3. Service Workers → Check "Offline"
4. Reload page - should still work

### Real Device
1. Visit page with WiFi ON
2. Wait for "Service Worker registered"
3. Turn WiFi OFF
4. Visit page again - should work

---

## Updating the App

When you change code:

1. **Update cache version** in `service-worker.js`:
   ```javascript
   const CACHE_NAME = 'audio-ar-v2'; // Increment version
   ```

2. **Upload new files**:
   ```powershell
   scp *.html ssykes@macminiwebsever:/var/www/html/
   scp *.js ssykes@macminiwebsever:/var/www/html/
   ```

3. **Users get update automatically**:
   - Service Worker detects changes
   - Downloads new version in background
   - Uses new version on next visit

---

## Troubleshooting

### "Service Worker registration failed"
- Check HTTPS (required for production)
- Check file paths are correct
- Clear browser cache and try again

### "Page doesn't work offline"
- Visit page ONCE with internet first
- Check browser console for errors
- Verify files are in cache (DevTools → Application → Cache Storage)

### "GPS doesn't work"
- GPS requires HTTPS in most browsers
- Make sure location permissions granted
- Some devices need "high accuracy" mode enabled

---

## Next Steps

### Optional Enhancements

1. **Add sound files to cache**:
   ```javascript
   // In service-worker.js
   const AUDIO_ASSETS = [
     '/sounds/ocean.wav',
     '/sounds/forest.wav'
   ];
   ```

2. **Add cache status UI**:
   ```javascript
   // Show "Ready for offline" badge
   navigator.serviceWorker.ready.then(() => {
     showOfflineBadge();
   });
   ```

3. **Add update notification**:
   ```javascript
   // Notify user when new version available
   registration.onupdatefound = () => {
     showUpdateNotification();
   };
   ```

---

## File Structure

```
/var/www/html/
├── audio_ar_app.html      # Main GPS AR app
├── index.html             # Panning test
├── auto_rotate.html       # Rotate test
├── offline.html           # Offline fallback page
├── spatial_audio.js       # Audio library v3.0
├── service-worker.js      # Offline caching
├── manifest.json          # PWA manifest
├── icon-192.svg           # App icon
├── icon-512.svg           # App icon
└── architecture.md        # Documentation
```

---

## Benefits

✅ **No cellular needed** after first visit
✅ **Works in remote areas** (parks, trails, etc.)
✅ **Fast loading** (from local cache)
✅ **Reliable** (won't fail if network drops)
✅ **Installable** (appears like native app)
✅ **Auto-updates** (when back online)
