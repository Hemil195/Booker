// apps/web/lib/supabaseClient.ts
// Client-safe file — imported by Client Components and Browser code.
// Contains NO server-only imports like 'next/headers'.

import { createBrowserClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// ── 1. Browser client (Client Components) ────────────────────────────────────
export function createSupabaseBrowserClient() {
  return createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

// ── 2. Admin / Service Role client (bypasses RLS) ─────────────────────────────
// ONLY for backend API endpoints (sync-bookmark, link-device, mcp, etc.)
export function createSupabaseAdminClient(): SupabaseClient {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  return createClient(SUPABASE_URL, serviceKey, {
    auth: { persistSession: false },
  });
}
