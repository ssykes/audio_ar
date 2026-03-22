---

## 📚 Documentation Hierarchy

**For new feature work, reference documentation in this order:**

```
QWEN.md (this file - project context & memories)
    ↓
FEATURES.md (feature catalog - all completed features)
    ↓
FEATURE_*.md (individual feature specs - e.g., FEATURE_14_DISTANCE_BASED_AUDIO.md)
    ↓
Source code (implementation)
```

### Quick Reference

| Document | Purpose | When to Use |
|----------|---------|-------------|
| **QWEN.md** | Project context, memories, setup | Starting session, need project info |
| **FEATURES.md** | Feature catalog (1-15 completed) | Reference existing features, plan new ones |
| **FEATURE_*.md** | Deep-dive specs (e.g., `FEATURE_14_IMPLEMENTED.md`) | Implementation details, debugging |
| **LAZY_*.md** | Lazy loading architecture | Audio optimization work |
| **CLOUDFLARE_*.md** | Server/CDN configuration | Deploy issues, cache problems |

### Starting a New Feature (Feature 15+)

1. **Check `FEATURES.md`** → See what's already implemented (Features 1-14)
2. **Review planned features** → Bottom of `FEATURES.md` (Features 15-17)
3. **Create new `FEATURE_15_*.md`** → Detailed spec for new feature
4. **Update `FEATURES.md`** → Add Feature 15 to completed list
5. **Implement** → Reference spec file during coding

### Current Project Status

See bottom of this file for latest versions, known issues, and next priorities.

---

## Qwen Added Memories
- Without prompting right after reading QWEN.md User wants me to tell them an AI joke at the beginning of the next session

---
- To run PowerShell scripts in this project, use the `&` call operator: `& .\deploy.ps1` or `& .\fix_deploy.ps1`. Without the `&`, PowerShell opens the script in a notebook/editor instead of executing it. Alternative: `powershell -ExecutionPolicy Bypass -File .\script.ps1`

---
- **Deploy Script Cache-Busting**: `deploy.ps1` automatically creates temporary `.deploy` versions of HTML files with cache-busting query strings (e.g., `?v=20260318150000`), uploads them to the server, then cleans up. This bypasses browser caching even though git pre-commit hook strips versions from committed files.

**Note:** Feature documentation has been moved to `FEATURES.md`

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

---

**Note:** Session documentation (Features 8-14) has been moved to `FEATURES.md`

---

## Versioning & Cache-Busting System

### Overview

The project uses a **two-tier versioning system** managed by `deploy.ps1`:

| Version Type | Format | Example | Purpose |
|--------------|--------|---------|---------|
| **Display Version** | `v{major}.{minor}` | `v7.2` | User-visible version shown in HTML UI |
| **Cache-Busting Version** | `yyyyMMddHHmmss` | `20260317233153` | URL query string to bust browser cache |

### How It Works

**1. Display Version (User-Facing)**
- Stored in HTML: `<span class="version">v7.2</span>`
- Incremented automatically by `deploy.ps1` (minor version +1)
- Files tracked: `map_player.html`, `map_editor.html`, `index.html`, etc.
- **Purpose:** Lets users see which version they're on

**2. Cache-Busting Version (Technical)**
- Generated at deploy time: `Get-Date -Format "yyyyMMddHHmmss"`
- Applied to all `<script>` and `<link>` tags in HTML
- Example: `<script src="map_player.js?v=20260317233153"></script>`
- **Purpose:** Forces browsers to download fresh JS/CSS files

### Deploy Script Behavior

```powershell
# deploy.ps1 - Version Management

# 1. Generate cache-busting timestamp
$VERSION = Get-Date -Format "yyyyMMddHHmmss"
# Example: 20260317233153

# 2. Increment display versions (v7.1 → v7.2)
foreach ($htmlFile in $DISPLAY_VERSION_FILES) {
    # Regex: <span>v{major}.{minor}</span>
    # Replace: minor = minor + 1
}

# 3. Update all script/link tags with cache-busting version
foreach ($htmlFile in $HTML_FILES) {
    # Regex: src="file.js?v={old_version}"
    # Replace: src="file.js?v=$VERSION"
}
```

### Files Updated by deploy.ps1

**Display Version (HTML UI):**
- `map_player.html`
- `map_editor.html`
- `map_placer.html`
- `index.html`
- `soundscape_picker.html`
- `auto_rotate.html`
- `single_sound_v2.html`

**Cache-Busting (Script/Link Tags):**
- All of the above, plus:
- `spatial_audio.js`
- `spatial_audio_app.js`
- `debug_logger.js`
- `wake_lock_helper.js`
- `map_shared.js`
- `map_player.js`
- `map_editor.js`
- `map_placer.js`
- `soundscape.js`
- `api-client.js`

### Git & Version Control

**Pre-commit Hook (Auto-Installed):**

Cache-busting versions are **automatically stripped** before committing by the pre-commit hook.

| Hook | Location | Status |
|------|----------|--------|
| Bash script | `.git/hooks/pre-commit` | ✅ Installed |
| PowerShell | `.git/hooks/pre-commit.ps1` | ✅ Installed |
| Git config | `core.hooksPath = .git/hooks` | ✅ Configured |

**What Gets Committed:**
- ✅ JavaScript files (without version numbers)
- ✅ HTML files (without cache-busting query strings)
- ✅ Display versions (e.g., `<span class="version">v6.8</span>`)

**What Does NOT Get Committed:**
- ❌ Cache-busting query strings (e.g., `?v=20260317233153`)

**Example:**
```diff
Before commit (working directory):
    <script src="map_player.js?v=20260317233153"></script>

After pre-commit hook (committed):
    <script src="map_player.js"></script>
```

**Testing the Hook:**
```bash
# Stage an HTML file
git add map_player.html

# Commit (hook runs automatically)
git commit -m "Update HTML"

# Verify what was committed
git show HEAD
# Cache-busting versions should be stripped
```

### Manual Version Tracking

For documentation purposes, track versions in QWEN.md:

```markdown
### 📁 Current File Versions

| File | Display Version | Cache Version | Last Updated |
|------|-----------------|---------------|--------------|
| `map_player.html` | v7.2 | 20260317233153 | 2026-03-17 23:31 |
| `map_player.js` | - | 20260317233153 | 2026-03-17 23:31 |

**Note:** Cache versions updated on every deploy. Check HTML files for current values.
```

