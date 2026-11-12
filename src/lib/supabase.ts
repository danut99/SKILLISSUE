import type { SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '../config';

export const isSupabaseConfigured = () =>
  !SUPABASE_URL.includes('YOUR-PROJECT') && !SUPABASE_ANON_KEY.includes('YOUR-SUPABASE') && SUPABASE_URL.startsWith('http');

let clientPromise: Promise<SupabaseClient | null> | null = null;

/** Supabase SDK is loaded lazily and only when configured — keeps the first load tiny. */
export function getSupabase(): Promise<SupabaseClient | null> {
  if (!isSupabaseConfigured()) return Promise.resolve(null);
  clientPromise ??= import('@supabase/supabase-js')
    .then(({ createClient }) =>
      createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'skillissue:auth' },
      }),
    )
    .catch((e) => {
      console.warn('Supabase failed to load → offline mode', e);
      return null;
    });
  return clientPromise;
}

export const redirectUrl = () => location.origin + location.pathname;
