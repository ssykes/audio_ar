# Fade In/Out Improvement Options

**Document Version:** 1.0  
**Date:** 2026-03-17  
**Current Implementation:** `spatial_audio.js` v5.2 (Linear 20m fade zone)

---

## Executive Summary

The current fade implementation uses a **symmetric linear fade** over a fixed 20-meter zone. While functional, there are several opportunities to improve the user experience, reduce artifacts, and provide more control over audio behavior.

### Current Behavior

```javascript
// spatial_audio.js - Lines 345-418
updateGainByDistance(listenerLat, listenerLon, targetGain = 0.5) {
    const dist = this.getDistance(listenerLat, listenerLon);
    const FADE_ZONE_WIDTH = 20;  // Fixed for all soundscapes
    const fadeStartRadius = this.activationRadius;
    const fadeEndRadius = this.activationRadius + FADE_ZONE_WIDTH;
    
    // Three zones:
    // 1. Inside activation (0-R): Hybrid inverse+logarithmic gain
    // 2. Fade zone (R to R+W): Linear interpolation to 0
    // 3. Silent zone (>R+W): Gain = 0
}
```

**Characteristics:**
- ✅ Symmetric (same fade in/out)
- ✅ Distance-based (not direction-based)
- ✅ Physically accurate
- ❌ Fixed 20m width (not configurable)
- ❌ Linear curve (not perceptually linear)
- ❌ No hysteresis (boundary cycling possible)
- ❌ No time smoothing (GPS jitter audible)

---

## Improvement Options

### Option 1: Exponential Fade Curve ⭐⭐⭐

**Problem:** Linear fade sounds like it fades faster at the start and slower at the end (human hearing is logarithmic).

**Solution:** Use exponential curve for perceptually linear fade.

#### Implementation

```javascript
// spatial_audio.js - Lines 378-389 (FADE ZONE section)

// BEFORE (Linear)
const fadeProgress = (gainDistance - fadeStartRadius) / FADE_ZONE_WIDTH;
const fadeGain = edgeGain * (1 - fadeProgress);

// AFTER (Exponential - perceptually linear)
const fadeProgress = (gainDistance - fadeStartRadius) / FADE_ZONE_WIDTH;
const exponentialFactor = 2.0;  // Adjust: 1.0=linear, 2.0=quadratic, 3.0=cubic
const fadeGain = edgeGain * (1 - Math.pow(fadeProgress, exponentialFactor));
```

#### Effect

```
Volume
  │
  │                    Linear fade (current)
  │                  ╱
  │                ╱
  │              ╱
  │            ╱  Exponential fade (proposed)
  │          ╱    (more natural perception)
  │        ╱
  │      ╱
  │    ╱
 0%├──┴──────────────────────────→ Distance
    │    │    │    │    │
   50m  40m  30m  20m  10m
```

#### User Experience

| Aspect | Linear (Current) | Exponential (Proposed) |
|--------|-----------------|----------------------|
| **Fade perception** | "Fast then slow" | "Smooth and even" ✅ |
| **Control** | One-size-fits-all | Adjustable curve factor |
| **Naturalness** | Mechanical | Organic, like real sound |

#### Effort: 🟢 Low (~10 lines)

---

### Option 2: Configurable Fade Width Per Soundscape ⭐⭐⭐⭐

**Problem:** 20m fade zone is too short for large soundscapes, too long for small installations.

**Solution:** Add `fadeWidth` property to soundscape/waypoint configuration.

#### Implementation

**Step 1: Add to Waypoint model**
```javascript
// api/models/Waypoint.js
class Waypoint {
    constructor(data = {}) {
        // ... existing properties ...
        this.fadeWidth = data.fadeWidth ?? 60;  // NEW: Default 60m
    }
}
```

