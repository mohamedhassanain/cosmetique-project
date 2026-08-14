// =====================================================================
// Client Supabase ADMIN — utilisé UNIQUEMENT côté serveur (Edge Functions).
//
// ⚠️ SÉCURITÉ : `service_role` contourne RLS. Cette clé ne doit JAMAIS
// quitter le runtime serveur : elle est lue depuis les variables
// d'environnement de l'Edge Function (Dashboard → Secrets) et n'est
// jamais renvoyée au navigateur, ni incluse dans le bundle frontend.
//
// L'insertion publique directe (PostgREST anon) est désormais FERMÉE
// (policies INSERT retirées) : seule cette fonction, protégée par le
// rate limiting + la validation, écrit dans orders / contact_messages.
// =====================================================================
import { getEnv } from './env.ts';

export function getServiceRoleKey(): string | undefined {
  return getEnv('SUPABASE_SERVICE_ROLE_KEY') ?? getEnv('SUPABASE_SERVICE_ROLE');
}

export function getSupabaseUrl(): string | undefined {
  return getEnv('SUPABASE_URL') ?? getEnv('VITE_SUPABASE_URL');
}

export function requireServiceRoleKey(): string {
  const key = getServiceRoleKey();
  if (!key) {
    throw new Error('SERVICE_ROLE_KEY manquant côté serveur (configuration Edge Function).');
  }
  return key;
}

export interface QueryResult<T> {
  data: T | null;
  error: Error | null;
}

export interface TableClient {
  insert(row: Record<string, unknown>): Promise<{ error: Error | null }>;
  select(columns: string): {
    eq(column: string, value: unknown): Promise<QueryResult<Record<string, unknown>[]>>;
  };
}

export interface AdminClient {
  rpc<T = unknown>(fn: string, args: Record<string, unknown>): Promise<QueryResult<T>>;
  from(table: string): TableClient;
}

/**
 * Client minimal par-dessus POSTgREST (évite la dépendance supabase-js
 * dans l'Edge Function — moins de bundle, moins de surface d'attaque).
 * Toutes les requêtes portent l'en-tête `apikey` service_role.
 */
export async function createAdminClient(): Promise<AdminClient> {
  const url = getSupabaseUrl();
  const key = requireServiceRoleKey();
  const base = `${url}/rest/v1`;

  async function request<T>(path: string, init: RequestInit): Promise<QueryResult<T>> {
    const res = await fetch(`${base}${path}`, {
      ...init,
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(init.headers ?? {}),
      },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return { data: null, error: new Error(`Supabase ${res.status}: ${text.slice(0, 200)}`) };
    }
    if (res.status === 204) return { data: null, error: null };
    const json = (await res.json().catch(() => null)) as T;
    return { data: json, error: null };
  }

  return {
    async rpc<T = unknown>(fn: string, args: Record<string, unknown>) {
      return request<T>(`/rpc/${fn}`, { method: 'POST', body: JSON.stringify(args) });
    },
    from(table: string): TableClient {
      return {
        async insert(row: Record<string, unknown>) {
          return request(`/${table}`, {
            method: 'POST',
            headers: { Prefer: 'return=minimal' },
            body: JSON.stringify(row),
          });
        },
        select(columns: string) {
          return {
            async eq(column: string, value: unknown) {
              const path =
                `/${table}?select=${encodeURIComponent(columns)}` +
                `&${column}=eq.${encodeURIComponent(String(value))}&limit=1`;
              return request<Record<string, unknown>[]>(path, { method: 'GET' });
            },
          };
        },
      };
    },
  };
}
