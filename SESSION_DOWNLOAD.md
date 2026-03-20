# Session 15: Offline Soundscape Download

**Version:** 1.0
**Date:** 2026-03-19
**Status:** 📋 Planned

---

## Problem Statement

### Current Limitation

When users download a soundscape for offline playback, only the **metadata** (waypoint positions, URLs, configuration) is downloaded. The actual **audio files** (MP3s, WAVs, etc.) are not downloaded.

**User Flow (Current):**
```
1. User selects soundscape in soundscape_picker.html
2. Metadata downloaded (waypoint positions, sound URLs)
3. User taps "Start"
4. Audio files streamed from network on-demand (lazy loading)
5. ❌ If user goes offline → audio fails to load
```

**Impact:**
| Scenario | Current Behavior | User Experience |
|----------|------------------|-----------------|
| **Poor network** | Lazy loading fails | ❌ Silence, broken experience |
| **Offline mode** | No audio loads | ❌ Completely unusable |
| **Airplane mode** | No audio loads | ❌ Completely unusable |
| **Underground/remote** | No audio loads | ❌ Completely unusable |

---

## Solution: Optional Offline Download

### Core Concept

Add a **download button** to each soundscape entry in `soundscape_picker.html` that:
- Downloads all audio files referenced by waypoints in that soundscape
- Stores files in **Cache API** (persistent storage)
- Shows progress bar during download
- Marks soundscape as "Available Offline"
- Audio engine checks Cache API first before network

**User Flow (After):**
```
Option A: Online Playback (Current)
1. Select soundscape → Start → Stream on-demand

Option B: Offline Download (New)
1. Tap download icon → Progress bar shows
2. All audio files downloaded to Cache API
3. Soundscape marked "✅ Available Offline"
4. User can now go offline
5. Tap Start → Audio plays from cache (no network needed)
```

---

## Architecture

### Storage: Cache API

**Why Cache API (not IndexedDB)?**
| Aspect | Cache API | IndexedDB | Winner |
|--------|-----------|-----------|--------|
| **Purpose** | Store HTTP responses | Store structured data | **Cache API** ✅ |
| **Integration** | `fetch()` can use cache directly | Manual blob management | **Cache API** ✅ |
| **Simplicity** | `cache.put(url, response)` | Transactional, complex | **Cache API** ✅ |
| **Size limits** | ~50-100 MB (per origin) | ~6 GB (per origin) | IndexedDB |
| **Use case** | Network interception | Long-term storage | **Cache API** ✅ |

**Cache API Structure:**
```javascript
// Cache name pattern
`soundscape-${soundscapeId}`

// Example:
// soundscape-abc123
//   ├─ https://ssykes.net/sounds/fountain.mp3
//   ├─ https://ssykes.net/sounds/birds.wav
//   └─ https://ssykes.net/sounds/narration.mp3
```

### Component Design

#### 1. OfflineDownloadManager

**Purpose:** Manage offline download queue, progress tracking, cache storage

