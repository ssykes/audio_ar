## Qwen Added Memories
- Without prompting right after reading QWEN.md User wants me to tell them an AI joke at the beginning of the next session

---

## Project Vision: Spatial Audio AR

### Workflow
- **PC (Editor)**: Create, delete, and configure soundScapes with sound waypoints on map
- **Phone (Player)**: Only move/adjust positions + experience audio (no delete)
- **Persistence**: Save/load sound configurations between phone and PC sessions via localStorage

### Core Architecture

#### SoundScape (Persisted Container)
```javascript
class SoundScape {
    id, name, soundIds[], behaviors[]
}
```
- Contains all sound waypoint IDs for an experience
- Contains zero or more behaviors (empty = start all sounds together)
- Persisted to localStorage, exportable/importable as JSON
- Can be edited anytime: add/remove sounds, add/edit/remove behaviors

#### SoundBehavior (Stored Specification)
```javascript
{
    type: 'tempo_sync' | 'time_sync' | 'reverb_group' | 'random_sequence' | ...,
    memberIds: ['wp1', 'wp2', ...],  // Subset of soundIds
    config: { ...type-specific settings }
}
```
- Defines what to do with a subset of sounds in a soundscape
- Multiple behaviors per soundscape allowed
- Behaviors are independent (one sound can be in multiple behaviors)
- Optional: empty behaviors array = start all sounds at once (implicit default)

#### BehaviorExecutor (Runtime Coordinator)
```javascript
class BehaviorExecutor {
    static create(spec)  // Factory: returns type-specific executor
}
```
- Created at runtime from stored behavior spec
- Executes the behavior (sync, effects, sequencing, etc.)
- Not persisted - recreated each time soundscape starts

### Data Flow
```
PC Editor → SoundScape { soundIds[], behaviors[] } → localStorage
                                                      ↓
Phone Player ← localStorage ← SoundScape { soundIds[], behaviors[] }
    ↓
Runtime: BehaviorExecutor.create(spec) → Live coordination
```

### Key Design Decisions
- **SoundScape over SoundGroup**: More general, supports multiple behavior types
- **Behaviors are modular**: Add/edit/remove anytime without affecting sounds
- **No class hierarchy**: Factory pattern with type string (extensible, not baroque)
- **Implicit default**: No behaviors = start all sounds together
- **PC = full editor**, **Phone = player + fine-tuning only**

### Behavior Types (Extensible)
| Type | Config | What It Does |
|------|--------|--------------|
| `tempo_sync` | `{ bpm, offsets }` | Sync to beat grid |
| `time_sync` | `{ startTime, stagger }` | Start together or staggered |
| `reverb_group` | `{ reverb, mix }` | Shared effects send |
| `random_sequence` | `{ interval, maxPolyphony }` | Random triggers |
| `volume_group` | `{ curve, fade }` | Linked volume automation |
| `filter_group` | `{ filter, freq }` | Shared filter sweep |

### Classes to Implement
- `SoundScape` - Persisted container with soundIds and behaviors
- `SoundBehavior` - Data spec (type, memberIds, config)
- `BehaviorExecutor` - Factory for runtime coordinators
- `MapPlacerApp.soundScapes: Map<id, SoundScape>` - PC editor storage
- `SpatialAudioApp.startSoundScape()` - Load + execute with behaviors

### Persistence
- **localStorage key**: `'soundscape_config'`
- **Structure**: `{ waypoints: [...], soundScapes: [...] }`
- **Export**: Download soundscape as JSON file
- **Import**: Upload JSON to restore soundscape

### Future Features
- Polyrhythmic channels (different BPM per soundscape or behavior)
- Layered sounds (multiple files at one location)
- Visual behavior editor (timeline for offsets, drag-drop sounds)
- GPS-based behavior triggers (activate behavior when near certain sounds)

---

## Implementation Plan: Retrofitting SoundScape Architecture

### Migration Phases

| Phase | Task | Files | Status |
|-------|------|-------|--------|
| **1** | Add SoundScape, SoundBehavior, BehaviorExecutor classes | `soundscape.js` (new) | ✅ Done |
| **2** | Add localStorage persistence layer | `map_placer.js` | ⏳ Pending |
| **3** | Add BehaviorExecutor stub (default = start all) | `soundscape.js` | ✅ Done (included in Phase 1) |
| **4** | Update SpatialAudioApp to accept soundscape (dual mode) | `spatial_audio_app.js` | ⏳ Pending |
| **5** | Implement behavior types (tempo_sync first) | `soundscape.js` | ✅ Done (included in Phase 1) |
| **6** | Add soundscape selector UI | `map_placer.html`, `map_placer.js` | ⏳ Pending |
| **7** | Phone mode restrictions (hide edit controls) | `map_placer.js` | ⏳ Pending |

---

### Simulation Mode (Desktop Preview)

| Feature | Status | Description |
|---------|--------|-------------|
| **Draggable listener avatar** | ✅ Done | Drag 🚶 emoji around map to preview audio |
| **Real-time audio updates** | ✅ Done | Audio position updates as you drag |
| **Distance/bearing display** | ✅ Done | Shows nearest sound distance and direction |
| **Volume indicator** | ✅ Done | Estimated volume based on distance |
| **Waypoint lock during sim** | ✅ Done | Prevents editing while simulating |
| **Zero GPS/compass required** | ✅ Done | Pure mouse-based simulation |

**Implementation:** Added to `map_placer.html` and `map_placer.js` (250 lines)

