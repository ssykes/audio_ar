/**
 * OfflineDownloadManager - Manage offline soundscape downloads
 *
 * Downloads audio files to Cache API for offline playback.
 * Each soundscape gets its own cache: `soundscape-{id}`
 *
 * @version 1.2 - Added logging to diagnose missing areas in cached data
 * @since Feature 15: Offline Soundscape Download
 */

// ============================================================================
// Configuration Constants
// ============================================================================

const DOWNLOAD_MANAGER_VERSION = '1.2';

// Cache and storage key prefixes
const CACHE_PREFIX = 'soundscape-';
const STORAGE_KEY_PREFIX = 'offline_soundscape_full_';

// Retry configuration
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;  // Base delay in ms
const DOWNLOAD_TIMEOUT_MS = 5 * 60 * 1000;  // 5 minutes for large files

console.log('[download_manager.js] Loading v' + DOWNLOAD_MANAGER_VERSION + '...');

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Calculate download progress percentage
 * @param {number} downloaded - Files downloaded
 * @param {number} total - Total files
 * @returns {number} Percentage (0-100)
 */
function calculatePercent(downloaded, total) {
  return total > 0 ? Math.round((downloaded / total) * 100) : 0;
}

class OfflineDownloadManager {
    constructor() {
        this.cacheName = null;
        this.downloadQueue = new Map();
        this.maxRetries = MAX_RETRIES;
        this.retryDelay = RETRY_DELAY_MS;
    }

    /**
     * Download all sounds for a soundscape
     * @param {string} soundscapeId - Soundscape ID
     * @param {string} soundscapeName - Soundscape name (for UI/logging)
     * @param {Array} waypoints - Waypoint data (with sound URLs)
     * @param {Object} soundscapeData - Optional full soundscape data (name, behaviors, areas, etc.)
     * @returns {Promise<{success: boolean, downloaded: number, failed: number, total: number}>}
     */
    async downloadSoundscape(soundscapeId, soundscapeName, waypoints, soundscapeData = null) {
        // Extract unique sound URLs from waypoints
        const waypointUrls = waypoints.map(wp => wp.soundUrl).filter(url => url);

        // Feature 17: Extract unique sound URLs from areas
        const areaUrls = (soundscapeData?.areas || []).map(a => a.soundUrl).filter(url => url);

        // Combine and deduplicate (same audio file might be used in both waypoints and areas)
        const urls = [...new Set([...waypointUrls, ...areaUrls])];

        if (urls.length === 0) {
            console.warn('[OfflineDownload] No audio URLs to download');
            return { success: true, downloaded: 0, failed: 0, total: 0, failedUrls: [] };
        }

        console.log(`[OfflineDownload] Starting download: ${soundscapeName}`);
        console.log(`[OfflineDownload] 📍 Waypoints: ${waypoints.length}`);
        console.log(`[OfflineDownload] 🗺️ Areas: ${(soundscapeData?.areas || []).length}`);
        console.log(`[OfflineDownload] 🔊 ${urls.length} unique audio file(s) to download`);

        // Create cache for this soundscape
        this.cacheName = `${CACHE_PREFIX}${soundscapeId}`;
        const cache = await caches.open(this.cacheName);

        // Track progress and failures
        let downloaded = 0;
        const failedUrls = [];
        const total = urls.length;

        // Store in queue
        this.downloadQueue.set(soundscapeId, { downloaded, total, percent: 0 });

        // Update UI with initial progress
        this._onProgress(soundscapeId, 0, total);

        // Download each URL
        for (const url of urls) {
            try {
                await this._downloadAndCache(cache, url);
                downloaded++;
                console.log(`[OfflineDownload] ✅ Success (${downloaded}/${total}): ${url}`);
            } catch (error) {
                failedUrls.push(url);
                console.error(`[OfflineDownload] ❌ FAILED (${failedUrls.length}/${total}): ${url}`);
                console.error(`[OfflineDownload] Error details:`, error.message);
            }

            // Update progress
            this.downloadQueue.set(soundscapeId, {
                downloaded,
                total,
                percent: calculatePercent(downloaded, total)
            });
            this._onProgress(soundscapeId, downloaded, total);
        }

        // Store full soundscape data for offline loading (including waypoints and areas)
        if (downloaded > 0) {
            // Restructure: Include areas inside soundscapeData object for unified offline access
            const structuredData = {
                id: soundscapeId,
                name: soundscapeName,
                waypoints: waypoints,
                areas: soundscapeData?.areas || [],
                behaviors: soundscapeData?.behaviors || [],
                soundscape: soundscapeData?.soundscape || null,
                downloadedAt: new Date().toISOString()
            };
            
            console.log(`[OfflineDownload] 💾 Structured data before storing:`, {
                id: structuredData.id,
                name: structuredData.name,
                waypointCount: structuredData.waypoints?.length || 0,
                areaCount: structuredData.areas?.length || 0,
                behaviorCount: structuredData.behaviors?.length || 0,
                areas: structuredData.areas
            });
            
            await this._storeSoundscapeData(soundscapeId, structuredData);
            console.log(`[OfflineDownload] 💾 Stored soundscape data for offline loading (waypoints: ${waypoints.length}, areas: ${structuredData.areas.length})`);
        }

        // Log summary
        console.log(`[OfflineDownload] ==============================`);
        console.log(`[OfflineDownload] Download Complete: ${soundscapeName}`);
        console.log(`[OfflineDownload] ✅ Succeeded: ${downloaded}`);
        console.log(`[OfflineDownload] ❌ Failed: ${failedUrls.length}`);
        if (failedUrls.length > 0) {
            console.log(`[OfflineDownload] Failed URLs:`, failedUrls);
        }
        console.log(`[OfflineDownload] ==============================`);

        // Clean up queue after completion
        setTimeout(() => this.downloadQueue.delete(soundscapeId), 5000);

        const success = failedUrls.length === 0;
        return { success, downloaded, failed: failedUrls.length, total, failedUrls };
    }

