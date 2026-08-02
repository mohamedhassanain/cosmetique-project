// Script de test de charge pour l'application Kissariya.
// Exécution :
//   k6 run scripts/k6-load-test.js
//
// Scénario : charge légère et constante (simule une boutique vitrine
// avec pics de visite le week-end) contre le site EN PRODUCTION.
//
// Variables :
//   k6 run -e TARGET_URL=https://kissariya.vercel.app scripts/k6-load-test.js

import http from 'k6/http';
import { check, sleep } from 'k6';

const TARGET_URL = __ENV.TARGET_URL || 'http://localhost:4173';

export const options = {
  // Monter à 20 VU en 30s, rester 1min, redescendre.
  stages: [
    { duration: '30s', target: 20 },
    { duration: '1m', target: 20 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<800'], // 95% des requêtes sous 800 ms
    http_req_failed: ['rate<0.01'],   // moins de 1% d'erreurs
  },
};

// Page la plus lourde (pay-load admin exclu, protégé par auth).
const PAGES = [
  '/',
  '/produits',
  '/auth',
  '/produit/inexistant-e2e', // exercice du fallback 404
];

export default function () {
  // 80% de navigation sur la boutique, 20% de retours sur l'accueil.
  const path = Math.random() < 0.2 ? '/' : PAGES[Math.floor(Math.random() * PAGES.length)];

  const res = http.get(`${TARGET_URL}${path}`, {
    headers: { 'Accept-Language': 'fr-FR,fr;q=0.9' },
  });

  check(res, {
    'status est 200': (r) => r.status === 200,
    'réponse non vide': (r) => r.body.length > 0,
  });

  // Temps de "lecture" réaliste entre deux visites.
  sleep(1 + Math.random() * 2);
}