**Benefits:**
- Test soundscapes at your desk (no field trip needed)
- Debug behaviors without GPS
- Client demos without traveling
- Faster iteration on sound placements

---

### Phase 1: Add SoundScape Class (NEXT TASK)

**File to create:** `soundscape.js`

**Classes:**

```javascript
class SoundScape {
    constructor(id, name, soundIds = [], behaviors = []) {
        this.id = id;
        this.name = name;
        this.soundIds = soundIds;
        this.behaviors = behaviors;  // Array of SoundBehavior specs
    }

    toJSON() {
        return {
            id: this.id,
            name: this.name,
            soundIds: this.soundIds,
            behaviors: this.behaviors.map(b => b.toJSON ? b.toJSON() : b)
        };
    }

    static fromJSON(data) {
        const behaviors = data.behaviors.map(b => new SoundBehavior(b.type, b.memberIds, b.config));
        return new SoundScape(data.id, data.name, data.soundIds, behaviors);
    }
}

class SoundBehavior {
    constructor(type, memberIds, config = {}) {
        this.type = type;
        this.memberIds = memberIds;
        this.config = config;
    }

    toJSON() {
        return { type: this.type, memberIds: this.memberIds, config: this.config };
    }
}

class BehaviorExecutor {
    static create(spec, sounds, audioEngine) {
        // Factory: returns type-specific executor
        // Default behavior: start all sounds together
        return new DefaultExecutor(spec, sounds, audioEngine);
    }
}

class DefaultExecutor {
    constructor(spec, sounds, audioEngine) {
        this.spec = spec;
        this.sounds = sounds;
        this.audioEngine = audioEngine;
    }

    start() {
        // Start all sounds together (implicit default behavior)
        this.sounds.forEach(s => s.start());
    }

    stop() {
        this.sounds.forEach(s => s.stop());
    }
}
```

**Integration:**
- Add `<script src="soundscape.js"></script>` to `map_placer.html` before `map_placer.js`
- No breaking changes - classes are additive, existing code continues to work

---

### Notes for Future Phases

**Phase 2 (localStorage):**
- Add `saveToLocalStorage()` and `loadFromLocalStorage()` to MapPlacerApp
- localStorage key: `'soundscape_config'`
- Structure: `{ waypoints: [...], soundScapes: [...] }`
- Migrate existing waypoints to default soundscape on first load

**Phase 4 (SpatialAudioApp dual mode):**
- Support both old `start(soundConfigs[])` and new `startSoundScape(soundscape)` APIs
- Backward compatibility for existing single_sound_v2.html

**Behavior Type Implementations (Phase 5):**
- Start with `time_sync` (simplest - staggered starts)
- Then `tempo_sync` (requires BPM clock)
- Then `reverb_group` (shared effects send)

---

## Session 3: SoundScape Persistence - Completed ✅

### What Was Implemented

| Feature | Status | Files Modified |
|---------|--------|----------------|
| `SoundScape` class with `waypointData` | ✅ Done | `soundscape.js` |
| `SoundScapeStorage` localStorage helpers | ✅ Done | `soundscape.js` |
| Auto-save on waypoint add/delete/clear | ✅ Done | `map_placer.js` |
| Export/Import JSON file | ✅ Done | `map_placer.js`, `map_placer.html` |
| Phone mode detection + restrictions | ✅ Done | `map_placer.js` |
| `SpatialAudioApp.startSoundScape()` | ✅ Done | `spatial_audio_app.js` |
| Behavior execution via `BehaviorExecutor` | ✅ Done | `spatial_audio_app.js` |
| Soundscape selector UI | ✅ Done | `map_placer.html` |

### Data Flow (Working)

```
PC: Place waypoints → Auto-save to localStorage → Export JSON
                          ↓
Phone: Import JSON → Load to localStorage → Tap Start → GPS + Compass → Walk + Listen
```

---

## Session 4: Hit List Cleanup - Completed ✅

### What Was Addressed

| Issue # | Problem | Resolution | File Modified |
|---------|---------|------------|---------------|
| **1** | `_createNewSoundscape()` button misleading | Renamed button from "+ New" to "💾 Save As..." | `map_placer.html` |
| **2** | Auto-save feedback missing | Already implemented at line 1618 | No change needed |
| **3** | Unused `this.soundscapes` property | Property never existed (planned but not implemented) | No change needed |
| **4** | `_onSoundscapeChange()` does nothing | Added TODO comment documenting future enhancement (P3-A) | `map_placer.js` |
| **5** | Unused `options` parameter | Parameter already removed in previous session | No change needed |
| **6** | Version mismatch | Already correct (v3.0) | No change needed |

### Data Flow (Unchanged)

```
PC: Place waypoints → Auto-save to localStorage → Export JSON
                          ↓
Phone: Import JSON → Load to localStorage → Tap Start → GPS + Compass → Walk + Listen
```

---

## Hit List: Issues for Future Sessions

### P1 - Should Fix Soon

| # | Issue | File | Current Behavior | Expected Behavior | Fix | Status |
|---|-------|------|------------------|-------------------|-----|--------|
| **1** | `_createNewSoundscape()` includes old waypoints | `map_placer.js` ~1246 | "New Soundscape" creates soundscape with all existing waypoints | User expects empty soundscape when creating "New" | Rename button to "Save As..." | ✅ **Fixed** - Button renamed to "💾 Save As..." |
| **2** | Auto-save feedback timer shows nothing | `map_placer.js` ~1315 | Timer set/cleared but no feedback shown | User should see "💾 Auto-saved" in debug console | Add `this.debugLog('💾 Auto-saved')` inside timer callback | ✅ **Already implemented** - Shows at line 1618 |

