# Listener Drift Compensation

**Created:** 2026-03-17  
**Status:** 📋 Planned (Brainstorm/Implementation Notes)  
**Priority:** Medium (improves UX, not critical)  
**Estimated Effort:** ~200 lines, 2-3 hours

---

## Problem Statement

**Current Behavior:**
- GPS/BLE position noise causes sound sources to "float" or drift
- User standing still perceives sound moving 2-5m randomly
- Distracting immersion break, especially in stationary listening scenarios

**Root Cause:**
- GPS accuracy: 3-10m random walk
- BLE RSSI fluctuation: ±3-10 dBm noise
- Audio engine treats all position updates as real movement
- No differentiation between actual movement and sensor noise

---

## Solution: Dynamic Listener Compensation

**Core Concept:**
Instead of stabilizing the **sound source** (which drifts), move the **virtual listener** in the opposite direction to cancel out drift.

```
┌─────────────────────────────────────────────────────────────┐
│  GPS says user moved 2m right (but actually stationary)     │
│                                                             │
│  Normal approach:                                           │
│  🎵 Sound ←─── 2m ───→ 🚶 Listener                          │
│  (Sound appears to drift left)                              │
│                                                             │
│  Compensation approach:                                     │
│  🎵 Sound ─── 2m ───→ 🚶 Listener (virtual)                 │
│  (Move listener back → sound stays stable)                  │
└─────────────────────────────────────────────────────────────┘
```

---

## Implementation Approaches

### Approach 1: Exponential Moving Average (EMA) Smoothing

**Description:** Apply low-pass filter to listener position updates

**Code:**
```javascript
// spatial_audio_app.js - Add to constructor
this.smoothedListenerLat = 0;
this.smoothedListenerLon = 0;
this.smoothingFactor = 0.1;  // 0.1 = heavy smoothing, 0.9 = minimal

/**
 * Update listener position with drift compensation
 */
updateListenerPosition(lat, lon, heading) {
    // Exponential Moving Average
    const smoothedLat = (this.smoothingFactor * lat) + 
                       ((1 - this.smoothingFactor) * this.smoothedListenerLat);
    const smoothedLon = (this.smoothingFactor * lon) + 
                       ((1 - this.smoothingFactor) * this.smoothedListenerLon);
    
    this.smoothedListenerLat = smoothedLat;
    this.smoothedListenerLon = smoothedLon;
    
    // Update audio engine with smoothed position
    if (this.engine && this.listener) {
        this.engine.updateListenerPosition(
            this.smoothedListenerLat,
            this.smoothedListenerLon,
            heading
        );
        
        this.listener.lat = this.smoothedListenerLat;
        this.listener.lon = this.smoothedListenerLon;
        this.listener.heading = heading;
    }
    
    // Update UI with raw position (user sees actual GPS)
    this._updateGPSDisplay(lat, lon, heading);
}
```

**Tuning:**
| `smoothingFactor` | Effect | Latency | Use Case |
|-------------------|--------|---------|----------|
| 0.05 | Very stable | High (~2s) | Static installations |
| 0.1 | Stable | Medium (~1s) | Outdoor sound walks |
| 0.3 | Responsive | Low (~300ms) | Active experiences |
| 0.5+ | Minimal smoothing | Very low | Moving experiences |

**Pros:**
- ✅ Simple to implement (~20 lines)
- ✅ Low computational cost
- ✅ Tunable via single parameter

**Cons:**
- ⚠️ Always introduces some latency
- ⚠️ Can't distinguish real movement from noise

---

### Approach 2: Moving Average Filter

**Description:** Average last N position samples

**Code:**
```javascript
// spatial_audio_app.js - Add to constructor
this.positionHistory = [];
this.historySize = 10;  // Average last 10 positions

_smoothListenerPosition(lat, lon) {
    this.positionHistory.push({ lat, lon });
    if (this.positionHistory.length > this.historySize) {
        this.positionHistory.shift();
    }
    
    const avg = this.positionHistory.reduce(
        (acc, pos) => ({ lat: acc.lat + pos.lat, lon: acc.lon + pos.lon }),
        { lat: 0, lon: 0 }
    );
    
    return {
        lat: avg.lat / this.positionHistory.length,
        lon: avg.lon / this.positionHistory.length
    };
}
```

