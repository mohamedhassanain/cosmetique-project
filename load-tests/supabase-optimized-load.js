// =====================================================================
// KISSARIYA — LOAD TEST (OPTIMIZED WORKLOAD — AFTER)
// =====================================================================
// Same methodology and geometry as load-tests/supabase-current-load.js
// (BEFORE): same real Supabase project, same browsing order, same
// sleep() pauses, same VU stages, read-only, anon key only.
//
// The ONLY difference is the QUERY/PAYLOAD SHAPE, mirroring the app
// after the frontend optimization work:
//   * categories  : select=id,name,slug (was select=*)
//   * subcategories : ONE request, select=id,category_id,name,slug
//                     (app now fetches all in a single query; no N+1)
//   * promos      : select=id,badge,title,subtitle,link,image_url,sort_order
//   * home list   : no created_at, no subcategories embed
//   * catalog list: no created_at, no subcategories embed
//                   (count=exact KEPT — the UI renders "X produit(s)" + pagination)
//   * detail      : public detail select (no product_images/created_at/
//                   updated_at/is_active/subcategories embeds)
//   * search      : same .or() filter, count=exact kept (UI total)
// =====================================================================

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter } from 'k6/metrics';

const statuses = new Counter('http_statuses');

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

// ---- AFTER select strings (mirror src/services/*.service.ts) ----
const CATEGORIES_SELECT = 'id,name,slug';
const SUBCATEGORIES_SELECT = 'id,category_id,name,slug';
const PROMOS_SELECT = 'id,badge,title,subtitle,link,image_url,sort_order';

const PRODUCT_LIST_SELECT =
  'id,name,slug,price,original_price,is_promotion,is_featured,image_url,image_url_400,image_url_800,brand,category_id,subcategory_id,categories(name,slug)';

const PRODUCT_DETAIL_SELECT =
  'id,name,slug,description,ingredients,how_to_use,price,original_price,is_promotion,is_featured,image_url,image_url_800,video_url,category_id,subcategory_id,stock_quantity,weight_grams,brand,location_city,location_url,show_location,categories(name,slug)';

const SEARCH_SELECT = 'id,name,slug,price,image_url,image_url_400,image_url_800,brand';

function trackedGet(url, tags, extraHeaders) {
  const headers = extraHeaders ? { ...ANON_HEADERS, ...extraHeaders } : ANON_HEADERS;
  const res = http.get(url, { headers, tags });
  statuses.add(1, { code: String(res.status) });
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
  const productsRes = http.get(
    `${REST}/products?select=slug&is_active=eq.true&order=created_at.desc&limit=10`,
    { headers: ANON_HEADERS, tags: { name: 'setup_products_slugs' } }
  );
  let slugs = [];
  if (productsRes.status === 200) {
    slugs = productsRes.json().map((p) => p.slug).filter(Boolean);
  }

  const catsRes = http.get(
    `${REST}/categories?select=${CATEGORIES_SELECT}&order=sort_order.asc`,
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

export default function (data) {
  const { slugs, categories } = data;

  // ---- Page: Home "/" ----
  const settings = trackedGet(`${REST}/site_settings?select=*&limit=1`, {
    name: 'home_site_settings',
  });
  check(settings, { 'home settings 200': (r) => r.status === 200 });

  const categoriesRes = trackedGet(`${REST}/categories?select=${CATEGORIES_SELECT}&order=sort_order.asc`, {
    name: 'home_categories',
  });
  check(categoriesRes, { 'home categories 200': (r) => r.status === 200 });

  // App now fetches ALL subcategories in ONE query (footer + mega menu).
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

  // ---- Page: Product detail ----
  const slug = pick(slugs);
  if (slug) {
    const detail = trackedGet(
      `${REST}/products?select=${PRODUCT_DETAIL_SELECT}&is_active=eq.true&slug=eq.${encodeURIComponent(slug)}&limit=1`,
      { name: 'product_detail' }
    );
    check(detail, { 'product detail 200': (r) => r.status === 200 });
  }

  sleep(1 + Math.random() * 2);

  // ---- Page: Catalog with category filter ----
  const cat = pick(categories);
  if (cat) {
    const catProducts = trackedGet(
      `${REST}/products?select=${PRODUCT_LIST_SELECT}&is_active=eq.true&category_id=eq.${cat.id}&order=created_at.desc&offset=0&limit=16`,
      { name: 'catalog_products' },
      { Prefer: 'count=exact' }
    );
    check(catProducts, { 'catalog products 200': (r) => r.status === 200 });
  }

  // ---- Search ----
  const search = trackedGet(
    `${REST}/products?select=${SEARCH_SELECT}&is_active=eq.true&or=(search_vector.phfts.creme,name.ilike.%25creme%25,brand.ilike.%25creme%25)&limit=16&offset=0`,
    { name: 'search_products' },
    { Prefer: 'count=exact' }
  );
  check(search, { 'search 200': (r) => r.status === 200 });

  sleep(2 + Math.random() * 3);
}

export function handleSummary(data) {
  const vu = __ENV.MAX_VUS || '?';
  return {
    [`load-tests/results/optimized-${vu}vu.json`]: JSON.stringify(data, null, 2),
  };
}
