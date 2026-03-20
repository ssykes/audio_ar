# Session-Based Cached Streaming Architecture

**Version:** 1.1  
**Date:** 2026-03-19  
**Status:** In Development

---

## Problem Statement

### The Core Issue: Large Files Break Lazy Loading

**Current Behavior (Lazy Loading):**
```
User walks toward waypoint (5 MB file)
        ↓
Lazy load triggers at 100m (preload zone)
        ↓
Download starts: 8 seconds (4G) + 0.5s decode = 8.5 seconds
        ↓
User arrives at waypoint BEFORE file loads
        ↓
❌ 2-3 second gap in audio (user walks 3-4m in silence)
```

**User Impact:**
| File Size | Download (4G) | Walk Distance in Silence | Noticeable? |
|-----------|---------------|-------------------------|-------------|
| 500 KB | 0.4s | 0.6m | ❌ No |
| 1 MB | 0.8s | 1.2m | ⚠️ Maybe |
| 3 MB | 2.4s | 3.6m | ✅ Yes (breaks immersion) |
| 5 MB | 4s | 6m | ✅ Yes (very noticeable) |

### Additional Problems

1. **Revisit Penalty**: User revisits waypoint during session → re-downloads same file
2. **Offline Failure**: Lazy loading requires network - fails when user goes offline
3. **No Session Memory**: Each waypoint approach treated as first visit

---

## Solution: CachedStreamSource with Session Cache

### Core Design

```
┌─────────────────────────────────────────────────────────────┐
│  Lazy Loading with Session Cache                            │
│                                                             │
│  User approaches waypoint                                   │
│          ↓                                                  │
│  Check: Is file in session cache?                           │
│          ↓                                                  │
│  ✅ YES → Play from cache (instant)                         │
│          ↓                                                  │
│  ❌ NO → Stream immediately + cache in background           │
│          ↓                                                  │
│  User revisits waypoint → Play from cache (instant)         │
└─────────────────────────────────────────────────────────────┘
```

### Key Principles

1. **No Upfront Download** - Don't download all files when soundscape selected
2. **Lazy Load with Cache** - "Cached? Play from cache : Stream + cache"
3. **One Soundscape at a Time** - Cache holds single soundscape, evict on:
   - Browser refresh (automatic - Map is in-memory)
   - New soundscape selection (manual clear)
4. **Session Duration Only** - Cache doesn't persist across sessions

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│  User Experience Flow                                       │
│                                                             │
│  1. User selects soundscape                                 │
│     - NO download yet (fast selection)                      │
│     - Metadata loaded (waypoint positions, URLs)            │
│                                                             │
│  2. User taps "▶️ Start"                                    │
│     - Lazy loading begins                                   │
│     - Approaches waypoint 1 (100m away)                     │
│     - Check cache → Not cached                              │
│     - Stream immediately (3-5s startup)                     │
│     - Cache downloaded file in background                   │
│                                                             │
│  3. User revisits waypoint 1                                │
│     - Check cache → Cached! ✅                              │
│     - Play from cache (instant)                             │
│     - No re-download                                        │
│                                                             │
│  4. User walks to waypoint 2                                │
│     - Check cache → Not cached                              │
│     - Stream + cache (same as waypoint 1)                   │
│                                                             │
│  5. User switches to different soundscape                   │
│     - Session cache cleared                                 │
│     - New soundscape lazy loads (fresh start)               │
│                                                             │
│  6. User refreshes browser                                  │
│     - Session cache auto-cleared (Map garbage collected)    │
│     - Fresh start                                           │
└─────────────────────────────────────────────────────────────┘
```

---

## Component Design

### 1. SessionCacheManager

**Purpose:** In-memory cache for audio files during single soundscape session

**Key Features:**
- JavaScript `Map` (auto-cleared on page refresh via garbage collection)
- Size tracking (warn if exceeds 100 MB)
- One soundscape at a time (manual clear on switch)

```javascript
class SessionCacheManager {
    constructor() {
        this.cache = new Map();  // URL → ArrayBuffer
        this.currentSoundscapeId = null;
        this.maxSessionSize = 100 * 1024 * 1024;  // 100 MB
    }
    
