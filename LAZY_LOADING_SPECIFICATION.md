# Lazy Loading Specification for Sound Walks

**Version:** 1.0  
**Date:** 2026-03-18  
**Status:** Planned (Session 13)  
**Priority:** High (critical for large soundscapes)

---

## Executive Summary

**Problem:** Sound walks with 20-50+ waypoints cause phone crashes due to excessive memory (250 MB) and CPU (100%) usage when all sounds load simultaneously.

**Solution:** Three-zone lazy loading with type-aware strategies:
- **Buffers (MP3):** Full lazy loading (load/preload/dispose)
- **Oscillators:** Instant create/dispose (no preload needed)
- **Streams (HLS):** Pause-only strategy (50-200m), dispose >200m

**Expected Benefits:**
- Memory: 250 MB → 15 MB (94% reduction)
- CPU: 100% → 5% (95% reduction)
- Battery: 10x improvement (fewer active decoders)
- Scalability: Works with 200+ waypoints

---

## Architecture Overview

### Three-Zone Lazy Loading

```
User walks along route:
  ┌─────────────────────────────────────────────────────────┐
  │  🎵     🎵     🎵     🎵     🎵                         │
  │        ↑                                                │
  │      User                                               │
  │                                                         │
  │  Active zone (0-50m):    Load + play                    │
  │  Preload zone (50-100m): Load async (buffers only)      │
  │  Unload zone (>100m):    Dispose/pause                  │
  └─────────────────────────────────────────────────────────┘
```

### Zone Specifications by Audio Type

| Zone | Buffers (MP3) | Oscillators | Streams (HLS) |
|------|---------------|-------------|---------------|
| **Active** (0-50m) | Load + play | Create + play | Play (gain based on distance) |
| **Preload** (50-100m) | Load async (muted) | N/A (instant) | Pause (keep connection) |
| **Unload** (>100m) | Full dispose | Full dispose | Pause only (50-200m), dispose >200m |

**Rationale:**
- **Buffers:** Network latency (100-500ms) requires preload zone
- **Oscillators:** Instant creation (~1ms) - no preload needed
- **Streams:** Rebuffering latency (2-5s) - pause-only prevents gaps

---

## Data Structures

### Sound Class (Extended)

```javascript
class Sound {
    constructor(options = {}) {
        // === Core Properties (existing) ===
        this.id = options.id || '';
        this.url = options.url || '';
        this.lat = options.lat || 0;
        this.lon = options.lon || 0;
        this.activationRadius = options.activationRadius || 20;
        this.volume = options.volume || 0.5;
        this.loop = options.loop || false;
        
        // === NEW: Audio Type Discriminator ===
        this.type = options.type || 'buffer';  // 'buffer' | 'oscillator' | 'stream'
        
        // === NEW: Oscillator-Specific Properties ===
        this.oscillatorType = options.oscillatorType || 'sine';  // 'sine' | 'square' | 'triangle' | 'sawtooth'
        this.frequency = options.frequency || 440;  // Hz
        this.detune = options.detune || 0;  // cents
        
        // === NEW: Stream-Specific Properties ===
        this.isLive = options.isLive || false;  // Live stream vs on-demand HLS
        this.streamBitrate = options.streamBitrate || 128;  // kbps
        
        // === State Tracking (NEW) ===
        this.isLoading = false;    // Currently loading from network
        this.isLoaded = false;     // Buffer/source ready
        this.isDisposed = false;   // Nodes disposed (freed from memory)
        this.isPlaying = false;    // Currently playing (gain > 0)
        this.isPaused = false;     // Stream paused (connection kept)
        this.loadPromise = null;   // Promise for async loading
        this.currentZone = null;   // 'active' | 'preload' | 'unload'
        
        // === Audio Nodes (runtime) ===
        this.sourceNode = null;    // AudioBufferSourceNode | OscillatorNode | MediaElementAudioSourceNode
        this.gainNode = null;      // GainNode
        this.pannerNode = null;    // PannerNode
    }
    
    /**
     * Serialize sound to JSON (for persistence)
     */
    toJSON() {
        return {
            id: this.id,
            url: this.url,
            lat: this.lat,
            lon: this.lon,
            activationRadius: this.activationRadius,
            volume: this.volume,
            loop: this.loop,
            type: this.type,
            oscillatorType: this.oscillatorType,
            frequency: this.frequency,
            detune: this.detune,
            isLive: this.isLive,
            streamBitrate: this.streamBitrate
        };
    }
    
    /**
     * Deserialize sound from JSON
     */
    static fromJSON(data) {
        return new Sound(data);
    }
}
```

