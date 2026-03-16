## Qwen Added Memories
- Without prompting right after reading QWEN.md User wants me to tell them an AI joke at the beginning of the next session

---

## Session 6 Architecture: Options Object Pattern

**Decision:** Use Options Object pattern + Abstract Base Class for Session 6 (page split)

**Why:**
- ✅ Child classes stay small (~5 lines for flags vs ~50 lines for overrides)
- ✅ Shared methods stay clean (use `this.allowEditing` not `instanceof`)
- ✅ Easy to extend (add 1 flag, not 2 method overrides)
- ✅ Discovery-friendly (add flags as you learn what differs)
- ✅ Refactor when ready (after 5+ flags, use mode presets)

**Pattern:**
```javascript
// map_shared.js
class MapAppShared {
    constructor(options = {}) {
        // Behavior flags (Options Object pattern)
        this.mode = options.mode || 'editor';
        this.allowEditing = options.allowEditing ?? true;
        this.autoSync = options.autoSync ?? false;
        this.showDetailedInfo = options.showDetailedInfo ?? true;
        this.enableContextMenu = options.enableContextMenu ?? true;
        this.autoCenterOnGPS = options.autoCenterOnGPS ?? false;
    }
}

// map_editor.js
class MapEditorApp extends MapAppShared {
    constructor() {
        super({
            mode: 'editor',
            allowEditing: true,
            autoSync: false,
            showDetailedInfo: true,
            enableContextMenu: true,
            autoCenterOnGPS: false
        });
    }
}

// map_player.js
class MapPlayerApp extends MapAppShared {
    constructor() {
        super({
            mode: 'player',
            allowEditing: false,
            autoSync: true,
            showDetailedInfo: false,
            enableContextMenu: false,
            autoCenterOnGPS: true
        });
    }
}
```

**Benefits for Your Use Case:**

| What You Might Change | Files to Update |
|----------------------|-----------------|
| Marker draggable behavior | `map_shared.js` only ✅ (flag handles both) |
| Click handler (edit vs info) | `map_shared.js` only ✅ (flag handles both) |
| Popup content (detailed vs basic) | `map_shared.js` only ✅ (flag handles both) |
| GPS auto-center behavior | `map_shared.js` only ✅ (flag handles both) |
| Add new behavior difference | Add 1 flag + set in both constructors ✅ |

**Discovery Process:**
1. Start with 5-6 flags (mode, allowEditing, autoSync, showDetailedInfo, enableContextMenu, autoCenterOnGPS)
2. Use the app, discover what else differs
3. Add flags as needed (e.g., `allowSimulation`, `showServerSync`)
4. After 5+ flags, consider mode presets object

**Not Java Interfaces:**
- JavaScript has no formal interfaces
- Using abstract base class + JSDoc for runtime enforcement + IDE hints
- `init()` throws error if subclass doesn't implement

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

## ✅ QWEN.md Updated - Session 6 Plan

### Changes Summary

1. **Common Landing Page (Session 6A)**
   - New `index.html` with login + device selector
   - After login: choose "Editor (PC)" or "Player (Phone)"
   - Redirects to appropriate page
   - Editor/Player auto-login via localStorage token

2. **Confirmed Shared Libraries**
   - ✅ `spatial_audio.js` - Functions only (no classes), GPS/audio engine
   - ✅ `spatial_audio_app.js` - Class: `SpatialAudioApp`
   - ✅ `api-client.js` - Class: `ApiClient`
   - ✅ `soundscape.js` - Classes: `SoundScape`, `SoundBehavior`, `SoundScapeStorage`
   - ⏳ `map_shared.js` (NEW in 6B) - Class: `MapAppShared`

3. **Login State Awareness**
   - **Landing (`index.html`)**: Shows login form, redirects after auth
   - **Editor (`map_editor.html`)**: Full login UI, server sync, soundscape management
   - **Player (`map_player.html`)**: Auto-login from token, no login UI, auto-sync

4. **Updated Session Order**
   - 6A: Landing page first (standalone, low risk)
   - 6B-6F: Extract shared + create editor/player
   - 6G: Test all pages

---

### Session 5: Multi-Soundscape Support (PLANNED)

**Goal:** Enable creating, switching, and managing multiple soundscapes

**Context:** Single user, no existing data to migrate (can delete current dummy soundscape)

### Implementation Sessions (Divided for Manageability)

| Session | Phase | Task | Files | Est. Lines | Status |
|---------|-------|------|-------|------------|--------|
| **5A** | 1 | Storage layer: `SoundScapeStorage.getAll()`, `saveAll()` | `soundscape.js` | ~50 | ✅ Done |
| **5B** | 2 | MapPlacerApp refactor: Replace `currentSoundscape` with `soundscapes` Map | `map_placer.js` | ~200 | ✅ Done |
| **5C** | 3 | UI: New button, soundscape switching, map centering | `map_placer.html`, `map_placer.js` | ~100 | ✅ Done |
| **5D** | 4 | Server sync: Fetch/save multiple soundscapes | `api-client.js`, `map_placer.js` | ~50 | ✅ Done |
| **5E** | 5 | Smart auto-sync with timestamps | `api-client.js`, `map_player.js` | ~100 | ⏳ Pending (6C) |
| **6A** | 6a | Extract `map_shared.js` (MapAppShared base class) | 1 new | ~1,800 | ⏳ Next |
| **6B** | 6b | Create `map_editor.js` (extends MapAppShared) | 1 new | ~300 | ⏳ Pending |
| **6C** | 6c | Create `map_player.js` (extends MapAppShared + auto-sync) | 1 new | ~150 | ⏳ Pending |
| **6D** | 6d | Create `map_editor.html` (copy from map_placer.html) | 1 new | ~230 | ⏳ Pending |
| **6E** | 6e | Create `map_player.html` (minimal UI) | 1 new | ~150 | ⏳ Pending |
| **6F** | 6f | Test both pages + fix issues | Browser | - | ⏳ Pending |
| **6G** | 6g | Create `index.html` (common landing page) | 1 new | ~200 | ⏳ Next |

