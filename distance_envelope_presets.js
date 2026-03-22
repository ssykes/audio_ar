/**
 * DistanceEnvelopePresets - Preset system for distance envelope behaviors
 * 
 * Provides:
 * - Built-in presets for common use cases
 * - Custom preset save/load via localStorage
 * - Canvas visualization for envelope zones
 * - Real-time preview with drag-to-edit
 * 
 * @version 1.0
 * @author Spatial Audio AR Team
 */

console.log('[distance_envelope_presets.js] Loading v1.0...');

// =============================================================================
// Built-in Presets
// =============================================================================

const DistanceEnvelopePresets = {
    /**
     * Built-in preset definitions
     */
    builtIn: {
        'gentle_fade': {
            name: 'Gentle Fade',
            description: 'Smooth fade in/out over 20m zones',
            config: {
                enterAttack: 20,
                sustainVolume: 0.8,
                exitDecay: 20,
                curve: 'exponential'
            }
        },
        'quick_transition': {
            name: 'Quick Transition',
            description: 'Fast fade (5m zones), loud sustain',
            config: {
                enterAttack: 5,
                sustainVolume: 0.9,
                exitDecay: 5,
                curve: 'linear'
            }
        },
        'long_sustain': {
            name: 'Long Sustain',
            description: 'Wide sustain zone, gentle edges',
            config: {
                enterAttack: 10,
                sustainVolume: 0.7,
                exitDecay: 10,
                curve: 'easeInOut'
            }
        },
        'center_focus': {
            name: 'Center Focus',
            description: 'Fade out near center, emphasize approach',
            config: {
                enterAttack: 15,
                sustainVolume: 0.85,
                exitDecay: 20,
                curve: 'logarithmic'
            }
        },
        'edge_emphasis': {
            name: 'Edge Emphasis',
            description: 'Quick fade in, long sustain, sharp center cutoff',
            config: {
                enterAttack: 8,
                sustainVolume: 0.9,
                exitDecay: 5,
                curve: 'exponential'
            }
        },
        'ambient_drone': {
            name: 'Ambient Drone',
            description: 'Very gentle transitions, low sustain',
            config: {
                enterAttack: 25,
                sustainVolume: 0.5,
                exitDecay: 25,
                curve: 'exponential'
            }
        },
        'step_function': {
            name: 'Step Function',
            description: 'Almost instant on/off (1m zones)',
            config: {
                enterAttack: 1,
                sustainVolume: 1.0,
                exitDecay: 1,
                curve: 'linear'
            }
        },
        'asymmetric': {
            name: 'Asymmetric',
            description: 'Slow fade in, quick fade out',
            config: {
                enterAttack: 20,
                sustainVolume: 0.8,
                exitDecay: 5,
                curve: 'exponential'
            }
        }
    },

    /**
     * Storage key for custom presets
     */
    STORAGE_KEY: 'distance_envelope_custom_presets',

    /**
     * Get all presets (built-in + custom)
     * @returns {Object} All presets keyed by ID
     */
    getAll() {
        const builtIn = this.builtIn;
        const custom = this.getCustom();

        return { ...builtIn, ...custom };
    },

    /**
     * Get built-in presets only
     * @returns {Object} Built-in presets
     */
    getBuiltIn() {
        return this.builtIn;
    },

    /**
     * Get custom presets from localStorage
     * @returns {Object} Custom presets
     */
    getCustom() {
        try {
            const stored = localStorage.getItem(this.STORAGE_KEY);
            return stored ? JSON.parse(stored) : {};
        } catch (e) {
            console.error('[DistanceEnvelopePresets] Failed to load custom presets:', e);
            return {};
        }
    },

    /**
     * Save a custom preset
     * @param {string} id - Preset ID (unique key)
     * @param {Object} preset - Preset definition
     * @returns {boolean} Success
     */
    saveCustom(id, preset) {
        try {
            // Validate preset structure
            if (!preset.config) {
                throw new Error('Preset must have config object');
            }

            const custom = this.getCustom();
            custom[id] = {
                ...preset,
                isCustom: true,
                createdAt: Date.now()
            };

            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(custom));
            console.log('[DistanceEnvelopePresets] Saved custom preset:', id);
            return true;
        } catch (e) {
            console.error('[DistanceEnvelopePresets] Failed to save custom preset:', e);
            return false;
        }
    },

    /**
     * Delete a custom preset
     * @param {string} id - Preset ID
     * @returns {boolean} Success
     */
    deleteCustom(id) {
        try {
            const custom = this.getCustom();
            if (!custom[id]) {
                return false;  // Preset doesn't exist
            }

            delete custom[id];
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(custom));
            console.log('[DistanceEnvelopePresets] Deleted custom preset:', id);
            return true;
        } catch (e) {
            console.error('[DistanceEnvelopePresets] Failed to delete custom preset:', e);
            return false;
        }
    },

    /**
     * Get a single preset by ID
     * @param {string} id - Preset ID
     * @returns {Object|null} Preset or null
     */
    getById(id) {
        const all = this.getAll();
        return all[id] || null;
    },

    /**
     * Export custom presets to JSON
     * @returns {string} JSON string
     */
    exportJSON() {
        const custom = this.getCustom();
        return JSON.stringify(custom, null, 2);
    },

    /**
     * Import custom presets from JSON
     * @param {string} jsonString - JSON string
     * @returns {boolean} Success
     */
    importJSON(jsonString) {
        try {
            const imported = JSON.parse(jsonString);
            const current = this.getCustom();

            // Merge imported presets
            Object.assign(current, imported);
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(current));

            console.log('[DistanceEnvelopePresets] Imported presets:', Object.keys(imported).length);
            return true;
        } catch (e) {
            console.error('[DistanceEnvelopePresets] Failed to import presets:', e);
            return false;
        }
    },

    /**
     * Clear all custom presets
     * @returns {boolean} Success
     */
    clearAll() {
        try {
            localStorage.removeItem(this.STORAGE_KEY);
            console.log('[DistanceEnvelopePresets] Cleared all custom presets');
            return true;
        } catch (e) {
            console.error('[DistanceEnvelopePresets] Failed to clear presets:', e);
            return false;
        }
    }
};

