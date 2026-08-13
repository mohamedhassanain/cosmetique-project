// =====================================================================
// KISSARIYA — CDN vs ORIGIN COMPARISON LOAD TEST (PREPARATION)
// =====================================================================
// Purpose: later compare WITHOUT-CDN vs WITH-CDN for the SAME workload.
//   * WITHOUT-CDN run : BASE_URL=http://localhost:8080  (Docker/Nginx origin)
//   * WITH-CDN run    : BASE_URL=https://yourdomain.com (Cloudflare edge)
//
// Read-only. anon key only. Never inserts/updates/deletes. Never uses
// service_role. Same home/catalog/search/detail workload as the previous
// baseline (supabase-optimized2-load.js) so results stay comparable.
//
// Additionally performs ONE static asset request per iteration (the script
// parses the asset path from index.html once in setup()). This is the only
// part of the workload the CDN actually offloads — /rest/v1/* and /auth/v1/*
// are NEVER proxied or cached through our zone (see CLOUDFLARE_CACHE_RULES.md).
//
// Usage:
//   WITHOUT-CDN (local origin):
//     k6 run -e BASE_URL=http://localhost:8080 \
//            -e SUPABASE_URL=... -e SUPABASE_ANON_KEY=... \
//            -e MAX_VUS=600 load-tests/k6-cdn-compare.js
//   WITH-CDN (after Cloudflare connected):
//     k6 run -e BASE_URL=https://yourdomain.com \
//            -e SUPABASE_URL=... -e SUPABASE_ANON_KEY=... \
//            -e MAX_VUS=600 load-tests/k6-cdn-compare.js
// =====================================================================

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter } from 'k6/metrics';

const statuses = new Counter('http_statuses');
const cfHits = new Counter('cf_cache_hits');

const SUPABASE_URL = __ENV.SUPABASE_URL;
const SUPABASE_ANON_KEY = __ENV.SUPABASE_ANON_KEY;
const BASE_URL = (__ENV.BASE_URL || 'http://localhost:8080').replace(/\/+$/, '');

const MAX_VUS = Number(__ENV.MAX_VUS || 600);
const RAMP_UP = __ENV.RAMP_UP || '60s';
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

// ---- Identical select strings to the app (and to the prior baseline) ----
const CATEGORIES_SELECT = 'id,name,slug';
const SUBCATEGORIES_SELECT = 'id,category_id,name,slug';
const PROMOS_SELECT = 'id,badge,title,subtitle,link,image_url,sort_order';
const PRODUCT_LIST_SELECT =
  'id,name,slug,price,original_price,is_promotion,is_featured,image_url,image_url_400,image_url_800,brand,category_id,subcategory_id,categories(name,slug)';
const PRODUCT_DETAIL_SELECT =
  'id,name,slug,description,ingredients,how_to_use,price,original_price,is_promotion,is_featured,image_url,image_url_800,video_url,category_id,subcategory_id,stock_quantity,weight_grams,brand,location_city,location_url,show_location,categories(name,slug)';
const SEARCH_SELECT = 'id,name,slug,price,image_url,image_url_400,image_url_800,brand';

function trackedGet(url, tags, headers) {
  const res = http.get(url, { headers: headers || ANON_HEADERS, tags });
  statuses.add(1, { code: String(res.status) });
  if (res.headers['Cf-Cache-Status'] === 'HIT' || res.headers['cf-cache-status'] === 'HIT') {
    cfHits.add(1, tags);
  }
  return res;
}

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
  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)'],
};