**Tuning:**
| `historySize` | Effect | Latency |
|---------------|--------|---------|
| 3-5 | Light smoothing | Low (~300-500ms) |
| 10-15 | Moderate smoothing | Medium (~1-1.5s) |
| 20+ | Heavy smoothing | High (~2-3s) |

**Pros:**
- ✅ Very stable output
- ✅ No exponential decay artifacts

**Cons:**
- ⚠️ Higher latency than EMA
- ⚠️ Requires more memory (array storage)

---

### Approach 3: Stationary Detection (Adaptive Smoothing)

**Description:** Detect when user is stationary vs moving, adjust smoothing dynamically

**Code:**
```javascript
// spatial_audio_app.js - Add to constructor
this.lastMovementTime = 0;
this.movementThreshold = 0.5;  // m/s
this.isStationary = false;
this.stationaryThreshold = 2000;  // ms

updateListenerPosition(lat, lon, heading) {
    const now = Date.now();
    
    // Calculate movement speed
    const distance = this._calculateDistance(
        this.smoothedListenerLat,
        this.smoothedListenerLon,
        lat,
        lon
    );
    const timeDiff = (now - this.lastMovementTime) / 1000;
    const speed = distance / timeDiff;
    
    // Detect if stationary
    if (speed < this.movementThreshold) {
        this.isStationary = true;
    } else {
        this.isStationary = false;
        this.lastMovementTime = now;
    }
    
    // Apply aggressive smoothing when stationary, minimal when moving
    const targetSmoothing = this.isStationary ? 0.05 : 0.3;
    this.smoothingFactor = this._lerp(
        this.smoothingFactor,
        targetSmoothing,
        0.1
    );
    
    // Continue with smoothing
    const smoothed = this._smoothListenerPosition(lat, lon);
    // ... rest of update logic
}

_lerp(start, end, t) {
    return start + (end - start) * t;
}

_calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3;
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;
    
    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    
    return R * c;
}
```

**Pros:**
- ✅ Smart adaptation to user behavior
- ✅ Low latency when moving, high stability when still
- ✅ Best of both worlds

**Cons:**
- ⚠️ More complex tuning (3 parameters)
- ⚠️ Requires accurate speed detection

---

### Approach 4: Anchor Point System (User-Controlled Locking)

**Description:** User manually sets anchor point, system compensates drift beyond threshold

