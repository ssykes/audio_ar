# Debug Logging Added for Lazy Loading Verification

**Date:** 2026-03-18  
**Purpose:** Verify lazy loading behavior and hysteresis is working correctly  
**Files Modified:** `spatial_audio_app.js`, `map_player.html`, `map_editor.html`

---

## 📊 Debug Log Output Format

### **1. Zone Check Summary (Every Zone Check)**
```
📊 [ZONE DEBUG] Checking 7 sounds:
```
Shows total number of sounds being evaluated.

---

### **2. Individual Sound State (Every Sound, Every Check)**
```
  🔍 sound-id: 35.2m | loaded=true | playing=true | disposed=false | zone=preload→preload
```
**Fields:**
- `sound-id`: Sound identifier
- `35.2m`: Current distance from listener
- `loaded=true`: Buffer/source is loaded in memory
- `playing=true`: Audio is currently playing (gain > 0)
- `disposed=false`: Nodes have been disposed (freed from memory)
- `zone=preload→preload`: Previous zone → Current zone

---

### **3. Zone Calculation Details (20% Sampling)**
```
  🧮 [ZONE CALC] sound-id: radius=20m, preloadStart=40m, unload=50m, disposeThresh=60m
    distance=35.2m | inActive=false, inPreload=true, wasInUnload=false → zone=preload, shouldDispose=false
```
**Fields:**
- `radius`: Sound's activation radius
- `preloadStart`: Distance where preload zone begins (radius + preloadMargin)
- `unload`: Distance where unload zone begins (radius + preloadMargin + unloadMargin)
- `disposeThresh`: Distance where disposal happens (with hysteresis)
- `distance`: Current listener distance
- `inActive`: Inside active zone (0-radius)
- `inPreload`: Inside preload zone (radius-preloadStart)
- `wasInUnload`: Was in unload zone on previous check (for hysteresis)
- `zone`: Calculated zone
- `shouldDispose`: Whether sound should be disposed

---

### **4. Disposal Decision (Every Disposal)**
```
  🗑️ [DISPOSE] sound-id: zone=unload, distance=52.3m, activationRadius=20m, previousZone=preload, wasInUnload=false, disposeThreshold=60m
```
**Fields:**
- `zone`: Current zone classification
- `distance`: Listener distance
- `activationRadius`: Sound's activation radius
- `previousZone`: Zone on previous check
- `wasInUnload`: Whether sound was in unload zone (triggers hysteresis)
- `disposeThreshold`: Distance threshold for disposal (with hysteresis)

**Key Verification:**
- If `wasInUnload=false` and `distance < disposeThreshold`: **BUG** (disposing too early)
- If `wasInUnload=true` and `distance > disposeThreshold`: **CORRECT** (hysteresis working)

---

### **5. Zone Results Summary (When Actions Taken)**
```
📦 Zone results: 0 to load, 0 to preload, 5 to dispose
```
Shows count of sounds requiring each action.

---

### **6. Zone Distribution Summary (Every Check)**
```
📊 [ZONE SUMMARY] active=0, preload=1, unload=6 | loaded=1, disposed=6, total=7
```
**Fields:**
- `active/preload/unload`: Count by zone
- `loaded`: Sounds currently loaded in memory (including playing)
- `disposed`: Sounds disposed (freed from memory)
- `total`: Total sounds in soundscape

---

## 🎯 What to Look For

### **✅ Correct Behavior**

**Listener at 35m (preload zone):**
```
🔍 sound-4: 35.2m | loaded=true | playing=true | disposed=false | zone=preload→preload
🧮 [ZONE CALC] sound-4: radius=20m, preloadStart=40m, unload=50m, disposeThresh=60m
  distance=35.2m | inActive=false, inPreload=true, wasInUnload=false → zone=preload, shouldDispose=false
📊 [ZONE SUMMARY] active=0, preload=1, unload=0 | loaded=1, disposed=0, total=1
```
**Expected:**
- ✅ `zone=preload`
- ✅ `shouldDispose=false`
- ✅ `loaded=true, playing=true`
- ✅ Not in disposal list

**Listener at 55m (dispose zone, with hysteresis):**
```
🔍 sound-4: 55.2m | loaded=true | playing=true | disposed=false | zone=unload→unload
🧮 [ZONE CALC] sound-4: radius=20m, preloadStart=40m, unload=50m, disposeThresh=60m
  distance=55.2m | inActive=false, inPreload=false, wasInUnload=true → zone=unload, shouldDispose=false
📊 [ZONE SUMMARY] active=0, preload=0, unload=1 | loaded=1, disposed=0, total=1
```
**Expected:**
- ✅ `zone=unload`
- ✅ `wasInUnload=true` (from previous check)
- ✅ `shouldDispose=false` (hysteresis: 55m < 60m threshold)
- ✅ Sound stays loaded (hysteresis buffer)

