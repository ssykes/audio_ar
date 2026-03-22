# Service Worker Refactor - Code Review & Refactoring Opportunities

**Status:** 📋 **Planned**
**Priority:** Medium (code quality + maintainability)
**Estimated Effort:** ~6 hours
**Risk:** Low (refactoring existing code, no functional changes)
**Date:** 2026-03-21

---

## 🎯 Overview

**Goal:** Improve code quality, reduce duplication, and optimize performance across service worker and related manager implementations.

**Problem Statement:**

| Issue | Impact | Severity |
|-------|--------|----------|
| Redundant logging (~65 lines) | Console spam, harder debugging | 🟡 Medium |
| Duplicate cache-first logic (~50 lines) | Maintenance burden, inconsistency | 🟡 Medium |
| Magic numbers (~20 instances) | Hard to tune/maintain | 🟢 Low |
| Verbose error handling (~40 lines) | Code bloat, repetition | 🟡 Medium |
| Missing constants (~15 occurrences) | Inconsistent naming, magic strings | 🟢 Low |
| Inefficient cache iteration (~25 lines) | Slow audio loading | 🔴 High |
| Unused methods (~10 lines) | Code clutter | 🟢 Low |
| Duplicated SW registration (~150 lines) | Maintenance burden | 🟡 Medium |

**Solution:** Systematic refactoring with extraction of helper functions, shared constants, and optimized algorithms.

---

## 📊 Code Review Findings

### Files Reviewed

| File | Lines | Purpose |
|------|-------|---------|
| `sw.js` | ~350 | Service Worker - cache-first strategy |
| `download_manager.js` | ~390 | OfflineDownloadManager - audio downloads |
| `spatial_audio.js` (CachedSampleSource) | ~120 | Offline audio playback |
| `spatial_audio.js` (HeadingManager) | ~200 | GPS + Compass hybrid |
| `soundscape_picker.html` | ~50 | SW registration |
| `map_player.html` | ~40 | SW registration |

**Total:** ~1,150 lines reviewed

---

## 🔍 Detailed Findings

### 1. Service Worker (`sw.js`)

#### 1.1 Redundant Logging (~25 lines)

**Location:** Lines 220-225

**Current Code:**
```javascript
console.log('[SW] Fetch:', url.href);
console.log('[SW] Request URL:', url.toString());
console.log('[SW] Request path:', url.pathname);
```

**Problem:** Three log statements repeat the same information (URL).

**Refactored:**
```javascript
console.log('[SW] 📄 Fetch request:', url.pathname, url.search);
```

**Benefit:** 2 fewer lines, same information, easier to scan.

---

#### 1.2 Duplicate Cache-First Logic (~30 lines)

**Location:** Lines 175-205 (map tiles) vs Lines 220-280 (general fetch)

**Current Code (Map Tiles):**
```javascript
// Try cache first
const cachedResponse = await caches.match(event.request);
if (cachedResponse) {
    console.log('[SW] 🗺️ ✅ CACHE HIT for tile:', url.pathname);
    return cachedResponse;
}

// Cache miss - fetch from network
console.log('[SW] 🗺️ 📦 CACHE MISS, fetching tile from network:', url.pathname);
try {
    const networkResponse = await fetch(event.request);
    if (networkResponse && networkResponse.status === 200) {
        const responseClone = networkResponse.clone();
        const cache = await caches.open(CACHE_NAME);
        cache.put(event.request, responseClone);
    }
    return networkResponse;
} catch (error) {
    // Return placeholder
}
```

**Current Code (General Fetch):**
```javascript
let cachedResponse = await caches.match(event.request);
if (!cachedResponse && url.search) {
    const basePath = url.origin + url.pathname;
    const baseRequest = new Request(basePath);
    cachedResponse = await caches.match(baseRequest);
}

return cachedResponse;
```

**Problem:** Cache-first pattern duplicated with minor variations.

