# Service Worker Re-Activation Guide

**Date Created:** 2026-03-30  
**Status:** ⚠️ **SERVICE WORKER CURRENTLY DISABLED**

---

## 🔍 Current Status

The Service Worker is **completely disabled** across all pages to prevent cache-related bugs during development.

**Disabled in:**
- ✅ `soundscape_picker.html` (line 536)
- ✅ `map_editor_v2.html` (line 1247)
- ✅ `map_player.html` (line 478)

**Console messages you'll see:**
```
[soundscape_picker] ⚠️ Service Worker disabled for development
[map_editor_v2] ⚠️ Service Worker disabled for development
[map_player] ⚠️ Service Worker disabled for development
```

---

## 📋 Steps to Re-Activate Service Worker

### Step 1: Remove Disable Comments in `soundscape_picker.html`

**File:** `soundscape_picker.html`  
**Line:** ~535-555

**Current (Disabled):**
```html
<!-- Service Worker Registration (for offline support - mobile only) -->
<!-- ⚠️ SERVICE WORKER TEMPORARILY DISABLED (2026-03-30) - causes cache issues during development -->
<script>
    console.log('[soundscape_picker] ⚠️ Service Worker disabled for development');
    console.log('[soundscape_picker] ℹ️ Offline playback unavailable until SW re-enabled');

    // Unregister any existing SW and clear caches
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations().then((registrations) => {
            for (const registration of registrations) {
                registration.unregister();
            }
        });
        caches.keys().then((names) => {
            for (const name of names) {
                caches.delete(name);
            }
        });
    }
</script>
```

**Change to (Enabled):**
```html
<!-- Service Worker Registration (for offline support - mobile only) -->
<script>
    // Register Service Worker for offline support
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js?v=' + Date.now())
            .then((registration) => {
                console.log('✅ Service Worker registered:', registration.scope);
            })
            .catch((error) => {
                console.error('❌ Service Worker registration failed:', error);
            });
    }
</script>
```

---

### Step 2: Remove Disable Comments in `map_editor_v2.html`

**File:** `map_editor_v2.html`  
**Line:** ~1246-1259

**Current (Disabled):**
```html
<!-- Unregister Service Worker (desktop-only, no offline support) -->
<!-- ⚠️ SERVICE WORKER TEMPORARILY DISABLED (2026-03-30) - causes cache issues during development -->
<script>
    console.log('[map_editor_v2] ⚠️ Service Worker disabled for development');
    console.log('[map_editor_v2] ℹ️ Offline playback unavailable until SW re-enabled');

    // Add cache-busting timestamp...
    if (window.location.search.indexOf('nocache=') === -1) {
        // ...cache-busting code...
    }

    // Unregister any existing Service Workers
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations().then((registrations) => {
            for (const registration of registrations) {
                registration.unregister();
            }
        });
    }
</script>
```

**Change to (Disabled - Keep Unregister for Desktop):**
```html
<!-- Unregister Service Worker (desktop-only, no offline support) -->
<script>
    // Add cache-busting timestamp...
    if (window.location.search.indexOf('nocache=') === -1) {
        // ...cache-busting code...
    }

    // Desktop editor doesn't need offline support - unregister SW
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations().then((registrations) => {
            for (const registration of registrations) {
                registration.unregister();
            }
        });
    }
</script>
```

**Note:** Keep the unregister code for `map_editor_v2.html` since it's desktop-only and doesn't need offline support.

---

### Step 3: Remove Disable Comments in `map_player.html`

**File:** `map_player.html`  
**Line:** ~477-496

**Current (Disabled):**
```html
<!-- Service Worker Registration (for offline support) -->
<!-- ⚠️ SERVICE WORKER TEMPORARILY DISABLED (2026-03-30) - causes cache issues during development -->
<script>
    console.log('[map_player] ⚠️ Service Worker disabled for development');
    console.log('[map_player] ℹ️ Offline playback unavailable until SW re-enabled');

    // Unregister any existing SW and clear caches
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations().then((registrations) => {
            for (const registration of registrations) {
                registration.unregister();
            }
        });
        caches.keys().then((names) => {
            for (const name of names) {
                caches.delete(name);
            }
        });
    }
</script>
```

**Change to (Enabled):**
```html
<!-- Service Worker Registration (for offline support) -->
<script>
    // Register Service Worker for offline support
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js?v=' + Date.now())
            .then((registration) => {
                console.log('✅ Service Worker registered:', registration.scope);
            })
            .catch((error) => {
                console.error('❌ Service Worker registration failed:', error);
            });
    }
</script>
```

---

### Step 4: Update Navigation Code in `soundscape_picker.html`

**File:** `soundscape_picker.html`  
**Lines:** ~1409 and ~1480

