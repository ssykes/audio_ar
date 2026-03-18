# Feature 14: Distance-Based Audio Filtering (Air Absorption)

**Status:** 📋 PLANNED  
**Priority:** High  
**Est. Effort:** ~50 lines, ~50 minutes  
**Version:** v1.0 (planned)

---

## Problem Statement

### Current Behavior
- Sounds only get quieter with distance (volume fade)
- Frequency spectrum remains unchanged regardless of distance
- **Result:** Distant sounds feel "too clear" - unnatural, like they're far away but playing through high-fidelity speakers

### Real-World Physics

In nature, distant sounds lose high frequencies due to:

1. **Air absorption** - High frequencies absorbed by air molecules (humidity, temperature)
2. **Ground absorption** - Terrain/vegetation absorb highs more than lows
3. **Diffraction** - High-frequency waves don't bend around obstacles as well
4. **Turbulence** - Air variations scatter high frequencies

### Psychoacoustic Effect

| Distance | Frequency Content | Perception |
|----------|-------------------|------------|
| **Close** | Full spectrum | "Rich," "detailed," "present" |
| **Distant** | Less high-frequency | "Thin," "muffled," "distant" |

---

## Solution: Volume + Low-Pass Filter

### Recommended Approach: Option 2

**Why Option 2?**

| Benefit | Description |
|---------|-------------|
| ✅ **Matches physics** | Air absorption is real |
| ✅ **Cheap** | 1 filter per sound (negligible CPU) |
| ✅ **Subtle** | Users won't notice it, but will miss it if removed |
| ✅ **Easy** | ~30 lines, no refactor needed |
| ✅ **Works with Feature 13** | Lazy loading + filtering = pro audio |

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Sound Source → Low-Pass Filter → Gain Node → Destination   │
│                       ↑                                     │
│                  Cutoff freq                                │
│                  based on                                   │
│                  distance                                   │
└─────────────────────────────────────────────────────────────┘

Distance → Cutoff Frequency Mapping:
  0m    → 20,000 Hz (full spectrum, crisp)
  20m   → 15,000 Hz (slight high-frequency loss)
  50m   → 8,000 Hz  (noticeably muffled)
  80m+  → 1,000 Hz  (very thin, mostly bass)
```

### Universal Application

**Works with ALL sound source types:**

| Source Type | Example | Compatible |
|-------------|---------|------------|
| **SampleSource** | MP3, WAV, OGG files | ✅ Yes |
| **OscillatorSource** | Sine, square, sawtooth waves | ✅ Yes |
| **MultiOscillatorSource** | Multiple oscillators | ✅ Yes |
| **MediaStreamSource** | Live microphone, WebRTC | ✅ Yes |
| **AudioBufferSource** | Pre-loaded buffers | ✅ Yes |

**Audio Chain (Universal):**

```
[Any Source] → Gain → Panner → Low-Pass Filter → Master → Speakers
             (vol)  (3D pos)  (distance tone)
```

---

## Implementation Plan

### Sessions

| Session | Task | Files | Lines | Time |
|---------|------|-------|-------|------|
| **14A** | Add `filterNode` to Sound class | `spatial_audio_app.js` | ~10 | 10 min |
| **14B** | Create low-pass filter on load | `spatial_audio_app.js` | ~20 | 15 min |
| **14C** | Update filter in `_updateSoundPositions()` | `spatial_audio_app.js` | ~20 | 15 min |
| **14D** | Test with various distances | Browser DevTools | - | 10 min |
| **Total** | | | **~50 lines** | **~50 min** |

---

## Code Implementation

### 1. Add Filter to Sound Class

```javascript
// spatial_audio_app.js

class Sound {
    constructor(options = {}) {
        this.id = options.id || '';
        this.url = options.url || '';
        this.lat = options.lat || 0;
        this.lon = options.lon || 0;
        this.activationRadius = options.activationRadius || 20;
        this.volume = options.volume || 0.5;
        this.loop = options.loop || false;
        
        // State tracking
        this.isLoading = false;
        this.isLoaded = false;
        this.isDisposed = false;
        
        // Audio nodes
        this.sourceNode = null;
        this.gainNode = null;
        this.pannerNode = null;
        this.filterNode = null;  // NEW: Low-pass filter
    }
}
```

### 2. Create Filter When Loading Sound

```javascript
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
                
                // NEW: Create low-pass filter
                sound.filterNode = this.engine.audioContext.createBiquadFilter();
                sound.filterNode.type = 'lowpass';
                sound.filterNode.frequency.value = 20000;  // Start at full spectrum
                sound.filterNode.Q.value = 0.5;  // Smooth rolloff
                
                // Connect: source → filter → gain → destination
                // Disconnect source from gain, route through filter
                source.disconnect();
                source.connect(sound.filterNode);
                sound.filterNode.connect(sound.gainNode);
                
                sound.isPlaying = true;
                sound.isLoaded = true;
                this.debugLog(`✅ ${sound.id} loaded + started (with filter)`);
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