**Refactored:**
```javascript
/**
 * Cache-first strategy with network fallback
 * @param {FetchEvent} event - Fetch event
 * @param {string} cacheName - Cache to use
 * @param {Object} options - Options (placeholder, logPrefix, etc.)
 * @returns {Promise<Response>}
 */
async function cacheFirstStrategy(event, cacheName, options = {}) {
    const {
        placeholder = null,
        logPrefix = '[SW]',
        shouldCache = true
    } = options;

    const cachedResponse = await caches.match(event.request);
    if (cachedResponse) {
        console.log(`${logPrefix} ✅ CACHE HIT:`, event.request.url);
        return cachedResponse;
    }

    console.log(`${logPrefix} 📦 CACHE MISS, fetching:`, event.request.url);

    try {
        const networkResponse = await fetch(event.request);
        if (shouldCache && networkResponse && networkResponse.status === 200) {
            const cache = await caches.open(cacheName);
            cache.put(event.request, networkResponse.clone());
        }
        return networkResponse;
    } catch (error) {
        if (placeholder) {
            return new Response(placeholder, {
                status: 200,
                headers: { 'Content-Type': 'image/svg+xml' }
            });
        }
        throw error;
    }
}
```

**Usage:**
```javascript
// Map tiles
if (url.hostname.includes('tile.openstreetmap.org')) {
    event.respondWith(
        cacheFirstStrategy(event, CACHE_NAME, {
            logPrefix: '[SW] 🗺️',
            placeholder: '<svg>Offline</svg>'
        })
    );
    return;
}

// General fetch
event.respondWith(
    cacheFirstStrategy(event, CACHE_NAME, {
        logPrefix: '[SW] 📄',
        shouldCache: url.origin === self.location.origin
    })
);
```

**Benefit:** ~30 lines removed, single source of truth, easier to test.

---

#### 1.3 Magic Numbers (~5 instances)

**Location:** Throughout file

**Current Code:**
```javascript
const timeoutMs = 5 * 60 * 1000; // 5 minutes
const switchDebounce = 2000; // Similar in HeadingManager
```

**Problem:** Hardcoded values require code changes to tune.

**Refactored:**
```javascript
// === Configuration Constants ===
const CONFIG = {
    DOWNLOAD_TIMEOUT_MS: 5 * 60 * 1000,  // 5 minutes for large audio files
    SWITCH_DEBOUNCE_MS: 2000,            // Min time between source switches
    MAX_RETRIES: 3,                      // Retry failed downloads
    RETRY_DELAY_MS: 1000                 // Base delay between retries
};
```

**Benefit:** Tunable without hunting through code, self-documenting.

---

#### 1.4 Verbose Error Handling (~20 lines)

**Location:** Lines 270-290

**Current Code:**
```javascript
.catch((error) => {
    console.error('[SW] ❌ Cache match failed:', error);
    return new Response('', { status: 200 });
})
// ... repeated 3x with identical logic
```

**Refactored:**
```javascript
/**
 * Handle fetch errors gracefully
 * @param {Error} error - Error to handle
 * @param {string} context - Error context for logging
 * @returns {Response} Empty 200 response
 */
function handleFetchError(error, context = 'Fetch') {
    console.error(`[SW] ❌ ${context} failed:`, error.message || error);
    return new Response('', { status: 200 });
}

// Usage
.catch(err => handleFetchError(err, 'Cache match'))
```

**Benefit:** ~15 lines removed, consistent error handling.

---

#### 1.5 Unused localStorage Reference

**Location:** `map_player.html` line 607

**Current Code:**
```javascript
const swReady = localStorage.getItem('sw_ready') === 'true';
```

**Problem:** Referenced but never actually used by SW itself.

**Recommendation:** Remove or document purpose. If needed for offline detection, move to shared utility.

---

### 2. OfflineDownloadManager (`download_manager.js`)

#### 2.1 Version Guard Redundancy (~10 lines)

**Location:** Lines 10-20

**Current Code:**
```javascript
window.DOWNLOAD_MANAGER_VERSION = '1.1';
console.log('[download_manager.js] Loading v' + window.DOWNLOAD_MANAGER_VERSION + '...');

class OfflineDownloadManager {
    constructor() {
        if (!window.DOWNLOAD_MANAGER_VERSION) {
            throw new Error('OfflineDownloadManager failed to load - file corruption detected');
        }
        // ...
    }
}
```

**Problem:** If file is corrupted, class won't load anyway. Guard adds minimal value.

**Refactored:**
```javascript
class OfflineDownloadManager {
    constructor() {
        // Version guard - helps detect loading issues
        console.log('[OfflineDownloadManager] Initializing...');
        // ...
    }
}
```

**Benefit:** 8 lines removed, same practical protection.