    async set(url, arrayBuffer) {
        const size = arrayBuffer.byteLength;
        const currentSize = await this.getSize();
        
        if (currentSize + size > this.maxSessionSize) {
            console.warn('[SessionCache] Would exceed 100 MB, skipping cache');
            return false;
        }
        
        this.cache.set(url, arrayBuffer);
        console.log(`[SessionCache] Cached: ${url} (${(size/1024/1024).toFixed(2)} MB)`);
        return true;
    }
    
    async get(url) {
        return this.cache.get(url) || null;
    }
    
    async getSize() {
        let total = 0;
        this.cache.forEach(buffer => total += buffer.byteLength);
        return total;
    }
    
    async clear() {
        const size = await this.getSize();
        this.cache.clear();
        console.log(`[SessionCache] Cleared ${(size/1024/1024).toFixed(2)} MB`);
    }
    
    async clearForNewSoundscape(newSoundscapeId) {
        if (this.currentSoundscapeId !== newSoundscapeId) {
            await this.clear();
            this.currentSoundscapeId = newSoundscapeId;
            console.log('[SessionCache] Switched soundscape, cleared cache');
        }
    }
}
```

**Storage Behavior:**

| Event | Cache Action |
|-------|--------------|
| Page load | Empty Map created |
| Soundscape selected | Cache still empty (no download yet) |
| User approaches waypoint 1 | Check cache → Stream + cache |
| User revisits waypoint 1 | Check cache → Play from cache (instant) |
| Soundscape switched | Cache cleared manually |
| Page refresh | Map auto-cleared (JavaScript GC) |
| Tab closed | Map auto-cleared |

---

### 2. StreamSource (Phase 2)

**Purpose:** Stream audio directly from network (no caching)

**Use Cases:**
- External URLs (Spotify, radio stations, podcasts)
- API endpoints (dynamic generation)
- Live streams
- Cross-origin content (can't cache due to CORS)

```javascript
class StreamSource extends GpsSoundSource {
    constructor(engine, id, options = {}) {
        super(engine, id, options);
        this.url = options.url;
        this.loop = options.loop || false;
        this.audio = null;
        this.mediaSource = null;
    }
    
    async load() {
        console.log('[StreamSource] Streaming:', this.url);
        
        // Use MediaSource API for progressive playback
        this.mediaSource = new MediaSource();
        this.audio = new Audio();
        this.audio.src = URL.createObjectURL(this.mediaSource);
        this.audio.loop = this.loop;
        
        return new Promise((resolve) => {
            this.mediaSource.addEventListener('sourceopen', async () => {
                try {
                    const sourceBuffer = this.mediaSource.addSourceBuffer('audio/mpeg');
                    const response = await fetch(this.url);
                    
                    if (!response.ok) throw new Error(`HTTP ${response.status}`);
                    
                    const reader = response.body.getReader();
                    const { done, value } = await reader.read();
                    
                    if (done) { resolve(false); return; }
                    
                    sourceBuffer.appendBuffer(value);
                    
                    sourceBuffer.addEventListener('updateend', () => {
                        if (this.audio.buffered.length > 0) {
                            this.audio.play().then(() => {
                                console.log('[StreamSource] ▶️ Streaming started');
                                this._continueBuffering(reader, sourceBuffer);
                                resolve(true);
                            }).catch(() => resolve(false));
                        }
                    });
                    
                } catch (err) {
                    console.error('[StreamSource] Stream failed:', err);
                    resolve(false);
                }
            });
        });
    }
    
    _continueBuffering(reader, sourceBuffer) {
        // Continue buffering remaining chunks
    }
    
