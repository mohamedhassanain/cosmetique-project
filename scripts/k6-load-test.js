// =====================================================================
// KISSARIYA — TEST DE CHARGE RÉEL SUPABASE (pas de test frontend local)
//
// Ce script pèse directement l'API Supabase (PostgREST + GoTrue) :
//   Utilisateur → CDN → Supabase API → PostgreSQL
// Il ne teste PAS le rendu Vite local (l'ancien script le faisait).
//
// PRÉREQUIS (aucun secret en dur — tout passe par des variables d'env) :
//   1. k6 installé : https://k6.io/docs/get-started/installation/
//   2. Un PROJET SUPABASE DÉDIÉ AUX TESTS (jamais la production) avec le
//      schéma déployé (supabase/database.sql) et quelques produits.
//   3. Variables d'environnement (voir .env.example) :
//        SUPABASE_URL            ex: https://xyz.supabase.co
//        SUPABASE_ANON_KEY       clé publique anon (sans danger)
//        SUPABASE_TEST_EMAIL / SUPABASE_TEST_PASSWORD
//                                compte AUTHENTIFIÉ non-admin créé pour le test
//
// EXECUTION :
//   Supabase Free Plan : charge prudente (≤ 40 VU) — au-delà, le projet
//   Free peut être ralenti (c'est une limite de la plateforme, pas du code).
//     k6 run -e SUPABASE_URL=... -e SUPABASE_ANON_KEY=... \
//            -e SUPABASE_TEST_EMAIL=... -e SUPABASE_TEST_PASSWORD=... \
//            -e MAX_VUS=40 -e DURATION=2m scripts/k6-load-test.js
//
// Scénarios mesurés : listing produits, recherche/filtre, fiche produit,
//   auth (login), cart/order (INSERT ordre test, données propres au projet
//   de test — jamais en production).
// =====================================================================

import http from 'k6/http';
import { check, sleep } from 'k6';

const SUPABASE_URL = __ENV.SUPABASE_URL;
const SUPABASE_ANON_KEY = __ENV.SUPABASE_ANON_KEY;
const TEST_EMAIL = __ENV.SUPABASE_TEST_EMAIL || 'loadtest@example.com';
const TEST_PASSWORD = __ENV.SUPABASE_TEST_PASSWORD;
const MAX_VUS = Number(__ENV.MAX_VUS || 20);
const DURATION = __ENV.DURATION || '2m';

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error('SUPABASE_URL et SUPABASE_ANON_KEY sont requises (voir .env.example).');
}

const REST = `${SUPABASE_URL}/rest/v1`;
const AUTH = `${SUPABASE_URL}/auth/v1`;

const JSON_HEADERS = {
  apikey: SUPABASE_ANON_KEY,
  Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  'Content-Type': 'application/json',
  Accept: 'application/json',
};

let cachedProductId = null;

export const options = {
  stages: [
    { duration: '30s', target: MAX_VUS },
    { duration: DURATION, target: MAX_VUS },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<1200'],
    http_req_failed: ['rate<0.05'],
  },
};

// Cache un ID produit du projet de test pour les scénarios fiche → panier.
function getAnyProductId() {
  if (cachedProductId) return cachedProductId;
  const res = http.get(
    `${REST}/products?select=id&is_active=eq.true&limit=1`,
    { headers: { apikey: SUPABASE_ANON_KEY } }
  );
  if (res.status === 200 && res.json().length > 0) {
    cachedProductId = res.json()[0].id;
  }
  return cachedProductId;
}

export default function () {
  // 1. Listing produits (page catalogue) — lecture publique.
  const list = http.get(
    `${REST}/products?select=id,name,price,image_url,image_url_400,image_url_800,is_promotion&is_active=eq.true&order=created_at.desc&limit=16`,
    { headers: JSON_HEADERS }
  );
  check(list, { 'listing 200': (r) => r.status === 200 });

  // 2. Recherche / filtre (pagination) — lecture publique.
  const search = http.get(
    `${REST}/products?select=id,name&is_active=eq.true&name=ilike.*creme*&limit=8&offset=0`,
    { headers: JSON_HEADERS }
  );
  check(search, { 'recherche 200': (r) => r.status === 200 });

  // 3. Fiche produit — lecture publique.
  const pid = getAnyProductId();
  if (pid) {
    const detail = http.get(
      `${REST}/products?select=id,name,description,price,image_url,image_url_400,image_url_800,categories(name)&id=eq.${pid}`,
      { headers: JSON_HEADERS }
    );
    check(detail, { 'fiche 200': (r) => r.status === 200 });
  }

  // 4. Authentification (login compte de test non-admin).
  if (TEST_PASSWORD) {
    const login = http.post(
      `${AUTH}/token?grant_type=password`,
      JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
      { headers: { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json', Accept: 'application/json' } }
    );
    check(login, { 'login 200': (r) => r.status === 200 });
  }

  // 5. Cart / order : INSERT ordre de test dans le projet de test.
  //    Ne JAMAIS exécuter contre la production réelle.
  if (TEST_PASSWORD && pid) {
    const order = http.post(
      `${REST}/orders`,
      JSON.stringify({
        customer_name: 'Load Test',
        customer_phone: '+212600000000',
        product_id: pid,
        product_name: 'Produit test de charge',
        quantity: 1,
        total_price: 199,
        status: 'pending',
        notes: 'Généré par k6 — projet de test uniquement',
      }),
      { headers: JSON_HEADERS }
    );
    check(order, { 'commande créée 201': (r) => r.status === 201 });
  }

  sleep(1 + Math.random());
}
