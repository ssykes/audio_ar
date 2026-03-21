/**
 * Service Worker for Audio AR
 * Simple cache-first strategy for offline pages
 */

const CACHE_NAME = 'audio-ar-v1';

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

// Install: Cache all pages immediately
self.addEventListener('install', (event) => {
  console.log('[SW] Install event');
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Opening cache:', CACHE_NAME);
        console.log('[SW] Caching', FILES_TO_CACHE.length, 'local files');
        console.log('[SW] Caching', CDN_RESOURCES.length, 'CDN resources');
        
        // Cache local files
        return cache.addAll(FILES_TO_CACHE)
          .then(() => {
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
        console.log('[SW] Skipping waiting - activating now');
        return self.skipWaiting();
      })
      .catch((error) => {
        console.error('[SW] ❌ Cache failed:', error);
        // Still activate even if some files fail
        return self.skipWaiting();
      })
  );
});

// Activate: Take control immediately
self.addEventListener('activate', (event) => {
  console.log('[SW] Activate event');
  
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        console.log('[SW] Found existing caches:', cacheNames);
        return Promise.all(
          cacheNames
            .filter((name) => name !== CACHE_NAME)
            .map((name) => {
              console.log('[SW] Deleting old cache:', name);
              return caches.delete(name);
            })
        );
      })
      .then(() => {
        console.log('[SW] ✅ Activation complete');
        console.log('[SW] Claiming all clients');
        return self.clients.claim();
      })
  );
});

// Fetch: Cache-first strategy
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // Only handle GET requests
  if (event.request.method !== 'GET') {
    return;
  }
  
  // Skip audio file requests - let CachedSampleSource handle them directly
  // Audio files are managed by OfflineDownloadManager in separate caches
  if (url.pathname.match(/\.(mp3|wav|ogg|m4a|aac|flac)($|\?)/i)) {
    console.log('[SW] ⏭️ Skipping audio file (handled by CachedSampleSource):', url.pathname);
    return;
  }
  
  // Skip API requests - let api-client.js handle them
  if (url.pathname.startsWith('/api/')) {
    console.log('[SW] ⏭️ Skipping API request:', url.pathname);
    return;
  }
  
  console.log('[SW] Fetch:', url.href);
  
  event.respondWith(
    caches.match(event.request)
      .then((cachedResponse) => {
        if (cachedResponse) {
          console.log('[SW] 📦 CACHE HIT:', url.href);
          return cachedResponse;
        }
        
        console.log('[SW] 📦 CACHE MISS, fetching from network:', url.href);
        
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
            
            // For map tiles, return a placeholder
            if (url.hostname.includes('tile.openstreetmap.org')) {
              console.log('[SW] 🗺️ Returning placeholder for map tile');
              return new Response(
                '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect fill="#ccc" width="256" height="256"/><text x="50%" y="50%" text-anchor="middle" dy=".3em" font-size="20" fill="#666">Offline</text></svg>',
                { 
                  status: 200,
                  headers: { 'Content-Type': 'image/svg+xml' }
                }
              );
            }
            
            // For other resources, return empty response (don't break the page)
            console.log('[SW] ⚠️ Resource not available offline:', url.pathname);
            return new Response('', { status: 200 });
          });
      })
      .catch((error) => {
        console.error('[SW] ❌ Cache match failed:', error);
        return new Response('', { status: 200 });
      })
  );
});

console.log('[SW] Service Worker script loaded');
