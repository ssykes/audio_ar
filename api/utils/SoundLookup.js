/**
 * SoundLookup Utility
 * 
 * Provides functionality to map sound URLs to sound IDs for backward compatibility
 * when transitioning from sound_url to sound_id fields.
 */

class SoundLookup {
  /**
   * Constructor
   * @param {Object} db - Database connection object
   */
  constructor(db) {
    this.db = db;
  }

  /**
   * Get sound ID from sound URL
   * @param {string} soundUrl - The URL of the sound
   * @returns {string|null} The corresponding sound_id or null if not found
   */
  async getSoundIdFromUrl(soundUrl) {
    if (!soundUrl || typeof soundUrl !== 'string' || soundUrl.trim() === '') {
      return null;
    }

    try {
      // Query the sounds table to find a matching sound by URL
      // The sounds table stores URLs in the 'url' column
      const result = await this.db.query(
        'SELECT id FROM sounds WHERE url = $1 LIMIT 1',
        [soundUrl.trim()]
      );

      if (result.rows && result.rows.length > 0) {
        return result.rows[0].id;
      }

      // If not found by URL, also try to find by filepath (for local files)
      const fileResult = await this.db.query(
        'SELECT id FROM sounds WHERE file_path = $1 LIMIT 1',
        [soundUrl.trim()]
      );

      if (fileResult.rows && fileResult.rows.length > 0) {
        return fileResult.rows[0].id;
      }

      // If not found in sounds table, return null
      return null;
    } catch (error) {
      console.error('[SoundLookup] Error finding sound ID from URL:', error);
      return null; // Return null on error to not break the flow
    }
  }

  /**
   * Batch lookup of sound IDs from URLs
   * @param {string[]} soundUrls - Array of sound URLs
   * @returns {Object} Map of URL to ID
   */
  async getSoundIdsFromUrls(soundUrls) {
    if (!Array.isArray(soundUrls) || soundUrls.length === 0) {
      return {};
    }

    // Remove duplicates and empty values
    const uniqueUrls = [...new Set(soundUrls.filter(url => url && typeof url === 'string'))];
    
    if (uniqueUrls.length === 0) {
      return {};
    }

    try {
      // Build query for multiple URLs
      const placeholders = uniqueUrls.map((_, i) => `$${i + 1}`).join(',');
      const query = `SELECT id, url, file_path FROM sounds WHERE url IN (${placeholders}) OR file_path IN (${placeholders})`;
      
      const result = await this.db.query(query, [...uniqueUrls, ...uniqueUrls]);
      
      // Create a map from the results
      const urlToIdMap = {};
      
      result.rows.forEach(row => {
        if (row.url) {
          urlToIdMap[row.url] = row.id;
        }
        if (row.file_path) {
          urlToIdMap[row.file_path] = row.id;
        }
      });
      
      return urlToIdMap;
    } catch (error) {
      console.error('[SoundLookup] Error finding sound IDs from URLs:', error);
      return {}; // Return empty map on error
    }
  }
}

module.exports = SoundLookup;