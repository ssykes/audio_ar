# Areas Not Displaying on Page Load - Fix

**Date:** 2026-03-24  
**Issue:** Polygon areas saved to database but not displayed when reloading `map_editor.html`

## Problem

When creating a soundscape with areas, the areas were correctly saved to the database but did not display on the map when reloading the page after restarting the machine.

### Error Message
```
[4:48:05 PM] ❌ Failed to load from server: Cannot read properties of null (reading 'addLayer')
[4:48:05 PM] 📍 Loading 1 Areas...
[4:48:05 PM] ✅ Created markers and circles for new soundscape
```

### Root Cause

**Initialization order bug** in `map_editor.js::init()`:

1. `_loadSoundscapeFromServer()` was called (line 55)
   - This calls `switchSoundscape()` 
   - Which calls `_loadAreasIntoDrawer()`
   - Which tries to use `this.drawnItems.addLayer()`
2. `_initAreaDrawer()` was called **after** (line 84)
   - This initializes `this.drawnItems`

**Result:** `this.drawnItems` was `null` when trying to load areas, causing the error and preventing areas from rendering.

## Solution

### 1. Fixed Initialization Order (`map_editor.js`)

Moved `_initAreaDrawer()` **before** `_loadSoundscapeFromServer()`:

```javascript
// Get initial GPS/WiFi position
await this._getInitialGPS();

// Initialize Leaflet.Draw for Areas BEFORE loading soundscapes
this._initAreaDrawer();  // ← Moved UP

// Load soundscape from server
if (this.isLoggedIn) {
    await this._loadSoundscapeFromServer();
}
```

### 2. Added Safety Check (`map_editor.js::_loadAreasIntoDrawer`)

Added defensive check to prevent errors if called before initialization:

```javascript
_loadAreasIntoDrawer(areas) {
    if (!areas || areas.length === 0) return;
    
    // Safety check: ensure drawnItems is initialized
    if (!this.drawnItems) {
        this.debugLog('⚠️ _loadAreasIntoDrawer: drawnItems not initialized yet');
        return;
    }
    
    // ... rest of the method
}
```

### 3. Updated Version Numbers

- `map_editor.js`: v6.41 → v6.42
- `map_editor.html`: Added cache-busting versions to all script tags

## Files Changed

| File | Changes |
|------|---------|
| `map_editor.js` | Fixed init order, added safety check, updated version to v6.42 |
| `map_editor.html` | Added cache-busting versions to script tags |

## Testing

To verify the fix:

1. Create a soundscape with an area in `map_editor.html`
2. Save to server
3. Close browser / restart machine
4. Reload `map_editor.html`
5. **Expected:** Area polygon displays on map immediately
6. **Check logs:** Should see `✅ Loaded Areas into drawer` without errors

## Related

- Database schema: `api/migrations/003_create_areas_table.sql`
- Area model: `api/models/Area.js`
- Storage format: Polygon vertices stored as JSONB `[{lat, lng}, ...]`