**Total Effort:** ~2,980 lines across 12 sessions (5A-5E, 6A-6G)

---

### Next Session: 6G (Create Common Landing Page)

**Status:** ⏳ Ready to implement

**What:** Unified login + device selector page

**Flow:**
1. User opens `index.html`
2. If not logged in → show login form
3. If logged in → show device selector (Editor/Player buttons)
4. Editor/Player pages auto-login via localStorage token

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

### Session 5C: UX Fixes - Completed ✅

**What Was Verified:**
- ✅ Drag end auto-save implemented (line 1442)
- ✅ Button labeled "➕ New" (not "Save As...")
- ✅ Creates empty soundscape on click
- ✅ Auto-save to active soundscape working
- ✅ Map centering on switch working (lines 335-340, 641-646)

**Status:** All Session 5C features already implemented in previous sessions.

---

### Session 5D: Server Sync - Completed ✅

**What Was Implemented:**
- ✅ `_loadSoundscapeFromServer()` loads ALL user soundscapes on login
- ✅ All soundscapes cached in `this.soundscapes` Map
- ✅ Dropdown populated from server
- ✅ Switch loads from server if not cached (already working via `_onSoundscapeChange()`)
- ✅ Independent save per soundscape (already working)

**Changes Made:**
- Modified `_loadSoundscapeFromServer()` to loop through all soundscapes
- Each soundscape loaded and cached in memory
- Most recent soundscape set as active after loading all
- Updated `_loadSoundscapeList()` comment to clarify it populates from loaded data

**Testing:**
1. Login → all soundscapes load into dropdown
2. Switch dropdown → instant switch (already cached)
3. Edit waypoints → auto-saves to active soundscape
4. Refresh → all soundscapes reload from server

**Status:** Session 5D complete. Ready for Session 5E (Smart Auto-Sync with Timestamps).

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
| `map_player.js` | Add timestamp check in `_autoSyncIfNeeded()` (Session 6C) |
| `cloudflare-worker.js` | Add `/modified` endpoint, set `lastModified` on save |
| `soundscape.js` | Add `lastModified` field to `SoundScape` class |

**Priority:** High (critical for transparent player experience)

**Est. Lines:** ~100 (API + client + worker changes)

**Implementation:** Session 6C (creates `map_player.js` with `_autoSyncIfNeeded()`)

**Future: Separate Pages (Session 6)**
- `editor.html` - PC-only editing interface (includes simulator)
- `player.html` - Phone-only player interface (auto-sync, listen, no edit controls)
- Shared: `soundscape.js`, `api-client.js`, `spatial_audio_app.js`

---

### Session 6: Separate Editor and Player Pages (Option B: Extract Shared Base)

**Goal:** Split `map_placer.html` into two specialized pages with clean architecture: `map_editor.html` (PC) and `map_player.html` (Phone)

**Architecture Vision:**