**Code:**
```javascript
// spatial_audio_app.js - Add to constructor
this.anchorPoint = null;  // {lat, lon, timestamp}
this.maxDriftRadius = 2.0;  // meters
this.useAnchoring = true;

/**
 * Set anchor point (call when user is stationary)
 */
setAnchorPoint() {
    this.anchorPoint = {
        lat: this.rawListenerLat,
        lon: this.rawListenerLon,
        timestamp: Date.now()
    };
    this.debugLog('⚓ Anchor point set');
}

/**
 * Clear anchor point (call when user starts moving)
 */
clearAnchorPoint() {
    this.anchorPoint = null;
    this.debugLog('⚓ Anchor point cleared');
}

updateListenerPosition(lat, lon, heading) {
    let finalLat = lat;
    let finalLon = lon;
    
    if (this.useAnchoring && this.anchorPoint) {
        // Calculate drift from anchor
        const drift = this._calculateDistance(
            this.anchorPoint.lat,
            this.anchorPoint.lon,
            lat,
            lon
        );
        
        // If drift exceeds threshold, compensate
        if (drift > this.maxDriftRadius) {
            // Pull position back toward anchor
            const angle = this._bearingTo(
                lat, lon,
                this.anchorPoint.lat, this.anchorPoint.lon
            );
            const compensationDistance = drift - this.maxDriftRadius;
            
            finalLat = this._offsetByDistance(lat, lon, angle, -compensationDistance);
            finalLon = this._offsetByDistance(lon, lat, angle + 90, -compensationDistance);
            
            this.debugLog(`⚓ Compensating ${drift.toFixed(1)}m drift`);
        }
    }
    
    // Apply smoothing to compensated position
    const smoothed = this._smoothListenerPosition(finalLat, finalLon);
    // ... rest of update logic
}

_bearingTo(lat1, lon1, lat2, lon2) {
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;
    
    const y = Math.sin(Δλ) * Math.cos(φ2);
    const x = Math.cos(φ1) * Math.sin(φ2) -
              Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
    const θ = Math.atan2(y, x);
    
    return ((θ * 180 / Math.PI) + 360) % 360;
}

_offsetByDistance(lat, lon, bearing, distance) {
    const R = 6371e3;
    const φ1 = lat * Math.PI / 180;
    const λ1 = lon * Math.PI / 180;
    const δ = distance / R;
    const θ = bearing * Math.PI / 180;
    
    const φ2 = Math.asin(Math.sin(φ1) * Math.cos(δ) +
                        Math.cos(φ1) * Math.sin(δ) * Math.cos(θ));
    const λ2 = λ1 + Math.atan2(Math.sin(θ) * Math.sin(δ) * Math.cos(φ1),
                               Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2));
    
    return φ2 * 180 / Math.PI;
}
```

**UI Integration:**
```html
<!-- map_player.html - Add buttons -->
<button id="lockPositionBtn" class="btn">🔒 Lock Position</button>
<button id="unlockPositionBtn" class="btn" style="display:none;">🔓 Unlock</button>

<script>
// map_player.js
document.getElementById('lockPositionBtn')?.addEventListener('click', () => {
    this.audioApp.setAnchorPoint();
    document.getElementById('lockPositionBtn').style.display = 'none';
    document.getElementById('unlockPositionBtn').style.display = 'block';
});

document.getElementById('unlockPositionBtn')?.addEventListener('click', () => {
    this.audioApp.clearAnchorPoint();
    document.getElementById('lockPositionBtn').style.display = 'block';
    document.getElementById('unlockPositionBtn').style.display = 'none';
});
</script>
```

**Pros:**
- ✅ Maximum stability when locked
- ✅ User has explicit control
- ✅ No latency when unlocked

**Cons:**
- ⚠️ Requires user interaction
- ⚠️ Can forget to unlock when moving

---

## Configuration Recommendations

| Scenario | Approach | Parameters |
|----------|----------|------------|
| **Outdoor sound walk** | EMA + Stationary detection | `smoothingFactor`: 0.1-0.2, `maxDriftRadius`: 3-5m |
| **Indoor installation** | EMA | `smoothingFactor`: 0.05-0.1 |
| **Static exhibit** | Anchor point | `maxDriftRadius`: 0.5-1m |
| **Moving experience** | Minimal smoothing | `smoothingFactor`: 0.3-0.5 |
| **Mixed use** | Stationary detection | Auto-adaptive |

---

## Expected Results

| Metric | Before Compensation | After Compensation |
|--------|---------------------|--------------------|
| **Perceived drift** | 3-5m random walk | 0.5-1m stable |
| **User experience** | Noticeable floatiness | Minimal movement |
| **Stationary stability** | Distracting | Rock-solid |
| **Moving responsiveness** | N/A | Preserved (with adaptive smoothing) |

---

## Testing Protocol

### 1. Stationary Test
```javascript
// Open browser console
const app = window.audioApp;

// Set aggressive smoothing
app.smoothingFactor = 0.05;

// Stand in one spot for 60 seconds
// Observe: Sound should stay within 1m radius
```

### 2. Movement Test
```javascript
// Walk in straight line for 20m
// Observe: Sound positions should update smoothly, no lag

// Walk back and forth
// Observe: No "rubber banding" or delayed updates
```

