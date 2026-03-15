const rateLimit = require('express-rate-limit');

// Rate limiter for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 requests per windowMs
  message: { error: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
  trustProxy: true, // Required when behind Apache/nginx reverse proxy
});

// Rate limiter for soundscape operations
const soundscapeLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 30, // 30 operations per minute
  message: { error: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
  trustProxy: true, // Required when behind Apache/nginx reverse proxy
});

module.exports = { authLimiter, soundscapeLimiter };