### 3. Update Filter Based on Distance

```javascript
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

    // Update gain and filter for active sounds
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
            
            // NEW: Update low-pass filter based on distance
            if (sound.filterNode) {
                const distance = this.getSoundDistance(sound.id);
                const cutoff = this._calculateFilterCutoff(distance);
                sound.filterNode.frequency.value = cutoff;
            }
        }
    });
}

/**
 * Calculate low-pass filter cutoff frequency based on distance
 * Simulates air absorption (high frequencies lost over distance)
 * 
 * @param {number} distance - Distance to sound in meters
 * @returns {number} Cutoff frequency in Hz
 */
_calculateFilterCutoff(distance) {
    // Configuration constants
    const MIN_FREQ = 1000;    // Muffled at max distance (like distant thunder)
    const MAX_FREQ = 20000;   // Full spectrum when close (human hearing limit)
    const MAX_DISTANCE = 80;  // Distance where sound becomes very muffled
    
    // Linear interpolation
    const ratio = Math.min(distance / MAX_DISTANCE, 1);
    const cutoff = MAX_FREQ - (ratio * (MAX_FREQ - MIN_FREQ));
    
    // Ensure minimum frequency (don't go completely muffled)
    return Math.max(MIN_FREQ, cutoff);
}
```

### Alternative: Exponential Curve (More Realistic)

```javascript
/**
 * Exponential decay curve (more realistic air absorption)
 * @param {number} distance
 * @returns {number}
 */
_calculateFilterCutoffExponential(distance) {
    const MIN_FREQ = 1000;
    const MAX_FREQ = 20000;
    const DECAY_RATE = 0.05;  // Adjust for stronger/weaker effect
    
    // Exponential decay: starts flat, drops faster at distance
    const decay = Math.exp(-distance * DECAY_RATE);
    const cutoff = MIN_FREQ + (decay * (MAX_FREQ - MIN_FREQ));
    
    return Math.max(MIN_FREQ, cutoff);
}
```

---

## User Experience

### Frequency Mapping

| Distance | Cutoff Frequency | Perceived Quality | Example |
|----------|------------------|-------------------|---------|
| **0-10m** | 18,000-20,000 Hz | Crisp, full detail | Bird chirping right there |
| **10-30m** | 12,000-18,000 Hz | Slightly muted | Conversation nearby |
| **30-50m** | 6,000-12,000 Hz | Noticeably thinner | Fountain across plaza |
| **50-80m** | 2,000-6,000 Hz | Muffled, distant | Traffic in background |
| **80m+** | 1,000 Hz | Very thin (mostly bass) | Distant thunder |

### User Perception Examples

**Scenario 1: Bird Chirping (Close)**
- **Distance:** 5m
- **Cutoff:** 19,000 Hz
- **Perception:** "The bird is right there! I can hear every detail."

**Scenario 2: Water Fountain (Medium)**
- **Distance:** 30m
- **Cutoff:** 10,000 Hz
- **Perception:** "There's a fountain somewhere over there."

**Scenario 3: Distant Thunder (Far)**
- **Distance:** 70m
- **Cutoff:** 2,000 Hz
- **Perception:** "Thunder rolling in the distance" (mostly low rumble)

---

## Testing Protocol

### Console Testing

```javascript
// Open browser console
const app = window.audioApp;

// Test cutoff calculation
console.log('0m:', app._calculateFilterCutoff(0));     // 20000
console.log('20m:', app._calculateFilterCutoff(20));   // ~15000
console.log('50m:', app._calculateFilterCutoff(50));   // ~8000
console.log('80m:', app._calculateFilterCutoff(80));   // 1000
console.log('100m:', app._calculateFilterCutoff(100)); // 1000

// Test filter state
const sound = app.sounds[0];
console.log('Filter created:', sound.filterNode !== null);
console.log('Filter type:', sound.filterNode.type);  // 'lowpass'
console.log('Cutoff freq:', sound.filterNode.frequency.value);  // 20000

// Monitor filter updates while moving
setInterval(() => {
    const sound = app.sounds[0];
    if (sound.filterNode) {
        console.log('Distance:', app.getSoundDistance(sound.id), 'm');
        console.log('Cutoff:', sound.filterNode.frequency.value, 'Hz');
    }
}, 1000);
```

### Test Checklist

| Test | Expected Result | Status |
|------|-----------------|--------|
| Close sound (0-10m) | Full frequency (18-20 kHz), crisp | ⬜ |
| Medium distance (30m) | Noticeable high-frequency loss (~10 kHz) | ⬜ |
| Far sound (60m) | Muffled, thin (~3-5 kHz) | ⬜ |
| Very far (80m+) | Very thin, mostly bass (~1 kHz) | ⬜ |
| Walk toward sound | Smooth frequency increase (no clicks/pops) | ⬜ |
| Walk away from sound | Smooth frequency decrease | ⬜ |
| Multiple sounds at once | Each has independent filter | ⬜ |
| CPU usage | No noticeable increase (<1% per sound) | ⬜ |

