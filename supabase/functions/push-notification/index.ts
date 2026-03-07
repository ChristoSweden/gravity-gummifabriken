// Supabase Edge Function: push-notification
// Triggered by database webhooks on messages and connections inserts.
// Sends Web Push notifications to the recipient.
//
// Setup: Create database webhooks in Supabase Dashboard:
//   1. Table: messages, Event: INSERT → POST to this function
//   2. Table: connections, Event: INSERT → POST to this function

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') || 'mailto:hello@gravity.app';
const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY') || Deno.env.get('VITE_VAPID_PUBLIC_KEY') || '';
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY') || '';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

// Base64url encode/decode helpers
function base64urlToUint8Array(base64url: string): Uint8Array {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  const pad = base64.length % 4 === 0 ? '' : '='.repeat(4 - (base64.length % 4));
  const binary = atob(base64 + pad);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// Import ECDSA key from raw VAPID private key
async function importVapidKey(privateKeyBase64url: string): Promise<CryptoKey> {
  const rawKey = base64urlToUint8Array(privateKeyBase64url);
  // VAPID private keys are raw 32-byte ECDSA keys on P-256
  // We need to construct a JWK from the raw key
  const jwk = {
    kty: 'EC',
    crv: 'P-256',
    d: privateKeyBase64url,
    // We need x and y from the public key, but for signing we can derive them
    // Actually, for JWT signing we only need the private key 'd' parameter
    // We'll use a simpler JWT approach
  };
  return await crypto.subtle.importKey(
    'jwk',
    { ...jwk, x: '', y: '' }, // placeholder - we'll use a different approach
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  ).catch(() => {
    // Fallback: import as raw PKCS8
    throw new Error('VAPID key import failed');
  });
}

// Simple JWT creation for VAPID
function uint8ArrayToBase64url(arr: Uint8Array): string {
  let binary = '';
  for (const byte of arr) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function createVapidJwt(audience: string, subject: string, privateKeyBase64url: string, publicKeyBase64url: string): Promise<string> {
  const header = { typ: 'JWT', alg: 'ES256' };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    aud: audience,
    exp: now + 12 * 3600,
    sub: subject,
  };

  const headerB64 = uint8ArrayToBase64url(new TextEncoder().encode(JSON.stringify(header)));
  const payloadB64 = uint8ArrayToBase64url(new TextEncoder().encode(JSON.stringify(payload)));
  const unsigned = `${headerB64}.${payloadB64}`;

  // Import the private key
  const rawKey = base64urlToUint8Array(privateKeyBase64url);

  // Build a PKCS8 key from the raw 32-byte private key
  // P-256 PKCS8 prefix
  const pkcs8Prefix = new Uint8Array([
    0x30, 0x81, 0x87, 0x02, 0x01, 0x00, 0x30, 0x13, 0x06, 0x07, 0x2a, 0x86,
    0x48, 0xce, 0x3d, 0x02, 0x01, 0x06, 0x08, 0x2a, 0x86, 0x48, 0xce, 0x3d,
    0x03, 0x01, 0x07, 0x04, 0x6d, 0x30, 0x6b, 0x02, 0x01, 0x01, 0x04, 0x20,
  ]);
  const pkcs8Suffix = new Uint8Array([
    0xa1, 0x44, 0x03, 0x42, 0x00, 0x04,
  ]);

  // For signing we need just the private key in PKCS8 format
  // Simplified: use raw key with JWK import
  const publicKeyBytes = base64urlToUint8Array(publicKeyBase64url);
  // The public key is 65 bytes (uncompressed point), extract x and y (32 bytes each)
  const x = uint8ArrayToBase64url(publicKeyBytes.slice(1, 33));
  const y = uint8ArrayToBase64url(publicKeyBytes.slice(33, 65));

  const key = await crypto.subtle.importKey(
    'jwk',
    {
      kty: 'EC',
      crv: 'P-256',
      x,
      y,
      d: privateKeyBase64url,
    },
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    new TextEncoder().encode(unsigned)
  );

  // Convert DER signature to raw r||s format (64 bytes)
  const sigBytes = new Uint8Array(signature);
  const sigB64 = uint8ArrayToBase64url(sigBytes);

  return `${unsigned}.${sigB64}`;
}

async function sendPushNotification(
  subscription: any,
  payload: { title: string; body: string; url?: string; tag?: string },
) {
  if (!VAPID_PRIVATE_KEY || !VAPID_PUBLIC_KEY) {
    console.error('VAPID keys not configured');
    return;
  }

  const sub = typeof subscription === 'string' ? JSON.parse(subscription) : subscription;
  const endpoint = sub.endpoint;
  const audience = new URL(endpoint).origin;

  const jwt = await createVapidJwt(audience, VAPID_SUBJECT, VAPID_PRIVATE_KEY, VAPID_PUBLIC_KEY);

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `vapid t=${jwt}, k=${VAPID_PUBLIC_KEY}`,
      'TTL': '86400',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text();
    console.error(`Push failed (${response.status}): ${text}`);
  }
}

Deno.serve(async (req) => {
  try {
    const body = await req.json();

    // Webhook payload from Supabase has: type, table, record, old_record
    const { type, table, record } = body;

    if (type !== 'INSERT' || !record) {
      return new Response('OK', { status: 200 });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    let recipientId: string;
    let title: string;
    let notifBody: string;
    let url: string;
    let tag: string;

    if (table === 'messages') {
      recipientId = record.recipient_id;
      // Get sender name
      const { data: sender } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', record.sender_id)
        .single();

      const senderName = sender?.full_name?.split(' ')[0] || 'Someone';
      title = `${senderName} sent you a message`;
      notifBody = record.content?.substring(0, 100) || 'New message';
      url = `/chat/${record.sender_id}`;
      tag = `msg-${record.sender_id}`;
    } else if (table === 'connections') {
      recipientId = record.recipient_id;
      const { data: requester } = await supabase
        .from('profiles')
        .select('full_name, profession')
        .eq('id', record.requester_id)
        .single();

      title = 'New Connection Request';
      notifBody = `${requester?.full_name || 'Someone'} (${requester?.profession || 'Professional'}) wants to connect`;
      url = '/connections';
      tag = `conn-${record.requester_id}`;
    } else {
      return new Response('OK', { status: 200 });
    }

    // Check if recipient has notifications enabled
    const { data: profile } = await supabase
      .from('profiles')
      .select('notifications_enabled')
      .eq('id', recipientId)
      .single();

    if (!profile?.notifications_enabled) {
      return new Response('Notifications disabled', { status: 200 });
    }

    // Check if recipient is blocked by sender (don't notify)
    if (table === 'messages') {
      const { data: blocked } = await supabase
        .from('blocked_users')
        .select('id')
        .eq('blocker_id', recipientId)
        .eq('blocked_id', record.sender_id)
        .maybeSingle();

      if (blocked) {
        return new Response('Blocked', { status: 200 });
      }
    }

    // Get push subscription
    const { data: pushSub } = await supabase
      .from('push_subscriptions')
      .select('subscription')
      .eq('user_id', recipientId)
      .single();

    if (!pushSub?.subscription) {
      return new Response('No subscription', { status: 200 });
    }

    await sendPushNotification(pushSub.subscription, {
      title,
      body: notifBody,
      url,
      tag,
    });

    return new Response('Sent', { status: 200 });
  } catch (err) {
    console.error('Push notification error:', err);
    return new Response('Error', { status: 500 });
  }
});