    dispose() {
        if (this.audio) {
            this.audio.pause();
            this.audio.src = '';
        }
        if (this.mediaSource?.readyState === 'open') {
            this.mediaSource.endOfStream();
        }
        super.dispose();
    }
}
```

**Behavior:**
- ✅ Starts playing in 3-5 seconds
- ✅ No caching (saves memory for external content)
- ⚠️ Requires network (fails offline)
- ⚠️ Network hiccups may cause dropouts

---

### 3. CachedStreamSource (Phase 3 - Core Solution)

**Purpose:** Stream + cache simultaneously for static files

**Use Cases:**
- MP3/WAV/M4A files on your server
- Files that may be revisited during session
- Want to eliminate lazy load delays on revisit

```javascript
class CachedStreamSource extends GpsSoundSource {
    constructor(engine, id, options = {}) {
        super(engine, id, options);
        this.url = options.url;
        this.loop = options.loop || false;
        this.audio = null;
        this.mediaSource = null;
    }
    
    async load() {
        console.log('[CachedStreamSource] Loading:', this.url);
        
        // === STEP 1: Check Session Cache ===
        const cached = await this._getCached();
        if (cached) {
            console.log('[CachedStreamSource] ✅ Playing from session cache');
            return this._playFromBlob(cached);  // Instant playback
        }
        
        // === STEP 2: Stream + Cache Simultaneously ===
        console.log('[CachedStreamSource] 📡 Streaming + caching...');
        
        try {
            const response = await fetch(this.url);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            
            // Start streaming immediately (don't wait for full download)
            const streamed = await this._startStreaming(response);
            if (!streamed) return false;
            
            // Cache in background (don't block playback)
            this._cacheInBackground(response.clone());
            
            return true;
            
        } catch (error) {
            console.error('[CachedStreamSource] Load failed:', error);
            return false;
        }
    }
    
    async _startStreaming(response) {
        // Use MediaSource for progressive playback
        this.mediaSource = new MediaSource();
        this.audio = new Audio();
        this.audio.src = URL.createObjectURL(this.mediaSource);
        this.audio.loop = this.loop;
        
        return new Promise((resolve) => {
            this.mediaSource.addEventListener('sourceopen', async () => {
                try {
                    const sourceBuffer = this.mediaSource.addSourceBuffer('audio/mpeg');
                    const reader = response.body.getReader();
                    
                    // Buffer first chunk
                    const { done, value } = await reader.read();
                    if (done) { resolve(false); return; }
                    
                    sourceBuffer.appendBuffer(value);
                    
                    // Start playing as soon as ready
                    sourceBuffer.addEventListener('updateend', () => {
                        if (this.audio.buffered.length > 0) {
                            this.audio.play().then(() => {
                                console.log('[CachedStreamSource] ▶️ Streaming started');
                                this._continueBuffering(reader, sourceBuffer);
                                resolve(true);
                            }).catch(() => resolve(false));
                        }
                    });
                    
                } catch (err) {
                    console.error('[CachedStreamSource] Stream failed:', err);
                    resolve(false);
                }
            });
        });
    }
    
    async _cacheInBackground(response) {
        try {
            const arrayBuffer = await response.arrayBuffer();
            
            // Store in session cache (in-memory, cleared on refresh)
            await this._sessionCache.set(this.url, arrayBuffer);
            
            console.log('[CachedStreamSource] 💾 Cached for session');
            
        } catch (err) {
            console.error('[CachedStreamSource] Cache failed:', err);
            // Don't fail playback if cache fails
        }
    }
    
    async _getCached() {
        return await this._sessionCache.get(this.url);
    }
    
    async _playFromBlob(blob) {
        this.audio = new Audio();
        this.audio.src = URL.createObjectURL(blob);
        this.audio.loop = this.loop;
        
        return new Promise((resolve) => {
            this.audio.addEventListener('canplaythrough', () => {
                this.audio.play();
                console.log('[CachedStreamSource] ✅ Playing from cache');
                resolve(true);
            });
            this.audio.addEventListener('error', (err) => {
                console.error('[CachedStreamSource] Cache playback failed:', err);
                resolve(false);
            });
        });
    }
    
