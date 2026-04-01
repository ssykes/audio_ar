# Feature 17: Intersection-Based Crossfade for Overlapping Polygon Areas

**Version:** 1.0  
**Date:** 2026-03-31  
**Status:** ✅ Complete  

---

## Overview

When a listener walks through the intersection of two polygon sound areas, the audio now crossfades smoothly based on the listener's **position within the intersection polygon**, rather than using simple equal distribution (50/50).

This creates a more natural audio experience where:
- Entering an intersection from Area 1 → Area 1 dominates
- Moving through the intersection → Smooth transition
- Exiting toward Area 2 → Area 2 dominates

---

## Technical Implementation

### 1. Martinez Polygon Clipping Library

**Library:** [martinez-polygon-clipping v0.7.3](https://www.npmjs.com/package/martinez-polygon-clipping)  
**Size:** 8 KB minified  
**Purpose:** Compute accurate intersection polygons for overlapping areas

**Why Martinez?**
- Supports **concave polygons** (unlike Sutherland-Hodgman)
- Supports **polygons with holes**
- Robust floating-point arithmetic
- Fast O((n+k)*log(n)) performance

### 2. New GPSUtils Methods (spatial_audio.js)

#### `martinezIntersection(subject, clip)`

Computes the intersection polygon using Martinez algorithm.

```javascript
const intersection = GPSUtils.martinezIntersection(area1.polygon, area2.polygon);
// Returns: [{lat, lng}, ...] or [] if no intersection
```

**Fallback:** If martinez library is not loaded, falls back to Sutherland-Hodgman (convex only).

#### `getCrossfadePosition(lat, lng, intersectionPolygon, travelDirection)`

Calculates the listener's position within the intersection polygon.

```javascript
const crossfadePos = GPSUtils.getCrossfadePosition(
    listenerLat,
    listenerLon,
    intersection,
    travelDirection
);
// Returns: 0 (entry edge) to 1 (exit edge), or -1 if invalid
```

**Algorithm:**
1. Ray-cast from listener position in direction of travel
2. Find intersection points with polygon boundary (forward and backward)
3. Calculate: `crossfadePos = backwardDist / (forwardDist + backwardDist)`

#### `raySegmentIntersection(rayOrigin, rayDir, segStart, segEnd)`

Helper method to find intersection between a ray and a line segment.

---

### 3. Updated AreaManager._mixAreas() (spatial_audio_app.js)

**Special handling for 2 overlapping areas:**

```javascript
if (mixAreas.length === 2) {
    // 1. Compute intersection polygon
    const intersection = GPSUtils.martinezIntersection(area1.polygon, area2.polygon);
    
    // 2. Calculate crossfade position (0 = entry, 1 = exit)
    const crossfadePos = GPSUtils.getCrossfadePosition(
        listenerLat, listenerLon, intersection, travelDirection
    );
    
    // 3. Apply equal-power crossfade curve
    const area1Weight = Math.cos(crossfadePos * Math.PI / 2);
    const area2Weight = Math.sin(crossfadePos * Math.PI / 2);
    
    // 4. Apply edge fade zones (boundary fading)
    // 5. Set final volumes
}
```

**Crossfade Curve:**
- Uses **equal-power crossfade** (constant perceived loudness)
- `area1Weight = cos(pos × π/2)` - fades out from 1→0
- `area2Weight = sin(pos × π/2)` - fades in from 0→1

**Fallback:**
- 3+ overlapping areas → Equal distribution (1/N per area)
- No valid intersection → Equal distribution

---

## Files Modified

| File | Changes |
|------|---------|
| `martinez.min.js` | ✅ Added (8 KB library) |
| `spatial_audio.js` | ✅ v6.0: Added `martinezIntersection()`, `getCrossfadePosition()`, `raySegmentIntersection()` |
| `spatial_audio_app.js` | ✅ v3.0: Updated `_mixAreas()` with intersection-based crossfade |
| `map_player.html` | ✅ Added `<script src="martinez.min.js">` |
| `map_editor_v2.html` | ✅ Added `<script src="martinez.min.js">` |
| `deploy.ps1` | ✅ Added martinez.min.js to deployment |

---

## Usage Example

### Define Overlapping Areas

```javascript
const areas = [
    {
        id: 'area1',
        polygon: [
            {lat: 52.5200, lng: 13.4050},
            {lat: 52.5210, lng: 13.4050},
            {lat: 52.5210, lng: 13.4070},
            {lat: 52.5200, lng: 13.4070}
        ],
        soundUrl: 'sounds/forest.mp3',
        volume: 0.8,
        overlapMode: 'mix',  // Enable mixing
        fadeZoneWidth: 5.0
    },
    {
        id: 'area2',
        polygon: [
            {lat: 52.5205, lng: 13.4060},  // Overlaps with area1
            {lat: 52.5215, lng: 13.4060},
            {lat: 52.5215, lng: 13.4080},
            {lat: 52.5205, lng: 13.4080}
        ],
        soundUrl: 'sounds/water.mp3',
        volume: 0.8,
        overlapMode: 'mix',
        fadeZoneWidth: 5.0
    }
];

// Load areas
await app.loadAreas(areas);
```

### Expected Behavior

**Listener walks from Area 1 → Intersection → Area 2:**

```
Position          | Crossfade Pos | Area 1 Volume | Area 2 Volume
------------------|---------------|---------------|---------------
Entering intersection | 0.0        | 100%          | 0%
25% through         | 0.25         | 92%           | 38%
Middle (50%)        | 0.5          | 71%           | 71%
75% through         | 0.75         | 38%           | 92%
Exiting intersection | 1.0         | 0%            | 100%
```

---

## Testing

### Local Testing

```bash
# Start local server
python -m http.server 8000

# Open in browser
open map_player.html
```

### Test Scenarios

1. **Two overlapping rectangles**
   - Walk through intersection
   - Verify smooth crossfade (no abrupt volume changes)

2. **Concave polygons**
   - Create L-shaped or U-shaped areas
   - Verify Martinez handles concave shapes correctly

3. **Edge cases**
   - No intersection → Equal distribution
   - 3+ overlapping areas → Equal distribution
   - Very small intersection → Graceful handling

### Debug Logging

```javascript
// Console output (throttled to 5% of updates)
[AreaManager] Crossfade: pos=0.45, area1=0.78, area2=0.62
```

---

## Performance Considerations

### Martinez Algorithm Complexity
- **Time:** O((n+k)*log(n)) where n = vertices, k = intersections
- **Space:** O(n) for output polygon

### Optimization Strategies
1. **Bounding box pre-check** (already in GPSUtils.pointInPolygon)
   - Fast rejection before expensive clipping
2. **Cache intersection polygons**
   - TODO: Cache intersection results for static areas
3. **Throttle updates**
   - Already throttled via GPS update rate (~10 Hz)

### Memory Footprint
- Martinez library: 8 KB
- Intersection polygons: ~100 bytes per pair
- Negligible impact on mobile devices

---

## Browser Compatibility

| Browser | Version | Status |
|---------|---------|--------|
| Chrome | 90+ | ✅ Tested |
| Firefox | 88+ | ✅ Compatible |
| Safari | 14+ | ✅ Compatible |
| Edge | 90+ | ✅ Compatible |
| iOS Safari | 14+ | ✅ Compatible |

---

## Known Limitations

1. **3+ overlapping areas:** Falls back to equal distribution
   - Future enhancement: Multi-way crossfade based on barycentric coordinates

2. **Rapid direction changes:** Crossfade may lag slightly
   - Mitigated by smoothing in gain.setTargetAtTime(0.05s)

3. **Very small intersections:** May produce unstable crossfade values
   - Handled by minimum threshold (0.001m)

---

## Future Enhancements

### 1. Multi-Way Crossfade (3+ Areas)

Use barycentric coordinates or distance-weighted blending:

```javascript
// Weight by inverse distance to opposite edge
const weights = areas.map(area => {
    const dist = GPSUtils.distanceToEdge(lat, lng, area.polygon);
    return 1 / (dist + 0.1);  // Avoid division by zero
});
const total = weights.reduce((a, b) => a + b, 0);
const normalized = weights.map(w => w / total);
```

### 2. Cached Intersection Polygons

For static areas, compute intersection once and cache:

```javascript
class AreaManager {
    constructor() {
        this.intersectionCache = new Map();  // Map<areaPairId, polygon>
    }
}
```

### 3. Anisotropic Crossfade

Different crossfade rates for different directions:

```javascript
// Crossfade faster when moving perpendicular to boundary
const angleDiff = Math.abs(travelDirection - boundaryAngle);
const anisotropyFactor = Math.cos(angleDiff * Math.PI / 180);
```

---

## References

- [Martinez Algorithm Paper](https://www.sciencedirect.com/science/article/pii/S0098300411000404)
- [martinez-polygon-clipping GitHub](https://github.com/w8r/martinez)
- [Equal-Power Crossfade (DSP)](https://www.musicdsp.org/en/latest/Other/188-equal-power-crossfade.html)
- [Sutherland-Hodgman vs Martinez](https://en.wikipedia.org/wiki/Sutherland%E2%80%93Hodgman_algorithm)

---

## Changelog

### v1.0 (2026-03-31)
- ✅ Integrated martinez-polygon-clipping v0.7.3
- ✅ Added `martinezIntersection()` method
- ✅ Added `getCrossfadePosition()` for position-based crossfade
- ✅ Updated `_mixAreas()` with intersection-based crossfade
- ✅ Added debug logging
- ✅ Fallback to equal distribution for 3+ areas
- ✅ Graceful fallback if martinez not loaded

---

**Next Steps:**
1. Test on mobile device with real GPS
2. Verify crossfade smoothness in field test
3. Consider caching optimization if performance issues arise