### P2 - Nice to Fix

| # | Issue | File | Current Behavior | Expected Behavior | Fix | Status |
|---|-------|------|------------------|-------------------|-----|--------|
| **3** | `this.soundscapes` property unused | `map_placer.js` ~48 | Declared but never accessed | Dead code should be removed | Remove `this.soundscapes = {}` from constructor | ✅ **Never existed** - Property was planned but never added |
| **4** | `_onSoundscapeChange()` does nothing | `map_placer.js` ~1274 | Dropdown implies switching soundscapes, but handler just logs | Either implement multi-soundscape switching OR remove dropdown | Add TODO comment for future enhancement | ✅ **Documented** - Added TODO comment (P3-A future enhancement) |
| **5** | `startSoundScape(options)` parameter unused | `spatial_audio_app.js` ~724 | Parameter declared but never used | Misleading API | Remove `options` parameter or use it to override `this.options` | ✅ **Already fixed** - Parameter no longer exists |
| **6** | Version mismatch | `soundscape.js` ~18 | Says "v1.0" in console log | Should match project version | Update to "v3.0" | ✅ **Already correct** - Shows "v3.0" |

### P3 - Future Enhancements (Not Bugs)

| # | Feature | Description | Priority |
|---|---------|-------------|----------|
| **A** | Multi-soundscape support | Store/switch between multiple soundscapes (use `this.soundscapes` map) | Low |
| **B** | Behavior editing UI | Visual editor to create/edit behaviors (timeline, drag-drop sounds) | Medium |
| **C** | Behavior presets | Pre-configured behavior templates (e.g., "Canon", "Call & Response") | Low |
| **D** | Soundscape gallery | Browse/load community soundscapes | Low |
| **E** | GPS-based triggers | Activate behaviors when near specific waypoints | Low |

---

## Session 5: Multi-Soundscape Support (PLANNED)

**Goal:** Enable creating, switching, and managing multiple soundscapes

**Context:** Single user, no existing data to migrate (can delete current dummy soundscape)

### Implementation Sessions (Divided for Manageability)

| Session | Phase | Task | Files | Est. Lines | Status |
|---------|-------|------|-------|------------|--------|
| **5A** | 1 | Storage layer: `SoundScapeStorage.getAll()`, `saveAll()` | `soundscape.js` | ~50 | ✅ Done |
| **5B** | 2 | MapPlacerApp refactor: Replace `currentSoundscape` with `soundscapes` Map | `map_placer.js` | ~200 | ✅ Done |
| **5C** | 3 | UI: New button, soundscape switching, map centering | `map_placer.html`, `map_placer.js` | ~100 | ⏳ Next |
| **5D** | 4 | Server sync: Fetch/save multiple soundscapes | `api-client.js`, `map_placer.js` | ~50 | ⏳ Pending |

**Total Effort:** ~450 lines across 4 sessions

### Session 5A: Storage Layer (NEXT)

**Changes:**
```javascript
// soundscape.js - Add multi-soundscape storage
class SoundScapeStorage {
    static STORAGE_KEY = 'soundscapes';  // plural

    static getAll() {
        // Returns: { activeId, soundscapes: [...] }
    }

    static saveAll(soundscapes, activeId) {
        // Saves all soundscapes + active selection
    }

    static createDefault() {
        // Creates first empty soundscape on fresh install
    }
}
```

**Testing:**
- Open `map_placer.html` → verify empty soundscape created
- Console: `[SoundScapeStorage] Initialized with 1 soundscape`

**Status:** ✅ **Completed** - Session 5A implemented

**New Methods Added:**
- `SoundScapeStorage.getAll()` - Load all soundscapes + active ID
- `SoundScapeStorage.saveAll(soundscapes, activeId)` - Save all
- `SoundScapeStorage.createDefault()` - Create first empty soundscape
- `SoundScapeStorage.getActiveId()` - Get active soundscape ID
- `SoundScapeStorage.setActiveId(id)` - Set active soundscape ID
- `SoundScapeStorage.delete(id)` - Delete soundscape by ID
- `SoundScapeStorage.clearAll()` - Clear all multi-soundscape data
- `SoundScapeStorage.exists()` - Check if multi-soundscape config exists

**Testing Instructions:**
1. Open `http://localhost:8000/map_placer.html`
2. Open browser DevTools console
3. Run: `SoundScapeStorage.createDefault()` - creates empty soundscape
4. Run: `const data = SoundScapeStorage.getAll()` - verify 1 soundscape
5. Run: `console.log(data.soundscapes[0].name)` - should show "My Soundscape"

### Session 5B: MapPlacerApp Refactor - Completed ✅

**What Was Implemented:**
- Replaced `this.currentSoundscape` with `this.soundscapes` Map + `this.activeSoundscapeId`
- Added `this.serverSoundscapeIds` Map for server sync tracking
- New helper methods: `getActiveSoundscape()`, `switchSoundscape()`, `deleteSoundscape()`
- Updated all waypoint operations to use active soundscape
- Fixed server sync to load all soundscapes into local map
- Fixed localStorage to store clean waypoint data (no Leaflet circular refs)
- Map centering when switching soundscapes
- Migration from old single-soundscape format

**Files Modified:**
- `map_placer.js` - ~400 lines changed
- `soundscape.js` - ~50 lines (migration fix, debug logging)

**Status:** ✅ **Completed** - Multi-soundscape support working

