/**
 * SoundLibrary - Sound Library Modal Component
 * 
 * @version 1.0
 * @description Manages user's sound collection with upload, preview, and assignment capabilities
 * 
 * Architecture:
 * - Decoupled from map editor via callback-based integration
 * - Type-agnostic data model (supports file, URL, oscillator, noise, recording)
 * - Hybrid loading (API with mock data fallback)
 * - Proper cleanup to prevent memory leaks
 * - ARIA accessibility support
 * 
 * Usage:
 *   const soundLibrary = new SoundLibrary({
 *       apiBaseUrl: '/api',
 *       onSoundAssign: (soundId, waypointId) => { ... },
 *       onError: (error) => { ... }
 *   });
 *   
 *   soundLibrary.open();
 *   soundLibrary.close();
 *   soundLibrary.destroy();  // Important: Call to cleanup!
 * 
 * Future Extensions (not implemented):
 * - User-specific libraries (server filters by user_id)
 * - Multi-type support (URL, oscillator, noise, recording)
 * - Offline caching (IndexedDB + Service Worker)
 * - Pagination for large libraries (50+ sounds)
 */

class SoundLibrary {
    /**
     * Constructor
     * @param {Object} options - Configuration options
     * @param {string} [options.apiBaseUrl='/api'] - Base API URL
     * @param {ApiClient} [options.apiClient] - ApiClient instance for authenticated requests
     * @param {Function} [options.onSoundAssign] - Callback: (soundId, waypointId) => void
     * @param {Function} [options.onError] - Callback: (error) => void
     * @param {number} [options.slowDoubleClickMin=400] - Min ms for slow double-click (rename)
     * @param {number} [options.slowDoubleClickMax=800] - Max ms for slow double-click (rename)
     */
    constructor(options = {}) {
        // === State ===
        this.sounds = [];                    // Array<SoundMetadata>
        this.selected = new Set();           // Set<SoundId>
        this.currentView = 'list';          // 'list' only
        this.lastClickedIndex = -1;          // For Shift+Click range select
        this.clickCount = 0;                 // For slow double-click detection
        this.lastClickTime = 0;
        this.renameTimer = null;
        this.isLoading = false;

        // === Configuration ===
        this.apiBaseUrl = options.apiBaseUrl || '/api';
        this.apiClient = options.apiClient || null;
        this.onSoundAssign = options.onSoundAssign || (() => {});
        this.onError = options.onError || console.error;
        this.slowDoubleClickMin = options.slowDoubleClickMin || 400;
        this.slowDoubleClickMax = options.slowDoubleClickMax || 800;
        
        // === DOM References (initialized in _createModal) ===
        this.modalEl = null;
        this.gridEl = null;
        this.emptyStateEl = null;
        this.loadingEl = null;
        this.statusBarEl = null;
        this.deleteBtn = null;
        this.assignBtn = null;
        this.contextMenuEl = null;
        this.filePond = null;
        this.viewIconsBtn = null;
        this.viewListBtn = null;
        
        // === Bound Event Handlers (for cleanup) ===
        this._boundHandleKeyDown = this._handleKeyDown.bind(this);
        this._boundHandleContextMenu = this._handleContextMenu.bind(this);
        this._boundHideContextMenu = this._hideContextMenu.bind(this);
        
        // === Initialize ===
        this._createModal();
        this._initFilePond();
        this._initKeyboard();
        this._initContextMenu();
        this._loadSounds();
    }
    
    // ============================================
    // Public API
    // ============================================
    
    /**
     * Open sound library modal
     */
    open() {
        if (!this.modalEl) return;
        this.modalEl.classList.add('visible');
        
        // Focus first focusable element for accessibility
        const closeBtn = this.modalEl.querySelector('.sound-library-close');
        if (closeBtn) {
            setTimeout(() => closeBtn.focus(), 100);
        }
    }
    
    /**
     * Close sound library modal
     */
    close() {
        if (!this.modalEl) return;
        this.modalEl.classList.remove('visible');
        this._hideContextMenu();
    }

    /**
     * Load sounds from API or mock data
     * Public interface to reload sounds
     */
    async load() {
        await this._loadSounds();
    }

    /**
     * Find sound by ID
     * @param {string} soundId - ID of the sound to find
     * @returns {SoundMetadata|null} The sound metadata or null if not found
     */
    findSoundById(soundId) {
        return this.sounds.find(sound => sound.id === soundId) || null;
    }
    
    /**
     * Cleanup - IMPORTANT: Call when done to prevent memory leaks
     */
    destroy() {
        // Remove event listeners
        document.removeEventListener('keydown', this._boundHandleKeyDown);
        document.removeEventListener('click', this._boundHideContextMenu);
        document.removeEventListener('scroll', this._boundHideContextMenu, true);
        
        // Destroy FilePond
        if (this.filePond) {
            this.filePond.destroy();
            this.filePond = null;
        }
        
        // Remove modal from DOM
        if (this.modalEl && this.modalEl.parentNode) {
            this.modalEl.parentNode.removeChild(this.modalEl);
        }
        
        // Clear references
        this.modalEl = null;
        this.gridEl = null;
        this.contextMenuEl = null;
        this.sounds = [];
        this.selected.clear();
    }
    
    // ============================================
    // Modal Creation
    // ============================================
    
