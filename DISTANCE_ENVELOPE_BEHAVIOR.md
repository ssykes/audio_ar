# Distance-Based Envelope Behavior

**Version:** 1.0  
**Status:** 📋 Planned  
**Type:** Spatial Behavior (not audio effect)  
**Priority:** High  

---

## 🎯 Overview

**Distance-Based Envelope Behavior** controls sound volume based on the listener's position relative to a waypoint's activation zone. Unlike time-based envelopes (ADSR), this behavior automates volume based on **where you are** in space.

### **Use Case**

> "I want sounds to fade in quickly when I enter the activation radius, stay at a consistent volume while I walk around inside, then fade out smoothly as I approach the center or leave the zone."

### **Problem Solved**

**Current Behavior:**
- Volume uses simple linear fade: 100% at center → 0% at edge
- No control over fade curve shape
- All waypoints behave identically

**With Distance Envelope:**
- Customizable fade-in distance (e.g., fade over first 10m from edge)
- Adjustable sustain volume (e.g., 80% volume while inside)
- Customizable fade-out distance (e.g., fade over last 5m from center)
- Curve shaping (linear, exponential, logarithmic)

---

## 📊 Visual Representation

```
Volume
  ↑
1.0 │        ┌──────────────┐
    │       /                \
0.8 │      /                  \
    │     /                    \
0.0 │────/                      \────
    └────────────────────────────────→ Distance from center
      0    5         40    50
           ↑         ↑     ↑
        Attack   Sustain  Decay
        Zone     Zone     Zone
        (10m)    (30m)    (10m)
```

**Zone Breakdown:**

| Zone | Distance from Center | Volume Behavior |
|------|---------------------|-----------------|
| **Exit Decay** | 0-10m | Fade out from 80% → 0% |
| **Sustain** | 10-40m | Constant 80% volume |
| **Enter Attack** | 40-50m | Fade in from 0% → 80% |
| **Outside** | >50m | Silent (0%) |

---

## 🏗️ Architecture

### **Behavior Specification**

```javascript
{
    type: 'distance_envelope',
    memberIds: ['wp1', 'wp2'],  // Can apply to multiple waypoints
    config: {
        // Distances in meters
        enterAttack: 10,      // Fade in over first 10m from edge
        sustainVolume: 0.8,   // Volume while inside (0-1)
        exitDecay: 10,        // Fade out over last 10m from center
        
        // Curve shaping
        curve: 'exponential'  // 'linear' | 'exponential' | 'logarithmic'
    }
}
```

### **Integration with Existing System**

```
┌─────────────────────────────────────────────────────────────┐
│  Soundscape                                                 │
│  ├─ Waypoint 1 (soundUrl, lat, lon, activationRadius)       │
│  ├─ Waypoint 2 (soundUrl, lat, lon, activationRadius)       │
│  └─ Behaviors[]                                             │
│     └─ { type: 'distance_envelope', config: {...} }         │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│  Runtime: BehaviorExecutor.create()                         │
│  └─ DistanceEnvelopeExecutor                                │
│     ├─ Reads config                                         │
│     ├─ Tracks listener position                             │
│     └─ Updates gain nodes every frame                       │
└─────────────────────────────────────────────────────────────┘
```

---

## 💻 Implementation Details

### **Class: DistanceEnvelopeExecutor**

**Location:** `spatial_audio_app.js`

**Properties:**
```javascript
class DistanceEnvelopeExecutor {
    constructor(spec, sounds, audioEngine, listener) {
        this.spec = spec;           // Behavior config
        this.sounds = sounds;       // Array of Sound objects
        this.engine = audioEngine;  // SpatialAudioEngine
        this.listener = listener;   // Listener object
        
        // Config with defaults
        this.enterAttack = spec.config.enterAttack || 10;
        this.sustainVolume = spec.config.sustainVolume ?? 0.8;
        this.exitDecay = spec.config.exitDecay || 10;
        this.curve = spec.config.curve || 'exponential';
        
        // State tracking
        this.lastGainValues = new Map();
    }
}
```

**Methods:**

