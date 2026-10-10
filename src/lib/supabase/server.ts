import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { supabaseConfig } from './config';
import { supabaseServerFetch } from './server-fetch';

export async function getSupabaseServer() {
  const config = supabaseConfig();
  if (!config) throw new Error('Supabase is not configured.');
  const cookieStore = await cookies();
  return createServerClient(config.url, config.key, {
    global: { fetch: supabaseServerFetch },
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (values) => {
        values.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
      },
    },
  });
}
