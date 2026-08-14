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
  nowMs: number,
  minIntervalMs?: number
): Promise<RateLimitCheck> {
  const admin = await createAdminClient();

  // anti-spam rapide : si une soumission a eu lieu il y a moins de
  // `minIntervalMs`, on rejette SANS incrémenter les compteurs de fenêtre
  // (évite de consommer le quota 10 min pour des clics-doubles).
  if (minIntervalMs && minIntervalMs > 0) {
    const intervalKey = `${bucketKey}:last`;
    const lastSentAt = await getLastSubmission(admin, intervalKey);
    if (lastSentAt !== null && nowMs - lastSentAt < minIntervalMs) {
      const exceeded = {
        windowSeconds: Math.ceil(minIntervalMs / 1000),
        maxCount: 1,
      } as RateLimitRule;
      return { allowed: false, exceededRule: exceeded };
    }
  }

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

  await touchLastSubmission(admin, intervalKeyOf(bucketKey), nowMs);
  await maybeGlobalCleanup(admin);
  return { allowed: true };
}

function intervalKeyOf(bucketKey: string): string {
  return `${bucketKey}:last`;
}

/** Lit le timestamp de la dernière soumission (via la table rate_limit_counters). */
async function getLastSubmission(
  admin: Awaited<ReturnType<typeof createAdminClient>>,
  intervalKey: string
): Promise<number | null> {
  const { data, error } = await admin.from('rate_limit_counters').select('updated_at').eq('bucket_key', intervalKey);
  if (error) return null;
  if (!data || data.length === 0) return null;
  const raw = data[0]?.updated_at;
  if (!raw) return null;
  const ts = new Date(String(raw)).getTime();
  return Number.isFinite(ts) ? ts : null;
}

/** Enregistre la dernière soumission (upsert via bump_rate_limit avec maxCount 1). */
async function touchLastSubmission(
  admin: Awaited<ReturnType<typeof createAdminClient>>,
  intervalKey: string,
  nowMs: number
): Promise<void> {
  const start = windowStartMs(nowMs, 2 * 60 * 60).toISOString();
  const { error } = await admin.rpc('bump_rate_limit', {
    p_bucket_key: intervalKey,
    p_window_start: start,
    p_max_count: 1_000_000,
  });
  void error; // échec non bloquant : la protection intervalle devient inopérante, le quota fenêtre reste actif
}

/** Nettoyage global probabiliste des vieilles lignes (index updated_at). */
async function maybeGlobalCleanup(admin: Awaited<ReturnType<typeof createAdminClient>>): Promise<void> {
  if (Math.random() > GLOBAL_CLEANUP_PROBABILITY) return;
  const cutoff = new Date(Date.now() - MAX_RECORD_AGE_MS).toISOString();
  const { error } = await admin.rpc('cleanup_rate_limit_counters', { p_cutoff: cutoff });
  void error; // échec de nettoyage non bloquant
}