```javascript
class OfflineDownloadManager {
    constructor() {
        this.cacheName = null;
        this.downloadQueue = new Map();
        this.maxRetries = 3;
    }

    /**
     * Download all sounds for a soundscape
     * @param {string} soundscapeId - Soundscape ID
     * @param {string} soundscapeName - Soundscape name (for UI)
     * @param {Array} waypoints - Waypoint data (with sound URLs)
     * @returns {Promise<{success: boolean, downloaded: number, failed: number}>}
     */
    async downloadSoundscape(soundscapeId, soundscapeName, waypoints) {
        // Extract unique sound URLs
        const urls = [...new Set(waypoints.map(wp => wp.soundUrl))];
        
        console.log(`[OfflineDownload] Starting download: ${soundscapeName}`);
        console.log(`[OfflineDownload] ${urls.length} unique audio files`);

        // Create cache for this soundscape
        this.cacheName = `soundscape-${soundscapeId}`;
        const cache = await caches.open(this.cacheName);

        // Track progress
        let downloaded = 0;
        let failed = 0;
        const total = urls.length;

        // Update UI with progress
        this._onProgress(soundscapeId, 0, total);

        // Download each URL
        for (const url of urls) {
            try {
                await this._downloadAndCache(cache, url);
                downloaded++;
            } catch (error) {
                console.error(`[OfflineDownload] Failed: ${url}`, error);
                failed++;
            }
            
            // Update progress
            this._onProgress(soundscapeId, downloaded, total);
        }

        // Final status
        const success = failed === 0;
        console.log(`[OfflineDownload] Complete: ${downloaded}/${total} succeeded`);
        
        return { success, downloaded, failed };
    }

    /**
     * Download single URL and cache response
     * @param {Cache} cache - Cache API object
     * @param {string} url - URL to download
     */
    async _downloadAndCache(cache, url) {
        let lastError;
        
        for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
            try {
                const response = await fetch(url);
                
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }

                // Cache the response
                await cache.put(url, response.clone());
                
                console.log(`[OfflineDownload] ✅ Cached: ${url}`);
                return;  // Success
                
            } catch (error) {
                lastError = error;
                console.warn(`[OfflineDownload] Attempt ${attempt} failed: ${url}`);
                
                // Wait before retry (exponential backoff)
                if (attempt < this.maxRetries) {
                    await new Promise(resolve => 
                        setTimeout(resolve, Math.pow(2, attempt) * 1000)
                    );
                }
            }
        }
        
        throw lastError;  // All retries failed
    }

    /**
     * Update progress UI (override in subclass)
     * @param {string} soundscapeId
     * @param {number} downloaded
     * @param {number} total
     */
    _onProgress(soundscapeId, downloaded, total) {
        const percent = Math.round((downloaded / total) * 100);
        console.log(`[OfflineDownload] Progress: ${percent}% (${downloaded}/${total})`);
        
        // Dispatch custom event for UI to listen
        const event = new CustomEvent('offline-download-progress', {
            detail: { soundscapeId, downloaded, total, percent }
        });
        window.dispatchEvent(event);
    }

    /**
     * Check if soundscape is available offline
     * @param {string} soundscapeId
     * @returns {Promise<boolean>}
     */
    async isAvailableOffline(soundscapeId) {
        const cacheName = `soundscape-${soundscapeId}`;
        try {
            const cache = await caches.open(cacheName);
            const keys = await cache.keys();
            return keys.length > 0;
        } catch (err) {
            return false;
        }
    }

    /**
     * Delete offline cache for soundscape
     * @param {string} soundscapeId
     * @returns {Promise<void>}
     */
    async deleteOfflineCache(soundscapeId) {
        const cacheName = `soundscape-${soundscapeId}`;
        await caches.delete(cacheName);
        console.log(`[OfflineDownload] Deleted cache: ${cacheName}`);
    }

    /**
     * Get download progress
     * @param {string} soundscapeId
     * @returns {{downloaded: number, total: number, percent: number} | null}
     */
    getProgress(soundscapeId) {
        return this.downloadQueue.get(soundscapeId) || null;
    }
}
```

---

#### 2. CachedAudioSource (Audio Engine Integration)

**Purpose:** Modify audio engine to check Cache API before network