---

#### 2.2 Inconsistent Prefix Constants (~8 occurrences)

**Location:** Throughout file

**Current Code:**
```javascript
this.cacheName = `soundscape-${soundscapeId}`;
localStorage.setItem('offline_soundscape_full_' + soundscapeId, ...);
```

**Refactored:**
```javascript
class OfflineDownloadManager {
    constructor() {
        this.CACHE_PREFIX = 'soundscape-';
        this.STORAGE_KEY_PREFIX = 'offline_soundscape_full_';
        // ...
    }

    async downloadSoundscape(soundscapeId, ...) {
        this.cacheName = `${this.CACHE_PREFIX}${soundscapeId}`;
        // ...
        localStorage.setItem(this.STORAGE_KEY_PREFIX + soundscapeId, ...);
    }
}
```

**Benefit:** Consistent naming, easier to change prefix globally.

---

#### 2.3 Duplicate Progress Logic (~15 lines)

**Location:** Lines 70-80 vs 230-240

**Current Code:**
```javascript
// In downloadSoundscape()
percent: Math.round((downloaded / total) * 100)

// In _onProgress()
const percent = Math.round((downloaded / total) * 100);
```

**Refactored:**
```javascript
/**
 * Calculate download progress percentage
 * @param {number} downloaded - Files downloaded
 * @param {number} total - Total files
 * @returns {number} Percentage (0-100)
 */
_calculatePercent(downloaded, total) {
    return total > 0 ? Math.round((downloaded / total) * 100) : 0;
}

// Usage in both places
percent: this._calculatePercent(downloaded, total)
```

**Benefit:** Single calculation, consistent behavior.

---

#### 2.4 Verbose Timeout Handling (~10 lines)

**Location:** Lines 150-170

**Current Code:**
```javascript
const controller = new AbortController();
const timeoutMs = 5 * 60 * 1000;
const timeoutId = setTimeout(() => {
    console.error(`[OfflineDownload] ⏱️ Timeout after ${timeoutMs/1000}s`);
    controller.abort();
}, timeoutMs);

const response = await fetch(url, { signal: controller.signal });
clearTimeout(timeoutId);
```

**Refactored:**
```javascript
/**
 * Fetch with timeout
 * @param {string} url - URL to fetch
 * @param {number} timeoutMs - Timeout in ms
 * @returns {Promise<Response>}
 */
async _fetchWithTimeout(url, timeoutMs = CONFIG.DOWNLOAD_TIMEOUT_MS) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
        console.error(`[OfflineDownload] ⏱️ Timeout after ${timeoutMs/1000}s:`, url);
        controller.abort();
    }, timeoutMs);

    try {
        return await fetch(url, { signal: controller.signal });
    } finally {
        clearTimeout(timeoutId);
    }
}
```

**Benefit:** Reusable, DRY, easier to test.

---

#### 2.5 Unused `getProgress()` Method

**Location:** Lines 310-315

**Current Code:**
```javascript
getProgress(soundscapeId) {
    return this.downloadQueue.get(soundscapeId) || null;
}
```

**Problem:** Grep search found 0 uses in codebase.

**Recommendation:** Remove or add usage.

---

#### 2.6 Inefficient `getTotalCacheSize()` (~25 lines)

**Location:** Lines 340-365

**Current Code:**
```javascript
async getTotalCacheSize() {
    const cached = await this.getAllCachedSoundscapes();
    let totalSize = 0;

    for (const { id } of cached) {
        const cache = await caches.open(cacheName);
        const requests = await cache.keys();

        for (const request of requests) {
            const response = await cache.match(request);
            const blob = await response.blob();
            totalSize += blob.size;  // Very slow!
        }
    }

    return totalSize;
}
```

**Problem:** Opens every cache, reads every response, converts to blob - extremely slow for large caches.

**Refactored:**
```javascript
// Store size metadata during download
async _storeSoundscapeData(soundscapeId, data) {
    // ... existing code ...
    // Also store estimated size
    const totalSize = data.downloadedFiles.reduce((sum, file) => sum + file.size, 0);
    localStorage.setItem(this.STORAGE_KEY_PREFIX + 'size_' + soundscapeId, totalSize.toString());
}

// Read from metadata (instant)
async getTotalCacheSize() {
    let totalSize = 0;
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key.startsWith(this.STORAGE_KEY_PREFIX + 'size_')) {
            totalSize += parseInt(localStorage.getItem(key));
        }
    }
    return totalSize;
}
```

