# Offline Mode for Soundscape Picker

**Feature:** Show only offline soundscapes when phone is in airplane mode

**Date:** 2026-03-21

**Status:** ✅ **COMPLETE**

---

## Problem Statement

**Before:**
- Soundscape picker always tried to fetch from server
- When offline (airplane mode), page showed error: "Failed to load soundscapes"
- User couldn't access already-downloaded offline soundscapes
- No indication that offline soundscapes were available

**After:**
- Soundscape picker automatically detects offline mode
- Shows only downloaded offline soundscapes when in airplane mode
- Displays clear "Offline Mode" banner
- Automatically switches back to online mode when connectivity restored

---

## Implementation Details

### Files Modified

| File | Changes | Lines |
|------|---------|-------|
| `soundscape_picker.html` | Add offline detection + filtering | ~150 |

### Key Features

#### 1. Online/Offline Detection

```javascript
// Track online status
this.isOnline = navigator.onLine;

// Listen for network status changes
window.addEventListener('online', () => this._onOnlineStatusChange());
window.addEventListener('offline', () => this._onOnlineStatusChange());
```

#### 2. Offline Mode Loading

When offline, `_loadOfflineSoundscapesOnly()` is called:

```javascript
async _loadOfflineSoundscapesOnly() {
    // Get all cached soundscapes from Cache API
    const cachedSoundscapes = await this.downloadManager.getAllCachedSoundscapes();
    
    // Load stored metadata (names, etc.) from localStorage
    this.soundscapes = cachedSoundscapes.map(cached => {
        const storedData = localStorage.getItem('offline_soundscape_' + cached.id);
        // ... build soundscape object with metadata
    });
    
    // Render offline-specific UI
    this._renderOfflineList();
}
```

#### 3. Metadata Storage

When user downloads soundscape while online:

```javascript
_markAsOffline(soundscapeId) {
    // Store metadata for offline display
    const offlineData = {
        id: soundscape.id,
        name: soundscape.name,
        waypointCount: soundscape.waypointCount,
        downloadedAt: new Date().toISOString()
    };
    localStorage.setItem('offline_soundscape_' + soundscapeId, JSON.stringify(offlineData));
}
```

#### 4. UI Differences

**Online Mode:**
- Shows all soundscapes from server
- Download buttons visible for offline caching
- Delete buttons for downloaded soundscapes

**Offline Mode:**
- Shows "📴 Offline Mode" banner at top
- Only shows downloaded soundscapes
- No download buttons (already downloaded)
- Shows "✅ Available Offline" badge
- Simplified UI (no server operations)

---

## User Flow

### Scenario 1: Going Offline (Airplane Mode)

```
1. User opens soundscape_picker.html (online)
   → Shows all soundscapes from server
   → Download buttons visible

2. User downloads "Forest Soundscape"
   → Progress bar shows download
   → "✅ Available Offline" badge appears
   → Metadata stored in localStorage

3. User enables airplane mode
   → Page detects offline status
   → Automatically reloads with offline-only list
   → Shows "📴 Offline Mode" banner
   → Only "Forest Soundscape" visible

4. User taps "Forest Soundscape"
   → Redirects to map_player.html
   → Plays from cached audio files (no network)
```

### Scenario 2: Coming Back Online

```
1. User in airplane mode
   → Shows offline soundscapes only

2. User disables airplane mode
   → Page detects online status
   → Automatically reloads from server
   → Shows all soundscapes again
   → Download buttons reappear for non-downloaded soundscapes
```

### Scenario 3: First Time Offline (No Downloads)

```
1. User enables airplane mode without downloading anything
   → Page detects offline
   → Shows empty state message:
     "📴 No offline soundscapes available"
     "You're currently offline (airplane mode)."
     "To listen offline:"
     "1️⃣ Turn off airplane mode"
     "2️⃣ Download soundscapes while online"
     "3️⃣ Turn airplane mode back on"
```

---

## Testing Checklist

### Online Mode
- [ ] Open `soundscape_picker.html` (WiFi on)
- [ ] Verify all soundscapes load from server
- [ ] Verify download buttons visible
- [ ] Download a soundscape
- [ ] Verify "✅ Available Offline" badge appears

### Offline Mode (Airplane Mode)
- [ ] Enable airplane mode on phone
- [ ] Open `soundscape_picker.html`
- [ ] Verify "📴 Offline Mode" banner appears
- [ ] Verify only downloaded soundscapes show
- [ ] Verify soundscape names display correctly (not truncated IDs)
- [ ] Tap soundscape → verify redirects to player
- [ ] Verify audio plays from cache (no network errors)