| Method | Purpose | Returns |
|--------|---------|---------|
| `update()` | Called every frame to update all sound gains | `void` |
| `_calculateGain(distance, radius)` | Compute volume based on distance | `number` (0-1) |
| `_applyCurve(t, curve)` | Apply curve shaping to interpolation | `number` (0-1) |
| `_getDistance(sound)` | Calculate distance from listener to sound | `number` (meters) |
| `_applyGain(sound, targetGain)` | Smoothly apply gain change | `void` |
| `start()` | Initialize behavior when soundscape starts | `void` |
| `stop()` | Fade out all sounds when soundscape stops | `void` |

---

### **Volume Calculation Algorithm**

```javascript
_calculateGain(distance, radius) {
    // Outside activation radius = silent
    if (distance >= radius) {
        return 0;
    }
    
    // Distance from edge (0 = at edge, radius = at center)
    const distanceFromEdge = radius - distance;
    
    // ENTER ATTACK ZONE (fade in from edge)
    if (distanceFromEdge < this.enterAttack) {
        const t = distanceFromEdge / this.enterAttack;
        return this._applyCurve(t, this.curve) * this.sustainVolume;
    }
    
    // SUSTAIN ZONE (constant volume)
    if (distanceFromEdge < (radius - this.exitDecay)) {
        return this.sustainVolume;
    }
    
    // EXIT DECAY ZONE (fade out toward center)
    const distanceFromCenter = distance;
    const t = 1 - (distanceFromCenter / this.exitDecay);
    return this._applyCurve(t, this.curve) * this.sustainVolume;
}
```

**Curve Functions:**

```javascript
_applyCurve(t, curve) {
    switch (curve) {
        case 'exponential':
            // Slower start, faster end (gentle fade-in)
            return Math.pow(t, 2);
            
        case 'logarithmic':
            // Faster start, slower end (sharp fade-in)
            return Math.log(1 + (9 * t)) / Math.log(10);
            
        case 'linear':
        default:
            // Straight line (50% distance = 50% volume)
            return t;
    }
}
```

---

### **Curve Shape Comparison**

| Distance | Linear | Exponential | Logarithmic |
|----------|--------|-------------|-------------|
| 0% | 0% | 0% | 0% |
| 25% | 25% | 6% | 52% |
| 50% | 50% | 25% | 78% |
| 75% | 75% | 56% | 91% |
| 100% | 100% | 100% | 100% |

**Visual:**
```
Volume
  ↑
1.0 │        ┌── Exponential (gentle start)
    │      ╱│
0.8 │    ╱  │
    │   ╱   ├── Linear (straight)
0.6 │  ╱    │
    │ ╱    ╱└── Logarithmic (sharp start)
0.4 │╱    ╱
    │    ╱
0.2 │  ╱
    │╱
0.0 └─────────────────→ Distance
    0   50   100%
```

---

## 🎛️ User Interface

### **Editor Controls (map_editor.html)**

**Location:** Waypoint edit modal → "Distance Envelope" section

**Controls:**

```html
<div id="envelopeControls">
    <h4>📈 Distance Envelope</h4>
    
    <!-- Enter Attack -->
    <label>Enter Attack (meters): <span id="enterAttackValue">10</span>m</label>
    <input type="range" id="enterAttack" min="0" max="50" value="10">
    <small>Fade in over this distance from edge</small>
    
    <!-- Sustain Volume -->
    <label>Sustain Volume: <span id="sustainVolumeValue">0.8</span></label>
    <input type="range" id="sustainVolume" min="0" max="1" step="0.05" value="0.8">
    <small>Volume while inside activation zone</small>
    
    <!-- Exit Decay -->
    <label>Exit Decay (meters): <span id="exitDecayValue">10</span>m</label>
    <input type="range" id="exitDecay" min="0" max="50" value="10">
    <small>Fade out over this distance from center</small>
    
    <!-- Curve Shape -->
    <label>Curve Shape:</label>
    <select id="envelopeCurve">
        <option value="linear">Linear (straight line)</option>
        <option value="exponential" selected>Exponential (slower start)</option>
        <option value="logarithmic">Logarithmic (faster start)</option>
    </select>
    
    <!-- Visual Preview -->
    <canvas id="envelopePreview" width="300" height="100"></canvas>
    <small>Volume curve preview</small>
</div>
```

