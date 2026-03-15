const express = require('express');
const db = require('../database');
const authenticateToken = require('../middleware/auth');
const { soundscapeLimiter } = require('../middleware/rateLimiter');
const router = express.Router();

// Rate limit soundscape operations
router.use(soundscapeLimiter);

// Get all soundscapes for user
router.get('/', authenticateToken, async (req, res) => {
  try {
    const result = await db.query(
      'SELECT * FROM soundscapes WHERE user_id = $1 ORDER BY created_at DESC',
      [req.user.id]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('[Soundscapes] Get all error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get single soundscape with waypoints and behaviors
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const soundscapeResult = await db.query(
      'SELECT * FROM soundscapes WHERE id = $1 AND user_id = $2',
      [id, req.user.id]
    );

    if (soundscapeResult.rows.length === 0) {
      return res.status(404).json({ error: 'Soundscape not found' });
    }

    const waypointsResult = await db.query(
      'SELECT * FROM waypoints WHERE soundscape_id = $1 ORDER BY sort_order',
      [id]
    );

    const behaviorsResult = await db.query(
      'SELECT * FROM behaviors WHERE soundscape_id = $1 ORDER BY sort_order',
      [id]
    );

    res.json({
      soundscape: soundscapeResult.rows[0],
      waypoints: waypointsResult.rows,
      behaviors: behaviorsResult.rows
    });
  } catch (error) {
    console.error('[Soundscapes] Get single error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create soundscape
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { name, description } = req.body;

    const result = await db.query(
      'INSERT INTO soundscapes (user_id, name, description) VALUES ($1, $2, $3) RETURNING *',
      [req.user.id, name, description || '']
    );

    res.json({
      message: 'Soundscape created',
      soundscape: result.rows[0]
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

    const result = await db.query(
      'UPDATE soundscapes SET name = $1, description = $2, updated_at = NOW() WHERE id = $3 AND user_id = $4 RETURNING *',
      [name, description, id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Soundscape not found' });
    }

    res.json({
      message: 'Soundscape updated',
      soundscape: result.rows[0]
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

    const result = await db.query(
      'DELETE FROM soundscapes WHERE id = $1 AND user_id = $2 RETURNING *',
      [id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Soundscape not found' });
    }

    res.json({ message: 'Soundscape deleted' });
  } catch (error) {
    console.error('[Soundscapes] Delete error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Save full soundscape (waypoints + behaviors)
router.post('/:id/save', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { waypoints, behaviors } = req.body;

    const check = await db.query(
      'SELECT id FROM soundscapes WHERE id = $1 AND user_id = $2',
      [id, req.user.id]
    );
    if (check.rows.length === 0) {
      return res.status(404).json({ error: 'Soundscape not found' });
    }

    await db.query('UPDATE soundscapes SET updated_at = NOW() WHERE id = $1', [id]);

    // Save waypoints
    await db.query('DELETE FROM waypoints WHERE soundscape_id = $1', [id]);
    if (waypoints && waypoints.length > 0) {
      for (let i = 0; i < waypoints.length; i++) {
        const wp = waypoints[i];
        await db.query(
          `INSERT INTO waypoints (soundscape_id, name, lat, lon, sound_url, volume, loop, activation_radius, icon, color, sort_order)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
          [id, wp.name || 'Sound', wp.lat, wp.lon, wp.soundUrl, wp.volume || 0.8,
           wp.loop !== undefined ? wp.loop : true, wp.activationRadius || 20, wp.icon || '🎵', wp.color || '#00d9ff', i]
        );
      }
    }

    // Save behaviors
    await db.query('DELETE FROM behaviors WHERE soundscape_id = $1', [id]);
    if (behaviors && behaviors.length > 0) {
      for (let i = 0; i < behaviors.length; i++) {
        const b = behaviors[i];
        await db.query(
          `INSERT INTO behaviors (soundscape_id, type, member_ids, config_json, sort_order)
           VALUES ($1, $2, $3, $4, $5)`,
          [id, b.type, b.memberIds || [], b.config || {}, i]
        );
      }
    }

    res.json({ message: 'Soundscape saved' });
  } catch (error) {
    console.error('[Soundscapes] Save error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get soundscape last modified timestamp (Session 5E: Lightweight sync check)
router.get('/:id/modified', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await db.query(
      'SELECT updated_at FROM soundscapes WHERE id = $1 AND user_id = $2',
      [id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Soundscape not found' });
    }

    res.json({ lastModified: result.rows[0].updated_at.toISOString() });
  } catch (error) {
    console.error('[Soundscapes] Get modified error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
