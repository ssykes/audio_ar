const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const authenticateToken = require('../middleware/auth');
const { soundscapeLimiter } = require('../middleware/rateLimiter'); // Reuse existing limiter
const SoundRepository = require('../repositories/SoundRepository');
const db = require('../database');
const router = express.Router();

// Utility function to generate a 6-character base36 string
function generateBase36Prefix(length = 6) {
  const chars = '0123456789abcdefghijklmnopqrstuvwxyz';
  let result = '';
  const randomBytes = crypto.randomBytes(length);
  
  for (let i = 0; i < length; i++) {
    result += chars[randomBytes[i] % chars.length];
  }
  
  return result;
}

const repo = new SoundRepository(db);

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    // Explicitly define the destination directory, ignoring any path info in the filename
    // Use absolute path to ensure it works regardless of where the server is running from
    const uploadDir = path.join(__dirname, '..', '..', 'sounds');
    
    // Ensure the directory exists
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    // Sanitize the original filename to remove potentially dangerous characters
    const sanitizedOriginalName = file.originalname.replace(/[^a-zA-Z0-9_.-]/g, '_');

    // Extract file extension and basename
    const ext = path.extname(sanitizedOriginalName);
    const basename = path.basename(sanitizedOriginalName, ext);

    // Generate a temporary filename with 6-character base36 prefix (will be renamed after DB record is created)
    const tempId = 'temp_' + generateBase36Prefix(6);
    const tempFilename = `${tempId}_${basename}${ext}`;

    cb(null, tempFilename);
  }
});
const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB limit
  },
  fileFilter: function (req, file, cb) {
    // Allow common audio formats
    const allowedTypes = /mp3|wav|ogg|m4a|flac|aac|opus/;
    const ext = allowedTypes.test(file.originalname.toLowerCase());
    const mime = allowedTypes.test(file.mimetype);

    if (ext || mime) {
      cb(null, true);
    } else {
      cb(new Error('Only audio files are allowed'));
    }
  }
});

// Rate limit sounds operations
router.use(soundscapeLimiter);