```javascript
// spatial_audio.js - Add to GpsSoundSource or create subclass

class CachedSampleSource extends SampleSource {
    async load() {
        console.log('[CachedSampleSource] Loading:', this.url);

        // === STEP 1: Check Cache API ===
        const cachedResponse = await this._getCachedResponse();
        if (cachedResponse) {
            console.log('[CachedSampleSource] ✅ Playing from cache');
            return this._playFromResponse(cachedResponse);
        }

        // === STEP 2: Fallback to network ===
        console.log('[CachedSampleSource] 🌐 Fetching from network');
        const response = await fetch(this.url);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        return this._playFromResponse(response);
    }

    async _getCachedResponse() {
        // Try all cache names (multiple soundscapes may be cached)
        const cacheNames = await caches.keys();
        
        for (const cacheName of cacheNames) {
            if (!cacheName.startsWith('soundscape-')) continue;
            
            try {
                const cache = await caches.open(cacheName);
                const response = await cache.match(this.url);
                
                if (response) {
                    return response;  // Found in cache
                }
            } catch (err) {
                // Ignore cache errors, try next
            }
        }
        
        return null;  // Not cached
    }

    async _playFromResponse(response) {
        const arrayBuffer = await response.arrayBuffer();
        const audioBuffer = await this.engine.audioContext.decodeAudioData(
            arrayBuffer.slice(0)
        );

        this.buffer = audioBuffer;
        this._createSource();
        
        return this.start();
    }
}
```

**Integration with AudioSourceFactory:**
```javascript
// spatial_audio_app.js - Update factory

class AudioSourceFactory {
    static async createSource(engine, id, config) {
        // Check if offline download is enabled (future feature flag)
        const useCache = config.offlineEnabled ?? true;
        
        if (useCache) {
            return new CachedSampleSource(engine, id, config);
        } else {
            return new SampleSource(engine, id, config);
        }
    }
}
```

---

#### 3. UI Integration (soundscape_picker.html)

**HTML Changes:**
```html
<ul id="soundscapeList">
    <!-- Existing soundscape items -->
    <li class="soundscape-item" data-id="abc123">
        <div class="soundscape-name">Forest Walk</div>
        <div class="soundscape-meta">
            <span>🔊 5 sound(s)</span>
            <span>📅 2 days ago</span>
        </div>
        
        <!-- NEW: Download button + progress -->
        <div class="soundscape-actions">
            <button class="download-btn" 
                    title="Download for offline playback"
                    data-soundscape-id="abc123">
                📥 Download
            </button>
            
            <div class="download-progress" style="display: none;">
                <div class="progress-bar">
                    <div class="progress-fill" style="width: 0%"></div>
                </div>
                <span class="progress-text">0%</span>
            </div>
            
            <div class="offline-status" style="display: none;">
                ✅ Available Offline
                <button class="delete-offline-btn" title="Remove offline copy">
                    🗑️
                </button>
            </div>
        </div>
    </li>
</ul>
```

**CSS Styling:**
```css
.soundscape-actions {
    margin-top: 10px;
    display: flex;
    align-items: center;
    gap: 10px;
}

.download-btn {
    background: rgba(0, 217, 255, 0.2);
    border: 1px solid rgba(0, 217, 255, 0.5);
    color: #00d9ff;
    padding: 6px 12px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.85em;
    transition: all 0.2s;
}

.download-btn:hover {
    background: rgba(0, 217, 255, 0.3);
}

.download-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
}

.progress-bar {
    flex: 1;
    height: 6px;
    background: rgba(255, 255, 255, 0.1);
    border-radius: 3px;
    overflow: hidden;
}

.progress-fill {
    height: 100%;
    background: linear-gradient(90deg, #00d9ff, #00ff88);
    transition: width 0.3s;
}

.progress-text {
    font-size: 0.75em;
    color: #00ff88;
    min-width: 40px;
}

.offline-status {
    display: flex;
    align-items: center;
    gap: 8px;
    color: #00ff88;
    font-size: 0.85em;
}

.delete-offline-btn {
    background: none;
    border: none;
    color: #ff6b6b;
    cursor: pointer;
    font-size: 1em;
    opacity: 0.7;
    transition: opacity 0.2s;
}

.delete-offline-btn:hover {
    opacity: 1;
}
```

