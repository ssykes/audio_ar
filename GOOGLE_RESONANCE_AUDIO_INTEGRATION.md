# Google Resonance Audio Integration Plan

**Created:** 2026-03-17  
**Status:** 📋 Proposed  
**Priority:** Medium (for indoor experiences)

---

## Executive Summary

**Google Resonance Audio** is a spatial audio JavaScript SDK that provides advanced room acoustics and Ambisonic spatialization for web browsers. It can be integrated as an **optional audio engine** alongside the existing Web Audio API implementation.

### When to Use

| Soundscape Type | Recommended Engine | Why |
|-----------------|-------------------|-----|
| **Outdoor** (parks, walking tours, public art) | Web Audio API (current) | No walls = no room acoustics needed |
| **Indoor** (museums, galleries, installations) | Resonance Audio | Realistic reflections, reverb, material absorption |
| **Mixed** (building exterior + interior) | Switch engines at threshold | Best of both worlds |

---

## What is Resonance Audio?

### Overview

**Resonance Audio** is a real-time JavaScript SDK that encodes audio dynamically into scalable **Ambisonic soundfields** for Web Audio applications. It's built and maintained by Google (open source).

**GitHub:** https://github.com/resonance-audio/resonance-audio  
**NPM:** `resonance-audio`  
**Docs:** https://resonance-audio.github.io/resonance-audio/

### Key Features

| Feature | Description |
|---------|-------------|
| **Ambisonic Spatialization** | First-order (or higher) Ambisonic encoding for accurate 3D positioning |
| **Room Acoustics Modeling** | Simulates realistic sound reflections based on room geometry + materials |
| **6-Surface Material System** | Different acoustic properties for walls, floor, ceiling |
| **Binaural Rendering** | Uses Omnitone decoder for headphone-optimized 3D audio |
| **Dynamic Source Positioning** | Update source positions in real-time |
| **Scalable** | Efficient encoding supports many simultaneous sources |

### Built-in Material Presets

| Material | Reflectivity | Use Case |
|----------|--------------|----------|
| `brick-bare` | High | Exposed brick walls |
| `curtain-heavy` | Low | Theater curtains, absorptive panels |
| `marble` | Very High | Museums, lobbies |
| `glass-thin` | Medium-High | Windows, glass partitions |
| `grass` | Low | Outdoor ground |
| `wood` | Medium | Floors, paneling |
| `plaster` | Medium-High | Interior walls |
| `transparent` | None | Open sky, no reflection |

---

## Comparison: Resonance Audio vs. Web Audio API

| Feature | Web Audio API (Current) | Resonance Audio |
|---------|------------------------|-----------------|
| **Spatialization** | PannerNode (HRTF) | Ambisonic soundfield |
| **Room acoustics** | Manual reverb setup | ✅ Built-in room modeling |
| **Reflections** | ❌ None | ✅ Automatic (geometry-based) |
| **Material absorption** | ❌ None | ✅ 6-surface system |
| **Scalability** | Per-source processing | ✅ Efficient encoding |
| **Binaural rendering** | Basic HRTF | ✅ Omnitone decoder |
| **Setup complexity** | Lower (native API) | Higher (SDK + config) |
| **Bundle size** | None (built-in) | ~100KB |
| **Browser support** | Universal | Web Audio API browsers |

### When Web Audio API is Sufficient

- ✅ Outdoor GPS-based soundscapes (your primary use case)
- ✅ Simple left/right panning
- ✅ No room acoustics needed
- ✅ Minimal dependencies preferred

### When Resonance Audio Adds Value

- ✅ Indoor experiences (museums, galleries, installations)
- ✅ Realistic room acoustics required
- ✅ Many simultaneous audio sources
- ✅ Professional-grade spatialization

---

## Architecture Vision

### Hybrid Engine Approach

