"use client";

import { createBrowserClient } from "@supabase/ssr";
import { assertSupabaseConfigured } from "@/lib/supabase/config";

export function createClient() {
  const { supabaseUrl, supabaseKey } = assertSupabaseConfigured();
  return createBrowserClient(supabaseUrl, supabaseKey);
}
