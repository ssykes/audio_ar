const rateLimit = require('express-rate-limit');

// Rate limiter for soundscape operations
const soundscapeLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 30, // 30 operations per minute
  message: { error: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
  trustProxy: true,
});

// Custom rate limiter for auth endpoints (only counts failed logins)
const failedLoginAttempts = new Map(); // Key: email|ip, Value: { count, resetTime }

const authLimiter = (req, res, next) => {
  // Only apply to login endpoint
  if (req.path !== '/login' || req.method !== 'POST') {
    return next();
  }

  const email = (req.body.email || '').toLowerCase().trim();
  const ip = req.ip || req.connection.remoteAddress;
  const key = `${email}|${ip}`;
  const now = Date.now();

  // Clean up expired entries
  for (const [mapKey, data] of failedLoginAttempts.entries()) {
    if (now > data.resetTime) {
      failedLoginAttempts.delete(mapKey);
    }
  }

  // Check if rate limited
  const entry = failedLoginAttempts.get(key);
  if (entry && entry.count >= 5) {
    const retryAfter = Math.ceil((entry.resetTime - now) / 1000);
    res.set('Retry-After', retryAfter.toString());
    return res.status(429).json({ error: 'Too many failed login attempts, please try again later' });
  }

  // Store original json method to intercept response
  const originalJson = res.json;
  res.json = function(data) {
    // If login was successful (has token), reset counter
    if (data.token) {
      failedLoginAttempts.delete(key);
      console.log(`[RateLimiter] ✅ Successful login for ${email} - reset counter`);
    }
    // If failed login, increment counter
    else if (data.error === 'Invalid credentials') {
      const existing = failedLoginAttempts.get(key) || { count: 0, resetTime: now + (15 * 60 * 1000) };
      existing.count++;
      failedLoginAttempts.set(key, existing);
      console.log(`[RateLimiter] ⚠️ Failed login for ${email} - attempt ${existing.count}/5`);
    }
    originalJson.call(this, data);
  };

  next();
};

// Cleanup old entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, data] of failedLoginAttempts.entries()) {
    if (now > data.resetTime) {
      failedLoginAttempts.delete(key);
    }
  }
}, 5 * 60 * 1000);

module.exports = { authLimiter, soundscapeLimiter };
