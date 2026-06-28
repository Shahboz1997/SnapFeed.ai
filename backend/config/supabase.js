import { createClient } from '@supabase/supabase-js';
import ws from 'ws';

if (typeof globalThis.WebSocket === 'undefined') {
  globalThis.WebSocket = ws;
}

const supabaseUrl = process.env.SUPABASE_URL?.trim() || '';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || '';

export function isSupabaseConfigured() {
  return Boolean(supabaseUrl && serviceRoleKey);
}

let adminClient = null;

export function getSupabaseAdmin() {
  if (!isSupabaseConfigured()) {
    return null;
  }

  if (!adminClient) {
    adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
      global: {
        fetch,
      },
      realtime: {
        transport: ws,
      },
    });
  }

  return adminClient;
}

export function getSupabaseUrl() {
  return supabaseUrl;
}