// =============================================================================
// Canvas Visualizer
// =============================================================================

/**
 * DistanceEnvelopeVisualizer - Canvas-based visualization for distance envelope
 * 
 * Features:
 * - Real-time envelope curve rendering
 * - Interactive drag-to-edit zones
 * - Activation radius preview
 * - Listener position indicator
 * - Zone labels and measurements
 * 
 * @example
 * const viz = new DistanceEnvelopeVisualizer('canvasId', {
 *     enterAttack: 10,
 *     sustainVolume: 0.8,
 *     exitDecay: 10,
 *     curve: 'exponential'
 * }, {
 *     activationRadius: 50,
 *     listenerDistance: 25
 * });
 * viz.render();
 */
class DistanceEnvelopeVisualizer {
    /**
     * @param {string|HTMLCanvasElement} canvas - Canvas element or ID
     * @param {Object} config - Envelope config
     * @param {Object} options - Display options
     */
    constructor(canvas, config = {}, options = {}) {
        this.canvas = typeof canvas === 'string'
            ? document.getElementById(canvas)
            : canvas;

        if (!this.canvas) {
            throw new Error('DistanceEnvelopeVisualizer: Canvas not found');
        }

        this.ctx = this.canvas.getContext('2d');
        this.config = { ...config };
        this.options = {
            activationRadius: 50,
            listenerDistance: 25,
            showZones: true,
            showGrid: true,
            showLabels: true,
            interactive: false,
            width: 400,
            height: 200,
            ...options
        };

        // Interaction state
        this.isDragging = false;
        this.dragZone = null;  // 'enterAttack' | 'exitDecay' | 'sustainVolume'
        this.onConfigChange = null;  // Callback: (newConfig) => {}

        // Style configuration
        this.styles = {
            background: '#0d0d1a',
            grid: 'rgba(100, 100, 120, 0.3)',
            gridMajor: 'rgba(100, 100, 120, 0.5)',
            envelope: '#00d9ff',
            envelopeFill: 'rgba(0, 217, 255, 0.2)',
            zoneAttack: 'rgba(0, 255, 136, 0.15)',
            zoneSustain: 'rgba(0, 217, 255, 0.1)',
            zoneDecay: 'rgba(255, 71, 87, 0.15)',
            listener: '#ffa502',
            text: '#888',
            textHighlight: '#fff',
            handle: '#fff',
            handleHover: '#00d9ff'
        };

        // Setup canvas size
        this._resize();

        // Setup interaction
        if (this.options.interactive) {
            this._setupInteraction();
        }
    }

    /**
     * Resize canvas to display size
     * @private
     */
    _resize() {
        const rect = this.canvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;

        this.canvas.width = rect.width * dpr;
        this.canvas.height = rect.height * dpr;

        this.ctx.scale(dpr, dpr);

        this.width = rect.width;
        this.height = rect.height;
    }

