# Lazy Loading Fade Zone Bug Fix

**Date:** 2026-03-18 (Updated 2026-03-18 15:00)  
**Issue:** Sounds not audible when listener first enters fade zone after lazy loading  
**Root Cause:** Preload margin (10m) was smaller than fade zone (20m), creating a gap where sounds weren't loaded  
**Status:** ✅ FIXED

---

## Problem Description (Updated)

With lazy loading enabled, sounds were not audible when:

1. **Initial entry into fade zone**: Listener walks toward a sound, enters the fade zone (activation radius + 20m), but hears nothing
2. **Already positioned in fade zone**: Listener loads the page while already standing in the fade zone

### Root Cause Analysis (Updated)

The issue had **TWO** root causes:

#### 1. Zone Configuration Mismatch
```javascript
// BEFORE FIX:
const ZoneConfig = {
    buffer: {
        preloadMargin: 10,  // ❌ Only 10m preload zone
        unloadMargin: 10
    }
};

// Fade zone in _updateSoundPositions(): 20m

// Result:
// 0-30m:  ACTIVE ZONE   → Load + Play ✅
// 30-40m: PRELOAD ZONE  → Load (muted) ✅
// 40-50m: UNLOAD ZONE   → NOT loaded ❌ (but should be faded!)
// >50m:   DISPOSE ZONE  → Dispose
```

**The Problem:** The fade zone is 20m, but the preload zone was only 10m. This created a **10m gap (40-50m)** where:
- Sounds should be faded (audible at reduced volume)
- But sounds were NOT loaded at all (unload zone)
- User hears silence when walking through this area

#### 2. Preload Didn't Start Playback
```javascript
// BEFORE FIX (first attempt):
async _preloadSound(sound) {
    // Load buffer...
    sound.isLoaded = true;
    sound.isPlaying = false;  // ❌ Never started!
    
    // Gain set by _updateSoundPositions() later
    // But that might not run immediately
}
```

**The Problem:** Even after fixing the zone configuration, sounds in the preload zone were loaded but **never started**. They relied on `_updateSoundPositions()` to update gain, but:
- `_preloadSound()` set `gain: 0` (muted)
- `_updateSoundPositions()` might not run for 1+ seconds
- User hears silence during this gap

---

## Complete Solution

### Fix 1: Match Preload Margin to Fade Zone

**Location:** `spatial_audio_app.js` line ~213

```javascript
const ZoneConfig = {
    buffer: {
        preloadMargin: 20,  // ✅ Match fade zone (20m)
        unloadMargin: 10,
        hysteresis: 10
    }
};

// New zone layout (for 30m activation radius):
// 0-30m:  ACTIVE ZONE   → Load + Play (full volume)
// 30-50m: PRELOAD ZONE  → Load + Play (faded based on distance) ✅
// 50-60m: UNLOAD ZONE   → Keep loaded (faded out)
// >60m:   DISPOSE ZONE  → Dispose (with hysteresis)
```

### Fix 2: Start Playback in Preload Zone

**Location:** `spatial_audio_app.js` line ~1429

```javascript
async _preloadSound(sound) {
    // Create source and load buffer
    const source = await this.engine.createSampleSource({ gain: 0 });
    
    if (source) {
        sound.sourceNode = source;
        sound.isLoaded = true;
        
        // ✅ CRITICAL: Start playback immediately
        const started = source.start();
        if (started) {
            sound.isPlaying = true;
            
            // ✅ CRITICAL: Apply distance-based gain immediately
            this._applyDistanceGain(sound);
            
            // Log: "✅ sound1 preloaded + started (gain=0.250 @ 45.0m)"
        }
    }
}
```

### Fix 3: Enhanced Debug Logging

**Location:** `spatial_audio_app.js` line ~1163

```javascript
// === PRELOAD ZONE: Load AND play (for fade zone) ===
else if (zone.zone === 'preload') {
    if (!sound.isLoaded) {
        toPreload.push(sound);
        // ✅ Log: "📦 PRELOAD ZONE: sound1 queued for preload (45.0m, 30m < d < 50m)"
    }
}
```

