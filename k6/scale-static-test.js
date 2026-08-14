// =====================================================================
// KISSARIYA - HORIZONTAL SCALE COMPARISON (1 vs 2 vs 3 replicas)
// =====================================================================
// Purpose: measure the frontend-vs-backend capacity split across replicas.
//
//   TEST A (STATIC ONLY)  - BASE_URL points at Nginx replica(s) directly.
//       Measures pure static frontend capacity (index.html + hashed asset).
//       Does NOT touch Supabase. This isolates the Nginx layer.
//
//   TEST B (FULL PATH)     - BASE_URL + SUPABASE_URL both provided.
//       Measures the real end-to-end user path: SPA shell served by the
//       replica(s) + Supabase REST reads (home/catalog). This isolates
//       what the user actually experiences behind the LB.
//
// Usage (static-only):
//   k6 run -e BASE_URL=http://localhost:8081 -e TARGET_HOST=1 k6/scale-static-test.js
//   k6 run -e BASE_URL=http://localhost:8082 -e TARGET_HOST=2 k6/scale-static-test.js
//   k6 run -e BASE_URL=http://localhost:8083 -e TARGET_HOST=3 k6/scale-static-test.js
//
// Usage (full path, replicas in front of Supabase):
//   k6 run -e BASE_URL=http://localhost:8081 -e TARGET_HOST=1 -e TEST_MODE=full
//          -e SUPABASE_URL=https://xxx.supabase.co -e SUPABASE_ANON_KEY=anon_key
//          k6/scale-static-test.js
//
// Read-only workload. anon key only. Never inserts/updates/deletes.
// =====================================================================

import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = (__ENV.BASE_URL || 'http://localhost:8081').replace(/\/+$/, '');
const TARGET_HOST = __ENV.TARGET_HOST || '1';
const TEST_MODE = __ENV.TEST_MODE || 'static';
const MAX_VUS = Number(__ENV.MAX_VUS || 100);

const SUPABASE_URL = __ENV.SUPABASE_URL ? __ENV.SUPABASE_URL.replace(/\/+$/, '') : null;
const SUPABASE_ANON_KEY = __ENV.SUPABASE_ANON_KEY || null;

if (TEST_MODE === 'full' && (!SUPABASE_URL || !SUPABASE_ANON_KEY)) {
  throw new Error('TEST_MODE=full requires SUPABASE_URL and SUPABASE_ANON_KEY');
}

const REST = SUPABASE_URL ? `${SUPABASE_URL}/rest/v1` : null;
const ANON_HEADERS = SUPABASE_ANON_KEY
  ? {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      Accept: 'application/json',
    }
  : null;

export const options = {
  stages: [
    { duration: '20s', target: MAX_VUS },
    { duration: '40s', target: MAX_VUS },
    { duration: '20s', target: 0 },
  ],
  thresholds: {
    http_req_failed: ['rate<0.01'],
  },
  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)'],
};

const PRODUCT_LIST_SELECT =
  'id,name,slug,price,original_price,is_promotion,is_featured,image_url,image_url_400,image_url_800,brand,category_id,subcategory_id,categories(name,slug)';

export function setup() {
  const indexRes = http.get(`${BASE_URL}/`, { tags: { name: 'setup_index' } });
  const assetMatch = indexRes.body.match(/\/assets\/[^"'?]+\.js/);
  return {
    assetPath: assetMatch ? assetMatch[0] : null,
  };
}

export default function (data) {
  const { assetPath } = data;

  // ---- Test A: static frontend capacity (SPA shell + hashed asset) ----
  const shell = http.get(`${BASE_URL}/produits`, { tags: { name: 'spa_shell' } });
  check(shell, { 'shell 200': (r) => r.status === 200 });

  if (assetPath) {
    const asset = http.get(`${BASE_URL}${assetPath}`, { tags: { name: 'hashed_asset' } });
    check(asset, { 'asset 200': (r) => r.status === 200 });
  }

  // ---- Test B: Supabase REST reads on the real end-to-end path ----
  if (TEST_MODE === 'full' && REST && ANON_HEADERS) {
    const homeProducts = http.get(
      `${REST}/products?select=${encodeURIComponent(PRODUCT_LIST_SELECT)}&is_active=eq.true&order=created_at.desc&limit=60`,
      { headers: ANON_HEADERS, tags: { name: 'rest_home_products' } }
    );
    check(homeProducts, { 'rest home products 200': (r) => r.status === 200 });

    const catalogProducts = http.get(
      `${REST}/products?select=${encodeURIComponent(PRODUCT_LIST_SELECT)}&is_active=eq.true&order=created_at.desc&offset=0&limit=17`,
      { headers: ANON_HEADERS, tags: { name: 'rest_catalog_products' } }
    );
    check(catalogProducts, { 'rest catalog products 200': (r) => r.status === 200 });
  }

  sleep(0.5 + Math.random() * 0.5);
}

export function handleSummary(data) {
  const tag = `scale-static-replica${TARGET_HOST}-${MAX_VUS}vu`;
  return {
    [`load-tests/results/${tag}.json`]: JSON.stringify(data, null, 2),
  };
}
