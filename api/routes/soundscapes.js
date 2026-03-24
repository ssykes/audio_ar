const express = require('express');
const authenticateToken = require('../middleware/auth');
const { soundscapeLimiter } = require('../middleware/rateLimiter');
const SoundScapeRepository = require('../repositories/SoundScapeRepository');
const db = require('../database');
const router = express.Router();

const repo = new SoundScapeRepository(db);

// Rate limit soundscape operations
router.use(soundscapeLimiter);

// Get all soundscapes for user
router.get('/', authenticateToken, async (req, res) => {
  try {
    const soundscapes = await repo.getAllForUser(req.user.id);
    res.json(soundscapes);
  } catch (error) {
    console.error('[Soundscapes] Get all error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get single soundscape with waypoints and behaviors
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const full = await repo.getFull(id, req.user.id);

    if (!full) {
      return res.status(404).json({ error: 'Soundscape not found' });
    }

    res.json(full);
  } catch (error) {
    console.error('[Soundscapes] Get single error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create soundscape
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { name, description } = req.body;

    const soundscape = await repo.createWithWaypoints(
      { userId: req.user.id, name, description },
      [], // No waypoints initially
      []  // No behaviors initially
    );

    res.json({
      message: 'Soundscape created',
      soundscape: soundscape.soundscape
    });
  } catch (error) {
    console.error('[Soundscapes] Create error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update soundscape
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description } = req.body;

    const updated = await repo.update(id, { name, description });

    if (!updated) {
      return res.status(404).json({ error: 'Soundscape not found' });
    }

    res.json({
      message: 'Soundscape updated',
      soundscape: updated
    });
  } catch (error) {
    console.error('[Soundscapes] Update error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete soundscape
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const deleted = await repo.delete(id);

    if (!deleted) {
      return res.status(404).json({ error: 'Soundscape not found' });
    }

    res.json({ message: 'Soundscape deleted' });
  } catch (error) {
    console.error('[Soundscapes] Delete error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Save full soundscape (waypoints + behaviors + areas)
router.post('/:id/save', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { waypoints, behaviors, areas } = req.body;

    console.log(`[Soundscapes] Save request for ${id}:`);
    console.log(`  - waypoints: ${waypoints?.length || 0}`);
    console.log(`  - behaviors: ${behaviors?.length || 0}`);
    console.log(`  - areas: ${areas?.length || 0}`);
    if (areas && areas.length > 0) {
      console.log(`  - First area:`, JSON.stringify(areas[0], null, 2));
    }

    // Verify ownership
    const soundscape = await repo.findById(id);
    if (!soundscape || soundscape.user_id !== req.user.id) {
      return res.status(404).json({ error: 'Soundscape not found' });
    }

    // Save waypoints, behaviors, and areas (transactional)
    const full = await repo.saveFull(id, waypoints || [], behaviors || [], areas || []);

    console.log(`[Soundscapes] Saved ${id}: ${full.waypoints.length} waypoints, ${full.behaviors.length} behaviors, ${full.areas.length} areas`);
    if (full.areas.length > 0) {
      console.log(`[Soundscapes] First saved area ID:`, full.areas[0].id);
    }

    res.json({ message: 'Soundscape saved', soundscape: full });
  } catch (error) {
    console.error('[Soundscapes] Save error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get soundscape last modified timestamp (Session 5E: Lightweight sync check)
router.get('/:id/modified', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const soundscape = await repo.findById(id);
    if (!soundscape || soundscape.user_id !== req.user.id) {
      return res.status(404).json({ error: 'Soundscape not found' });
    }

    res.json({ lastModified: soundscape.updated_at.toISOString() });
  } catch (error) {
    console.error('[Soundscapes] Get modified error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