**JavaScript Integration:**
```javascript
// soundscape_picker.html - Add to SoundscapePickerApp class

class SoundscapePickerApp {
    constructor() {
        this.api = new ApiClient('/api');
        this.soundscapes = [];
        this.downloadManager = new OfflineDownloadManager();
        
        // Listen for progress events
        window.addEventListener('offline-download-progress', (e) => {
            this._onDownloadProgress(e.detail);
        });
    }

    async init() {
        // ... existing init code ...
        await this._checkOfflineStatus();
    }

    /**
     * Check which soundscapes are available offline
     */
    async _checkOfflineStatus() {
        for (const ss of this.soundscapes) {
            const isOffline = await this.downloadManager.isAvailableOffline(ss.id);
            
            if (isOffline) {
                this._markAsOffline(ss.id);
            }
        }
    }

    /**
     * Handle download button click
     */
    async _downloadSoundscape(soundscapeId) {
        const soundscape = this.soundscapes.find(ss => ss.id === soundscapeId);
        if (!soundscape) return;

        // Fetch full soundscape data (with waypoints)
        const fullData = await this.api.getSoundscapeById(soundscapeId);
        const waypoints = fullData.waypoints || [];

        if (waypoints.length === 0) {
            alert('This soundscape has no sounds to download');
            return;
        }

        // Start download
        const btn = document.querySelector(`[data-soundscape-id="${soundscapeId}"]`);
        btn.disabled = true;
        btn.textContent = '⏳ Downloading...';

        try {
            const result = await this.downloadManager.downloadSoundscape(
                soundscapeId,
                soundscape.name,
                waypoints
            );

            if (result.success) {
                this._markAsOffline(soundscapeId);
                alert(`✅ Downloaded ${result.downloaded} audio files`);
            } else {
                alert(`⚠️ Partial download: ${result.downloaded} succeeded, ${result.failed} failed`);
            }

        } catch (error) {
            console.error('[OfflineDownload] Error:', error);
            alert(`❌ Download failed: ${error.message}`);
        } finally {
            btn.disabled = false;
            btn.textContent = '📥 Download';
        }
    }

    /**
     * Update progress bar
     */
    _onDownloadProgress({ soundscapeId, downloaded, total, percent }) {
        const progressEl = document.querySelector(
            `[data-soundscape-id="${soundscapeId}"] .download-progress`
        );
        
        if (progressEl) {
            progressEl.style.display = 'flex';
            progressEl.querySelector('.progress-fill').style.width = `${percent}%`;
            progressEl.querySelector('.progress-text').textContent = `${percent}%`;
        }
    }

    /**
     * Mark soundscape as available offline
     */
    _markAsOffline(soundscapeId) {
        const itemEl = document.querySelector(
            `[data-soundscape-id="${soundscapeId}"]`
        );
        
        if (itemEl) {
            const downloadBtn = itemEl.querySelector('.download-btn');
            const progressEl = itemEl.querySelector('.download-progress');
            const statusEl = itemEl.querySelector('.offline-status');

            if (downloadBtn) downloadBtn.style.display = 'none';
            if (progressEl) progressEl.style.display = 'none';
            if (statusEl) statusEl.style.display = 'flex';
        }
    }

    /**
     * Delete offline cache
     */
    async _deleteOfflineCache(soundscapeId) {
        if (!confirm('Remove offline copy? You can re-download anytime.')) {
            return;
        }

        await this.downloadManager.deleteOfflineCache(soundscapeId);
        
        // Update UI
        const itemEl = document.querySelector(
            `[data-soundscape-id="${soundscapeId}"]`
        );
        
        if (itemEl) {
            const downloadBtn = itemEl.querySelector('.download-btn');
            const statusEl = itemEl.querySelector('.offline-status');

            if (downloadBtn) downloadBtn.style.display = 'inline-block';
            if (statusEl) statusEl.style.display = 'none';
        }
    }
}
```

---

## User Experience

### Download Flow

