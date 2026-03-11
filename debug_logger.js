/**
 * Debug Logger - Captures console.log and displays in page debug div
 * Reusable across any HTML page
 * 
 * TODO: Future Enhancements
 *   - Add export/copy button for sharing logs (already implemented in single_sound_v2.html)
 *   - Add filter toggle (show GPS only, show all, show errors only)
 *   - Add clear button
 *   - Add log persistence (save to localStorage, download as .txt)
 *   - Add timestamp export format for debugging timing issues
 */
const DebugLogger = {
    element: null,
    maxLines: 50,
    enabled: true,
    filter: null,

    /**
     * Initialize the debug logger
     * @param {string} elementId - ID of the debug div element
     * @param {number} maxLines - Maximum lines to keep (default 50)
     */
    init(elementId, maxLines) {
        this.element = document.getElementById(elementId || 'debugConsole');
        this.maxLines = maxLines || 50;

        if (!this.element) {
            console.warn('[DebugLogger] Element not found:', elementId);
            return;
        }

        // Store original console.log
        this.originalLog = console.log;

        // Override console.log to capture messages
        const self = this;
        console.log = function() {
            const args = Array.prototype.slice.call(arguments);
            self.originalLog.apply(console, args);
            self.write(args.join(' '));
        };

        console.log('[DebugLogger] Initialized, capturing to #' + elementId);
    },

    /**
     * Write a message to the debug div
     * @param {string} msg - Message to display
     */
    write(msg) {
        if (!this.enabled || !this.element) return;
        if (this.filter && !msg.match(this.filter)) return;

        const time = new Date().toLocaleTimeString();
        this.element.textContent = '[' + time + '] ' + msg + '\n' + this.element.textContent;

        // Trim to max lines
        const lines = this.element.textContent.split('\n');
        if (lines.length > this.maxLines) {
            this.element.textContent = lines.slice(0, this.maxLines).join('\n');
        }
    },

    /**
     * Clear the debug display
     */
    clear() {
        if (this.element) {
            this.element.textContent = '';
        }
    },

    /**
     * Set filter for which messages to capture
     * @param {string|RegExp} filter - Filter pattern
     */
    setFilter(filter) {
        this.filter = filter;
    },

    /**
     * Remove filter (capture all)
     */
    clearFilter() {
        this.filter = null;
    },

    /**
     * Enable/disable logging
     * @param {boolean} enabled
     */
    setEnabled(enabled) {
        this.enabled = enabled;
    }
};

// Export to window
window.DebugLogger = DebugLogger;