**Known Issues (for 5C):**
- "💾 Save As..." button creates duplicate soundscapes on every click
- No clear concept of "current working soundscape"
- User accidentally creates multiple soundscapes with same name

---

### Session 5C: UX Fixes - NEXT

**Goal:** Fix the "Save As..." confusion and improve soundscape management UX

**Problem:**
- Current "💾 Save As..." creates a NEW soundscape every time
- User clicks it thinking it saves, but creates duplicates
- No visual feedback about which soundscape is active
- **Bug: Dragging waypoints doesn't auto-save** - Position changes lost on refresh

**Bug Detail: Drag End Auto-Save Missing**
```javascript
// map_placer.js line 1435-1441
marker.on('dragend', (e) => {
    this.isDragging = false;
    waypoint.lat = e.target.getLatLng().lat;
    waypoint.lon = e.target.getLatLng().lng;
    this._updateRadiusCircle(waypoint);
    // ❌ MISSING: this._saveSoundscapeToStorage();
});
```
- **Impact:** User drags waypoint to new location → refreshes page → waypoint snaps back to original position
- **Fix:** Add `this._saveSoundscapeToStorage();` call in dragend handler
- **Priority:** High (data loss bug)

**Solution (Option A - Simple Fix):**
1. Rename button from "💾 Save As..." → "➕ New"
2. "New" creates empty soundscape and switches to it (one-time action)
3. After creating, all edits auto-save to current soundscape
4. Dropdown switches between soundscapes + centers map
5. **Fix dragend handler to auto-save waypoint position changes**
6. No Rename/Delete buttons yet (future enhancement)

**Changes:**
```javascript
// map_placer.js
_createNewSoundscape() {
    // Create new, switch to it, user is now "in" that soundscape
    // Subsequent waypoint adds auto-save to this soundscape
}

// Auto-save always goes to activeSoundscapeId
_saveSoundscapeToStorage() {
    const soundscape = this.getActiveSoundscape();
    // ... save to server if serverSoundscapeIds.has(activeSoundscapeId)
}
```

```html
<!-- map_placer.html -->
<button id="newSoundscapeBtn" class="btn">➕ New</button>
<!-- Remove "Save As..." text - it's confusing -->
```

**Testing:**
1. Login → existing soundscapes load into dropdown
2. Click "➕ New" → creates empty soundscape, switches to it
3. Add waypoints → auto-saves to current soundscape (no duplicates)
4. Switch dropdown → map centers on new soundcape's waypoints
5. Refresh → waypoints persist

---

### Session 5D: Server Sync (Future)

**Changes:**
- Load ALL user's soundscapes on login (not just most recent)
- Populate dropdown from server
- Switch loads from server if not cached locally
- Independent save per soundscape

---

### Session 5E: Smart Auto-Sync with Timestamps (PLANNED)

**Goal:** Auto-sync phone on page load ONLY when server data has changed (transparent sync for players)

**Architecture Vision:**

| Device | Role | Capabilities |
|--------|------|--------------|
| **PC** | Editor + Simulator | Create, edit, delete + Draggable avatar preview |
| **Phone** | Player | Listen only (multiple users, no edits) |
| **Database** | Ledger of truth | Single source of truth |
| **JSON export** | Transfer protocol | Manual import/export (legacy) |

**Problem:**
- Phone is player-only (multiple users, no edit capability)
- Phone shows cached localStorage data on page load
- User must manually tap "🔄 Sync from Server" to see PC edits
- Blind auto-sync on every page load is wasteful if data unchanged
- Version numbers add complexity (need to track, increment, maintain)

**Solution: Last-Modified Timestamps (Simpler than Version Numbers)**

```javascript
// Server API: Add lastModified timestamp to soundscape
{
  id: "soundscape_123",
  name: "My Soundscape",
  lastModified: "2026-03-14T10:30:00.123Z",  // ISO 8601 timestamp
  waypoints: [...],
  behaviors: [...]
}

// Client: Store timestamp in localStorage
localStorage.setItem('soundscape_modified_' + soundscapeId, "2026-03-14T10:30:00.123Z");
```

**Why Timestamps Over Version Numbers?**

| Aspect | Version Numbers | Timestamps | Winner |
|--------|----------------|------------|--------|
| **Complexity** | Need counter, increment logic | Built-in (Date.now()) | **Timestamps** ✅ |
| **Debugging** | "version 42" - meaningless | "2026-03-14T10:30" - human readable | **Timestamps** ✅ |
| **Conflict detection** | Only shows order | Shows exact time | **Timestamps** ✅ |
| **Server logic** | Must maintain counter | Just use `new Date().toISOString()` | **Timestamps** ✅ |
| **Storage** | 1-2 bytes (integer) | ~24 bytes (ISO string) | Version (minor) |
| **Comparison** | `serverVer > localVer` | `serverTime !== localTime` | Tie |

**Implementation:**

```javascript
// 1. PC: Server saves with timestamp
async _saveSoundscapeToServer() {
    const soundscape = this.getActiveSoundscape();
    const now = new Date().toISOString();
    
    await this.api.saveSoundscape(serverId, waypoints, behaviors, now);
    
    // Store timestamp locally (PC also uses localStorage as cache)
    localStorage.setItem('soundscape_modified_' + this.activeSoundscapeId, now);
    
    this.debugLog('💾 Saved to server (modified: ' + now + ')');
}

// 2. Phone: Page load checks timestamp (transparent auto-sync)
async _checkLoginStatus() {
    if (this.isLoggedIn) {
        // Get server timestamp (lightweight API call)
        const serverModified = await this.api.getSoundscapeModified(this.activeSoundscapeId);
        const localModified = localStorage.getItem('soundscape_modified_' + this.activeSoundscapeId);
        
        if (serverModified !== localModified) {
            this.debugLog('🔄 Timestamp mismatch (server: ' + serverModified + ', local: ' + localModified + ') - auto-syncing...');
            this._showToast('🔄 Updating from server...', 'info');
            await this._loadSoundscapeFromServer();  // Sync new data
            this._showToast('✅ Soundscape updated', 'success');
        } else {
            this.debugLog('✅ Timestamp match (' + serverModified + ') - using cached data');
        }
    }
}
```