```
┌─────────────────────────────────────────────────────────────┐
│                  Shared Libraries                            │
│  soundscape.js │ api-client.js │ spatial_audio_app.js       │
└─────────────────────────────────────────────────────────────┘
           ▲                                    ▲
           │                                    │
    ┌──────┴────────┐                    ┌─────┴──────┐
    │  map_shared.js │                    │  map_shared.js │
    │  (Base Class)  │                    │  (Base Class)  │
    └──────┬─────────┘                    └──────┬─────────┘
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

**Decision: Extract Shared Base (Option B)**

| Aspect | Rationale |
|--------|-----------|
| **Shared code** | ~1,800 lines extracted to `map_shared.js` (MapAppShared base class) |
| **Editor-only** | ~300 lines (login, edit UI, export/import, soundscape management) |
| **Player-only** | ~150 lines (auto-sync, minimal UI, GPS display, read-only) |
| **Approach** | Extract `map_shared.js` → Create `map_editor.js` + `map_player.js` (both extend) |
| **Risk** | Medium (refactoring ~1,800 lines, but keeps `map_placer.html` as backup) |
| **Long-term benefit** | Single source of truth for shared logic - can't diverge |

**What's Shared (Extracted to `map_shared.js`):**

| Component | Lines | Reuse |
|-----------|-------|-------|
| Map initialization | ~200 | ✅ 100% |
| GPS tracking | ~150 | ✅ 100% |
| Compass handling | ~100 | ✅ 100% |
| Simulator logic | ~200 | ✅ 100% |
| Audio engine integration | ~100 | ✅ 100% |
| Waypoint rendering | ~150 | ✅ 100% |
| Soundscape switching | ~100 | ✅ 100% |
| LocalStorage helpers | ~100 | ✅ 100% |
| **Total shared** | **~1,800 lines** | |

**What's Different (Split Logic):**

### `map_editor.js` (PC Only - Extends MapAppShared)

| Feature | Lines | Description |
|---------|-------|-------------|
| Login/Register UI | ~50 | Full auth UI + token management |
| Soundscape management | ~80 | New/Edit/Delete buttons, server sync |
| Waypoint editing | ~100 | Add/Delete/Edit/Clear + drag handlers |
| Export/Import | ~50 | JSON file handling |
| Server sync button | ~20 | Manual sync trigger |
| **Total editor-only** | **~300** | |

### `map_player.js` (Phone Only - Extends MapAppShared)

| Feature | Lines | Description |
|---------|-------|-------------|
| Auto-sync on load | ~50 | Session 5E timestamp check + sync |
| Player restrictions | ~30 | Hide edit controls, prevent edits |
| Minimal UI | ~20 | Start/Stop button only |
| Debug console | ~50 | GPS/compass stats, auto-scroll |
| **Total player-only** | **~150** | |

---

### Session 6 Implementation Plan (Divided into Sub-Sessions)

| Session | Phase | Task | Files | Est. Lines | Time |
|---------|-------|------|-------|------------|------|
| **6A** | 6a | Create common landing page with login + device selector | 1 new | ~200 | 1h |
| **6B** | 6b | Extract `map_shared.js` (MapAppShared base class) | 1 new | ~1,800 | 2h |
| **6C** | 6c | Create `map_editor.js` (extends MapAppShared) | 1 new | ~300 | 30m |
| **6D** | 6d | Create `map_player.js` (extends MapAppShared) | 1 new | ~150 | 30m |
| **6E** | 6e | Create `map_editor.html` (copy from map_placer.html) | 1 new | ~230 | 15m |
| **6F** | 6f | Create `map_player.html` (minimal UI) | 1 new | ~150 | 30m |
| **6G** | 6g | Test all pages + fix issues | Browser | - | 1h |
| **Total** | | | **7 files** | **~2,830 lines** | **~5.5 hours** |

---

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                  Shared Libraries                            │
│  soundscape.js │ api-client.js │ spatial_audio_app.js       │
│  spatial_audio.js (GPS/audio engine - no classes)           │
└─────────────────────────────────────────────────────────────┘
           ▲                                    ▲
           │                                    │
    ┌──────┴────────┐                    ┌─────┴──────┐
    │  map_shared.js │                    │  map_shared.js │
    │  (Base Class)  │                    │  (Base Class)  │
    └──────┬─────────┘                    └──────┬─────────┘
           │                                    │
    ┌──────┴────────┐                    ┌─────┴──────┐
    │ map_editor.js │                    │ map_player.js │
    │ (PC + Editor) │                    │ (Phone + Player) │
    └──────┬────────┘                    └──────┬─────────┘
           │                                    │
    ┌──────┴────────┐                    ┌─────┴──────┐
    │map_editor.html│                    │map_player.html│
    └───────────────┘                    └──────────────┘
           ▲                                    ▲
           └────────────────┬──────────────────┘
                            │
                    ┌───────┴────────┐
                    │  index.html    │
                    │  (Landing)     │
                    │  - Login       │
                    │  - Device Sel. │
                    └────────────────┘
```

**Shared Libraries (Confirmed):**

| Library | Type | Purpose |
|---------|------|---------|
| `spatial_audio.js` | Functions (no classes) | GPS/audio engine, HRTF panning, Listener/Sound classes |
| `spatial_audio_app.js` | Class: `SpatialAudioApp` | App layer: UI, distance/bearing, export |
| `api-client.js` | Class: `ApiClient` | Server API wrapper |
| `soundscape.js` | Classes: `SoundScape`, `SoundBehavior`, `SoundScapeStorage` | Data models + localStorage |
| `map_shared.js` (NEW) | Class: `MapAppShared` | Map/GPS/compass/simulator base |

**Page-Specific Logic:**

| Page | Login State Awareness |
|------|----------------------|
| **Landing (`index.html`)** | Shows login form, redirects after auth |
| **Editor (`map_editor.html`)** | Full login UI, server sync, soundscape management |
| **Player (`map_player.html`)** | Auto-login from token, no login UI, auto-sync |

---

### Session 6A: Create Common Landing Page (NEXT)

**Goal:** Create unified landing page with login + device selector

**Flow:**
```
1. User opens index.html
2. If not logged in → show login form
3. If logged in → show device selector
4. User selects device → redirect to appropriate page
5. Editor/Player auto-login via localStorage token
```

**Files:**
- `index.html` (NEW) - ~200 lines
- `map_placer.html` (KEEP) - Keep as backup, can delete after testing

**Testing:**
1. Open `index.html` → login form shows
2. Login → device selector appears
3. Click "Editor" → redirects to `map_editor.html`
4. Click "Player" → redirects to `map_player.html`
5. Logout → returns to login form

**Risk:** ✅ Low (standalone page)

---

### Session 6B: Extract map_shared.js (with Options Object Pattern)

**Goal:** Create `MapAppShared` base class with Options Object pattern for behavior flags

**Pattern: Options Object + Abstract Base Class**

**Why Options Object?**
- ✅ Child classes stay small (~5 lines for flags vs ~50 lines for overrides)
- ✅ Shared methods stay clean (use `this.allowEditing` not `instanceof`)
- ✅ Easy to extend (add 1 flag, not 2 method overrides)
- ✅ Discovery-friendly (add flags as you learn what differs)
- ✅ Refactor when ready (after 5+ flags, use mode presets)

