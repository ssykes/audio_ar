# Martinez Intersection-Based Crossfade - Implementation Plan

**Date:** 2026-04-01  
**Feature:** Position-based audio crossfade in polygon intersections  
**Library:** martinez-polygon-clipping (8 KB minified)  
**Status:** Ready for Implementation

---

## 📋 Executive Summary

### Critical Discovery

**The Martinez documentation claims integration is complete, but the actual code doesn't match:**

| Component | Documentation Says | Actual Code State |
|-----------|-------------------|-------------------|
| `spatial_audio.js` | ✅ v6.0 with Martinez methods | ❌ v5.1, **no Martinez methods** |
| `spatial_audio_app.js` | ✅ v3.0 with intersection crossfade | ❌ v2.8, **uses direction-based weighting** |
| `martinez.min.js` | ✅ Deployed | ✅ Exists in codebase |
| `deploy.ps1` | ✅ Configured | ✅ Martinez patterns present |

**Conclusion:** The documentation describes a **planned** integration that was never implemented in code. This plan provides the complete implementation.

---

## 🎯 Implementation Objectives

### 1. Add Martinez Intersection Methods to `spatial_audio.js`

**Location:** `GPSUtils` object (after existing polygon methods, ~line 200)

**Methods to Add:**

```javascript
/**
 * Compute intersection polygon using Martinez algorithm
 * @param {Array<{lat: number, lng: number}>} subjectPolygon - First polygon
 * @param {Array<{lat: number, lng: number}>} clipPolygon - Second polygon
 * @returns {Array<Array<{lat: number, lng: number}>>|null} Intersection polygon or null
 */
martinezIntersection(subjectPolygon, clipPolygon) {
    // Convert {lat, lng} → [lng, lat] (Martinez format)
    // Call martinez.intersection()
    // Convert back to {lat, lng}
    // Handle multipolygons (return first polygon)
}

/**
 * Calculate crossfade position within intersection (0=entry, 1=exit)
 * @param {number} lat - Listener latitude
 * @param {number} lng - Listener longitude  
 * @param {Array<{lat: number, lng: number}>} intersectionPolygon - Intersection zone
 * @param {number} direction - Travel direction (0-360°)
 * @returns {number} Position 0.0 (entry) to 1.0 (exit)
 */
getCrossfadePosition(lat, lng, intersectionPolygon, direction) {
    // Ray-cast forward from listener position
    // Find intersection with polygon edge (exit point)
    // Ray-cast backward (entry point)
    // Calculate position: distance_from_entry / total_distance
}

/**
 * Find intersection between ray and polygon segment
 * Helper for getCrossfadePosition()
 */
raySegmentIntersection(rayOrigin, rayDirection, segmentStart, segmentEnd) {
    // Standard ray-line segment intersection math
}
```

**File:** `spatial_audio.js`  
**Lines:** ~200-350 (after `polygonBounds()`)  
**Dependencies:** `martinez` global (loaded via script tag)

---

### 2. Update `AreaManager._mixAreas()` in `spatial_audio_app.js`

**Current Implementation (lines 2134-2230):**
- Uses direction-to-center weighting
- Equal distribution when no direction
- No geometric intersection calculation

**New Implementation:**