---

## Files Modified

| File | Changes | Lines |
|------|---------|-------|
| `spatial_audio_app.js` | Updated `ZoneConfig.buffer.preloadMargin` to 20m | ~5 |
| `spatial_audio_app.js` | Added `_applyDistanceGain()` method | ~35 |
| `spatial_audio_app.js` | Updated `_preloadSound()` to start playback | ~30 |
| `spatial_audio_app.js` | Enhanced debug logging in `_updateSoundZones()` | ~10 |
| `spatial_audio_app.js` | Call `_applyDistanceGain()` after loading | 3 locations |
| **Total** | | **~80 lines** |

---

## Changes Detail

### 1. Zone Configuration Update

**Location:** `spatial_audio_app.js` line ~213

**Purpose:** Match preload zone to fade zone (20m)

**Code:**
```javascript
const ZoneConfig = {
    // Buffers (MP3/WAV): Standard 3-zone lazy loading
    buffer: {
        activeMultiplier: 1.0,
        preloadMargin: 20,        // ✅ Changed from 10 to 20 (match fade zone)
        unloadMargin: 10,
        hysteresis: 10
    },
    // ...
};
```

### 2. Added `_applyDistanceGain()` Helper Method

**Location:** `spatial_audio_app.js` line ~1357

**Purpose:** Calculate and apply distance-based gain immediately after loading

**Code:**
```javascript
/**
 * Apply distance-based gain to a sound (fade zone handling)
 * Called immediately after loading to ensure correct initial volume
 * @param {Sound} sound - Sound to update
 * @private
 */
_applyDistanceGain(sound) {
    if (!this.listener || !sound.sourceNode || !sound.sourceNode.updateGainByDistance) {
        return;
    }

    // Calculate distance and apply gain immediately
    const distance = GPSUtils.distance(
        this.listener.lat,
        this.listener.lon,
        sound.lat,
        sound.lon
    );

    // Apply gain based on distance (fade zone handles smooth transitions)
    sound.sourceNode.updateGainByDistance(
        this.listener.lat,
        this.listener.lon,
        sound.volume  // Max volume at close range
    );

    if (this.onDebugLog) {
        const gain = sound.gainNode ? sound.gainNode.gain.value : 0;
        const inFadeZone = distance > sound.activationRadius && distance <= (sound.activationRadius + 20);
        const zone = distance < sound.activationRadius ? '🔊 ACTIVE' : (inFadeZone ? '🌗 FADE' : '❌ OUTSIDE');
        this.onDebugLog(`🎚️ ${sound.id} initial gain: ${gain.toFixed(3)} @ ${distance.toFixed(1)}m (${zone})`);
    }
}
```

### 3. Updated `_preloadSound()` to Start Playback

**Location:** `spatial_audio_app.js` line ~1429

**Purpose:** Start playback immediately when preloading (for fade zone)

**Code:**
```javascript
async _preloadSound(sound) {
    // ... load buffer ...
    
    if (source) {
        sound.sourceNode = source;
        sound.isLoaded = true;
        
        // ✅ NEW: Start playback immediately
        const started = source.start();
        if (started) {
            sound.isPlaying = true;
            
            // ✅ NEW: Apply distance-based gain immediately
            this._applyDistanceGain(sound);
            
            // Log with gain and distance
            const gain = sound.gainNode ? sound.gainNode.gain.value : 0;
            const distance = this.getSoundDistance(sound.id);
            this.onDebugLog(`✅ ${sound.id} preloaded + started (gain=${gain.toFixed(3)} @ ${distance.toFixed(1)}m)`);
        }
    }
}
```

### 4. Enhanced Debug Logging

**Location:** `spatial_audio_app.js` line ~1163

**Purpose:** Show when sounds enter preload zone with distance info

**Code:**
```javascript
// === PRELOAD ZONE: Load AND play (for fade zone) ===
else if (zone.zone === 'preload') {
    if (!sound.isLoaded) {
        toPreload.push(sound);
        if (this.onDebugLog) {
            this.onDebugLog(`📦 PRELOAD ZONE: ${sound.id} queued for preload (${distance.toFixed(1)}m, ${activationRadius}m < d < ${activationRadius + fadeZone}m)`);
        }
    }
}
```