    /**
     * Setup mouse/touch interaction
     * @private
     */
    _setupInteraction() {
        const getPos = (e) => {
            const rect = this.canvas.getBoundingClientRect();
            const clientX = e.touches ? e.touches[0].clientX : e.clientX;
            const clientY = e.touches ? e.touches[0].clientY : e.clientY;
            return {
                x: clientX - rect.left,
                y: clientY - rect.top
            };
        };

        const hitTest = (pos) => {
            const padding = 40;
            const graphHeight = this.height - padding * 2;
            const graphWidth = this.width - padding * 2;

            // Check sustain volume handle
            const sustainY = padding + graphHeight * (1 - this.config.sustainVolume);
            if (Math.abs(pos.y - sustainY) < 10 && pos.x > padding && pos.x < this.width - padding) {
                return 'sustainVolume';
            }

            // Check enter attack handle (right side)
            const attackX = this.width - padding - (this.config.enterAttack / this.options.activationRadius) * graphWidth;
            if (Math.abs(pos.x - attackX) < 10 && pos.y > padding && pos.y < this.height - padding) {
                return 'enterAttack';
            }

            // Check exit decay handle (left side)
            const decayX = padding + (this.config.exitDecay / this.options.activationRadius) * graphWidth;
            if (Math.abs(pos.x - decayX) < 10 && pos.y > padding && pos.y < this.height - padding) {
                return 'exitDecay';
            }

            return null;
        };

        const onStart = (e) => {
            e.preventDefault();
            const pos = getPos(e);
            const zone = hitTest(pos);

            if (zone) {
                this.isDragging = true;
                this.dragZone = zone;
                this.canvas.style.cursor = 'grabbing';
            }
        };

        const onMove = (e) => {
            if (!this.isDragging) {
                // Update cursor on hover
                const pos = getPos(e);
                const zone = hitTest(pos);
                this.canvas.style.cursor = zone ? 'grab' : 'default';
                return;
            }

            e.preventDefault();
            const pos = getPos(e);
            const padding = 40;
            const graphHeight = this.height - padding * 2;
            const graphWidth = this.width - padding * 2;

            const newConfig = { ...this.config };

            if (this.dragZone === 'sustainVolume') {
                const t = 1 - (pos.y - padding) / graphHeight;
                newConfig.sustainVolume = Math.max(0, Math.min(1, t));
            } else if (this.dragZone === 'enterAttack') {
                const t = (this.width - padding - pos.x) / graphWidth;
                newConfig.enterAttack = Math.max(0, Math.min(this.options.activationRadius, t * this.options.activationRadius));
            } else if (this.dragZone === 'exitDecay') {
                const t = (pos.x - padding) / graphWidth;
                newConfig.exitDecay = Math.max(0, Math.min(this.options.activationRadius, t * this.options.activationRadius));
            }

            // Validate: attack + decay should not exceed radius
            if (newConfig.enterAttack + newConfig.exitDecay > this.options.activationRadius * 0.9) {
                // Scale down proportionally
                const ratio = (this.options.activationRadius * 0.9) / (newConfig.enterAttack + newConfig.exitDecay);
                newConfig.enterAttack *= ratio;
                newConfig.exitDecay *= ratio;
            }

            this.config = newConfig;

            if (this.onConfigChange) {
                this.onConfigChange(newConfig);
            }

            this.render();
        };

        const onEnd = (e) => {
            this.isDragging = false;
            this.dragZone = null;
            this.canvas.style.cursor = 'default';
        };

        // Mouse events
        this.canvas.addEventListener('mousedown', onStart);
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onEnd);