```javascript
_mixAreas(activeAreas, travelDirection = 0) {
    // ... opaque handling unchanged ...

    // === MIX MODE: Intersection-based crossfade ===
    if (mixAreas.length === 2) {  // Martinez only handles 2-area overlap
        const area1 = mixAreas[0];
        const area2 = mixAreas[1];

        // Step 1: Compute intersection polygon
        const intersection = GPSUtils.martinezIntersection(
            area1.polygon,
            area2.polygon
        );

        if (intersection) {
            // Step 2: Get listener position in intersection (0=entry, 1=exit)
            const crossfadePos = GPSUtils.getCrossfadePosition(
                this.listener.lat,
                this.listener.lon,
                intersection,
                travelDirection
            );

            // Step 3: Determine origin vs destination area
            // Origin = behind listener, Destination = ahead
            const originArea = /* area behind */;
            const destArea = /* area ahead */;

            // Step 4: Apply equal-power crossfade
            // Entry: origin=100%, dest=0%
            // Middle: origin=71%, dest=71% (constant power)
            // Exit: origin=0%, dest=100%
            const originWeight = Math.cos(crossfadePos * Math.PI / 2);
            const destWeight = Math.sin(crossfadePos * Math.PI / 2);

            // Step 5: Apply volumes (respecting max volume settings)
            const originVolume = originWeight * originArea.options.gain;
            const destVolume = destWeight * destArea.options.gain;

            // Set gain nodes
            // ... apply with setTargetAtTime() for smoothness ...
        } else {
            // Fallback: no intersection (shouldn't happen)
            // Use equal distribution
        }
    } else if (mixAreas.length > 2) {
        // Fallback: 3+ areas = equal distribution (1/N)
        // Martinez doesn't handle multi-way intersection elegantly
    }
}
```

**File:** `spatial_audio_app.js`  
**Lines:** 2134-2230 (replace `_mixAreas()` method)  
**Key Changes:**
- Compute actual intersection polygon
- Calculate listener position within intersection
- Apply equal-power crossfade (cos/sin curves)
- Respect max volume settings from editor

---

### 3. Verify HTML Files Include Martinez Script Tag

**Files to Check:**
- `map_player.html` (~line 498)
- `map_editor_v2.html` (~line 1270)

**Required Script Tag:**
```html
<script src="martinez.min.js"></script>
```

**Load Order (Critical):**
```html
<!-- Martinez must load FIRST -->
<script src="martinez.min.js"></script>
<script src="spatial_audio.js"></script>
<script src="spatial_audio_app.js"></script>
```

---

### 4. Verify Deploy Script Configuration

**File:** `deploy.ps1`

**Current State (from analysis):**
- ✅ Pattern defined: `$MARTINEZ_PATTERN = 'martinez\.min\.js(\?v=\d+)?'` (line 118)
- ✅ HTML update logic exists (lines 217-220)
- ✅ Deployment copy update (line 303)
- ✅ Included in `$ALL_FILES` array (line 345)

**Action:** Verify these are present and functional

---

## 📐 Algorithm Details

### Martinez Polygon Clipping

**Input Format:**
```javascript
// Subject polygon (Area 1)
[{lat: 52.52, lng: 13.405}, {lat: 52.521, lng: 13.406}, ...]

// Clip polygon (Area 2)
[{lat: 52.5205, lng: 13.406}, {lat: 52.5215, lng: 13.407}, ...]
```

**Martinez expects:**
```javascript
// Convert to [lng, lat] format
[[13.405, 52.52], [13.406, 52.521], ...]
```

**Martinez returns:**
```javascript
// Multipolygon format (array of polygons)
[
  [  // First polygon (exterior ring + holes)
    [13.4055, 52.5205],  // Exterior ring vertices
    [13.4058, 52.5208],
    ...
  ]
]
```

**Conversion back:**
```javascript
// Extract first polygon, convert to {lat, lng}
intersection.map(([lng, lat]) => ({lat, lng}))
```

---

### Crossfade Position Calculation

**Problem:** Determine where listener is within intersection polygon (0% = entry edge, 100% = exit edge)

**Algorithm:**

1. **Ray-cast forward** from listener position along travel direction
   - Find intersection with polygon edge (exit point)
   - Distance = `d_exit`

2. **Ray-cast backward** (opposite direction)
   - Find intersection with polygon edge (entry point)
   - Distance = `d_entry`

3. **Calculate position:**
   ```
   total_distance = d_entry + d_exit
   position = d_entry / total_distance
   ```

4. **Edge cases:**
   - No forward intersection → position = 1.0 (at exit)
   - No backward intersection → position = 0.0 (at entry)
   - Listener outside polygon → skip crossfade (not in intersection)