**Benefit:** O(n) → O(1) lookup, no blob operations.

---

### 3. CachedSampleSource (`spatial_audio.js`)

#### 3.1 Inefficient Cache Iteration (~20 lines) - 🔴 HIGH PRIORITY

**Location:** Lines 730-760

**Current Code:**
```javascript
async _getCachedResponse() {
    const cacheNames = await caches.keys();

    for (const cacheName of cacheNames) {
        if (!cacheName.startsWith('soundscape-')) {
            continue;
        }

        const cache = await caches.open(cacheName);  // ⚠️ Opens every cache
        const response = await cache.match(this.url);

        if (response) {
            return response;
        }
    }

    return null;
}
```

**Problem:** Opens every soundscape cache sequentially, even if sound is in first cache checked.

**Refactored (Option 1 - Parallel):**
```javascript
async _getCachedResponse() {
    const cacheNames = await caches.keys();
    const soundscapeCaches = cacheNames.filter(name =>
        name.startsWith(this.CACHE_PREFIX)
    );

    // Check all caches in parallel
    const matchPromises = soundscapeCaches.map(async (cacheName) => {
        try {
            const cache = await caches.open(cacheName);
            return await cache.match(this.url);
        } catch (err) {
            console.warn('[CachedSampleSource] Cache error:', cacheName, err);
            return null;
        }
    });

    const results = await Promise.all(matchPromises);
    const found = results.find(r => r !== null);

    if (found) {
        console.log('[CachedSampleSource] ✅ Found in cache');
        return found;
    }

    return null;
}
```

**Refactored (Option 2 - Promise.any - Modern):**
```javascript
async _getCachedResponse() {
    const cacheNames = await caches.keys();
    const soundscapeCaches = cacheNames.filter(name =>
        name.startsWith(this.CACHE_PREFIX)
    );

    try {
        // Promise.any returns first successful match
        return await Promise.any(
            soundscapeCaches.map(name =>
                caches.open(name).then(cache => cache.match(this.url))
            )
        );
    } catch (err) {
        console.log('[CachedSampleSource] 🌐 Not found in any cache');
        return null;
    }
}
```

**Benefit:** 3-10x faster for soundscapes with many audio files.

---

#### 3.2 Missing Cache Prefix Constant

**Location:** Line 740

**Current Code:**
```javascript
if (!cacheName.startsWith('soundscape-')) {
```

**Refactored:**
```javascript
// Import from OfflineDownloadManager or define shared constant
const CACHE_PREFIX = 'soundscape-';

if (!cacheName.startsWith(CACHE_PREFIX)) {
```

**Benefit:** Consistent with download manager.

---

#### 3.3 Verbose Logging (~15 lines)

**Location:** Lines 680-780

**Current Code:**
```javascript
console.log('[CachedSampleSource] Array buffer size:', arrayBuffer.byteLength, 'bytes',
           '(~' + (arrayBuffer.byteLength / 1024 / 1024).toFixed(2) + ' MB)');
console.log('[CachedSampleSource] ✅ Loaded:', this.url,
           'Duration:', audioBuffer.duration.toFixed(2) + 's',
           'Sample rate:', audioBuffer.sampleRate,
           'Channels:', audioBuffer.numberOfChannels);
```

**Refactored:**
```javascript
console.log('[CachedSampleSource] 📦 Loaded:', {
    url: this.url,
    size: (arrayBuffer.byteLength / 1024 / 1024).toFixed(2) + ' MB',
    duration: audioBuffer.duration.toFixed(2) + 's',
    sampleRate: audioBuffer.sampleRate,
    channels: audioBuffer.numberOfChannels
});
```

**Benefit:** Structured logging, easier to parse, 5 fewer lines.

---

### 4. HeadingManager (`spatial_audio.js`)

#### 4.1 Magic Numbers in Constructor

**Location:** Lines 1590-1600

**Current Code:**
```javascript
this.maxSamples = options.maxSamples || 10;
this.minSpeed = options.minSpeed || 1.0;      // m/s
this.stopSpeed = options.stopSpeed || 0.3;    // m/s
this.stabilityThreshold = options.stabilityThreshold || 15; // degrees
this.minStableCount = options.minStableCount || 3;
```

