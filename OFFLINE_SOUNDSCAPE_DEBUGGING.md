# Offline Soundscape Debugging

## Problem

User reports: **"Can't hear any sound when using the soundscape offline (airplane mode)"**

## Root Cause Analysis

### Lazy Loading Disposal is NOT the Issue

When a soundscape is disposed during lazy loading:
- ✅ **Cache API is NOT affected** - audio files remain cached
- ❌ **Web Audio nodes are disposed** - freed from RAM only
- ✅ **Sounds reload from cache** when re-entering zone

**Architecture:**
```
Cache API (Persistent Storage)
  └─ soundscape-{id}
      ├─ audio1.mp3 (cached)
      └─ audio2.mp3 (cached)
          ↓ (cache.match())
Web Audio API (Runtime Memory)
  └─ AudioBuffer (decoded from cache)
      ↓ (disposed by lazy loading)
  ❌ Nodes disposed, but cache remains ✅
```

### Most Likely Causes

1. **GPS Not Updating in Airplane Mode** - Lazy loading requires GPS updates to trigger sound loading
2. **URL Mismatch** - Cache API uses exact URL matching
3. **Cache Not Persisted** - Browser cleared the cache
4. **Sounds Outside Activation Radius** - Lazy loading only loads sounds within range

## Solution: Comprehensive Debug Logging

### Files Modified

| File | Changes | Purpose |
|------|---------|---------|
| `map_player.js` | Added `window.debugLog()` | Global debug log for use by `spatial_audio.js` |
| `spatial_audio.js` | Updated `CachedSampleSource.load()` + `_getCachedResponse()` | Log cache hits/misses to UI |
| `spatial_audio_app.js` | Added logging in `_updateSoundZonesAndLoad()`, `start()` | Show URLs, distances, zone checks |

### What the Debug Logs Will Show

#### On Startup (When You Tap "Start"):

```
[12:34:56] 🎵 Soundscape loaded: 5 sound(s)
[12:34:56]   1. wp1 | 0m | 30m radius | ✅ IN RANGE
[12:34:56]       URL: https://ssykes.net/audio/bird.mp3
[12:34:56]   2. wp2 | 45m | 30m radius | ❌ OUT OF RANGE
[12:34:56]       URL: https://ssykes.net/audio/water.mp3
[12:34:56] 🔍 Checking for sounds in range at startup...
[12:34:56] 🔄 Checking sound zones for 5 sounds...
```

#### When Zone Check Runs (Every 1 Second):

```
[12:34:57] 🔄 Checking sound zones for 5 sounds...
[12:34:57] 🚀 LOAD: wp1 | URL: https://ssykes.net/audio/bird.mp3 | Distance: 0.0m | Type: buffer | Zone: active
[12:34:57] 📥 Loading 1 active zone sound(s)...
```

#### When CachedSampleSource Checks Cache:

```
[12:34:57] 📥 load() called for: https://ssykes.net/audio/bird.mp3
[12:34:57] 🔍 Checking 3 caches for: https://ssykes.net/audio/bird.mp3
[12:34:57] Cache soundscape-abc123 has 5 entries:
[12:34:57]   - https://ssykes.net/audio/bird.mp3
[12:34:57]   - https://ssykes.net/audio/water.mp3
[12:34:57] ✅ FOUND in soundscape-abc123: https://ssykes.net/audio/bird.mp3
[12:34:57] ✅ Found in cache: https://ssykes.net/audio/bird.mp3
[12:34:57] ✅ bird.mp3 loaded + started (with air absorption filter)
```

#### If GPS Fails (Airplane Mode):

```
[12:34:56] ❌ GPS ERROR: Position unavailable (code: 2)
[12:34:56] 💡 GPS unavailable - sounds may not load until you move
```

#### If Cache Miss (URL Mismatch):

```
[12:34:57] ❌ NOT in soundscape-abc123: https://ssykes.net/audio/bird.mp3
[12:34:57] ❌ NOT FOUND in any cache: https://ssykes.net/audio/bird.mp3
[12:34:57] 💡 User is OFFLINE - this sound was not downloaded or URL mismatch
[12:34:57] ❌ OFFLINE - Cannot fetch from network
[12:34:57] 💡 This sound was NOT downloaded for offline use
```

#### If All Sounds Outside Range:

```
[12:34:57] 🔄 Checking sound zones for 5 sounds...
[12:34:57] ⏸️ No sounds to load (all outside active zone or already loaded)
```

## Testing Instructions

### Step 1: Download Soundscape for Offline Use

1. Open `soundscape_picker.html` on PC
2. Tap 📥 **Download** on a soundscape
3. Wait for download to complete (✅ Available Offline)

### Step 2: Test Offline Playback