export function setup() {
  // Resolve once: a representative product slug, a category, and the hashed
  // static asset path from the served index.html.
  const products = http
    .get(`${REST}/products?select=slug&is_active=eq.true&order=created_at.desc&limit=10`, {
      headers: ANON_HEADERS,
      tags: { name: 'setup_products_slugs' },
    })
    .json();
  const slugs = Array.isArray(products) ? products.map((p) => p.slug).filter(Boolean) : [];

  const cats = http
    .get(`${REST}/categories?select=${CATEGORIES_SELECT}&order=sort_order.asc`, {
      headers: ANON_HEADERS,
      tags: { name: 'setup_categories' },
    })
    .json();
  const categories = Array.isArray(cats) ? cats : [];

  const indexRes = http.get(`${BASE_URL}/`, { tags: { name: 'setup_index_html' } });
  const assetMatch = indexRes.body.match(/\/assets\/[^"'?]+\.js/);
  const assetPath = assetMatch ? assetMatch[0] : null;

  return { slugs, categories, assetPath };
}

function pick(arr) {
  if (!arr || arr.length === 0) return null;
  return arr[Math.floor(Math.random() * arr.length)];
}

export default function (data) {
  const { slugs, categories, assetPath } = data;

  // ---- Home (identical to baseline) ----
  const settings = trackedGet(`${REST}/site_settings?select=*&limit=1`, { name: 'home_site_settings' });
  check(settings, { 'home settings 200': (r) => r.status === 200 });

  const categoriesRes = trackedGet(`${REST}/categories?select=${CATEGORIES_SELECT}&order=sort_order.asc`, {
    name: 'home_categories',
  });
  check(categoriesRes, { 'home categories 200': (r) => r.status === 200 });

  const subRes = trackedGet(`${REST}/subcategories?select=${SUBCATEGORIES_SELECT}&order=sort_order.asc`, {
    name: 'home_subcategories_all',
  });
  check(subRes, { 'home subcategories 200': (r) => r.status === 200 });

  const promos = trackedGet(`${REST}/promos?select=${PROMOS_SELECT}&is_active=eq.true&order=sort_order.asc`, {
    name: 'home_promos',
  });
  check(promos, { 'home promos 200': (r) => r.status === 200 });

  const homeProducts = trackedGet(
    `${REST}/products?select=${PRODUCT_LIST_SELECT}&is_active=eq.true&order=created_at.desc&limit=60`,
    { name: 'home_active_products' }
  );
  check(homeProducts, { 'home products 200': (r) => r.status === 200 });

  sleep(1.5 + Math.random() * 2.5);

  // ---- Product detail (identical to baseline) ----
  const slug = pick(slugs);
  if (slug) {
    const detail = trackedGet(
      `${REST}/products?select=${PRODUCT_DETAIL_SELECT}&is_active=eq.true&slug=eq.${encodeURIComponent(
        slug
      )}&limit=1`,
      { name: 'product_detail' }
    );
    check(detail, { 'product detail 200': (r) => r.status === 200 });
  }

  // ---- SPA shell + a hashed static asset (CDN-sensitive part) ----
  const spa = trackedGet(`${BASE_URL}/produits`, { name: 'spa_catalog_page' }, { Accept: 'text/html' });
  check(spa, { 'spa 200': (r) => r.status === 200 });

  if (assetPath) {
    const asset = trackedGet(`${BASE_URL}${assetPath}`, { name: 'static_asset' });
    check(asset, { 'asset 200': (r) => r.status === 200 });
  }

  sleep(1 + Math.random() * 2);

  // ---- Catalog with category filter (same as baseline, no count) ----
  const cat = pick(categories);
  if (cat) {
    const catProducts = trackedGet(
      `${REST}/products?select=${PRODUCT_LIST_SELECT}&is_active=eq.true&category_id=eq.${cat.id}&order=created_at.desc&offset=0&limit=17`,
      { name: 'catalog_products' }
    );
    check(catProducts, { 'catalog products 200': (r) => r.status === 200 });
  }

  // ---- Search (same as baseline, no count) ----
  const search = trackedGet(
    `${REST}/products?select=${SEARCH_SELECT}&is_active=eq.true&or=(search_vector.phfts.creme,name.ilike.%25creme%25,brand.ilike.%25creme%25)&limit=17&offset=0`,
    { name: 'search_products' }
  );
  check(search, { 'search 200': (r) => r.status === 200 });

  sleep(2 + Math.random() * 3);
}

export function handleSummary(data) {
  const tag = (__ENV.TAG || 'cdn-compare').replace(/[^a-zA-Z0-9_-]/g, '');
  return {
    [`load-tests/results/${tag}-${MAX_VUS}vu.json`]: JSON.stringify(data, null, 2),
  };
}
