/**
 * Service Worker for Audio AR
 * Simple cache-first strategy for offline pages
 *
 * Cache version is updated automatically by deploy.ps1
 * 
 * Features:
 * - Auto-updates when deploy changes CACHE_VERSION
 * - Message handlers for manual update triggers (SKIP_WAITING, CLIENTS_CLAIM)
 * - Cleans up old audio-ar caches on activate (preserves soundscape caches)
 */

// ============================================================================
// Configuration Constants
// ============================================================================

const CACHE_VERSION = 'v1';  // Updated for map_editor_v2.html skip
const CACHE_NAME = `audio-ar-${CACHE_VERSION}`;

// Files to cache (same-origin)
const FILES_TO_CACHE = [
  'soundscape_picker.html',
  'map_player.html',
  'map_offline.html',
  'api-client.js',
  'soundscape.js',
  'download_manager.js',
  'spatial_audio.js',
  'spatial_audio_app.js',
  'map_shared.js',
  'map_player.js',
  'wake_lock_helper.js',
  'manifest.json',
  'icon-192.svg',
];

// CDN resources to cache (cross-origin)
const CDN_RESOURCES = [
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
];

// Map tile patterns to cache (cache-first strategy)
const MAP_TILE_PATTERNS = [
  'https://tile.openstreetmap.org',
  'https://{s}.tile.openstreetmap.org',
];

// Audio file extensions (handled by CachedSampleSource, not Service Worker)
const AUDIO_EXTENSIONS = ['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac'];

// API path prefix (handled by api-client.js, not Service Worker)
const API_PATH_PREFIX = '/api/';

// Placeholder SVG for offline map tiles
const OFFLINE_TILE_PLACEHOLDER =
  '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256">' +
  '<rect fill="#e0e0e0" width="256" height="256"/>' +
  '<text x="50%" y="50%" text-anchor="middle" dy=".3em" font-size="14" fill="#999">Offline</text>' +
  '</svg>';

// ============================================================================
// Helper Functions
// ============================================================================

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