        // Touch events
        this.canvas.addEventListener('touchstart', onStart, { passive: false });
        window.addEventListener('touchmove', onMove, { passive: false });
        window.addEventListener('touchend', onEnd);
    }

    /**
     * Update configuration and re-render
     * @param {Object} config - New config
     */
    updateConfig(config) {
        this.config = { ...this.config, ...config };
        this.render();
    }

    /**
     * Update options and re-render
     * @param {Object} options - New options
     */
    updateOptions(options) {
        this.options = { ...this.options, ...options };
        this.render();
    }

    /**
     * Calculate envelope gain at a given distance
     * @param {number} distance - Distance from center (meters)
     * @returns {number} Gain (0-1)
     * @private
     */
    _calculateGain(distance) {
        const { enterAttack, sustainVolume, exitDecay, curve } = this.config;
        const radius = this.options.activationRadius;

        // Outside activation radius
        if (distance >= radius) {
            return 0;
        }

        const distanceFromEdge = radius - distance;

        // Enter attack zone
        if (distanceFromEdge < enterAttack) {
            const t = distanceFromEdge / enterAttack;
            const shaped = this._applyCurve(t, curve);
            return shaped * sustainVolume;
        }

        // Sustain zone
        if (distanceFromEdge < (radius - exitDecay)) {
            return sustainVolume;
        }

        // Exit decay zone
        const t = 1 - (distance / exitDecay);
        const shaped = this._applyCurve(Math.max(0, t), curve);
        return shaped * sustainVolume;
    }

    /**
     * Apply curve shaping
     * @param {number} t - Interpolation (0-1)
     * @param {string} curve - Curve type
     * @returns {number} Shaped value
     * @private
     */
    _applyCurve(t, curve) {
        switch (curve) {
            case 'exponential':
                return Math.pow(t, 2);
            case 'logarithmic':
                return Math.log(1 + (9 * t)) / Math.log(10);
            case 'easeInOut':
                return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
            case 'linear':
            default:
                return t;
        }
    }

    /**
     * Render the visualization
     */
    render() {
        const ctx = this.ctx;
        const { width, height } = this;
        const padding = 40;
        const graphWidth = width - padding * 2;
        const graphHeight = height - padding * 2;

        // Clear canvas
        ctx.fillStyle = this.styles.background;
        ctx.fillRect(0, 0, width, height);

        // Draw grid
        if (this.options.showGrid) {
            this._drawGrid(ctx, padding, graphWidth, graphHeight);
        }

        // Draw zones
        if (this.options.showZones) {
            this._drawZones(ctx, padding, graphWidth, graphHeight);
        }

        // Draw envelope curve
        this._drawEnvelope(ctx, padding, graphWidth, graphHeight);

        // Draw listener position
        this._drawListener(ctx, padding, graphWidth, graphHeight);

        // Draw labels
        if (this.options.showLabels) {
            this._drawLabels(ctx, padding, graphWidth, graphHeight);
        }

        // Draw interactive handles
        if (this.options.interactive) {
            this._drawHandles(ctx, padding, graphWidth, graphHeight);
        }
    }

    /**
     * Draw grid lines
     * @private
     */
    _drawGrid(ctx, padding, graphWidth, graphHeight) {
        ctx.strokeStyle = this.styles.grid;
        ctx.lineWidth = 1;

        // Horizontal lines (volume levels)
        for (let i = 0; i <= 4; i++) {
            const y = padding + (i / 4) * graphHeight;
            ctx.beginPath();
            ctx.moveTo(padding, y);
            ctx.lineTo(width - padding, y);
            ctx.stroke();
        }

        // Vertical lines (distance markers)
        for (let i = 0; i <= 5; i++) {
            const x = padding + (i / 5) * graphWidth;
            ctx.beginPath();
            ctx.moveTo(x, padding);
            ctx.lineTo(x, height - padding);
            ctx.stroke();
        }
    }

    /**
     * Draw zone backgrounds
     * @private
     */
    _drawZones(ctx, padding, graphWidth, graphHeight) {
        const { enterAttack, exitDecay, sustainVolume } = this.config;
        const radius = this.options.activationRadius;

        // Calculate zone boundaries in pixels
        const attackWidth = (enterAttack / radius) * graphWidth;
        const decayWidth = (exitDecay / radius) * graphWidth;
        const sustainWidth = graphWidth - attackWidth - decayWidth;

        // Enter attack zone (right side)
        ctx.fillStyle = this.styles.zoneAttack;
        ctx.fillRect(
            width - padding - attackWidth,
            padding,
            attackWidth,
            graphHeight
        );

        // Sustain zone (middle)
        ctx.fillStyle = this.styles.zoneSustain;
        ctx.fillRect(
            padding + decayWidth,
            padding,
            sustainWidth,
            graphHeight
        );

        // Exit decay zone (left side)
        ctx.fillStyle = this.styles.zoneDecay;
        ctx.fillRect(
            padding,
            padding,
            decayWidth,
            graphHeight
        );
    }

    /**
     * Draw envelope curve
     * @private
     */
    _drawEnvelope(ctx, padding, graphWidth, graphHeight) {
        ctx.beginPath();
        ctx.strokeStyle = this.styles.envelope;
        ctx.lineWidth = 3;

        // Sample the envelope curve
        const samples = 100;
        for (let i = 0; i <= samples; i++) {
            const distance = (i / samples) * this.options.activationRadius;
            const gain = this._calculateGain(distance);

            const x = padding + (distance / this.options.activationRadius) * graphWidth;
            const y = padding + graphHeight * (1 - gain);

            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        }

        ctx.stroke();

        // Fill area under curve
        ctx.lineTo(padding + graphWidth, height - padding);
        ctx.lineTo(padding, height - padding);
        ctx.closePath();
        ctx.fillStyle = this.styles.envelopeFill;
        ctx.fill();
    }

    /**
     * Draw listener position indicator
     * @private
     */
    _drawListener(ctx, padding, graphWidth, graphHeight) {
        const { listenerDistance } = this.options;
        const gain = this._calculateGain(listenerDistance);

        const x = padding + (listenerDistance / this.options.activationRadius) * graphWidth;
        const y = padding + graphHeight * (1 - gain);

        // Draw listener dot
        ctx.beginPath();
        ctx.fillStyle = this.styles.listener;
        ctx.arc(x, y, 6, 0, Math.PI * 2);
        ctx.fill();

        // Draw vertical line to x-axis
        ctx.beginPath();
        ctx.strokeStyle = this.styles.listener;
        ctx.lineWidth = 1;
        ctx.setLineDash([5, 5]);
        ctx.moveTo(x, y);
        ctx.lineTo(x, height - padding);
        ctx.stroke();
        ctx.setLineDash([]);

        // Draw horizontal line to y-axis
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(padding, y);
        ctx.stroke();
    }

    /**
     * Draw axis labels
     * @private
     */
    _drawLabels(ctx, padding, graphWidth, graphHeight) {
        ctx.fillStyle = this.styles.text;
        ctx.font = '11px -apple-system, sans-serif';
        ctx.textAlign = 'center';

        // X-axis labels (distance)
        const radius = this.options.activationRadius;
        for (let i = 0; i <= 5; i++) {
            const x = padding + (i / 5) * graphWidth;
            const distance = Math.round((i / 5) * radius);
            ctx.fillText(`${distance}m`, x, height - 15);
        }

        // Y-axis labels (volume)
        ctx.textAlign = 'right';
        for (let i = 0; i <= 4; i++) {
            const y = padding + (i / 4) * graphHeight;
            const volume = (1 - i / 4).toFixed(1);
            ctx.fillText(volume, padding - 8, y + 4);
        }

        // Axis titles
        ctx.textAlign = 'center';
        ctx.fillText('Distance from Center (meters)', width / 2, height - 2);
        
        ctx.save();
        ctx.translate(12, height / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.fillText('Volume (gain)', 0, 0);
        ctx.restore();

        // Zone labels
        const { enterAttack, exitDecay } = this.config;
        const attackWidth = (enterAttack / radius) * graphWidth;
        const decayWidth = (exitDecay / radius) * graphWidth;

        ctx.font = 'bold 10px -apple-system, sans-serif';
        ctx.fillStyle = 'rgba(0, 255, 136, 0.8)';
        ctx.fillText('ATTACK', width - padding - attackWidth / 2, padding - 5);

        ctx.fillStyle = 'rgba(0, 217, 255, 0.8)';
        ctx.fillText('SUSTAIN', padding + decayWidth + (graphWidth - attackWidth - decayWidth) / 2, padding - 5);

        ctx.fillStyle = 'rgba(255, 71, 87, 0.8)';
        ctx.fillText('DECAY', padding + decayWidth / 2, padding - 5);
    }

    /**
     * Draw interactive handles
     * @private
     */
    _drawHandles(ctx, padding, graphWidth, graphHeight) {
        const { enterAttack, exitDecay, sustainVolume } = this.config;
        const radius = this.options.activationRadius;

        ctx.fillStyle = this.styles.handle;

        // Sustain volume handle (horizontal line with grab points)
        const sustainY = padding + graphHeight * (1 - sustainVolume);
        ctx.fillRect(padding, sustainY - 2, graphWidth, 4);

        // Enter attack handle (right side)
        const attackX = width - padding - (enterAttack / radius) * graphWidth;
        ctx.beginPath();
        ctx.arc(attackX, sustainY, 6, 0, Math.PI * 2);
        ctx.fill();

        // Exit decay handle (left side)
        const decayX = padding + (exitDecay / radius) * graphWidth;
        ctx.beginPath();
        ctx.arc(decayX, sustainY, 6, 0, Math.PI * 2);
        ctx.fill();
    }
}