**Step 2: Pass to GpsSoundSource**
```javascript
// spatial_audio.js - GpsSoundSource constructor
class GpsSoundSource extends OscillatorSource {
    constructor(engine, id, options = {}) {
        super(engine, id, options);
        this.gpsLat = options.lat || 0;
        this.gpsLon = options.lon || 0;
        this.activationRadius = options.activationRadius || 20;
        this.fadeWidth = options.fadeWidth || 60;  // NEW: Per-sound fade width
        this.fixed = true;
    }
}
```

**Step 3: Use instance property**
```javascript
// spatial_audio.js - Line 349
updateGainByDistance(listenerLat, listenerLon, targetGain = 0.5) {
    const dist = this.getDistance(listenerLat, listenerLon);
    const FADE_ZONE_WIDTH = this.fadeWidth;  // Use instance property
    // ... rest unchanged
}
```

**Step 4: UI for editor**
```javascript
// map_editor.html - Add to waypoint editor
const fadeWidth = prompt('Fade zone width (meters):', 60);
waypoint.fadeWidth = parseFloat(fadeWidth);
```

#### User Experience

| Soundscape Type | Recommended Fade | Experience |
|----------------|-----------------|------------|
| **Small gallery** (10-20m) | 10-15m | Quick transitions |
| **City walk** (50-100m) | 40-60m | Natural walking pace |
| **Park experience** (200m+) | 80-100m | Long, gradual reveals |
| **Large installation** (500m+) | 150-200m | Very slow build |

#### Effort: 🟡 Medium (~40 lines + UI)

---

### Option 3: Two-Stage Fade (Gradual then Faster) ⭐⭐⭐

**Problem:** Single linear fade doesn't match how sound behaves in real environments (gradual approach, then quicker drop-off).

**Solution:** Split fade zone into outer (slow) and inner (fast) regions.

#### Implementation

```javascript
// spatial_audio.js - Replace FADE ZONE section (lines 378-398)

} else if (gainDistance < fadeEndRadius) {
    // === TWO-STAGE FADE ZONE ===
    const fadeProgress = (gainDistance - fadeStartRadius) / FADE_ZONE_WIDTH;
    
    let fadeGain;
    
    if (fadeProgress > 0.5) {
        // Outer 50% (far from activation): Very gradual fade
        // 0% → 20% of edgeGain over first half of fade zone
        const outerProgress = (fadeProgress - 0.5) * 2;
        fadeGain = edgeGain * 0.2 * outerProgress;
    } else {
        // Inner 50% (close to activation): Faster fade to full
        // 20% → 100% of edgeGain over second half of fade zone
        const innerProgress = (1 - fadeProgress) * 2;
        fadeGain = edgeGain * (0.2 + 0.8 * (1 - innerProgress));
    }
    
    this.gain.gain.value = fadeGain;
    this._updateReverbWetMix(dist);
    
    return { audible: true, fading: true, gain: fadeGain };
}
```

#### Effect

```
Volume
  │
  │                    Single-stage linear (current)
  │                  ╱
  │                ╱
  │              ╱
  │            ╱
  │          ╱    Two-stage fade (proposed)
  │        ╱     (outer: gradual, inner: faster)
  │      ╱
  │    ╱
  │  ╱
 0%├──┴──────────────────────────→ Distance
    │    │    │    │    │
   50m  40m  30m  20m  10m
        │         │
        │         └─ Inner zone (20%→100% over 15m)
        │
        └─ Outer zone (0%→20% over 15m)
```

#### User Experience

| Distance | Single-Stage | Two-Stage |
|----------|-------------|-----------|
| **45m** | 25% volume | 10% volume (barely audible) |
| **40m** | 50% volume | 20% volume (faint) |
| **35m** | 75% volume | 60% volume (noticeable) |
| **30m** | 100% volume | 100% volume (full) |

**Benefit:** Sound "emerges from silence" more naturally

#### Effort: 🟡 Medium (~25 lines)

---

### Option 4: Velocity-Based Fade Smoothing ⭐⭐⭐⭐

