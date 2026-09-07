/**
 * Audio AR API Client
 * Handles authentication and soundscape sync with server
 * Uses Data Mapper pattern for snake_case ↔ camelCase conversion
 * @version 5.0 - Data Mapper pattern
 */

class ApiClient {
    constructor(baseUrl) {
        // Use provided URL, or window.API_BASE_URL, or default to /api
        this.baseUrl = baseUrl || window.API_BASE_URL || '/api';
        this.token = localStorage.getItem('audio_ar_token');
        this.user = JSON.parse(localStorage.getItem('audio_ar_user') || 'null');
        console.log('[ApiClient] Using base URL:', this.baseUrl);
    }

    /**
     * Convert snake_case server response to camelCase JavaScript object
     * @param {Object} row - Server response (snake_case keys)
     * @returns {Object} JavaScript object (camelCase keys)
     */
    _toEntity(row) {
        if (!row) return null;

        const entity = {};
        for (const [key, value] of Object.entries(row)) {
            // Special handling for reserved word "order" which comes from DB as '"order"'
            let newKey = key;
            if (key === '"order"') {
                newKey = 'order';
            } else {
                // Convert snake_case to camelCase
                newKey = key.replace(/_([a-z])/g, (match, letter) => letter.toUpperCase());
            }

            // Handle special cases for certain field types
            let newValue = value;
            if (key === 'polygon' && typeof value === 'string') {
                // Handle polygon field which is JSONB containing array of {lat, lng} objects
                try {
                    newValue = JSON.parse(value);
                } catch (e) {
                    console.warn(`Failed to parse polygon JSON: ${value}`, e);
                    newValue = value;
                }
            } else if ((key === 'config_json' || key === 'configJson') && typeof value === 'string') {
                // Handle config_json field which is JSONB
                try {
                    newValue = JSON.parse(value);
                } catch (e) {
                    console.warn(`Failed to parse config JSON: ${value}`, e);
                    newValue = value;
                }
            } else if (key === 'sound_id') {
                // Handle sound_id field (foreign key to sounds table)
                newValue = value;
            }

            entity[newKey] = newValue;
        }
        return entity;
    }

    /**
     * Convert camelCase JavaScript object to snake_case server format
     * @param {Object} entity - JavaScript object (camelCase keys)
     * @returns {Object} Server format (snake_case keys)
     */
    _toRow(entity) {
        if (!entity) return null;

        const row = {};
        for (const [key, value] of Object.entries(entity)) {
            let newKey = key;

            // Special handling for the "order" field which is a reserved word in SQL
            if (key === 'order') {
                newKey = '"order"';
            } else {
                // Convert camelCase to snake_case
                newKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
            }

            // Handle special cases for certain field types
            let newValue = value;
            if (key === 'polygon' && typeof value !== 'string') {
                // Serialize polygon field to JSON string for storage in DB
                newValue = JSON.stringify(value);
            } else if ((key === 'config' || key === 'configJson') && typeof value !== 'string') {
                // Serialize config field to JSON string for storage in DB
                newValue = JSON.stringify(value);
            } else if (key === 'soundId') {
                // Handle soundId field (foreign key to sounds table) - ensure it remains as sound_id
                newKey = 'sound_id';  // Force the key to be sound_id
                newValue = value;
            }

            row[newKey] = newValue;
        }
        return row;
    }

    /**
     * Get auth header for requests
     */
    getAuthHeader() {
        return this.token ? { 'Authorization': `Bearer ${this.token}` } : {};
    }

    /**
     * Make API request
     */
    async request(endpoint, options = {}) {
        const url = `${this.baseUrl}${endpoint}`;
        
        // Add cache-control headers to prevent stale data (especially for GET requests)
        const cacheHeaders = {
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0'
        };
        
        const config = {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                ...this.getAuthHeader(),
                ...cacheHeaders,
                ...options.headers
            }
        };

        try {
            // Add timeout (10 seconds) - respects any passed abort signal
            const controller = new AbortController();
            const timeoutId = setTimeout(() => {
                console.error(`[ApiClient] Request timeout for: ${url}`);
                controller.abort();
            }, 10000);

            // If a signal was passed, chain it to our controller
            if (options.signal) {
                options.signal.addEventListener('abort', () => {
                    controller.abort();
                });
            }

            config.signal = controller.signal;

            const response = await fetch(url, config);
            clearTimeout(timeoutId);

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Request failed');
            }

