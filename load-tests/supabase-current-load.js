// =====================================================================
// KISSARIYA — DIAGNOSTIC LOAD TEST (CONTROL GROUP: CURRENT WORKLOAD)
// =====================================================================
//
// This is the CONTROL group of the Current-vs-Lightweight comparison.
// It reproduces, as closely as possible, the SAME workload as the
// previous successful test (load-tests/supabase-read-load.js):
//   * same real Supabase project (PostgREST -> PostgreSQL)
//   * same endpoints, same query parameters, same headers
//   * same user behavior (browsing order), same sleep() pauses
//   * same test durations and VU stages
//
// Read-only. No INSERT / UPDATE / DELETE / signup / order / admin ops.
// Uses ONLY the public anon (publishable) key — never service_role.
//
// Run example (PowerShell):
//   k6 run -e SUPABASE_URL=https://ygkeuhatokvkdwwoccty.supabase.co `
//          -e SUPABASE_ANON_KEY=<anon key> `
//          -e MAX_VUS=500 -e SUSTAIN_DURATION=2m load-tests/supabase-current-load.js
//
// Compared against load-tests/supabase-lightweight-load.js
// (the ONLY difference is the query/payload weight; everything else is identical).
// =====================================================================

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter } from 'k6/metrics';

const statuses = new Counter('http_statuses');

// ---------------------------------------------------------------------
// ENVIRONMENT (no secrets — anon key passed at runtime only)
// ---------------------------------------------------------------------
const SUPABASE_URL = __ENV.SUPABASE_URL;
const SUPABASE_ANON_KEY = __ENV.SUPABASE_ANON_KEY;

const MAX_VUS = Number(__ENV.MAX_VUS || 100);
const RAMP_UP = __ENV.RAMP_UP || '90s';
const SUSTAIN = __ENV.SUSTAIN_DURATION || '2m';
const RAMP_DOWN = __ENV.RAMP_DOWN || '60s';

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error('SUPABASE_URL and SUPABASE_ANON_KEY are required (public anon key only).');
}

const REST = `${SUPABASE_URL.replace(/\/+$/, '')}/rest/v1`;

const ANON_HEADERS = {
  apikey: SUPABASE_ANON_KEY,
  Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  Accept: 'application/json',
  'Content-Type': 'application/json',
};

// ---- Real select strings, copied from src/services/product.service.ts ----
const PRODUCT_LIST_SELECT =
  'id,name,slug,price,original_price,is_promotion,is_featured,image_url,image_url_400,image_url_800,brand,created_at,category_id,subcategory_id,categories(name,slug),subcategories(name)';

const PRODUCT_DETAIL_SELECT =
  'id,name,slug,description,ingredients,how_to_use,price,original_price,is_promotion,is_featured,is_active,image_url,image_url_400,image_url_800,video_url,category_id,subcategory_id,stock_quantity,weight_grams,brand,location_city,location_url,show_location,created_at,updated_at,categories(name,slug),subcategories(name),product_images(id,url,sort_order)';

function trackedGet(url, tags, extraHeaders) {
  const headers = extraHeaders ? { ...ANON_HEADERS, ...extraHeaders } : ANON_HEADERS;
  const res = http.get(url, { headers, tags });
  statuses.add(1, { code: String(res.status) });
  return res;
}

// ---------------------------------------------------------------------
// OPTIONS — identical staged profile to the baseline test
// ---------------------------------------------------------------------
export const options = {
  stages: [
    { duration: RAMP_UP, target: MAX_VUS },
    { duration: SUSTAIN, target: MAX_VUS },
    { duration: RAMP_DOWN, target: 0 },
  ],
  thresholds: {
    http_req_failed: ['rate<0.05'],
    http_req_duration: ['p(95)<2000'],
  },
  noConnectionReuse: false,
  // p99 is now also recorded in the JSON export (was missing in baseline).
  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)'],
};