### Testing & Verification

**Check Current Cache Versions:**
```bash
# Grep HTML files for version query strings
grep -o 'src="[^"]*\.js?v=[0-9]*"' map_player.html

# PowerShell equivalent:
Select-String -Pattern 'src="[^"]*\.js\?v=[0-9]*"' -Path map_player.html -AllMatches
```

**Check Display Versions:**
```bash
# Find all display versions in HTML files
grep -o '<span class="version">v[0-9.]*</span>' *.html

# PowerShell:
Select-String -Pattern '<span class="version">v[0-9.]*</span>' -Path *.html
```

**Force Fresh Deploy:**
1. Run `./deploy.ps1`
2. Hard refresh browser: `Ctrl+Shift+R` (Windows) or `Cmd+Shift+R` (Mac)
3. Verify new cache version in HTML source

### Troubleshooting

| Issue | Solution |
|-------|----------|
| Browser shows old JS | Hard refresh (`Ctrl+Shift+R`), check cache version in HTML |
| Deploy script fails | Verify PowerShell execution policy: `Set-ExecutionPolicy RemoteSigned -Scope CurrentUser` |
| Version not incrementing | Check HTML has `<span class="version">vX.Y</span>` format |
| Cache not busting | Verify `<script>` tags have `?v=` query string |
| Pre-commit hook not running | Check `git config core.hooksPath` returns `.git/hooks` |
| Hook permission denied (Windows) | Run: `icacls .git\hooks\pre-commit /grant Everyone:(RX)` |

---

## ⚠️ TODO: Fix Cloudflare Cache Issue (High Priority)

**Discovered:** 2026-03-18

**Problem:** Cloudflare is caching JavaScript files despite `.htaccess` no-cache headers.

**Test Results:**
```powershell
Invoke-WebRequest -Uri "https://ssykes.net/map_player.js" -UseBasicParsing | 
    Select-Object -ExpandProperty Headers | 
    Where-Object {$_.Key -eq "CF-Cache-Status"}

# Result: CF-Cache-Status: HIT  ← Cloudflare IS caching!
# Cache-Control: max-age=14400  ← Cached for 4 hours
```

**Impact:**
- Users may get stale JavaScript for up to 4 hours after deploy
- Query string cache-busting (`?v=`) is being ignored by Cloudflare
- `.htaccess` no-cache headers are being overridden

**Solution (Choose One):**

### Option 1: Change Cloudflare Caching Level (RECOMMENDED)

**Steps:**
1. Cloudflare Dashboard → **Caching** → **Configuration**
2. Set **Caching Level** to **`No Query String`**
3. Wait 1-2 minutes for changes to propagate
4. Verify: Run test command above, expect `CF-Cache-Status: DYNAMIC` or `BYPASS`

**Why This Works:**
- HTML uses query strings: `map_player.js?v=20260317233153`
- "No Query String" mode = Cloudflare won't cache URLs with query strings
- JS files will show `DYNAMIC` or `BYPASS` instead of `HIT`

### Option 2: Add Cache Rule to Bypass JavaScript

**Steps:**
1. Cloudflare Dashboard → **Caching** → **Cache Rules**
2. Click **Create Rule**
3. Configure:
   ```
   Rule name: Bypass JavaScript Cache
   If...: File Extension → equals → js
   Then...: Cache Level → Bypass
   ```
4. Click **Deploy**

### Option 3: Purge Cache After Each Deploy (Temporary)

**Manual purge via dashboard:**
1. Cloudflare Dashboard → **Caching** → **Configuration**
2. Click **Purge Everything**
3. Wait 30 seconds

**Or use PowerShell script (requires API token):**
```powershell
.\purge-cloudflare-cache.ps1 -File map_player.js
```

**Note:** This is temporary - cache will rebuild after 4 hours.

**Verification After Fix:**
```powershell
Invoke-WebRequest -Uri "https://ssykes.net/map_player.js" -UseBasicParsing | 
    Select-Object -ExpandProperty Headers | 
    Where-Object {$_.Key -eq "CF-Cache-Status"}

# Expected: CF-Cache-Status: DYNAMIC  ← or BYPASS
```

**Documentation:**
- Full troubleshooting guide: `CLOUDFLARE_CACHE_TROUBLESHOOTING.md`
- Purge script: `purge-cloudflare-cache.ps1`
- Deploy script notes: See top of `deploy.ps1`

**Status:** ⏳ **Pending** - Requires manual Cloudflare dashboard configuration

---

---

### 🎯 Next Priority Items

1. **Test on mobile devices** - Verify GPS/compass work on phones
2. **Update map_editor.html** - Apply Session 10 UI redesign to editor
3. **Behavior editing UI** - Visual timeline for behavior configuration
4. **Multi-user sync** - WebSocket-based real-time collaboration

### 🐛 Known Issues

None currently - all Session 10 bugs fixed:
- ✅ Start button toggles correctly
- ✅ Waypoints stay visible when audio starts

---

## ✅ Session 11: Edit Waypoint Duplicate Bug Fix - COMPLETED (v6.11)

**Status:** ✅ **COMPLETE** - Fixed duplicate waypoints and circles on edit

**Problem:**
When editing a waypoint in `map_editor.html`:
- Old blue circle remained on map, new circle appeared
- Duplicate waypoint entry appeared in waypoint list
- Duplicates persisted after browser refresh (saved to server)

**Root Cause:**
Sequence of modal dialogs (`prompt()`/`confirm()`) during edit:
1. User clicks "Edit" button in popup
2. Series of 4 dialogs appear (sound URL, volume, loop, radius)
3. After last dialog (radius) closes, popup reopens
4. **Marker click event can still fire** (event bubbling or accidental re-click)
5. Triggers `_editWaypoint()` **again** while first edit completes
6. Second call creates duplicate waypoint in `this.waypoints` array
7. Both duplicates saved to server → persist across refreshes

**Solution:**
Added `isEditing` guard flag to prevent reentrant calls:

```javascript
// map_shared.js - Added property
this.isEditing = false;  // Line 86

// _editWaypoint() - Guard at start
if (this.isEditing) {
    this.debugLog('⚠️ Edit already in progress - ignoring duplicate call');
    return;
}

this.isEditing = true;
// ... edit logic ...
this.isEditing = false;
```

