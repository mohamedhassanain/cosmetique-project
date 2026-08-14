// =====================================================================
// Moteur de rate limiting PERSISTANT (table PostgreSQL, partagée entre
// toutes les instances Edge Function — pas de Map en mémoire).
//
// Chaque soumission incrémente atomiquement `bump_rate_limit()` pour
// CHAQUE fenêtre (10 min + 1 h). Le dépassement d'UNE fenêtre → 429.
//
// Nettoyage anti-croissance illimitée :
//   1. `bump_rate_limit()` supprime les lignes expirées du même bucket.
//   2. Nettoyage GLOBAL probabiliste (2 % des appels) : supprime toute
//      ligne dont `updated_at` est plus vieux que 2 h. Coût minimal,
//      croissance bornée, aucun job externe.
// =====================================================================
import { RateLimitRule } from './config.ts';
import { createAdminClient } from './supabase-admin.ts';

export interface RateLimitCheck {
  allowed: boolean;
  /** Fenêtre qui a dépassé (pour le message 429). */
  exceededRule?: RateLimitRule;
}

const GLOBAL_CLEANUP_PROBABILITY = 0.02;
/** Durée de conservation max — au-delà, la ligne est inutile. */
const MAX_RECORD_AGE_MS = 2 * 60 * 60 * 1000;

/** Début de fenêtre fixe alignée sur l'époque UNIX. */
export function windowStartMs(nowMs: number, windowSeconds: number): Date {
  const sec = Math.floor(nowMs / 1000);
  const startSec = sec - (sec % windowSeconds);
  return new Date(startSec * 1000);
}

/**
 * Enregistre une soumission et vérifie les limites de toutes les fenêtres.
 * `bucketKey` = IP hachée. En cas d'échec du compteur (erreur DB), on
 * lève → le handler renverra 503 (jamais 200), sans persister la donnée.
 */
export async function checkAndBump(
  bucketKey: string,
  rules: RateLimitRule[],
  nowMs: number
): Promise<RateLimitCheck> {
  const admin = await createAdminClient();

  for (const rule of rules) {
    const start = windowStartMs(nowMs, rule.windowSeconds).toISOString();
    const { data, error } = await admin.rpc<number>('bump_rate_limit', {
      p_bucket_key: bucketKey,
      p_window_start: start,
      p_max_count: rule.maxCount,
    });
    if (error) throw error;
    if (Number(data) > rule.maxCount) {
      return { allowed: false, exceededRule: rule };
    }
  }

  await maybeGlobalCleanup(admin);
  return { allowed: true };
}

/** Nettoyage global probabiliste des vieilles lignes (index updated_at). */
async function maybeGlobalCleanup(admin: Awaited<ReturnType<typeof createAdminClient>>): Promise<void> {
  if (Math.random() > GLOBAL_CLEANUP_PROBABILITY) return;
  const cutoff = new Date(Date.now() - MAX_RECORD_AGE_MS).toISOString();
  const { error } = await admin.rpc('cleanup_rate_limit_counters', { p_cutoff: cutoff });
  void error; // échec de nettoyage non bloquant
}
