import { createClient } from '@supabase/supabase-js';

const env = import.meta.env || {};
const supabaseUrl = env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY || '';

// Controlla se le chiavi Supabase sono configurate nel file .env
export const isSupabaseConfigured = supabaseUrl.trim() !== '' && supabaseAnonKey.trim() !== '';

export const supabase = isSupabaseConfigured 
  ? createClient(supabaseUrl, supabaseAnonKey) 
  : null;

if (!isSupabaseConfigured) {
  console.warn(
    'Supabase non è configurato. L\'applicazione funzionerà in modalità DEMO LOCALE salvando i dati nel LocalStorage.'
  );
}