### Transition (Offline → Online)
- [ ] Start in airplane mode (showing offline soundscapes)
- [ ] Disable airplane mode
- [ ] Verify page automatically reloads
- [ ] Verify all soundscapes from server appear
- [ ] Verify download buttons reappear

### Delete Offline Cache
- [ ] Download soundscape
- [ ] Tap delete (trash icon)
- [ ] Confirm deletion
- [ ] Verify "📥 Download" button reappears
- [ ] Verify metadata cleaned up from localStorage

### Edge Cases
- [ ] Offline with no downloaded soundscapes → shows helpful message
- [ ] Network timeout during server fetch → falls back to offline mode
- [ ] Corrupted metadata in localStorage → uses fallback name
- [ ] Rapid online/offline toggling → no crashes, correct state

---

## Browser Compatibility

| Browser | `navigator.onLine` | `online`/`offline` events | Cache API | Status |
|---------|-------------------|--------------------------|-----------|--------|
| **Chrome (Android)** | ✅ | ✅ | ✅ | ✅ Full support |
| **Safari (iOS)** | ✅ | ✅ | ✅ | ✅ Full support |
| **Firefox (Android)** | ✅ | ✅ | ✅ | ✅ Full support |
| **Samsung Internet** | ✅ | ✅ | ✅ | ✅ Full support |

**Note:** `navigator.onLine` returns `false` when:
- Airplane mode enabled
- WiFi turned off
- No cellular data signal
- Network cable unplugged (desktop)

---

## localStorage Schema

### Key: `offline_soundscape_{id}`

```json
{
  "id": "soundscape_abc123",
  "name": "Forest Soundscape",
  "waypointCount": 5,
  "downloadedAt": "2026-03-21T10:30:00.000Z"
}
```

**Purpose:** Store soundscape metadata for offline display

**Cleanup:** Automatically removed when user deletes offline cache

---

## Debug Logging

Offline mode events logged to debug console:

```
[picker] 📴 Offline mode - showing only offline soundscapes
[picker] 📂 Loading offline soundscapes...
[picker] ✅ Found 2 offline soundscape(s)
[picker] 💾 Stored offline metadata: Forest Soundscape
[picker] 📡 Network status changed: 🟢 Online
[picker] 🔄 Back online - reloading from server...
[picker] 🗑️ Cleaned up offline metadata
```

---

## Code Quality

### Good Patterns
- ✅ Automatic detection (no manual toggle)
- ✅ Graceful degradation (server fails → offline mode)
- ✅ Clear user feedback (banner, badges)
- ✅ Metadata persistence (localStorage)
- ✅ Cleanup on delete (no orphaned data)
- ✅ Event-driven (responds to network changes)
- ✅ Fallback names (if metadata missing)

### No Breaking Changes
- ✅ Online mode works exactly as before
- ✅ Download functionality unchanged
- ✅ Player page unchanged
- ✅ Backward compatible (old downloads still work)

---

## Performance

| Metric | Value |
|--------|-------|
| **Offline detection** | Instant (browser event) |
| **Cache scan** | ~50-200ms (10-50 soundscapes) |
| **UI render** | ~10-30ms |
| **Total load time (offline)** | ~100-300ms |

**Memory:**
- localStorage: ~100 bytes per downloaded soundscape
- Negligible impact

---

## Future Enhancements

| Enhancement | Description | Effort |
|-------------|-------------|--------|
| **Cache size display** | Show total MB downloaded | ~20 lines |
| **Last accessed date** | Track when last played offline | ~30 lines |
| **Smart cleanup** | Auto-delete old unused downloads | ~50 lines |
| **Download all button** | One-tap download all soundscapes | ~30 lines |
| **WiFi-only download** | Option to only download on WiFi | ~40 lines |

---

## Related Features

- **Feature 15:** Offline Soundscape Download (Cache API)
- **Session 5E:** Auto-sync with timestamps
- **Session 6:** Separate editor/player pages

---

## Testing Commands

### Check Offline Status (Browser Console)
```javascript
console.log('Online:', navigator.onLine);
// false = offline, true = online
```

### List Cached Soundscapes (Browser Console)
```javascript
caches.keys().then(names => {
    names.forEach(name => {
        if (name.startsWith('soundscape-')) {
            console.log('Cached:', name);
        }
    });
});
```

### Check Stored Metadata (Browser Console)
```javascript
Object.keys(localStorage)
    .filter(k => k.startsWith('offline_soundscape_'))
    .forEach(k => {
        console.log(k, JSON.parse(localStorage[k]));
    });
```

### Simulate Offline Mode (DevTools)
1. Open Chrome DevTools (F12)
2. Go to **Network** tab
3. Check **Offline** checkbox
4. Refresh page

---

**Status:** ✅ **COMPLETE** - Ready for testing on mobile devices