### 3. Anchor Point Test
```javascript
// Set anchor point
app.setAnchorPoint();

// Walk in small circle (2m radius)
// Observe: Sound stays fixed despite GPS drift

// Clear anchor point
app.clearAnchorPoint();

// Observe: Normal behavior resumes
```

### 4. Debug Logging
```javascript
// Monitor drift compensation
app.debugLog = (msg) => {
    if (msg.includes('⚓') || msg.includes('📊')) {
        console.log(msg);
    }
};
```

---

## Integration with Existing Features

### Session 13: Lazy Loading
- Drift compensation runs **before** zone detection
- Smoothed position used for active/preload/unload decisions
- Prevents sounds from rapidly loading/unloading due to GPS noise

### Session 10: Icon Bar UI
- Add "Lock Position" button to icon bar (optional)
- Show drift compensation status in debug modal
- GPS/heading display shows raw (unsmoothed) position

### Session 5E: Auto-Sync
- No interaction (drift compensation is client-side only)

---

## Trade-offs Summary

| Approach | Complexity | Latency | Stability | User Control |
|----------|------------|---------|-----------|--------------|
| **EMA** | Low (~20 lines) | Medium | Good | None |
| **Moving Average** | Low (~30 lines) | High | Very Good | None |
| **Stationary Detection** | Medium (~60 lines) | Adaptive | Excellent | None |
| **Anchor Point** | Medium (~80 lines) | None (when locked) | Perfect | Manual |

**Recommended:** Start with **EMA (Approach 1)** for simplicity, then upgrade to **Stationary Detection (Approach 3)** if needed.

---

## Files to Modify

| File | Changes | Lines |
|------|---------|-------|
| `spatial_audio_app.js` | Add drift compensation methods | ~100 |
| `map_player.html` | Optional: Lock/Unlock buttons | ~20 |
| `map_player.js` | Optional: Button handlers | ~30 |
| `map_shared.js` | Update GPS callback to use compensated position | ~10 |
| **Total** | | **~160 lines** |

---

## Implementation Checklist

- [ ] Add EMA smoothing to `spatial_audio_app.js`
- [ ] Tune `smoothingFactor` parameter (start with 0.1)
- [ ] Test stationary stability (60s test)
- [ ] Test movement responsiveness (walk test)
- [ ] Add debug logging for drift compensation
- [ ] Optional: Add anchor point UI buttons
- [ ] Optional: Add stationary detection (adaptive smoothing)
- [ ] Update version numbers + cache busting
- [ ] Test on mobile devices (GPS performance)
- [ ] Document in QWEN.md

---

## Future Enhancements

| Enhancement | Description | Effort |
|-------------|-------------|--------|
| **Kalman filter** | Optimal sensor fusion (GPS + accelerometer) | ~150 lines |
| **BLE + GPS fusion** | Use BLE indoors, GPS outdoors | ~100 lines |
| **ML-based prediction** | Predict movement trajectory | ~200 lines |
| **Multi-sensor fusion** | GPS + compass + accelerometer + gyroscope | ~250 lines |
| **Configurable profiles** | UI to select smoothing preset | ~50 lines |

---

## References

- **Haversine Formula:** https://en.wikipedia.org/wiki/Haversine_formula
- **Exponential Moving Average:** https://en.wikipedia.org/wiki/Moving_average#Exponential_moving_average
- **Kalman Filtering:** https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/
- **GPS Accuracy Studies:** https://www.gps.gov/systems/gps/performance/accuracy/

---

## Related Sessions

- **Session 10:** Icon bar UI redesign (add lock button if implementing anchor points)
- **Session 13:** Lazy loading for sound walks (uses listener position for zone detection)
- **Session 5E:** Auto-sync with timestamps (unrelated, but documented for completeness)

---

**Status:** 📋 Ready for implementation (brainstorm complete)

**Next Steps:**
1. Review approaches with team
2. Select initial approach (recommend EMA)
3. Implement in `spatial_audio_app.js`
4. Test on target devices
5. Tune parameters based on feedback