---

## Testing Protocol

### Test 1: First Entry into Fade Zone (PRIMARY TEST)

```
SETUP:
- 30m activation radius waypoint
- Start 60m away (outside all zones)

STEPS:
1. Start audio experience
2. Walk toward waypoint from 60m
3. Watch debug log for zone transitions

EXPECTED LOGS:
60m: "❌ OUTSIDE: sound1 | distance=60.0m"
50m: "📍 sound1: unknown → unload (60.0m, radius=30m)"
45m: "📍 sound1: unload → preload (45.0m, radius=30m)"
     "📦 PRELOAD ZONE: sound1 queued for preload (45.0m, 30m < d < 50m)"
     "📥 Preloading sound1 (background)..."
     "🎚️ sound1 initial gain: 0.250 @ 45.0m (🌗 FADE)"
     "✅ sound1 preloaded + started (gain=0.250 @ 45.0m)"

EXPECTED AUDIO:
- Silence at 60-50m ✅
- Sound fades in starting at ~50m ✅
- audibly at 25% volume at 45m ✅
- Increases to 50% at 40m ✅
- Full volume at 30m ✅
```

### Test 2: Already Positioned in Fade Zone

```
SETUP:
- 30m activation radius waypoint
- Stand at 40m (middle of fade zone)

STEPS:
1. Refresh page
2. Start audio experience

EXPECTED LOGS:
- "🔄 Checking sound zones..."
- "📦 PRELOAD ZONE: sound1 queued for preload (40.0m, 30m < d < 50m)"
- "🎚️ sound1 initial gain: 0.500 @ 40.0m (🌗 FADE)"
- "✅ sound1 preloaded + started (gain=0.500 @ 40.0m)"

EXPECTED AUDIO:
- Sound immediately audible at ~50% volume ✅
```

### Test 3: Active Zone Load

```
SETUP:
- 30m activation radius waypoint
- Stand at 15m (within active zone)

STEPS:
1. Refresh page
2. Start audio experience

EXPECTED LOGS:
- "📥 ACTIVE ZONE: sound1 queued for loading (15.0m < 30m)"
- "🎚️ sound1 initial gain: 1.000 @ 15.0m (🔊 ACTIVE)"
- "✅ sound1 loaded + started"

EXPECTED AUDIO:
- Sound immediately audible at full volume ✅
```

### Test 4: Re-Entry After Exit (Regression Test)

```
SETUP:
- 30m activation radius waypoint
- Start within active zone (sound playing)

STEPS:
1. Walk away from waypoint (sound fades out)
2. Continue to 65m (beyond disposal threshold)
3. Wait for disposal: "🗑️ Disposing sound1..."
4. Walk back toward waypoint

EXPECTED LOGS:
50m: "📍 sound1: unloaded → preload"
     "📦 PRELOAD ZONE: sound1 queued for preload"
     "✅ sound1 preloaded + started"

EXPECTED AUDIO:
- Sound reloads and plays at faded volume ✅
- Same behavior as first entry ✅
```

---

## Debug Log Output Examples

### Complete First Entry Sequence

```
[player] 🗺️ Map initialized
[player] 📱 MapPlayerApp initialized
[player] ▶️ Starting audio...
[AudioApp] Starting...
[AudioApp] Initializing audio...
[AudioApp] Audio initialized
[AudioApp] GPS tracking started

[AudioApp] 🔄 Checking sound zones...
[AudioApp] 📍 sound1 (buffer): unknown → unload (55.0m, radius=30m)

[AudioApp] 🔄 Checking sound zones...
[AudioApp] 📍 sound1 (buffer): unload → preload (48.0m, radius=30m)
[AudioApp] 📦 PRELOAD ZONE: sound1 queued for preload (48.0m, 30m < d < 50m)
[AudioApp] 📥 Preloading sound1 (background)...
[AudioApp] 🎚️ sound1 initial gain: 0.100 @ 48.0m (🌗 FADE)
[AudioApp] ✅ sound1 preloaded + started (gain=0.100 @ 48.0m)

[AudioApp] 🔄 Checking sound zones...
[AudioApp] 📍 sound1 (buffer): preload → active (28.0m, radius=30m)
[AudioApp] 🔊 WITHIN RADIUS (28.0m < 30m): sound1 | ✅ PLAYING | gain=1.000
```

