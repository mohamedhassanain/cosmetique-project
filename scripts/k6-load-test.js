// Script de test de charge pour l'application Kissariya.
// Exécution :
//   k6 run scripts/k6-load-test.js
//   k6 run -e MAX_VUS=1000 -e DURATION=1m scripts/k6-load-test.js
//
// Variables :
//   TARGET_URL — URL cible (défaut: http://localhost:4173)
//   MAX_VUS    — nombre max d'utilisateurs virtuels (défaut: 20)
//   DURATION   — durée du palier (défaut: 2m, format k6 ex: "30s", "1m", "5m")

import http from 'k6/http';
import { check, sleep } from 'k6';

const TARGET_URL = __ENV.TARGET_URL || 'http://localhost:4173';
const MAX_VUS = Number(__ENV.MAX_VUS || 20);
const DURATION = __ENV.DURATION || '2m';

export const options = {
  // Rampe vers le max, palier à charge constante, descente.
  stages: [
    { duration: '30s', target: MAX_VUS },
    { duration: DURATION, target: MAX_VUS },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<800'], // 95% des requêtes sous 800 ms
    http_req_failed: ['rate<0.01'],   // moins de 1% d'erreurs
  },
};

// Pages publiques principales (admin exclu, protégé par auth).
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