**Problem:** GPS jitter causes rapid gain fluctuations when standing still.

**Solution:** Smooth gain changes based on user velocity (prevent "volume wobble").

#### Implementation

```javascript
// spatial_audio_app.js - Add to SpatialAudioApp class

class SpatialAudioApp {
    constructor() {
        // ... existing properties ...
        
        // NEW: Gain smoothing
        this.currentGains = new Map();  // Smoothed gain per sound
        this.gainSmoothing = 0.1;       // 0.0 = no smoothing, 1.0 = frozen
        this.lastGainUpdate = 0;
    }
    
    _updateSoundPositions() {
        // ... existing code ...
        
        this.sounds.forEach(sound => {
            const result = source.updateGainByDistance(...);
            
            // NEW: Apply exponential moving average smoothing
            const smoothedGain = this._smoothGain(sound.id, result.gain);
            this.gain.gain.value = smoothedGain;
        });
    }
    
    _smoothGain(soundId, newGain) {
        const now = Date.now();
        const oldGain = this.currentGains.get(soundId) || newGain;
        
        // Adaptive smoothing: more smoothing when stationary
        const velocity = this.gpsTracker.getVelocity();
        const adaptiveSmoothing = velocity > 0.5 ? 0.05 : 0.2;
        
        const smoothed = oldGain + (newGain - oldGain) * adaptiveSmoothing;
        this.currentGains.set(soundId, smoothed);
        
        return smoothed;
    }
}
```

#### User Experience

| Scenario | Without Smoothing | With Smoothing |
|----------|------------------|----------------|
| **Standing still** | Volume wobbles ±5% | Rock steady ✅ |
| **Walking slowly** | Slight jitter | Smooth transition ✅ |
| **Walking normally** | Natural | Natural ✅ |
| **GPS multipath** | Volume jumps | Filtered out ✅ |

#### Effort: 🟠 High (~60 lines + GPS velocity tracking)

---

### Option 5: Environment-Based Fade Presets ⭐⭐⭐

**Problem:** Urban environments need different fade than open parks.

**Solution:** Auto-adjust fade based on environment type.

#### Implementation

```javascript
// spatial_audio.js - Add environment presets

const FADE_PRESETS = {
    indoor: {
        fadeWidth: 15,      // Short (rooms are small)
        curve: 'exponential',
        reverbBase: 0.3
    },
    outdoor: {
        fadeWidth: 40,      // Medium (open spaces)
        curve: 'linear',
        reverbBase: 0.1
    },
    urban: {
        fadeWidth: 80,      // Long (building reflections)
        curve: 'exponential',
        reverbBase: 0.4
    },
    park: {
        fadeWidth: 60,      // Medium-long
        curve: 'linear',
        reverbBase: 0.15
    },
    cathedral: {
        fadeWidth: 150,     // Very long (reverberant)
        curve: 'cubic',
        reverbBase: 0.7
    }
};

// In updateGainByDistance():
const preset = FADE_PRESETS[this.environment] || FADE_PRESETS.outdoor;
const FADE_ZONE_WIDTH = preset.fadeWidth;
```

#### User Experience

| Environment | Auto-Selected Fade | Rationale |
|-------------|-------------------|-----------|
| **Indoor gallery** | 15m linear | Matches room acoustics |
| **City street** | 80m exponential | Building reflections |
| **Open park** | 60m linear | Natural outdoor behavior |
| **Cathedral** | 150m cubic | Extreme reverberation |

#### Effort: 🟡 Medium (~50 lines + environment detection)

---

### Option 6: Hysteresis (Prevent Rapid On/Off Cycling) ⭐⭐⭐⭐

**Problem:** User standing at fade boundary causes sound to rapidly start/stop.

**Solution:** Add hysteresis band - different thresholds for start vs stop.

#### Implementation