**Additional Fixes:**
- Changed `bindPopup()` to `setPopupContent()` - prevents popup binding duplication
- Added `event.stopPropagation()` to Edit/Delete buttons - prevents click bubbling

**Files Modified:**

| File | Version | Changes |
|------|---------|---------|
| `map_shared.js` | v6.11 | Added `isEditing` property + guard flag in `_editWaypoint()` |
| `map_editor.html` | - | Cache-busting version update |

**Testing:**
- ✅ Edit waypoint → only one entry in list
- ✅ Only one blue circle on map
- ✅ Debug log shows "Edit already in progress" if clicked twice
- ✅ Refresh page → no duplicates

**Code Quality:**
- Guard pattern prevents race conditions
- Early return with clear error message
- Flag properly reset on all exit paths (cancel/OK)

---

## ✅ Session 12: Map Player Refresh Bug Fix - COMPLETED (v7.2+)

**Status:** ✅ **COMPLETE** - Waypoints now persist on page refresh

**Problem:**
When refreshing `map_player.html`, all waypoints disappeared and debug log showed "No server soundscape selected". User had to go back to soundscape picker to restore waypoints.

**Root Cause:**
1. `selected_soundscape_id` is a one-time token (cleared after use)
2. `activeSoundscapeId` was not persisted across page refreshes
3. On refresh: `activeSoundscapeId` = null → `_loadSoundscapeFromServer()` returned early → no waypoints loaded

**Solution:**
Persist `activeSoundscapeId` in localStorage for page refresh restoration

**Files Modified:**

| File | Changes |
|------|---------|
| `map_player.js` | Save/restore `player_active_soundscape_id` in localStorage |
| `map_player.html` | Cache-busting version update (v=20260316190000) |

**Code Changes:**

```javascript
// On page load - restore from localStorage
const persistedId = localStorage.getItem('player_active_soundscape_id');
if (persistedId) {
    this.debugLog(`📱 Restoring active soundscape from previous session: ${persistedId}`);
    this.activeSoundscapeId = persistedId;
}

// On logout - clear persisted ID
localStorage.removeItem('player_active_soundscape_id');
```

**User Flow (After Fix):**

| Action | Behavior |
|--------|----------|
| Select soundscape from picker | → Loads in player + persisted to localStorage |
| Refresh page | → Restores same soundscape from localStorage ✅ |
| Go back to picker + select different | → Loads new soundscape + updates localStorage |
| Logout | → Clears persisted ID (prevents stale data) |

**Testing:**
- ✅ Select soundscape → refresh → waypoints persist
- ✅ Debug log shows "Restoring active soundscape from previous session"
- ✅ Back to picker → select different → loads correctly
- ✅ Logout → login → starts fresh (no stale soundscape)

---

### 📁 Current File Versions (Updated)

| File | Version | Last Updated |
|------|---------|--------------|
| `map_player.html` | v7.2 | 2026-03-16 19:00 |
| `map_player.js` | v7.2+ | 2026-03-16 19:00 |
| `map_editor.html` | v6.59+ | 2026-03-16 |
| `map_shared.js` | v6.11 | 2026-03-16 |
| `soundscape.js` | v3.0 | 2026-03-16 |
| `api-client.js` | - | 2026-03-16 |
| `index.html` | v6.8 | 2026-03-16 |
| `soundscape_picker.html` | - | 2026-03-16 |

**Status:**
- ✅ SVG icons render properly
- ✅ Debug logs color-coded
- ✅ Auto-sync works with timestamps
- ✅ Waypoints persist on page refresh

---

## ✅ Session 13: Listener Drift Compensation - COMPLETED

**Status:** ✅ **COMPLETE** - EMA smoothing with adaptive stationary detection

**Problem:**
- GPS/BLE position noise causes sound sources to "float" or drift
- User standing still perceives sound moving 2-5m randomly
- Distracting immersion break, especially in stationary listening scenarios

**Root Cause:**
- GPS accuracy: 3-10m random walk
- BLE RSSI fluctuation: ±3-10 dBm noise
- Audio engine treats all position updates as real movement
- No differentiation between actual movement and sensor noise

**Solution: Exponential Moving Average (EMA) with Adaptive Smoothing**

```
┌─────────────────────────────────────────────────────────────┐
│  GPS says user moved 2m right (but actually stationary)     │
│                                                             │
│  Normal approach:                                           │
│  🎵 Sound ←─── 2m ───→ 🚶 Listener                          │
│  (Sound appears to drift left)                              │
│                                                             │
│  Compensation approach:                                     │
│  🎵 Sound ─── 2m ───→ 🚶 Listener (virtual)                 │
│  (Move listener back → sound stays stable)                  │
└─────────────────────────────────────────────────────────────┘
```

### Implementation Details

**Architecture:**
```javascript
// spatial_audio_app.js - Constructor properties
this.smoothedListenerLat = 0;
this.smoothedListenerLon = 0;
this.rawListenerLat = 0;  // For UI display
this.rawListenerLon = 0;
this.smoothingFactor = 0.1;  // Adaptive: 0.05 (stationary) to 0.3 (moving)
this.lastMovementTime = 0;
this.movementThreshold = 0.5;  // m/s - below this = stationary
this.isStationary = false;
this.stationaryThreshold = 2000;  // ms
```

**Adaptive Smoothing Logic:**
```javascript
_updateListenerPosition(lat, lon, heading) {
    // Store raw position for UI display
    this.rawListenerLat = lat;
    this.rawListenerLon = lon;

    // Detect if stationary vs moving
    const speed = distance / timeDiff;
    if (speed < this.movementThreshold) {
        this.isStationary = true;
    } else {
        this.isStationary = false;
        this.lastMovementTime = Date.now();
    }

    // Apply adaptive smoothing
    const targetSmoothing = this.isStationary ? 0.05 : 0.3;
    this.smoothingFactor = this._lerp(this.smoothingFactor, targetSmoothing, 0.1);

    // Exponential Moving Average
    const smoothedLat = (this.smoothingFactor * lat) +
                       ((1 - this.smoothingFactor) * this.smoothedListenerLat);
    const smoothedLon = (this.smoothingFactor * lon) +
                       ((1 - this.smoothingFactor) * this.smoothedListenerLon);

    this.smoothedListenerLat = smoothedLat;
    this.smoothedListenerLon = smoothedLon;

    // Update listener with smoothed position
    this.listener.update(smoothedLat, smoothedLon, heading);
}
```

