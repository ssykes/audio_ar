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
     * @param {Array} waypoints - Waypoint data (with sound IDs)
     * @param {Object} soundscapeData - Optional full soundscape data (name, behaviors, areas, etc.)
     * @returns {Promise<{success: boolean, downloaded: number, failed: number, total: number}>}
     */
    async downloadSoundscape(soundscapeId, soundscapeName, waypoints, soundscapeData = null) {
        // Extract unique sound IDs from waypoints
        const waypointSoundIds = [...new Set(waypoints.map(wp => wp.soundId).filter(id => id))];

        // Extract unique sound IDs from areas
        const areaSoundIds = [...new Set((soundscapeData?.areas || []).map(a => a.soundId).filter(id => id))];

        // Combine and deduplicate sound IDs
        const allSoundIds = [...new Set([...waypointSoundIds, ...areaSoundIds])];

        if (allSoundIds.length === 0) {
            console.warn('[OfflineDownload] No sound IDs to download');
            // Still store the soundscape data even if there are no sounds
            const structuredData = {
                id: soundscapeId,
                name: soundscapeName,
                waypoints: waypoints,
                areas: soundscapeData?.areas || [],
                behaviors: soundscapeData?.behaviors || [],
                soundscape: soundscapeData?.soundscape || null,
                downloadedAt: new Date().toISOString()
            };

            await this._storeSoundscapeData(soundscapeId, structuredData);
            console.log(`[OfflineDownload] 💾 Stored soundscape data for offline loading (no sounds to download)`);

            return { success: true, downloaded: 0, failed: 0, total: 0, failedUrls: [] };
        }

        console.log(`[OfflineDownload] Starting download: ${soundscapeName}`);
        console.log(`[OfflineDownload] 📍 Waypoints: ${waypoints.length}`);
        console.log(`[OfflineDownload] 🗺️ Areas: ${(soundscapeData?.areas || []).length}`);
        console.log(`[OfflineDownload] 🔊 ${allSoundIds.length} unique sound ID(s) to download`);

        // Create cache for this soundscape
        this.cacheName = `${CACHE_PREFIX}${soundscapeId}`;
        const cache = await caches.open(this.cacheName);

        // Track progress and failures
        let downloaded = 0;
        const failedSoundIds = [];
        const total = allSoundIds.length;

        // Store in queue
        this.downloadQueue.set(soundscapeId, { downloaded, total, percent: 0 });

        // Update UI with initial progress
        this._onProgress(soundscapeId, 0, total);

        // Download each sound by ID
        for (const soundId of allSoundIds) {
            try {
                // Get sound details by ID to get the URL
                console.log(`[OfflineDownload] 🔍 Retrieving sound details for ID: ${soundId}`);
                const soundDetails = await this._getSoundDetailsById(soundId);
                
                if (!soundDetails || !soundDetails.source || !soundDetails.source.url) {
                    throw new Error(`Could not retrieve sound details for ID: ${soundId}. Details: ${JSON.stringify(soundDetails)}`);
                }

                const soundUrl = soundDetails.source.url;
                console.log(`[OfflineDownload] 📎 Sound URL for ${soundId}: ${soundUrl}`);

                // Check if file with this hash already exists in cache to prevent duplicates
                const hashedFilename = await this._hashSoundId(soundId);
                console.log(`[OfflineDownload] 🔑 Hashed filename for ${soundId}: ${hashedFilename}`);
                const existingRequest = await cache.match(hashedFilename);

                if (existingRequest) {
                    console.log(`[OfflineDownload] 🔄 Skipping duplicate: ${soundId} (already cached as ${hashedFilename})`);
                    downloaded++;
                    // Update progress
                    this.downloadQueue.set(soundscapeId, {
                        downloaded,
                        total,
                        percent: calculatePercent(downloaded, total)
                    });
                    this._onProgress(soundscapeId, downloaded, total);
                    continue;
                }

                // Download and cache the file with the hashed filename
                console.log(`[OfflineDownload] ⬇️ Attempting to download: ${soundUrl} -> ${hashedFilename}`);
                await this._downloadAndCacheAsHash(cache, soundUrl, hashedFilename);
                downloaded++;
                console.log(`[OfflineDownload] ✅ Success (${downloaded}/${total}): ${soundId} -> ${hashedFilename}`);
            } catch (error) {
                failedSoundIds.push(soundId);
                console.error(`[OfflineDownload] ❌ FAILED (${failedSoundIds.length}/${total}): ${soundId}`);
                console.error(`[OfflineDownload] Error details:`, error.message);
                console.error(`[OfflineDownload] Stack trace:`, error.stack);
            }

            // Update progress
            this.downloadQueue.set(soundscapeId, {
                downloaded,
                total,
                percent: calculatePercent(downloaded, total)
            });
            this._onProgress(soundscapeId, downloaded, total);
        }

        // Convert failed sound IDs to URLs for the return value
        const failedUrls = [];
        for (const soundId of failedSoundIds) {
            try {
                const soundDetails = await this._getSoundDetailsById(soundId);
                if (soundDetails && soundDetails.source && soundDetails.source.url) {
                    failedUrls.push(soundDetails.source.url);
                }
            } catch (error) {
                console.error(`[OfflineDownload] Could not get URL for failed sound ID: ${soundId}`, error);
                // Add a placeholder if we can't get the URL
                failedUrls.push(`sound://${soundId}`);
            }
        }

        // Store full soundscape data for offline loading (including waypoints and areas)
        if (downloaded > 0 || allSoundIds.length === 0) {
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
                areas: structuredData.areas.map(a => ({
                    id: a.id,
                    name: a.name,
                    soundId: a.soundId || 'MISSING!',
                    type: a.type
                }))
            });

            await this._storeSoundscapeData(soundscapeId, structuredData);
            console.log(`[OfflineDownload] 💾 Stored soundscape data for offline loading (waypoints: ${waypoints.length}, areas: ${structuredData.areas.length})`);
        }

        // Calculate final statistics
        const successfulDownloads = total - failedSoundIds.length;
        const success = failedSoundIds.length === 0;

        // Log summary
        console.log(`[OfflineDownload] ==============================`);
        console.log(`[OfflineDownload] Download Complete: ${soundscapeName}`);
        console.log(`[OfflineDownload] ✅ Succeeded: ${successfulDownloads}`);
        console.log(`[OfflineDownload] ❌ Failed: ${failedSoundIds.length}`);
        if (failedUrls.length > 0) {
            console.log(`[OfflineDownload] Failed URLs:`, failedUrls);
        }
        console.log(`[OfflineDownload] ==============================`);

        // Clean up queue after completion
        setTimeout(() => this.downloadQueue.delete(soundscapeId), 5000);

        return { success, downloaded: successfulDownloads, failed: failedSoundIds.length, total, failedUrls };
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
     * Get sound details by ID using the global api client
     * @param {string} soundId - Sound ID
     * @returns {Promise<Object>} Sound details
     * @private
     */
    async _getSoundDetailsById(soundId) {
        console.log(`[OfflineDownload] 🔍 Getting sound details for ID: ${soundId}`);
        
        // Use the global api client if available
        if (window.app && window.app.api) {
            console.log(`[OfflineDownload] 🌐 Using window.app.api to get sound details`);
            const result = await window.app.api.getSoundById(soundId);
            console.log(`[OfflineDownload] 📥 Retrieved sound details via window.app.api:`, result);
            return result;
        } else {
            console.log(`[OfflineDownload] 🌐 Using direct fetch to get sound details`);
            
            // Fallback to direct fetch if api client not available
            const token = localStorage.getItem('audio_ar_token');
            const headers = {
                'Content-Type': 'application/json'
            };

            if (token) {
                headers['Authorization'] = `Bearer ${token}`;
            }
            
            console.log(`[OfflineDownload] 🔐 Token available: ${!!token}`);
            console.log(`[OfflineDownload] 📡 Fetching from: ${window.API_BASE_URL || '/api'}/sounds/${soundId}`);

            const response = await fetch(`${window.API_BASE_URL || '/api'}/sounds/${soundId}`, {
                headers: headers
            });

            console.log(`[OfflineDownload] 📡 Response status: ${response.status} ${response.statusText}`);
            
            if (!response.ok) {
                console.error(`[OfflineDownload] ❌ Fetch failed: ${response.status} ${response.statusText}`);
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const result = await response.json();
            console.log(`[OfflineDownload] 📥 Retrieved sound details via direct fetch:`, result);
            return result;
        }
    }

    /**
     * Hash sound ID to a shorter string for filename
     * @param {string} soundId - Sound ID to hash
     * @returns {Promise<string>} Promise resolving to hashed string (first 10 characters of hex digest)
     * @private
     */
    async _hashSoundId(soundId) {
        // Simple hash function using built-in crypto API
        const encoder = new TextEncoder();
        const data = encoder.encode(soundId);
        
        console.log(`[OfflineDownload] 🔑 Hashing sound ID: ${soundId}`);
        const digest = await crypto.subtle.digest('SHA-256', data);
        // Convert the ArrayBuffer to hex string
        const hashArray = Array.from(new Uint8Array(digest));
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        // Return first 10 characters for a reasonably short but unique identifier
        const hashResult = hashHex.substring(0, 10);
        console.log(`[OfflineDownload] 🔑 Hashed ${soundId} → ${hashResult}`);
        return hashResult;
    }

    /**
     * Download and cache file with hashed filename
     * @param {Cache} cache - Cache API object
     * @param {string} url - Original URL to download
     * @param {string} hashedFilename - Filename to store in cache
     * @throws {Error} If download fails
     * @private
     */
    async _downloadAndCacheAsHash(cache, url, hashedFilename) {
        try {
            console.log(`[OfflineDownload] ⬇️ Starting: ${url} -> ${hashedFilename}`);
            
            // Check if the URL is accessible before attempting download
            console.log(`[OfflineDownload] 🕵️ Checking URL accessibility: ${url}`);
            try {
                const headResponse = await fetch(url, { method: 'HEAD' });
                console.log(`[OfflineDownload] 🕵️ HEAD request status: ${headResponse.status} for ${url}`);
                
                if (!headResponse.ok) {
                    console.warn(`[OfflineDownload] ⚠️ URL may not be accessible: ${url} (status: ${headResponse.status})`);
                }
            } catch (headError) {
                console.warn(`[OfflineDownload] ⚠️ Could not check URL accessibility: ${url} (${headError.message})`);
            }

            // Fetch with timeout (5 minutes for large files)
            const response = await this._fetchWithTimeout(url, DOWNLOAD_TIMEOUT_MS);

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            // Get content length for logging
            const contentLength = response.headers.get('content-length');
            const sizeMB = contentLength ? (parseInt(contentLength) / 1024 / 1024).toFixed(1) : 'unknown';
            console.log(`[OfflineDownload] 📦 File size: ${sizeMB} MB`);

            // Check content type to ensure it's an audio file
            const contentType = response.headers.get('content-type');
            console.log(`[OfflineDownload] 📄 Content-Type: ${contentType}`);
            
            if (!contentType || !contentType.includes('audio')) {
                console.warn(`[OfflineDownload] ⚠️ Content-Type is not audio: ${contentType}`);
            }

            // Create a new request with the hashed filename as the URL
            const hashedRequest = new Request(hashedFilename);
            console.log(`[OfflineDownload] 📥 Creating cache request for: ${hashedFilename}`);
            
            const responseToCache = response.clone();
            console.log(`[OfflineDownload] 📥 Cloned response for caching`);
            
            await cache.put(hashedRequest, responseToCache);
            console.log(`[OfflineDownload] ✅ Cached: ${hashedFilename} (${sizeMB} MB)`);

            // Verify the file was actually cached
            const verification = await cache.match(hashedFilename);
            if (verification) {
                console.log(`[OfflineDownload] ✅ Verification: ${hashedFilename} exists in cache`);
            } else {
                console.error(`[OfflineDownload] ❌ Verification failed: ${hashedFilename} not found in cache`);
            }
        } catch (error) {
            console.error(`[OfflineDownload] ❌ Failed to cache: ${hashedFilename}`, error);
            console.error(`[OfflineDownload] Error stack:`, error.stack);
            throw error;
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