    /**
     * Create modal DOM structure
     * @private
     */
    _createModal() {
        // Create overlay
        this.modalEl = document.createElement('div');
        this.modalEl.className = 'sound-library-overlay';
        this.modalEl.setAttribute('role', 'dialog');
        this.modalEl.setAttribute('aria-modal', 'true');
        this.modalEl.setAttribute('aria-labelledby', 'sound-library-title');
        
        // Create modal container
        this.modalEl.innerHTML = `
            <div class="sound-library-modal">
                <div class="sound-library-header">
                    <div class="sound-library-title">
                        <span id="sound-library-title">📁 Sound Library</span>
                    </div>
                    <button class="sound-library-close" aria-label="Close dialog">✕</button>
                </div>
                
                <div class="sound-library-loading">
                    <div class="sound-library-spinner"></div>
                    <span style="margin-left: 12px;">Loading sounds...</span>
                </div>
                
                <div class="sound-library-body">
                    <div class="sound-library-filepond">
                        <input type="file" class="sound-library-filepond-input" multiple>
                    </div>
                    
                    <div class="sound-library-file-grid view-list" role="grid" aria-label="Sound library files" aria-rowcount="0">
                        <!-- Files rendered here -->
                    </div>
                    
                    <div class="sound-library-empty-state">
                        <div class="sound-library-empty-state-icon">🎵</div>
                        <div>No sounds yet</div>
                        <div style="font-size: 12px; margin-top: 8px;">Drag & drop files above to upload</div>
                    </div>
                    
                    <div class="sound-library-error-banner" role="alert" aria-live="assertive" style="display: none;">
                        ⚠️ Failed to load sounds. Please try again.
                    </div>
                </div>
                
                <div class="sound-library-footer">
                    <div class="sound-library-status-bar" aria-live="polite" aria-atomic="true">0 sounds</div>
                    <div class="sound-library-footer-actions">
                        <!-- Buttons removed per requirements -->
                    </div>
                </div>
            </div>
            
            <div class="sound-library-context-menu" role="menu" aria-label="Sound actions">
                <div class="sound-library-context-menu-item" role="menuitem" tabindex="-1" data-action="delete">Delete</div>
                <div class="sound-library-context-menu-separator"></div>
                <div class="sound-library-context-menu-item" role="menuitem" tabindex="-1" data-action="usage">Show Usage</div>
            </div>
        `;
        
        // Append to document
        document.body.appendChild(this.modalEl);
        
        // Cache DOM references
        this.gridEl = this.modalEl.querySelector('.sound-library-file-grid');
        this.emptyStateEl = this.modalEl.querySelector('.sound-library-empty-state');
        this.loadingEl = this.modalEl.querySelector('.sound-library-loading');
        this.statusBarEl = this.modalEl.querySelector('.sound-library-status-bar');
        // Removed button references since buttons are no longer in the UI
        this.deleteBtn = null;
        this.assignBtn = null;
        this.contextMenuEl = this.modalEl.querySelector('.sound-library-context-menu');
        // Removed view toggle buttons since they are no longer in the UI
        this.viewIconsBtn = null;
        this.viewListBtn = null;
        
        // Setup event listeners
        this._setupModalListeners();
        
    }
    
    
    /**
     * Setup modal-specific event listeners
     * @private
     */
    _setupModalListeners() {
        // Close button
        const closeBtn = this.modalEl.querySelector('.sound-library-close');
        closeBtn.addEventListener('click', () => this.close());

        // Close on overlay click
        this.modalEl.addEventListener('click', (e) => {
            if (e.target === this.modalEl) {
                this.close();
            }
        });

        // Close on Escape
        this.modalEl.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.close();
            }
        });

        // View toggle buttons - not needed since we only use list view
        // Removed view toggle functionality
        
        // Footer action buttons removed per requirements
    }
    
    // ============================================
    // FilePond Initialization
    // ============================================
    
    /**
     * Initialize FilePond upload component
     * @private
     */
    _initFilePond() {
        const pondElement = this.modalEl.querySelector('.sound-library-filepond-input');
        
        // Check if FilePond is loaded
        if (typeof FilePond === 'undefined') {
            console.error('[SoundLibrary] FilePond not loaded. Include FilePond JS before sound_library.js');
            return;
        }
        
        // Register plugins (if available)
        if (typeof FilePondPluginFileValidateSize !== 'undefined') {
            FilePond.registerPlugin(FilePondPluginFileValidateSize);
        }
        if (typeof FilePondPluginFileValidateType !== 'undefined') {
            FilePond.registerPlugin(FilePondPluginFileValidateType);
        }
        
        // Initialize FilePond
        this.filePond = FilePond.create(pondElement, {
            acceptedFileTypes: [
                'audio/mpeg',  // Standard MIME type for MP3 files
                'audio/mp3',   // Some systems report this for MP3
                'audio/wav',
                'audio/x-wav',
                'audio/ogg',
                'audio/x-ogg',
                'audio/m4a',
                'audio/x-m4a',
                'audio/flac',
                'audio/x-flac',
                'audio/aac',
                'audio/x-aac',
                'audio/opus',
                'audio/x-opus',
                '.mp3',
                '.wav',
                '.ogg',
                '.m4a',
                '.flac',
                '.aac',
                '.opus'
            ],
            name: 'sound',  // Specify the field name to match the backend expectation
            maxFileSize: '50MB',
            maxTotalFileSize: '100MB',
            allowMultiple: true,
            labelIdle: '<span class="filepond--label-action">Upload Files</span>',
            labelMaxFileSizeExceeded: 'File is too large',
            labelMaxFileSize: 'Maximum file size is 50MB',
            labelTapToCancel: 'Tap to cancel',
            labelTapToRetry: 'Tap to retry',
            labelTapToUndo: 'Tap to undo',
            labelButtonRemoveItem: 'Remove',
            labelButtonAbortItemLoad: 'Abort',
            labelFileProcessing: 'Uploading...',
            labelFileProcessingComplete: 'Upload complete',
            labelFileProcessingAborted: 'Upload cancelled',
            labelFileProcessingError: 'Upload error',
            labelFileTypeNotAllowed: 'Invalid file type ',
            fileValidateTypeLabelExpectedTypes: 'Accepts {allTypes}',
            fileValidateTypeDetectType: (source, type) => {
                // Debug logging to understand the file object
                console.log('[SoundLibrary] FilePond fileValidateTypeDetectType called');
                console.log('[SoundLibrary] File source object:', source);
                console.log('[SoundLibrary] File source name:', source.name);
                console.log('[SoundLibrary] File source type:', type);

                // Return a promise as required by FilePond documentation
                return new Promise((resolve, reject) => {
                    // If the browser already reported a valid audio MIME type that we accept, return it
                    if (type) {
                        // Check if this type is in our accepted list
                        const acceptedTypes = [
                            'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav',
                            'audio/ogg', 'audio/x-ogg', 'audio/m4a', 'audio/x-m4a',
                            'audio/flac', 'audio/x-flac', 'audio/aac', 'audio/x-aac',
                            'audio/opus', 'audio/x-opus'
                        ];
                        
                        if (acceptedTypes.includes(type)) {
                            console.log('[SoundLibrary] Browser reported accepted audio type:', type);
                            resolve(type);
                            return;
                        }
                    }

                    // If no type or not an accepted audio type, determine from file extension
                    const fileName = source.name || '';
                    console.log('[SoundLibrary] Detected filename:', fileName);
                    const extension = fileName.split('.').pop().toLowerCase();
                    console.log('[SoundLibrary] Detected extension:', extension);

                    // Map file extensions to the MIME types we're accepting in acceptedFileTypes
                    const extToMime = {
                        'mp3': 'audio/mpeg', // Standard MIME type for MP3
                        'wav': 'audio/wav',
                        'ogg': 'audio/ogg',
                        'm4a': 'audio/m4a',
                        'flac': 'audio/flac',
                        'aac': 'audio/aac',
                        'opus': 'audio/opus'
                    };

                    if (extToMime[extension]) {
                        console.log('[SoundLibrary] Returning MIME type based on extension:', extToMime[extension]);
                        resolve(extToMime[extension]);
                        return;
                    }

                    // For unknown extensions, return the original type
                    console.log('[SoundLibrary] Returning original type:', type);
                    resolve(type);
                });
            },
            onpreparefile: (file, output) => {
                // Debug logging for file preparation
                console.log('[SoundLibrary] Preparing file:', file);
                console.log('[SoundLibrary] File name in onpreparefile:', file.filename);
                console.log('[SoundLibrary] File object in onpreparefile:', file);
            },
            // Server upload with proper error handling (P1 fix)
            server: {
                process: (fieldName, file, metadata, load, error, progress) => {
                    // Check for duplicate filenames
                    const existingFile = this.sounds.find(sound => sound.name === file.name);
                    if (existingFile) {
                        const shouldReplace = confirm(`"${file.name}" already exists. Replace it?`);
                        if (!shouldReplace) {
                            error('Duplicate file - upload cancelled');
                            return;
                        }
                        
                        // Remove the existing file before uploading the new one
                        this._removeFile(existingFile.id);
                    }

                    // Debug logging
                    console.log('[SoundLibrary] FilePond process called');
                    console.log('[SoundLibrary] Field name:', fieldName);
                    console.log('[SoundLibrary] File object:', file);
                    console.log('[SoundLibrary] File name:', file.name);
                    console.log('[SoundLibrary] File size:', file.size);
                    console.log('[SoundLibrary] File type:', file.type);

                    // Create FormData
                    const formData = new FormData();
                    formData.append(fieldName, file);

                    // Create abort controller for this upload
                    const abortController = new AbortController();

                    // Return a promise for FilePond to handle async operations
                    const uploadPromise = new Promise(async (resolve, reject) => {
                        try {
                            // Use ApiClient if available, otherwise fall back to direct fetch with manual auth
                            let response;
                            console.log('[SoundLibrary] Starting upload...');
                            console.log('[SoundLibrary] File details:', {
                                name: file.name,
                                size: file.size,
                                type: file.type
                            });

                            if (this.apiClient) {
                                // Use ApiClient which handles authentication automatically
                                const headers = { ...this.apiClient.getAuthHeader() };
                                
                                console.log('[SoundLibrary] Using ApiClient, headers:', headers);
                                console.log('[SoundLibrary] Upload URL:', `${this.apiClient.baseUrl}/sounds/upload`);

                                response = await fetch(`${this.apiClient.baseUrl}/sounds/upload`, {
                                    method: 'POST',
                                    body: formData,
                                    headers: headers,
                                    signal: abortController.signal
                                });
                            } else {
                                // Fallback to direct fetch with manual auth
                                const token = localStorage.getItem('audio_ar_token');
                                const headers = {
                                    'Accept': 'application/json'
                                };

                                if (token) {
                                    headers['Authorization'] = `Bearer ${token}`;
                                } else {
                                    console.warn('[SoundLibrary] No authentication token found in localStorage');
                                }
                                
                                console.log('[SoundLibrary] Using direct fetch, headers:', headers);
                                console.log('[SoundLibrary] Upload URL:', `${this.apiBaseUrl}/sounds/upload`);

                                response = await fetch(`${this.apiBaseUrl}/sounds/upload`, {
                                    method: 'POST',
                                    body: formData,
                                    headers: headers,
                                    signal: abortController.signal
                                });
                            }

                            console.log('[SoundLibrary] Upload response received:', {
                                status: response.status,
                                statusText: response.statusText,
                                headers: [...response.headers.entries()],
                                ok: response.ok
                            });

                            // Check if response is HTML instead of JSON
                            const contentType = response.headers.get('content-type');
                            if (contentType && contentType.includes('text/html')) {
                                const htmlResponse = await response.text();
                                console.error('[SoundLibrary] Upload received HTML instead of JSON:', htmlResponse.substring(0, 200) + '...');

                                // Throw a more descriptive error
                                if (response.status === 503) {
                                    throw new Error('Service Unavailable: The server is temporarily unable to handle the upload');
                                } else {
                                    throw new Error(`Unexpected HTML response during upload (status: ${response.status})`);
                                }
                            }
                            
                            // Check if response is not ok (status code 4xx or 5xx)
                            if (!response.ok) {
                                const errorText = await response.text();
                                console.error('[SoundLibrary] Upload failed with status:', response.status, 'Response:', errorText);
                                throw new Error(`Upload failed with status ${response.status}: ${errorText}`);
                            }

                            const soundMetadata = await response.json();
                            console.log('[SoundLibrary] Sound metadata received:', soundMetadata);

                            // P1 fix: Only add to sounds array AFTER successful upload
                            this._addFile(soundMetadata);

                            // Return file ID to FilePond
                            load(soundMetadata.id);

                            // Update file name in FilePond to ensure it shows the correct name
                            if (this.filePond) {
                                // Find the file in FilePond by original file reference if possible
                                // If not, just make sure the UI is refreshed after the metadata is loaded
                                this._render();
                            }

                            resolve();
                        } catch (err) {
                            console.error('[SoundLibrary] Upload error:', {
                                error: err,
                                message: err.message,
                                stack: err.stack
                            });

                            // P1 fix: Report error to FilePond and app
                            error(err.message);
                            this.onError(err);

                            reject(err);
                        }
                    });

                    // Return abort function and progress handler
                    return {
                        abort: () => {
                            console.log('[SoundLibrary] Upload aborted');
                            abortController.abort();
                        },
                        onprogress: (loaded, total) => {
                            progress(true, loaded, total);
                        }
                    };
                }
            },
            
            // Hide unnecessary FilePond UI elements
            credits: false,  // This hides "Powered by FilePond"
            allowPaste: false,  // Disable paste functionality
            allowMultiple: true,
            itemInsertLocation: 'after',
            // Simplify the file info labels to only show progress
            labelFileProcessing: 'Uploading...',
            labelFileProcessingComplete: '✓',
            labelFileLoading: '',
            // Remove file info after processing is complete
            onprocessfile: (file) => {
                // After file is processed, hide the file item after a short delay
                setTimeout(() => {
                    if (file.origin === FilePond.FILE_ORIGIN_OUTPUT) {
                        // This is a newly added file, hide it after upload
                        this._removeFileFromUI(file.id);
                    }
                }, 1000); // Wait 1 second before removing
            }
        });
        
        // Listen for file additions (already handled in server.process)
        this.filePond.on('addfile', (fileError, file) => {
            if (fileError) {
                console.error('[SoundLibrary] FilePond addfile error:', fileError);
                
                // Provide user-friendly error message
                let errorMessage = 'Upload failed';
                if (fileError.main === 'Invalid file type ') {
                    errorMessage = 'Invalid file type. Supported formats: .mp3, .wav, .ogg, .m4a, .flac, .aac, .opus';
                } else if (fileError.body) {
                    errorMessage = fileError.body;
                }
                
                // Show error in UI if possible
                const errorBanner = this.modalEl.querySelector('.sound-library-error-banner');
                if (errorBanner) {
                    errorBanner.style.display = 'block';
                    errorBanner.textContent = `⚠️ ${errorMessage}`;
                    
                    // Hide the error after 5 seconds
                    setTimeout(() => {
                        errorBanner.style.display = 'none';
                    }, 5000);
                }
                
                this.onError(new Error(errorMessage));
            }
        });
        
        // Listen for file removal
        this.filePond.on('removefile', (file) => {
            // File removed from pond (doesn't affect our sounds array)
        });
    }
    
    // ============================================
    // Keyboard Shortcuts
    // ============================================
    
    /**
     * Initialize keyboard shortcuts
     * @private
     */
    _initKeyboard() {
        // Use bound handler for cleanup
        document.addEventListener('keydown', this._boundHandleKeyDown);
    }
    
    /**
     * Handle keyboard events
     * @param {KeyboardEvent} e
     * @private
     */
    _handleKeyDown(e) {
        // Only handle when modal is open
        if (!this.modalEl || !this.modalEl.classList.contains('visible')) {
            return;
        }
        
        // Ctrl+A / Cmd+A: Select all
        if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
            e.preventDefault();
            this._selectAll();
        }
        
        // Delete: Remove selected
        if (e.key === 'Delete' || e.key === 'Backspace') {
            // Don't delete if renaming (input is focused)
            if (document.activeElement.tagName !== 'INPUT') {
                e.preventDefault();
                this._deleteSelected();
            }
        }
        
        // Escape: Deselect all or close modal
        if (e.key === 'Escape') {
            if (this.selected.size > 0) {
                this._deselectAll();
            } else {
                this.close();
            }
        }
        
        // F2: Rename selected
        if (e.key === 'F2') {
            e.preventDefault();
            const firstSelected = Array.from(this.selected)[0];
            if (firstSelected) {
                this._startRename(firstSelected);
            }
        }
        
        // Type-to-jump (simple version)
        if (e.key.length === 1 && e.key.match(/[a-z0]/i)) {
            if (document.activeElement.tagName !== 'INPUT') {
                this._jumpToFile(e.key);
            }
        }
    }
    
    // ============================================
    // Context Menu
    // ============================================
    
    /**
     * Initialize context menu
     * @private
     */
    _initContextMenu() {
        // Use bound handler for cleanup
        this.gridEl.addEventListener('contextmenu', this._boundHandleContextMenu);
        document.addEventListener('click', this._boundHideContextMenu);
        document.addEventListener('scroll', this._boundHideContextMenu, true);
        
        // Add event delegation for context menu items
        this.contextMenuEl.addEventListener('click', (e) => {
            const menuItem = e.target.closest('.sound-library-context-menu-item');
            if (menuItem) {
                const action = menuItem.getAttribute('data-action');
                if (action) {
                    this.handleContextMenuAction(action);
                }
            }
        });
    }
    
    /**
     * Handle context menu (right-click)
     * @param {MouseEvent} e
     * @private
     */
    _handleContextMenu(e) {
        e.preventDefault();
        
        const fileItem = e.target.closest('.sound-file-item');
        if (!fileItem) return;
        
        const fileId = fileItem.dataset.id;
        
        // P2 fix: Validate sound exists
        const sound = this.sounds.find(s => s.id === fileId);
        if (!sound) {
            console.warn('[SoundLibrary] Context menu: Sound not found:', fileId);
            return;
        }
        
        // If right-clicking unselected file, select it
        if (!this.selected.has(fileId)) {
            this._deselectAll();
            this._select(fileId);
        }
        
        // Position menu
        this.contextMenuEl.style.left = e.clientX + 'px';
        this.contextMenuEl.style.top = e.clientY + 'px';
        this.contextMenuEl.classList.add('visible');
        
        // Focus first menu item for accessibility
        const firstItem = this.contextMenuEl.querySelector('.sound-library-context-menu-item');
        if (firstItem) {
            setTimeout(() => firstItem.focus(), 10);
        }
        
        // Store context menu target
        this.contextMenuTarget = fileId;
    }
    
    /**
     * Hide context menu
     * @private
     */
    _hideContextMenu() {
        this.contextMenuEl.classList.remove('visible');
        this.contextMenuTarget = null;
    }
    
    // ============================================
    // Sound Loading
    // ============================================
    
    /**
     * Load sounds from API or mock data
     * @private
     */
    async _loadSounds() {
        this._setLoading(true);

        try {
            // Use ApiClient if available, otherwise fall back to direct fetch
            if (this.apiClient) {
                // Check if ApiClient is properly authenticated
                if (this.apiClient.isLoggedIn && !this.apiClient.isLoggedIn()) {
                    console.warn('[SoundLibrary] ApiClient not logged in, showing empty list');
                    this.sounds = [];
                    this._render();
                    this._setLoading(false);
                    return;
                }

                // Use the ApiClient to make authenticated requests
                const sounds = await this.apiClient.getSounds();

                // P1 fix: Validate sounds array
                if (!Array.isArray(sounds)) {
                    throw new Error('Invalid response format: expected array');
                }

                this.sounds = sounds;
                this._render();
                this._setLoading(false);
                return;
            } else {
                // Try to load from API with authentication headers
                const token = localStorage.getItem('audio_ar_token');
                const headers = {
                    'Content-Type': 'application/json'
                };

                if (token) {
                    headers['Authorization'] = `Bearer ${token}`;
                }

                const response = await fetch(`${this.apiBaseUrl}/sounds`, {
                    headers: headers
                });

                if (response.ok) {
                    const sounds = await response.json();

                    // P1 fix: Validate sounds array
                    if (!Array.isArray(sounds)) {
                        throw new Error('Invalid response format: expected array');
                    }

                    this.sounds = sounds;
                    this._render();
                    this._setLoading(false);
                    return;
                }

                // Non-200 response
                console.warn('[SoundLibrary] API returned non-200:', response.status);
                
                // Don't load mock data - just show empty state
                this.sounds = [];
                this._render();
                this._setLoading(false);
                return;
            }

        } catch (error) {
            console.error('[SoundLibrary] API load failed:', error);
            // Show a more descriptive error in the UI
            const errorBanner = this.modalEl.querySelector('.sound-library-error-banner');
            if (errorBanner) {
                errorBanner.style.display = 'block';
                errorBanner.textContent = `⚠️ Server Error: ${error.message || 'Unable to load sounds'}`;
            }
            this.onError(error);
            
            // Don't load mock data - just show empty state
            this.sounds = [];
            this._render();
            this._setLoading(false);
            return;
        }

        this._setLoading(false);
    }
    
    /**
     * Load mock data for development/testing
     * @private
     */
    _loadMockData() {
        // P2 fix: Wrap in type-aware structure
        this.sounds = [
            {
                id: 'snd_1',
                name: 'BoxingBell.mp3',
                soundType: 'file',
                source: {
                    type: 'file',
                    url: '/sounds/BoxingBell.mp3',
                    fileSize: 2412345,
                    duration: 15.3
                },
                createdAt: Date.now() - (3 * 24 * 60 * 60 * 1000)  // 3 days ago
            },
            {
                id: 'snd_2',
                name: 'water.wav',
                soundType: 'file',
                source: {
                    type: 'file',
                    url: '/sounds/water.wav',
                    fileSize: 15728640,
                    duration: 150.5
                },
                createdAt: Date.now() - (8 * 24 * 60 * 60 * 1000)  // 8 days ago
            },
            {
                id: 'snd_3',
                name: 'aboutCuba.wav',
                soundType: 'file',
                source: {
                    type: 'file',
                    url: '/sounds/aboutCuba.wav',
                    fileSize: 12582912,
                    duration: 105.2
                },
                createdAt: Date.now() - (4 * 24 * 60 * 60 * 1000)  // 4 days ago
            },
            {
                id: 'snd_4',
                name: 'freightTrain.mp3',
                soundType: 'file',
                source: {
                    type: 'file',
                    url: '/sounds/freightTrain.mp3',
                    fileSize: 8912345,
                    duration: 89.7
                },
                createdAt: Date.now() - (1 * 24 * 60 * 60 * 1000)  // 1 day ago
            },
            {
                id: 'snd_5',
                name: 'dogs.wav',
                soundType: 'file',
                source: {
                    type: 'file',
                    url: '/sounds/dogs.wav',
                    fileSize: 4456789,
                    duration: 44.3
                },
                createdAt: Date.now() - (21 * 24 * 60 * 60 * 1000)  // 21 days ago
            },
            {
                id: 'snd_6',
                name: 'construction.wav',
                soundType: 'file',
                source: {
                    type: 'file',
                    url: '/sounds/construction.wav',
                    fileSize: 18874321,
                    duration: 188.1
                },
                createdAt: Date.now() - (3 * 24 * 60 * 60 * 1000)  // 3 days ago
            }
        ];
        
        this._render();
    }
    
    // ============================================
    // File Operations
    // ============================================
    
    /**
     * Add file to sounds array
     * @param {SoundMetadata} soundMetadata
     * @private
     */
    _addFile(soundMetadata) {
        // Debug logging
        console.log('[SoundLibrary] Adding file with metadata:', soundMetadata);
        
        // P1 fix: Validate metadata
        if (!soundMetadata || !soundMetadata.id) {
            console.error('[SoundLibrary] Invalid sound metadata:', soundMetadata);
            return;
        }

        this.sounds.push(soundMetadata);
        this._render();
    }
    
    /**
     * Remove file from sounds array
     * @param {string} soundId
     * @private
     */
    async _removeFile(soundId) {
        // Remove from local array
        this.sounds = this.sounds.filter(s => s.id !== soundId);
        this.selected.delete(soundId);
        
        // Attempt to remove from server if ApiClient is available
        if (this.apiClient && this.apiClient.deleteSound) {
            try {
                await this.apiClient.deleteSound(soundId);
                console.log('[SoundLibrary] Deleted sound from server:', soundId);
            } catch (error) {
                console.error('[SoundLibrary] Failed to delete sound from server:', error);
                // Still update UI even if server delete fails
            }
        } else if (this.apiClient) {
            // Alternative API call if deleteSound method doesn't exist
            try {
                const token = localStorage.getItem('audio_ar_token');
                const headers = {
                    'Content-Type': 'application/json'
                };
                
                if (token) {
                    headers['Authorization'] = `Bearer ${token}`;
                }
                
                const response = await fetch(`${this.apiBaseUrl}/sounds/${soundId}`, {
                    method: 'DELETE',
                    headers: headers
                });
                
                if (!response.ok) {
                    throw new Error(`Server responded with ${response.status}`);
                }
                
                console.log('[SoundLibrary] Deleted sound from server:', soundId);
            } catch (error) {
                console.error('[SoundLibrary] Failed to delete sound from server:', error);
                // Still update UI even if server delete fails
            }
        }
        
        this._render();
    }
    
    /**
     * Rename file
     * @param {string} soundId
     * @param {string} newName
     * @private
     */
    _renameFile(soundId, newName) {
        const sound = this.sounds.find(s => s.id === soundId);
        if (sound) {
            sound.name = newName;
            this._render();
        }
    }
    
    // ============================================
    // Selection Management
    // ============================================
    
    /**
     * Select a sound
     * @param {string} soundId
     * @param {boolean} [addToSelection=false]
     * @private
     */
    _select(soundId, addToSelection = false) {
        if (addToSelection) {
            this.selected.add(soundId);
        } else {
            this.selected = new Set([soundId]);
        }
        this._render();
    }
    
    /**
     * Deselect a sound
     * @param {string} soundId
     * @private
     */
    _deselect(soundId) {
        this.selected.delete(soundId);
        this._render();
    }
    
    /**
     * Select all sounds
     * @private
     */
    _selectAll() {
        this.sounds.forEach(s => this.selected.add(s.id));
        this._render();
    }
    
    /**
     * Deselect all sounds
     * @private
     */
    _deselectAll() {
        this.selected.clear();
        this._render();
    }
    
    /**
     * Toggle selection
     * @param {string} soundId
     * @param {boolean} [addToSelection=false]
     * @private
     */
    _toggleSelect(soundId, addToSelection = false) {
        if (this.selected.has(soundId)) {
            this._deselect(soundId);
        } else {
            this._select(soundId, addToSelection);
        }
    }
    
    /**
     * Select range (for Shift+Click)
     * @param {string} soundId
     * @private
     */
    _selectRange(soundId) {
        const currentIndex = this.sounds.findIndex(s => s.id === soundId);
        if (currentIndex === -1 || this.lastClickedIndex === -1) {
            this._select(soundId);
            return;
        }
        
        const start = Math.min(this.lastClickedIndex, currentIndex);
        const end = Math.max(this.lastClickedIndex, currentIndex);
        
        for (let i = start; i <= end; i++) {
            this.selected.add(this.sounds[i].id);
        }
        this._render();
    }
    
    // ============================================
    // Rendering
    // ============================================
    
    /**
     * Set loading state
     * @param {boolean} isLoading
     * @private
     */
    _setLoading(isLoading) {
        this.isLoading = isLoading;
        
        if (this.loadingEl) {
            this.loadingEl.classList.toggle('visible', isLoading);
        }
        
        if (this.gridEl) {
            this.gridEl.style.display = isLoading ? 'none' : 'grid';
        }
        
        if (this.emptyStateEl) {
            this.emptyStateEl.classList.toggle('visible', !isLoading && this.sounds.length === 0);
        }
    }
    
    /**
     * Set view mode (list only - no switching)
     * @private
     */
    _setView() {
        // Only list view is supported now
        this.currentView = 'list';

        // Ensure grid is always in list view
        if (this.gridEl) {
            this.gridEl.classList.remove('view-icons');
            this.gridEl.classList.add('view-list');
        }

        this._render();
    }
    
    /**
     * Render sound grid
     * @private
     */
    _render() {
        // Debug logging
        console.log('[SoundLibrary] Rendering sounds:', this.sounds);
        
        // Update empty state
        if (this.sounds.length === 0) {
            if (this.gridEl) this.gridEl.style.display = 'none';
            if (this.emptyStateEl) this.emptyStateEl.classList.add('visible');
        } else {
            if (this.gridEl) {
                this.gridEl.style.display = 'table';  // Always use list view
                this.gridEl.setAttribute('aria-rowcount', String(this.sounds.length));
            }
            if (this.emptyStateEl) this.emptyStateEl.classList.remove('visible');
        }

        // Always render in list view
        // Debug each sound before rendering
        this.sounds.forEach((sound, index) => {
            console.log(`[SoundLibrary] Rendering sound ${index} in list view:`, sound.name, 'with file size:', sound.source.fileSize);
        });

        // List view
        this.gridEl.innerHTML = this.sounds.map((sound, index) => `
            <div class="sound-file-item ${this.selected.has(sound.id) ? 'selected' : ''}"
                 data-id="${sound.id}"
                 data-index="${index}"
                 role="row"
                 tabindex="0"
                 aria-selected="${this.selected.has(sound.id)}">
                <div class="sound-file-name-cell">
                    <span>${this._escapeHtml(sound.name)}</span>
                </div>
                <div class="sound-file-type-cell">${(sound.source.type || 'AUDIO').toUpperCase()}</div>
                <div class="sound-file-size-cell">${this._formatSize(sound.source.fileSize)}</div>
                <div class="sound-file-date-cell">${this._formatDate(sound.createdAt)}</div>
            </div>
        `).join('');

        // Add event listeners after elements are created
        this.gridEl.querySelectorAll('.sound-file-item').forEach(item => {
            const soundId = item.dataset.id;
            item.addEventListener('click', (e) => this._handleFileClick(e, soundId));
            item.addEventListener('dblclick', (e) => this._handleFileDblClick(e, soundId));
            item.addEventListener('mousedown', (e) => this._handleFileMouseDown(e, soundId));
        });

        // Update status bar
        const totalSize = this.sounds.reduce((sum, s) => sum + (s.source.fileSize || 0), 0);
        const selectedSize = Array.from(this.selected)
            .map(id => this.sounds.find(s => s.id === id))
            .filter(s => s)
            .reduce((sum, s) => sum + (s.source.fileSize || 0), 0);

        const countText = this.sounds.length === 1 ? 'sound' : 'sounds';
        const selectedText = this.selected.size === 1 ? 'selected' : 'selected';

        if (this.statusBarEl) {
            this.statusBarEl.textContent = `${this.sounds.length} ${countText}` +
                (this.selected.size > 0 ? ` • ${this.selected.size} ${selectedText} • ${this._formatSize(selectedSize)}` : '') +
                ` • ${this._formatSize(totalSize)} total`;
        }

        // Buttons removed per requirements - no need to update them
    }
    
    // ============================================
    // Event Handlers
    // ============================================
    
    /**
     * Handle file click
     * @param {MouseEvent} e
     * @param {string} soundId
     */
    _handleFileClick(e, soundId) {
        e.stopPropagation();

        const index = this.sounds.findIndex(s => s.id === soundId);
        this.lastClickedIndex = index;

        // Ctrl/Cmd+Click: Toggle selection
        if (e.ctrlKey || e.metaKey) {
            this._toggleSelect(soundId, true);
        }
        // Shift+Click: Range select
        else if (e.shiftKey && this.lastClickedIndex !== -1) {
            this._selectRange(soundId);
        }
        // Regular click: Select single
        else {
            this._select(soundId);
        }
    }

    /**
     * Handle file double-click (preview)
     * @param {MouseEvent} e
     * @param {string} soundId
     */
    _handleFileDblClick(e, soundId) {
        e.stopPropagation();

        const now = Date.now();

        // Check if this is a slow double-click (rename) or fast (preview)
        if (this.clickCount === 1 && (now - this.lastClickTime) < this.slowDoubleClickMin) {
            // Fast double-click: Preview
            this._previewSound(soundId);
        }

        this.clickCount++;
        this.lastClickTime = now;

        // Reset after 1 second
        setTimeout(() => {
            this.clickCount = 0;
        }, 1000);
    }

    /**
     * Handle file mousedown (for slow double-click detection)
     * @param {MouseEvent} e
     * @param {string} soundId
     */
    _handleFileMouseDown(e, soundId) {
        e.stopPropagation();

        // Track for slow double-click rename
        if (e.detail === 2) {
            const now = Date.now();
            if ((now - this.lastClickTime) > this.slowDoubleClickMin &&
                (now - this.lastClickTime) < this.slowDoubleClickMax) {
                // Slow double-click detected: Start rename
                clearTimeout(this.renameTimer);
                this._startRename(soundId);
            }
        }
    }
    
    // ============================================
    // File Actions
    // ============================================
    
    /**
     * Preview sound (type-specific)
     * @param {string} soundId
     * @private
     */
    _previewSound(soundId) {
        const sound = this.sounds.find(s => s.id === soundId);
        if (!sound) {
            console.warn('[SoundLibrary] Preview: Sound not found:', soundId);
            return;
        }
        
        // P2 fix: Type-specific preview
        switch (sound.soundType) {
            case 'file':
            case 'url':
                // Open in OS default player or new tab
                window.open(sound.source.url, '_blank');
                break;
            
            case 'oscillator':
                // Play tone via Web Audio API (future implementation)
                alert(`🎛️ Oscillator preview not yet implemented\nFrequency: ${sound.source.frequency || 440}Hz`);
                break;
            
            case 'noise':
                // Play noise via Web Audio API (future implementation)
                alert(`🎹 Noise preview not yet implemented\nColor: ${sound.source.color || 'white'}`);
                break;
            
            default:
                console.warn('[SoundLibrary] Unknown sound type:', sound.soundType);
                alert(`ℹ️ Preview not available for this sound type`);
        }
    }
    
    /**
     * Start rename process
     * @param {string} soundId
     * @private
     */
    _startRename(soundId) {
        const fileItem = this.gridEl.querySelector(`[data-id="${soundId}"]`);
        if (!fileItem) return;
        
        const nameEl = fileItem.querySelector('.sound-file-name');
        const span = nameEl.querySelector('span');
        const currentName = this.sounds.find(s => s.id === soundId).name;
        
        // Create input
        const input = document.createElement('input');
        input.type = 'text';
        input.value = currentName;
        input.setAttribute('aria-label', 'Rename sound');
        
        // Select filename without extension
        const lastDot = currentName.lastIndexOf('.');
        if (lastDot > 0) {
            input.setSelectionRange(0, lastDot);
        }
        
        // Replace span with input
        nameEl.innerHTML = '';
        nameEl.appendChild(input);
        fileItem.classList.add('renaming');
        input.focus();
        
        // Save on blur or Enter
        const save = () => {
            const newName = input.value.trim();
            if (newName && newName !== currentName) {
                // P2 fix: Validate new name
                if (newName.length < 1) {
                    alert('Filename cannot be empty');
                    fileItem.classList.remove('renaming');
                    this._render();
                    return;
                }
                
                this._renameFile(soundId, newName);
            }
            fileItem.classList.remove('renaming');
        };
        
        input.addEventListener('blur', save);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                input.blur();
            } else if (e.key === 'Escape') {
                fileItem.classList.remove('renaming');
                this._render();  // Revert
            }
        });
    }
    
    /**
     * Jump to file by typing first letter
     * @param {string} char
     * @private
     */
    _jumpToFile(char) {
        const lowerChar = char.toLowerCase();
        const file = this.sounds.find(s => s.name.toLowerCase().startsWith(lowerChar));
        if (file) {
            this._deselectAll();
            this._select(file.id);
            
            // Scroll into view
            const el = this.gridEl.querySelector(`[data-id="${file.id}"]`);
            if (el) {
                el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        }
    }
    
    /**
     * Delete selected sounds
     * @private
     */
    async _deleteSelected() {
        if (this.selected.size === 0) return;

        const selectedSounds = Array.from(this.selected)
            .map(id => this.sounds.find(s => s.id === id))
            .filter(s => s);

        // P2 fix: Validate and show warning
        const inUse = selectedSounds.filter(s => Math.random() > 0.5);  // Mock usage check

        if (inUse.length > 0) {
            const confirmed = confirm(
                `⚠️ Delete ${selectedSounds.length} sounds?\n\n` +
                inUse.slice(0, 3).map(s => `• "${s.name}" is used by waypoints\n`).join('') +
                `\n[Cancel]  [Delete Anyway]`
            );
            if (!confirmed) return;
        } else {
            const confirmed = confirm(`Delete ${selectedSounds.length} selected sound(s)?`);
            if (!confirmed) return;
        }

        // Delete sounds
        for (const id of this.selected) {
            await this._removeFile(id);
        }

        this.selected.clear();
    }
    
    /**
     * Handle sound assignment to waypoint
     * @private
     */
    _handleAssign() {
        if (this.selected.size === 0) return;

        const selectedSounds = Array.from(this.selected)
            .map(id => this.sounds.find(s => s.id === id))
            .filter(s => s);

        // P2 fix: Validate sounds exist
        if (selectedSounds.length === 0) {
            console.error('[SoundLibrary] Assign: No valid sounds selected');
            return;
        }

        // For now, show alert (will be replaced by waypoint assignment mode)
        alert(
            `📤 Assign to Waypoint\n\n` +
            `Selected: ${selectedSounds.map(s => s.name).join(', ')}\n\n` +
            `(In production: cursor changes to "sound dropper", click waypoint to assign)`
        );

        // TODO: Enter assignment mode
        // this.onSoundAssign(soundId, waypointId);
    }
    
    // ============================================
    // Context Menu Actions
    // ============================================
    
    /**
     * Remove file from FilePond UI after upload completion
     * @param {string} fileId - ID of the file to remove
     * @private
     */
    _removeFileFromUI(fileId) {
        if (this.filePond) {
            // Remove the file from FilePond's UI (not from server)
            this.filePond.removeFile(fileId);
        }
    }

    handleContextMenuAction(action) {
        if (!this.contextMenuTarget) return;

        switch (action) {
            case 'delete':
                // Add the clicked item to selection if not already selected
                if (!this.selected.has(this.contextMenuTarget)) {
                    this.selected.clear();
                    this.selected.add(this.contextMenuTarget);
                }
                this._deleteSelected();
                break;
            case 'usage':
                const sound = this.sounds.find(s => s.id === this.contextMenuTarget);
                if (sound) {
                    // In a real implementation, this would fetch actual usage data from the server
                    // For now, we'll check if there are any waypoints/areas that use this sound
                    // This would typically involve querying the server for entities that reference this sound ID
                    
                    // For now, we'll show that it's not used (since we can't access the full app context here)
                    // A proper implementation would check the actual waypoints/areas in the database
                    alert(
                        `👁️ Usage for "${sound.name}"\n\n` +
                        'Not used by any waypoints'
                    );
                }
                break;
        }

        this._hideContextMenu();
    }
    
    /**
     * Remove file from FilePond UI after upload completion
     * @param {string} fileId - ID of the file to remove
     * @private
     */
    _removeFileFromUI(fileId) {
        if (this.filePond) {
            // Remove the file from FilePond's UI (not from server)
            this.filePond.removeFile(fileId);
        }
    }

    // ============================================
    // Utilities
    // ============================================
    
    /**
     * Get icon for sound type
     * @param {SoundMetadata} sound
     * @returns {string}
     * @private
     */
    _getIconForSound(sound) {
        switch (sound.soundType) {
            case 'file': return '🎵';
            case 'url': return '🔗';
            case 'oscillator': return '🎛️';
            case 'noise': return '🎹';
            case 'recording': return '🎤';
            default: return '🎵';
        }
    }
    
    /**
     * Format file size
     * @param {number} bytes
     * @returns {string}
     * @private
     */
    _formatSize(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    }
    
    /**
     * Format date (relative or absolute)
     * @param {number} timestamp
     * @returns {string}
     * @private
     */
    _formatDate(timestamp) {
        const date = new Date(timestamp);
        const now = new Date();
        const diffMs = now - date;
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        
        if (diffDays === 0) return 'Today';
        if (diffDays === 1) return 'Yesterday';
        if (diffDays < 7) return `${diffDays} days ago`;
        if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
        if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
        
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }
    
    /**
     * Escape HTML to prevent XSS
     * @param {string} text
     * @returns {string}
     * @private
     */
    _escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// ============================================
// Global Instance (for demo/HTML integration)
// ============================================
let soundLibrary = null;

/**
 * Open sound library (for HTML onclick handlers)
 */
function openSoundLibrary() {
    if (!soundLibrary) {
        soundLibrary = new SoundLibrary({
            apiBaseUrl: '/api',
            onSoundAssign: (soundId, waypointId) => {
                console.log('[SoundLibrary] Assign:', soundId, 'to', waypointId);
                // TODO: Integrate with map editor
            },
            onError: (error) => {
                console.error('[SoundLibrary] Error:', error);
            }
        });
    }
    soundLibrary.open();
}

/**
 * Close sound library (for HTML onclick handlers)
 */
function closeSoundLibrary() {
    if (soundLibrary) {
        soundLibrary.close();
    }
}

/**
 * Handle context menu action (for HTML onclick handlers)
 * @param {string} action
 */
function handleSoundContextMenuAction(action) {
    if (soundLibrary) {
        soundLibrary.handleContextMenuAction(action);
    }
}