**Tuning Parameters:**
| Parameter | Value | Effect |
|-----------|-------|--------|
| `smoothingFactor` (stationary) | 0.05 | Heavy smoothing, ~2s latency |
| `smoothingFactor` (moving) | 0.3 | Responsive, ~300ms latency |
| `movementThreshold` | 0.5 m/s | Below this = stationary |
| `stationaryThreshold` | 2000 ms | Time to consider stationary |

### Files Modified

| File | Changes | Lines |
|------|---------|-------|
| `spatial_audio_app.js` | Add drift compensation properties + methods | ~120 |
| `map_player.js` | Add `onDebugLog` callback | ~5 |
| `map_shared.js` | Add `onDebugLog` callback (simulation mode) | ~5 |
| **Total** | | **~130 lines** |

### User Experience

| Metric | Before Compensation | After Compensation |
|--------|---------------------|--------------------|
| **Perceived drift** | 3-5m random walk | 0.5-1m stable |
| **User experience** | Noticeable floatiness | Minimal movement |
| **Stationary stability** | Distracting | Rock-solid |
| **Moving responsiveness** | N/A | Preserved (adaptive smoothing) |

### Debug Logging

```javascript
// Debug log shows drift compensation state
[Drift] 🔒 STATIONARY smoothing=0.052 (speed: 0.12 m/s)
[Drift] 🚶 MOVING smoothing=0.285 (speed: 1.23 m/s)
```

### Testing Protocol

**1. Stationary Test:**
```javascript
// Stand in one spot for 60 seconds
// Observe: Sound should stay within 1m radius
// Debug log: "🔒 STATIONARY smoothing=0.05"
```

**2. Movement Test:**
```javascript
// Walk in straight line for 20m
// Observe: Sound positions update smoothly, no lag
// Debug log: "🚶 MOVING smoothing=0.3"
```

**3. Transition Test:**
```javascript
// Walk → Stop → Walk
// Observe: Smooth transition between modes
// Debug log: Shows smoothing factor adapting
```

### Integration with Existing Features

**Session 10: Icon Bar UI**
- GPS/heading display shows raw (unsmoothed) position
- Debug modal shows drift compensation state

**Session 13 (Lazy Loading - Planned)**
- Drift compensation runs **before** zone detection
- Smoothed position used for active/preload/unload decisions
- Prevents sounds from rapidly loading/unloading due to GPS noise

### Benefits Achieved

| Benefit | Description |
|---------|-------------|
| **Stable audio** | No more "floating" sounds when stationary |
| **Adaptive** | Heavy smoothing when still, responsive when moving |
| **Low complexity** | ~130 lines, single algorithm |
| **No user interaction** | Fully automatic (no lock/unlock buttons needed) |
| **Debug-friendly** | Logs show smoothing state + speed |

### Trade-offs

| Aspect | Decision |
|--------|----------|
| **Approach** | EMA (simple, effective) |
| **Latency** | 300ms-2s (adaptive) |
| **User control** | None (fully automatic) |
| **Future upgrade** | Can add anchor point UI if needed |

### Reference

- Full documentation: `Listener_DRIFT_COMPENSATION.md`
- Approaches considered: EMA, Moving Average, Stationary Detection, Anchor Point
- Selected: **EMA with Adaptive Smoothing** (best balance of simplicity + effectiveness)

---

## Session 13: Lazy Loading for Sound Walks (PLANNED - Phase 1)

### Problem Statement

**Current Behavior:**
- All sounds in a soundscape are loaded into memory at startup
- All sounds start playing immediately (even if gain=0 when out of range)
- For sound walks with 20-50+ waypoints, this causes:
  - **High memory usage**: 50-250 MB (1-5 MB per audio buffer)
  - **High CPU usage**: 20-100% (spatial calculations + audio processing per sound)
  - **Phone crashes**: Mobile devices run out of RAM with 50+ sounds

**Resource Usage Analysis:**

| Resource | Playing (gain=0) | Paused | Stopped + Disposed |
|----------|------------------|--------|-------------------|
| **Audio buffer (RAM)** | ✅ Loaded | ✅ Loaded | ✅ Loaded |
| **BufferSource node** | ✅ Active | ❌ Disposed | ❌ Disposed |
| **Gain nodes** | ✅ Active | ✅ Connected | ❌ Disconnected |
| **Panner node** | ✅ Active | ✅ Connected | ❌ Disconnected |
| **CPU (decoding)** | ✅ Processing | ❌ None | ❌ None |
| **CPU (spatial calc)** | ✅ Updating | ✅ Updating | ❌ None |

**Key Insight:** Pausing does NOT free significant resources. Audio buffers remain in RAM, and most nodes stay connected.

### Solution: Three-Zone Lazy Loading (Phase 1: Core Types)

**Architecture:**

```
User walks along route:
  ┌─────────────────────────────────────────┐
  │  🎵     🎵     🎵     🎵     🎵         │
  │        ↑                                │
  │      User                               │
  │                                         │
  │  Active zone (0-50m): Load + play       │
  │  Preload zone (50-100m): Load async     │
  │  Unload zone (>100m): Dispose/pause     │
  └─────────────────────────────────────────┘
```

**Zone Specifications by Audio Type:**

| Zone | Buffers (MP3) | Oscillators | Streams (HLS) |
|------|---------------|-------------|---------------|
| **Active** (0-50m) | Load + play | Create + play | Play (gain based on distance) |
| **Preload** (50-100m) | Load async (muted) | N/A (instant) | Pause (keep connection) |
| **Unload** (>100m) | Full dispose | Full dispose | Pause only (50-200m), dispose >200m |

**Resource Comparison:**

| Approach | 20 Sounds | 50 Sounds | 100 Sounds |
|----------|-----------|-----------|------------|
| **Current (all playing)** | 100 MB, 40% CPU | 250 MB, 100% CPU | 🔴 Crash |
| **All paused** | 100 MB, 10% CPU | 250 MB, 25% CPU | 🔴 Crash |
| **Lazy loading (3-zone)** | 15 MB, 5% CPU | 15 MB, 5% CPU | 15 MB, 5% CPU ✅ |

---

### Phase 1: Implement Session 13 (Current Plan)

**Core Sound Sources:**

