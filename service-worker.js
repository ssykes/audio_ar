/**
 * Service Worker for Audio AR App
 * Enables offline functionality by caching all assets
 * 
 * @version 1.1 (v3 cache)
 */

const CACHE_NAME = 'audio-ar-v26';
const UPDATE_CHECK_INTERVAL = 3600000; // Check for updates every hour

// Files to cache immediately
const STATIC_ASSETS = [
  '/',
  '/audio_ar_app.html',
  '/spatial_audio.js',
  '/index.html',
  '/auto_rotate.html',
  '/offline.html',
  '/manifest.json',
  '/icon-192.svg',
  '/icon-512.svg'
];

// Optional: Add sound files if you have them
// const AUDIO_ASSETS = [
//   '/sounds/ocean.wav',
//   '/sounds/forest.wav',
//   '/sounds/birds.wav'
// ];

/**
 * Install Event - Cache all static assets
 */
self.addEventListener('install', (event) => {
  console.log('[ServiceWorker] Install');
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[ServiceWorker] Caching static assets');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => {
        console.log('[ServiceWorker] Cache complete');
        return self.skipWaiting(); // Activate immediately
      })
      .catch((err) => {
        console.error('[ServiceWorker] Cache failed:', err);
      })
  );
});

/**
 * Activate Event - Clean up old caches
 */
self.addEventListener('activate', (event) => {
  console.log('[ServiceWorker] Activate');
  
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => name !== CACHE_NAME)
            .map((name) => {
              console.log('[ServiceWorker] Deleting old cache:', name);
              return caches.delete(name);
            })
        );
      })
      .then(() => {
        console.log('[ServiceWorker] Claiming clients');
        return self.clients.claim(); // Take control of all pages immediately
      })
  );
});

/**
 * Fetch Event - Serve from cache, fallback to network
 */
self.addEventListener('fetch', (event) => {
  // Skip non-GET requests
  if (event.request.method !== 'GET') return;
  
  // Skip cross-origin requests
  if (!event.request.url.startsWith(self.location.origin)) return;
  
  event.respondWith(
    caches.match(event.request)
      .then((cachedResponse) => {
        if (cachedResponse) {
          // Found in cache - return it
          console.log('[ServiceWorker] Serving from cache:', event.request.url);
          return cachedResponse;
        }
        
        // Not in cache - fetch from network
        console.log('[ServiceWorker] Fetching from network:', event.request.url);
        return fetch(event.request)
          .then((networkResponse) => {
            // If valid response, clone and cache it
            if (networkResponse && networkResponse.status === 200) {
              const responseClone = networkResponse.clone();
              caches.open(CACHE_NAME)
                .then((cache) => {
                  cache.put(event.request, responseClone);
                });
            }
            return networkResponse;
          })
          .catch((err) => {
            console.error('[ServiceWorker] Fetch failed:', err);
            // Return offline page if available
            return caches.match('/audio_ar_app.html');
          });
      })
  );
});

/**
 * Message Event - Handle messages from main app
 */
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'GET_CACHE_STATUS') {
    // Report cache status back to app
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((name) => {
            return caches.open(name)
              .then((cache) => {
                return cache.keys()
                  .then((requests) => ({
                    cacheName: name,
                    requestCount: requests.length
                  }));
              });
          })
        );
      })
      .then((cacheStatus) => {
        event.ports[0].postMessage({
          type: 'CACHE_STATUS',
          caches: cacheStatus
        });
      });
  }
  
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((name) => caches.delete(name))
        );
      })
      .then(() => {
        event.ports[0].postMessage({ type: 'CACHE_CLEARED' });
      });
  }
});

console.log('[ServiceWorker] Loaded');