**Preview Canvas:**
- Real-time visualization of volume curve
- X-axis: Distance from center (0m → radius)
- Y-axis: Volume (0% → 100%)
- Updates as sliders are adjusted

---

## 🔄 Integration with Existing Systems

### **BehaviorExecutor Factory**

```javascript
// spatial_audio_app.js
class BehaviorExecutor {
    static create(spec, sounds, audioEngine, listener) {
        switch (spec.type) {
            case 'distance_envelope':
                return new DistanceEnvelopeExecutor(spec, sounds, audioEngine, listener);
            
            case 'tempo_sync':
                return new TempoSyncExecutor(spec, sounds, audioEngine);
            
            case 'time_sync':
                return new TimeSyncExecutor(spec, sounds, audioEngine);
            
            default:
                return new DefaultExecutor(spec, sounds, audioEngine);
        }
    }
}
```

### **Update Loop Integration**

```javascript
// spatial_audio_app.js - _updateSoundPositions()
_updateSoundPositions() {
    // ... update listener position ...
    // ... update sound positions ...
    
    // NEW: Update behavior executors
    if (this.activeBehaviors) {
        this.activeBehaviors.forEach(executor => {
            if (executor.update) {
                executor.update();  // Calls DistanceEnvelopeExecutor.update()
            }
        });
    }
    
    // Fallback: Default distance fade for sounds without behaviors
    this.sounds.forEach(sound => {
        if (sound.isLoaded && !sound.isDisposed && !this._soundHasBehavior(sound.id)) {
            // ... apply default linear fade ...
        }
    });
}
```

---

## 📊 Performance Characteristics

### **CPU Usage**

| Scenario | CPU Impact |
|----------|-----------|
| **Idle (no movement)** | ~0.1% (gain calculations only) |
| **Walking (10 sounds)** | ~0.5% (10 gain updates/frame) |
| **Walking (50 sounds)** | ~2% (50 gain updates/frame) |

**Why so efficient?**
- No audio processing (just gain automation)
- Simple math (distance calculation + curve function)
- No Web Audio API node creation/destruction

### **Memory Usage**

| Component | Memory |
|-----------|--------|
| Executor instance | ~100 bytes |
| Per-sound state | ~50 bytes |
| **Total (50 sounds)** | **~2.6 KB** |

**Comparison:**
- Audio effect (reverb): ~5-10 MB + 5-10% CPU
- Distance envelope behavior: ~2.6 KB + ~2% CPU

---

## 🧪 Testing Protocol

### **1. Simulator Test (Desktop)**

```javascript
// Open map_editor.html
// 1. Place waypoint with 50m activation radius
// 2. Add distance_envelope behavior:
//    - enterAttack: 10m
//    - sustainVolume: 0.8
//    - exitDecay: 10m
//    - curve: exponential
// 3. Start simulation (drag avatar)
// 4. Drag avatar from edge to center
// 5. Watch debug log for gain values
```

**Expected Debug Output:**
```
[DistanceEnvelope] Distance: 50m → Gain: 0.00
[DistanceEnvelope] Distance: 45m → Gain: 0.08
[DistanceEnvelope] Distance: 40m → Gain: 0.80
[DistanceEnvelope] Distance: 30m → Gain: 0.80
[DistanceEnvelope] Distance: 10m → Gain: 0.80
[DistanceEnvelope] Distance: 5m  → Gain: 0.40
[DistanceEnvelope] Distance: 0m  → Gain: 0.00
```

### **2. Field Test (Phone)**

```
1. Open map_player.html
2. Select soundscape with distance_envelope behavior
3. Tap Start
4. Walk toward waypoint from edge
5. Listen for:
   - Silence until entering activation radius
   - Smooth fade-in over first 10m
   - Consistent volume while walking around inside
   - Smooth fade-out as approaching center
```