**Listener at 65m (dispose zone, beyond hysteresis):**
```
🔍 sound-4: 65.2m | loaded=true | playing=true | disposed=false | zone=unload→unload
🗑️ [DISPOSE] sound-4: zone=unload, distance=65.2m, activationRadius=20m, previousZone=unload, wasInUnload=true, disposeThreshold=60m
📊 [ZONE SUMMARY] active=0, preload=0, unload=0 | loaded=0, disposed=1, total=1
```
**Expected:**
- ✅ `wasInUnload=true`
- ✅ `distance > disposeThreshold` (65m > 60m)
- ✅ `shouldDispose=true`
- ✅ Sound disposed

---

### **❌ Bug Indicators**

**Disposal in Preload Zone:**
```
🔍 sound-4: 35.2m | loaded=true | playing=true | disposed=false | zone=preload→preload
🗑️ [DISPOSE] sound-4: zone=preload, distance=35.2m, ... wasInUnload=false, disposeThreshold=60m
```
**BUG:** Sound disposed at 35m (should be loaded in preload zone)

**Hysteresis Not Working:**
```
🔍 sound-4: 52.0m | loaded=true | playing=true | disposed=false | zone=unload→unload
🗑️ [DISPOSE] sound-4: zone=unload, distance=52.0m, ... wasInUnload=false, disposeThreshold=60m
```
**BUG:** `wasInUnload=false` but disposing anyway (should only dispose if `wasInUnload=true` AND `distance > 60m`)

**Zone Boundary Mismatch:**
```
🧮 [ZONE CALC] sound-4: radius=20m, preloadStart=40m, unload=50m, disposeThresh=60m
  distance=35.2m | inActive=false, inPreload=false → zone=unload
```
**BUG:** `inPreload=false` at 35m (should be `true` since 35m < 40m preloadStart)

---

## 🧪 Testing Protocol

### **Test 1: Walk Toward Sound**
1. Start at 70m from sound
2. Walk toward sound in 5m increments
3. Watch for zone transitions:
   - **70-60m:** `zone=unload, disposed=true` (not loaded)
   - **60-50m:** `zone=unload, disposed=false` (loads with hysteresis)
   - **50-40m:** `zone=unload, loaded=true` (stays loaded)
   - **40-20m:** `zone=preload, loaded=true, playing=true` (faded audio)
   - **0-20m:** `zone=active, loaded=true, playing=true` (full volume)

### **Test 2: Walk Away from Sound**
1. Start at 5m from sound
2. Walk away in 5m increments
3. Watch for disposal:
   - **5-20m:** `zone=active` (full volume)
   - **20-40m:** `zone=preload` (faded volume)
   - **40-50m:** `zone=unload` (hysteresis buffer, stays loaded)
   - **50-60m:** `zone=unload, wasInUnload=true` (approaching disposal)
   - **60m+:** `zone=unload, disposed=true` (disposed beyond hysteresis)

### **Test 3: Boundary Oscillation**
1. Stand at 58-62m (disposal boundary)
2. Walk back and forth 5m
3. Verify hysteresis prevents rapid cycling:
   - **Should NOT see:** load→dispose→load→dispose
   - **Should see:** sound stays loaded (hysteresis buffer)

---

## 📋 Files Changed

| File | Changes | Cache Version |
|------|---------|---------------|
| `spatial_audio_app.js` | Added debug logging in `_updateSoundZones()` and `_getSoundZone()` | v=20260318154500 |
| `map_player.html` | Updated script tag with cache-busting version | v=20260318154500 |
| `map_editor.html` | Updated script tag with cache-busting version | v=20260318154500 |

---

## 🔍 Next Steps

1. **Hard refresh browser:** `Ctrl+Shift+R` (Windows) or `Cmd+Shift+R` (Mac)
2. **Open debug console** (tap 📋 icon in player UI)
3. **Copy logs** (tap 📋 button in debug console)
4. **Analyze zone transitions** using the format above
5. **Look for bug indicators** (disposal in wrong zone, hysteresis not working)

---

## 🎯 Expected Outcome

**If lazy loading is working correctly:**
- ✅ Sounds load when listener enters preload zone (20-40m)
- ✅ Sounds stay loaded through unload zone (40-50m, hysteresis)
- ✅ Sounds dispose only beyond hysteresis threshold (50m+)
- ✅ No rapid load/unload cycles at boundaries
- ✅ Debug logs show correct zone calculations

**If bugs exist:**
- ❌ Sounds disposed in preload zone (distance < 40m)
- ❌ `wasInUnload=false` but `shouldDispose=true` (hysteresis broken)
- ❌ Zone boundaries don't match calculations
- ❌ Rapid cycling at disposal boundary