**API Changes:**

```javascript
// api-client.js - Add lightweight timestamp check endpoint
async getSoundscapeModified(soundscapeId) {
    const response = await fetch(`/api/soundscapes/${soundscapeId}/modified`, {
        headers: { 'Authorization': `Bearer ${this.token}` }
    });
    const data = await response.json();
    return data.lastModified;  // Just the timestamp, not full data
}
```

**Server Changes (Cloudflare Worker):**

```javascript
// Add new endpoint
if (url.pathname.match(/\/api\/soundscapes\/[^\/]+\/modified/)) {
    const lastModified = soundscape.lastModified || soundscape.updatedAt;
    return jsonResponse({ lastModified });
}

// Set timestamp on save (automatic, no counter to maintain)
if (url.pathname.startsWith('/api/soundscapes/') && request.method === 'PUT') {
    soundscape.lastModified = new Date().toISOString();  // Auto-timestamp
    // ... save as usual
}
```

**User Experience:**

| Device | Action | User Sees |
|--------|--------|-----------|
| **PC** | Edit waypoint → Save | "💾 Auto-saved to server" (timestamp updated) |
| **PC** | Drag avatar (simulator) | Audio updates in real-time (no sync needed) |
| **Phone** | Open page (same soundscape) | "🔄 Updating from server..." → "✅ Updated" (auto-sync) |
| **Phone** | Refresh page (no changes) | Nothing (silent, uses cached data) |
| **Phone** | Switch to different soundscape | Timestamp check → Auto-sync if needed |

**Testing:**

1. PC: Edit soundscape → timestamp updates (e.g., `10:30:00` → `10:35:22`)
2. Phone A: Open page → timestamp check (`10:35:22` ≠ `10:30:00`) → auto-sync → "✅ Updated"
3. Phone B: Open page → timestamp check (`10:35:22` ≠ `10:30:00`) → auto-sync → "✅ Updated"
4. Phone A: Refresh page → timestamp check (`10:35:22` = `10:35:22`) → skip sync → silent
5. No network → timestamp check fails → fallback to localStorage → "⚠️ Offline - using cached data"

**Files to Modify:**

| File | Changes |
|------|---------|
| `api-client.js` | Add `getSoundscapeModified()` method |
| `map_placer.js` | Add timestamp check in `_checkLoginStatus()` (runs on page load) |
| `cloudflare-worker.js` | Add `/modified` endpoint, set `lastModified` on save |
| `soundscape.js` | Add `lastModified` field to `SoundScape` class |

**Priority:** High (critical for transparent player experience)

**Est. Lines:** ~100 (API + client + worker changes)

**Future: Separate Pages (Session 6)**
- `editor.html` - PC-only editing interface (includes simulator)
- `player.html` - Phone-only player interface (auto-sync, listen, no edit controls)
- Shared: `soundscape.js`, `api-client.js`, `spatial_audio_app.js`

---

### Session 6: Separate Editor and Player Pages (PLANNED)

**Goal:** Split `map_placer.html` into two specialized pages: `map_editor.html` (PC) and `map_player.html` (Phone)

**Architecture Vision:**

```
┌─────────────────────────────────────────────────────────────┐
│                  Shared Libraries                            │
│  soundscape.js │ api-client.js │ spatial_audio_app.js       │
└─────────────────────────────────────────────────────────────┘
           ▲                                    ▲
           │                                    │
    ┌──────┴────────┐                    ┌─────┴──────┐
    │ map_editor.js │                    │ map_player.js │
    │ (PC + Editor) │                    │ (Phone + Player) │
    ├───────────────┤                    ├────────────────┤
    │ - Login UI    │                    │ - Auto-sync    │
    │ - Edit UI     │                    │ - Read-only UI │
    │ - Export      │                    │ - Minimal UI   │
    │ - Simulator   │                    │ - GPS/Compass  │
    └───────────────┘                    └────────────────┘
           ▲                                    ▲
           │                                    │
    ┌──────────────┐                    ┌──────────────┐
    │map_editor.html│                    │map_player.html│
    └──────────────┘                    └──────────────┘
```

**Decision: Copy & Refactor (Not Start Fresh)**

| Aspect | Rationale |
|--------|-----------|
| **Shared code** | ~2,500 lines (map, GPS, audio, simulator) - no reason to duplicate |
| **Editor-only** | ~250 lines (login, edit UI, export/import, soundscape management) |
| **Player-only** | ~80 lines (auto-sync, minimal UI, GPS display) |
| **Approach** | Copy `map_placer.html` → `map_editor.html`, create new `map_player.html` |
| **Risk** | Low (incremental changes, keep `map_placer.html` as backup) |

**What's Shared (Keep as-is):**

