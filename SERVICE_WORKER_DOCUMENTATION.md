# Service Worker Documentation

## Overview

The Audio AR app uses a **Service Worker** to enable offline playback of downloaded soundscapes. The Service Worker caches HTML pages, JavaScript libraries, and CDN resources, allowing the app to function without an internet connection.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Service Worker (sw.js)                                     │
├─────────────────────────────────────────────────────────────┤
│  Cache: audio-ar-v1                                         │
│  ├─ HTML Pages                                              │
│  │  ├─ soundscape_picker.html                              │
│  │  ├─ map_player.html                                     │
│  │  └─ map_offline.html                                    │
│  ├─ JavaScript Libraries                                    │
│  │  ├─ api-client.js                                       │
│  │  ├─ soundscape.js                                       │
│  │  ├─ download_manager.js                                 │
│  │  ├─ spatial_audio.js                                    │
│  │  ├─ spatial_audio_app.js                                │
│  │  ├─ map_shared.js                                       │
│  │  ├─ map_player.js                                       │
│  │  └─ wake_lock_helper.js                                 │
│  ├─ CDN Resources                                           │
│  │  ├─ leaflet.css (OpenStreetMap)                         │
│  │  └─ leaflet.js (OpenStreetMap)                          │
│  └─ Static Assets                                           │
│     ├─ manifest.json                                        │
│     └─ icon-192.svg                                         │
└─────────────────────────────────────────────────────────────┘
```

---

## What Gets Cached

### 1. Service Worker Cache (`audio-ar-v1`)

**Managed by:** `sw.js`

**Contents:**
- HTML pages (picker, player, offline)
- JavaScript libraries
- Leaflet CSS/JS (from unpkg CDN)
- Static assets (manifest, icons)

**Size:** ~500 KB

**Purpose:** Enable app to load without network

---

### 2. Offline Soundscapes Cache (`soundscape-{id}`)

**Managed by:** `OfflineDownloadManager` (download_manager.js)

**Contents:**
- Audio files (MP3, WAV, etc.) for each downloaded soundscape
- One cache per soundscape: `soundscape-abc123`, `soundscape-def456`, etc.

**Size:** Variable (5-100 MB per soundscape, depending on audio)

**Purpose:** Store audio files for offline playback

---

### 3. localStorage

**Managed by:** `OfflineDownloadManager` + `SoundscapePickerApp`

**Contents:**
- `offline_soundscape_full_{id}` - Full soundscape metadata + waypoints
- `audio_ar_token` - Authentication token
- `sw_ready` - Service Worker activation status

**Size:** ~10 KB per soundscape

**Purpose:** Store metadata for offline soundscape list

---

## How It Works

### Installation (First Visit - Online)

```javascript
// 1. User visits soundscape_picker.html (online)
// 2. Service Worker registers automatically
navigator.serviceWorker.register('sw.js?v=20260321000000')

// 3. Service Worker install event fires
sw.js → 'install' event → cache.addAll(FILES_TO_CACHE)

// 4. All pages + libraries cached
console.log('[SW] ✅ All resources cached successfully')

// 5. Service Worker activates
sw.js → 'activate' event → self.clients.claim()

// 6. Status indicator shows "✅ Ready for offline"
```

---

### Download Soundscape (Online)

```javascript
// 1. User clicks "Download" on a soundscape
// 2. OfflineDownloadManager downloads audio files
downloadManager.downloadSoundscape(id, name, waypoints)

// 3. Audio files stored in Cache API
cacheName = `soundscape-${id}`
cache.put(url, response)

// 4. Metadata stored in localStorage
localStorage.setItem('offline_soundscape_full_' + id, JSON.stringify(data))

// 5. UI shows "✅ Available Offline"
```

---

### Offline Playback (Airplane Mode)

```javascript
// 1. User enables airplane mode
// 2. User opens soundscape_picker.html

// 3. Service Worker intercepts request
sw.js → 'fetch' event → caches.match(request)
console.log('[SW] 📦 CACHE HIT: soundscape_picker.html')

// 4. Page loads from cache (no network)
// 5. Login check detects offline
_checkLoginStatus() → navigator.onLine === false
→ Check token + offline soundscapes
→ Allow access (skip server verification)

// 6. Offline soundscapes displayed
loadOfflineSoundscapesOnly()
→ Read from localStorage
→ Show list