### Zone Configuration Object

```javascript
const ZoneConfig = {
    // Buffer zones (standard lazy loading)
    buffer: {
        activeRadius: 50,      // Load + play within 50m
        preloadRadius: 100,    // Preload 50-100m
        unloadDistance: 100,   // Dispose >100m
        hysteresis: 10         // Prevent rapid load/unload cycles
    },
    
    // Oscillator zones (instant creation)
    oscillator: {
        activeRadius: 50,      // Create + play within 50m
        preloadRadius: 50,     // No preload (instant)
        unloadDistance: 70,    // Dispose >70m (small hysteresis)
        hysteresis: 5
    },
    
    // Stream zones (pause-only strategy)
    stream: {
        activeRadius: 50,      // Play within 50m
        pauseRadius: 200,      // Pause 50-200m (keep connection)
        unloadDistance: 200,   // Dispose >200m (unlikely to return)
        hysteresis: 20         // Prevent rapid pause/unpause
    }
};
```

---

## Implementation Details

### 1. Zone Detection Logic

**File:** `spatial_audio_app.js`  
**Method:** `_getSoundZone(sound, distance)`

```javascript
/**
 * Determine which zone a sound is in based on distance and type
 * @param {Sound} sound - Sound object
 * @param {number} distance - Distance to sound in meters
 * @returns {{
 *   zone: string,
 *   shouldLoad: boolean,
 *   shouldPlay: boolean,
 *   shouldDispose: boolean,
 *   isInstant: boolean,
 *   keepAlive: boolean
 * }}
 */
_getSoundZone(sound, distance) {
    const config = ZoneConfig[sound.type] || ZoneConfig.buffer;
    
    // Oscillators: Instant creation, no preload needed
    if (sound.type === 'oscillator') {
        return {
            zone: distance < config.activeRadius ? 'active' : 'inactive',
            shouldLoad: distance < config.activeRadius,
            shouldPlay: distance < config.activeRadius,
            shouldDispose: distance > config.unloadDistance,
            isInstant: true,  // Skip preload
            keepAlive: false
        };
    }
    
    // Streams: Pause-only strategy (prevent rebuffering)
    if (sound.type === 'stream') {
        const inActiveZone = distance < config.activeRadius;
        const inPauseZone = distance < config.pauseRadius;
        
        return {
            zone: inActiveZone ? 'active' : 
                  inPauseZone ? 'paused' : 'unloaded',
            shouldLoad: inPauseZone,  // Load/pause within 200m
            shouldPlay: inActiveZone,
            shouldDispose: distance > config.unloadDistance,
            isInstant: false,
            keepAlive: inPauseZone  // Keep connection alive in pause zone
        };
    }
    
    // Buffers: Standard 3-zone lazy loading
    const inActiveZone = distance < config.activeRadius;
    const inPreloadZone = distance < config.preloadRadius;
    
    return {
        zone: inActiveZone ? 'active' : 
              inPreloadZone ? 'preload' : 'unload',
        shouldLoad: inPreloadZone,
        shouldPlay: inActiveZone,
        shouldDispose: distance > config.unloadDistance,
        isInstant: false,
        keepAlive: false
    };
}
```

---

### 2. Type-Aware Loading

**File:** `spatial_audio_app.js`  
**Method:** `_loadAndStartSound(sound)`