// GET /api/sounds - Get all sounds for the authenticated user
router.get('/', authenticateToken, async (req, res) => {
  try {
    const sounds = await repo.getAllForUser(req.user.id);
    res.json(sounds.map(sound => sound.toApiFormat()));
  } catch (error) {
    console.error('[Sounds] Get all error:', error);
    res.status(500).json({ 
      error: 'Failed to retrieve sounds',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// POST /api/sounds/upload - Upload a new sound file
router.post('/upload', authenticateToken, upload.single('sound'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // The filename is already sanitized by the Multer storage configuration
    const tempFilePath = path.join('/sounds', req.file.filename);

    const newSound = await repo.create({
      userId: req.user.id,
      name: req.file.originalname,
      type: 'file',
      filepath: tempFilePath, // Store the temporary path initially
      fileSize: req.file.size,
      duration: null, // Will be calculated later if possible
      configJson: {} // Provide default empty object for config_json
    });

    // Generate a 6-character base36 prefix for the final filename
    const base36Prefix = generateBase36Prefix(6);
    const ext = path.extname(req.file.filename);
    const newFileName = `${base36Prefix}_${path.basename(req.file.originalname, ext)}${ext}`;
    const newFilePath = path.join(__dirname, '..', '..', 'sounds', newFileName);
    const oldFilePath = path.join(__dirname, '..', '..', 'sounds', req.file.filename);

    // Rename the file to use the base36 prefix
    fs.renameSync(oldFilePath, newFilePath);

    // Update the record in the database with the new file path
    const updatedSound = await repo.update(newSound.id, {
      filepath: `/sounds/${newFileName}`
    }, req.user.id);

    res.status(201).json(updatedSound.toApiFormat());
  } catch (error) {
    console.error('[Sounds] Upload error:', error);
    res.status(500).json({
      error: 'Failed to upload sound',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// DELETE /api/sounds/:id - Delete a sound by ID
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    // Check if sound is being used by any waypoints
    const usageCount = await repo.countWaypointUsage(id);
    if (usageCount > 0) {
      return res.status(400).json({
        error: `Cannot delete sound: it is used by ${usageCount} waypoints`
      });
    }

    // First get the sound to retrieve its file path
    const sound = await repo.getByIdAndUser(id, req.user.id);
    if (!sound) {
      return res.status(404).json({ error: 'Sound not found or not owned by user' });
    }

    // Delete the physical file first, before deleting the database record
    try {
      const filePath = path.join(__dirname, '..', '..', sound.filepath);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (fileError) {
      console.error('[Sounds] Failed to delete physical file:', fileError);
      return res.status(500).json({
        error: 'Failed to delete sound file',
        details: process.env.NODE_ENV === 'development' ? fileError.message : undefined
      });
    }

    // Only delete the database record if the file deletion was successful
    const deleted = await repo.delete(id, req.user.id);

    if (!deleted) {
      return res.status(404).json({ error: 'Sound not found or not owned by user' });
    }

    res.status(204).send();
  } catch (error) {
    console.error('[Sounds] Delete error:', error);
    res.status(500).json({ 
      error: 'Failed to delete sound',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// PUT /api/sounds/:id/rename - Rename a sound
router.put('/:id/rename', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { name } = req.body;

    // Validate input
    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }

    const trimmedName = name.toString().trim();

    if (trimmedName.length === 0) {
      return res.status(400).json({ error: 'Name cannot be empty' });
    }

    if (trimmedName.length > 255) {
      return res.status(400).json({ error: 'Name cannot exceed 255 characters' });
    }

    // Additional validation: Check for potentially dangerous characters or file paths
    if (trimmedName.includes('..') || trimmedName.includes('/') || trimmedName.includes('\\')) {
      return res.status(400).json({ error: 'Name contains invalid characters' });
    }

    const updated = await repo.update(id, { name: trimmedName }, req.user.id);

    if (!updated) {
      return res.status(404).json({ error: 'Sound not found' });
    }

    res.json(updated.toApiFormat());
  } catch (error) {
    console.error('[Sounds] Rename error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/waypoints/:id/sound - Assign a sound to a waypoint
router.put('/waypoints/:id/sound', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params; // waypoint id
    const { soundId } = req.body;

    // Validate input
    if (!soundId) {
      return res.status(400).json({ error: 'Sound ID is required for assignment' });
    }

    // Verify that the waypoint belongs to the user's soundscape
    // First, find the waypoint and its associated soundscape
    const waypointResult = await db.queryOne(
      `SELECT w.id, s.user_id 
       FROM waypoints w 
       JOIN soundscapes s ON w.soundscape_id = s.id 
       WHERE w.id = $1`, 
      [id]
    );

    if (!waypointResult || waypointResult.user_id !== req.user.id) {
      return res.status(404).json({ error: 'Waypoint not found or not owned by user' });
    }

    // Verify that the sound belongs to the same user
    const sound = await repo.getByIdAndUser(soundId, req.user.id);
    if (!sound) {
      return res.status(404).json({ error: 'Sound not found or not owned by user' });
    }

    // Update the waypoint with the new sound ID
    const result = await db.queryOne(
      `UPDATE waypoints 
       SET sound_id = $1 
       WHERE id = $2 
       RETURNING *`,
      [soundId, id]
    );

    if (!result) {
      return res.status(404).json({ error: 'Waypoint not found' });
    }

    res.json(result);
  } catch (error) {
    console.error('[Sounds] Assign sound to waypoint error:', error);
    res.status(500).json({ 
      error: 'Failed to assign sound to waypoint',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// GET /api/sounds/:id - Get a specific sound by ID
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    // Verify that the sound belongs to the user
    const sound = await repo.getByIdAndUser(id, req.user.id);
    if (!sound) {
      return res.status(404).json({ error: 'Sound not found or not owned by user' });
    }

    res.json(sound.toApiFormat());
  } catch (error) {
    console.error('[Sounds] Get by ID error:', error);
    res.status(500).json({
      error: 'Failed to retrieve sound',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// GET /api/sounds/:id/usage - Get usage information for a sound
router.get('/:id/usage', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    // Verify that the sound belongs to the user
    const sound = await repo.getByIdAndUser(id, req.user.id);
    if (!sound) {
      return res.status(404).json({ error: 'Sound not found or not owned by user' });
    }

    // Get all waypoints using this sound
    const waypoints = await db.query(
      `SELECT id, name
       FROM waypoints
       WHERE sound_id = $1`,
      [id]
    );

    res.json({
      count: waypoints.length,
      waypoints: waypoints.map(wp => ({
        id: wp.id,
        name: wp.name
      }))
    });
  } catch (error) {
    console.error('[Sounds] Get usage error:', error);
    res.status(500).json({
      error: 'Failed to retrieve sound usage information',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

module.exports = router;