/**
 * Cache-first strategy with network fallback
 * @param {FetchEvent} event - Fetch event
 * @param {string} cacheName - Cache to use
 * @param {Object} options - Options
 * @param {string} [options.logPrefix] - Log prefix (e.g., '[SW] 🗺️')
 * @param {string} [options.placeholder] - Placeholder response for errors
 * @param {boolean} [options.shouldCache=true] - Whether to cache network responses
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

// Install: Cache all pages immediately
self.addEventListener('install', (event) => {
  console.log('[SW] Install event');

  // Skip waiting - activate immediately instead of waiting for old SW to die
  self.skipWaiting();

  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Opening cache:', CACHE_NAME);
        console.log('[SW] Caching', FILES_TO_CACHE.length, 'local files');
        console.log('[SW] Caching', CDN_RESOURCES.length, 'CDN resources');

        // Cache local files with detailed logging
        return Promise.all(
          FILES_TO_CACHE.map(async (file) => {
            try {
              console.log('[SW] 📥 Caching:', file);
              await cache.add(file);
              console.log('[SW] ✅ Cached:', file);
            } catch (err) {
              console.error('[SW] ❌ Failed to cache', file, ':', err);
            }
          })
        ).then(() => {
          console.log('[SW] ✅ Local files cached');
          // Then cache CDN resources
          return Promise.all(
            CDN_RESOURCES.map(url =>
              cache.add(url).catch(err => {
                console.warn('[SW] Failed to cache CDN resource:', url, err);
              })
            )
          );
        });
      })
      .then(() => {
        console.log('[SW] ✅ All resources cached successfully');
        console.log('[SW] Installation complete - SW will activate on next load');
      })
      .catch((error) => {
        console.error('[SW] ❌ Cache failed:', error);
        // Still activate even if some files fail
        return self.skipWaiting();
      })
  );
});

// Activate: Take control immediately and clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activate event');

  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        console.log('[SW] Found existing caches:', cacheNames);
        return Promise.all(
          cacheNames
            .filter((name) => {
              // Delete old audio-ar caches (but keep soundscape caches!)
              if (name.startsWith('audio-ar-') && name !== CACHE_NAME) {
                console.log('[SW] 🗑️ Deleting old cache:', name);
                return true;
              }
              return false;
            })
            .map((name) => {
              console.log('[SW] Deleting cache:', name);
              return caches.delete(name);
            })
        );
      })
      .then(async () => {
        console.log('[SW] ✅ Old caches deleted');
        
        // Verify all critical files are cached
        const cache = await caches.open(CACHE_NAME);
        const cachedKeys = await cache.keys();
        const cachedURLs = cachedKeys.map(k => k.url);
        
        console.log('[SW] 🔍 Verifying cached files...');
        console.log('[SW] Expected:', FILES_TO_CACHE.length, 'files');
        console.log('[SW] Cached:', cachedKeys.length, 'files');
        
        // Check for missing critical files
        const missing = FILES_TO_CACHE.filter(file => {
          const fullPath = self.location.origin + '/' + file;
          return !cachedURLs.includes(fullPath);
        });
        
        if (missing.length > 0) {
          console.error('[SW] ⚠️ Missing critical files:', missing);
          console.error('[SW] ⚠️ These files should be cached but are not!');
          console.error('[SW] ⚠️ Offline mode may not work properly');
        } else {
          console.log('[SW] ✅ All critical files verified');
        }
        
        console.log('[SW] ✅ Activation complete');
        console.log('[SW] Claiming all clients');
        return self.clients.claim();
      })
  );
});

// Message handler - allow pages to trigger SW update check
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    console.log('[SW] 🔄 Received SKIP_WAITING message');
    self.skipWaiting();
  }
  if (event.data && event.data.type === 'CLIENTS_CLAIM') {
    console.log('[SW] 🔄 Received CLIENTS_CLAIM message');
    self.clients.claim();
  }
  if (event.data && event.data.type === 'CACHE_VERSION') {
    // Return current cache version to caller
    event.ports[0].postMessage({ type: 'CACHE_VERSION', version: CACHE_VERSION });
  }
});

// Fetch: Cache-first strategy
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Only handle GET requests
  if (event.request.method !== 'GET') {
    return;
  }

  // Skip map_editor_v2.html - desktop editor mode, not for offline use
  if (url.pathname.includes('map_editor_v2.html')) {
    console.log('[SW] ⏭️ Skipping map_editor_v2.html (desktop mode - no offline)');
    return;
  }

  // Skip audio file requests - let CachedSampleSource handle them directly
  // Audio files are managed by OfflineDownloadManager in separate caches
  if (url.pathname.match(new RegExp(`\\.(${AUDIO_EXTENSIONS.join('|')})($|\\?)`, 'i'))) {
    console.log('[SW] ⏭️ Skipping audio file (handled by CachedSampleSource):', url.pathname);
    return;
  }

  // Skip API requests - let api-client.js handle them
  if (url.pathname.startsWith(API_PATH_PREFIX)) {
    console.log('[SW] ⏭️ Skipping API request:', url.pathname);
    return;
  }

  // Map tiles - cache-first strategy with network fallback
  if (url.hostname.includes('tile.openstreetmap.org')) {
    console.log('[SW] 🗺️ Map tile request:', url.pathname);
    event.respondWith(
      cacheFirstStrategy(event, CACHE_NAME, {
        logPrefix: '[SW] 🗺️',
        placeholder: OFFLINE_TILE_PLACEHOLDER
      })
    );
    return;
  }

  console.log('[SW] 📄 Fetch request:', url.pathname, url.search);

  event.respondWith(
    // Try exact match first, then try without query string
    (async () => {
      // Try exact match
      let cachedResponse = await caches.match(event.request);
      
      if (!cachedResponse && url.search) {
        // If no match and URL has query string, try without query string
        const basePath = url.origin + url.pathname;
        const baseRequest = new Request(basePath);
        console.log('[SW] 🔄 Trying base URL without query string:', basePath);
        cachedResponse = await caches.match(baseRequest);
        
        if (cachedResponse) {
          console.log('[SW] ✅ Found cached file (without query string)');
        }
      }
      
      return cachedResponse;
    })()
      .then(async (cachedResponse) => {
        if (cachedResponse) {
          console.log('[SW] 📦 CACHE HIT:', url.href);
          
          // For HTML pages, also check if we have offline soundscapes
          if (url.pathname.endsWith('soundscape_picker.html')) {
            console.log('[SW] 🎧 Serving soundscape_picker.html from cache');
            // Check if we have offline soundscapes cached
            try {
              const cacheNames = await caches.keys();
              const soundscapeCaches = cacheNames.filter(name => name.startsWith('soundscape-'));
              if (soundscapeCaches.length > 0) {
                console.log('[SW] 🎧 Found', soundscapeCaches.length, 'offline soundscape cache(s)');
              } else {
                console.log('[SW] ⚠️ No offline soundscape caches found');
              }
            } catch (err) {
              console.error('[SW] Error checking soundscape caches:', err);
            }
          }
          
          return cachedResponse;
        }

        console.log('[SW] 📦 CACHE MISS, fetching from network:', url.href);
        console.log('[SW] Cache miss for:', url.pathname);

        // Not in cache, try network
        return fetch(event.request)
          .then((networkResponse) => {
            // If successful, cache for next time
            if (networkResponse && networkResponse.status === 200) {
              // Don't cache cross-origin responses without proper CORS
              if (url.origin === self.location.origin) {
                const responseClone = networkResponse.clone();
                caches.open(CACHE_NAME)
                  .then((cache) => {
                    cache.put(event.request, responseClone);
                    console.log('[SW] 💾 Cached from network:', url.href);
                  });
              }
            }
            return networkResponse;
          })
          .catch((error) => {
            console.error('[SW] ❌ Network fetch failed:', url.href, error);

            // For HTML pages, return a helpful offline page
            if (url.pathname.endsWith('.html') || url.pathname === '/') {
              console.log('[SW] 📄 Returning offline HTML page');
              
              // Special handling for soundscape_picker.html - check for offline soundscapes
              if (url.pathname.endsWith('soundscape_picker.html')) {
                console.log('[SW] 🎧 Offline soundscape_picker requested - checking for offline data...');
                
                // Return a page that tries to load offline soundscapes
                return new Response(`
                  <!DOCTYPE html>
                  <html>
                    <head>
                      <title>Offline - Soundscape Picker</title>
                      <meta name="viewport" content="width=device-width, initial-scale=1.0">
                      <style>
                        body { font-family: sans-serif; text-align: center; padding: 50px 20px; background: #1a1a2e; color: #fff; }
                        h1 { color: #00d9ff; }
                        p { color: #888; max-width: 400px; margin: 20px auto; line-height: 1.6; }
                        .btn { background: #00d9ff; color: #000; padding: 12px 24px; border: none; border-radius: 8px; cursor: pointer; font-size: 1em; margin: 10px; }
                        .btn:hover { background: #00ff88; }
                        .success { color: #00ff88; }
                        .error { color: #ff6b6b; }
                      </style>
                    </head>
                    <body>
                      <h1>📴 Offline Mode</h1>
                      <p id="status">Checking for offline soundscapes...</p>
                      <div id="actions" style="display:none;">
                        <button class="btn" onclick="location.reload()">🔄 Refresh</button>
                        <button class="btn" onclick="window.location.href='index.html'">🏠 Home</button>
                      </div>
                      <script>
                        // Try to check localStorage for offline soundscapes
                        try {
                          var cachedCount = localStorage.getItem('offline_soundscapes_count');
                          var hasToken = localStorage.getItem('audio_ar_token');
                          
                          if (hasToken && cachedCount && parseInt(cachedCount) > 0) {
                            document.getElementById('status').innerHTML = 
                              '✅ Found ' + cachedCount + ' offline soundscape(s)<br><br>' +
                              '<span class="success">Redirecting to soundscape picker...</span>';
                            
                            // Redirect to the actual picker page after a short delay
                            setTimeout(function() {
                              window.location.href = 'soundscape_picker.html';
                            }, 2000);
                          } else {
                            document.getElementById('status').innerHTML = 
                              '⚠️ No offline soundscapes found<br><br>' +
                              'To use offline mode:<br>' +
                              '1️⃣ Go online<br>' +
                              '2️⃣ Download soundscapes<br>' +
                              '3️⃣ Go back offline';
                            document.getElementById('actions').style.display = 'block';
                          }
                        } catch (e) {
                          document.getElementById('status').innerHTML = 
                              '⚠️ Unable to check offline status<br><br>' +
                              '<span class="error">Error: ' + e.message + '</span>';
                          document.getElementById('actions').style.display = 'block';
                        }
                      <\/script>
                    </body>
                  </html>
                `, {
                  status: 200,
                  headers: { 'Content-Type': 'text/html' }
                });
              }
              
              // Generic offline page for other HTML files
              return new Response(`
                <!DOCTYPE html>
                <html>
                  <head>
                    <title>Offline</title>
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <style>
                      body { font-family: sans-serif; text-align: center; padding: 50px 20px; background: #1a1a2e; color: #fff; }
                      h1 { color: #00d9ff; }
                      p { color: #888; max-width: 400px; margin: 20px auto; }
                      .btn { background: #00d9ff; color: #000; padding: 12px 24px; border: none; border-radius: 8px; cursor: pointer; font-size: 1em; margin: 10px; }
                      .btn:hover { background: #00ff88; }
                    </style>
                  </head>
                  <body>
                    <h1>📴 You're Offline</h1>
                    <p>This page needs to be cached first. Please go online and visit this page, then it will work offline.</p>
                    <button class="btn" onclick="location.reload()">🔄 Try Again</button>
                    <button class="btn" onclick="window.history.back()">← Back</button>
                  </body>
                </html>
              `, {
                status: 200,
                headers: { 'Content-Type': 'text/html' }
              });
            }

            // For other resources, return empty response (don't break the page)
            console.log('[SW] ⚠️ Resource not available offline:', url.pathname);
            return new Response('', { status: 200 });
          });
      })
      .catch((error) => handleFetchError(error, 'Cache match'))
  );
});

console.log('[SW] Service Worker script loaded');