```
┌─────────────────────────────────────────────────────────┐
│  Soundscape Configuration (PC Editor)                   │
│                                                         │
│  Environment Type:                                      │
│  ○ Outdoor (GPS-based, no walls) → Web Audio API        │
│  ● Indoor (Room acoustics) → Resonance Audio            │
│                                                         │
│  [If Indoor Selected]                                   │
│  ┌─────────────────────────────────┐                   │
│  │ Room Dimensions (meters):       │                   │
│  │ Width:  [10]  Height: [3]       │                   │
│  │ Depth:  [15]                    │                   │
│  │                                 │                   │
│  │ Surface Materials:              │                   │
│  │ Walls: [brick-bare ▼]           │                   │
│  │ Floor: [wood ▼]                 │                   │
│  │ Ceiling: [plaster ▼]            │                   │
│  └─────────────────────────────────┘                   │
└─────────────────────────────────────────────────────────┘
```

### Runtime Engine Selection

```javascript
// spatial_audio_app.js
class SpatialAudioApp {
    async startSoundScape(soundscape) {
        // Choose engine based on soundscape type
        if (soundscape.environmentType === 'indoor') {
            this.engine = new ResonanceAudioEngine(this.audioContext);
            if (soundscape.roomConfig) {
                this.engine.setIndoorEnvironment(soundscape.roomConfig);
            }
        } else {
            // Default to current Web Audio API engine
            this.engine = new SpatialAudioEngine(this.audioContext);
        }
        
        await this._loadSounds(soundscape);
    }
}
```

---

## Implementation Plan

### Phase 1: Add Resonance Audio Library

**Files:**
- `resonance-audio.min.js` (NEW) - Download from npm or CDN

**Installation:**

```bash
# Option 1: npm
npm install resonance-audio

# Option 2: CDN (add to HTML)
<script src="https://cdn.jsdelivr.net/npm/resonance-audio/build/resonance-audio.min.js"></script>
```

**Lines:** ~100KB  
**Risk:** ✅ None (additive)

---

### Phase 2: Create Resonance Audio Engine Wrapper

**File:** `resonance_audio_engine.js` (NEW)

**Purpose:** Wrap Resonance Audio SDK with interface matching `SpatialAudioEngine`

**Key Methods:**
```javascript
class ResonanceAudioEngine {
    constructor(audioContext)
    setOutdoorEnvironment()
    setIndoorEnvironment(roomConfig)
    createSource(url, position)
    updateListenerPosition(lat, lon, heading)
    updateAllGpsSources(lat, lon, heading)
    dispose()
}
```

**Lines:** ~200  
**Risk:** ⚠️ Low (new file, well-contained)

---

### Phase 3: Update Soundscape Model

**File:** `soundscape.js` (MODIFY)

**Changes:**
```javascript
class SoundScape {
    constructor(id, name, soundIds = [], behaviors = [], options = {}) {
        this.id = id;
        this.name = name;
        this.soundIds = soundIds;
        this.behaviors = behaviors;
        // NEW: Environment type
        this.environmentType = options.environmentType || 'outdoor';
        this.roomConfig = options.roomConfig || null;  // For indoor
    }
}
```

**Lines:** ~20  
**Risk:** ✅ None (additive)

---

### Phase 4: Engine Selection Logic

**File:** `spatial_audio_app.js` (MODIFY)

**Changes:**
- Add `startSoundScape(soundscape)` method
- Select engine based on `soundscape.environmentType`
- Initialize Resonance Audio if indoor