```javascript
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
    
    // === Oscillators: Instant Creation ===
    if (sound.type === 'oscillator') {
        this.debugLog(`🎹 Creating oscillator ${sound.id} (${sound.oscillatorType} ${sound.frequency}Hz)...`);
        
        try {
            const source = await this.engine.createOscillatorSource(sound.id, {
                type: sound.oscillatorType,
                frequency: sound.frequency,
                detune: sound.detune,
                lat: sound.lat,
                lon: sound.lon,
                gain: sound.volume,
                activationRadius: sound.activationRadius
            });
            
            if (source) {
                sound.sourceNode = source;
                sound.gainNode = source.gain;
                sound.pannerNode = source.panner;
                sound.isLoaded = true;
                sound.isPlaying = true;
                sound.isLoading = false;
                this.debugLog(`✅ Oscillator ${sound.id} created + started`);
            } else {
                this.debugLog(`❌ ${sound.id} failed to create oscillator`);
            }
        } catch (error) {
            this.debugLog(`❌ ${sound.id} oscillator error: ${error.message}`);
            console.error(`[SpatialAudioApp] Oscillator ${sound.id} error:`, error);
            sound.isLoading = false;
        }
        return;
    }
    
    // === Buffers + Streams: Network Loading ===
    sound.isLoading = true;
    this.debugLog(`📥 Loading ${sound.type} ${sound.id} (${sound.url})...`);
    
    try {
        const source = await this.engine.createSampleSource(sound.id, {
            url: sound.url,
            lat: sound.lat,
            lon: sound.lon,
            loop: sound.loop,
            gain: sound.volume,
            activationRadius: sound.activationRadius,
            isStream: sound.type === 'stream'
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

---

### 3. Type-Aware Disposal

**File:** `spatial_audio_app.js`  
**Method:** `_disposeSound(sound)`

```javascript
/**
 * Dispose of a sound to free resources (type-aware)
 * @param {Sound} sound - Sound to dispose
 */
_disposeSound(sound) {
    if (sound.isDisposed || !sound.isLoaded) {
        return;  // Already disposed or never loaded
    }
    
    // === Streams: Pause-Only Strategy ===
    if (sound.type === 'stream' && sound.keepAlive) {
        this.debugLog(`⏸️ Pausing stream ${sound.id} (keeping connection)...`);
        
        if (sound.sourceNode) {
            // Pause stream (keep connection alive)
            if (sound.sourceNode.pause) {
                sound.sourceNode.pause();
            }
            // Mute output
            if (sound.gainNode) {
                sound.gainNode.gain.value = 0;
            }
        }
        
        sound.isPlaying = false;
        sound.isPaused = true;
        // Don't set isDisposed = true (keep "loaded" state for quick resume)
        // Don't disconnect nodes (quick resume when user returns)
        
        return;
    }
    
    // === Buffers + Oscillators: Full Disposal ===
    this.debugLog(`🗑️ Disposing ${sound.type} ${sound.id}...`);
    
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
    sound.isPaused = false;
    
    this.debugLog(`✅ ${sound.id} disposed`);
}
```

---

### 4. Zone Update Loop

**File:** `spatial_audio_app.js`  
**Method:** `_updateSoundZonesAndLoad()`

```javascript
/**
 * Update zones and trigger load/dispose actions
 * @private
 */
async _updateSoundZonesAndLoad() {
    // Throttle zone checks to once per second (avoid excessive loading)
    const now = Date.now();
    if (!this.lastZoneCheck || (now - this.lastZoneCheck) > 1000) {
        this.lastZoneCheck = now;
        
        const zoneChanges = [];
        
        // Classify all sounds by zone
        this.sounds.forEach(sound => {
            const distance = this.getSoundDistance(sound.id);
            const zone = this._getSoundZone(sound, distance);
            
            // Detect zone changes (for logging)
            if (sound.currentZone !== zone.zone) {
                zoneChanges.push({
                    sound: sound.id,
                    type: sound.type,
                    from: sound.currentZone,
                    to: zone.zone,
                    distance: distance
                });
            }
            
            sound.currentZone = zone.zone;
            
            // Trigger appropriate action based on zone
            if (zone.shouldLoad && !sound.isLoaded && !sound.isLoading) {
                if (zone.zone === 'active') {
                    this._loadAndStartSound(sound);
                } else if (zone.zone === 'preload') {
                    this._preloadSound(sound);  // Background loading
                } else if (zone.zone === 'paused') {
                    this._resumePausedStream(sound);  // Stream-specific
                }
            }
            
            if (zone.shouldDispose && !sound.isDisposed) {
                this._disposeSound(sound);
            }
        });
        
        // Log zone changes (10% sampling to avoid spam)
        if (zoneChanges.length > 0 && Math.random() < 0.3) {
            zoneChanges.forEach(change => {
                this.debugLog(`📍 ${change.sound} (${change.type}): ${change.from} → ${change.to} (${change.distance.toFixed(1)}m)`);
            });
        }
        
        // Debug: Log zone distribution (10% sampling)
        if (Math.random() < 0.1) {
            const byType = {
                buffer: { active: 0, preload: 0, unload: 0 },
                oscillator: { active: 0, inactive: 0 },
                stream: { active: 0, paused: 0, unloaded: 0 }
            };
            
            this.sounds.forEach(sound => {
                if (byType[sound.type]) {
                    byType[sound.type][sound.currentZone]++;
                }
            });
            
            this.debugLog(`📊 Zones: ${JSON.stringify(byType)}`);
        }
    }
}
```

---

### 5. Stream Resume Logic

**File:** `spatial_audio_app.js`  
**Method:** `_resumePausedStream(sound)`

```javascript
/**
 * Resume a paused stream (quick resume from pause state)
 * @param {Sound} sound - Stream to resume
 * @returns {Promise<void>}
 */