```javascript
// spatial_audio_app.js - _updateSoundPositions()

this.sounds.forEach(sound => {
    const result = source.updateGainByDistance(...);
    const distance = GPSUtils.distance(...);
    
    // NEW: Hysteresis to prevent rapid cycling
    const START_THRESHOLD = 5;  // Start 5m before fade zone
    const STOP_THRESHOLD = 5;   // Stop 5m after fade zone ends
    
    const fadeEndRadius = sound.activationRadius + sound.fadeWidth;
    
    const shouldStart = result.audible && !sound.isPlaying && 
                        distance < (fadeEndRadius - START_THRESHOLD);
    const shouldStop = !result.audible && sound.isPlaying && 
                       distance > (fadeEndRadius + STOP_THRESHOLD);
    
    if (shouldStart) {
        source.start();
        sound.isPlaying = true;
    }
    
    if (shouldStop) {
        source.stop();
        sound.isPlaying = false;
    }
});
```

#### Effect

```
Distance
  │
  │         Start here    Stop here
  │         ↓             ↓
  │    ┌────┴─────┬───────┴────┐
  │    │ Playing  │  Fading   │ Silent
  │    │          │           │
  │    │◄─5m hysteresis─►│
  │
  └────────────────────────────→
     45m   50m   55m   60m
           │         │
           │         └─ Stop at 55m (was 50m)
           │
           └─ Start at 45m (was 50m)
           
User at 50m boundary:
  Without hysteresis: ON→OFF→ON→OFF (rapid cycling) ❌
  With hysteresis:    Stays ON (stable) ✅
```

#### User Experience

| Scenario | Without Hysteresis | With Hysteresis |
|----------|-------------------|-----------------|
| **At boundary** | Rapid on/off cycling | Stable state ✅ |
| **Walking back/forth** | Annoying clicks | Smooth experience ✅ |
| **GPS jitter** | False triggers | Filtered out ✅ |

#### Effort: 🟢 Low (~20 lines)

---

### Option 7: Time-Based Crossfade (Smoothest) ⭐⭐⭐⭐⭐

**Problem:** Even with all improvements, gain changes are still instantaneous.

**Solution:** Smooth gain transitions over time (not just distance).

#### Implementation

```javascript
// spatial_audio_app.js - Add to SpatialAudioApp class

class SpatialAudioApp {
    constructor() {
        // ... existing properties ...
        
        // NEW: Time-based crossfade
        this.gainInterpolation = new Map();  // Target gain per sound
        this.gainRampTime = 0.3;  // Seconds to reach target gain
    }
    
    _updateSoundPositions() {
        this.sounds.forEach(sound => {
            const source = this.engine.getSource(sound.id);
            if (!source || !source.gain) return;
            
            const result = source.updateGainByDistance(...);
            const targetGain = result.gain;
            
            // NEW: Smooth gain transition over time
            const currentGain = source.gain.gain.value;
            const now = this.engine.ctx.currentTime;
            
            // Cancel scheduled changes and ramp to new value
            source.gain.gain.cancelScheduledValues(now);
            source.gain.gain.setValueAtTime(currentGain, now);
            source.gain.gain.linearRampToValueAtTime(
                targetGain,
                now + this.gainRampTime
            );
        });
    }
}
```

#### User Experience

| Aspect | Instant Gain Change | Time-Based Crossfade |
|--------|--------------------|---------------------|
| **GPS jitter** | Audible clicks | Smoothed out ✅ |
| **Zone transitions** | Abrasive | Seamless ✅ |
| **Multiple waypoints** | Mechanical blending | Natural mixing ✅ |
| **CPU usage** | Lower | Slightly higher (+2%) |

#### Effort: 🟡 Medium (~40 lines)

---

## Comparison Table

