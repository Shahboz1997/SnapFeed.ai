import { createClient } from '@supabase/supabase-js';
import ws from 'ws';

if (typeof globalThis.WebSocket === 'undefined') {
  globalThis.WebSocket = ws;
}

// Trailing slash breaks jose issuer checks (`…co//auth/v1` ≠ token `iss`).
const supabaseUrl = (process.env.SUPABASE_URL?.trim() || '').replace(/\/+$/, '');
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || '';

const SUPABASE_FETCH_TIMEOUT_MS = 25_000;
const SUPABASE_FETCH_RETRIES = 3;

function isTransientFetchError(error) {
  const message = String(error?.message || error || '');
  const causeCode = String(error?.cause?.code || error?.code || '');
  return (
    /abort|timeout|fetch failed|network|econnreset|enotfound|eai_again|und_err|socket/i.test(message)
    || /EAI_AGAIN|ENOTFOUND|ECONNRESET|ETIMEDOUT|UND_ERR|ABORT/i.test(causeCode)
  );
}

/** Longer timeout + retries for flaky local → Supabase DNS/connectivity. */
async function supabaseFetch(input, init = {}) {
  const attempt = async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), SUPABASE_FETCH_TIMEOUT_MS);
    try {
      const merged = {
        ...init,
        signal: init.signal
          ? AbortSignal.any([init.signal, controller.signal])
          : controller.signal,
      };
      return await fetch(input, merged);
    } finally {
      clearTimeout(timer);
    }
  };

  let lastError;
  for (let i = 0; i < SUPABASE_FETCH_RETRIES; i += 1) {
    try {
      return await attempt();
    } catch (error) {
      lastError = error;
      if (!isTransientFetchError(error) || i === SUPABASE_FETCH_RETRIES - 1) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 350 * (i + 1)));
    }
  }
  throw lastError;
}

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
        fetch: supabaseFetch,
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