// =============================================================================
// Preset Picker UI Component
// =============================================================================

/**
 * DistanceEnvelopePresetPicker - UI component for preset selection and editing
 * 
 * Features:
 * - Preset list with preview
 * - Built-in vs custom visual distinction
 * - Save current config as preset
 * - Delete custom presets
 * - Import/Export presets
 * 
 * @example
 * const picker = new DistanceEnvelopePresetPicker('containerId', {
 *     onSelect: (preset) => { ... },
 *     onSave: (name, config) => { ... },
 *     onDelete: (id) => { ... }
 * });
 * picker.render();
 */
class DistanceEnvelopePresetPicker {
    /**
     * @param {string|HTMLElement} container - Container element or ID
     * @param {Object} options - Options
     */
    constructor(container, options = {}) {
        this.container = typeof container === 'string'
            ? document.getElementById(container)
            : container;

        if (!this.container) {
            throw new Error('DistanceEnvelopePresetPicker: Container not found');
        }

        this.options = {
            onSelect: null,  // (presetId, preset) => {}
            onSave: null,    // (presetName, config) => {}
            onDelete: null,  // (presetId) => {}
            onImport: null,  // (jsonString) => {}
            onExport: null,  // () => jsonString
            ...options
        };

        this.selectedPresetId = null;
        this.currentConfig = null;
    }

