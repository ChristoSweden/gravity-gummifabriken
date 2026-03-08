import express from 'express';
import {createServer as createViteServer} from 'vite';
import path from 'path';
import {fileURLToPath} from 'url';

// __dirname equivalent for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── Simple in-memory rate limiter ──
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const RATE_LIMIT_MAX = 120; // requests per window

function rateLimit(req: express.Request, res: express.Response, next: express.NextFunction) {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return next();
  }

  entry.count++;
  if (entry.count > RATE_LIMIT_MAX) {
    res.status(429).json({ error: 'Too many requests. Please try again later.' });
    return;
  }
  next();
}

// Periodically clean up stale entries (every 5 minutes)
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimitMap) {
    if (now > entry.resetAt) rateLimitMap.delete(ip);
  }
}, 300_000);

async function startServer() {
  const app = express();
  const PORT = parseInt(process.env.PORT || '3000', 10);

  // Rate limiting
  app.use(rateLimit);

  // Derive Supabase project URL from env for tight CSP
  const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
  const supabaseHost = supabaseUrl ? new URL(supabaseUrl).hostname : '*.supabase.co';
  const connectSrc = supabaseUrl
    ? `'self' https://${supabaseHost} wss://${supabaseHost} https://va.vercel-scripts.com`
    : "'self' https://*.supabase.co wss://*.supabase.co https://va.vercel-scripts.com";

  // Security headers
  app.use((req, res, next) => {
    res.setHeader('Content-Security-Policy', [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' https://va.vercel-scripts.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      `img-src 'self' data: blob: https://${supabaseHost}`,
      `connect-src ${connectSrc}`,
      "worker-src 'self'",
      "frame-ancestors 'none'",
    ].join('; '));
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'geolocation=(self), camera=(), microphone=()');
    next();
  });

  // ── Venue WiFi presence detection ──
  // Comma-separated public IPs of the venue WiFi (set after visiting whatismyip.com on-site)
  const venueIps = new Set(
    (process.env.VENUE_PUBLIC_IPS || '')
      .split(',')
      .map(ip => ip.trim())
      .filter(Boolean)
  );

  // API routes FIRST
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // WiFi-based presence check — compares client IP against known venue IPs
  app.get('/api/presence-check', (req, res) => {
    if (venueIps.size === 0) {
      res.json({ onsite: false, method: 'wifi', configured: false });
      return;
    }
    // Support X-Forwarded-For for reverse proxies (Vercel, nginx, etc.)
    const forwarded = req.headers['x-forwarded-for'];
    const clientIp = typeof forwarded === 'string'
      ? forwarded.split(',')[0].trim()
      : req.socket.remoteAddress || '';
    const onsite = venueIps.has(clientIp);
    res.json({ onsite, method: 'wifi', configured: true });
  });

  // Serve static assets in production
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  } else {
    // Vite middleware for development
    const vite = await createViteServer({
      server: {middlewareMode: true},
      appType: 'spa',
    });
    app.use(vite.middlewares);

    // Serve index.html as fallback for all non-API routes in development
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(__dirname, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