// 7. User selects soundscape
→ Redirect to map_player.html
→ Service Worker serves from cache
→ Audio loads from soundscape-{id} cache
→ Playback works offline ✅
```

---

## Service Worker Strategies

### Cache-First (HTML/JS/CSS)

```javascript
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request)
      .then((cachedResponse) => {
        if (cachedResponse) {
          // Serve from cache
          return cachedResponse;
        }
        
        // Fetch from network, cache for next time
        return fetch(event.request)
          .then((networkResponse) => {
            if (networkResponse.status === 200) {
              const clone = networkResponse.clone();
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(event.request, clone);
              });
            }
            return networkResponse;
          });
      })
  );
});
```

---

### Pass-Through (Audio Files)

Service Worker **skips** audio file requests, letting `CachedSampleSource` handle them directly:

```javascript
// Skip audio files (managed by OfflineDownloadManager)
if (url.pathname.match(/\.(mp3|wav|ogg|m4a|aac|flac)($|\?)/i)) {
  console.log('[SW] ⏭️ Skipping audio file');
  return; // Let CachedSampleSource handle it
}
```

---

### Pass-Through (API Requests)

Service Worker **skips** API requests, letting `api-client.js` handle them:

```javascript
// Skip API requests
if (url.pathname.startsWith('/api/')) {
  console.log('[SW] ⏭️ Skipping API request');
  return; // Let api-client.js handle it
}
```

---

### Fallback (Map Tiles)

When offline, map tiles show a placeholder instead of breaking:

```javascript
if (url.hostname.includes('tile.openstreetmap.org')) {
  return new Response(
    '<svg>Offline</svg>',
    { headers: { 'Content-Type': 'image/svg+xml' } }
  );
}
```

---

## Files

### `sw.js`

**Location:** `/sw.js`

**Purpose:** Service Worker script

**Key Functions:**
- `install` event - Cache all resources
- `activate` event - Clean old caches, claim clients
- `fetch` event - Serve from cache or network

**Cache Name:** `audio-ar-v1`

**Version:** Updated via `deploy.ps1` (query string)

---

### `soundscape_picker.html`

**Service Worker Registration:**
```html
<script>
  navigator.serviceWorker.register('sw.js?v=20260321000000')
    .then((registration) => {
      console.log('✅ Service Worker registered');
    });
</script>
```

**Status Indicator:** Shows SW state in top-right corner
- ⏳ Installing...
- ✅ Ready for offline
- 🟢 Online
- 📴 Offline (cached)
- ❌ Offline (not cached)

---

### `map_player.html`

**Service Worker Registration:** Same as picker

**Offline Behavior:**
- Loads from Service Worker cache
- Skips login verification when offline
- Audio loads from `soundscape-{id}` cache

---

### `deploy.ps1`

**Updates:**
1. Adds cache-busting version to `sw.js` reference
2. Uploads `sw.js` to server

**Pattern:**
```powershell
$SW_VERSION_PATTERN = 'sw\.js\?v=\d+'
$content = $content -replace $SW_VERSION_PATTERN, "sw.js?v=$VERSION"
```

---

### `.git/hooks/pre-commit`

**Strips cache-busting versions** before committing:
```bash
sed -i.bak 's/\(src="\|href="\)\([^"]*\)\?v=[0-9]\{14\}"/\1\2"/g' "$file"
```

**Result:** Git has clean versions, server has versioned versions

---

## Testing

### 1. Verify Installation (Online)

```javascript
// Open browser console
// Look for:
[SW] Service Worker script loaded
[SW] Install event
[SW] Opening cache: audio-ar-v1
[SW] Caching 13 local files
[SW] Caching 2 CDN resources
[SW] ✅ All resources cached successfully
[SW] Activate event
[SW] ✅ Activation complete
[SW] Claiming all clients
```

**Status indicator:** Should show "✅ Ready for offline"

---

### 2. Verify Caching (Online)

```javascript
// Open DevTools → Application → Cache → Cache Storage
// Should see:
// - audio-ar-v1 (Service Worker cache)
// - soundscape-{id} (downloaded audio)