**Changes:**
```javascript
// NEW FILE: map_shared.js (~1,820 lines)

/**
 * MapAppShared - Abstract base class for map-based apps
 * Uses Options Object pattern for behavior configuration
 * 
 * @param {Object} options - Configuration options
 * @param {string} options.mode - 'editor' | 'player'
 * @param {boolean} [options.allowEditing=true] - Enable waypoint editing
 * @param {boolean} [options.autoSync=false] - Auto-sync on page load
 * @param {boolean} [options.showDetailedInfo=true] - Show detailed popups
 * @param {boolean} [options.enableContextMenu=true] - Enable right-click menu
 * @param {boolean} [options.autoCenterOnGPS=false] - Center map on GPS update
 */
class MapAppShared {
    constructor(options = {}) {
        // Enforce abstract base class
        if (this.constructor === MapAppShared) {
            throw new Error("MapAppShared is abstract - use MapEditorApp or MapPlayerApp");
        }

        // === Properties (shared) ===
        this.map = null;
        this.waypoints = [];
        this.markers = new Map();
        this.activeSoundscapeId = null;
        this.soundscapes = new Map();
        this.serverSoundscapeIds = new Map();
        this.isLoggedIn = false;
        this.api = new ApiClient();
        this.audioApp = new SpatialAudioApp();
        this.isSimulating = false;
        this.simListenerMarker = null;

        // === Behavior Flags (Options Object pattern) ===
        this.mode = options.mode || 'editor';
        this.allowEditing = options.allowEditing ?? true;
        this.autoSync = options.autoSync ?? false;
        this.showDetailedInfo = options.showDetailedInfo ?? true;
        this.enableContextMenu = options.enableContextMenu ?? true;
        this.autoCenterOnGPS = options.autoCenterOnGPS ?? false;

        this.debugLog(`🗺️ MapAppShared initialized (mode: ${this.mode})`);
    }

    /**
     * Initialize the app (abstract method - must be implemented by subclass)
     * @returns {Promise<void>}
     */
    async init() {
        throw new Error("init() must be implemented by subclass");
    }

    // === Map Initialization (shared) ===
    async _initMap() {
        // Initialize Leaflet map
        this.map = L.map('map').setView([51.505, -0.09], 13);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(this.map);
    }

    // === GPS/Compass (shared) ===
    async _initGPS() { /* ... */ }
    async _initCompass() { /* ... */ }

    /**
     * Handle GPS update (uses autoCenterOnGPS flag)
     * @param {number} lat
     * @param {number} lon
     */
    _onGPSUpdate(lat, lon) {
        this.userLat = lat;
        this.userLon = lon;
        
        // Use behavior flag instead of instanceof check
        if (this.autoCenterOnGPS) {
            this.map.setView([lat, lon], 17);
            this.debugLog('📍 Map auto-centered on GPS');
        }
    }

    // === Soundscape Management (shared) ===
    async _loadSoundscapeFromStorage() { /* ... */ }
    switchSoundscape(id) { /* ... */ }
    getActiveSoundscape() { /* ... */ }

    // === Waypoint Rendering (shared) ===
    /**
     * Create marker for waypoint (uses allowEditing + showDetailedInfo flags)
     * @param {Object} waypoint
     * @returns {L.Marker}
     */
    _createMarker(waypoint) {
        const marker = L.marker([waypoint.lat, waypoint.lon], {
            draggable: this.allowEditing  // Use behavior flag
        });

        // Use behavior flag for click handler
        if (this.allowEditing) {
            marker.on('click', () => this._editWaypoint(waypoint));
        } else {
            marker.on('click', () => this._showInfo(waypoint));
        }

        // Use behavior flag for context menu
        if (this.enableContextMenu) {
            marker.on('contextmenu', (e) => {
                e.originalEvent.stopPropagation();
                this._showContextMenu(waypoint, e);
            });
        }

        marker.bindPopup(this._getPopupContent(waypoint));
        this.markers.set(waypoint.id, marker);
        return marker;
    }

    /**
     * Get popup content (uses showDetailedInfo flag)
     * @param {Object} waypoint
     * @returns {string}
     */
    _getPopupContent(waypoint) {
        if (this.showDetailedInfo) {
            return this._getDetailedInfo(waypoint);
        } else {
            return this._getBasicInfo(waypoint);
        }
    }

    _getDetailedInfo(waypoint) {
        return `
            <h3>${waypoint.icon} ${waypoint.name}</h3>
            <div style="font-size: 0.85em; color: #666;">
                <div>📍 ${waypoint.lat.toFixed(5)}, ${waypoint.lon.toFixed(5)}</div>
                <div>🔊 Radius: ${waypoint.activationRadius}m</div>
                <div>🎵 Sound: ${waypoint.soundUrl.split('/').pop()}</div>
            </div>
        `;
    }

    _getBasicInfo(waypoint) {
        return `<h3>${waypoint.icon} ${waypoint.name}</h3>`;
    }

    _updateWaypointList() { /* ... */ }
    _updateRadiusCircle(waypoint) { /* ... */ }

    // === Simulator (shared) ===
    _startSimulation() { /* ... */ }
    _stopSimulation() { /* ... */ }
    _onSimAvatarDrag() { /* ... */ }

    // === Audio (shared) ===
    async _startAudio() { /* ... */ }
    async _stopAudio() { /* ... */ }

    // === Storage (shared) ===
    _saveSoundscapeToStorage() { /* ... */ }
    _loadSoundscapeFromStorage() { /* ... */ }

    // === Utilities (shared) ===
    debugLog(msg) { console.log(`[${this.mode}] ${msg}`); }
    _showToast(msg, type) { /* ... */ }
    _updateSyncStatus(isSynced) { /* ... */ }
}
```