| Component | File | Lines | Reuse |
|-----------|------|-------|-------|
| Map initialization | `map_placer.js` | ~200 | ✅ 100% |
| GPS tracking | `map_placer.js` | ~150 | ✅ 100% |
| Compass handling | `map_placer.js` | ~100 | ✅ 100% |
| Simulator logic | `map_placer.js` | ~200 | ✅ 100% |
| Audio engine | `spatial_audio_app.js` | ~800 | ✅ 100% |
| Soundscape classes | `soundscape.js` | ~884 | ✅ 100% |
| API client | `api-client.js` | ~300 | ✅ 100% |

**What's Different (Split Logic):**

### `map_editor.html` (PC Only)

| Feature | Lines | Description |
|---------|-------|-------------|
| Login/Register UI | ~30 | Full auth UI |
| Soundscape management | ~50 | New/Edit/Delete buttons |
| Waypoint editing | ~100 | Add/Delete/Edit/Clear |
| Export/Import | ~50 | JSON file handling |
| Server sync button | ~20 | Manual sync trigger |
| **Total editor-only** | **~250** | |

### `map_player.html` (Phone Only)

| Feature | Lines | Description |
|---------|-------|-------------|
| Auto-sync on load | ~30 | Timestamp check + sync |
| Minimal UI | ~20 | No edit controls |
| Start/Stop only | ~10 | Play/pause |
| Debug console | ~20 | GPS/compass stats |
| **Total player-only** | **~80** | |

**Implementation Plan:**

### Phase 1: Copy Editor Files
```bash
# Copy existing files (no changes yet)
copy map_placer.html map_editor.html
copy map_placer.js map_editor.js
```

### Phase 2: Create Player Files
```javascript
// NEW FILE: map_player.js
class MapPlayerApp extends MapAppShared {
    async init() {
        await super.init();
        await this._autoSyncIfNeeded();  // Session 5E timestamp check
        this._applyPlayerRestrictions(); // Hide edit controls
    }
}
```

```html
<!-- NEW FILE: map_player.html -->
<!-- Stripped-down UI: Start button, debug console, status bar only -->
<script src="api-client.js"></script>
<script src="soundscape.js"></script>
<script src="spatial_audio_app.js"></script>
<script src="map_player.js"></script>
```

### Phase 3: Add Auto-Sync to Player (Session 5E)
```javascript
// map_player.js - _autoSyncIfNeeded()
async _autoSyncIfNeeded() {
    const serverModified = await this.api.getSoundscapeModified(this.activeSoundscapeId);
    const localModified = localStorage.getItem('soundscape_modified_' + this.activeSoundscapeId);
    
    if (serverModified !== localModified) {
        this._showToast('🔄 Updating from server...', 'info');
        await this._loadSoundscapeFromServer();
        this._showToast('✅ Soundscape updated', 'success');
    }
}
```

### Phase 4: Test Both Pages
| Test | Editor | Player |
|------|--------|--------|
| Login | ✅ Full auth UI | ✅ Auto-login from token |
| Edit waypoints | ✅ Add/Delete/Move | ❌ Read-only |
| Simulator | ✅ Draggable avatar | ❌ Not available |
| Auto-sync | ❌ Manual sync button | ✅ Timestamp check on load |
| Export/Import | ✅ Full support | ❌ Not available |
| GPS/Compass | ✅ Simulation mode | ✅ Real GPS/Compass |

**Migration Strategy:**

| Step | Action | Risk |
|------|--------|------|
| 1 | Copy `map_placer.html` → `map_editor.html` | ✅ None (copy) |
| 2 | Copy `map_placer.js` → `map_editor.js` | ✅ None (copy) |
| 3 | Create `map_player.html` (minimal UI) | ✅ Low (HTML only) |
| 4 | Create `map_player.js` (extends shared) | ✅ Low (small file) |
| 5 | Add auto-sync timestamp check to player | ✅ Low (Session 5E logic) |
| 6 | Test both pages in parallel | ✅ Low (incremental) |
| 7 | (Optional) Extract `map_shared.js` | ✅ Medium (refactor) |

**Files to Create:**

| File | Purpose | Status |
|------|---------|--------|
| `map_editor.html` | PC editor page | ⏳ Pending |
| `map_editor.js` | PC editor logic | ⏳ Pending |
| `map_player.html` | Phone player page | ⏳ Pending |
| `map_player.js` | Phone player logic | ⏳ Pending |
| `map_shared.js` | (Optional) Extracted shared logic | ⏳ Pending |

**Priority:** Medium (after Sessions 5C and 5E)

**Est. Lines:** ~500 (copy + create player + auto-sync)

**Benefits:**

| Benefit | Description |
|---------|-------------|
| **Cleaner separation** | Editor logic separate from player logic |
| **Smaller player bundle** | Phone doesn't load edit UI code |
| **Better UX** | Each page optimized for its role |
| **Easier maintenance** | Edit logic in one place, player logic in another |
| **Future-proof** | Easy to add more player variants (tablet, kiosk, etc.) |

---

### Session 7: Data Mapper Pattern for Maintainability (PLANNED)

**Goal:** Reduce code changes when database schema changes by centralizing DB ↔ Object mapping

**Problem:**

| Current State | Impact |
|---------------|--------|
| DB schema change → update 8+ files | High maintenance burden |
| Mapping logic scattered across routes, api-client, models | Easy to miss a spot |
| No clear separation between DB rows and domain objects | Tight coupling |

**Example: Adding "priority" Column to Soundscapes**

```
Current (Without Mapper):
1. api/routes/soundscapes.js - Add to SELECT
2. api/routes/soundscapes.js - Add to INSERT
3. api/routes/soundscapes.js - Add to UPDATE
4. api-client.js - Add to wpFromServer()
5. api-client.js - Add to wpToServer()
6. soundscape.js - Add to toJSON()
7. soundscape.js - Add to fromJSON()
8. map_placer.js - Add to UI

Total: 8 places to change!
```

