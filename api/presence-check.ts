import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * Vercel Serverless Function: WiFi-based presence detection.
 * Compares the client's public IP against known venue WiFi IPs.
 * GET /api/presence-check → { onsite: boolean, method: 'wifi', configured: boolean }
 */
export default function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const venueIps = new Set(
    (process.env.VENUE_PUBLIC_IPS || '')
      .split(',')
      .map((ip) => ip.trim())
      .filter(Boolean)
  );

  if (venueIps.size === 0) {
    res.json({ onsite: false, method: 'wifi', configured: false });
    return;
  }

  // Support X-Forwarded-For for reverse proxies (Vercel edge)
  const forwarded = req.headers['x-forwarded-for'];
  const clientIp =
    typeof forwarded === 'string'
      ? forwarded.split(',')[0].trim()
      : req.socket?.remoteAddress || '';

  const onsite = venueIps.has(clientIp);
  res.json({ onsite, method: 'wifi', configured: true });
}