    /**
     * Render the preset picker UI
     */
    render() {
        this.container.innerHTML = this._generateHTML();
        this._attachEventListeners();
        this._renderPresetList();
    }

    /**
     * Generate HTML structure
     * @returns {string} HTML
     * @private
     */
    _generateHTML() {
        return `
            <div class="distance-envelope-preset-picker">
                <div class="preset-header">
                    <h3>Distance Envelope Presets</h3>
                    <div class="preset-actions">
                        <button class="btn-icon" id="depp-import" title="Import presets">
                            📥
                        </button>
                        <button class="btn-icon" id="depp-export" title="Export presets">
                            📤
                        </button>
                    </div>
                </div>

                <div class="preset-list" id="depp-list">
                    <!-- Presets rendered here -->
                </div>

                <div class="preset-save-section">
                    <input 
                        type="text" 
                        id="depp-save-name" 
                        placeholder="Preset name..." 
                        class="preset-input"
                    />
                    <button id="depp-save" class="btn btn-primary btn-sm">
                        Save as Preset
                    </button>
                </div>
            </div>
        `;
    }

    /**
     * Render preset list
     * @private
     */
    _renderPresetList() {
        const listEl = document.getElementById('depp-list');
        if (!listEl) return;

        const presets = DistanceEnvelopePresets.getAll();
        const customPresets = DistanceEnvelopePresets.getCustom();

        let html = '';

        // Built-in presets
        html += '<div class="preset-group">';
        html += '<div class="preset-group-title">Built-in Presets</div>';
        
        Object.entries(DistanceEnvelopePresets.getBuiltIn()).forEach(([id, preset]) => {
            html += this._renderPresetItem(id, preset, false);
        });
        
        html += '</div>';

        // Custom presets
        if (Object.keys(customPresets).length > 0) {
            html += '<div class="preset-group">';
            html += '<div class="preset-group-title">Custom Presets</div>';
            
            Object.entries(customPresets).forEach(([id, preset]) => {
                html += this._renderPresetItem(id, preset, true);
            });
            
            html += '</div>';
        }

        listEl.innerHTML = html;
    }

    /**
     * Render a single preset item
     * @param {string} id - Preset ID
     * @param {Object} preset - Preset data
     * @param {boolean} isCustom - Is custom preset
     * @returns {string} HTML
     * @private
     */
    _renderPresetItem(id, preset, isCustom) {
        const isSelected = this.selectedPresetId === id;
        const { enterAttack, sustainVolume, exitDecay, curve } = preset.config;

        return `
            <div class="preset-item ${isSelected ? 'selected' : ''}" data-preset-id="${id}">
                <div class="preset-main">
                    <div class="preset-name">${preset.name}</div>
                    <div class="preset-desc">${preset.description}</div>
                </div>
                <div class="preset-preview">
                    <div class="preset-bar" style="
                        background: linear-gradient(to right, 
                            transparent 0%, 
                            rgba(0, 255, 136, 0.3) ${enterAttack}%, 
                            rgba(0, 217, 255, ${sustainVolume * 0.5}) ${enterAttack}%, 
                            rgba(0, 217, 255, ${sustainVolume * 0.5}) ${100 - exitDecay}%, 
                            rgba(255, 71, 87, 0.3) ${100 - exitDecay}%, 
                            transparent 100%
                        );
                        height: 20px;
                        border-radius: 3px;
                    "></div>
                    <div class="preset-config">
                        <span>Attack: ${enterAttack}m</span>
                        <span>Sustain: ${(sustainVolume * 100).toFixed(0)}%</span>
                        <span>Decay: ${exitDecay}m</span>
                        <span class="preset-curve">${curve}</span>
                    </div>
                </div>
                ${isCustom ? `
                    <button class="btn-icon btn-delete" data-preset-delete="${id}" title="Delete preset">
                        🗑️
                    </button>
                ` : ''}
            </div>
        `;
    }

