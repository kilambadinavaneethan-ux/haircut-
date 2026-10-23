import { createClient, SupabaseClient, SupportedStorage } from '@supabase/supabase-js';
import { Database } from '../types/database';

export interface CreateClientOptions {
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  customStorage?: SupportedStorage;
  persistSession?: boolean;
}

const getEnv = (key: string): string | undefined => {
  if (typeof process !== 'undefined' && process.env && process.env[key]) {
    return process.env[key];
  }
  try {
    // Dynamic access avoids CJS syntax conflict for import.meta
    const meta = (new Function('try { return import.meta; } catch (e) { return undefined; }'))();
    if (meta && meta.env && meta.env[key]) {
      return meta.env[key];
    }
  } catch {
    // Ignore in non-ESM environments
  }
  return undefined;
};

const DEFAULT_SUPABASE_URL =
  getEnv('VITE_SUPABASE_URL') ||
  getEnv('EXPO_PUBLIC_SUPABASE_URL') ||
  getEnv('SUPABASE_URL') ||
  'https://wdmnmkhtavqgfgcnxpdd.supabase.co';

const DEFAULT_SUPABASE_ANON_KEY =
  getEnv('VITE_SUPABASE_ANON_KEY') ||
  getEnv('EXPO_PUBLIC_SUPABASE_ANON_KEY') ||
  getEnv('SUPABASE_ANON_KEY') ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndkbW5ta2h0YXZxZ2ZnY254cGRkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIxODgwMDAsImV4cCI6MjEwNzc2NDAwMH0.cAYhaf4U3LN9jKhBmc4JCBvRYm0m4Iuj6JaAJMIbJZM';

let globalClientInstance: SupabaseClient<Database> | null = null;

/**
 * Creates or retrieves a singleton typed Supabase client
 */
export function getSupabaseClient(options: CreateClientOptions = {}): SupabaseClient<Database> {
  const url = options.supabaseUrl || DEFAULT_SUPABASE_URL;
  const anonKey = options.supabaseAnonKey || DEFAULT_SUPABASE_ANON_KEY;

  if (globalClientInstance && !options.customStorage) {
    return globalClientInstance;
  }

  const client = createClient<Database>(url, anonKey, {
    auth: {
      storage: options.customStorage,
      autoRefreshToken: true,
      persistSession: options.persistSession ?? true,
      detectSessionInUrl: typeof window !== 'undefined'
    },
    realtime: {
      params: {
        eventsPerSecond: 10
      }
    }
  });

  if (!options.customStorage) {
    globalClientInstance = client;
  }

  return client;
}