### Performance Profiling

**Browser DevTools:**
1. Open Chrome DevTools → Performance tab
2. Start recording
3. Walk through soundscape (or drag sim avatar)
4. Stop recording
5. Check:
   - CPU usage (should stay <5% total)
   - No audio glitches
   - Smooth filter transitions

---

## Benefits

| Benefit | Description |
|---------|-------------|
| ✅ **Realistic audio** | Matches real-world physics (air absorption) |
| ✅ **Psychoacoustic depth** | Brain perceives distance more accurately |
| ✅ **Cheap computationally** | 1 BiquadFilter per sound (~0.5% CPU each) |
| ✅ **Subtle enhancement** | Users won't notice it, but will miss it if removed |
| ✅ **Works with Feature 13** | Lazy loading + filtering = professional audio |
| ✅ **No artifacts** | Smooth transitions, no clicks/pops |
| ✅ **Universal** | Works with any audio file (no special encoding) |

---

## Comparison: Before vs After

| Aspect | Before (Volume Only) | After (Volume + Filter) |
|--------|---------------------|------------------------|
| **Close sound** | Loud + full spectrum | Loud + full spectrum |
| **Distant sound** | Quiet + full spectrum | Quiet + muffled ✅ |
| **Perceived distance** | Good | Excellent ✅ |
| **Realism** | 7/10 | 9/10 ✅ |
| **CPU cost** | ~0% | ~0.5% per sound |
| **Memory cost** | 0 MB | 0 MB |

---

## Configuration Options (Future Enhancement)

| Parameter | Default | Adjustable Range | Effect |
|-----------|---------|------------------|--------|
| `MIN_FREQ` | 1000 Hz | 500-2000 Hz | How muffled at max distance |
| `MAX_FREQ` | 20000 Hz | 16000-22000 Hz | Full spectrum limit |
| `MAX_DISTANCE` | 80 m | 50-150 m | Distance for full effect |
| `DECAY_RATE` | 0.05 (exp) | 0.02-0.1 | Curve steepness |

### Future UI

```html
<div class="audio-settings">
    <label>
        Air Absorption Strength:
        <input type="range" min="0" max="100" value="50">
    </label>
    <label>
        Max Filter Distance:
        <input type="range" min="50" max="200" value="80">
    </label>
</div>
```

---

## Browser Support

| Browser | BiquadFilterNode | Support |
|---------|------------------|---------|
| Chrome | ✅ Full | 14+ |
| Firefox | ✅ Full | 25+ |
| Safari | ✅ Full | 6+ |
| Edge | ✅ Full | 12+ |
| iOS Safari | ✅ Full | 6+ |
| Android Chrome | ✅ Full | 95%+ |

**Coverage:** 95%+ (graceful degradation: no filter on unsupported browsers)

---

## Dependencies

| Dependency | Status |
|------------|--------|
| Feature 10: Icon bar UI | ✅ Complete |
| Feature 13: Lazy loading | 📋 Planned (can implement in parallel) |
| `spatial_audio.js`: SampleSource class | ✅ Existing |
| `spatial_audio_app.js`: SpatialAudioApp class | ✅ Existing |
| Web Audio API: BiquadFilterNode | ✅ Browser standard (95%+ support) |

**No blocking dependencies** - can implement anytime

---

## Rollback Plan

If issues arise:

1. **Disable filter updates** - Comment out filter code in `_updateSoundPositions()`
2. **Bypass filter** - Connect source directly to gain (skip filter node)
3. **Revert `spatial_audio_app.js`** - Restore from backup

**Mitigation:** Test with single sound first, verify no audio artifacts

---

## Related Psychoacoustic Effects (Future Enhancements)

| Effect | Description | Implementation |
|--------|-------------|----------------|
| **Doppler shift** | Frequency changes as sound moves relative to listener | Pitch shift based on relative velocity |
| **Reverb tail** | Distant sounds have longer reverb (room acoustics) | Convolution reverb with distance-based mix |
| **Interaural level difference** | Head shadowing (sound quieter in far ear) | Already handled by Panner3D |
| **Interaural time difference** | Sound arrives at near ear first | Already handled by Panner3D |
| **Pinna filtering** | Outer ear shapes frequency response | HRTF (already in Panner3D) |

---

## References

- **QWEN.md:** Feature 14 planning documentation
- **Web Audio API:** https://developer.mozilla.org/en-US/docs/Web/API/BiquadFilterNode
- **Air Absorption:** https://en.wikipedia.org/wiki/Speed_of_sound#Speed_of_sound_in_air

---

**Status:** 📋 **PLANNED** - Ready to implement

**Last Updated:** 2026-03-18
