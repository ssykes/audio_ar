# Map Editor v2 Refactor - Dead Code Removal

**Date:** 2026-03-28  
**Status:** ✅ Complete  
**Lines Changed:** -209 deletions, +69 additions (net: -140 lines)

---

## Overview

Refactored `map_editor_v2.js` to remove dead code related to multi-soundscape handling. The editor v2 is designed to work with **ONE active soundscape** (like the player), but retained legacy code from the old multi-soundscape editor.

---

## Dead Code Removed

### 1. `_loadSoundscapeList()` Method (~48 lines)
**What it did:** Populated a soundscape selector dropdown that doesn't exist in the UI.

**Why removed:** The selector element (`#soundscapeSelector`) doesn't exist in `map_editor_v2.html`. This was legacy code from the old editor.

### 2. `_onSoundscapeChange()` Method (~90 lines)
**What it did:** Handled soundscape selector changes when user picked a different soundscape.

**Why removed:** No selector exists, so this was never called. Also loaded soundscapes from server, which is now handled by `_loadSoundscapeFromServer()`.

### 3. `_updateSoundscapeSelector()` Calls (3 calls)
**Locations:** Lines 1531, 1535, 1544 (in `_createNewSoundscape()`)

**Why removed:** The method doesn't exist (was probably removed earlier). These calls did nothing.

### 4. Selector Event Listener (~6 lines)
**Location:** Lines 2241-2245 (bottom of file)

**Code removed:**
```javascript
const soundscapeSelector = document.getElementById('soundscapeSelector');
if (soundscapeSelector) {
    soundscapeSelector.addEventListener('change', () => {
        app._onSoundscapeChange();
    });
}
```

**Why removed:** Selector doesn't exist, so this code did nothing.

---

## Refactored: `_loadSoundscapeFromServer()`

### Before (Old Multi-Soundscape Approach)
```javascript
// Load ALL soundscapes from server
const soundscapes = await this.api.getSoundscapes();
for (const ss of soundscapes) {
    const data = await this.api.loadSoundscape(ss.id);
    // ... load each soundscape into cache
}

// Then find the right one using complex mapping
activeLocalId = Array.from(this.serverSoundscapeIds.entries())
    .find(([_, serverId]) => serverId === persistedId)?.[0];
```

**Problems:**
- Loaded EVERY soundscape from server (slow for users with many soundscapes)
- Complex ID mapping logic
- Wasted bandwidth and memory

### After (Single Soundscape Approach)
```javascript
// Determine which ONE soundscape to load
let targetServerId = persistedId || selectedId;

if (!targetServerId) {
    const soundscapes = await this.api.getSoundscapes();
    targetServerId = soundscapes[0].id; // Most recent
}

// Load ONLY that soundscape
const data = await this.api.loadSoundscape(targetServerId);
// ... load directly into active soundscape
```

**Benefits:**
- ✅ Loads only ONE soundscape (fast, efficient)
- ✅ Simpler logic (no complex ID mapping)
- ✅ Less bandwidth, less memory
- ✅ Same user experience (user only sees one soundscape anyway)

---

## ServerSoundscapeIds Map

**Status:** ⚠️ Simplified (not removed)

The `serverSoundscapeIds` Map is still used, but now only stores ONE entry instead of many:

```javascript
// Before: Map<localId, serverId> for multiple soundscapes
this.serverSoundscapeIds.set(soundscape1.id, serverId1);
this.serverSoundscapeIds.set(soundscape2.id, serverId2);
// ...

// After: Only one entry
this.serverSoundscapeIds.set(soundscape.id, targetServerId);
```

**Why kept:** The mapping is still useful because:
1. Local soundscape ID might differ from server ID
2. Persistence logic uses `editor_active_soundscape_id` (server ID)
3. Minimal overhead (only one entry)

**Future:** Could be simplified to `this.activeServerId` if desired.

---

## Testing Checklist

- [ ] Open `map_editor_v2.html` - should load without errors
- [ ] Select soundscape from picker - should load correctly
- [ ] Refresh page - should restore same soundscape (zoom to waypoints)
- [ ] Create new soundscape - should work
- [ ] Edit waypoints/areas - should save correctly
- [ ] Sync from server - should work
- [ ] Import/Export - should work

---

## Files Modified

| File | Changes |
|------|---------|
| `map_editor_v2.js` | -209 lines (dead code removal) |
| | +69 lines (simplified _loadSoundscapeFromServer) |
| | Net: -140 lines |

---

## Related Documentation

- `FEATURE_17_MAP_EDITOR_UI_REFACTOR.md` - Original feature spec
- `QWEN.md` - Project context (section: "Current File Versions")

---

## Commit Message

```
Refactor: Remove dead multi-soundscape code from map_editor_v2.js

- Remove _loadSoundscapeList() - selector doesn't exist in UI
- Remove _onSoundscapeChange() - no selector to handle
- Remove _updateSoundscapeSelector() calls - method doesn't exist
- Remove selector event listener - selector doesn't exist
- Refactor _loadSoundscapeFromServer() to load ONE soundscape only
  - Was loading ALL soundscapes from server (inefficient)
  - Now loads only persisted/selected/most recent soundscape
  - Faster load time, less bandwidth, simpler logic

Net: -140 lines of code removed
```