```
1. User opens soundscape_picker.html
        ↓
2. Sees list of soundscapes with download icons
        ↓
3. Taps download icon on "Forest Walk"
        ↓
4. Progress bar appears:
   ┌────────────────────────────────┐
   │ Forest Walk                    │
   │ 🔊 5 sounds | 📅 2 days ago    │
   │                                │
   │ [████████████░░░░] 60%        │
   │ ⏳ Downloading (3/5 files)     │
   └────────────────────────────────┘
        ↓
5. Download completes
        ↓
6. Progress bar replaced with:
   ✅ Available Offline  [🗑️]
        ↓
7. User can now go offline and play
```

### Playback Flow (Offline Mode)

```
1. User selects offline soundscape
        ↓
2. Taps "▶️ Start"
        ↓
3. Audio engine checks Cache API
        ↓
4. Plays audio from cache (no network)
        ↓
5. User experiences seamless playback
```

### Storage Management

| Event | Cache Behavior |
|-------|----------------|
| **Download soundscape** | Cache created: `soundscape-{id}` |
| **Play offline** | Cache API serves responses |
| **Delete offline** | Cache deleted via `caches.delete()` |
| **Browser storage full** | Oldest caches evicted automatically |
| **Multiple soundscapes** | Each has separate cache |

---

## Implementation Plan (Divided into Sessions)

| Session | Phase | Task | Files | Est. Lines | Time | Risk |
|---------|-------|------|-------|------------|------|------|
| **15A** | 1 | Create `OfflineDownloadManager` class | `spatial_audio_app.js` (or new file) | ~150 | 1h | ✅ None |
| **15B** | 2 | Add download UI to soundscape_picker.html | `soundscape_picker.html` | ~80 | 45 min | ✅ None |
| **15C** | 3 | Integrate download manager with picker app | `soundscape_picker.html` (JS) | ~120 | 1h | ⚠️ Low |
| **15D** | 4 | Create `CachedSampleSource` class | `spatial_audio.js` | ~60 | 45 min | ⚠️ Low |
| **15E** | 5 | Update `AudioSourceFactory` | `spatial_audio_app.js` | ~20 | 15 min | ✅ None |
| **15F** | 6 | Add progress bar styling + animations | `soundscape_picker.html` (CSS) | ~50 | 30 min | ✅ None |
| **15G** | 7 | Test with various network conditions | Browser DevTools | - | 1h | ✅ None |
| **Total** | | | **3 files** | **~480 lines** | **~4h 30m** | **Low** |

---

## Session Details

### Session 15A: Create OfflineDownloadManager

**Goal:** Create download manager class with progress tracking

**Changes:**
```javascript
// NEW FILE: offline_download_manager.js (or add to spatial_audio_app.js)

class OfflineDownloadManager {
    constructor() {
        this.cacheName = null;
        this.downloadQueue = new Map();
        this.maxRetries = 3;
    }

    async downloadSoundscape(soundscapeId, soundscapeName, waypoints) {
        // Implementation as shown above
    }

    async _downloadAndCache(cache, url) {
        // Implementation as shown above
    }

    _onProgress(soundscapeId, downloaded, total) {
        // Dispatch custom event
    }

    async isAvailableOffline(soundscapeId) {
        // Check cache
    }

    async deleteOfflineCache(soundscapeId) {
        // Delete cache
    }
}
```

**Testing:**
```javascript
// Open browser console
const manager = new OfflineDownloadManager();
const result = await manager.downloadSoundscape('test-id', 'Test', waypoints);
console.log('Download result:', result);
```