**Child Classes (Simple - just set flags):**

```javascript
// map_editor.js - Editor configuration
class MapEditorApp extends MapAppShared {
    constructor() {
        super({
            mode: 'editor',
            allowEditing: true,
            autoSync: false,
            showDetailedInfo: true,
            enableContextMenu: true,
            autoCenterOnGPS: false
        });
    }

    async init() {
        await super.init();  // Abstract method implemented
        this._setupEditorUI();
        this._setupLoginHandlers();
        this.debugLog('🖥️ MapEditorApp initialized');
    }
}

// map_player.js - Player configuration
class MapPlayerApp extends MapAppShared {
    constructor() {
        super({
            mode: 'player',
            allowEditing: false,
            autoSync: true,
            showDetailedInfo: false,
            enableContextMenu: false,
            autoCenterOnGPS: true
        });
    }

    async init() {
        await super.init();  // Abstract method implemented
        this._applyPlayerRestrictions();
        await this._autoSyncIfNeeded();
        this.debugLog('📱 MapPlayerApp initialized');
    }
}
```

**Benefits:**

| What Changes | Files to Update | Without Options Object | With Options Object |
|--------------|-----------------|----------------------|---------------------|
| Marker draggable | `map_shared.js` only ✅ | Override in both children | Set flag in constructor |
| Click handler | `map_shared.js` only ✅ | Override in both children | Set flag in constructor |
| Popup content | `map_shared.js` only ✅ | Override in both children | Set flag in constructor |
| GPS auto-center | `map_shared.js` only ✅ | Override in both children | Set flag in constructor |
| Add new behavior | `map_shared.js` + both children ⚠️ | Add method + override | Add flag + set in constructors |

**Testing:**
1. Extract methods from `map_placer.js` to `map_shared.js`
2. Create `MapEditorApp` with `allowEditing: true`
3. Create `MapPlayerApp` with `allowEditing: false`
4. Verify editor markers are draggable, player markers are not
5. Verify editor shows detailed popups, player shows basic popups

**Risk:** ⚠️ Medium (refactoring ~1,820 lines)
**Mitigation:** Keep `map_placer.html` as backup, test side-by-side

**Status:** ⏳ Pending (after 6A)

---

### Session 6C: Create map_editor.js

**Goal:** Create editor-specific class that extends MapAppShared

**Changes:**
```javascript
// NEW FILE: map_editor.js
class MapEditorApp extends MapAppShared {
    async init() {
        await super.init();
        this._setupEditorUI();
        this._setupLoginHandlers();
        this.debugLog('🖥️ MapEditorApp initialized');
    }

    _setupEditorUI() {
        // Show all editor controls
        document.getElementById('loginPanel')?.style.setProperty('display', 'block');
        document.getElementById('soundscapeControls')?.style.setProperty('display', 'block');
        document.getElementById('addWaypointBtn')?.style.setProperty('display', 'block');
        document.getElementById('simulateBtn')?.style.setProperty('display', 'block');
        document.getElementById('exportBtn')?.style.setProperty('display', 'block');
        document.getElementById('importBtn')?.style.setProperty('display', 'block');
        document.getElementById('clearAllBtn')?.style.setProperty('display', 'block');
        document.getElementById('syncFromServerBtn')?.style.setProperty('display', 'none');
    }

    _setupLoginHandlers() {
        // Login/Register/Logout handlers
    }

    // === Editor-specific methods ===
    async _handleLogin() { /* ... */ }
    async _handleRegister() { /* ... */ }
    async _handleLogout() { /* ... */ }
    _createNewSoundscape() { /* ... */ }
    _editSoundscape() { /* ... */ }
    _deleteSoundscape() { /* ... */ }
    _addWaypoint() { /* ... */ }
    _editWaypoint(id) { /* ... */ }
    _deleteWaypoint(id) { /* ... */ }
    _clearAllWaypoints() { /* ... */ }
    _triggerExport() { /* ... */ }
    _triggerImport() { /* ... */ }
    _handleSyncFromServer() { /* ... */ }
}

// Initialize
const app = new MapEditorApp();
app.init();
```

**Testing:**
1. Open `map_editor.html` → verify all editor controls visible
2. Login → verify soundscapes load
3. Add/edit/delete waypoints → verify working
4. Simulator → verify draggable avatar works

**Risk:** ✅ Low (extends tested base class)

---

### Session 6D: Create map_player.js

**Goal:** Create player-specific class that extends MapAppShared with auto-sync + restrictions