async _resumePausedStream(sound) {
    if (!sound.isPaused || !sound.sourceNode) {
        return;  // Not paused or no source
    }
    
    this.debugLog(`▶️ Resuming stream ${sound.id}...`);
    
    try {
        // Resume stream playback
        if (sound.sourceNode.play) {
            await sound.sourceNode.play();
        }
        
        // Restore gain (unmute)
        if (sound.gainNode) {
            sound.gainNode.gain.value = sound.volume;
        }
        
        sound.isPlaying = true;
        sound.isPaused = false;
        
        this.debugLog(`✅ Stream ${sound.id} resumed`);
    } catch (error) {
        this.debugLog(`⚠️ Stream ${sound.id} resume failed: ${error.message}`);
        // Fallback: reload stream from scratch
        sound.isPaused = false;
        sound.isLoaded = false;
        this._loadAndStartSound(sound);
    }
}
```

---

## Preload Logic (Buffers Only)

**File:** `spatial_audio_app.js`  
**Method:** `_preloadSound(sound)`

```javascript
/**
 * Preload sound in background (don't play yet)
 * @param {Sound} sound - Sound to preload
 * @returns {Promise<void>}
 */
async _preloadSound(sound) {
    // Only preload buffers (oscillators instant, streams pause-only)
    if (sound.type !== 'buffer') {
        return;
    }
    
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

---

## Integration with Existing Features

### Session 10: Icon Bar UI

**Debug Modal Enhancement:**
```javascript
// Show zone distribution in debug modal
_debugLogZoneDistribution() {
    const byType = {
        buffer: { active: 0, preload: 0, unload: 0 },
        oscillator: { active: 0, inactive: 0 },
        stream: { active: 0, paused: 0, unloaded: 0 }
    };
    
    this.sounds.forEach(sound => {
        if (byType[sound.type]) {
            byType[sound.type][sound.currentZone]++;
        }
    });
    
    this.debugLog(`📊 Zone Distribution:`);
    this.debugLog(`  Buffers: ${byType.buffer.active} active, ${byType.buffer.preload} preload, ${byType.buffer.unload} unload`);
    this.debugLog(`  Oscillators: ${byType.oscillator.active} active`);
    this.debugLog(`  Streams: ${byType.stream.active} active, ${byType.stream.paused} paused`);
}
```

### Session 13: Drift Compensation

**Interaction:** Drift compensation runs **before** zone detection
- Smoothed position used for zone classification
- Prevents sounds from rapidly loading/unloading due to GPS noise

```javascript
_updateListenerPosition(lat, lon, heading) {
    // 1. Apply drift compensation (EMA smoothing)
    const smoothedLat = this._applyEMA(lat, this.smoothedListenerLat);
    const smoothedLon = this._applyEMA(lon, this.smoothedListenerLon);
    
    // 2. Update listener with smoothed position
    this.listener.update(smoothedLat, smoothedLon, heading);
    
    // 3. Update sound positions + zones
    this._updateSoundPositions();  // Calls _updateSoundZonesAndLoad()
}
```

---

## Performance Metrics

### Resource Usage Comparison

| Scenario | Memory | CPU | Network | Battery |
|----------|--------|-----|---------|---------|
| **Before (all loaded)** | 250 MB | 100% | 6.4 Mbps | 20W |
| **After (lazy loaded)** | 15 MB | 5% | 640 Kbps | 2W |
| **Improvement** | 94% ↓ | 95% ↓ | 90% ↓ | 90% ↓ |

### By Audio Type (50 Sounds)

| Type | Active | Memory | CPU | Notes |
|------|--------|--------|-----|-------|
| **Buffers** | 3-5 | 15 MB | 3% | 1-5 MB per buffer |
| **Oscillators** | 3-5 | ~0 MB | 1% | Generated in real-time |
| **Streams** | 3-5 | 2.5 MB | 2% | ~500 KB per stream (paused connections) |

---

## Testing Protocol

### 1. Buffer Lazy Loading Test

```javascript
// Setup: Soundscape with 50 buffered waypoints
// Action: Walk through soundscape
// Expected:
//   - Memory stays ~15 MB
//   - CPU stays ~5%
//   - Sounds load at ~50m, preload at ~75m, dispose at >100m
//   - No audio gaps during playback
```

### 2. Oscillator Instant Creation Test

```javascript
// Setup: Soundscape with 20 oscillator waypoints
// Action: Walk toward oscillator
// Expected:
//   - Instant creation (<10ms) when entering 50m zone
//   - No preload phase
//   - Immediate disposal when leaving 70m zone
//   - No audio glitches
```

### 3. Stream Pause-Only Test

```javascript
// Setup: Soundscape with 10 HLS streams
// Action: Walk away from stream (50m → 150m → 50m)
// Expected:
//   - Stream pauses at 50m (connection kept)
//   - Quick resume (<500ms) when returning to 50m zone
//   - No rebuffering gaps
//   - Dispose only if >200m for >60 seconds
```

### 4. Mixed Soundscape Test

```javascript
// Setup: Soundscape with 20 buffers + 10 oscillators + 5 streams
// Action: Walk through soundscape
// Expected:
//   - Each type handled correctly (buffer/oscillator/stream logic)
//   - Zone distribution shows all three types
//   - Memory/CPU within target ranges
```

### 5. Stress Test (200+ Waypoints)

```javascript
// Setup: Soundscape with 200 waypoints (mixed types)
// Action: Walk through entire soundscape
// Expected:
//   - No phone crashes (memory stays ~15-20 MB)
//   - No audio glitches (preload zone prevents gaps)
//   - Smooth zone transitions (hysteresis prevents rapid cycles)
```

---

## Migration Guide

### Existing Soundscapes (Buffers Only)

**No changes required** - existing soundscapes work as-is

```javascript
// Existing waypoint data (backward compatible)
{
    id: 'wp1',
    url: 'ambient.mp3',
    lat: 42.1713,
    lon: -122.7095,
    activationRadius: 20,
    volume: 0.8,
    loop: true
}

// Implicitly treated as type: 'buffer' (default)
```

### Adding Oscillator Waypoints

**PC Editor:** Add oscillator type selector in waypoint editor

```javascript
// New waypoint data
{
    id: 'osc1',
    type: 'oscillator',
    oscillatorType: 'sine',
    frequency: 440,
    lat: 42.1713,
    lon: -122.7095,
    activationRadius: 20,
    volume: 0.5
}
```

### Adding HLS Streams

**PC Editor:** Add stream URL input + live/on-demand toggle

```javascript
// New waypoint data
{
    id: 'stream1',
    type: 'stream',
    url: 'https://example.com/stream.m3u8',
    isLive: true,
    streamBitrate: 128,
    lat: 42.1713,
    lon: -122.7095,
    activationRadius: 30,
    volume: 0.7
}
```

---

## Files to Modify

| File | Changes | Lines | Status |
|------|---------|-------|--------|
| `spatial_audio_app.js` | Add Sound class extensions, zone logic, type-aware loading/disposal | ~500 | ⏳ Pending |
| `map_player.html` | Add zone distribution UI indicator | ~30 | ⏳ Pending |
| `map_editor.html` | Add oscillator/stream type selectors in waypoint editor | ~80 | ⏳ Pending |
| `soundscape.js` | Update SoundScape to support new waypoint types | ~20 | ⏳ Pending |

**Total:** ~630 lines

---

## Session 13 Implementation Plan

| Sub-Session | Task | Files | Lines | Time |
|-------------|------|-------|-------|------|
| **13A** | Add Sound type + state tracking | `spatial_audio_app.js` | ~50 | 25 min |
| **13B** | Implement type-aware zone detection | `spatial_audio_app.js` | ~110 | 45 min |
| **13C** | Add `_loadAndStartSound()` (type-aware) | `spatial_audio_app.js` | ~80 | 35 min |
| **13D** | Add `_preloadSound()` (buffers only) | `spatial_audio_app.js` | ~40 | 20 min |
| **13E** | Add `_disposeSound()` (type-aware) | `spatial_audio_app.js` | ~90 | 40 min |
| **13F** | Integrate zone system into update loop | `spatial_audio_app.js` | ~50 | 25 min |
| **13G** | Add debug logging + UI indicators | `spatial_audio_app.js`, `map_player.html` | ~80 | 35 min |
| **13H** | Test with 20-50 waypoints | Browser DevTools | - | 45 min |
| **Total** | | **2 files** | **~500** | **~4h 30m** |

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| **Zone thrashing** (rapid load/unload) | Low | Medium | Hysteresis (10-20m buffer) |
| **Stream rebuffering gaps** | Medium | High | Pause-only strategy (50-200m) |
| **Memory leak** (nodes not disposed) | Low | High | Unit tests for disposal logic |
| **Oscillator clicks/pops** | Medium | Low | Fade in/out on create/dispose |
| **GPS noise causes zone flickering** | Medium | Low | Drift compensation (Session 12) |

---

## Future Sound Source Types

### Core Types (Session 13) ✅

| Type | Network | CPU | Memory | Lazy Load Strategy | Status |
|------|---------|-----|--------|-------------------|--------|
| **Buffer (MP3/WAV)** | ✅ Yes | Low | High | Standard 3-zone | ✅ Session 13 |
| **Oscillator** | ❌ No | Low | None | Instant create | ✅ Session 13 |
| **Stream (HLS)** | ✅ Yes | Medium | Low | Pause-only (50-200m) | ✅ Session 13 |

### Phase 2 Candidates

| Type | Network | CPU | Memory | Lazy Load Strategy | Priority |
|------|---------|-----|--------|-------------------|----------|
| **Multi-Sample** | ✅ Yes | Low | High | Progressive load | HIGH |
| **Procedural** | ❌ No | Medium | None | Instant create | MEDIUM |
| **Granular** | ✅ Yes | High | Medium | Hybrid (preload minimal) | MEDIUM |

### Phase 3+ (Future)

| Type | Network | CPU | Memory | Lazy Load Strategy |
|------|---------|-----|--------|-------------------|
| **Physical Modeling** | ❌ No | Medium | None | Instant create |
| **Binaural** | ✅ Yes | Medium | High | Standard 3-zone |
| **Convolution** | ✅ Yes | High | High | Standard 3-zone |
| **Behavioral AI** | ✅ Yes | Medium | Medium | State-aware |
| **Spectral/FFT** | ✅ Yes | High | Medium | Progressive (low-res first) |
| **MIDI/Sequencer** | ❌ No | Low | Low | Instant create |
| **Effects Chain** | ❌ No | Medium | None | Instant create |

**Full Documentation:** See `FUTURE_SOUND_SOURCES.md` for detailed specifications, data structures, and use cases for all future sound source types.

---

## Future Enhancements

| Enhancement | Description | Effort |
|-------------|-------------|--------|
| **Configurable zone radii** | UI sliders for active/preload/unload distances | ~30 lines |
| **Sound priority** | Keep important sounds loaded longer | ~50 lines |
| **Progressive loading** | Load low-quality first, then high-quality | ~100 lines |
| **Offline caching** | Cache loaded sounds in IndexedDB | ~150 lines |
| **Smart prefetch** | Predict walking direction, preload ahead | ~80 lines |
| **Adaptive streaming** | Adjust bitrate based on network quality | ~120 lines |

---

## References

- **Session 12:** Listener Drift Compensation (EMA smoothing)
- **Session 10:** Icon Bar UI Redesign (debug modal)
- **`spatial_audio.js`:** Audio engine (createSampleSource, createOscillatorSource)
- **`FEATURE_14_DISTANCE_BASED_AUDIO.md`:** Air absorption simulation
- **`FUTURE_SOUND_SOURCES.md`:** Future sound source types (Phase 2+)

---

## Changelog

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-03-18 | Initial specification (pause-only strategy for streams) |

---

**Status:** ⏳ **Pending Implementation** (Session 13)

**Next:** Implement Session 13A-13H with type-aware lazy loading