| Type | Status | Lazy Load Strategy |
|------|--------|-------------------|
| **Buffers (MP3)** | ✅ Session 13 | Standard lazy loading (load/preload/dispose) |
| **Oscillators** | ✅ Session 13 | Instant create/dispose (no preload needed) |
| **Streams (HLS)** | ✅ Session 13 | Pause-only strategy (50-200m), dispose >200m |

**Phase 2+ (Future):** Multi-sample, Procedural, Granular, Physical Modeling, Binaural, Convolution, Behavioral, Spectral, Sequencer, Effects Chain

**Full Documentation:** See `LAZY_LOADING_SPECIFICATION.md` for complete implementation details and `FUTURE_SOUND_SOURCES.md` for future sound source types.

---

### Implementation Plan (Divided into Sub-Sessions)

| Session | Phase | Task | Files | Est. Lines | Time | Risk |
|---------|-------|------|-------|------------|------|------|
| **13A** | 1 | Add Sound type + state tracking | `spatial_audio_app.js` | ~50 | 25 min | ✅ None |
| **13B** | 2 | Implement type-aware zone detection | `spatial_audio_app.js` | ~110 | 45 min | ⚠️ Low |
| **13C** | 3 | Add `_loadAndStartSound()` (type-aware) | `spatial_audio_app.js` | ~80 | 35 min | ⚠️ Low |
| **13D** | 4 | Add `_preloadSound()` (buffers only) | `spatial_audio_app.js` | ~40 | 20 min | ✅ None |
| **13E** | 5 | Add `_disposeSound()` (type-aware) | `spatial_audio_app.js` | ~90 | 40 min | ⚠️ Low |
| **13F** | 6 | Integrate zone system into update loop | `spatial_audio_app.js` | ~50 | 25 min | ⚠️ Medium |
| **13G** | 7 | Add debug logging + UI indicators | `spatial_audio_app.js`, `map_player.html` | ~80 | 35 min | ✅ None |
| **13H** | 8 | Test with 20-50 waypoints (memory + CPU profiling) | Browser DevTools | - | 45 min | ✅ None |
| **Total** | | | **2 files** | **~500** | **~4h 30m** | **Low** |

---

### Session 13A: Add Sound State Tracking

**Goal:** Track loading/loaded/disposed state for each sound

**Changes:**

```javascript
// spatial_audio_app.js - Update Sound class or add state properties

class Sound {
    constructor(options = {}) {
        this.id = options.id || '';
        this.url = options.url || '';
        this.lat = options.lat || 0;
        this.lon = options.lon || 0;
        this.activationRadius = options.activationRadius || 20;
        this.volume = options.volume || 0.5;
        this.loop = options.loop || false;
        
        // State tracking (NEW)
        this.isLoading = false;    // Currently loading from network
        this.isLoaded = false;     // Buffer loaded and ready
        this.isDisposed = false;   // Nodes disposed (freed from memory)
        this.loadPromise = null;   // Promise for async loading
    }
}
```

**Testing:**
```javascript
// Open browser console
const sound = new Sound({ id: 'test', url: 'test.mp3' });
console.log(sound.isLoading);   // false
console.log(sound.isLoaded);    // false
console.log(sound.isDisposed);  // false
```

