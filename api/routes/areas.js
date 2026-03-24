/**
 * Areas Routes
 * Handles CRUD operations for areas (polygon sound zones)
 *
 * Endpoints:
 * - GET /api/soundscapes/:soundscapeId/areas - Get all areas for a soundscape
 * - PUT /api/soundscapes/:soundscapeId/areas - Sync all areas (upsert)
 * - POST /api/soundscapes/:soundscapeId/areas - Create/update single area
 * - DELETE /api/soundscapes/:soundscapeId/areas/:id - Delete area
 */

const express = require('express');
const router = express.Router();
const AreaRepository = require('../repositories/AreaRepository');
const authenticate = require('../middleware/auth');
const db = require('../database');

const repo = new AreaRepository(db);

/**
 * GET /api/soundscapes/:soundscapeId/areas
 * Get all areas for a soundscape
 */
router.get('/soundscapes/:soundscapeId/areas', authenticate, async (req, res) => {
  try {
    const { soundscapeId } = req.params;
    const areas = await repo.findBySoundscape(soundscapeId);
    res.json({ areas });
  } catch (error) {
    console.error('[Areas API] Error loading areas:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /api/soundscapes/:soundscapeId/areas
 * Sync all areas for a soundscape (upsert - replaces all)
 */
router.put('/soundscapes/:soundscapeId/areas', authenticate, async (req, res) => {
  try {
    const { soundscapeId } = req.params;
    const { areas } = req.body;

    if (!Array.isArray(areas)) {
      return res.status(400).json({ error: 'Areas must be an array' });
    }

    // Delete existing areas
    await repo.deleteBySoundscape(soundscapeId);

    // Insert new areas
    const inserted = await repo.insertBatch(soundscapeId, areas);

    console.log(`[Areas API] Synced ${inserted.length} area(s) for soundscape ${soundscapeId}`);
    res.json({ areas: inserted });
  } catch (error) {
    console.error('[Areas API] Error syncing areas:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/soundscapes/:soundscapeId/areas
 * Create or update a single area
 */
router.post('/soundscapes/:soundscapeId/areas', authenticate, async (req, res) => {
  try {
    const { soundscapeId } = req.params;
    const areaData = req.body;

    // Add soundscapeId to area
    const area = { ...areaData, soundscapeId };

    // Insert area
    const inserted = await repo.insertBatch(soundscapeId, [area]);

    console.log(`[Areas API] Created area: ${inserted[0].id} (${inserted[0].name})`);
    res.json({ area: inserted[0] });
  } catch (error) {
    console.error('[Areas API] Error creating area:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/soundscapes/:soundscapeId/areas/:id
 * Delete a single area
 */
router.delete('/soundscapes/:soundscapeId/areas/:id', authenticate, async (req, res) => {
  try {
    const { soundscapeId, id } = req.params;

    // Delete area by ID
    const result = await repo.deleteOne(id, soundscapeId);

    if (!result) {
      return res.status(404).json({ error: 'Area not found' });
    }

    console.log(`[Areas API] Deleted area: ${id}`);
    res.json({ success: true });
  } catch (error) {
    console.error('[Areas API] Error deleting area:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