**Lines:** ~50  
**Risk:** ⚠️ Low (conditional logic, doesn't affect existing outdoor flow)

---

### Phase 5: Room Configuration UI (PC Editor)

**Files:**
- `map_editor.html` (MODIFY) - Add room config UI
- `map_editor.js` (MODIFY) - Handle room config save

**UI Mockup:**
```html
<div id="roomConfigPanel" style="display: none;">
    <h3>🏛️ Room Configuration</h3>
    
    <label>Width (m): <input type="number" id="roomWidth" value="10"></label>
    <label>Height (m): <input type="number" id="roomHeight" value="3"></label>
    <label>Depth (m): <input type="number" id="roomDepth" value="15"></label>
    
    <label>Wall Material:
        <select id="wallMaterial">
            <option value="brick-bare">Brick (bare)</option>
            <option value="curtain-heavy">Curtain (heavy)</option>
            <option value="marble">Marble</option>
            <option value="glass-thin">Glass (thin)</option>
        </select>
    </label>
    
    <label>Floor Material:
        <select id="floorMaterial">
            <option value="wood">Wood</option>
            <option value="marble">Marble</option>
            <option value="grass">Grass</option>
        </select>
    </label>
    
    <label>Ceiling Material:
        <select id="ceilingMaterial">
            <option value="plaster">Plaster</option>
            <option value="transparent">Open sky</option>
        </select>
    </label>
</div>
```

**Lines:** ~80  
**Risk:** ✅ None (UI-only addition)

---

### Phase 6: Phone Player Integration

**File:** `map_player.js` (MODIFY)

**Changes:**
- Read `soundscape.environmentType` on load
- Initialize correct engine automatically
- No UI changes needed (automatic detection)

**Lines:** ~40  
**Risk:** ⚠️ Low (conditional initialization)

---

## Files Summary

| File | Action | Lines | Purpose |
|------|--------|-------|---------|
| `resonance-audio.min.js` | NEW | ~100KB | Resonance Audio SDK |
| `resonance_audio_engine.js` | NEW | ~200 | Engine wrapper class |
| `soundscape.js` | MODIFY | +20 | Add `environmentType`, `roomConfig` |
| `spatial_audio_app.js` | MODIFY | +50 | Engine selection logic |
| `map_editor.html` | MODIFY | +80 | Room configuration UI |
| `map_editor.js` | MODIFY | +40 | Handle room config save |
| `map_player.js` | MODIFY | +40 | Auto-detect environment type |
| **Total** | | **~430 lines + 100KB** | |

---

## User Experience Changes

### PC Editor (New Features)

| Feature | Current | After Integration |
|---------|---------|-------------------|
| **Environment type** | N/A (always outdoor) | Selector: Outdoor/Indoor |
| **Room config** | N/A | Dimensions + materials (indoor only) |
| **Soundscape export** | JSON with waypoints | JSON + environment type + room config |
| **Backward compatibility** | N/A | ✅ Existing soundscapes default to outdoor |

### Phone Player (No Visible Changes)

- Automatically detects soundscape type
- Loads appropriate engine
- Same UI (Start button, GPS tracking, icon bar)
- Debug log shows which engine loaded

---

## Testing Plan

### Test Scenarios

| Test | Expected Result |
|------|-----------------|
| **Outdoor soundscape** | Web Audio API engine loads, no room effects |
| **Indoor soundscape (small room)** | Resonance Audio loads, noticeable reverb |
| **Indoor soundscape (large hall)** | Resonance Audio loads, longer reverb tail |
| **Material changes** | Different reflectivity audible |
| **Switch outdoor → indoor** | Engine reloads with new config |
| **Phone with limited RAM** | Resonance Audio ~100KB, stable performance |
| **Existing soundscapes** | Load as outdoor (backward compatible) |

### Performance Benchmarks

| Metric | Web Audio API | Resonance Audio | Target |
|--------|---------------|-----------------|--------|
| **Bundle size** | 0 KB | ~100 KB | < 150 KB |
| **CPU usage (10 sources)** | ~5% | ~7-10% | < 15% |
| **Memory usage** | ~15 MB | ~20-25 MB | < 30 MB |
| **Load time** | ~500ms | ~700ms | < 1s |

---

## Benefits

| Benefit | Description |
|---------|-------------|
| **Realistic indoor acoustics** | Room reflections, reverb, material absorption |
| **Seamless switching** | Same codebase, engine selected at runtime |
| **Backward compatible** | Existing outdoor soundscapes unchanged |
| **Professional quality** | Ambisonic spatialization (better than HRTF alone) |
| **Future-proof** | Google-maintained library (not archived) |
| **Discovery-friendly** | Add room config as needed (optional) |

---

## Trade-offs

| Aspect | Consideration |
|--------|---------------|
| **Bundle size** | +100KB for Resonance Audio library |
| **Complexity** | Two audio engines to maintain |
| **Learning curve** | Room acoustics concepts (materials, dimensions) |
| **Browser support** | Requires Web Audio API (same as current) |
| **Performance** | Slightly higher CPU for Ambisonic encoding |
| **Use case fit** | Only beneficial for indoor experiences |

---

## Recommendation

### For Your Current Use Case (Outdoor Sound Walks)

**Recommendation:** ❌ **Defer implementation**

Your primary use case (GPS-based outdoor sound walks) doesn't benefit from room acoustics. The Web Audio API with HRTF panning is perfect for outdoor use.

**Rationale:**
- No walls outdoors = no reflections to simulate
- Resonance Audio adds complexity without benefit
- Bundle size increase not justified
- Focus on core features (lazy loading, behavior editing)

### If You Plan Indoor Experiences

**Recommendation:** ✅ **Implement when needed**

If you create soundscapes for:
- Museums
- Art galleries
- Historical buildings
- Installations
- VR/AR experiences

Then Resonance Audio adds significant value.

### Hybrid Approach (Recommended)

1. **Now:** Keep Web Audio API for outdoor soundscapes
2. **Later:** Add Resonance Audio when/indoor use case arises
3. **Architecture:** Design engine selection to be swappable (don't hardcode)

---

## Code Examples

### Basic Resonance Audio Setup

```javascript
// 1. Create AudioContext + Resonance Audio scene
const audioContext = new AudioContext();
const resonanceAudioScene = new ResonanceAudio(audioContext);

// 2. Connect scene output to stereo destination
resonanceAudioScene.output.connect(audioContext.destination);

// 3. Add room with dimensions + materials
resonanceAudioScene.setRoomProperties(
  {
    width: 3.1,
    height: 2.5,
    depth: 3.4,
  },
  {
    left: 'brick-bare',
    right: 'curtain-heavy',
    front: 'marble',
    back: 'glass-thin',
    down: 'grass',
    up: 'transparent',
  }
);

// 4. Create audio source
const audio = new Audio('sound.mp3');
const source = resonanceAudioScene.createSource();
const mediaSource = audioContext.createMediaElementSource(audio);
mediaSource.connect(source.input);

// 5. Position source in 3D space (relative to room center)
source.setPosition(-0.707, -0.707, 0);

// 6. Play audio
audio.play();
```

### Outdoor Environment (Minimal Reflections)

```javascript
// Simulate outdoor space with very large "room"
resonanceAudioScene.setRoomProperties({
    width: 1000,
    height: 100,
    depth: 1000,
}, {
    left: 'transparent',
    right: 'transparent',
    front: 'transparent',
    back: 'transparent',
    down: 'grass',
    up: 'transparent'
});
```

---

## Resources

### Documentation
- **Official Docs:** https://resonance-audio.github.io/resonance-audio/
- **GitHub:** https://github.com/resonance-audio/resonance-audio
- **NPM:** https://www.npmjs.com/package/resonance-audio
- **Demos:** https://resonance-audio.github.io/resonance-audio/develop/web/demos.html

### Material Reference
- **Material Presets:** https://resonance-audio.github.io/resonance-audio/develop/web/reference/room-properties.html
- **Absorption Coefficients:** Frequency-dependent absorption for each material

### Comparison Studies
- **Web Audio Spatialization:** https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Web_audio_spatialization_basics
- **Ambisonics vs. HRTF:** https://en.wikipedia.org/wiki/Ambisonics

---

## Future Enhancements (Post-Integration)

| Enhancement | Description | Effort |
|-------------|-------------|--------|
| **Configurable zone radii** | UI sliders for active/preload/unload distances | ~30 lines |
| **Sound priority** | Keep important sounds loaded longer | ~50 lines |
| **Progressive loading** | Load low-quality first, then high-quality | ~100 lines |
| **Offline caching** | Cache loaded sounds in IndexedDB | ~150 lines |
| **Smart prefetch** | Predict walking direction, preload ahead | ~80 lines |

---

## Status

- [ ] Phase 1: Add Resonance Audio library
- [ ] Phase 2: Create ResonanceAudioEngine wrapper
- [ ] Phase 3: Update soundscape model
- [ ] Phase 4: Engine selection logic
- [ ] Phase 5: Room configuration UI
- [ ] Phase 6: Phone player integration
- [ ] Test: Outdoor soundscape (Web Audio API)
- [ ] Test: Indoor soundscape (Resonance Audio)
- [ ] Test: Backward compatibility (existing soundscapes)

---

**Next Steps:**
1. Test Resonance Audio demos in browser (https://resonance-audio.github.io/resonance-audio/develop/web/demos.html)
2. Decide if room acoustics add value to your use cases
3. If yes, implement Phase 1-2 as prototype
4. Test prototype on mobile devices
5. Complete Phases 3-6 if prototype successful