```
With Data Mapper:
1. api/repositories/SoundScapeRepository.js - Add to mapping
2. soundscape.js - Add property + toJSON/fromJSON
3. map_placer.js - Add to UI

Total: 3 places to change! (62% reduction)
```

**Solution: Data Mapper (Repository) Pattern**

```
┌─────────────────────────────────────────────────────────┐
│  Application Layer (Domain Objects)                     │
│  SoundScape, SoundBehavior, Waypoint                    │
│  - Business logic                                       │
│  - toJSON() / fromJSON()                                │
│  - No database knowledge                                │
└─────────────────────────────────────────────────────────┘
                        ↕
┌─────────────────────────────────────────────────────────┐
│  Repository Layer (Data Mapper)                         │
│  SoundScapeRepository, WaypointRepository               │
│  - DB ↔ Object mapping (ONE PLACE)                      │
│  - SQL queries                                          │
│  - snake_case ↔ camelCase conversion                    │
└─────────────────────────────────────────────────────────┘
                        ↕
┌─────────────────────────────────────────────────────────┐
│  Database Layer                                         │
│  PostgreSQL tables                                      │
│  - soundscapes, waypoints, behaviors                    │
│  - snake_case columns                                   │
└─────────────────────────────────────────────────────────┘
```

**Implementation Plan (Broken into Sessions):**

### Session 7A: Base Repository (~100 lines)

**Goal:** Create reusable base repository with auto-mapping

**Files:**
- `api/repositories/BaseRepository.js` (NEW)

**Features:**
- `_toEntity()` - snake_case → camelCase
- `_toRow()` - camelCase → snake_case
- `findAll()`, `findById()`, `insert()`, `update()`, `delete()`

**Testing:**
```bash
node -e "
const db = require('./database');
const BaseRepository = require('./repositories/BaseRepository');
const repo = new BaseRepository(db, 'soundscapes');
(async () => {
    const rows = await repo.findAll({ user_id: 'test-user' });
    console.log('Found', rows.length, 'rows');
})();
"
```

