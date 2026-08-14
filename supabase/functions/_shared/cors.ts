// =====================================================================
// CORS partagé pour les Edge Functions publiques
// `create-order` / `create-contact`.
//
// Le navigateur appelle ces fonctions directement (pas de proxy). On doit
// donc gérer le préflight OPTIONS et retourner des en-têtes CORS.
// =====================================================================
import { getEnv } from './env.ts';

export const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Max-Age': '86400',
};

/** Réponse 204 pour le préflight OPTIONS. */
export function optionsResponse(): Response {
  return new Response('ok', { status: 204, headers: corsHeaders });
}

/** Réponse JSON avec en-têtes CORS. */
export function jsonResponse(
  status: number,
  body: Record<string, unknown>,
  extraHeaders: Record<string, string> = {}
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', ...extraHeaders },
  });
}

/** Vérifie l'origine si `ALLOWED_ORIGINS` est configuré (défaut : tout autoriser). */
export function isOriginAllowed(req: Request): boolean {
  const raw = getEnv('ALLOWED_ORIGINS');
  if (!raw) return true;
  const origin = req.headers.get('origin');
  if (!origin) return true; // requêtes non navigateur
  const allowedOrigins = raw.split(',').map((o: string) => o.trim());
  return allowedOrigins.some((allowed: string) => origin === allowed);
}