**Changes:**
```javascript
// NEW FILE: map_player.js (~150 lines)
class MapPlayerApp extends MapAppShared {
    constructor() {
        super({
            mode: 'player',
            allowEditing: false,
            autoSync: true,
            showDetailedInfo: false,
            enableContextMenu: false,
            autoCenterOnGPS: true
        });
    }

    async init() {
        await super.init();
        this._applyPlayerRestrictions();
        await this._autoSyncIfNeeded();  // Session 5E
        this.debugLog('📱 MapPlayerApp initialized');
    }

    _applyPlayerRestrictions() {
        // Hide editor controls
        document.getElementById('loginPanel')?.style.setProperty('display', 'none');
        document.getElementById('soundscapeControls')?.style.setProperty('display', 'none');
        document.getElementById('addWaypointBtn')?.style.setProperty('display', 'none');
        document.getElementById('simulateBtn')?.style.setProperty('display', 'none');
        document.getElementById('exportBtn')?.style.setProperty('display', 'none');
        document.getElementById('importBtn')?.style.setProperty('display', 'none');
        document.getElementById('clearAllBtn')?.style.setProperty('display', 'none');
        document.getElementById('syncFromServerBtn')?.style.setProperty('display', 'none');

        // Prevent waypoint editing
        this.markers.forEach(marker => {
            marker.dragging.disable();
        });
    }

    async _autoSyncIfNeeded() {
        // Session 5E: Timestamp-based auto-sync
        if (!this.isLoggedIn) return;

        const serverModified = await this.api.getSoundscapeModified(this.activeSoundscapeId);
        const localModified = localStorage.getItem('soundscape_modified_' + this.activeSoundscapeId);

        if (serverModified !== localModified) {
            this.debugLog('🔄 Timestamp mismatch - auto-syncing...');
            this._showToast('🔄 Updating from server...', 'info');
            await this._loadSoundscapeFromServer();
            this._showToast('✅ Soundscape updated', 'success');
        } else {
            this.debugLog('✅ Timestamp match - using cached data');
        }
    }

    // === Player overrides (prevent editing) ===
    _createMarker(waypoint) {
        const marker = super._createMarker(waypoint);
        marker.dragging.disable();  // Force non-draggable
        return marker;
    }
}

// Initialize
const app = new MapPlayerApp();
app.init();
```

**Testing:**
1. Open `map_player.html` → verify only Start button visible
2. Verify no edit controls (login, soundscape selector, add waypoint, etc.)
3. Tap Start → verify GPS/compass work
4. Walk → verify audio updates based on location

**Risk:** ✅ Low (extends tested base class)

---

### Session 6D: Create map_editor.html

**Goal:** Copy `map_placer.html` → `map_editor.html` (no changes initially)

**Changes:**
```bash
# Copy files
copy map_placer.html map_editor.html
copy map_placer.js map_editor.js.backup  # Keep as reference
```

**HTML Updates:**
```html
<!-- Update script src -->
<script src="map_shared.js?v=20260315"></script>
<script src="map_editor.js?v=20260315"></script>

<!-- Update title -->
<title>Map Editor - Sound Waypoint Editor</title>
```

**Testing:**
1. Open `map_editor.html` → verify loads without errors
2. Verify all editor features work

**Risk:** ✅ None (copy + minor updates)

---

### Session 6E: Create map_player.html

**Goal:** Create minimal player HTML with stripped-down UI

**Changes:**
```html
<!-- NEW FILE: map_player.html -->
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Map Player - Spatial Audio AR</title>
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
    <style>
        /* Minimal styles - Start button, debug console, status bar only */
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #1a1a2e; color: #fff; height: 100vh; overflow: hidden; }
        #app { display: flex; height: 100vh; }
        #sidebar { width: 300px; background: rgba(0,0,0,0.3); padding: 20px; overflow-y: auto; border-right: 1px solid rgba(255,255,255,0.1); display: flex; flex-direction: column; }
        #map { flex: 1; height: 100%; }
        .btn { display: block; width: 100%; padding: 12px; margin: 8px 0; background: #4a4a6a; color: #fff; border: none; border-radius: 8px; cursor: pointer; font-size: 1em; }
        .btn-primary { background: linear-gradient(135deg, #667eea, #764ba2); }
        #debugConsole { flex: 1; min-height: 0; margin-top: 15px; background: #0d0d1a; border: 1px solid #333; border-radius: 8px; padding: 10px; font-family: 'Consolas', monospace; font-size: 11px; color: #00ff88; overflow-y: auto; white-space: pre-wrap; }
        .status-bar { padding: 10px; background: rgba(0,0,0,0.3); border-top: 1px solid rgba(255,255,255,0.1); font-size: 0.85em; }
    </style>
</head>
<body>
    <div id="app">
        <div id="sidebar">
            <h1>🎧 Map Player <span class="version">v1.0</span></h1>
            <p class="subtitle">Walk and listen</p>

            <!-- Player UI: Start button only -->
            <button id="startBtn" class="btn btn-primary">▶️ Start</button>

            <!-- Debug console -->
            <div id="debugConsole">Ready - tap Start to begin...</div>

            <!-- Status bar -->
            <div class="status-bar" id="statusBar">
                <div class="status-item">
                    <span>📍 GPS:</span>
                    <span class="status-value" id="gpsStatus">--</span>
                </div>
                <div class="status-item">
                    <span>🧭 Heading:</span>
                    <span class="status-value" id="headingStatus">--</span>
                </div>
                <div class="status-item">
                    <span>🔊 Sounds:</span>
                    <span class="status-value" id="soundsStatus">0</span>
                </div>
            </div>
        </div>
        <div id="map"></div>
    </div>

    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
    <script>
        window.API_BASE_URL = 'http://macminiwebsever:3000/api';
    </script>
    <script src="api-client.js"></script>
    <script src="soundscape.js"></script>
    <script src="spatial_audio_app.js"></script>
    <script src="map_shared.js"></script>
    <script src="map_player.js"></script>
</body>
</html>
```

