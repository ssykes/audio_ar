/**
 * Service Worker Registration Module
 *
 * Shared SW registration for all pages - ensures consistent behavior
 * across soundscape_picker.html, map_player.html, and other pages.
 *
 * Features:
 * - Version check via postMessage to detect deploy changes
 * - BroadcastChannel listener for SW activation notifications
 * - Auto-reload when new SW activates (no manual cache clear needed)
 *
 * @version 2.0 - Proper version detection and auto-reload
 * @since Feature 16B: Service Worker Refactor
 */

(function() {
    'use strict';

    const SW_URL = 'sw.js';

    // Cache version - updated by deploy.ps1
    const CACHE_VERSION = 'v1';  // Must match sw.js

    // BroadcastChannel for SW update notifications
    const updateChannel = new BroadcastChannel('sw-updates');

    // Listen for SW activation notifications
    updateChannel.onmessage = (event) => {
        if (event.data && event.data.type === 'SW_UPDATED') {
            console.log('[SW] 🔄 Received SW_UPDATED notification (v' + event.data.version + ')');
            // Short delay to ensure cache is ready
            setTimeout(() => {
                console.log('[SW] 🔄 Auto-reloading to use new SW');
                window.location.reload();
            }, 500);
        }
    };

    /**
     * Get SW version via postMessage (accurate version detection)
     * @param {ServiceWorker} sw - Service worker instance
     * @returns {Promise<string>} SW cache version
     */
    function getSwVersion(sw) {
        return new Promise((resolve) => {
            const channel = new MessageChannel();
            channel.port1.onmessage = (event) => {
                resolve(event.data.version);
            };
            sw.postMessage({ type: 'CACHE_VERSION' }, [channel.port2]);
            // Timeout fallback in case SW doesn't respond
            setTimeout(() => resolve('unknown'), 1000);
        });
    }

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
                    // OFFLINE: Skip version check - just use existing SW
                    // This prevents unregistering SW while offline (which breaks the page)
                    if (!navigator.onLine) {
                        console.log('[SW] 📴 Offline - using existing SW (no version check)');
                        options.onReady?.(existingRegistration);
                        return existingRegistration;
                    }

                    // ONLINE: Check if version changed via postMessage
                    console.log('[SW] 🌐 Online - checking SW version...');
                    return getSwVersion(existingRegistration.active)
                        .then((swVersion) => {
                            if (swVersion !== CACHE_VERSION) {
                                // Version changed - force unregister and re-register
                                console.log('[SW] 🔄 Version changed (' + swVersion + ' → ' + CACHE_VERSION + ') - unregistering old SW');
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
                            return existingRegistration;
                        });
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
                        console.log('[SW] ✅ New version installed - waiting for activation');
                        // Note: No reload here - BroadcastChannel will notify when SW activates
                        // This prevents reload before cache is ready
                    }
                });
            }
        });

        // Check for updates on every page load (when online)
        // This ensures new deploys are detected even if version check missed it
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

    // Auto-register SW immediately (before any network requests)
    // This ensures SW is controlling the page as early as possible
    console.log('[sw-register.js] 🚀 Auto-registering SW immediately...');
    registerServiceWorker({
        onReady: (registration) => {
            console.log('[sw-register.js] ✅ SW ready and controlling page');
        },
        onError: (error) => {
            console.error('[sw-register.js] ❌ SW registration failed:', error);
            console.warn('[sw-register.js] ⚠️ Offline mode may not work');
        }
    });

    console.log('[sw-register.js] Loaded v1.3');
})();