    /**
     * Store full soundscape data in localStorage for offline loading
     * @param {string} soundscapeId
     * @param {Object} data - Full soundscape data including waypoints, areas, and behaviors
     * @private
     */
    async _storeSoundscapeData(soundscapeId, data) {
        try {
            const serialized = JSON.stringify(data);
            console.log(`[OfflineDownload] 📝 Serializing data for ${soundscapeId}: ${serialized.length} bytes`);
            console.log(`[OfflineDownload] 📝 Areas in serialized data: ${JSON.stringify(data.areas)}`);
            
            localStorage.setItem(STORAGE_KEY_PREFIX + soundscapeId, serialized);
            console.log(`[OfflineDownload] Stored offline data for ${soundscapeId} (waypoints: ${data.waypoints?.length || 0}, areas: ${data.areas?.length || 0})`);
        } catch (err) {
            console.error(`[OfflineDownload] Failed to store soundscape data:`, err);
            // Try to store just waypoints if full data is too large
            try {
                const minimalData = {
                    id: soundscapeId,
                    name: data.name,
                    waypoints: data.waypoints,
                    areas: data.areas || [],
                    downloadedAt: data.downloadedAt
                };
                localStorage.setItem(STORAGE_KEY_PREFIX + soundscapeId, JSON.stringify(minimalData));
                console.log(`[OfflineDownload] Stored minimal offline data for ${soundscapeId}`);
            } catch (err2) {
                console.error(`[OfflineDownload] Failed to store minimal data:`, err2);
            }
        }
    }

