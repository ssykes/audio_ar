/**
 * Service Worker Registration Module
 *
 * Shared SW registration for all pages - ensures consistent behavior
 * across soundscape_picker.html, map_player.html, and other pages.
 *
 * Features:
 * - Avoids duplicate registration if already active
 * - Auto-updates when new version available
 * - Auto-reloads on SW update
 * - Version check to force update when deploy changes version
 * - Error handling for corrupted caches
 *
 * @version 1.1 - Add version check to force SW update
 * @since Feature 16B: Service Worker Refactor
 */

(function() {
    'use strict';

    const SW_URL = 'sw.js';

    // Cache version - updated by deploy.ps1
    const CACHE_VERSION = 'v1';

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
                        window.location.reload();
                    }
                });
            }
        });

        // Check for updates on every page load (when online)
        if (registration.active && navigator.onLine) {
            console.log('[SW] ✅ Active, checking for updates...');
            registration.update();
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

    console.log('[sw-register.js] Loaded v1.1');
})();
