import { createClient } from '@supabase/supabase-js';
import { captureMessage } from '../utils/errorTracking';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  const msg = 'Supabase credentials not configured. Only demo mode will be available.';
  if (import.meta.env.PROD) {
    captureMessage(msg, { context: 'supabaseService.init' });
  } else {
    console.warn(msg);
  }
}

// Demo mode is activated by user action, stored in sessionStorage
export function isDemoMode(): boolean {
  return typeof window !== 'undefined' && sessionStorage.getItem('gravity_demo_mode') === 'true';
}

export function enterDemoMode() {
  if (typeof window !== 'undefined') sessionStorage.setItem('gravity_demo_mode', 'true');
}

export function exitDemoMode() {
  if (typeof window !== 'undefined') sessionStorage.removeItem('gravity_demo_mode');
}

// In demo mode without real credentials, use a dummy client that won't make real requests.
// The app guards all Supabase calls with isDemo checks, so the client is effectively inert.
export const supabase = createClient(
  supabaseUrl || 'https://localhost.invalid',
  supabaseAnonKey || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.placeholder'
);
