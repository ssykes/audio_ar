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

## Hit List: Issues for Future Sessions

### P1 - Should Fix Soon

| # | Issue | File | Current Behavior | Expected Behavior | Fix |
|---|-------|------|------------------|-------------------|-----|
| **1** | `_createNewSoundscape()` includes old waypoints | `map_placer.js` ~1246 | "New Soundscape" creates soundscape with all existing waypoints | User expects empty soundscape when creating "New" | Add `this._clearAllWaypoints()` before creating new soundscape, OR rename button to "Save As..." |
| **2** | Auto-save feedback timer shows nothing | `map_placer.js` ~1315 | Timer set/cleared but no feedback shown | User should see "💾 Auto-saved" in debug console | Add `this.debugLog('💾 Auto-saved')` inside timer callback |

### P2 - Nice to Fix

| # | Issue | File | Current Behavior | Expected Behavior | Fix |
|---|-------|------|------------------|-------------------|-----|
| **3** | `this.soundscapes` property unused | `map_placer.js` ~48 | Declared but never accessed | Dead code should be removed | Remove `this.soundscapes = {}` from constructor |
| **4** | `_onSoundscapeChange()` does nothing | `map_placer.js` ~1274 | Dropdown implies switching soundscapes, but handler just logs | Either implement multi-soundscape switching OR remove dropdown | Remove dropdown for now (single soundscape mode) |
| **5** | `startSoundScape(options)` parameter unused | `spatial_audio_app.js` ~724 | Parameter declared but never used | Misleading API | Remove `options` parameter or use it to override `this.options` |
| **6** | Version mismatch | `soundscape.js` ~18 | Says "v1.0" in console log | Should match project version | Update to "v3.0" |

### P3 - Future Enhancements (Not Bugs)

| # | Feature | Description | Priority |
|---|---------|-------------|----------|
| **A** | Multi-soundscape support | Store/switch between multiple soundscapes (use `this.soundscapes` map) | Low |
| **B** | Behavior editing UI | Visual editor to create/edit behaviors (timeline, drag-drop sounds) | Medium |
| **C** | Behavior presets | Pre-configured behavior templates (e.g., "Canon", "Call & Response") | Low |
| **D** | Soundscape gallery | Browse/load community soundscapes | Low |
| **E** | GPS-based triggers | Activate behaviors when near specific waypoints | Low |

---

## Known Limitations

1. **No behavior editing UI** - Behaviors can be defined in code but not edited via UI
2. **Single soundscape mode** - Dropdown exists but only one soundscape supported at a time
3. **No soundscape list view** - Can't see all saved soundscapes, only current one
4. **Import overwrites without backup** - Confirm dialog exists, but no "export before overwrite" option

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