    /**
     * Attach event listeners
     * @private
     */
    _attachEventListeners() {
        // Preset selection
        this.container.addEventListener('click', (e) => {
            const presetItem = e.target.closest('.preset-item');
            const deleteBtn = e.target.closest('[data-preset-delete]');

            if (deleteBtn) {
                const id = deleteBtn.dataset.presetDelete;
                this._handleDelete(id);
                return;
            }

            if (presetItem) {
                const id = presetItem.dataset.presetId;
                this._handleSelect(id);
            }
        });

        // Save preset
        const saveBtn = document.getElementById('depp-save');
        if (saveBtn) {
            saveBtn.addEventListener('click', () => this._handleSave());
        }

        // Import/Export
        const importBtn = document.getElementById('depp-import');
        const exportBtn = document.getElementById('depp-export');

        if (importBtn) {
            importBtn.addEventListener('click', () => this._handleImport());
        }

        if (exportBtn) {
            exportBtn.addEventListener('click', () => this._handleExport());
        }

        // Enter key to save
        const saveInput = document.getElementById('depp-save-name');
        if (saveInput) {
            saveInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this._handleSave();
                }
            });
        }
    }

    /**
     * Handle preset selection
     * @param {string} id - Preset ID
     * @private
     */
    _handleSelect(id) {
        this.selectedPresetId = id;
        const preset = DistanceEnvelopePresets.getById(id);

        // Update UI
        this._renderPresetList();

        // Callback
        if (this.options.onSelect && preset) {
            this.options.onSelect(id, preset);
        }
    }

    /**
     * Handle save preset
     * @private
     */
    _handleSave() {
        if (!this.currentConfig) {
            alert('No configuration to save');
            return;
        }

        const nameInput = document.getElementById('depp-save-name');
        const name = nameInput?.value?.trim();

        if (!name) {
            alert('Please enter a preset name');
            return;
        }

        // Generate ID from name
        const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '_');

        // Save
        const preset = {
            name: name,
            description: 'Custom preset',
            config: this.currentConfig
        };

        const success = DistanceEnvelopePresets.saveCustom(id, preset);

        if (success) {
            nameInput.value = '';
            this._renderPresetList();

            if (this.options.onSave) {
                this.options.onSave(id, preset);
            }
        } else {
            alert('Failed to save preset');
        }
    }

    /**
     * Handle delete preset
     * @param {string} id - Preset ID
     * @private
     */
    _handleDelete(id) {
        const preset = DistanceEnvelopePresets.getById(id);
        if (!preset?.isCustom) {
            return;  // Can't delete built-in presets
        }

        if (confirm(`Delete preset "${preset.name}"?`)) {
            const success = DistanceEnvelopePresets.deleteCustom(id);

            if (success) {
                if (this.selectedPresetId === id) {
                    this.selectedPresetId = null;
                }
                this._renderPresetList();

                if (this.options.onDelete) {
                    this.options.onDelete(id);
                }
            }
        }
    }

    /**
     * Handle import presets
     * @private
     */
    _handleImport() {
        const json = prompt('Paste preset JSON:');
        if (!json) return;

        const success = DistanceEnvelopePresets.importJSON(json);

        if (success) {
            this._renderPresetList();
            if (this.options.onImport) {
                this.options.onImport(json);
            }
            alert('Presets imported successfully!');
        } else {
            alert('Failed to import presets. Invalid JSON.');
        }
    }

    /**
     * Handle export presets
     * @private
     */
    _handleExport() {
        const json = DistanceEnvelopePresets.exportJSON();

        if (this.options.onExport) {
            this.options.onExport(json);
        }

        // Copy to clipboard
        navigator.clipboard.writeText(json).then(() => {
            alert('Preset JSON copied to clipboard!');
        }).catch(() => {
            // Fallback: show in prompt
            prompt('Copy this JSON:', json);
        });
    }

    /**
     * Update current configuration (for saving)
     * @param {Object} config - Envelope config
     */
    setCurrentConfig(config) {
        this.currentConfig = { ...config };
    }

    /**
     * Select a preset by ID
     * @param {string} id - Preset ID
     */
    selectPreset(id) {
        this._handleSelect(id);
    }
}