**Refactored:**
```javascript
const HEADING_CONFIG = {
    MAX_SAMPLES: 10,           // GPS samples for smoothing
    MIN_SPEED_MS: 1.0,         // Must exceed to trust GPS (3.6 km/h)
    STOP_SPEED_MS: 0.3,        // Below this = stationary
    STABILITY_THRESHOLD_DEG: 15, // Degrees variance for stability
    MIN_STABLE_COUNT: 3        // Consecutive stable readings
};

constructor(options = {}) {
    this.maxSamples = options.maxSamples ?? HEADING_CONFIG.MAX_SAMPLES;
    this.minSpeed = options.minSpeed ?? HEADING_CONFIG.MIN_SPEED_MS;
    // ...
}
```

**Benefit:** Self-documenting, tunable in one place.

---

#### 4.2 DEBUG Logging

**Location:** Line 1674

**Current Code:**
```javascript
// DEBUG
console.log('[HeadingManager] Compass update:', alpha.toFixed(1) + '°, useGPS:', this.useGPS, 'gpsHeading:', this.gpsHeading);
```

**Refactored:**
```javascript
// Use debug logger with log levels (if available)
if (window.debugLogger && window.debugLogger.isLevelEnabled('debug')) {
    window.debugLogger.debug('heading-manager', 'Compass update', {
        alpha,
        useGPS: this.useGPS,
        gpsHeading: this.gpsHeading
    });
}
```

**Benefit:** Can be disabled in production, structured output.

---

#### 4.3 Duplicate Angle Logic

**Location:** Lines 1720-1740

**Current Code:**
```javascript
// Handle wraparound (359° vs 1°)
let diff = Math.abs(h - avg);
if (diff > 180) diff = 360 - diff;
```

**Refactored:**
```javascript
/**
 * Normalize angle difference (handle wraparound)
 * @param {number} angle - Angle in degrees
 * @returns {number} Normalized angle (0-360)
 */
_normalizeAngle(angle) {
    angle = angle % 360;
    if (angle < 0) angle += 360;
    return angle;
}

/**
 * Calculate shortest angle difference
 * @param {number} a1 - Angle 1
 * @param {number} a2 - Angle 2
 * @returns {number} Difference (0-180)
 */
_angleDifference(a1, a2) {
    const diff = Math.abs(this._normalizeAngle(a1) - this._normalizeAngle(a2));
    return diff > 180 ? 360 - diff : diff;
}

// Usage in _calculateVariance
const diff = this._angleDifference(h, avg);
```

**Benefit:** Reusable, tested once, works everywhere.

---

### 5. HTML Files

#### 5.1 Duplicated SW Registration (~150 lines)

**Location:** `soundscape_picker.html` lines 517-570, `map_player.html` lines 462-500

**Current Code:** Nearly identical with minor variations in error handling and status updates.

**Refactored:**
```javascript
// sw-register.js (shared module)
(function() {
    'use strict';

    const SW_URL = 'sw.js';
    const CACHE_VERSION = 'audio-ar-v';

    /**
     * Register service worker with update checking
     * @param {Object} options - Callbacks (onReady, onUpdate, onError)
     */
    function registerServiceWorker(options = {}) {
        if (!('serviceWorker' in navigator)) {
            console.warn('[SW] Service Worker not supported');
            options.onError?.(new Error('Not supported'));
            return;
        }

        const version = new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 14);
        const swUrl = `${SW_URL}?v=${version}`;

        navigator.serviceWorker.register(swUrl)
            .then(registration => {
                console.log('[SW] ✅ Registered:', registration.scope);
                options.onReady?.(registration);

                // Check for updates
                if (navigator.onLine) {
                    registration.update();
                }
            })
            .catch(error => {
                console.error('[SW] ❌ Registration failed:', error);
                options.onError?.(error);
            });
    }

    // Export
    window.registerServiceWorker = registerServiceWorker;
})();

// Usage in HTML files
<script src="sw-register.js"></script>
<script>
    registerServiceWorker({
        onReady: (reg) => {
            console.log('SW ready');
            localStorage.setItem('sw_ready', 'true');
        },
        onUpdate: (reg) => {
            console.log('SW update available');
        },
        onError: (err) => {
            console.error('SW error:', err);
        }
    });
</script>
```