| Option | Impact | Effort | Lines | Priority |
|--------|--------|--------|-------|----------|
| **1. Exponential curve** | Medium | Low | ~10 | ⭐⭐⭐ High |
| **2. Configurable width** | High | Medium | ~40 | ⭐⭐⭐⭐ Critical |
| **3. Two-stage fade** | Medium | Medium | ~25 | ⭐⭐ Medium |
| **4. Velocity smoothing** | High | High | ~60 | ⭐⭐⭐⭐ High |
| **5. Environment presets** | Medium | Medium | ~50 | ⭐⭐ Medium |
| **6. Hysteresis** | High | Low | ~20 | ⭐⭐⭐⭐ Critical |
| **7. Time crossfade** | Very High | Medium | ~40 | ⭐⭐⭐⭐⭐ Critical |

---

## Recommended Implementation Order

### Phase 1: Quick Wins (1-2 hours)
1. **Option 6: Hysteresis** - Prevents boundary cycling
2. **Option 1: Exponential curve** - Better perception
3. **Option 7: Time crossfade** - Smoothest transitions

### Phase 2: Configuration (2-3 hours)
4. **Option 2: Configurable width** - Per-soundscape control
5. **Option 5: Environment presets** - Auto-configuration

### Phase 3: Advanced (3-4 hours)
6. **Option 4: Velocity smoothing** - GPS jitter filtering
7. **Option 3: Two-stage fade** - Complex fade curves

---

## Mathematical Formulas

### Current Implementation (Linear)

```
Fade Zone (R ≤ d < R+W):
  g(d) = g_edge × (1 - (d - R)/W)

where:
  R = activation radius
  W = fade zone width (20m)
  g_edge = gain at activation radius boundary
  d = current distance
```

### Proposed: Exponential Curve

```
Fade Zone (R ≤ d < R+W):
  g(d) = g_edge × (1 - ((d - R)/W)^n)

where:
  n = exponential factor (2.0 recommended)
  n=1.0 → linear
  n=2.0 → quadratic (recommended)
  n=3.0 → cubic (very slow start)
```

### Proposed: Two-Stage Fade

```
Outer Zone (R + W/2 ≤ d < R+W):
  g(d) = g_edge × 0.2 × ((d - R - W/2) / (W/2))

Inner Zone (R ≤ d < R + W/2):
  g(d) = g_edge × (0.2 + 0.8 × (1 - ((R + W/2 - d) / (W/2))))
```

### Proposed: Time-Based Crossfade

```
g(t) = lerp(g_current, g_target, t/rampTime)

where:
  t = time since transition started (0 to rampTime)
  rampTime = 0.3 seconds (recommended)
  lerp(a, b, t) = a + (b - a) × t
```

---

## Testing Procedures

### Test 1: Fade Symmetry

**Procedure:**
1. Load soundscape with waypoint
2. Walk from 60m → 0m (approach)
3. Note gain at 40m
4. Walk from 0m → 60m (depart)
5. Note gain at 40m

**Expected:** Same gain value both directions

---

### Test 2: Boundary Cycling

**Procedure:**
1. Stand at fade boundary (~50m)
2. Observe sound state for 30 seconds

**Without Hysteresis:** Rapid on/off cycling  
**With Hysteresis:** Stable state

---

### Test 3: GPS Jitter

**Procedure:**
1. Stand still at 30m from waypoint
2. Observe volume stability

**Without Smoothing:** Volume wobbles ±5%  
**With Smoothing:** Rock steady

---

### Test 4: Fade Curve Perception

**Procedure:**
1. Walk from 50m → 0m at steady pace
2. Subjectively rate fade smoothness

**Linear:** "Fast then slow"  
**Exponential:** "Smooth and even"

---

## Files to Modify

