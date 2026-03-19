import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabasePublicEnv } from '@/lib/supabase-config';

let browserClient: SupabaseClient | null = null;

export function getSupabaseBrowserClient() {
  const { url, anonKey } = getSupabasePublicEnv();

  if (!browserClient) {
    browserClient = createBrowserClient(url, anonKey);
  }

  return browserClient;
}
