// =====================================================================
// KISSARIYA — DIAGNOSTIC LOAD TEST (LIGHTWEIGHT WORKLOAD)
// =====================================================================
//
// This is the EXPERIMENT group of the Current-vs-Lightweight comparison.
//
// It hits the SAME real Supabase project, the SAME tables, the SAME
// WHERE filters, the SAME endpoints, the SAME user behavior (browsing
// order), the SAME sleep() pauses, and the SAME VU stages as
// load-tests/supabase-current-load.js.
//
// The ONLY difference is the QUERY/PAYLOAD WEIGHT:
//   * `select=*`          -> only the columns actually rendered by the public UI
//   * embedded relations  -> removed (no `categories(...)`, `subcategories(...)`,
//                            `product_images(...)` joins on read paths)
//   * `Prefer: count=exact` -> removed (PostgREST runs an extra exact COUNT over
//                            the full filtered set — this test measures its cost)
//   * same limits/offsets/orders/filters (WHERE clause unchanged)
//
// No schema change. No index. No app change. Read-only. Uses ONLY the
// public anon key — never service_role.
//
// Run example (PowerShell):
//   k6 run -e SUPABASE_URL=https://ygkeuhatokvkdwwoccty.supabase.co `
//          -e SUPABASE_ANON_KEY=<anon key> `
//          -e MAX_VUS=500 -e SUSTAIN_DURATION=2m load-tests/supabase-lightweight-load.js
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

// ---------------------------------------------------------------------
// LIGHTWEIGHT SELECTS — only columns the public storefront actually renders
// (based on src/types/product.ts, src/types/category.ts, src/types/site.ts).
// No embedded relations, no timestamps where the UI does not show them.
// ---------------------------------------------------------------------

// Home/hero + footer: rendered fields only.
const SITE_SETTINGS_LIGHT =
  'id,site_name,whatsapp_number,logo_url,hero_title,hero_subtitle,free_shipping_min';

// Nav menu + mega menu: name + slug are what the UI renders & links to.
const CATEGORIES_LIGHT = 'id,name,slug';

// Filter chips on the catalog page.
const SUBCATEGORIES_LIGHT = 'id,name,slug';

// Product cards (home + catalog): card columns only, no joins, no created_at.
const PRODUCT_LIST_LIGHT =
  'id,name,slug,price,original_price,is_promotion,is_featured,image_url,image_url_400,image_url_800,brand,category_id,subcategory_id';

// Product page: the actually displayed fields. The 3 embedded relations
// (categories, subcategories, product_images) are removed — in a real
// optimization they would be fetched by separate lightweight queries.
// created_at / updated_at / is_featured are not rendered on the page.
const PRODUCT_DETAIL_LIGHT =
  'id,name,slug,description,ingredients,how_to_use,price,original_price,is_promotion,is_active,image_url,image_url_400,image_url_800,video_url,category_id,subcategory_id,stock_quantity,weight_grams,brand,location_city,location_url,show_location';

// Hero carousel: rendered fields only, no timestamps.
const PROMOS_LIGHT = 'id,badge,title,subtitle,link,image_url,sort_order';

// Search results render these columns (already narrow in current workload).
const SEARCH_SELECT = 'id,name,slug,price,image_url,image_url_400,image_url_800,brand';

function trackedGet(url, tags) {
  const res = http.get(url, { headers: ANON_HEADERS, tags });
  statuses.add(1, { code: String(res.status) });
  return res;
}

// ---------------------------------------------------------------------
// OPTIONS — identical staged profile to the control group
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
  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)'],
};

// ---------------------------------------------------------------------
// SETUP — reads REAL rows exactly like the control group
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
// MAIN — identical browsing order & pauses as the control group
// ---------------------------------------------------------------------
export default function (data) {
  const { slugs, categories } = data;

  // ---- Page: Home "/" ---------------------------------------------------
  const settings = trackedGet(`${REST}/site_settings?select=${SITE_SETTINGS_LIGHT}&limit=1`, {
    name: 'home_site_settings',
  });
  check(settings, { 'home settings 200': (r) => r.status === 200 });

  const categoriesRes = trackedGet(`${REST}/categories?select=${CATEGORIES_LIGHT}&order=sort_order.asc`, {
    name: 'home_categories',
  });
  check(categoriesRes, { 'home categories 200': (r) => r.status === 200 });

  const homeProducts = trackedGet(
    `${REST}/products?select=${PRODUCT_LIST_LIGHT}&is_active=eq.true&order=created_at.desc&limit=60`,
    { name: 'home_active_products' }
  );
  check(homeProducts, { 'home products 200': (r) => r.status === 200 });

  const promos = trackedGet(`${REST}/promos?select=${PROMOS_LIGHT}&is_active=eq.true&order=sort_order.asc`, {
    name: 'home_promos',
  });
  check(promos, { 'home promos 200': (r) => r.status === 200 });

  sleep(1.5 + Math.random() * 2.5); // browsing pause

  // ---- Page: Product detail "/produits/:slug" ----------------------------
  const slug = pick(slugs);
  if (slug) {
    const detail = trackedGet(
      `${REST}/products?select=${PRODUCT_DETAIL_LIGHT}&is_active=eq.true&slug=eq.${encodeURIComponent(slug)}&limit=1`,
      { name: 'product_detail' }
    );
    check(detail, { 'product detail 200': (r) => r.status === 200 });
  }

  sleep(1 + Math.random() * 2); // browsing pause

  // ---- Page: Catalog with category filter "/produits?categorie=..." ------
  const cat = pick(categories);
  if (cat) {
    const subRes = trackedGet(
      `${REST}/subcategories?select=${SUBCATEGORIES_LIGHT}&category_id=eq.${cat.id}&order=sort_order.asc`,
      { name: 'catalog_subcategories' }
    );
    check(subRes, { 'subcategories 200': (r) => r.status === 200 });

    // count=exact removed: same rows & filters, but no extra exact COUNT.
    const catProducts = trackedGet(
      `${REST}/products?select=${PRODUCT_LIST_LIGHT}&is_active=eq.true&category_id=eq.${cat.id}&order=created_at.desc&offset=0&limit=16`,
      { name: 'catalog_products' }
    );
    check(catProducts, { 'catalog products 200': (r) => r.status === 200 });
  }

  // ---- Search "/produits?q=..." (same .or() filter; count=exact removed) --
  const search = trackedGet(
    `${REST}/products?select=${SEARCH_SELECT}&is_active=eq.true&or=(search_vector.phfts.creme,name.ilike.%25creme%25,brand.ilike.%25creme%25)&limit=16&offset=0`,
    { name: 'search_products' }
  );
  check(search, { 'search 200': (r) => r.status === 200 });

  sleep(2 + Math.random() * 3); // end-of-session pause
}

// ---------------------------------------------------------------------
// SUMMARY — JSON export per run
// ---------------------------------------------------------------------
export function handleSummary(data) {
  const vu = __ENV.MAX_VUS || '?';
  return {
    [`load-tests/results/comparison-lightweight-${vu}vu.json`]: JSON.stringify(data, null, 2),
  };
}
