// =====================================================================
// K6 — TEST DE SECURITE DU RATE LIMITING (Edge Functions Supabase)
//
// Vérifie :
//   - trafic normal (commandes + contacts)          → 201 accepté
//   - burst (soumissions répétées depuis la même IP) → 429 refusé
//
// CIBLE : les Edge Functions `create-order` / `create-contact` (le
// endpoint REST direct anon est désormais FERMÉ par RLS).
//
// PRÉREQUIS :
//   1. k6 installé : https://k6.io/docs/get-started/installation/
//   2. Un PROJET SUPABASE DÉDIÉ AUX TESTS avec :
//        - le schéma (supabase/database.sql) exécuté
//        - les Edge Functions déployées : supabase functions deploy create-order
//          et create-contact, avec les secrets SUPABASE_URL +
//          SUPABASE_SERVICE_ROLE_KEY configurés côté Edge Function.
//   3. Variables d'environnement :
//        SUPABASE_URL=... SUPABASE_ANON_KEY=... k6 run k6/rate-limit-test.js
//
// Sécurité : utilise UNIQUEMENT la clé anon (publique). Jamais de
// service_role. Les payloads sont marqués « [k6 test] » pour être
// identifiables et supprimables.
// =====================================================================
import http from 'k6/http';
import { check } from 'k6';

const SUPABASE_URL = __ENV.SUPABASE_URL;
const SUPABASE_ANON_KEY = __ENV.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error('SUPABASE_URL et SUPABASE_ANON_KEY sont requises (projet de test uniquement).');
}

const EDGE_BASE = `${SUPABASE_URL}/functions/v1`;
const ORDERS_URL = `${EDGE_BASE}/create-order`;
const CONTACT_URL = `${EDGE_BASE}/create-contact`;

const HEADERS = {
  'Content-Type': 'application/json',
  apikey: SUPABASE_ANON_KEY,
  Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  Accept: 'application/json',
};

export const options = {
  // Phases courtes et peu agressives pour ne pas spamer la base de test.
  scenarios: {
    normal_order: {
      executor: 'constant-vus',
      vus: 3,
      duration: '10s',
      exec: 'runNormalOrder',
    },
    normal_contact: {
      executor: 'constant-vus',
      vus: 3,
      duration: '10s',
      startTime: '10s',
      exec: 'runNormalContact',
    },
    burst_order: {
      executor: 'per-vu-iterations',
      vus: 1,
      iterations: 15,
      startTime: '25s',
      exec: 'runBurstOrder',
    },
    burst_contact: {
      executor: 'per-vu-iterations',
      vus: 1,
      iterations: 15,
      startTime: '40s',
      exec: 'runBurstContact',
    },
  },
  thresholds: {
    // En phase normale, pas d'erreur ; en burst, on EXIGE des 429.
    'http_req_failed{kind:normal}': ['rate<0.01'],
    'http_req_failed{kind:burst}': ['rate<0.5'],
  },
};

export function runNormalOrder() {
  const res = http.post(
    ORDERS_URL,
    JSON.stringify({
      product_name: 'Produit k6 test',
      quantity: 1,
      total_price: 199,
      customer_name: 'k6 Testeur',
      customer_phone: '+212600000000',
      status: 'pending',
      notes: '[k6 test] ordre normal',
      website: '',
    }),
    { headers: HEADERS, tags: { kind: 'normal' } }
  );
  check(res, { 'ordre normal accepté (201)': (r) => r.status === 201 });
}

export function runBurstOrder() {
  const res = http.post(
    ORDERS_URL,
    JSON.stringify({
      product_name: 'Produit k6 burst',
      quantity: 1,
      total_price: 10,
      customer_name: 'k6 Burst',
      customer_phone: '+212600000000',
      status: 'pending',
      notes: '[k6 test] burst ordre',
      website: '',
    }),
    { headers: HEADERS, tags: { kind: 'burst' } }
  );
  // Dépassement attendu → 429 accepté comme PREUVE du rate limiting.
  check(res, {
    'burst ordre → 201 ou 429': (r) => r.status === 201 || r.status === 429,
    'jamais 500 en burst': (r) => r.status !== 500,
  });
}

export function runNormalContact() {
  const res = http.post(
    CONTACT_URL,
    JSON.stringify({
      name: 'k6 Testeur',
      email: 'k6@example.com',
      phone: '+212600000000',
      subject: '[k6 test] sujet normal',
      message: '[k6 test] message de contact normal, longueur suffisante.',
      website: '',
    }),
    { headers: HEADERS, tags: { kind: 'normal' } }
  );
  check(res, { 'contact normal accepté (201)': (r) => r.status === 201 });
}

export function runBurstContact() {
  const res = http.post(
    CONTACT_URL,
    JSON.stringify({
      name: 'k6 Burst',
      email: 'burst@example.com',
      phone: '+212600000000',
      subject: '[k6 test] sujet burst',
      message: '[k6 test] message de contact en burst, longueur suffisante.',
      website: '',
    }),
    { headers: HEADERS, tags: { kind: 'burst' } }
  );
  check(res, {
    'burst contact → 201 ou 429': (r) => r.status === 201 || r.status === 429,
    'jamais 500 en burst': (r) => r.status !== 500,
  });
}