    _continueBuffering(reader, sourceBuffer) {
        // Keep buffering remaining chunks
    }
    
    dispose() {
        if (this.audio) {
            this.audio.pause();
            this.audio.src = '';
        }
        if (this.mediaSource?.readyState === 'open') {
            this.mediaSource.endOfStream();
        }
        super.dispose();
    }
}
```

**Behavior:**
- ✅ **First approach:** Stream (3-5 second startup) + cache in background
- ✅ **Revisit:** Play from cache (instant, no network needed)
- ✅ **Session duration:** Cached until refresh or soundscape switch
- ⚠️ **Cleared on:** Page refresh, soundscape switch, tab close

---

## Source Type Detection

### AudioSourceFactory

```javascript
class AudioSourceFactory {
    static async createSource(engine, id, config) {
        const url = config.soundUrl;
        
        // 1. External URL (cross-origin, can't cache)
        if (url.startsWith('http://') || url.startsWith('https://')) {
            console.log('[Factory] External URL → StreamSource (no cache)');
            return new StreamSource(engine, id, config);
        }
        
        // 2. API endpoint (dynamic, don't cache)
        if (url.includes('/api/') || url.includes('?')) {
            console.log('[Factory] API endpoint → StreamSource (no cache)');
            return new StreamSource(engine, id, config);
        }
        
        // 3. Static file (cacheable)
        if (/\.(mp3|wav|m4a|ogg|flac)$/i.test(url)) {
            console.log('[Factory] Static file → CachedStreamSource');
            return new CachedStreamSource(engine, id, config);
        }
        
        // Fallback
        console.warn('[Factory] Unknown type → StreamSource');
        return new StreamSource(engine, id, config);
    }
    
    static isExternalUrl(url) {
        return url.startsWith('http://') || url.startsWith('https://');
    }
    
    static isApiEndpoint(url) {
        return url.includes('/api/') || url.includes('?');
    }
    
    static isStaticFile(url) {
        return /\.(mp3|wav|m4a|ogg|flac)$/i.test(url);
    }
}
```

**Detection Logic:**

| URL Pattern | Source Type | Caching | Example |
|-------------|-------------|---------|---------|
| `https://stream.radio.com/jazz` | StreamSource | ❌ No | External radio |
| `/api/generate-ambient?rain=heavy` | StreamSource | ❌ No | Dynamic API |
| `/sounds/fountain.mp3` | CachedStreamSource | ✅ Yes | Static file |
| `/sounds/narration.wav` | CachedStreamSource | ✅ Yes | Static file |

---

## User Experience Flow

### First Approach to Waypoint

```
┌─────────────────────────────────────────────────────────────┐
│  User walking toward waypoint (5 MB file, 100m away)        │
│                                                             │
│  t=0s:   User enters preload zone (100m)                   │
│          ↓                                                  │
│          Lazy load triggers                                 │
│          ↓                                                  │
│          Check session cache → Not cached                   │
│          ↓                                                  │
│          Start streaming (MediaSource API)                  │
│          ↓                                                  │
│  t=3-5s: Audio starts playing ✅                            │
│          ↓                                                  │
│          File continues downloading in background           │
│          ↓                                                  │
│  t=8s:   Full file downloaded                               │
│          ↓                                                  │
│          Cached to session Map                              │
│          ↓                                                  │
│  User continues walking (audio playing smoothly)            │
└─────────────────────────────────────────────────────────────┘
```

### Revisiting Waypoint (During Same Session)

```
┌─────────────────────────────────────────────────────────────┐
│  User walks back to same waypoint                           │
│                                                             │
│  t=0s:   User enters preload zone (100m)                   │
│          ↓                                                  │
│          Lazy load triggers                                 │
│          ↓                                                  │
│          Check session cache → Cached! ✅                   │
│          ↓                                                  │
│          Play from cache (instant)                          │
│          ↓                                                  │
│  t=0.5s: Audio starts playing ✅ (no delay)                 │
│          ↓                                                  │
│  User experiences instant playback (no network needed)      │
└─────────────────────────────────────────────────────────────┘
```