// Check audio-ar-v1 contents:
// - soundscape_picker.html
// - map_player.html
// - api-client.js
// - ... (all files)
```

---

### 3. Test Offline (Airplane Mode)

```
1. Enable airplane mode
2. Refresh soundscape_picker.html
3. Page should load (from Service Worker cache)
4. Status indicator shows "📴 Offline (cached)"
5. Offline soundscapes listed
6. Select soundscape → map_player.html loads
7. Audio plays (from soundscape-{id} cache)
```

---

## Troubleshooting

### Service Worker Not Installing

**Symptom:** Status shows "⏳ Installing..." forever

**Fix:**
1. Check console for errors
2. Verify `sw.js` exists on server
3. Check HTTPS (Service Workers require HTTPS)
4. Clear browser cache, hard refresh

---

### Page Not Loading Offline

**Symptom:** "You're Offline" page or blank screen

**Fix:**
1. Verify Service Worker installed while online
2. Check console: `[SW] 📦 CACHE HIT` vs `CACHE MISS`
3. Ensure page was visited while online first
4. Check DevTools → Application → Service Workers

---

### Audio Not Playing Offline

**Symptom:** Page loads but no audio

**Fix:**
1. Verify soundscape was downloaded (check `soundscape-{id}` cache)
2. Check console: `CachedSampleSource` logs
3. Ensure `OfflineDownloadManager` stored metadata
4. Check localStorage: `offline_soundscape_full_{id}` exists

---

### Stale Content

**Symptom:** Old version of page shows after update

**Fix:**
```javascript
// Force Service Worker update
navigator.serviceWorker.getRegistrations().then((registrations) => {
  registrations.forEach((reg) => reg.unregister());
});
location.reload();
```

Or: DevTools → Application → Service Workers → Unregister

---

## Browser Support

| Browser | Support | Notes |
|---------|---------|-------|
| Chrome Android | ✅ Full | Best support |
| Chrome Desktop | ✅ Full | |
| Safari iOS | ✅ Full | iOS 11.3+ |
| Firefox Android | ✅ Full | |
| Samsung Internet | ✅ Full | |
| Edge | ✅ Full | Chromium-based |

---

## Security Considerations

### Authentication

**Offline Mode:**
- Token checked (must exist in localStorage)
- Server verification **skipped** when offline
- Access granted only if:
  - Token exists AND
  - Offline soundscapes exist

**Risk:** Low (offline content only, read-only)

---

### Cache Storage Limits

| Browser | Limit |
|---------|-------|
| Chrome | ~6% of disk (up to 2-3 GB) |
| Safari iOS | ~50 MB (can request more) |
| Firefox | ~2 GB |

**Audio files** stored in separate caches (`soundscape-{id}`), not counted against Service Worker cache limit.

---

## Cleanup

### Clear Service Worker Cache

```javascript
// In browser console
caches.delete('audio-ar-v1').then(() => {
  console.log('✅ Service Worker cache cleared');
  location.reload();
});
```

---

### Clear All Offline Data

```javascript
// Clear Service Worker cache
caches.keys().then(names => {
  names.forEach(name => caches.delete(name));
});

// Clear localStorage
Object.keys(localStorage).forEach(key => {
  if (key.startsWith('offline_soundscape_') || 
      key.startsWith('audio_ar_')) {
    localStorage.removeItem(key);
  }
});

// Unregister Service Worker
navigator.serviceWorker.getRegistrations().then(regs => {
  regs.forEach(reg => reg.unregister());
});

location.reload();
```

---

### User-Facing Cleanup

**Android Chrome:**
1. Settings → Site settings → All sites
2. Find your site → Clear & reset

**iOS Safari:**
1. Settings → Safari → Advanced → Website Data
2. Find your site → Delete

---

## Future Enhancements

### Background Sync

When online, automatically sync played soundscapes:
```javascript
// Register background sync
registration.sync.register('sync-analytics');
```

### Push Notifications

Notify users when new soundscapes available:
```javascript
// Subscribe to push
registration.pushManager.subscribe({ userVisibleOnly: true });
```

### Cache Versioning

Automatically update cache when app version changes:
```javascript
const CACHE_VERSION = 'audio-ar-v2';
// On activate, delete old version
```

---

## References

- [MDN Service Worker API](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API)
- [Google Service Workers Guide](https://developers.google.com/web/fundamentals/primers/service-workers)
- [Cache API Documentation](https://developer.mozilla.org/en-US/docs/Web/API/Cache)