            return data;
        } catch (error) {
            console.error('[ApiClient] Request failed:', error);
            throw error;
        }
    }

    // ========== Authentication ==========

    /**
     * Register new user
     */
    async register(email, password) {
        const payload = this._toRow({ email, password });
        const data = await this.request('/auth/register', {
            method: 'POST',
            body: JSON.stringify(payload)
        });

        // Apply data mapping to ensure consistency
        const mappedData = this._toEntity(data);
        this.token = mappedData.token;
        this.user = mappedData.user;
        localStorage.setItem('audio_ar_token', mappedData.token);
        localStorage.setItem('audio_ar_user', JSON.stringify(mappedData.user));

        return mappedData;
    }

    /**
     * Login user
     */
    async login(email, password) {
        const payload = this._toRow({ email, password });
        const data = await this.request('/auth/login', {
            method: 'POST',
            body: JSON.stringify(payload)
        });

        // Apply data mapping to ensure consistency
        const mappedData = this._toEntity(data);
        this.token = mappedData.token;
        this.user = mappedData.user;
        localStorage.setItem('audio_ar_token', mappedData.token);
        localStorage.setItem('audio_ar_user', JSON.stringify(mappedData.user));

        return mappedData;
    }

    /**
     * Logout user
     */
    logout() {
        this.token = null;
        this.user = null;
        localStorage.removeItem('audio_ar_token');
        localStorage.removeItem('audio_ar_user');
    }

    /**
     * Check if user is logged in
     */
    isLoggedIn() {
        return !!this.token;
    }

    /**
     * Verify current token
     */
    async verifyToken() {
        if (!this.token) return false;

        try {
            const data = await this.request('/auth/verify');
            // Apply data mapping to ensure consistency
            const mappedData = this._toEntity(data);
            return mappedData.valid;
        } catch (error) {
            this.logout();
            return false;
        }
    }

    // ========== Soundscapes ==========

    /**
     * Get all soundscapes for current user
     */
    async getSoundscapes() {
        const data = await this.request('/soundscapes');
        
        // Apply data mapping to ensure consistency
        if (data && Array.isArray(data)) {
            return data.map(soundscape => this._toEntity(soundscape));
        }
        
        return data;
    }

    /**
     * Get single soundscape with waypoints and behaviors
     */
    async getSoundscape(id) {
        const data = await this.request(`/soundscapes/${id}`);

        // Apply data mapping to ensure consistency
        if (data && data.waypoints) {
            data.waypoints = data.waypoints.map(wp => {
                const mappedWp = this._toEntity(wp);
                // Handle config_json for waypoints if present
                if (wp.config_json !== undefined) {
                    mappedWp.config = typeof wp.config_json === 'string' ? JSON.parse(wp.config_json) : wp.config_json;
                }
                return mappedWp;
            });
        }
        if (data && data.behaviors) {
            data.behaviors = data.behaviors.map(b => {
                const behavior = this._toEntity(b);
                // Handle member_ids field for behaviors
                if (b.member_ids && Array.isArray(b.member_ids)) {
                    behavior.memberIds = b.member_ids;
                }
                // Handle config_json field for behaviors
                if (b.config_json !== undefined) {
                    behavior.config = typeof b.config_json === 'string' ? JSON.parse(b.config_json) : b.config_json;
                }
                return behavior;
            });
        }
        if (data && data.areas) {
            data.areas = data.areas.map(area => {
                const mappedArea = this._toEntity(area);
                // Handle polygon field which is JSONB containing array of {lat, lng} objects
                if (area.polygon) {
                    mappedArea.polygon = typeof area.polygon === 'string' ? JSON.parse(area.polygon) : area.polygon;
                }
                // Handle config_json for areas if present
                if (area.config_json !== undefined) {
                    mappedArea.config = typeof area.config_json === 'string' ? JSON.parse(area.config_json) : area.config_json;
                }
                return mappedArea;
            });
        }

        return data;
    }

    /**
     * Create new soundscape
     */
    async createSoundscape(name, description = '') {
        const payload = this._toRow({ name, description });
        const data = await this.request('/soundscapes', {
            method: 'POST',
            body: JSON.stringify(payload)
        });
        
        // Apply data mapping to ensure consistency
        return this._toEntity(data);
    }

    /**
     * Update soundscape
     */
    async updateSoundscape(id, name, description = '', isPublic = true) {
        const payload = this._toRow({ name, description, isPublic });
        const data = await this.request(`/soundscapes/${id}`, {
            method: 'PUT',
            body: JSON.stringify(payload)
        });
        
        // Apply data mapping to ensure consistency
        return this._toEntity(data);
    }

    /**
     * Delete soundscape
     */
    async deleteSoundscape(id) {
        const data = await this.request(`/soundscapes/${id}`, {
            method: 'DELETE'
        });
        
        // Apply data mapping to ensure consistency
        return this._toEntity(data);
    }

    /**
     * Save soundscape (waypoints + behaviors + areas)
     * @param {string} id - Soundscape ID
     * @param {Object[]} waypoints - Waypoints to save
     * @param {Object[]} behaviors - Behaviors to save
     * @param {Object[]} [areas=[]] - Areas to save
     * @param {AbortSignal} [signal] - Optional abort signal
     */
    async saveSoundscape(id, waypoints, behaviors = [], areas = [], signal = null) {
        // Prepare payload ensuring proper serialization of all entities
        const payload = {
            waypoints: waypoints.map(wp => {
                const row = this._toRow(wp);
                // Handle config field for waypoints
                if (wp.config !== undefined) {
                    row.config_json = typeof wp.config === 'string' ? wp.config : JSON.stringify(wp.config);
                }
                return row;
            }),
            behaviors: behaviors.map(b => {
                const row = this._toRow(b);
                // Handle memberIds field as UUID array
                if (b.memberIds && Array.isArray(b.memberIds)) {
                    row.member_ids = b.memberIds; // Use snake_case for server
                }
                // Handle config field for behaviors
                if (b.config !== undefined) {
                    row.config_json = typeof b.config === 'string' ? b.config : JSON.stringify(b.config);
                }
                return row;
            }),
            areas: areas.map(area => {
                const row = this._toRow(area);
                // Handle polygon field which needs special serialization
                if (area.polygon) {
                    row.polygon = typeof area.polygon === 'string' ? area.polygon : JSON.stringify(area.polygon);
                }
                // Handle config field for areas
                if (area.config !== undefined) {
                    row.config_json = typeof area.config === 'string' ? area.config : JSON.stringify(area.config);
                }
                return row;
            })
        };
        console.log('[api-client.js] saveSoundscape payload:', JSON.stringify(payload, null, 2));
        return await this.request(`/soundscapes/${id}/save`, {
            method: 'POST',
            body: JSON.stringify(payload),
            signal
        });
    }

    /**
     * Load soundscape from server
     * Uses Data Mapper pattern for consistent field conversion
     */
    async loadSoundscape(id) {
        const data = await this.getSoundscape(id);

        // Guard against missing data
        if (!data || !data.soundscape) {
            throw new Error('Invalid soundscape data from server');
        }

        // Since getSoundscape() already applies data mapping, we don't need to map again
        return {
            soundscape: {
                id: data.soundscape.id,
                name: data.soundscape.name,
                description: data.soundscape.description,
                isPublic: data.soundscape.isPublic,
                soundIds: data.waypoints.map(wp => wp.id),
                waypointData: data.waypoints, // Already mapped by getSoundscape()
                behaviors: data.behaviors || [], // Already mapped by getSoundscape()
                areas: data.areas || [] // Already mapped by getSoundscape()
            },
            waypoints: data.waypoints, // Already mapped by getSoundscape()
            areas: data.areas || [] // Already mapped by getSoundscape()
        };
    }

    /**
     * Convert server waypoint to app format
     * @deprecated Use _toEntity() instead for automatic conversion
     */
    wpFromServer(wp) {
        // Use new Data Mapper pattern - already handles config_json conversion
        return this._toEntity(wp);
    }

    /**
     * Get soundscape modified timestamp (Session 5E: Auto-sync)
     */
    async getSoundscapeModified(id) {
        const data = await this.request(`/soundscapes/${id}/modified`);
        // Apply data mapping to ensure consistency
        const mappedData = this._toEntity(data);
        return mappedData.lastModified;
    }

    /**
     * Convert app waypoint to server format
     * @deprecated Use _toRow() instead for automatic conversion
     */
    wpToServer(wp) {
        // Use new Data Mapper pattern - already handles config conversion
        return this._toRow(wp);
    }
}

// Export to global scope
window.ApiClient = ApiClient;

console.log('[api-client.js] ✅ Loaded - Multi-user API client ready');
