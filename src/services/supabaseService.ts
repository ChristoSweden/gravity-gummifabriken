import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://placeholder-url.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'placeholder-key';

// Demo mode is activated by user action, stored in sessionStorage
export function isDemoMode(): boolean {
  return sessionStorage.getItem('gravity_demo_mode') === 'true';
}

export function enterDemoMode() {
  sessionStorage.setItem('gravity_demo_mode', 'true');
}

export function exitDemoMode() {
  sessionStorage.removeItem('gravity_demo_mode');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