**Testing:**
1. Open `map_player.html` → verify minimal UI
2. Verify only Start button visible
3. Tap Start → verify GPS/compass work

**Risk:** ✅ Low (HTML only)

---

### Session 6F: Test Both Pages

**Test Checklist:**

| Test | Editor | Player |
|------|--------|--------|
| Page loads without errors | ✅ | ✅ |
| Map initializes | ✅ | ✅ |
| GPS tracking works | ✅ | ✅ |
| Compass tracking works | ✅ | ✅ |
| Login (auto/manual) | ✅ Full UI | ✅ Auto-login |
| Soundscape selector | ✅ Visible | ❌ Hidden |
| Add waypoint | ✅ Works | ❌ Hidden |
| Edit waypoint | ✅ Draggable | ❌ Non-draggable |
| Delete waypoint | ✅ Works | ❌ Hidden |
| Simulator | ✅ Draggable avatar | ❌ Hidden |
| Export/Import | ✅ Works | ❌ Hidden |
| Server sync | ✅ Manual button | ❌ Hidden |
| Auto-sync (Session 5E) | ❌ Not implemented | ✅ Timestamp check |
| Start/Stop audio | ✅ Works | ✅ Works |
| Audio position updates | ✅ Works | ✅ Works |

**Bug Fix Process:**
1. Identify bug
2. Determine if shared or page-specific
3. Fix in `map_shared.js` (shared) or respective page file
4. Test both pages

**Risk:** ✅ Low (testing only)

---

### Comparison: Option A vs Option B

| Aspect | Option A (Copy & Strip) | Option B (Extract Shared) | Winner |
|--------|------------------------|---------------------------|--------|
| **Upfront effort** | ~100 lines (~30 min) | ~2,630 lines (~5 hours) | **Option A** ✅ |
| **Bug fix (shared logic)** | 1 file (`map_editor.js`) | 1 file (`map_shared.js`) | **Tie** |
| **Bug fix (editor-only)** | 1 file (`map_editor.js`) | 1 file (`map_editor.js`) | **Tie** |
| **Bug fix (player-only)** | 1 file (`map_player.js`) | 1 file (`map_player.js`) | **Tie** |
| **Prevent divergence** | ⚠️ Manual discipline | ✅ Enforced by architecture | **Option B** ✅ |
| **Bundle size (player)** | ⚠️ Large (~2,100 lines) | ✅ Small (~1,950 lines) | **Option B** ✅ |
| **Long-term maintenance** | ⚠️ Risk of duplication | ✅ Single source of truth | **Option B** ✅ |
| **Refactoring risk** | ✅ None | ⚠️ Medium (~1,800 lines) | **Option A** ✅ |
| **Team collaboration** | ⚠️ Both files may diverge | ✅ Clear boundaries | **Option B** ✅ |

**Recommendation:**