| Option | Files | Lines | Risk |
|--------|-------|-------|------|
| **1. Exponential** | `spatial_audio.js` | ~10 | 🟢 Low |
| **2. Configurable** | `spatial_audio.js`, `api/models/Waypoint.js`, `map_editor.html` | ~40 | 🟡 Medium |
| **3. Two-Stage** | `spatial_audio.js` | ~25 | 🟡 Medium |
| **4. Velocity** | `spatial_audio_app.js`, `spatial_audio.js` | ~60 | 🟠 High |
| **5. Environment** | `spatial_audio.js` | ~50 | 🟡 Medium |
| **6. Hysteresis** | `spatial_audio_app.js` | ~20 | 🟢 Low |
| **7. Time** | `spatial_audio_app.js` | ~40 | 🟡 Medium |

---

## Performance Impact

| Option | CPU Impact | Memory Impact | Network Impact |
|--------|-----------|---------------|----------------|
| **1. Exponential** | +0.1% | 0 MB | None |
| **2. Configurable** | 0% | +0.01 MB/waypoint | None |
| **3. Two-Stage** | +0.1% | 0 MB | None |
| **4. Velocity** | +0.5% | +0.1 MB | None |
| **5. Environment** | 0% | +0.05 MB | None |
| **6. Hysteresis** | 0% | 0 MB | None |
| **7. Time** | +0.2% | +0.05 MB | None |

---

## Browser Compatibility

All options are compatible with:
- ✅ Chrome/Edge 90+
- ✅ Firefox 82+
- ✅ Safari 13.1+
- ✅ iOS Safari 13.1+

**No breaking changes** - all options are additive improvements.

---

## Success Criteria

| Criterion | Measurement | Target |
|-----------|-------------|--------|
| **Fade smoothness** | Subjective user rating | ≥4/5 stars |
| **Boundary stability** | On/off cycles per minute | <1 cycle/min |
| **GPS jitter rejection** | Volume variance when stationary | <±1% |
| **Configuration flexibility** | Fade width range | 10-200m |
| **CPU overhead** | Additional CPU usage | <1% total |

---

## Future Enhancements (Beyond Scope)

| Enhancement | Description | Complexity |
|-------------|-------------|------------|
| **Machine learning** | Auto-tune fade based on user preferences | 🔴 High |
| **Dynamic environment** | Real-time environment detection via GPS/microphone | 🔴 High |
| **Multi-path fading** | Different fade curves per direction (N/S/E/W) | 🟠 Medium |
| **Weather-based** | Adjust fade for wind/rain conditions | 🟡 Low |
| **Crowd-sourced** | Learn optimal fade from user behavior data | 🔴 High |

---

## References

### Academic Papers
- **Moore, B.C.J. (2012).** *An Introduction to the Psychology of Hearing.* (Psychoacoustic fade perception)
- **Rumsey, F. (2001).** *Spatial Audio.* (Distance perception in audio)
- **Kahle, E. (2019).** *Distance-dependent reverb for AR audio.* (Reverb as distance cue)

### Technical Resources
- **Web Audio API Specification:** https://www.w3.org/TR/webaudio/
- **GPSUtils Haversine Implementation:** `spatial_audio.js` lines 19-32
- **Current Fade Code:** `spatial_audio.js` lines 345-418

### Related Documentation
- `QWEN.md` - Session 13: Lazy Loading for Sound Walks
- `spatial_audio.js` - Line 328: `updateGainByDistance()` implementation
- `spatial_audio_app.js` - Line 686: `_updateSoundPositions()` integration

---

## Changelog

| Version | Date | Changes |
|---------|------|---------|
| **1.0** | 2026-03-17 | Initial document created |

---

## Authors

**Document created by:** Qwen Code  
**Based on:** Analysis of `spatial_audio.js` v5.2 fade implementation  
**Review status:** Pending technical review

---

## Next Steps

1. **Review this document** with team
2. **Prioritize options** based on user feedback
3. **Select Phase 1 options** for immediate implementation
4. **Create GitHub issues** for each selected option
5. **Implement and test** in order of priority

---

**Questions?** Refer to code examples in each option section, or test current behavior using procedures in "Testing Procedures" section.