**Success Criteria:**
- ✅ No volume "pops" or clicks during transitions
- ✅ Sustain volume matches setting (e.g., 80%)
- ✅ Fade-in/fade-out distances feel natural
- ✅ Curve shape is audible (exponential = gentler fade)

---

## 🎯 Use Cases

### **Use Case 1: Sound Walk Installation**

**Scenario:** 10 waypoints along a walking path, each telling a story segment

**Configuration:**
```javascript
{
    enterAttack: 5,      // Quick fade-in (5m)
    sustainVolume: 0.9,  // Loud and clear while inside
    exitDecay: 15,       // Slow fade-out (15m) - lets story finish as you walk away
    curve: 'logarithmic' // Fast attack - voice is clear immediately
}
```

**Experience:**
- As you approach story waypoint, voice fades in quickly
- Voice stays loud and clear while you're in the zone
- As you walk past, voice fades slowly (you can still hear it finishing)

---

### **Use Case 2: Ambient Sound Bubble**

**Scenario:** Create a "sound bubble" - full volume in center, silent outside

**Configuration:**
```javascript
{
    enterAttack: 20,     // Long fade-in (20m)
    sustainVolume: 0.6,  // Moderate volume
    exitDecay: 2,        // Sharp fade-out (2m)
    curve: 'exponential' // Gentle approach, abrupt end
}
```

**Experience:**
- Sound gradually appears as you approach
- Full volume in center area
- Abrupt silence when you step out (creates clear boundary)

---

### **Use Case 3: Whisper Zone**

**Scenario:** Quiet sound at center, gets louder as you move away (reverse psychology)

**Configuration:**
```javascript
{
    enterAttack: 5,      // Quick fade-in from edge
    sustainVolume: 0.3,  // Quiet at edge
    exitDecay: 45,       // Long fade-out toward center
    curve: 'linear'
}
```

**Experience:**
- Sound is audible at edge (30% volume)
- Gets quieter as you approach center
- Nearly silent at center (creates "quiet core")

---

## 🔧 Configuration Presets

**Quick-start presets for common scenarios:**

| Preset | Enter Attack | Sustain | Exit Decay | Curve | Use Case |
|--------|-------------|---------|------------|-------|----------|
| **Voice Narration** | 5m | 0.9 | 15m | Logarithmic | Clear speech, slow fade-out |
| **Ambient Bubble** | 20m | 0.6 | 2m | Exponential | Sound bubble effect |
| **Sharp Boundary** | 2m | 0.8 | 2m | Linear | Clear on/off zones |
| **Gentle Fade** | 15m | 0.7 | 15m | Exponential | Smooth transitions |
| **Reverse Psychology** | 5m | 0.3 | 45m | Linear | Quiet center, loud edge |

**Using Presets:**
```javascript
// In editor UI - Add preset selector
<select id="envelopePreset">
    <option value="custom">Custom...</option>
    <option value="voice">Voice Narration</option>
    <option value="bubble">Ambient Bubble</option>
    <option value="sharp">Sharp Boundary</option>
    <option value="gentle">Gentle Fade</option>
</select>

// On change, populate sliders
document.getElementById('envelopePreset').addEventListener('change', (e) => {
    const preset = PRESETS[e.target.value];
    if (preset) {
        document.getElementById('enterAttack').value = preset.enterAttack;
        document.getElementById('sustainVolume').value = preset.sustainVolume;
        document.getElementById('exitDecay').value = preset.exitDecay;
        document.getElementById('envelopeCurve').value = preset.curve;
        drawEnvelopePreview();
    }
});
```

---

## 🐛 Known Limitations

| Limitation | Impact | Workaround |
|------------|--------|------------|
| **Distance-only** | Can't create time-based effects (e.g., fade in over 5 seconds after entering) | Combine with time-based behavior in future |
| **Single sustain level** | Can't create volume swells inside zone | Use multi-point envelope (future enhancement) |
| **No direction detection** | Same fade whether approaching or leaving | Add velocity-based detection (future) |
| **Per-behavior, not per-sound** | All sounds in behavior share same envelope | Create separate behavior per sound if needed |

---

## 🚀 Future Enhancements

### **Phase 2: Multi-Point Envelope**

