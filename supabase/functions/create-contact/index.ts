// =====================================================================
// EDGE FUNCTION PUBLIQUE : `create-contact`
//
// Seul point d'entrée sécurisé pour la création publique de message de
// contact. L'ancien chemin direct `POST /rest/v1/contact_messages`
// (policy anon INSERT) est FERMÉ.
//
// Réponses :
//   201  enregistré
//   400  payload invalide
//   429  trop de requêtes
//   503  indisponible
// =====================================================================
import { optionsResponse, jsonResponse, isOriginAllowed } from '../_shared/cors.ts';
import { getRateLimitConfig } from '../_shared/config.ts';
import { getClientIp, hashIp } from '../_shared/ip.ts';
import { checkAndBump } from '../_shared/rate-limit.ts';
import { createAdminClient } from '../_shared/supabase-admin.ts';
import { validateContactPayload } from '../_shared/validation.ts';

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return optionsResponse();
  if (req.method !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed.' });
  }
  if (!isOriginAllowed(req)) {
    return jsonResponse(403, { error: 'Origin non autorisée.' });
  }

  // 1. IP cliente (plateforme) → hachée.
  const ip = getClientIp(req);
  const bucketKey = ip ? await hashIp(ip, getRateLimitConfig().hashSecret) : 'unknown';

  // 2. Corps.
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonResponse(400, { error: 'Payload JSON invalide.' });
  }

  // 3. Validation.
  const validation = validateContactPayload(body);
  if (!validation.ok) {
    return jsonResponse(400, { error: validation.error });
  }

  // 4. Rate limiting.
  const config = getRateLimitConfig();
  let rateCheck;
  try {
    rateCheck = await checkAndBump(`contact:${bucketKey}`, config.contact.rules, Date.now());
  } catch {
    return jsonResponse(503, { error: 'Service temporairement indisponible.' });
  }
  if (!rateCheck.allowed) {
    const retryAfter = Math.ceil(rateCheck.exceededRule!.windowSeconds / 60);
    return jsonResponse(
      429,
      { error: 'Too many requests. Please try again later.' },
      { 'Retry-After': String(retryAfter) }
    );
  }

  // 5. Insertion (service_role).
  const record = body as Record<string, unknown>;
  const row: Record<string, unknown> = {
    name: String(record.name).trim(),
    email: String(record.email).trim().toLowerCase(),
    phone: typeof record.phone === 'string' && record.phone.trim()
      ? record.phone.trim() : null,
    subject: typeof record.subject === 'string' && record.subject.trim()
      ? record.subject.trim() : null,
    message: String(record.message).trim(),
    is_read: false,
  };

  const admin = await createAdminClient();
  const { error } = await admin.from('contact_messages').insert(row);
  if (error) {
    console.error('insert contact failed', error.message);
    return jsonResponse(503, { error: 'Service temporairement indisponible.' });
  }

  return jsonResponse(201, { ok: true });
});
