/**
 * Audio AR API Client
 * Handles authentication and soundscape sync with server
 * @version 4.0 - Multi-user server sync
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
        const config = {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                ...this.getAuthHeader(),
                ...options.headers
            }
        };

        try {
            const response = await fetch(url, config);
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
        const data = await this.request('/auth/register', {
            method: 'POST',
            body: JSON.stringify({ email, password })
        });

        this.token = data.token;
        this.user = data.user;
        localStorage.setItem('audio_ar_token', data.token);
        localStorage.setItem('audio_ar_user', JSON.stringify(data.user));

        return data;
    }

    /**
     * Login user
     */
    async login(email, password) {
        const data = await this.request('/auth/login', {
            method: 'POST',
            body: JSON.stringify({ email, password })
        });

        this.token = data.token;
        this.user = data.user;
        localStorage.setItem('audio_ar_token', data.token);
        localStorage.setItem('audio_ar_user', JSON.stringify(data.user));

        return data;
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
            return data.valid;
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
        return await this.request('/soundscapes');
    }

    /**
     * Get single soundscape with waypoints and behaviors
     */
    async getSoundscape(id) {
        return await this.request(`/soundscapes/${id}`);
    }

    /**
     * Create new soundscape
     */
    async createSoundscape(name, description = '') {
        return await this.request('/soundscapes', {
            method: 'POST',
            body: JSON.stringify({ name, description })
        });
    }

    /**
     * Update soundscape
     */
    async updateSoundscape(id, name, description = '') {
        return await this.request(`/soundscapes/${id}`, {
            method: 'PUT',
            body: JSON.stringify({ name, description })
        });
    }

    /**
     * Delete soundscape
     */
    async deleteSoundscape(id) {
        return await this.request(`/soundscapes/${id}`, {
            method: 'DELETE'
        });
    }

    /**
     * Save soundscape (waypoints + behaviors)
     */
    async saveSoundscape(id, waypoints, behaviors = []) {
        return await this.request(`/soundscapes/${id}/save`, {
            method: 'POST',
            body: JSON.stringify({ waypoints, behaviors })
        });
    }

    /**
     * Load soundscape from server
     */
    async loadSoundscape(id) {
        const data = await this.getSoundscape(id);
        return {
            soundscape: {
                id: data.soundscape.id,
                name: data.soundscape.name,
                description: data.soundscape.description,
                soundIds: data.waypoints.map(wp => wp.id),
                waypointData: data.waypoints.map(wp => this.wpFromServer(wp)),
                behaviors: data.behaviors.map(b => ({
                    type: b.type,
                    memberIds: b.member_ids,
                    config: b.config_json
                }))
            },
            waypoints: data.waypoints.map(wp => this.wpFromServer(wp))
        };
    }

    /**
     * Convert server waypoint to app format
     */
    wpFromServer(wp) {
        return {
            id: wp.id,
            name: wp.name,
            lat: wp.lat,
            lon: wp.lon,
            soundUrl: wp.sound_url,
            volume: wp.volume,
            loop: wp.loop,
            activationRadius: wp.activation_radius,
            icon: wp.icon,
            color: wp.color
        };
    }

    /**
     * Get soundscape modified timestamp (Session 5E: Auto-sync)
     */
    async getSoundscapeModified(id) {
        const data = await this.request(`/soundscapes/${id}/modified`);
        return data.lastModified;
    }

    /**
     * Convert app waypoint to server format
     */
    wpToServer(wp) {
        return {
            id: wp.id,
            name: wp.name,
            lat: wp.lat,
            lon: wp.lon,
            soundUrl: wp.soundUrl,
            volume: wp.volume,
            loop: wp.loop,
            activationRadius: wp.activationRadius,
            icon: wp.icon,
            color: wp.color
        };
    }
}

// Export to global scope
window.ApiClient = ApiClient;

console.log('[api-client.js] ✅ Loaded - Multi-user API client ready');
