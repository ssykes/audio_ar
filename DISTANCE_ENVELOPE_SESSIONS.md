# Distance Envelope - Implementation Sessions

**Parent Document:** `DISTANCE_ENVELOPE_BEHAVIOR.md` (v4.0)
**Created:** 2026-03-22
**Status:** 📋 Ready to Start

---

## 📋 Overview

This document breaks down the **Distance Envelope** feature (Feature 17) into discrete, testable implementation sessions.

**Reference:** All implementation details are in [`DISTANCE_ENVELOPE_BEHAVIOR.md`](./DISTANCE_ENVELOPE_BEHAVIOR.md). Use that document for:
- Architecture diagrams
- Class specifications
- Code examples
- Visual representations
- Full checklist

---

## 📊 Session Summary Table

| Session | Phase | Focus | Time | Risk | Standalone? |
|---------|-------|-------|------|------|-------------|
| [**1A**](#session-1a---base-class--utilities) | 1 (split) | `DistanceBasedEffect` base class + `DistanceEffectCurves` utility | 45-60 min | None | ✅ Yes |
| [**1B**](#session-1b---integration) | 1 (split) | `BehaviorExecutor.create()`, `SpatialAudioApp` updates | 45-60 min | Low | ✅ Yes (with 1A) |
| [**2**](#session-2---distance-envelope-executor) | 2 | `DistanceEnvelopeExecutor` class | 30-45 min | Low | ✅ Yes (with 1A/B) |
| [**3**](#session-3---preset-system--canvas-preview) | 3 | Preset system + canvas preview visualization | 45-60 min | None | ✅ Yes (with 2) |
| [**4**](#session-4---editor-ui) | 4 | Waypoint modal controls, sliders, behavior creation | 45-60 min | Low | ✅ Yes (with 3) |
| [**5**](#session-5---persistence) | 5 | JSON export, server save/load, validation schema | 30-45 min | None | ✅ Yes (with 4) |
| [**6A**](#session-6a---desktop-testing) | 6 (split) | Desktop simulator test | 30 min | None | ✅ Yes |
| [**6B**](#session-6b---mobile-field-testing) | 6 (split) | Mobile field test | 30 min | None | ✅ Yes |
| [**6C**](#session-6c---performance--memory) | 6 (split) | CPU/memory profiling, cross-browser | 30 min | None | ✅ Yes |
| [**7A+**](#session-7---future-effects-optional) | 7 | DistanceReverb, DistanceFilter, DistanceDetune | 30-45 min each | Low | ✅ Yes (optional) |

**Total Estimated Time:** ~6-8 hours (core feature), +2-3 hours (testing), +optional (future effects)

---

## 🎯 Session Details

### Session 1A - Base Class + Utilities

**Goal:** Create reusable base class for all distance-based effects

**Files to Modify:**
- `soundscape.js` - Add `DistanceBasedEffect` class + `DistanceEffectCurves` utility

**Tasks:**
1. Add `DistanceBasedEffect` base class (~120 lines)
   - Config validation (`_validateConfig()`)
   - Distance caching (`_distanceCache`, `_checkListenerMovement()`)
   - State management (`WeakMap`, `_applySmoothing()`)
   - Lifecycle methods (`update()`, `stop()`)
2. Add `DistanceEffectCurves` utility module
   - `apply()` - curve shaping (linear/exponential/logarithmic/easeInOut)
   - `lerp()` - linear interpolation
   - `clamp()` - value clamping

**Reference:** `DISTANCE_ENVELOPE_BEHAVIOR.md` → Section "Base Class: DistanceBasedEffect"

**Verification:**
```javascript
// Test in browser console
const test = new DistanceBasedEffect({config: {}, memberIds: []}, [], engine, listener);
console.log(test._checkListenerMovement); // Should exist
console.log(DistanceEffectCurves.apply(0.5, 'exponential')); // Should return 0.25
```

**Exit Criteria:**
- ✅ Base class compiles without errors
- ✅ Utility functions work correctly
- ✅ No integration with app yet (pure library code)

---

### Session 1B - Integration

**Goal:** Wire up base class into behavior system

**Files to Modify:**
- `soundscape.js` - Update `BehaviorExecutor.create()` to accept `listener` parameter
- `spatial_audio_app.js` - Add `activeBehaviors` array, `soundsWithBehaviors` Set, update `_startWithSoundscape()` and `_updateSoundPositions()`

**Tasks:**
1. Update `BehaviorExecutor.create()` signature to accept `listener` parameter
2. Add `activeBehaviors` array to `SpatialAudioApp` constructor
3. Add `soundsWithBehaviors` Set to track affected sounds
4. Update `_startWithSoundscape()` to initialize and store behavior executors
5. Update `_updateSoundPositions()` to call `executor.update()` for each behavior
6. Modify default gain logic to skip sounds with active effects

**Reference:** `DISTANCE_ENVELOPE_BEHAVIOR.md` → Section "Critical Integration Points"

**Verification:**
```javascript
// Test in browser console - start a soundscape with behaviors
app.activeBehaviors.length; // Should be > 0 if behaviors exist
app.soundsWithBehaviors.size; // Should match number of sounds in behaviors
```

**Exit Criteria:**
- ✅ Behavior executors are created when soundscape starts
- ✅ `update()` is called every frame for active behaviors
- ✅ Sounds with behaviors skip default gain logic
- ✅ No console errors

---

### Session 2 - Distance Envelope Executor

**Goal:** Implement the first distance-based effect

**Files to Modify:**
- `soundscape.js` - Add `DistanceEnvelopeExecutor` class
- `api/models/Behavior.js` - Add envelope config validation

**Tasks:**
1. Add `DistanceEnvelopeExecutor` class (extends `DistanceBasedEffect`, ~35 lines)
   - Constructor with config defaults + validation
   - `_validateConfig()` - envelope-specific checks
   - `_calculateEffectParams()` - three-zone gain calculation
   - `_applyEffect()` - gain application with smoothing
2. Register with `BehaviorExecutor.create()` factory
3. Add behavior validation to `Behavior.js`

**Reference:** `DISTANCE_ENVELOPE_BEHAVIOR.md` → Section "DistanceEnvelopeExecutor"

**Verification:**
```javascript
// Test in browser console
const executor = new DistanceEnvelopeExecutor(behaviorSpec, sounds, engine, listener);
executor.update(); // Should update gains without errors
```

**Exit Criteria:**
- ✅ Executor class compiles
- ✅ Factory creates correct type
- ✅ Validation rejects invalid configs

---

### Session 3 - Preset System + Canvas Preview

**Goal:** Add UI preset selector and visual preview

**Files to Modify:**
- `map_editor.html` - Add preset selector dropdown, canvas preview element
- `map_editor.js` - Add `DISTANCE_ENVELOPE_PRESETS`, preset change handler, canvas drawing

**Tasks:**
1. Add `DISTANCE_ENVELOPE_PRESETS` constant to `map_editor.js`
2. Add preset selector dropdown to envelope controls HTML
3. Implement preset change handler (populate sliders)
4. Implement slider change handler (switch to "custom")
5. Add canvas preview visualization (`drawEnvelopePreview()`)
6. Add `_calculateGain()` and `_applyCurve()` helper functions for preview

**Reference:** `DISTANCE_ENVELOPE_BEHAVIOR.md` → Section "Preset System"

**Verification:**
- Select preset → sliders update automatically
- Move slider → preset switches to "custom"
- Canvas shows volume vs distance curve

**Exit Criteria:**
- ✅ Preset selector works
- ✅ Sliders update from preset
- ✅ Canvas preview draws correctly
- ✅ "Custom" state detected

---

### Session 4 - Editor UI

**Goal:** Add envelope controls to waypoint modal

**Files to Modify:**
- `map_editor.html` - Add envelope controls section to waypoint modal
- `map_editor.js` - Wire up behavior creation, slider displays

**Tasks:**
1. Add envelope controls section to waypoint modal HTML
2. Add slider value displays (update on input)
3. Wire up preset selector to envelope controls
4. Wire up behavior creation when saving waypoint (include config)
5. Add visual feedback when preset is selected (highlight/animation)

**Reference:** `DISTANCE_ENVELOPE_BEHAVIOR.md` → Section "Editor UI"

**Verification:**
- Open waypoint modal → envelope section visible
- Adjust sliders → values display updates
- Save waypoint → behavior includes envelope config

**Exit Criteria:**
- ✅ UI controls present and functional
- ✅ Behavior object includes envelope config when saved
- ✅ Visual feedback on preset selection

---

### Session 5 - Persistence

**Goal:** Save/load envelope configs

**Files to Modify:**
- `api/models/Behavior.js` - Update validation schema
- Server-side models (if applicable) - Add envelope config fields

**Tasks:**
1. Add envelope config to behavior JSON export
2. Add envelope config to server save/load
3. Update `Behavior.js` validation schema

**Reference:** `DISTANCE_ENVELOPE_BEHAVIOR.md` → Section "Persistence"

**Verification:**
- Save soundscape → envelope config in JSON
- Reload soundscape → envelope config restored
- Invalid config rejected by validation

**Exit Criteria:**
- ✅ Config persists through save/load
- ✅ Validation catches invalid configs

---

### Session 6A - Desktop Testing

**Goal:** Verify functionality in desktop simulator

**Tasks:**
1. Open `map_player.html` in browser
2. Create soundscape with distance envelope behavior
3. Drag avatar toward waypoint
4. Verify gain values change according to envelope
5. Test all preset curves (linear, exponential, logarithmic)

**Reference:** `DISTANCE_ENVELOPE_BEHAVIOR.md` → Section "Testing"

**Verification:**
- Volume fades in at correct distance
- Sustain volume is correct
- Volume fades out at correct distance
- Curve shaping works as expected

**Exit Criteria:**
- ✅ Envelope behavior matches config
- ✅ No audio glitches or clicks

---

### Session 6B - Mobile Field Testing

**Goal:** Verify GPS-based behavior on real device

**Tasks:**
1. Deploy to test server
2. Open `map_player.html` on phone
3. Walk toward waypoint
4. Listen for volume changes
5. Verify fade zones match expectations

**Reference:** `DISTANCE_ENVELOPE_BEHAVIOR.md` → Section "Testing"

**Verification:**
- Volume changes match desktop simulation
- No latency or stuttering
- GPS noise doesn't cause volume flutter

**Exit Criteria:**
- ✅ Works on mobile device
- ✅ GPS tracking is smooth

---

### Session 6C - Performance + Memory

**Goal:** Ensure no performance regression

**Tasks:**
1. Open browser dev tools → Performance tab
2. Record while walking around soundscape
3. Check CPU usage (<2% impact)
4. Check memory growth (no leaks)
5. Test on multiple browsers (Chrome, Firefox, Safari)

**Reference:** `DISTANCE_ENVELOPE_BEHAVIOR.md` → Section "Testing"

**Verification:**
- Distance caching reduces GPS calculations
- WeakMap prevents memory leaks
- Frame rate stays at 60fps

**Exit Criteria:**
- ✅ CPU impact <2%
- ✅ No memory growth over time
- ✅ Works on all target browsers

---

### Session 7 - Future Effects (Optional)

**Goal:** Implement additional distance-based effects using same pattern

**Effects:**
| Effect | Session | Time | Description |
|--------|---------|------|-------------|
| **DistanceReverb** | 7A | 30-45 min | More reverb when far away |
| **DistanceFilter** | 7B | 30-45 min | Low-pass filter at distance |
| **DistanceDetune** | 7C | 30-45 min | Ethereal detune when far |

**Reference:** `DISTANCE_ENVELOPE_BEHAVIOR.md` → Section "Future Effects"

**Each Session:**
1. Create `*Executor` class (extends `DistanceBasedEffect`)
2. Override `_calculateEffectParams()` and `_applyEffect()`
3. Register with factory
4. Add validation
5. Test

**Exit Criteria:**
- ✅ Effect works as specified
- ✅ No conflicts with envelope
- ✅ Can chain multiple effects

---

## 🔗 Document References

| Document | Purpose |
|----------|---------|
| [`DISTANCE_ENVELOPE_BEHAVIOR.md`](./DISTANCE_ENVELOPE_BEHAVIOR.md) | **Main spec** - architecture, class details, code examples |
| [`FEATURES.md`](./FEATURES.md) | Feature catalog |
| [`soundscape.js`](./soundscape.js) | Behavior executor framework |
| [`spatial_audio_app.js`](./spatial_audio_app.js) | App integration point |
| [`map_editor.html`](./map_editor.html) | Editor UI |
| [`api/models/Behavior.js`](./api/models/Behavior.js) | Validation schema |

---

## 📝 Session Tracking

| Session | Date Completed | Notes |
|---------|----------------|-------|
| 1A | | |
| 1B | | |
| 2 | | |
| 3 | | |
| 4 | | |
| 5 | | |
| 6A | | |
| 6B | | |
| 6C | | |
| 7A | | |
| 7B | | |
| 7C | | |

---

**Ready to Start:** Begin with **Session 1A** when ready.
