import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (import.meta.env.PROD && (!supabaseUrl || !supabaseAnonKey)) {
  throw new Error('Supabase URL and Anon Key must be provided in production environment.');
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

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder'
);