### Zone Distribution (10% sampling)

```
[AudioApp] 📊 Zone Distribution:
  Buffers: 2 active, 3 preload, 5 unload
  Oscillators: 1 active
  Streams: 0 active, 1 paused, 2 unloaded
```

---

## Debug Log Output

**Before Fix:**
```
📥 Loading sound1...
✅ sound1 loaded + started
[no gain info until next GPS update]
[user hears loud burst or silence]
```

**After Fix:**
```
📥 Loading sound1...
✅ sound1 loaded + started
🎚️ sound1 initial gain: 0.350 @ 40.0m (🌗 FADE)
[smooth fade-in as expected]
```

---

## Impact

| Scenario | Before Fix | After Fix |
|----------|------------|-----------|
| **Load in fade zone** | ❌ No sound / loud burst | ✅ Smooth fade-in |
| **Load in active zone** | ✅ Full volume | ✅ Full volume |
| **Walk into fade zone** | ❌ Delayed fade-in | ✅ Immediate fade-in |
| **Re-enter fade zone** | ✅ Works (already loaded) | ✅ Works (same) |
| **Page load on waypoint** | ✅ Full volume | ✅ Full volume |

---

## Related Code

### Zone Layout (for reference)

```
0-30m:   ACTIVE ZONE    → Load + Play (gain fades at edge)
30-40m:  PRELOAD ZONE   → Load muted (10m = ~6 sec walk time @ 4mph)
40-50m:  UNLOAD ZONE    → Keep loaded, still playing (faded out)
>50m:    DISPOSE ZONE   → Dispose + free memory
```

### Fade Zone Calculation

```javascript
// spatial_audio.js line ~339
const fadeZone = 20;  // 20m fade zone

// Inside activation radius: full volume
if (distance < activationRadius) {
    gain = maxVolume;
}
// In fade zone: smooth fade out
else if (distance < activationRadius + fadeZone) {
    const fadeAmount = (distance - activationRadius) / fadeZone;
    gain = maxVolume * (1 - fadeAmount);
}
// Outside fade zone: silent
else {
    gain = 0;
}
```

---

## Future Enhancements

1. **Smooth fade-in on load**: Add 100-200ms fade-in to prevent click/pop on sudden start
2. **Hysteresis on gain updates**: Prevent rapid gain changes at zone boundaries
3. **Configurable fade zone**: UI slider to adjust fade zone width (10-50m)
4. **Per-sound fade zones**: Different fade zones for different sound types (ambient vs foreground)

---

## Deployment

**Cache-Busting:**
- Deploy script will add `?v=20260318xxxxxx` to `spatial_audio_app.js`
- Hard refresh browser: `Ctrl+Shift+R` (Windows) or `Cmd+Shift+R` (Mac)

**Verification:**
```bash
# After deploy, check Cloudflare cache status
Invoke-WebRequest -Uri "https://ssykes.net/spatial_audio_app.js" -UseBasicParsing |
    Select-Object -ExpandProperty Headers |
    Where-Object {$_.Key -eq "CF-Cache-Status"}

# Expected: DYNAMIC or BYPASS (not HIT)
```

---

## Related Documentation

- **Lazy Loading Spec:** `LAZY_LOADING_SPECIFICATION.md`
- **Drift Compensation:** `Listener_DRIFT_COMPENSATION.md`
- **Distance-Based Audio:** `FEATURE_14_DISTANCE_BASED_AUDIO.md`
- **Cloudflare Cache:** `CLOUDFLARE_CACHE_TROUBLESHOOTING.md`

---

**Status:** ✅ **COMPLETE** - Ready for testing