**Math for ray-segment intersection:**
```javascript
// Ray: P = origin + t * direction
// Segment: P = A + u * (B - A)
// Solve for t, u where lines intersect

const denom = (B.y - A.y) * (D.x - C.x) - (D.y - C.y) * (B.x - A.x);
if (denom === 0) return null;  // Parallel

const t = ((B.x - A.x) * (A.y - C.y) - (B.y - A.y) * (A.x - C.x)) / denom;
const u = ((D.x - C.x) * (A.y - C.y) - (D.y - C.y) * (A.x - C.x)) / denom;

if (t >= 0 && u >= 0 && u <= 1) {
    return {
        x: C.x + t * (D.x - C.x),
        y: C.y + t * (D.y - C.y)
    };
}
```

---

### Equal-Power Crossfade Curve

**Why not linear?** Linear crossfade causes perceived volume dip in middle due to psychoacoustics.

**Equal-power solution:**
```javascript
// Position: 0.0 (entry) to 1.0 (exit)
originWeight = Math.cos(position * Math.PI / 2);
destWeight = Math.sin(position * Math.PI / 2);

// Examples:
// position = 0.0: origin = cos(0) = 1.0, dest = sin(0) = 0.0
// position = 0.5: origin = cos(π/4) = 0.707, dest = sin(π/4) = 0.707
// position = 1.0: origin = cos(π/2) = 0.0, dest = sin(π/2) = 1.0

// Verify constant power:
// origin² + dest² = cos²(θ) + sin²(θ) = 1.0 (always)
```

**Volume Application:**
```javascript
// Assuming both areas set to 80% max volume in editor:
originVolume = originWeight * 0.8;  // Entry: 0.8, Middle: 0.566, Exit: 0.0
destVolume = destWeight * 0.8;      // Entry: 0.0, Middle: 0.566, Exit: 0.8
```

---

## 📁 Files to Modify

| File | Lines | Changes |
|------|-------|---------|
| `spatial_audio.js` | ~200-350 | Add `martinezIntersection()`, `getCrossfadePosition()`, `raySegmentIntersection()` to `GPSUtils` |
| `spatial_audio_app.js` | 2134-2230 | Replace `_mixAreas()` with intersection-based crossfade |
| `map_player.html` | ~498 | Verify `<script src="martinez.min.js">` exists |
| `map_editor_v2.html` | ~1270 | Verify `<script src="martinez.min.js">` exists |
| `deploy.ps1` | Already configured | Verify Martinez patterns and file list |

---

## 🧪 Testing Strategy

### 1. Unit Tests (Browser Console)

**Test Martinez Integration:**
```javascript
// Test 1: Basic intersection
const poly1 = [{lat: 0, lng: 0}, {lat: 0, lng: 2}, {lat: 2, lng: 2}, {lat: 2, lng: 0}];
const poly2 = [{lat: 1, lng: 1}, {lat: 1, lng: 3}, {lat: 3, lng: 3}, {lat: 3, lng: 1}];
const intersection = GPSUtils.martinezIntersection(poly1, poly2);
console.assert(intersection !== null, "Intersection should exist");

// Test 2: Crossfade position
const position = GPSUtils.getCrossfadePosition(1.5, 1.5, intersection, 90);
console.assert(position >= 0 && position <= 1, "Position should be normalized");
```

### 2. Integration Tests (Test Page)

Create `test_martinez.html` (similar to existing test page in documentation):
- Visual map with overlapping polygons
- Draggable listener marker
- Real-time crossfade position display
- Console output verification

### 3. Field Tests (Mobile)

**Scenario:** Walk through intersection of two polygon areas

**Expected Behavior:**
- **Entry:** Area 1 at 80%, Area 2 silent
- **Middle:** Both areas at ~57% (equal-power midpoint)
- **Exit:** Area 1 silent, Area 2 at 80%
- **Smooth transition:** No abrupt volume changes