// ---------------------------------------------------------------------
// SETUP — reads REAL rows (product slugs + categories) like the app
// ---------------------------------------------------------------------
export function setup() {
  const productsRes = http.get(
    `${REST}/products?select=slug&is_active=eq.true&order=created_at.desc&limit=10`,
    { headers: ANON_HEADERS, tags: { name: 'setup_products_slugs' } }
  );
  let slugs = [];
  if (productsRes.status === 200) {
    slugs = productsRes.json().map((p) => p.slug).filter(Boolean);
  }

  const catsRes = http.get(
    `${REST}/categories?select=id,slug,name&order=sort_order.asc`,
    { headers: ANON_HEADERS, tags: { name: 'setup_categories' } }
  );
  let categories = [];
  if (catsRes.status === 200) {
    categories = catsRes.json();
  }

  return { slugs, categories };
}

function pick(arr) {
  if (!arr || arr.length === 0) return null;
  return arr[Math.floor(Math.random() * arr.length)];
}

// ---------------------------------------------------------------------
// MAIN — one virtual user = one realistic browsing session
// ---------------------------------------------------------------------
export default function (data) {
  const { slugs, categories } = data;

  // ---- Page: Home "/" --------------------------------------------------
  const settings = trackedGet(`${REST}/site_settings?select=*&limit=1`, {
    name: 'home_site_settings',
  });
  check(settings, { 'home settings 200': (r) => r.status === 200 });

  const categoriesRes = trackedGet(`${REST}/categories?select=*&order=sort_order.asc`, {
    name: 'home_categories',
  });
  check(categoriesRes, { 'home categories 200': (r) => r.status === 200 });

  const homeProducts = trackedGet(
    `${REST}/products?select=${PRODUCT_LIST_SELECT}&is_active=eq.true&order=created_at.desc&limit=60`,
    { name: 'home_active_products' }
  );
  check(homeProducts, { 'home products 200': (r) => r.status === 200 });

  const promos = trackedGet(`${REST}/promos?select=*&is_active=eq.true&order=sort_order.asc`, {
    name: 'home_promos',
  });
  check(promos, { 'home promos 200': (r) => r.status === 200 });

  sleep(1.5 + Math.random() * 2.5); // browsing pause

  // ---- Page: Product detail "/produits/:slug" ---------------------------
  const slug = pick(slugs);
  if (slug) {
    const detail = trackedGet(
      `${REST}/products?select=${PRODUCT_DETAIL_SELECT}&is_active=eq.true&slug=eq.${encodeURIComponent(slug)}&limit=1`,
      { name: 'product_detail' }
    );
    check(detail, { 'product detail 200': (r) => r.status === 200 });
  }

  sleep(1 + Math.random() * 2); // browsing pause

  // ---- Page: Catalog with category filter "/produits?categorie=..." -------
  const cat = pick(categories);
  if (cat) {
    const subRes = trackedGet(
      `${REST}/subcategories?select=*&category_id=eq.${cat.id}&order=sort_order.asc`,
      { name: 'catalog_subcategories' }
    );
    check(subRes, { 'subcategories 200': (r) => r.status === 200 });

    const catProducts = trackedGet(
      `${REST}/products?select=${PRODUCT_LIST_SELECT}&is_active=eq.true&category_id=eq.${cat.id}&order=created_at.desc&offset=0&limit=16`,
      { name: 'catalog_products' },
      { Prefer: 'count=exact' }
    ); // supabase-js `.select(..., { count: 'exact' })` sends `Prefer: count=exact`
    check(catProducts, { 'catalog products 200': (r) => r.status === 200 });
  }

  // ---- Search "/produits?q=..." (exact .or() filter used by the app) -----
  const search = trackedGet(
    `${REST}/products?select=id,name,slug,price,image_url,image_url_400,image_url_800,brand&is_active=eq.true&or=(search_vector.phfts.creme,name.ilike.%25creme%25,brand.ilike.%25creme%25)&limit=16&offset=0`,
    { name: 'search_products' },
    { Prefer: 'count=exact' }
  ); // supabase-js `.select(..., { count: 'exact' })` sends `Prefer: count=exact`
  check(search, { 'search 200': (r) => r.status === 200 });

  sleep(2 + Math.random() * 3); // end-of-session pause
}

// ---------------------------------------------------------------------
// SUMMARY — JSON export per run
// ---------------------------------------------------------------------
export function handleSummary(data) {
  const vu = __ENV.MAX_VUS || '?';
  return {
    [`load-tests/results/comparison-current-${vu}vu.json`]: JSON.stringify(data, null, 2),
  };
}
