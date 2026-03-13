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
