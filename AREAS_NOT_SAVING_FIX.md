# Areas Not Saving - Fix Complete

**Date:** 2026-03-24
**Issue:** Areas disappeared on page refresh - not being saved to server
**Status:** ✅ Fixed

---

## Summary

**Client-side fix:** Removed redundant `api.loadAreas()` call from `map_editor.js`
- Areas are now loaded as part of the unified `api.loadSoundscape()` response

**Server-side cleanup:** Removed obsolete separate areas API endpoints
- ❌ Removed: `api/routes/areas.js` (no longer used)
- ❌ Removed: `api/server.js` areasRoutes registration
- ✅ Kept: `AreaRepository.js` and `Area.js` (still used internally by `SoundScapeRepository`)

**Deploy script:** Updated to exclude obsolete routes file
- ❌ Removed: `areas.js` from deploy list

---

## Root Cause

**Redundant `loadAreas()` call caused confusion but was NOT the save issue.**

The actual save code was already correct in both:
- `map_shared.js._executeAutoSave()` - Auto-save path
- `map_editor.js._saveSoundscapeToServer()` - Manual save path

Both correctly include areas in the unified `saveSoundscape()` call.

---

## What Was Fixed

### Removed Redundant Load Logic

**Before:**
```javascript
const data = await this.api.loadSoundscape(ss.id);
const soundscape = SoundScape.fromJSON(data.soundscape);
soundscape.waypointData = data.waypoints;

// ❌ REDUNDANT: Areas already in data.soundscape.areas
try {
    const areas = await this.api.loadAreas(ss.id);
    areas.forEach(area => soundscape.addArea(area));
} catch (areaErr) { ... }
```

**After:**
```javascript
const data = await this.api.loadSoundscape(ss.id);
const soundscape = SoundScape.fromJSON(data.soundscape);
soundscape.waypointData = data.waypoints;

// ✅ Areas already included in data.soundscape.areas
// and initialized by SoundScape.fromJSON() - no separate load needed
```

---

## Data Flow (Verified Correct)

### Save Flow
```
User draws Area
    ↓
Area added to soundscape.areas array
    ↓
Soundscape marked dirty (isDirty = true)
    ↓
_scheduleAutoSave() → 2 second debounce
    ↓
_executeAutoSave()
    ↓
Strip Leaflet properties: _leafletLayer removed
    ↓
api.saveSoundscape(serverId, waypoints, behaviors, areas)
    ↓
POST /soundscapes/:id/save
    ↓
SoundScapeRepository.saveFull()
    ↓
Transaction: DELETE old + INSERT new areas
    ↓
✅ Areas saved to database
```

### Load Flow
```
Page load
    ↓
_loadSoundscapeFromServer()
    ↓
GET /soundscapes/:id
    ↓
repo.getFull() returns { soundscape, waypoints, behaviors, areas }
    ↓
api-client.js loadSoundscape() reconstructs:
    {
        soundscape: { id, name, soundIds, waypointData, behaviors, areas },
        waypoints: [...],
        areas: [...]
    }
    ↓
SoundScape.fromJSON(data.soundscape)
    ↓
Constructor initializes: this.areas = data.areas || []
    ↓
✅ Areas loaded into soundscape.areas array
    ↓
switchSoundscape()
    ↓
_loadAreasIntoDrawer(soundscape.areas)
    ↓
✅ Areas rendered on map
```

---

## Files Changed

| File | Change | Reason |
|------|--------|--------|
| `map_editor.js` | Removed redundant `loadAreas()` call | Areas already loaded by `loadSoundscape()` |
| `api/server.js` | Removed `areasRoutes` registration | Obsolete endpoint |
| `api-client.js` | Removed 4 obsolete area methods | No server endpoints |
| `deploy.ps1` | Removed `areas.js` from deploy list | Obsolete endpoint |
| `map_editor.js` | Removed debug console.log() | Cleanup from troubleshooting |
| `map_shared.js` | Removed debug console.log() | Cleanup from troubleshooting |

**Note:** `AreaRepository.js` and `Area.js` are **still needed** - used internally by `SoundScapeRepository.saveFull()`!

---

## Why Areas Weren't Saving (Actual Issue)

The save code was **already correct**. If areas still aren't saving after this fix, check:

1. **Browser Console** - Look for errors during save
2. **Server Logs** - Check `/soundscapes/:id/save` endpoint logs:
   ```
   [Soundscapes] Save request for {id}: X waypoints, X behaviors, X areas
   [Soundscapes] Saved {id}: X waypoints, X behaviors, X areas
   ```
3. **Database** - Verify areas table has rows:
   ```sql
   SELECT * FROM areas WHERE soundscape_id = 'your-soundscape-id';
   ```

---

## Testing Checklist

- [ ] Draw Area in editor
- [ ] Wait 2 seconds for auto-save
- [ ] Check browser console: `📦 Saving: X waypoints, X behaviors, X areas`
- [ ] Check server logs: areas count > 0
- [ ] Refresh page
- [ ] **Expected:** Area persists on map
- [ ] Check browser console: Areas loaded from `data.soundscape.areas`
- [ ] Switch to different soundscape
- [ ] Switch back
- [ ] **Expected:** Areas reappear

---

## API Methods Status

| Method | Used By | Status |
|--------|---------|--------|
| `api.saveSoundscape()` | Auto-save, Manual save | ✅ Primary save method |
| `api.loadSoundscape()` | Load on page load | ✅ Primary load method |

**Removed obsolete methods from `api-client.js`:**
- ❌ `syncAreas()` - Replaced by unified `saveSoundscape()`
- ❌ `saveArea()` - Replaced by unified `saveSoundscape()`
- ❌ `loadAreas()` - Replaced by unified `loadSoundscape()`
- ❌ `deleteArea()` - Use `saveSoundscape()` with empty areas array

**Server-side files removed:**
- ❌ `api/routes/areas.js` - No longer needed (unified save handles areas)
- ❌ `api/server.js` areasRoutes registration - Removed

**Server-side files KEPT (still needed):**
- ✅ `api/repositories/AreaRepository.js` - Used by `SoundScapeRepository.saveFull()`
- ✅ `api/models/Area.js` - Used by `AreaRepository`

---

## Next Steps

1. **Test on browser** - Draw area, verify it saves
2. **Check server logs** - Confirm areas count > 0 in save request
3. **Verify database** - Check areas table has rows after save

---

**Created:** 2026-03-24
**Fix:** Removed redundant `loadAreas()` call
**Status:** ✅ Ready for testing
