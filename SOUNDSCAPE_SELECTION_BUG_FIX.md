# Soundscape Selection Bug Fix

**Date:** 2026-04-01  
**Issue:** Refreshing `map_editor_v2.html` or returning from `soundscape_picker.html` always displayed the first soundscape in the list instead of the user-selected one.

---

## Root Cause

Two bugs in `_loadSoundscapeFromServer()` method:

### Bug 1: Wrong Priority Order
```javascript
// BEFORE (WRONG)
const persistedId = localStorage.getItem('editor_active_soundscape_id');
const selectedId = localStorage.getItem('selected_soundscape_id');

if (persistedId) {
    targetServerId = persistedId;  // ← Old session takes priority
} else if (selectedId) {
    targetServerId = selectedId;   // ← Fresh selection ignored!
}
```

**Problem:** When user selected a new soundscape in the picker:
1. `selected_soundscape_id` = newly selected ID (e.g., "soundscape_B")
2. `editor_active_soundscape_id` = previous session ID (e.g., "soundscape_A")
3. Code loaded "soundscape_A" because persisted had priority
4. User's fresh selection was ignored!

### Bug 2: Missing Persistence After Load
```javascript
// BEFORE (INCOMPLETE)
if (selectedId) {
    localStorage.removeItem('selected_soundscape_id');  // ← Cleared
    // But editor_active_soundscape_id was NEVER set!
}
```

**Problem:** After loading the selected soundscape:
1. `selected_soundscape_id` was cleared (correct)
2. `editor_active_soundscape_id` was NOT set (bug!)
3. On page refresh, both were null
4. Code fell back to `soundscapes[0]` (first/most recent)

---

## Solution

### Fix 1: Reverse Priority Order
Fresh user selection from picker now takes priority over persisted session:

```javascript
// AFTER (CORRECT)
const selectedId = localStorage.getItem('selected_soundscape_id');
const persistedId = localStorage.getItem('editor_active_soundscape_id');

// Fresh selection from picker takes priority
if (selectedId) {
    targetServerId = selectedId;   // ← Fresh selection first!
} else if (persistedId) {
    targetServerId = persistedId;  // ← Then persisted session
}
```

### Fix 2: Persist After Successful Load
Always persist the loaded soundscape ID for page refresh:

```javascript
// Persist the loaded soundscape for page refresh
localStorage.setItem('editor_active_soundscape_id', targetServerId);
this.debugLog(`💾 Persisted editor_active_soundscape_id: ${targetServerId}`);

// Clear one-time selection from soundscape_picker
if (selectedId) {
    localStorage.removeItem('selected_soundscape_id');
    this.debugLog(`🧹 Cleared one-time selected_soundscape_id`);
}
```

---

## Behavior After Fix

| Scenario | Before Fix | After Fix |
|----------|-----------|-----------|
| Select soundscape B in picker → go to editor | Loads A (previous session) ❌ | Loads B ✅ |
| Refresh editor page | Loads first in list ❌ | Loads B (persisted) ✅ |
| Go back to picker → select C → return to editor | Loads A or B ❌ | Loads C ✅ |
| Open editor directly (no picker) | Loads first in list | Loads last session ✅ |

---

## Files Changed

- `map_editor_v2.js` (lines 1516-1640)
  - `_loadSoundscapeFromServer()` method
  - Reversed priority: `selectedId` → `persistedId` → default
  - Added persistence after successful load

---

## Testing

1. **Test fresh selection:**
   - Open `soundscape_picker.html`
   - Select any soundscape (not the first one)
   - Verify correct soundscape loads in `map_editor_v2.html`

2. **Test page refresh:**
   - With soundscape loaded, press F5
   - Verify same soundscape reloads (not first in list)

3. **Test switching:**
   - Go back to picker
   - Select different soundscape
   - Verify new selection loads in editor

---

## Debug Logging

Enhanced logging to diagnose future issues:

```
🔍 Selected soundscape ID (one-time from picker): soundscape_123
🔍 Persisted soundscape ID (from last session): soundscape_456
📥 Will load selected soundscape from picker: soundscape_123
💾 Persisted editor_active_soundscape_id: soundscape_123
🧹 Cleared one-time selected_soundscape_id
✅ Loaded: My Soundscape (5 waypoints, 2 areas)
```

---

## Related Files

- `soundscape_picker.html` - Stores `selected_soundscape_id` before redirect
- `map_shared.js` - `switchSoundscape()` also persists `editor_active_soundscape_id`
- `map_player.js` - Similar logic for player mode (uses same localStorage keys)
