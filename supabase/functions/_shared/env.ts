// =====================================================================
// Accès aux variables d'environnement — portable Deno (Edge Functions) /
// Node (tests Vitest). Évite de référencer le global `Deno` directement
// pour rester compatible avec le type-check IDE du frontend.
// =====================================================================

interface DenoLikeEnv {
  env?: {
    get(name: string): string | undefined;
  };
}

function getDenoEnv(): DenoLikeEnv | undefined {
  return (globalThis as { Deno?: DenoLikeEnv }).Deno;
}

export function getEnv(name: string): string | undefined {
  const deno = getDenoEnv();
  if (deno?.env && typeof deno.env.get === 'function') {
    return deno.env.get(name);
  }
  const nodeEnv = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
  return nodeEnv?.[name];
}

/** Lit un entier positif avec valeur de repli sûre. */
export function getPositiveIntEnv(name: string, fallback: number): number {
  const raw = getEnv(name);
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}