Allow custom volume curve with multiple control points:

```javascript
{
    type: 'distance_envelope_v2',
    config: {
        points: [
            { distance: 0, volume: 0 },    // Silent at center
            { distance: 10, volume: 0.5 }, // 50% at 10m
            { distance: 30, volume: 1.0 }, // Full at 30m
            { distance: 50, volume: 0 }    // Silent at edge
        ],
        interpolation: 'smooth'
    }
}
```

**Use Case:** Create "volume wells" - loud ring at specific distance, quiet elsewhere.

---

### **Phase 3: Velocity-Based Envelope**

Detect if listener is moving toward or away from sound:

```javascript
{
    type: 'distance_envelope_v3',
    config: {
        enterAttack: 10,
        exitDecay: 10,
        approachBoost: 1.2,    // 20% louder when approaching
        retreatCut: 0.8        // 20% quieter when retreating
    }
}
```

**Use Case:** Doppler-like effect - sounds louder as you approach, quieter as you leave.

---

### **Phase 4: Directional Envelope**

Different fade curves for different approach angles:

```javascript
{
    type: 'directional_envelope',
    config: {
        north: { attack: 5, decay: 10 },
        south: { attack: 15, decay: 5 },
        east: { attack: 10, decay: 10 },
        west: { attack: 10, decay: 10 }
    }
}
```

**Use Case:** Sound "spills out" more in one direction (e.g., along a path).

---

## 📚 Related Documentation

| Document | Purpose |
|----------|---------|
| `LAZY_LOADING_SPECIFICATION.md` | Sound loading/unloading zones |
| `FEATURE_14_DISTANCE_BASED_AUDIO.md` | Air absorption filter (high-frequency loss) |
| `LISTENER_DRIFT_COMPENSATION.md` | GPS noise smoothing |
| `SOUND_BEHAVIOR_ARCHITECTURE.md` | Behavior system overview |

---

## 📝 Implementation Checklist

### **Phase 1: Core Implementation**

- [ ] Add `DistanceEnvelopeExecutor` class to `spatial_audio_app.js`
- [ ] Register with `BehaviorExecutor.create()` factory
- [ ] Add `update()` call to `_updateSoundPositions()` loop
- [ ] Add behavior validation to `api/models/Behavior.js`

### **Phase 2: Editor UI**

- [ ] Add envelope controls to `map_editor.html` waypoint modal
- [ ] Add canvas preview visualization
- [ ] Add preset selector dropdown
- [ ] Add slider value displays

### **Phase 3: Persistence**

- [ ] Add envelope config to waypoint JSON export
- [ ] Add envelope config to server save/load
- [ ] Update `api/models/Waypoint.js` validation

### **Phase 4: Testing**

- [ ] Desktop simulator test (drag avatar, verify gain values)
- [ ] Mobile field test (walk toward waypoint, listen)
- [ ] CPU/memory profiling (ensure <2% CPU impact)
- [ ] Cross-browser testing (Chrome, Firefox, Safari)

---

## 🎓 Glossary

| Term | Definition |
|------|------------|
| **Enter Attack** | Distance from edge over which sound fades in |
| **Sustain Volume** | Volume level while inside activation zone |
| **Exit Decay** | Distance from center over which sound fades out |
| **Curve** | Shape of volume transition (linear, exponential, logarithmic) |
| **Activation Radius** | Total radius of sound's influence zone |
| **Gain Node** | Web Audio API node that controls volume |

---

## ✅ Success Criteria

| Criterion | How to Verify |
|-----------|---------------|
| **Smooth transitions** | No clicking/popping during volume changes |
| **Configurable fade distances** | Sliders adjust attack/decay zones |
| **Curve shaping audible** | Exponential vs logarithmic sound different |
| **Mobile performance** | <2% CPU impact on phone |
| **Visual preview accurate** | Canvas matches actual volume curve |
| **Persistence works** | Envelope saved/loaded with soundscape |
| **Multiple waypoints** | Each can have independent envelope |

---

**Last Updated:** 2026-03-19  
**Author:** Qwen Code  
**Status:** Ready for implementation