### Soundscape Switch

```
┌─────────────────────────────────────────────────────────────┐
│  User selects different soundscape                          │
│          ↓                                                  │
│  SessionCacheManager.clearForNewSoundscape() called         │
│          ↓                                                  │
│  Previous soundscape cache cleared                          │
│          ↓                                                  │
│  New soundscape starts fresh (empty cache)                  │
│          ↓                                                  │
│  First approaches → Stream + cache                          │
│  Revisits → Play from cache                                 │
└─────────────────────────────────────────────────────────────┘
```

### Page Refresh

```
┌─────────────────────────────────────────────────────────────┐
│  User refreshes browser (F5 or pull-to-refresh)             │
│          ↓                                                  │
│  JavaScript Map object garbage-collected                    │
│          ↓                                                  │
│  Session cache auto-cleared (no manual action needed)       │
│          ↓                                                  │
│  Fresh start with empty cache                               │
└─────────────────────────────────────────────────────────────┘
```

---

## Storage Management

### Automatic (No User Intervention Required)

| Event | Storage Action |
|-------|----------------|
| **Page load** | Empty Map created |
| **First waypoint approach** | File downloaded → cached (~3-5 MB) |
| **Revisit waypoint** | Play from cache (no new download) |
| **Multiple waypoints** | Each cached on first approach (~20-50 MB total) |
| **Page refresh** | Map garbage-collected (browser clears) |
| **Tab closed** | Map garbage-collected |
| **Soundscape switched** | Map cleared manually, fresh start |

### Size Limits

| Limit | Value | Action |
|-------|-------|--------|
| **Session limit** | 100 MB | Warn if exceeded, skip caching |
| **Typical soundscape** | 20-50 MB (5-15 waypoints × 3 MB) | Fits comfortably |
| **Large soundscape** | 80-100 MB | May hit limit, warn user |
| **Too large** | >100 MB | Skip caching, stream only |

---

## Implementation Phases

### Phase 1: SessionCacheManager ✅

**What:**
- `SessionCacheManager` class
- In-memory Map storage
- `clearForNewSoundscape()` method
- Size tracking (100 MB limit)

**Files Modified:**
- `spatial_audio.js` (add class)
- `spatial_audio_app.js` (initialize + integrate)

**User Impact:**
- Foundation for caching
- No visible changes yet

---

### Phase 2: StreamSource ✅

**What:**
- `StreamSource` class
- MediaSource API streaming
- External URL support
- API endpoint support

**Files Modified:**
- `spatial_audio.js` (add class)
- `spatial_audio_app.js` (AudioSourceFactory)

**User Impact:**
- Can use external streams (Spotify, radio)
- Can use dynamic API endpoints
- 3-5 second startup time

---

### Phase 3: CachedStreamSource ✅

**What:**
- `CachedStreamSource` class
- Stream + cache simultaneously
- Session cache integration
- Fallback handling

**Files Modified:**
- `spatial_audio.js` (add class)
- `spatial_audio_app.js` (integrate with lazy loading)

**User Impact:**
- **First approach:** 3-5 second startup (streaming)
- **Revisit:** Instant playback (from cache)
- **Large files:** No more gaps on revisit
- **Offline:** Works during session (already cached)

---

## Comparison: Before vs After

| Aspect | Before (Pure Lazy Load) | After (Cached Streaming) |
|--------|------------------------|-------------------------|
| **First approach** | 2-8 sec delay (fetch + decode) | 3-5 sec startup (streaming) |
| **Revisit waypoint** | Re-download (2-8 sec delay) | Instant (from cache) ✅ |
| **Offline support** | ❌ Fails completely | ✅ Works (if cached during session) |
| **Large files (>5 MB)** | Noticeable gaps | No gaps on revisit |
| **Storage** | None | 20-50 MB per session (auto-cleared) |
| **Network usage** | Download per approach | Download once per session |
| **External URLs** | ❌ Not supported | ✅ Supported (StreamSource) |
| **API endpoints** | ❌ Not supported | ✅ Supported (StreamSource) |

