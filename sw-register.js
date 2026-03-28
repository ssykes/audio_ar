/**
 * Service Worker Registration Module
 *
 * Shared SW registration for all pages - ensures consistent behavior
 * across soundscape_picker.html, map_player.html, and other pages.
 *
 * ⚠️ KNOWN BUG: Service Worker cache not auto-updating on deploy
 * ================================================================
 * 
 * Problem: After deploy, mobile browsers continue serving stale cached files
 * even though the server has new code. The SW update check is async and doesn't
 * complete before the page loads with old cached content.
 * 
 * Root cause: The SW update flow:
 * 1. Page loads with old SW controlling it
 * 2. SW checks for update (async) ← Too late, page already loaded
 * 3. New SW downloads and installs
 * 4. New SW waits for old SW to die (skipWaiting called)
 * 5. New SW activates and claims clients ← Requires page reload
 * 
 * Workaround: Force SW update check on EVERY page load (line 124)
 * This ensures new deploys are picked up, but adds network overhead.
 * 
 * TODO: Proper fix - use BroadcastChannel or message passing to force
 * reload when new SW activates, without requiring manual cache clear.
 * See: https://web.dev/service-worker-lifecycle/#wait
 *
 * @version 1.2 - Always check for SW updates on page load (workaround for cache bug)
 * @since Feature 16B: Service Worker Refactor
 */

(function() {
    'use strict';

    const SW_URL = 'sw.js';

    // Cache version - updated by deploy.ps1
    const CACHE_VERSION = 'v1';  // Must match sw.js

    /**
     * Register service worker with update checking
     * @param {Object} options - Callbacks
     * @param {Function} [options.onReady] - Called when SW is ready
     * @param {Function} [options.onUpdate] - Called when update found
     * @param {Function} [options.onError] - Called on error
     */
    function registerServiceWorker(options = {}) {
        if (!('serviceWorker' in navigator)) {
            console.warn('[SW] Service Worker not supported in this browser');
            options.onError?.(new Error('Service Worker not supported'));
            return;
        }

        // Add cache-busting version to SW URL
        const swUrl = `${SW_URL}?v=${CACHE_VERSION}`;

        // Check if already registered
        navigator.serviceWorker.getRegistration()
            .then((existingRegistration) => {
                if (existingRegistration && existingRegistration.active) {
                    // SW already active - check if version changed
                    const currentVersion = existingRegistration.active.scriptURL.match(/\?v=(\d+)/)?.[1];
                    
                    if (currentVersion && currentVersion !== CACHE_VERSION) {
                        // Version changed - force unregister and re-register
                        console.log('[SW] 🔄 Version changed (' + currentVersion + ' → ' + CACHE_VERSION + ') - unregistering old SW');
                        return existingRegistration.unregister()
                            .then(() => {
                                console.log('[SW] 📡 Registering new Service Worker...');
                                return navigator.serviceWorker.register(swUrl);
                            })
                            .then((registration) => {
                                console.log('[SW] ✅ Registered:', registration.scope);
                                options.onReady?.(registration);
                                setupUpdateListener(registration, options);
                            });
                    }
                    
                    // Same version - just use it (works offline)
                    console.log('[SW] ✅ Already active, skipping re-registration');
                    options.onReady?.(existingRegistration);

                    // Still check for updates when online
                    if (navigator.onLine) {
                        existingRegistration.update();
                    }
                    return;
                }

                // No active SW - register new one
                console.log('[SW] 📡 Registering new Service Worker...');
                return navigator.serviceWorker.register(swUrl)
                    .then((registration) => {
                        console.log('[SW] ✅ Registered:', registration.scope);
                        options.onReady?.(registration);
                        setupUpdateListener(registration, options);
                    })
                    .catch((error) => {
                        console.error('[SW] ❌ Registration failed:', error);
                        options.onError?.(error);
                    });
            })
            .catch((error) => {
                console.error('[SW] ❌ Failed to check registration:', error);
                options.onError?.(error);
            });
    }

    /**
     * Setup update listener for service worker
     * @param {ServiceWorkerRegistration} registration
     * @param {Object} options
     */
    function setupUpdateListener(registration, options) {
        // Listen for updates
        registration.addEventListener('updatefound', () => {
            console.log('[SW] 🔄 Update found - new version available');
            const newWorker = registration.installing;

            if (newWorker) {
                newWorker.addEventListener('statechange', () => {
                    if (newWorker.state === 'installed') {
                        console.log('[SW] ✅ New version installed - auto-reloading');
                        // Force reload to use new SW (clears old cache)
                        if (navigator.serviceWorker.controller) {
                            // Only reload if there was a previous controller (not first load)
                            window.location.reload();
                        }
                    }
                });
            }
        });

        // ALWAYS check for updates on every page load (when online)
        // This ensures new deploys are picked up immediately
        if (navigator.onLine) {
            console.log('[SW] 🔄 Checking for SW update on every load...');
            registration.update().then(updated => {
                if (updated) {
                    console.log('[SW] ✅ SW update check completed');
                }
            }).catch(err => {
                console.warn('[SW] ⚠️ SW update check failed:', err);
            });
        }

        // Handle SW errors (e.g., corrupted cache)
        registration.addEventListener('error', (event) => {
            console.error('[SW] ❌ Error:', event);
            console.warn('[SW] ⚠️ Cache may be corrupted');
            console.warn('[SW] 💡 Try: Clear browsing data → Cached files');
            options.onError?.(event);
        });
    }

    // Export to window for global access
    window.registerServiceWorker = registerServiceWorker;

    // Also export a function to manually check for updates (useful for debug UI)
    window.checkForSWUpdate = function() {
        console.log('[SW] 🔄 Manual update check requested');
        return navigator.serviceWorker.getRegistration()
            .then(reg => {
                if (reg) {
                    return reg.update().then(updated => {
                        if (updated) {
                            console.log('[SW] ✅ Update found and applied');
                        } else {
                            console.log('[SW] ✅ Already up to date');
                        }
                        return updated;
                    });
                } else {
                    console.warn('[SW] ⚠️ No SW registration found');
                    return Promise.resolve(false);
                }
            });
    };

    console.log('[sw-register.js] Loaded v1.2');
})();