1. Open `map_player.html` on phone
2. Select the downloaded soundscape
3. **Turn off WiFi/cellular** (airplane mode)
4. Tap **▶️ Start**
5. Open debug modal (tap **🐛 Debug** button)
6. **Walk toward a waypoint** (important - lazy loading requires movement)

### Step 3: Analyze Debug Logs

**Expected (Working):**
```
🎵 Soundscape loaded: 5 sound(s)
  1. wp1 | 0m | 30m radius | ✅ IN RANGE
      URL: https://ssykes.net/audio/bird.mp3
🚀 LOAD: wp1 | URL: https://ssykes.net/audio/bird.mp3 | Distance: 0.0m
📥 load() called for: https://ssykes.net/audio/bird.mp3
✅ FOUND in soundscape-{id}: https://ssykes.net/audio/bird.mp3
✅ bird.mp3 loaded + started
```

**If GPS Not Updating (Airplane Mode Issue):**
```
❌ GPS ERROR: Position unavailable (code: 2)
💡 GPS unavailable - sounds may not load until you move
⏸️ No sounds to load (all outside active zone or already loaded)
```

**If URL Mismatch:**
```
❌ NOT in soundscape-{id}: https://ssykes.net/audio/bird.mp3
❌ NOT FOUND in any cache: https://ssykes.net/audio/bird.mp3
💡 User is OFFLINE - this sound was not downloaded or URL mismatch
```

**If Sounds Outside Range:**
```
🎵 Soundscape loaded: 5 sound(s)
  1. wp1 | 50m | 30m radius | ❌ OUT OF RANGE
      URL: https://ssykes.net/audio/bird.mp3
⏸️ No sounds to load (all outside active zone or already loaded)
```

## Common Issues & Solutions

### Issue 1: GPS Not Updating in Airplane Mode

**Symptom:** Debug shows "GPS ERROR" or no zone checks

**Cause:** Airplane mode disables GPS receiver on some devices

**Solution:** 
- Turn on WiFi (even without internet) - helps GPS triangulation
- Or: Use simulator mode on PC for testing
- Or: Pre-load sounds before going offline (walk to all waypoints while online)

### Issue 2: URL Mismatch

**Symptom:** Debug shows "NOT FOUND" but download succeeded

**Cause:** Download URL ≠ Playback URL

**Solution:** Ensure consistent URLs:
- Download: `https://ssykes.net/audio/x.mp3`
- Playback: Must be `https://ssykes.net/audio/x.mp3` (same protocol, domain, path)

### Issue 3: Sounds Outside Activation Radius

**Symptom:** Debug shows "OUT OF RANGE" for all sounds

**Cause:** Lazy loading only loads sounds within activation radius

**Solution:** 
- Walk toward a waypoint
- Or: Increase activation radius in editor
- Or: Disable lazy loading for testing (set all sounds to load at startup)

### Issue 4: Cache Cleared by Browser

**Symptom:** Debug shows "0 entries" in cache

**Cause:** Browser storage quota exceeded or timeout

**Solution:** Re-download soundscape

### Issue 5: Partial Download

**Symptom:** Some sounds play, others don't

**Cause:** Download interrupted before completion

**Solution:** Check download progress, retry failed files

## Files Changed

```
spatial_audio.js      v5.1 → v5.2  (CachedSampleSource debug logging)
spatial_audio_app.js  v2.8 → v2.9  (Zone check + startup logging)
map_player.js         v7.0 → v7.1  (Added window.debugLog global)
```

## Next Steps

1. **Test on phone** with debug logging enabled
2. **Share debug output** when offline playback fails
3. **Check URL matching** between download and playback
4. **Verify GPS is updating** in airplane mode
5. **Check cache contents** in DevTools → Application → Cache Storage

## Architecture Note

**Lazy loading disposal does NOT delete cached files:**

| Action | Cache API | Web Audio Nodes |
|--------|-----------|-----------------|
| Download for offline | ✅ Cached | N/A |
| Walk toward sound | ✅ Still cached | ✅ Loaded + playing |
| Walk away (dispose) | ✅ Still cached | ❌ Disposed (RAM freed) |
| Walk back | ✅ Still cached | ✅ Reloaded from cache |
| Page refresh | ✅ Still cached | ❌ Must reload |
| Delete offline button | ❌ Deleted | N/A |

**Only `OfflineDownloadManager.deleteOfflineCache()` deletes from Cache API.**

## Key Insight: Lazy Loading Requires GPS Updates

**Important:** The lazy loading system only checks for sounds to load when:
1. GPS position updates (user moves)
2. Zone check runs (once per second)

**In airplane mode:**
- GPS may not update on some devices
- Zone checks still run, but use stale position
- If position is stale, sounds may appear "out of range"

**Workaround:**
- Walk around (even in place) to trigger GPS updates
- Or: Use PC simulator mode for offline testing