    /**
     * Fetch with timeout
     * @param {string} url - URL to fetch
     * @param {number} timeoutMs - Timeout in ms
     * @returns {Promise<Response>}
     * @private
     */
    async _fetchWithTimeout(url, timeoutMs = DOWNLOAD_TIMEOUT_MS) {
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

    /**
     * Download single URL and cache response
     * @param {Cache} cache - Cache API object
     * @param {string} url - URL to download
     * @throws {Error} If all retries fail
     * @private
     */
    async _downloadAndCache(cache, url) {
        let lastError;

        for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
            try {
                console.log(`[OfflineDownload] ⬇️ Starting: ${url} (attempt ${attempt}/${this.maxRetries})`);

                // Fetch with timeout (5 minutes for large files)
                const response = await this._fetchWithTimeout(url, DOWNLOAD_TIMEOUT_MS);

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }

                // Get content length for logging
                const contentLength = response.headers.get('content-length');
                const sizeMB = contentLength ? (parseInt(contentLength) / 1024 / 1024).toFixed(1) : 'unknown';
                console.log(`[OfflineDownload] 📦 File size: ${sizeMB} MB`);

                // Clone response before caching (can only consume once)
                const responseToCache = response.clone();
                await cache.put(url, responseToCache);

                console.log(`[OfflineDownload] ✅ Cached: ${url} (${sizeMB} MB)`);
                return;  // Success

            } catch (error) {
                lastError = error;
                
                if (error.name === 'AbortError') {
                    console.error(`[OfflineDownload] ⏱️ Download timeout (attempt ${attempt})`);
                } else {
                    console.warn(`[OfflineDownload] Attempt ${attempt} failed: ${url} - ${error.message}`);
                }

                // Wait before retry (exponential backoff)
                if (attempt < this.maxRetries) {
                    const delay = Math.pow(2, attempt - 1) * this.retryDelay;
                    console.log(`[OfflineDownload] Retrying in ${delay}ms...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
        }

        throw lastError;  // All retries failed
    }

    /**
     * Update progress UI
     * Dispatches custom event for UI components to listen
     * @param {string} soundscapeId
     * @param {number} downloaded
     * @param {number} total
     * @protected
     */
    _onProgress(soundscapeId, downloaded, total) {
        const percent = calculatePercent(downloaded, total);
        console.log(`[OfflineDownload] Progress: ${percent}% (${downloaded}/${total})`);

        // Dispatch custom event for UI to listen
        const event = new CustomEvent('offline-download-progress', {
            detail: {
                soundscapeId,
                downloaded,
                total,
                percent,
                status: downloaded === total ? 'complete' : 'downloading'
            }
        });
        
        console.log(`[OfflineDownload] 📡 Dispatching progress event: ${percent}%`);
        window.dispatchEvent(event);
    }

    /**
     * Check if soundscape is available offline
     * @param {string} soundscapeId
     * @returns {Promise<boolean>}
     */
    async isAvailableOffline(soundscapeId) {
        const cacheName = `${CACHE_PREFIX}${soundscapeId}`;
        try {
            const cache = await caches.open(cacheName);
            const keys = await cache.keys();
            const isAvailable = keys.length > 0;

            if (isAvailable) {
                console.log(`[OfflineDownload] ✅ ${soundscapeId} available offline (${keys.length} files)`);
            }

            return isAvailable;
        } catch (err) {
            console.error(`[OfflineDownload] Error checking offline status:`, err);
            return false;
        }
    }

    /**
     * Get cached soundscape data (for offline loading)
     * Returns full soundscape data including waypoints, areas, and behaviors
     * @param {string} soundscapeId
     * @returns {Promise<{id: string, name: string, waypoints: Array, areas: Array, behaviors: Array, soundscape?: Object, downloadedAt: string} | null>}
     */
    async getCachedSoundscape(soundscapeId) {
        try {
            const stored = localStorage.getItem(STORAGE_KEY_PREFIX + soundscapeId);
            if (!stored) {
                console.warn(`[OfflineDownload] No cached data found for ${soundscapeId}`);
                return null;
            }

            const data = JSON.parse(stored);
            console.log(`[OfflineDownload] ✅ Retrieved cached data for ${soundscapeId}`);
            console.log(`[OfflineDownload] 📋 Data keys: ${Object.keys(data).join(', ')}`);
            console.log(`[OfflineDownload] 📊 Waypoints: ${data.waypoints?.length || 0}, Areas: ${data.areas?.length || 0}, Behaviors: ${data.behaviors?.length || 0}`);
            
            // Check for missing properties (downloaded with old version)
            if (data.areas === undefined) {
                console.warn(`[OfflineDownload] ⚠️ Cached data missing 'areas' property - downloaded with old version`);
            }
            if (data.behaviors === undefined) {
                console.warn(`[OfflineDownload] ⚠️ Cached data missing 'behaviors' property - downloaded with old version`);
            }
            
            return data;
        } catch (err) {
            console.error(`[OfflineDownload] Error retrieving cached soundscape:`, err);
            return null;
        }
    }

    /**
     * Delete offline cache for soundscape
     * @param {string} soundscapeId
     * @returns {Promise<void>}
     */
    async deleteOfflineCache(soundscapeId) {
        const cacheName = `${CACHE_PREFIX}${soundscapeId}`;
        try {
            const deleted = await caches.delete(cacheName);
            if (deleted) {
                console.log(`[OfflineDownload] 🗑️ Deleted cache: ${cacheName}`);
            } else {
                console.warn(`[OfflineDownload] Cache not found: ${cacheName}`);
            }

            // Also clear stored data
            localStorage.removeItem(STORAGE_KEY_PREFIX + soundscapeId);
            console.log(`[OfflineDownload] 🗑️ Cleared stored data for ${soundscapeId}`);
        } catch (err) {
            console.error(`[OfflineDownload] Error deleting cache:`, err);
            throw err;
        }
    }

    /**
     * Get download progress
     * @param {string} soundscapeId
     * @returns {{downloaded: number, total: number, percent: number} | null}
     */
    getProgress(soundscapeId) {
        return this.downloadQueue.get(soundscapeId) || null;
    }

    /**
     * Get all cached soundscapes
     * @returns {Promise<Array<{id: string, fileCount: number}>>}
     */
    async getAllCachedSoundscapes() {
        const cacheNames = await caches.keys();
        const cached = [];

        for (const cacheName of cacheNames) {
            if (cacheName.startsWith(CACHE_PREFIX)) {
                const soundscapeId = cacheName.replace(CACHE_PREFIX, '');
                try {
                    const cache = await caches.open(cacheName);
                    const keys = await cache.keys();
                    cached.push({
                        id: soundscapeId,
                        fileCount: keys.length
                    });
                } catch (err) {
                    console.error(`[OfflineDownload] Error reading cache ${cacheName}:`, err);
                }
            }
        }

        return cached;
    }

    /**
     * Get total cache size (approximate)
     * @returns {Promise<number>} Size in bytes
     */
    async getTotalCacheSize() {
        const cached = await this.getAllCachedSoundscapes();
        let totalSize = 0;

        for (const { id } of cached) {
            const cacheName = `${CACHE_PREFIX}${id}`;
            try {
                const cache = await caches.open(cacheName);
                const requests = await cache.keys();
                
                for (const request of requests) {
                    const response = await cache.match(request);
                    if (response) {
                        const blob = await response.blob();
                        totalSize += blob.size;
                    }
                }
            } catch (err) {
                console.error(`[OfflineDownload] Error calculating size for ${cacheName}:`, err);
            }
        }

        return totalSize;
    }

    /**
     * Clear all offline caches
     * @returns {Promise<void>}
     */
    async clearAllCaches() {
        const cacheNames = await caches.keys();
        
        for (const cacheName of cacheNames) {
            if (cacheName.startsWith('soundscape-')) {
                await caches.delete(cacheName);
            }
        }
        
        console.log('[OfflineDownload] 🗑️ Cleared all offline caches');
    }
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { OfflineDownloadManager };
} else {
    window.OfflineDownloadManager = OfflineDownloadManager;
}

console.log('[download_manager.js] OfflineDownloadManager loaded');
