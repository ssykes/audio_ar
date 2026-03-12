/**
 * Wake Lock Helper
 * Prevents screen from sleeping during audio playback
 * @version 1.0
 * @description Extracted from single_sound_v2.html for reuse
 * 
 * TODO Session_2: Add visibilitychange handler to re-acquire wake lock
 * when user returns to tab (phone woke up and back)
 */

const WakeLockHelper = {
    wakeLock: null,
    isActive: false,

    /**
     * Request screen wake lock to prevent sleep
     * MUST be called from direct user gesture (click handler)
     * @returns {Promise<boolean>} Success status
     */
    async request() {
        try {
            if ('wakeLock' in navigator) {
                this.wakeLock = await navigator.wakeLock.request('screen');
                this.isActive = true;
                
                this.wakeLock.addEventListener('release', () => {
                    console.log('💡 Wake lock released');
                    this.isActive = false;
                });
                
                console.log('💡 Screen wake lock enabled');
                return true;
            } else {
                console.warn('⚠️ Wake Lock API not supported - screen may sleep');
                return false;
            }
        } catch (err) {
            console.error(`⚠️ Wake lock failed: ${err.message}`);
            return false;
        }
    },

    /**
     * Release wake lock
     */
    async release() {
        if (this.wakeLock) {
            await this.wakeLock.release();
            this.wakeLock = null;
            this.isActive = false;
            console.log('💡 Wake lock released');
        }
    }
};