**Benefit:** ~100 lines removed, consistent behavior, easier to maintain.

---

## 📋 Implementation Plan

### Phase 1: Extract Constants (1 hour)

**Files:** `sw.js`, `download_manager.js`, `spatial_audio.js`

**Tasks:**
- Define `CONFIG` objects at top of each file
- Replace magic numbers with named constants
- Add JSDoc comments explaining units and ranges

**Testing:** Verify behavior unchanged (constants match original values).

---

### Phase 2: Extract Helper Functions (2 hours)

**Files:** `sw.js`, `download_manager.js`, `spatial_audio.js`

**Tasks:**
- Extract `cacheFirstStrategy()` in `sw.js`
- Extract `_fetchWithTimeout()` in `download_manager.js`
- Extract `_normalizeAngle()` and `_angleDifference()` in `spatial_audio.js`
- Extract `handleFetchError()` in `sw.js`

**Testing:** Unit test each helper function in isolation.

---

### Phase 3: Optimize Cache Checking (1 hour) - 🔴 HIGH PRIORITY

**Files:** `spatial_audio.js`

**Tasks:**
- Refactor `_getCachedResponse()` to use `Promise.all()` or `Promise.any()`
- Add `CACHE_PREFIX` constant
- Add performance logging (measure before/after)

**Testing:**
- Profile cache lookup time (should be 3-10x faster)
- Verify offline playback still works
- Test with 10+ audio files

---

### Phase 4: Remove Redundancy (1.5 hours)

**Files:** All files

**Tasks:**
- Remove duplicate logging statements
- Consolidate error handling
- Remove unused methods (`getProgress()`)
- Remove version guard redundancy

**Testing:** Verify console output still useful, errors still caught.

---

### Phase 5: Shared SW Registration (1.5 hours)

**Files:** Create `sw-register.js`, update HTML files

**Tasks:**
- Create `sw-register.js` module
- Update `soundscape_picker.html` to use module
- Update `map_player.html` to use module
- Remove duplicate registration code

**Testing:**
- Verify SW registers on both pages
- Test offline mode
- Verify update detection works

---

## 📊 Summary

### Lines Affected

| File | Current | After | Reduction |
|------|---------|-------|-----------|
| `sw.js` | ~350 | ~280 | -70 |
| `download_manager.js` | ~390 | ~340 | -50 |
| `spatial_audio.js` | ~120 | ~100 | -20 |
| HTML files | ~150 | ~50 | -100 |
| **Total** | **~1,010** | **~770** | **-240 (24%)** |

### Benefits

| Benefit | Description |
|---------|-------------|
| **Maintainability** | Single source of truth for common patterns |
| **Performance** | 3-10x faster cache checking |
| **Readability** | Named constants, structured logging |
| **Testability** | Isolated helper functions |
| **Consistency** | Shared SW registration, common prefixes |
| **Tunability** | Configuration constants in one place |

---

## ✅ Testing Checklist

| Test | Expected Result | Status |
|------|-----------------|--------|
| Service Worker registers | No errors in console | ⬜ |
| Offline mode works | Pages load without network | ⬜ |
| Audio plays offline | Cached sounds work | ⬜ |
| Cache lookup faster | Profile shows 3-10x improvement | ⬜ |
| No console spam | Structured, useful logs only | ⬜ |
| Error handling works | Graceful degradation | ⬜ |
| SW updates detected | Auto-reload on new version | ⬜ |
| All browsers work | Chrome, Firefox, Safari | ⬜ |

---

## 🔗 Related Features

- **Feature 15:** Offline Soundscape Download (prerequisite)
- **Feature 16:** Service Worker Refactor (this feature)
- **Feature 17:** Distance Envelope Behavior (future)

---

## 📝 References

- **MDN Service Worker API:** https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API
- **Cache API:** https://developer.mozilla.org/en-US/docs/Web/API/Cache
- **Promise.any():** https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/any
- **Current SW Docs:** `SERVICE_WORKER_DOCUMENTATION.md`
- **Feature 14 Example:** `FEATURE_14_IMPLEMENTED.md` (format reference)

---

**Status:** 📋 **Ready for Implementation**
**Priority:** Medium
**Recommended Owner:** Any developer (well-documented, low risk)