**Current (No unregister):**
```javascript
// Desktop or Tablet Editor: Go to map_editor_v2.html
console.log('[SoundscapePicker] Editor mode → map_editor_v2.html');
this._debugLog(`[picker] ➡️ Redirecting to map_editor_v2.html...`, 'info');

// Service Worker is already disabled on page load (no need to unregister)

window.location.href = 'map_editor_v2.html';
```

**Change to (Re-add unregister for editor):**
```javascript
// Desktop or Tablet Editor: Go to map_editor_v2.html
console.log('[SoundscapePicker] Editor mode → map_editor_v2.html');
this._debugLog(`[picker] ➡️ Redirecting to map_editor_v2.html...`, 'info');

// Unregister Service Worker before navigating to desktop editor
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then((registrations) => {
        for (const registration of registrations) {
            registration.unregister();
            console.log('[SoundscapePicker] 📴 Service Worker unregistered before navigating to map_editor_v2');
        }
    });
}

window.location.href = 'map_editor_v2.html';
```

---

### Step 5: Clear Browser Cache

Before testing, clear all cached data:

**Chrome/Edge:**
1. Press `Ctrl+Shift+Delete` (Windows) or `Cmd+Shift+Delete` (Mac)
2. Select "All time"
3. Check "Cached images and files"
4. Click "Clear data"

**Firefox:**
1. Press `Ctrl+Shift+Delete` (Windows) or `Cmd+Shift+Delete` (Mac)
2. Select "Everything"
3. Check "Cache"
4. Click "Clear Now"

**Safari:**
1. Develop menu → Empty Caches
2. Safari → Preferences → Privacy → Manage Website Data → Remove All

---

### Step 6: Verify Service Worker is Active

Open browser console and look for:

**✅ Success Messages:**
```
✅ Service Worker registered: /
[soundscape_picker] Service Worker active
```

**❌ If you still see disable messages:**
```
[soundscape_picker] ⚠️ Service Worker disabled for development
```

Then you missed a step - go back and check all files.

---

### Step 7: Test Offline Mode

1. **Load the app while online:**
   - Go to `soundscape_picker.html`
   - Select a soundscape
   - Wait for it to fully load

2. **Go offline:**
   - Chrome DevTools → Network tab → Select "Offline"
   - Or disconnect from WiFi

3. **Test offline playback:**
   - Refresh the page
   - The app should still work
   - Sounds should play from cache

4. **Check Cache Storage:**
   - Chrome DevTools → Application tab → Cache Storage
   - You should see `soundscape-xxx` caches

---

## 🐛 Troubleshooting

### Service Worker Not Registering

**Check:**
1. Is `sw.js` file present in the root directory?
2. Are you serving over HTTPS or localhost? (SW requires secure context)
3. Check console for registration errors

**Fix:**
```javascript
// Add error logging
navigator.serviceWorker.register('sw.js?v=' + Date.now())
    .then((registration) => {
        console.log('✅ SW registered:', registration.scope);
        console.log('✅ SW state:', registration.installing?.state);
    })
    .catch((error) => {
        console.error('❌ SW registration failed:', error);
        console.error('❌ Error details:', error.message);
    });
```

### Cache Not Working

**Check:**
1. Is the soundscape downloaded for offline use?
2. Check Application → Cache Storage for `soundscape-xxx` entries
3. Check Application → Service Workers → "SkipWaiting" button

**Fix:**
```javascript
// Force cache update
caches.keys().then(names => {
    console.log('📦 Available caches:', names);
    names.forEach(name => {
        caches.open(name).then(cache => {
            cache.keys().then(requests => {
                console.log(`📄 ${name} contains:`, requests.map(r => r.url));
            });
        });
    });
});
```

### Old Cache Persisting

**Nuclear option - clear everything:**
```javascript
// Run in console
navigator.serviceWorker.getRegistrations().then(regs => {
    regs.forEach(reg => reg.unregister());
});
caches.keys().then(names => {
    names.forEach(name => caches.delete(name));
});
location.reload(true);
```

---

## 📚 Reference Documentation

- `SERVICE_WORKER_REFACTOR.md` - Full SW architecture
- `SERVICE_WORKER_DOCUMENTATION.md` - SW API reference
- `CLOUDFLARE_CACHE_TROUBLESHOOTING.md` - CDN cache issues
- `LAZY_LOADING_ARCHITECTURE.md` - Audio caching strategy

---

## ⚠️ Important Notes

1. **Desktop Editor (`map_editor_v2.html`)** should **NOT** use Service Worker - it's online-only
2. **Mobile Player (`map_player.html`)** should use Service Worker for offline playback
3. **Cache-busting** is critical - always use version query strings: `sw.js?v=20260330`
4. **Test on actual mobile devices** - desktop browser emulation isn't reliable for SW

---

**Last Updated:** 2026-03-30  
**Status:** ⚠️ **DISABLED** - Follow steps above to re-activate