**Debug Logging:**
```javascript
if (Math.random() < 0.05) {
    console.log(`[AreaManager] Crossfade: pos=${crossfadePos.toFixed(2)}, ` +
                `origin=${originVolume.toFixed(2)}, dest=${destVolume.toFixed(2)}`);
}
```

---

## ⚠️ Known Limitations & Edge Cases

### 1. Three or More Overlapping Areas

**Problem:** Martinez computes pairwise intersections. Multi-way intersection requires recursive clipping.

**Solution:** Fall back to equal distribution (1/N per area)
```javascript
if (mixAreas.length > 2) {
    const equalWeight = 1.0 / mixAreas.length;
    // Apply equal weight to all areas
}
```

**Future Enhancement:** Barycentric coordinate-based multi-way crossfade

---

### 2. Non-Convex Polygons / Holes

**Martinez Strength:** Handles concave polygons and holes correctly

**Consideration:** Crossfade position calculation assumes convex intersection
- Ray-casting may hit multiple edges
- Need to find closest forward/backward intersections

**Solution:** Test all segment intersections, select closest in each direction

---

### 3. Very Small Intersections

**Problem:** Intersection < 1m width causes unstable crossfade

**Solution:** Minimum threshold check
```javascript
if (totalDistance < 1.0) {
    // Too small - use equal distribution
    return 0.5;
}
```

---

### 4. Rapid Direction Changes

**Problem:** Listener spins in place → crossfade jumps erratically

