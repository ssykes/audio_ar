/**
 * OfflineDownloadManager - Manage offline soundscape downloads
 * 
 * Downloads audio files to Cache API for offline playback.
 * Each soundscape gets its own cache: `soundscape-{id}`
 * 
 * @version 1.0
 * @since Feature 15: Offline Soundscape Download
 */
class OfflineDownloadManager {
    constructor() {
        this.cacheName = null;
        this.downloadQueue = new Map();
        this.maxRetries = 3;
        this.retryDelay = 1000; // Base delay in ms
    }

    /**
     * Download all sounds for a soundscape
     * @param {string} soundscapeId - Soundscape ID
     * @param {string} soundscapeName - Soundscape name (for UI/logging)
     * @param {Array} waypoints - Waypoint data (with sound URLs)
     * @returns {Promise<{success: boolean, downloaded: number, failed: number, total: number}>}
     */
    async downloadSoundscape(soundscapeId, soundscapeName, waypoints) {
        // Extract unique sound URLs (avoid downloading same file twice)
        const urls = [...new Set(waypoints.map(wp => wp.soundUrl).filter(url => url))];
        
        if (urls.length === 0) {
            console.warn('[OfflineDownload] No audio URLs to download');
            return { success: true, downloaded: 0, failed: 0, total: 0, failedUrls: [] };
        }

        console.log(`[OfflineDownload] Starting download: ${soundscapeName}`);
        console.log(`[OfflineDownload] ${urls.length} unique audio file(s)`);

        // Create cache for this soundscape
        this.cacheName = `soundscape-${soundscapeId}`;
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
                percent: Math.round((downloaded / total) * 100) 
            });
            this._onProgress(soundscapeId, downloaded, total);
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
                const controller = new AbortController();
                const timeoutMs = 5 * 60 * 1000; // 5 minutes
                const timeoutId = setTimeout(() => {
                    console.error(`[OfflineDownload] ⏱️ Timeout after ${timeoutMs/1000}s for: ${url}`);
                    controller.abort();
                }, timeoutMs);

                const response = await fetch(url, { signal: controller.signal });
                clearTimeout(timeoutId);

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
        const percent = Math.round((downloaded / total) * 100);
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
        const cacheName = `soundscape-${soundscapeId}`;
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
     * Delete offline cache for soundscape
     * @param {string} soundscapeId
     * @returns {Promise<void>}
     */
    async deleteOfflineCache(soundscapeId) {
        const cacheName = `soundscape-${soundscapeId}`;
        try {
            const deleted = await caches.delete(cacheName);
            if (deleted) {
                console.log(`[OfflineDownload] 🗑️ Deleted cache: ${cacheName}`);
            } else {
                console.warn(`[OfflineDownload] Cache not found: ${cacheName}`);
            }
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
            if (cacheName.startsWith('soundscape-')) {
                const soundscapeId = cacheName.replace('soundscape-', '');
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
            const cacheName = `soundscape-${id}`;
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
