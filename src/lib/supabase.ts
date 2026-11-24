import type { SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from '../config';

export const isSupabaseConfigured = () =>
  !SUPABASE_URL.includes('YOUR-PROJECT') && !SUPABASE_PUBLISHABLE_KEY.includes('YOUR-SUPABASE') && SUPABASE_URL.startsWith('http');

export const AUTH_STORAGE_KEY = 'skillissue:auth';

let clientPromise: Promise<SupabaseClient | null> | null = null;

/** Supabase SDK is loaded lazily and only when configured — keeps the first load tiny. */
export function getSupabase(): Promise<SupabaseClient | null> {
  if (!isSupabaseConfigured()) return Promise.resolve(null);
  clientPromise ??= import('@supabase/supabase-js')
    .then(({ createClient }) =>
      createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: AUTH_STORAGE_KEY },
      }),
    )
    .catch((e) => {
      console.warn('Supabase failed to load → offline mode', e);
      return null;
    });
  return clientPromise;
}

export const redirectUrl = () => location.origin + '/';
