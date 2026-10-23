import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export const isSupabaseConfigured = Boolean(url && key);

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!url || !key) {
    throw new Error("supabase_not_configured");
  }
  client ??= createClient(url, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      storageKey: "afterhours-guest-session",
    },
    realtime: { params: { eventsPerSecond: 10 } },
  });
  return client;
}

let sessionPromise: Promise<string> | null = null;

/**
 * Guest sessions are Supabase *anonymous* auth users: a real signed JWT stored in
 * localStorage. No sign-up, but auth.uid() is stable so RLS and host rights work.
 * Returns the user id.
 */
export function ensureGuestSession(): Promise<string> {
  sessionPromise ??= (async () => {
    const supabase = getSupabase();
    const { data } = await supabase.auth.getSession();
    if (data.session) return data.session.user.id;
    const { data: created, error } = await supabase.auth.signInAnonymously();
    if (error || !created.user) {
      throw new Error(error?.message?.includes("Anonymous") ? "anon_disabled" : "session_failed");
    }
    return created.user.id;
  })().catch((e) => {
    sessionPromise = null; // allow retry
    throw e;
  });
  return sessionPromise;
}