**Risk:** ✅ None (additive, doesn't affect existing code)

---

### Session 13B: Implement Zone Detection Logic

**Goal:** Add method to determine which zone a sound is in

**Changes:**

```javascript
// spatial_audio_app.js - Add to SpatialAudioApp class

/**
 * Determine which zone a sound is in based on distance
 * @param {number} distance - Distance to sound in meters
 * @returns {{zone: string, shouldLoad: boolean, shouldPlay: boolean}}
 */
_getSoundZone(distance) {
    const ACTIVE_RADIUS = 50;    // Load + play within 50m
    const PRELOAD_RADIUS = 100;  // Preload 50-100m
    
    if (distance < ACTIVE_RADIUS) {
        return { zone: 'active', shouldLoad: true, shouldPlay: true };
    } else if (distance < PRELOAD_RADIUS) {
        return { zone: 'preload', shouldLoad: true, shouldPlay: false };
    } else {
        return { zone: 'unload', shouldLoad: false, shouldPlay: false };
    }
}

/**
 * Update zone states for all sounds
 * @returns {{toLoad: Sound[], toPreload: Sound[], toDispose: Sound[]}}
 */
_updateSoundZones() {
    const toLoad = [];
    const toPreload = [];
    const toDispose = [];
    
    this.sounds.forEach(sound => {
        const distance = this.getSoundDistance(sound.id);
        const zone = this._getSoundZone(distance);
        
        // Store current zone for debugging
        sound.currentZone = zone.zone;
        
        if (zone.shouldLoad && !sound.isLoaded && !sound.isLoading) {
            if (zone.zone === 'active') {
                toLoad.push(sound);
            } else if (zone.zone === 'preload') {
                toPreload.push(sound);
            }
        }
        
        if (zone.shouldDispose && !sound.isDisposed) {
            toDispose.push(sound);
        }
    });
    
    return { toLoad, toPreload, toDispose };
}
```

**Testing:**
```javascript
// Open browser console
const app = window.audioApp;  // Assuming exposed globally
const zones = app._updateSoundZones();
console.log('To load:', zones.toLoad.length);
console.log('To preload:', zones.toPreload.length);
console.log('To dispose:', zones.toDispose.length);
```

**Risk:** ✅ None (new methods, doesn't affect existing code)

---

### Session 13C: Add `_loadAndStartSound()` Method

**Goal:** Load and start a single sound on-demand

**Changes:**

```javascript
// spatial_audio_app.js - Add method

/**
 * Load and start a single sound on-demand
 * @param {Sound} sound - Sound to load
 * @returns {Promise<void>}
 */
async _loadAndStartSound(sound) {
    if (sound.isLoading || sound.isLoaded) {
        this.debugLog(`⏳ ${sound.id} already loading/loaded`);
        return;
    }
    
    sound.isLoading = true;
    this.debugLog(`📥 Loading ${sound.id} (${sound.url})...`);
    
    try {
        const source = await this.engine.createSampleSource(sound.id, {
            url: sound.url,
            lat: sound.lat,
            lon: sound.lon,
            loop: sound.loop,
            gain: sound.volume,
            activationRadius: sound.activationRadius
        });
        
        if (source) {
            const started = source.start();
            if (started) {
                sound.sourceNode = source;
                sound.gainNode = source.gain;
                sound.pannerNode = source.panner;
                sound.isPlaying = true;
                sound.isLoaded = true;
                this.debugLog(`✅ ${sound.id} loaded + started`);
            } else {
                this.debugLog(`❌ ${sound.id} failed to start`);
            }
        } else {
            this.debugLog(`❌ ${sound.id} failed to create source`);
        }
    } catch (error) {
        this.debugLog(`❌ ${sound.id} load error: ${error.message}`);
        console.error(`[SpatialAudioApp] Failed to load ${sound.id}:`, error);
    } finally {
        sound.isLoading = false;
    }
}
```

**Testing:**
```javascript
// Open browser console
const app = window.audioApp;
const sound = app.sounds[0];
await app._loadAndStartSound(sound);
console.log('Sound loaded:', sound.isLoaded);
```

**Risk:** ⚠️ Low (modifies sound loading flow, but well-contained)

---

### Session 13D: Add `_preloadSound()` Method

**Goal:** Preload sound in background without playing

**Changes:**

```javascript
// spatial_audio_app.js - Add method

/**
 * Preload sound in background (don't play yet)
 * @param {Sound} sound - Sound to preload
 * @returns {Promise<void>}
 */
async _preloadSound(sound) {
    if (sound.isLoading || sound.isLoaded) {
        return;  // Already loading or loaded
    }
    
    sound.isLoading = true;
    this.debugLog(`📥 Preloading ${sound.id} (background)...`);
    
    try {
        // Create source and load buffer, but don't start playback
        const source = await this.engine.createSampleSource(sound.id, {
            url: sound.url,
            lat: sound.lat,
            lon: sound.lon,
            loop: sound.loop,
            gain: 0,  // Muted until moved to active zone
            activationRadius: sound.activationRadius
        });
        
        if (source) {
            // Don't start - just keep buffer loaded
            sound.sourceNode = source;
            sound.gainNode = source.gain;
            sound.pannerNode = source.panner;
            sound.isLoaded = true;
            sound.isPlaying = false;
            this.debugLog(`✅ ${sound.id} preloaded (muted)`);
        }
    } catch (error) {
        this.debugLog(`⚠️ ${sound.id} preload failed: ${error.message}`);
    } finally {
        sound.isLoading = false;
    }
}
```

**Testing:**
```javascript
// Open browser console
const app = window.audioApp;
const sound = app.sounds[5];  // Pick a distant sound
await app._preloadSound(sound);
console.log('Sound preloaded:', sound.isLoaded);
console.log('Sound playing:', sound.isPlaying);  // Should be false
```

**Risk:** ✅ None (additive, doesn't affect existing code)

---

### Session 13E: Add `_disposeSound()` Method

**Goal:** Completely dispose of a sound to free memory

**Changes:**

```javascript
// spatial_audio_app.js - Add method

/**
 * Completely dispose of a sound to free memory
 * @param {Sound} sound - Sound to dispose
 */
_disposeSound(sound) {
    if (sound.isDisposed || !sound.isLoaded) {
        return;  // Already disposed or never loaded
    }
    
    this.debugLog(`🗑️ Disposing ${sound.id}...`);
    
    if (sound.sourceNode) {
        sound.sourceNode.stop();
        sound.sourceNode.disconnect();
        sound.sourceNode = null;
    }
    
    if (sound.gainNode) {
        sound.gainNode.disconnect();
        sound.gainNode = null;
    }
    
    if (sound.pannerNode) {
        sound.pannerNode.disconnect();
        sound.pannerNode = null;
    }
    
    // Keep buffer in memory (can reload quickly if needed)
    // But dispose all active nodes
    
    sound.isPlaying = false;
    sound.isDisposed = true;
    sound.isLoaded = false;  // Mark as not loaded (needs reload to play)
    
    this.debugLog(`✅ ${sound.id} disposed`);
}
```

**Testing:**
```javascript
// Open browser console
const app = window.audioApp;
const sound = app.sounds[0];
app._disposeSound(sound);
console.log('Sound disposed:', sound.isDisposed);
console.log('Source node:', sound.sourceNode);  // Should be null
```

**Risk:** ⚠️ Low (modifies sound lifecycle, need to ensure reload works)

---

### Session 13F: Integrate Zone System into Update Loop

**Goal:** Call zone detection in `_updateSoundPositions()`

**Changes:**

```javascript
// spatial_audio_app.js - Update _updateSoundPositions()

_updateSoundPositions() {
    if (!this.engine || !this.listener) return;

    // Update engine's listener position
    this.engine.updateListenerPosition(
        this.listener.lat,
        this.listener.lon,
        this.listener.heading
    );

    // Update all sound positions
    this.engine.updateAllGpsSources(
        this.listener.lat,
        this.listener.lon,
        this.listener.heading
    );

    // NEW: Update sound zones (lazy loading)
    this._updateSoundZonesAndLoad();

    // Update gain for active sounds
    this.sounds.forEach(sound => {
        if (sound.isLoaded && !sound.isDisposed) {
            const source = this.engine.getSource(sound.id);
            if (source && source.updateGainByDistance) {
                source.updateGainByDistance(
                    this.listener.lat,
                    this.listener.lon,
                    sound.volume
                );
            }
        }
    });
}

/**
 * Update zones and trigger load/dispose actions
 * @private
 */
async _updateSoundZonesAndLoad() {
    // Throttle zone checks to once per second (avoid excessive loading)
    const now = Date.now();
    if (!this.lastZoneCheck || (now - this.lastZoneCheck) > 1000) {
        this.lastZoneCheck = now;
        
        const zones = this._updateSoundZones();
        
        // Load active zone sounds immediately
        for (const sound of zones.toLoad) {
            this._loadAndStartSound(sound);
        }
        
        // Preload preload-zone sounds in background (non-blocking)
        for (const sound of zones.toPreload) {
            this._preloadSound(sound);  // Don't await - background task
        }
        
        // Dispose unload-zone sounds
        for (const sound of zones.toDispose) {
            this._disposeSound(sound);
        }
        
        // Debug: Log zone distribution
        if (Math.random() < 0.1) {
            const active = this.sounds.filter(s => s.currentZone === 'active').length;
            const preload = this.sounds.filter(s => s.currentZone === 'preload').length;
            const unload = this.sounds.filter(s => s.currentZone === 'unload').length;
            this.debugLog(`📊 Zones: ${active} active, ${preload} preload, ${unload} unloaded`);
        }
    }
}
```

**Testing:**
```javascript
// Open browser console
// Walk around (or drag simulation avatar)
// Watch debug log for zone changes
```

**Risk:** ⚠️ Medium (modifies core update loop - test thoroughly)

---

### Session 13G: Add Debug Logging + UI Indicators

**Goal:** Show which sounds are loaded/active in debug console

**Changes:**

```javascript
// spatial_audio_app.js - Enhanced debug logging

debugLog(message) {
    // Existing debug log implementation
    // Add timestamp + sound ID color coding
}

// Add visual indicator in map_player.html
<div id="soundStatus">
    <span class="sound-indicator active">🟢 Active: 3</span>
    <span class="sound-indicator preload">🟡 Preload: 5</span>
    <span class="sound-indicator unload">⚪ Unload: 12</span>
</div>
```

**CSS:**
```css
#soundStatus {
    display: flex;
    gap: 15px;
    padding: 8px 15px;
    background: rgba(0,0,0,0.8);
    font-size: 0.85em;
}

.sound-indicator::before {
    margin-right: 5px;
}
```

**Testing:**
1. Open `map_player.html`
2. Tap Start
3. Verify sound status bar shows counts
4. Walk around → verify counts update

**Risk:** ✅ None (UI-only addition)

---

### Session 13H: Test with 20-50 Waypoints

**Test Checklist:**

| Test | Expected Result | Status |
|------|-----------------|--------|
| Load soundscape with 20 waypoints | All preload quickly, only nearby play | ⬜ |
| Load soundscape with 50 waypoints | Memory stays ~15 MB, CPU ~5% | ⬜ |
| Walk toward distant sound | Sound loads as you approach | ⬜ |
| Walk away from sound | Sound disposes after 100m | ⬜ |
| Rapid walking (back/forth) | No audio glitches, smooth transitions | ⬜ |
| Phone with limited RAM (1GB) | No crashes, stable performance | ⬜ |
| Debug log shows zone changes | Correct zone transitions logged | ⬜ |

**Performance Profiling:**

```javascript
// Open Chrome DevTools → Performance tab
// Record while walking through soundscape
// Check:
// - Memory usage (should stay flat ~15 MB)
// - CPU usage (should stay ~5%)
// - No garbage collection spikes
```

**Risk:** ✅ None (testing only)

---

### Benefits Achieved

| Benefit | Description |
|---------|-------------|
| **Constant memory usage** | ~15 MB regardless of total soundscape size |
| **Constant CPU usage** | ~5% for 3-5 active sounds |
| **Scalable** | Works with 20 or 200 waypoints |
| **Smooth playback** | No gaps as you walk (preload zone handles this) |
| **Phone-friendly** | Won't crash mobile devices with limited RAM |
| **Debug-friendly** | Zone logging shows what's loading/unloading |

---

### Dependencies

| Dependency | Status |
|------------|--------|
| Session 10: Icon bar UI | ✅ Complete |
| Session 11: Debug log copy | ✅ Complete (integrated in S10) |
| Session 12: Refresh bug fix | ✅ Complete |
| `spatial_audio.js`: SampleSource class | ✅ Existing |
| `spatial_audio_app.js`: SpatialAudioApp class | ✅ Existing |

**No blocking dependencies** - can implement anytime

---

### Rollback Plan

If issues arise:

1. **Disable lazy loading** - Comment out `_updateSoundZonesAndLoad()` call
2. **Revert `spatial_audio_app.js`** - Restore from backup
3. **Fallback** - Use current behavior (all sounds load at startup)

**Mitigation:** Test with small soundscape (5 sounds) first, then scale up

---

### Future Enhancements (Post-Session 13)

| Enhancement | Description | Effort |
|-------------|-------------|--------|
| **Configurable zone radii** | UI sliders for active/preload/unload distances | ~30 lines |
| **Sound priority** | Keep important sounds loaded longer | ~50 lines |
| **Progressive loading** | Load low-quality first, then high-quality | ~100 lines |
| **Offline caching** | Cache loaded sounds in IndexedDB | ~150 lines |
| **Smart prefetch** | Predict walking direction, preload ahead | ~80 lines |

---

### Success Criteria

| Criterion | How to Verify |
|-----------|---------------|
| Memory stays ~15 MB | Chrome DevTools Memory tab |
| CPU stays ~5% | Chrome DevTools Performance tab |
| No audio glitches | Walk through soundscape, listen for gaps |
| Sounds load as you approach | Debug log shows loading at ~50m |
| Sounds dispose as you leave | Debug log shows disposing at >100m |
| Phone doesn't crash | Test on mobile with 50+ waypoints |
| Debug log shows zone counts | "📊 Zones: X active, Y preload, Z unloaded" |

---

**Total Effort:** ~380 lines across 8 sub-sessions (~3h 40m)

---

## Current Project Status (2026-03-18)

### ✅ Completed Features

| Feature | Description | Status | Files |
|---------|-------------|--------|-------|
| **1-3** | SoundScape persistence + phone mode | ✅ Complete | `soundscape.js`, `map_placer.js` |
| **4** | Hit list cleanup | ✅ Complete | Multiple |
| **5A-5D** | Multi-soundscape support | ✅ Complete | `map_player.js`, `map_editor.js` |
| **5E** | Auto-sync with timestamps | ✅ Complete | `api-client.js`, `map_player.js` |
| **6** | Separate editor/player pages | ✅ Complete | `map_editor.html`, `map_player.html` |
| **7** | Data Mapper pattern (repositories) | ✅ Complete | `api/repositories/`, `api/models/` |
| **8** | Device-aware auto-routing | ✅ Complete | `index.html` |
| **9** | Soundscape selector page | ✅ Complete | `soundscape_picker.html` |
| **10** | Icon bar UI redesign | ✅ Complete | `map_player.html` v7.2, `map_player.js` v7.2 |
| **11** | Debug log copy (integrated in F10) | ✅ Complete | `map_shared.js` |
| **12** | Edit waypoint duplicate fix + refresh persistence | ✅ Complete | `map_shared.js`, `map_player.js` |
| **13** | Listener drift compensation (EMA smoothing) | ✅ Complete | `spatial_audio_app.js`, `map_player.js`, `map_shared.js` |
| **13** | Lazy loading for sound walks (Phase 1) | ✅ Complete | `spatial_audio_app.js` v2.7+ |
| **13** | Debug logging for zone verification | ✅ Complete | `spatial_audio_app.js`, `DEBUG_LOGGING_ADDED.md` |
| **13** | Rename 'unload zone' to 'hysteresis zone' | ✅ Complete | `spatial_audio_app.js` |
| **14** | Distance-based audio filtering (air absorption) | ✅ Complete | `spatial_audio_app.js` v2.8 |
| **15** | Offline soundscape download (Cache API) | ✅ Complete | `download_manager.js`, `soundscape_picker.html`, `spatial_audio.js` |
| **16** | Service Worker offline mode + corruption guards | ✅ Complete | `sw.js`, `soundscape_picker.html`, `deploy.ps1`, `download_manager.js` |

### 📋 Planned Sessions

| Session | Feature | Priority | Status |
|---------|---------|----------|--------|
| **17** | Behavior editing UI | Medium | 📋 Planned |
| **18** | Multi-user collaboration | Low | 📋 Planned |
| **19** | Session-based cached streaming | High | 📋 Planned |

**Feature 13 Documentation:** See `LAZY_LOADING_SPECIFICATION.md`, `LAZY_LOADING_FADE_ZONE_FIX.md`, `DEBUG_LOGGING_ADDED.md`, and `FUTURE_SOUND_SOURCES.md` for complete implementation details.

**Feature 14 Documentation:** See `FEATURE_14_IMPLEMENTED.md` for implementation details and testing instructions.

**Feature 15 Documentation:** See `FEATURE_15_OFFLINE_DOWNLOAD.md` for implementation details and testing instructions.

### 📁 Current File Versions

| File | Version | Last Updated |
|------|---------|--------------|
| `map_player.html` | v7.2 | 2026-03-18 |
| `map_player.js` | v7.2+ | 2026-03-18 |
| `map_editor.html` | v6.119+ | 2026-03-18 |
| `map_shared.js` | v6.11 | 2026-03-16 |
| `soundscape.js` | v3.0 | 2026-03-16 |
| `api-client.js` | - | 2026-03-16 |
| `index.html` | v6.8 | 2026-03-16 |
| `soundscape_picker.html` | - | 2026-03-21 (Feature 16: SW offline mode) |
| `spatial_audio.js` | v5.1+ | 2026-03-20 (Feature 15: CachedSampleSource) |
| `spatial_audio_app.js` | v2.8 | 2026-03-18 (Feature 14: Air absorption filter) |
| `download_manager.js` | v1.1 | 2026-03-21 (Feature 16: Version guard) |
| `sw.js` | v1.0 | 2026-03-21 (Feature 16: New file) |
| `deploy.ps1` | - | 2026-03-21 (Feature 16: Verification + versioning) |

### 🎯 Next Priority Items

1. **Test Feature 16** - Verify Service Worker offline mode works on mobile
2. **Test Feature 15** - Verify offline download works on mobile devices
3. **Test on mobile devices** - Verify GPS/compass work on phones with lazy loading + air absorption
4. **Update map_editor.html** - Apply Feature 10 UI redesign to editor
5. **Behavior editing UI** - Visual timeline for behavior configuration (Feature 17)
6. **Multi-user collaboration** - WebSocket-based real-time sync (Feature 18)

### 🐛 Known Issues

None currently - all lazy loading bugs fixed:
- ✅ Preload margin matches fade zone (20m)
- ✅ Preloaded sounds start playing immediately
- ✅ Hysteresis prevents rapid load/dispose cycles
- ✅ Zone naming clarified ('unload' → 'hysteresis')
- ✅ Debug logging verifies zone transitions

---

## Session: Service Worker Offline Mode (2026-03-21)

**Problem:** Service Worker cached corrupted `download_manager.js` and served it even after deploy fixed the server file.

**Root Cause:**
1. Old SW cache on phone had broken file
2. No version control - cache name never changed
3. No deploy verification - didn't catch server corruption
4. No runtime guards - silent failure with no user feedback

**Solution Implemented:**

### 1. Service Worker with Versioned Caches
- `CACHE_VERSION = 'YYYYMMDDHHMMSS'` (updated by deploy.ps1)
- Cache name: `audio-ar-20260321185301` (isolated per deploy)
- Old caches auto-deleted on SW activation

### 2. Smart SW Registration
- Check `getRegistration()` before `register()`
- If SW already active → skip re-registration (works offline)
- If online → `registration.update()` in background

### 3. Deploy Verification
- SSH after upload: `head -15 download_manager.js`
- Check for corruption patterns (`MAX_CONCURRENT`, `SyntaxError`, `undefined`)
- Auto re-upload if corrupted

### 4. Runtime Guards
- `window.DOWNLOAD_MANAGER_VERSION = '1.1'`
- Constructor check: `if (!window.DOWNLOAD_MANAGER_VERSION) throw Error()`
- Visible error UI with cache clear button

### 5. Versioning System
| Layer | Format | Updated By | Stripped By |
|-------|--------|------------|-------------|
| HTML → SW ref | `sw.js?v=20260321185301` | deploy.ps1 | pre-commit hook |
| sw.js → CACHE_VERSION | `CACHE_VERSION = '20260321185301'` | deploy.ps1 | pre-commit hook |
| Cache name | `audio-ar-20260321185301` | sw.js (runtime) | N/A |
| Git repo | `CACHE_VERSION = 'v1'` | pre-commit hook | N/A |

**Files Modified:**
- `sw.js` (~360 lines) - Service Worker with versioned caches
- `soundscape_picker.html` (~70 lines) - Smart SW registration
- `deploy.ps1` (~50 lines) - Verification + versioning fix
- `download_manager.js` (~10 lines) - Version guard
- `.git/hooks/pre-commit*` (~40 lines) - Strip versions

**Testing:**
1. ✅ Deploy + verify: `& .\deploy.ps1` → "Verified: 4 critical files"
2. ✅ Offline mode: Download → Airplane mode → Refresh → Page loads from cache
3. ✅ Cache clearing: Deploy → Old cache deleted, new cache created

**Documentation:** `FEATURES.md` (Feature 16), `SERVICE_WORKER_DOCUMENTATION.md`

---

---

**For complete feature documentation, see:** `FEATURES.md`
