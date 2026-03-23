# Simulator Behavior Support Fix

## Problem

The map_editor simulator was **NOT** using the behavior system, so envelope configs and other behaviors were not being applied during simulation.

### Root Cause

`_startSimAudio()` in `map_shared.js` was calling `app.start()` instead of `app.startSoundScape()`:

```javascript
// OLD CODE - No behavior support
this.app.start().then(() => {
    console.log('[MapShared] ✅ Simulation audio started');
    // ... behaviors NOT executed!
});
```

## Solution

### Change 1: Updated `_startSimAudio()` to use `startSoundScape()`

**File:** `map_shared.js` line 1751-1778

```javascript
// NEW CODE - Full behavior support
const soundscape = this.getActiveSoundscape();
if (soundscape && soundscape.behaviors && soundscape.behaviors.length > 0) {
    // Sync behaviors from waypoints with envelopeConfig
    this._syncBehaviorsFromWaypoints(soundscape);
    
    this.app.startSoundScape(soundscape).then(() => {
        console.log('[MapShared] ✅ Simulation audio started with behaviors');
        // ... behaviors ARE executed!
    });
} else {
    // No behaviors - start normally
    this.app.start().then(() => {
        console.log('[MapShared] ✅ Simulation audio started');
    });
}
```

### Change 2: Added `start()` method to `DistanceBasedEffect`

**File:** `soundscape.js` line 866-875

The `startSoundScape()` method calls `executor.start()` on all behavior executors, but `DistanceBasedEffect` (parent of `DistanceEnvelopeExecutor`) didn't have a `start()` method.

```javascript
/**
 * Start the effect (initialize state)
 * Called when soundscape starts
 */
start() {
    console.log(`[DistanceBasedEffect] Starting ${this.spec.type} for ${this.sounds.length} sound(s)`);
    // Clear any cached state
    this._distanceCache.clear();
    this._state = new WeakMap();
    this._lastListenerPos = null;
}
```

## What Changed

| File | Method | Change |
|------|--------|--------|
| `map_shared.js` | `_startSimAudio()` | Check for behaviors, call `startSoundScape()` if available |
| `soundscape.js` | `DistanceBasedEffect.start()` | **Added** - initialize effect state |

## Testing

Now you can test envelope configs in the simulator:

1. **Open `map_editor.html`**
2. **Create/edit a waypoint**
3. **Click the envelope icon** to set envelope config:
   - `enterAttack`: 10m
   - `sustainVolume`: 0.5
   - `exitDecay`: 5m
   - `curve`: exponential
4. **Save the waypoint**
5. **Click "🎮 Simulate"** button
6. **Drag the avatar** toward the waypoint
7. **Watch the volume** change according to your envelope!

### Expected Behavior

As you drag the avatar:

| Distance | Zone | Volume |
|----------|------|--------|
| > 30m | Outside | 0% (silent) |
| 20-30m | Enter Attack | 0% → 50% (fade in) |
| 5-20m | Sustain | 50% (constant) |
| 0-5m | Exit Decay | 50% → 0% (fade out) |

### Console Output

You should see:
```
[MapShared] 🎼 Starting with 1 behavior(s)
[DistanceEnvelopeExecutor] Created for sounds: wp1 | Config: {"enterAttack":10,"sustainVolume":0.5,"exitDecay":5,"curve":"exponential"}
[DistanceEnvelope] wp1: gain=0.500 (sustain=0.5), attack=10m, decay=5m
```

## Benefits

- ✅ Test envelope configs without GPS
- ✅ Test all behavior types (tempo_sync, time_sync, reverb_group, etc.)
- ✅ Quick iteration on envelope settings
- ✅ No need to physically walk during development

## Version

This fix will be included in the next deploy version.
