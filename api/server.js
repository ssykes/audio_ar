const express = require('express');
const cors = require('cors');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const soundscapeRoutes = require('./routes/soundscapes');
const soundRoutes = require('./routes/sounds');

const app = express();
const PORT = process.env.PORT || 3000;

// Trust proxy (required when behind Apache/nginx reverse proxy)
// Commenting out to avoid rate limiter security warning
// app.set('trust proxy', true);

app.use(cors());
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/soundscapes', soundscapeRoutes);
app.use('/api/sounds', soundRoutes);

app.get('/api/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

app.use((err, req, res, next) => {
  console.error('[Server] Error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`[Server] Audio AR API running on port ${PORT}`);
});