**Risk:** ✅ None (new file, doesn't affect existing code)

**Est. Time:** 1 hour

---

### Session 7B: Waypoint & Behavior Repositories (~80 lines)

**Goal:** Create repositories for child tables

**Files:**
- `api/repositories/WaypointRepository.js` (NEW)
- `api/repositories/BehaviorRepository.js` (NEW)

**Features:**
- `findBySoundscape(id)` - Get all waypoints/behaviors for soundscape
- `countBySoundscape(id)` - Count for display
- Simple CRUD (no nested operations)

**Testing:**
```bash
node -e "
const db = require('./database');
const WaypointRepository = require('./repositories/WaypointRepository');
const repo = new WaypointRepository(db);
(async () => {
    const wps = await repo.findBySoundscape('test-soundscape-id');
    console.log('Found', wps.length, 'waypoints');
})();
"
```

**Risk:** ✅ None (new files, doesn't affect existing code)

**Est. Time:** 1 hour

---

### Session 7C: SoundScape Repository (~50 lines)

**Goal:** Create repository for soundscapes with nested operations

**Files:**
- `api/repositories/SoundScapeRepository.js` (NEW)

**Features:**
- `getFull(id, userId)` - Get soundscape + waypoints + behaviors
- `getAllForUser(userId)` - Get all with waypoint counts
- `createWithWaypoints()` - Transactional create with children

**Dependencies:** Requires 7A (BaseRepository) and 7B (child repos)

**Testing:**
```bash
node -e "
const db = require('./database');
const SoundScapeRepository = require('./repositories/SoundScapeRepository');
const repo = new SoundScapeRepository(db);
(async () => {
    const data = await repo.getFull('test-id', 'test-user');
    console.log('Soundscape:', data.soundscape.name);
    console.log('Waypoints:', data.waypoints.length);
})();
"
```

**Risk:** ✅ Low (new file, uses tested repos from 7A/7B)

**Est. Time:** 1.5 hours

---

### Session 7D: Update Routes to Use Repositories (~30 lines changed)

**Goal:** Replace inline SQL with repository calls

**Files:**
- `api/routes/soundscapes.js` (MODIFY)

**Changes:**
```javascript
// BEFORE
const result = await db.query('SELECT * FROM soundscapes WHERE user_id = $1', [req.user.id]);
res.json(result.rows);

// AFTER
const soundscapes = await repo.getAllForUser(req.user.id);
res.json(soundscapes);
```

**Dependencies:** Requires 7C (SoundScapeRepository)

**Testing:**
```bash
# Test each endpoint
curl -H "Authorization: Bearer TOKEN" http://localhost:3000/api/soundscapes
curl -H "Authorization: Bearer TOKEN" http://localhost:3000/api/soundscapes/ID
```

**Risk:** ⚠️ Medium (modifies existing routes - test thoroughly)

**Est. Time:** 1 hour

---

### Session 7E: Update API Client Mapping (~30 lines)

**Goal:** Mirror server mapping on client side

**Files:**
- `api-client.js` (MODIFY)

**Changes:**
- Add `_toEntity()` / `_toRow()` methods
- Update `loadSoundscape()` to use mapping
- Ensure consistent snake_case ↔ camelCase

**Testing:**
```javascript
// Open map_placer.html, check console
// Verify soundscapes load correctly
// Verify waypoints appear on map
```

**Dependencies:** Requires 7D (server routes working)

**Risk:** ⚠️ Medium (modifies existing client - test on phone too)

**Est. Time:** 1 hour

---

### Session 7F: Add Domain Classes (Optional) (~40 lines)

**Goal:** Add server-side domain models (optional - can use plain objects)

**Files:**
- `api/models/SoundScape.js` (NEW)
- `api/models/Waypoint.js` (NEW)
- `api/models/Behavior.js` (NEW)

**Changes:**
- Add `toJSON()` / `fromJSON()` methods
- Use in repositories instead of plain objects

**Testing:**
```bash
node -e "
const SoundScape = require('./models/SoundScape');
const ss = SoundScape.fromJSON({ id: '1', name: 'Test' });
console.log(ss.toJSON());
"
```

**Dependencies:** Optional enhancement

**Risk:** ✅ Low (additive, can skip if not needed)

**Est. Time:** 1 hour (optional)

---

**Session Summary:**

| Session | Task | Files | Lines | Risk | Time |
|---------|------|-------|-------|------|------|
| **7A** | Base Repository | 1 new | ~100 | ✅ None | 1h |
| **7B** | Child Repositories | 2 new | ~80 | ✅ None | 1h |
| **7C** | SoundScape Repository | 1 new | ~50 | ✅ Low | 1.5h |
| **7D** | Update Routes | 1 modify | ~30 | ⚠️ Medium | 1h |
| **7E** | Update API Client | 1 modify | ~30 | ⚠️ Medium | 1h |
| **7F** | Domain Classes (Optional) | 3 new | ~40 | ✅ Low | 1h |

**Total:** ~330 lines, 5.5-6.5 hours (or 4.5-5.5h without optional 7F)

---

**Benefits:**

| Benefit | Description |
|---------|-------------|
| **Incremental progress** | Can stop after any session |
| **Testable milestones** | Each session has clear testing |
| **Low risk** | New files first, modify existing last |
| **Rollback safe** | Can revert per-session if issues |
| **Easier schema changes** | Add column → update repository only |
| **Single mapping location** | DB ↔ Object mapping in one place |
| **Convention-based** | snake_case ↔ camelCase auto-converted |
| **No dependencies** | Pure JavaScript, no npm packages |

---

**Priority:** Medium (do before major schema changes)

**Recommended Order:** 7A → 7B → 7C → 7D → 7E → (optional 7F)

---

## Known Limitations

1. **No behavior editing UI** - Behaviors can be defined in code but not edited via UI
2. **No Rename/Delete** - Can't rename or delete soundscapes via UI (Session 5C+)
3. **Import overwrites without backup** - Confirm dialog exists, but no "export before overwrite" option

---

## Testing Checklist (Next Session)

### PC → Phone Flow
- [ ] PC: Place 3 waypoints
- [ ] PC: Export JSON file
- [ ] Phone: Open `map_placer.html`
- [ ] Phone: Verify edit controls are hidden (phone mode)
- [ ] Phone: Import JSON file
- [ ] Phone: Verify waypoints appear on map
- [ ] Phone: Tap "Start"
- [ ] Phone: Verify GPS permission granted
- [ ] Phone: Verify compass permission granted
- [ ] Phone: Walk toward waypoints - audio should update

### Persistence
- [ ] PC: Place waypoint → refresh page → waypoint persists
- [ ] PC: Edit waypoint → refresh page → changes persist
- [ ] PC: Delete waypoint → refresh page → deletion persists

### Behaviors (If Implemented)
- [ ] PC: Add `time_sync` behavior with stagger
- [ ] PC: Export → Import on Phone
- [ ] Phone: Tap "Start" - sounds should stagger according to behavior

---

## Code Quality Notes

### Good Patterns
- ✅ GPS/Compass permission order preserved (critical for iOS)
- ✅ `BehaviorExecutor` availability check before use
- ✅ Import confirm dialog prevents accidental data loss
- ✅ Auto-save on every waypoint change
- ✅ Phone mode detection uses multiple signals (UA + touch + screen size)

### Debt to Address
- ⚠️ Unused `this.soundscapes` property
- ⚠️ Misleading `_onSoundscapeChange()` handler
- ⚠️ Unused `options` parameter in `startSoundScape()`
- ⚠️ Version string inconsistency

---

## Files Modified in Session 3

| File | Lines Changed | Summary |
|------|---------------|---------|
| `soundscape.js` | +125 | Added `waypointData`, `SoundScapeStorage` class |
| `map_placer.js` | +400 | Added persistence, phone mode, soundscape management |
| `spatial_audio_app.js` | +60 | Added `startSoundScape()` method |
| `map_placer.html` | +30 | Added soundscape selector UI, import/export buttons |

---

## Quick Start Commands

```bash
# Test on PC
open map_placer.html

# Test on Phone (local network)
# 1. Start local server
python -m http.server 8000

# 2. Access from phone at http://YOUR_IP:8000/map_placer.html

# Deploy to test server
./deploy.ps1
```

---

## Git Commit on Windows (Important!)

**Problem:** Windows CMD doesn't handle multi-line commit messages. Using `-m "line1\nline2"` causes errors like:
```
fatal: 3:: '3:' is outside repository
```

**Solution:** Use `write_file` + `-F` flag:

```
1. write_file to create .git/COMMIT_EDITMSG with full message
2. git commit -F .git/COMMIT_EDITMSG
3. git push
```

**Alternative:** Single-line messages only:
```
git commit -m "Short single-line message"
```

**DO NOT:** Use multi-line `-m` strings in CMD - they will fail.