---

## Trade-offs

### Advantages ✅

| Advantage | Impact |
|-----------|--------|
| **No upfront download** | Fast soundscape selection (no 2-3 min wait) |
| **Revisit instant playback** | No gaps when user backtracks or circles |
| **Offline during session** | Works if user goes underground after first approach |
| **Simple storage** | Auto-cleared (no complex eviction logic) |
| **One soundscape at a time** | Predictable, no quota management UI |
| **External source support** | Spotify, radio, APIs work seamlessly |

### Disadvantages ⚠️

| Disadvantage | Mitigation |
|--------------|------------|
| **First approach still has delay** | 3-5s streaming (better than 8s lazy load) |
| **Session storage (20-50 MB)** | Auto-cleared, user doesn't manage |
| **Re-download on soundscape switch** | Clear expectation: one soundscape at a time |
| **MediaSource iOS compatibility** | Fallback to fetch + decode on older iOS |

---

## Key Design Decision: Why NOT Download All Upfront?

### Alternative Approach (Rejected)

```
User selects soundscape
        ↓
Download ALL files before playback (2-3 minutes)
        ↓
User can start walking
```

**Why Rejected:**
1. **Long wait before first use** - User must wait 2-3 minutes before any audio
2. **Wasted data** - User may leave before hearing all waypoints
3. **Poor UX** - Feels like "installing" an app vs. "starting" experience

### Chosen Approach (Lazy Load + Cache)

```
User selects soundscape
        ↓
Start immediately (no download wait)
        ↓
First approach: Stream (3-5s) + cache
        ↓
Revisit: Instant (from cache)
```

**Why Chosen:**
1. **Fast start** - User hears audio within seconds
2. **Efficient** - Only download what user actually approaches
3. **Natural flow** - Matches user behavior (walk → hear → revisit → instant)

---

## Future Enhancements (Not Implemented)

### Long-Term Caching (Optional Future)

```javascript
// Could add IndexedDB for persistent cache across sessions
// User marks favorites as "Keep Offline"
// Survives page refresh
```

**Why Not Now:**
- Adds complexity (eviction logic, quotas, user management)
- iOS storage limits (~100 MB total for all storage)
- Session caching solves 90% of use cases (revisit during session)

### Smart Preloading (Optional Future)

```javascript
// Preload nearby waypoints in background
// User can start walking sooner
```

**Why Not Now:**
- More complex download logic
- Current approach (stream + cache) is simpler and effective

---

## Testing Checklist

### Phase 1: SessionCacheManager

- [ ] Cache stores ArrayBuffer correctly
- [ ] Cache clears on `clearForNewSoundscape()`
- [ ] Cache auto-clears on page refresh (Map GC)
- [ ] Size tracking accurate
- [ ] Warning at 100 MB limit

### Phase 2: StreamSource

- [ ] External URL streams correctly
- [ ] API endpoint streams correctly
- [ ] 3-5 second startup time
- [ ] Network dropout handling
- [ ] iOS Safari MediaSource compatibility

### Phase 3: CachedStreamSource

- [ ] First approach: Stream + cache
- [ ] Revisit: Play from cache (instant)
- [ ] Cache persists during session
- [ ] Cache clears on refresh
- [ ] Cache clears on soundscape switch
- [ ] Fallback to stream if cache fails

---

## Related Documentation

- `FEATURES.md` - Feature catalog (to be updated)
- `LAZY_LOADING_SPECIFICATION.md` - Original lazy loading spec
- `spatial_audio.js` - Implementation source code

---

## Changelog

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-03-19 | Initial design document |
| 1.1 | 2026-03-19 | **Corrected:** Removed "download all upfront" - clarified lazy load + cache approach |