// =============================================================================
// CSS Styles (injected dynamically)
// =============================================================================

/**
 * Inject preset picker styles
 */
function injectPresetPickerStyles() {
    const styleId = 'distance-envelope-preset-styles';
    if (document.getElementById(styleId)) return;

    const styles = `
        .distance-envelope-preset-picker {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            font-size: 13px;
            color: #fff;
        }

        .preset-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 12px;
            padding-bottom: 8px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }

        .preset-header h3 {
            margin: 0;
            font-size: 14px;
            color: #00d9ff;
        }

        .preset-actions {
            display: flex;
            gap: 6px;
        }

        .btn-icon {
            background: rgba(255, 255, 255, 0.1);
            border: none;
            border-radius: 4px;
            width: 28px;
            height: 28px;
            cursor: pointer;
            font-size: 14px;
            transition: background 0.2s;
        }

        .btn-icon:hover {
            background: rgba(255, 255, 255, 0.2);
        }

        .btn-delete:hover {
            background: rgba(255, 71, 87, 0.3);
        }

        .preset-list {
            max-height: 300px;
            overflow-y: auto;
            margin-bottom: 12px;
        }

        .preset-group {
            margin-bottom: 16px;
        }

        .preset-group-title {
            font-size: 11px;
            font-weight: 600;
            color: #888;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-bottom: 8px;
            padding-left: 4px;
        }

        .preset-item {
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 10px;
            margin-bottom: 6px;
            background: rgba(255, 255, 255, 0.05);
            border-radius: 6px;
            cursor: pointer;
            transition: all 0.2s;
            border: 1px solid transparent;
        }

        .preset-item:hover {
            background: rgba(255, 255, 255, 0.08);
        }

        .preset-item.selected {
            background: rgba(0, 217, 255, 0.15);
            border-color: rgba(0, 217, 255, 0.3);
        }

        .preset-main {
            flex: 1;
            min-width: 0;
        }

        .preset-name {
            font-weight: 600;
            color: #fff;
            margin-bottom: 2px;
        }

        .preset-desc {
            font-size: 11px;
            color: #888;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }

        .preset-preview {
            width: 180px;
            flex-shrink: 0;
        }

        .preset-config {
            display: flex;
            gap: 8px;
            font-size: 10px;
            color: #888;
            margin-top: 4px;
        }

        .preset-curve {
            color: #00d9ff;
            text-transform: capitalize;
        }

        .preset-save-section {
            display: flex;
            gap: 8px;
            padding-top: 12px;
            border-top: 1px solid rgba(255, 255, 255, 0.1);
        }

        .preset-input {
            flex: 1;
            background: rgba(255, 255, 255, 0.1);
            border: 1px solid rgba(255, 255, 255, 0.2);
            border-radius: 4px;
            padding: 8px 10px;
            color: #fff;
            font-size: 13px;
        }

        .preset-input::placeholder {
            color: #666;
        }

        .btn-sm {
            padding: 8px 16px;
            font-size: 12px;
            white-space: nowrap;
        }

        /* Scrollbar styling */
        .preset-list::-webkit-scrollbar {
            width: 6px;
        }

        .preset-list::-webkit-scrollbar-track {
            background: rgba(255, 255, 255, 0.05);
            border-radius: 3px;
        }

        .preset-list::-webkit-scrollbar-thumb {
            background: rgba(255, 255, 255, 0.2);
            border-radius: 3px;
        }

        .preset-list::-webkit-scrollbar-thumb:hover {
            background: rgba(255, 255, 255, 0.3);
        }
    `;

    const styleEl = document.createElement('style');
    styleEl.id = styleId;
    styleEl.textContent = styles;
    document.head.appendChild(styleEl);
}

// Auto-inject styles on load
if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', injectPresetPickerStyles);
    } else {
        injectPresetPickerStyles();
    }
}

// =============================================================================
// Exports
// =============================================================================

// Browser globals
if (typeof window !== 'undefined') {
    window.DistanceEnvelopePresets = DistanceEnvelopePresets;
    window.DistanceEnvelopeVisualizer = DistanceEnvelopeVisualizer;
    window.DistanceEnvelopePresetPicker = DistanceEnvelopePresetPicker;
}

// CommonJS/ESM (for bundlers)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        DistanceEnvelopePresets,
        DistanceEnvelopeVisualizer,
        DistanceEnvelopePresetPicker
    };
}

console.log('[distance_envelope_presets.js] v1.0 loaded - Presets:', Object.keys(DistanceEnvelopePresets.builtIn).length);
