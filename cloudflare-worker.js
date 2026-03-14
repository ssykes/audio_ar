// Cloudflare Worker to Add Security Headers
// Deploy to: https://dash.cloudflare.com/?to=/:account/workers-and-pages/create
//
// Instructions:
// 1. Go to Cloudflare Dashboard → Workers & Pages → Create
// 2. Name: "security-headers-spoot" (or your choice)
// 3. Paste this code into the editor
// 4. Click "Save and Deploy"
// 5. Go to your site (spoot.wtf) → Rules → Workers Routes
// 6. Add route: spoot.wtf/* → Select your worker
//
// Alternative: Use Wrangler CLI
//   npm install -g wrangler
//   wrangler login
//   wrangler init security-headers-spoot
//   Replace worker.js content with this file
//   wrangler deploy

addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})

async function handleRequest(request) {
  const url = new URL(request.url)
  
  // Only add security headers to HTML pages (not assets like images, CSS, etc.)
  const isHTMLPage = url.pathname.endsWith('.html') || url.pathname === '/'
  
  // Fetch the original response from your origin server
  const response = await fetch(request)
  
  // If not an HTML page, return as-is (no need for security headers on assets)
  if (!isHTMLPage) {
    return response
  }
  
  // Create a new response with modified headers
  const newResponse = new Response(response.body, response)
  
  // Copy over all original headers except the ones we're replacing
  response.headers.forEach((value, key) => {
    // Skip headers that Cloudflare manages or that we're overriding
    if (!['content-security-policy', 'strict-transport-security', 'x-content-type-options', 
          'x-frame-options', 'referrer-policy', 'cross-origin-opener-policy', 
          'cross-origin-embedder-policy', 'cross-origin-resource-policy', 'permissions-policy']
        .includes(key.toLowerCase())) {
      newResponse.headers.set(key, value)
    }
  })
  
  // Add Security Headers
  
  // Content Security Policy (CSP)
  // Allows: same-origin scripts, CDN resources (unpkg, jsdelivr), Google Fonts,
  // data: images, blob: media, and necessary APIs
  // Updated 2026-03-14: Added tile.openstreetmap.org for map tiles
  newResponse.headers.set('Content-Security-Policy',
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline' https://unpkg.com https://cdn.jsdelivr.net https://cdnjs.cloudflare.com; " +
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
    "font-src 'self' https://fonts.gstatic.com; " +
    "img-src 'self' data: blob: https: https://tile.openstreetmap.org https://*.tile.openstreetmap.org; " +
    "media-src 'self' blob:; " +
    "connect-src 'self' https://api.openstreetmap.org https://nominatim.openstreetmap.org https://spoot.wtf http://macminiwebsever:3000 https://tile.openstreetmap.org https://*.tile.openstreetmap.org; " +
    "frame-ancestors 'self';"
  )
  
  // Strict Transport Security (HSTS) - 1 year with subdomains and preload
  newResponse.headers.set('Strict-Transport-Security', 
    'max-age=31536000; includeSubDomains; preload'
  )
  
  // X-Content-Type-Options - Prevent MIME type sniffing
  newResponse.headers.set('X-Content-Type-Options', 'nosniff')
  
  // X-Frame-Options - Prevent clickjacking (also covered by CSP frame-ancestors)
  newResponse.headers.set('X-Frame-Options', 'SAMEORIGIN')
  
  // Referrer Policy - Control referrer information
  newResponse.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  
  // Cross-Origin Opener Policy - Isolate browsing context
  newResponse.headers.set('Cross-Origin-Opener-Policy', 'same-origin')
  
  // Cross-Origin Embedder Policy - Require CORS for cross-origin resources
  newResponse.headers.set('Cross-Origin-Embedder-Policy', 'require-corp')
  
  // Cross-Origin Resource Policy - Restrict resource loading to same origin
  newResponse.headers.set('Cross-Origin-Resource-Policy', 'same-origin')
  
  // Permissions Policy (formerly Feature-Policy)
  // Restricts powerful APIs to same-origin only
  newResponse.headers.set('Permissions-Policy', 
    'geolocation=(self), ' +
    'microphone=(self), ' +
    'camera=(), ' +
    'accelerometer=(), ' +
    'gyroscope=(self), ' +
    'magnetometer=(), ' +
    'payment=(), ' +
    'usb=()'
  )
  
  return newResponse
}