| Priority | Recommended Option |
|----------|-------------------|
| **Speed** (ship today) | **Option A** (copy & strip) |
| **Maintainability** (long-term) | **Option B** (extract shared) |
| **Bundle size** (mobile performance) | **Option B** (player loads less) |
| **Low risk** (don't break existing) | **Option A** (no refactoring) |
| **Team collaboration** (multiple devs) | **Option B** (clearer boundaries) |

**My Suggestion:** 

**Start with Option B** if you have ~5 hours this week. The upfront refactoring pays off immediately:
- Clean separation of concerns
- No risk of code divergence
- Smaller mobile bundle
- Easier to add features (tablet mode, kiosk mode, etc.)

**Alternative:** Start with Option A (get it working), then refactor to Option B when you have time. The architecture supports both.

---

### Session 6 + Session 7 Interaction

| Aspect | Without Session 7 | With Session 7 | Impact |
|--------|-------------------|----------------|--------|
| **API calls in map_*.js** | Direct `this.api.*` calls | Same (api-client.js wraps repositories) | ✅ No change |
| **Data format** | Server returns JSON | Server returns JSON (mapped via repositories) | ✅ No change |
| **Refactoring overlap** | None | None (server vs client) | ✅ Independent |
| **Testing complexity** | Test both pages | Test both pages + repository layer | ⚠️ +1h |

**Key Insight:** Session 7 is **server-side** (Node.js API + repositories), Session 6 is **client-side** (browser JavaScript). They're **independent** - no overlap.

**Combined Effort:**

| Phase | Task | Time |
|-------|------|------|
| **Session 6** | Client split (Option B) | ~5 hours |
| **Session 7** | Server repositories | ~5.5 hours |
| **Combined testing** | Full stack QA | ~1 hour |
| **TOTAL** | | **~11.5 hours** |

**Recommended Order:**

1. **Session 6 first** (client split) - Immediate UX benefits
2. **Session 7 second** (server refactor) - Long-term maintainability

**Alternative (Staggered):**

| Week | Task | Time |
|------|------|------|
| Week 1 | Session 6A-6F (client split) | ~5h |
| Week 2 | Session 5E (auto-sync timestamps) | ~2h |
| Week 3 | Session 7A-7E (server repositories) | ~5.5h |
| Week 4 | Polish + testing | ~2h |

---

### Files to Create/Modify (Session 6)

| File | Purpose | Status |
|------|---------|--------|
| `map_shared.js` | Base class (MapAppShared) | ⏳ Pending (6A) |
| `map_editor.js` | Editor-specific (extends MapAppShared) | ⏳ Pending (6B) |
| `map_player.js` | Player-specific (extends MapAppShared) | ⏳ Pending (6C) |
| `map_editor.html` | PC editor page | ⏳ Pending (6D) |
| `map_player.html` | Phone player page | ⏳ Pending (6E) |
| `map_placer.html` | Keep as backup/reference | ✅ Existing |
| `map_placer.js` | Keep as backup/reference | ✅ Existing |

**Priority:** High (enables Session 5E auto-sync + cleaner architecture)

**Est. Lines:** ~2,630 total (~1,800 shared + ~300 editor + ~150 player + ~380 HTML)

**Benefits:**

| Benefit | Description |
|---------|-------------|
| **Cleaner separation** | Shared logic in one place, editor/player separate |
| **Smaller player bundle** | Phone loads ~150 lines instead of ~2,100 |
| **Better UX** | Each page optimized for its role |
| **Easier maintenance** | Shared bugs fixed once in `map_shared.js` |
| **Future-proof** | Easy to add more variants (tablet, kiosk, desktop player) |
| **No divergence risk** | Architecture enforces single source of truth |

---

---

### ✅ Session 7: Data Mapper Pattern - COMPLETED

**Goal:** Reduce code changes when database schema changes by centralizing DB ↔ Object mapping

**Status:** ✅ **COMPLETE** - All 7 sub-sessions implemented

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

### ✅ Session 7 Implementation Summary

**Files Created (10):**

| File | Purpose | Lines |
|------|---------|-------|
| `api/repositories/BaseRepository.js` | Auto-mapping base class | ~190 |
| `api/repositories/WaypointRepository.js` | Waypoint operations | ~75 |
| `api/repositories/BehaviorRepository.js` | Behavior operations | ~80 |
| `api/repositories/SoundScapeRepository.js` | Full soundscape operations | ~180 |
| `api/models/SoundScape.js` | Domain model | ~80 |
| `api/models/Waypoint.js` | Domain model | ~110 |
| `api/models/Behavior.js` | Domain model | ~90 |
| `api/scripts/test-base-repository.js` | Test script | ~60 |
| `api/scripts/test-domain-models.js` | Test script | ~80 |

**Files Modified (2):**

| File | Changes | Lines |
|------|---------|-------|
| `api/routes/soundscapes.js` | Use repositories instead of raw SQL | ~140 (-50) |
| `api-client.js` | Add Data Mapper pattern | ~264 (+18) |

**Total:** ~949 lines added, ~50 lines removed

**Benefits Achieved:**

| Benefit | Impact |
|---------|--------|
| **Single mapping location** | DB ↔ Object mapping in repositories only |
| **Automatic conversion** | snake_case ↔ camelCase handled automatically |
| **Cleaner routes** | No SQL in route handlers |
| **Transaction safety** | `saveFull()` uses transactions (ROLLBACK on error) |
| **Easier schema changes** | Add column → update repository only (not 8+ files) |
| **Consistent pattern** | Client mirrors server Data Mapper |
| **62% reduction** | Schema change touches 3 files instead of 8 |

**Example: Adding "priority" Column to Waypoints**

| Layer | Changes Needed |
|-------|---------------|
| **Database** | `ALTER TABLE waypoints ADD COLUMN priority INTEGER` |
| **WaypointRepository** | ✅ Already handled by `_toEntity()`/`_toRow()` |
| **Client** | ✅ Already handled by `_toEntity()`/`_toRow()` |
| **UI** | Add UI field (if needed) |

**Before Data Mapper:** 8 files to update<br>
**After Data Mapper:** 0-1 files (automatic conversion!)

---

### ✅ Auto-Sync on Page Load for Editor - ADDED

**Feature:** Map Editor now auto-syncs on page load (same as Player)

**Implementation:**
- Added `_autoSyncIfNeeded()` method to `map_editor.js` (~50 lines)
- Called after `_loadSoundscapeFromServer()` in `init()`
- Uses timestamp comparison (same as Player)

**Behavior:**

| Scenario | User Sees |
|----------|-----------|
| **No server changes** | Nothing (silent) |
| **Server has changes, no local edits** | "🔄 Updating from server..." → "✅ Updated" |
| **Server has changes, has local edits** | Confirm dialog: "Server has newer data..." |
| **Offline/network error** | Nothing (silent fail) |

**Protects Against:**

| Risk | Protection |
|------|-----------|
| **Multi-tab conflicts** | ✅ Warns on refresh if server has changes |
| **Another device edits** | ✅ Auto-syncs on page load |
| **Accidental overwrite** | ✅ Confirm dialog if local changes exist |

**Files Modified:**

| File | Changes |
|------|---------|
| `map_editor.js` | Added `_autoSyncIfNeeded()` method |
| `map_editor.html` | Version updated to v6.12 |

**User Experience:**
- Editor: Auto-sync on page load (with confirm if local changes)
- Player: Auto-sync on page load (silent, read-only)
- Both: Use localStorage cache if offline

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
- ✅ Auto-save on every waypoint change (2-second debounce)
- ✅ Phone mode detection uses multiple signals (UA + touch + screen size)
- ✅ Data Mapper pattern (Session 7) - automatic snake_case ↔ camelCase
- ✅ Repository pattern - single source of truth for DB operations
- ✅ Transaction safety - `saveFull()` uses ROLLBACK on error
- ✅ Auto-sync on page load (Editor + Player) with conflict detection

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