**Mitigation:**
- Apply smoothing to travel direction (EMA filter)
- Cache intersection polygon (don't recompute every frame)
- Use gain node `setTargetAtTime()` for smooth transitions (already implemented)

---

## 📊 Performance Considerations

| Operation | Expected Time | Frequency |
|-----------|---------------|-----------|
| Martinez intersection | 1-5ms | Once per GPS update (~10 Hz) |
| Crossfade position | <1ms | Once per GPS update |
| Gain node update | <0.1ms | Once per GPS update |
| **Total overhead** | **<10ms** | **~10ms total per second** |

**Memory:** ~100 bytes per intersection polygon (negligible)

**Optimization Opportunities:**
1. **Cache intersection polygons** for static areas (invalidate only when areas change)
2. **Lazy computation:** Only compute intersection when listener enters overlap zone
3. **Spatial index:** Use quadtree to quickly find overlapping area pairs

---

## 🚀 Deployment Steps

### 1. Code Implementation

```bash
# Implement Martinez methods in spatial_audio.js
# Update _mixAreas() in spatial_audio_app.js
# Verify HTML script tags
```

### 2. Deploy to Test Server

```powershell
& .\deploy.ps1
```

**Expected Output:**
```
Version: 20260401XXXXXX
  Updated: map_player.html (martinez.min.js)
  Updated: map_editor_v2.html (martinez.min.js)
Files to deploy: 30
   Uploading: martinez.min.js [OK]
   Uploading: spatial_audio.js [OK]
   Uploading: spatial_audio_app.js [OK]
```

### 3. Verify Deployment

```powershell
# Check martinez.min.js accessible
Invoke-WebRequest -Uri "https://ssykes.net/martinez.min.js"

# Check HTML has cache-busting
Invoke-WebRequest -Uri "https://ssykes.net/map_player.html" | 
    Select-String "martinez.min.js"
```

### 4. Browser Testing

```
# Open test page
https://ssykes.net/test_martinez.html

# Or test directly
https://ssykes.net/map_player.html
```

**Console Checks:**
- ✅ No "martinez is not defined" errors
- ✅ `[GPSUtils] Martinez intersection computed`
- ✅ `[AreaManager] Crossfade: pos=0.XX, ...`

### 5. Field Testing (Mobile)

1. Load soundscape with overlapping polygon areas
2. Walk through intersection
3. Listen for smooth crossfade
4. Check debug logging (5% throttle)

---

## 📝 Rollback Plan

If issues arise:

### Quick Rollback
```bash
# Revert to previous versions
git checkout HEAD~1 spatial_audio.js spatial_audio_app.js
git checkout HEAD~1 map_player.html map_editor_v2.html

# Redeploy
& .\deploy.ps1
```

### Disable Martinez (Fallback)
Code already includes fallback to equal distribution:
```javascript
if (typeof martinez === 'undefined') {
    // Fall back to equal distribution
    return;
}
```

---

## ✅ Success Criteria

- [ ] Martinez library loads without errors
- [ ] Intersection polygons computed correctly
- [ ] Crossfade position calculated (0=entry, 1=exit)
- [ ] Equal-power crossfade applied (constant perceived loudness)
- [ ] Smooth audio transition in field test
- [ ] No performance degradation (<10ms overhead)
- [ ] Debug logging confirms operation
- [ ] Fallback works for 3+ overlapping areas

---

## 📚 References

- **Martinez Algorithm:** [GitHub](https://github.com/w8r/martinez)
- **Equal-Power Crossfade:** [MusicDSP](https://www.musicdsp.org/en/latest/Other/188-equal-power-crossfade.html)
- **Feature Documentation:** `FEATURE_17_INTERSECTION_CROSSFADE.md`
- **Deployment Checklist:** `MARTINEZ_DEPLOYMENT_CHECKLIST.md`
- **Integration Summary:** `MARTINEZ_INTEGRATION_SUMMARY.md`

---

## 🔑 Terminology

| Term | Definition |
|------|------------|
| **Origin Area** | The area polygon the listener is traveling **from**. Behind the listener as they travel through the intersection. |
| **Destination Area** | The area polygon the listener is traveling **to**. In front of the listener as they travel through the intersection. |
| **Intersection Polygon** | The geometric overlap zone computed by Martinez where both areas overlap. |
| **Crossfade Position** | Normalized value 0.0 (entry edge) to 1.0 (exit edge) indicating listener's position within intersection. |
| **Equal-Power Crossfade** | Psychoacoustically optimized crossfade using cos/sin curves to maintain constant perceived loudness. |

---

## 💡 Implementation Notes

### Determining Origin vs Destination Area

The key insight is that **travel direction** determines which area is origin vs destination:

```javascript
// Calculate vector from listener to each area's center (or entry point)
const dirToArea1 = GPSUtils.bearing(
    listener.lat, listener.lon,
    area1Center.lat, area1Center.lon
);

const dirToArea2 = GPSUtils.bearing(
    listener.lat, listener.lon,
    area2Center.lat, area2Center.lon
);

// Compare with travel direction
const angleDiff1 = Math.abs(normalizeAngle(travelDirection - dirToArea1));
const angleDiff2 = Math.abs(normalizeAngle(travelDirection - dirToArea2));

// Area behind (angle > 90°) = Origin
// Area ahead (angle < 90°) = Destination
const originArea = angleDiff1 > 90 ? area1 : area2;
const destArea = angleDiff1 > 90 ? area2 : area1;
```

### Alternative: Use Intersection Entry/Exit Points

More accurate approach uses the actual entry/exit points from ray-casting:

```javascript
// Ray-cast backward to find entry point
const entryPoint = raySegmentIntersection(
    listenerPos, 
    oppositeDirection(travelDirection), 
    intersectionPolygon
);

// Ray-cast forward to find exit point
const exitPoint = raySegmentIntersection(
    listenerPos, 
    travelDirection, 
    intersectionPolygon
);

// Determine which area contains entry point = Origin
// Which area contains exit point = Destination
const originArea = areaContainsPoint(area1, entryPoint) ? area1 : area2;
const destArea = areaContainsPoint(area1, exitPoint) ? area1 : area2;
```

---

**Last Updated:** 2026-04-01  
**Status:** Ready for Implementation  
**Estimated Implementation Time:** 2-3 hours