**Risk:** ✅ None (new file, doesn't affect existing code)

---

### Session 15B: Add Download UI

**Goal:** Add download button + progress bar to each soundscape entry

**Changes:**
```html
<!-- soundscape_picker.html - Update _renderList() -->

<li class="soundscape-item" data-id="${ss.id}">
    <div class="soundscape-name">${this._escapeHtml(ss.name)}</div>
    <div class="soundscape-meta">
        <span>🔊 ${ss.waypointCount || 0} sound(s)</span>
        <span>📅 ${this._formatDate(ss.updatedAt)}</span>
    </div>
    
    <!-- NEW: Actions -->
    <div class="soundscape-actions">
        <button class="download-btn" 
                title="Download for offline playback"
                data-soundscape-id="${ss.id}">
            📥 Download
        </button>
        
        <div class="download-progress" style="display: none;">
            <div class="progress-bar">
                <div class="progress-fill" style="width: 0%"></div>
            </div>
            <span class="progress-text">0%</span>
        </div>
        
        <div class="offline-status" style="display: none;">
            ✅ Available Offline
            <button class="delete-offline-btn" title="Remove offline copy">
                🗑️
            </button>
        </div>
    </div>
</li>
```

**Testing:**
1. Open `soundscape_picker.html`
2. Verify download button appears on each soundscape
3. Verify tooltip shows on hover

**Risk:** ✅ None (HTML/CSS only)

---

### Session 15C: Integrate Download Manager

**Goal:** Wire up download button + progress handling

**Changes:**
```javascript
// soundscape_picker.html - Add to SoundscapePickerApp

class SoundscapePickerApp {
    constructor() {
        this.downloadManager = new OfflineDownloadManager();
        window.addEventListener('offline-download-progress', (e) => {
            this._onDownloadProgress(e.detail);
        });
    }

    _renderList() {
        // ... existing code ...
        // Add click handler for download button
        listEl.querySelectorAll('.download-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this._downloadSoundscape(btn.dataset.soundscapeId);
            });
        });
        // Add click handler for delete button
        listEl.querySelectorAll('.delete-offline-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this._deleteOfflineCache(btn.closest('[data-soundscape-id]').dataset.soundscapeId);
            });
        });
    }

    async _downloadSoundscape(soundscapeId) {
        // Implementation as shown above
    }

    _onDownloadProgress({ soundscapeId, downloaded, total, percent }) {
        // Update progress bar UI
    }

    _markAsOffline(soundscapeId) {
        // Show "Available Offline" status
    }
}
```

**Testing:**
1. Click download button → progress bar updates
2. Download completes → shows "✅ Available Offline"
3. Click delete button → cache removed, download button reappears

**Risk:** ⚠️ Low (modifies existing picker logic)

---

### Session 15D: Create CachedSampleSource

**Goal:** Modify audio engine to check cache before network

**Changes:**
```javascript
// spatial_audio.js - Add class

class CachedSampleSource extends SampleSource {
    async load() {
        const cachedResponse = await this._getCachedResponse();
        if (cachedResponse) {
            return this._playFromResponse(cachedResponse);
        }

        const response = await fetch(this.url);
        return this._playFromResponse(response);
    }

    async _getCachedResponse() {
        const cacheNames = await caches.keys();
        for (const cacheName of cacheNames) {
            if (!cacheName.startsWith('soundscape-')) continue;
            const cache = await caches.open(cacheName);
            const response = await cache.match(this.url);
            if (response) return response;
        }
        return null;
    }

    async _playFromResponse(response) {
        const arrayBuffer = await response.arrayBuffer();
        const audioBuffer = await this.engine.audioContext.decodeAudioData(
            arrayBuffer.slice(0)
        );
        this.buffer = audioBuffer;
        this._createSource();
        return this.start();
    }
}
```

**Testing:**
```javascript
// Open browser console
// 1. Download soundscape offline
// 2. Go offline (DevTools → Network → Offline)
// 3. Start soundscape → audio should play from cache
```

**Risk:** ⚠️ Low (extends existing SampleSource)

---

### Session 15E: Update AudioSourceFactory

**Goal:** Use CachedSampleSource by default

**Changes:**
```javascript
// spatial_audio_app.js - Update factory

class AudioSourceFactory {
    static async createSource(engine, id, config) {
        // Always use cached source (checks cache first, falls back to network)
        return new CachedSampleSource(engine, id, config);
    }
}
```

**Testing:**
1. Play soundscape online → works (fetches from network)
2. Download soundscape offline
3. Go offline → play soundscape → works (fetches from cache)

**Risk:** ✅ None (simple factory change)

---

### Session 15F: Add Progress Styling

**Goal:** Make progress bar visually appealing

**Changes:**
```css
/* soundscape_picker.html - Add CSS */

.download-progress {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-top: 8px;
}

.progress-bar {
    flex: 1;
    height: 6px;
    background: rgba(255, 255, 255, 0.1);
    border-radius: 3px;
    overflow: hidden;
}

.progress-fill {
    height: 100%;
    background: linear-gradient(90deg, #00d9ff, #00ff88);
    transition: width 0.3s ease-out;
    position: relative;
}

/* Animated shimmer effect */
.progress-fill::after {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: linear-gradient(
        90deg,
        transparent,
        rgba(255, 255, 255, 0.3),
        transparent
    );
    animation: shimmer 1.5s infinite;
}

@keyframes shimmer {
    0% { transform: translateX(-100%); }
    100% { transform: translateX(100%); }
}

.progress-text {
    font-size: 0.75em;
    color: #00ff88;
    min-width: 40px;
    text-align: right;
}

.offline-status {
    display: flex;
    align-items: center;
    gap: 8px;
    color: #00ff88;
    font-size: 0.85em;
    animation: fadeIn 0.3s ease-out;
}

@keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
}

.delete-offline-btn {
    background: none;
    border: none;
    color: #ff6b6b;
    cursor: pointer;
    font-size: 1em;
    opacity: 0.7;
    transition: opacity 0.2s;
    padding: 2px 6px;
}

.delete-offline-btn:hover {
    opacity: 1;
    background: rgba(255, 107, 107, 0.1);
    border-radius: 4px;
}
```

**Testing:**
1. Open `soundscape_picker.html`
2. Start download → verify progress bar animates smoothly
3. Download completes → verify "Available Offline" fades in

**Risk:** ✅ None (CSS only)

---

### Session 15G: Test Various Scenarios

**Test Checklist:**

| Test | Expected Result | Status |
|------|-----------------|--------|
| Download soundscape (5 sounds) | All 5 files cached | ⬜ |
| Progress bar updates | Shows 0% → 100% smoothly | ⬜ |
| Go offline → play | Audio plays from cache | ⬜ |
| Delete offline → redownload | Works correctly | ⬜ |
| Multiple soundscapes cached | Each plays offline | ⬜ |
| Network error during download | Retry 3 times, show error | ⬜ |
| Large file (10 MB) | Progress bar updates, completes | ⬜ |
| Browser refresh during download | Download cancels (expected) | ⬜ |
| Storage full | Graceful error message | ⬜ |

**Testing Steps:**

```javascript
// 1. Test online download
// Open soundscape_picker.html → Click download → Verify progress

// 2. Test offline playback
// DevTools → Network tab → Select "Offline"
// Play soundscape → Verify audio plays

// 3. Test cache deletion
// Click delete button → Verify cache cleared
// Click download again → Verify re-downloads

// 4. Test error handling
// DevTools → Network tab → Select "Slow 3G"
// Start download → Verify retries on failure
```

**Risk:** ✅ None (testing only)

---

## Benefits Achieved

| Benefit | Description |
|---------|-------------|
| **True offline playback** | Works without network after download |
| **Progress feedback** | Users see download status in real-time |
| **Cache API integration** | Native browser API, no custom storage |
| **Automatic fallback** | Cache miss → network (seamless) |
| **Storage management** | Per-soundscape caches (easy to delete) |
| **Retry logic** | Handles network errors gracefully |

---

## Trade-offs

### Advantages ✅

| Advantage | Impact |
|-----------|--------|
| **Offline support** | Works in remote areas, airplanes, underground |
| **User control** | Choose which soundscapes to download |
| **Persistent cache** | Survives page refresh (until manually deleted) |
| **Efficient** | Download once, play multiple times |
| **Simple UI** | One button + progress bar |

### Disadvantages ⚠️

| Disadvantage | Mitigation |
|--------------|------------|
| **Storage usage** | 20-50 MB per soundscape (user manages) |
| **Download time** | 10-30 seconds per soundscape (progress bar shows status) |
| **iOS Cache API limits** | ~50-100 MB (warn if exceeds) |
| **No auto-download** | User must manually download (by design) |

---

## Future Enhancements

### Enhancement 1: Auto-Download on Selection

```javascript
// Optional: Auto-download when user selects soundscape
// (Could annoy users who just want to browse)

async _selectSoundscape(id) {
    // Check if already cached
    const isCached = await this.downloadManager.isAvailableOffline(id);
    
    if (!isCached) {
        // Auto-download in background
        this._downloadSoundscape(id);
    }
    
    // Continue with selection...
}
```

**Why Not Default:**
- Users may browse many soundscapes → waste bandwidth/storage
- Better to let user explicitly choose

---

### Enhancement 2: Wi-Fi Only Download

```javascript
// Detect connection type
if (navigator.connection) {
    const type = navigator.connection.effectiveType;
    
    if (type === 'cellular' && !confirm('Download on cellular? May incur data charges.')) {
        return;
    }
}
```

**Why Not Now:**
- Adds complexity (connection API not universal)
- Can add later as UX polish

---

### Enhancement 3: Background Download

```javascript
// Use Service Worker for background download
// (Allows download even if user leaves page)

// Not implemented: Requires Service Worker registration
```

**Why Not Now:**
- Service Workers require HTTPS
- Adds significant complexity
- Overkill for MVP

---

## Success Criteria

| Criterion | How to Verify |
|-----------|---------------|
| Download button appears | UI shows on each soundscape |
| Progress bar updates | 0% → 100% during download |
| Offline playback works | DevTools "Offline" mode → audio plays |
| Cache persists refresh | Refresh page → still available offline |
| Delete works | Click delete → cache removed |
| Error handling | Network error → retry 3x, show message |
| Multiple soundscapes | Cache 2-3 soundscapes → all work offline |

---

## Dependencies

| Dependency | Status |
|------------|--------|
| Cache API support | ✅ All modern browsers |
| Fetch API | ✅ All modern browsers |
| Custom events | ✅ All modern browsers |
| Session 13: Lazy loading | ✅ Complete (works alongside) |
| Session 14: Air absorption | ✅ Complete (works alongside) |

**No blocking dependencies** - can implement anytime

---

## Rollback Plan

If issues arise:

1. **Disable download UI** - Comment out download button in HTML
2. **Revert spatial_audio.js** - Restore from backup (remove CachedSampleSource)
3. **Fallback** - Use original network-only behavior

**Mitigation:** Test with small soundscape (2-3 sounds) first

---

## Related Documentation

- **Lazy Loading:** `LAZY_LOADING_SPECIFICATION.md`
- **Cached Streaming:** `CACHED_STREAM_SOURCE.md`
- **Cache API:** [MDN Cache API](https://developer.mozilla.org/en-US/docs/Web/API/Cache)

---

## Next Steps

1. ✅ Create `SESSION_DOWNLOAD.md` (this document)
2. ⏳ Update `FEATURES.md` (add Feature 15)
3. ⏳ Implement Session 15A-G
4. ⏳ Test on mobile devices
5. ⏳ Update user documentation

---

**Total Effort:** ~480 lines across 7 sub-sessions (~4h 30m)

**Priority:** High (enables offline playback - critical for remote/underground use)

**Risk:** Low (Cache API is mature, well-tested)
