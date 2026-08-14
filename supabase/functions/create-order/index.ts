// =====================================================================
// EDGE FUNCTION PUBLIQUE : `create-order`
//
// Seul point d'entrée sécurisé pour la création publique de commande.
//   Browser → Edge Function → validation → rate limiting → INSERT orders
//
// L'ancien chemin direct `POST /rest/v1/orders` (policy anon INSERT) est
// FERMÉ. Le service_role ne quitte JAMAIS ce runtime serveur.
//
// Réponses :
//   201  créée
//   400  payload invalide (message générique, pas de détail interne)
//   429  trop de requêtes (« Too many requests. Please try again later. »)
//   503  indisponible (échec du compteur/DB — jamais 200)
// =====================================================================
import { corsHeaders, optionsResponse, jsonResponse, isOriginAllowed } from '../_shared/cors.ts';
import { getRateLimitConfig } from '../_shared/config.ts';
import { getClientIp, hashIp } from '../_shared/ip.ts';
import { checkAndBump } from '../_shared/rate-limit.ts';
import { createAdminClient } from '../_shared/supabase-admin.ts';
import { validateOrderPayload } from '../_shared/validation.ts';

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return optionsResponse();
  if (req.method !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed.' });
  }
  if (!isOriginAllowed(req)) {
    return jsonResponse(403, { error: 'Origin non autorisée.' });
  }

  // 1. IP cliente depuis les en-têtes de la plateforme (jamais le client).
  const ip = getClientIp(req);
  const bucketKey = ip ? await hashIp(ip, getRateLimitConfig().hashSecret) : 'unknown';

  // 2. Lecture du corps.
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonResponse(400, { error: 'Payload JSON invalide.' });
  }

  // 3. Validation du payload (400).
  const validation = validateOrderPayload(body);
  if (!validation.ok) {
    return jsonResponse(400, { error: validation.error });
  }

  // 4. Rate limiting (429) — contrepersistant, atomique.
  const config = getRateLimitConfig();
  let rateCheck;
  try {
    rateCheck = await checkAndBump(`order:${bucketKey}`, config.orders.rules, Date.now());
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

  // 5. Insertion côté serveur (service_role — RLS contourné uniquement ici).
  const record = body as Record<string, unknown>;
  const admin = await createAdminClient();

  // 5a. Dérivation du prix côté SERVEUR quand un produit est référencé :
  //     total = prix_catalogue × quantité. Le prix envoyé par le client est
  //     IGNORÉ (anti-manipulation). Sans `product_id` (panier libre), le
  //     total client reste borné par la validation (limite documentée).
  let totalPrice = Number(record.total_price);
  const productId = typeof record.product_id === 'string' ? record.product_id : null;
  if (productId) {
    const { data: product, error: productError } = await admin
      .from('products')
      .select('price')
      .eq('id', productId);
    if (productError || !product || product.length === 0) {
      return jsonResponse(400, { error: 'Produit inconnu.' });
    }
    const unitPrice = Number(product[0].price);
    totalPrice = Number.isFinite(unitPrice) ? unitPrice * Number(record.quantity) : totalPrice;
  }

  const row: Record<string, unknown> = {
    customer_name: String(record.customer_name).trim(),
    customer_phone: String(record.customer_phone).trim(),
    customer_city: typeof record.customer_city === 'string' && record.customer_city.trim()
      ? record.customer_city.trim() : null,
    product_id: productId,
    product_name: String(record.product_name).trim(),
    quantity: Number(record.quantity),
    total_price: totalPrice,
    status: 'pending',
    notes: typeof record.notes === 'string' && record.notes.trim() ? record.notes.trim() : null,
  };

  const { error } = await admin.from('orders').insert(row);
  if (error) {
    console.error('insert order failed', error.message);
    return jsonResponse(503, { error: 'Service temporairement indisponible.' });
  }

  return jsonResponse(201, { ok: true });
});
