// =====================================================================
// KISSARIYA — READ-ONLY LOAD TEST AGAINST THE REAL SUPABASE PROJECT
// =====================================================================
//
// What this script does:
//   * Loads the REAL Supabase API (PostgREST -> PostgreSQL) of the project
//     configured in src/integrations/supabase/client.ts
//   * Performs ONLY GET/SELECT read operations that the actual application
//     performs (mirrored from src/services/*.service.ts)
//   * No INSERT / UPDATE / DELETE / signup / order creation / admin ops
//   * Uses ONLY the public "anon" (publishable) key — never service_role
//
// Run example (Windows cmd — values are the public ones already committed
// in .env.example; replace if you test a different project):
//
//   k6 run -e SUPABASE_URL=https://ygkeuhatokvkdwwoccty.supabase.co ^
//          -e SUPABASE_ANON_KEY=<anon key> ^
//          -e MAX_VUS=100 -e SUSTAIN_DURATION=2m load-tests/supabase-read-load.js
//
// Progressive levels: MAX_VUS = 100 / 500 / 1000 / 2000 / 5000
// =====================================================================

import http from 'k6/http';
import { check, sleep } from 'k6';

// ---------------------------------------------------------------------
// ENVIRONMENT (no secrets anywhere — anon key only)
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

// ---------------------------------------------------------------------
// OPTIONS — staged load: ramp-up -> sustained -> ramp-down
// ---------------------------------------------------------------------
export const options = {
  stages: [
    { duration: RAMP_UP, target: MAX_VUS },
    { duration: SUSTAIN, target: MAX_VUS },
    { duration: RAMP_DOWN, target: 0 },
  ],
  // Thresholds are MEASUREMENT GATES, not claims about what Supabase
  // "should" support. If they are breached the run is flagged unstable.
  thresholds: {
    http_req_failed: ['rate<0.05'],
    http_req_duration: ['p(95)<2000'],
  },
  noConnectionReuse: false,
};

// ---------------------------------------------------------------------
// SETUP — runs once. Reads REAL rows so VUs browse real products.
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

  // ---- Page: Home "/" ------------------------------------------------
  const settings = http.get(`${REST}/site_settings?select=*&limit=1`, {
    headers: ANON_HEADERS,
    tags: { name: 'home_site_settings' },
  });
  check(settings, { 'home settings 200': (r) => r.status === 200 });

  const categoriesRes = http.get(`${REST}/categories?select=*&order=sort_order.asc`, {
    headers: ANON_HEADERS,
    tags: { name: 'home_categories' },
  });
  check(categoriesRes, { 'home categories 200': (r) => r.status === 200 });

  const homeProducts = http.get(
    `${REST}/products?select=${PRODUCT_LIST_SELECT}&is_active=eq.true&order=created_at.desc&limit=60`,
    { headers: ANON_HEADERS, tags: { name: 'home_active_products' } }
  );
  check(homeProducts, { 'home products 200': (r) => r.status === 200 });

  const promos = http.get(`${REST}/promos?select=*&is_active=eq.true&order=sort_order.asc`, {
    headers: ANON_HEADERS,
    tags: { name: 'home_promos' },
  });
  check(promos, { 'home promos 200': (r) => r.status === 200 });

  sleep(1.5 + Math.random() * 2.5); // browsing pause

  // ---- Page: Product detail "/produits/:slug" -------------------------
  const slug = pick(slugs);
  if (slug) {
    const detail = http.get(
      `${REST}/products?select=${PRODUCT_DETAIL_SELECT}&is_active=eq.true&slug=eq.${encodeURIComponent(slug)}&limit=1`,
      { headers: ANON_HEADERS, tags: { name: 'product_detail' } }
    );
    check(detail, { 'product detail 200': (r) => r.status === 200 });
  }

  sleep(1 + Math.random() * 2); // browsing pause

  // ---- Page: Catalog with category filter "/produits?categorie=..." ----
  const cat = pick(categories);
  if (cat) {
    const subRes = http.get(
      `${REST}/subcategories?select=*&category_id=eq.${cat.id}&order=sort_order.asc`,
      { headers: ANON_HEADERS, tags: { name: 'catalog_subcategories' } }
    );
    check(subRes, { 'subcategories 200': (r) => r.status === 200 });

    const catProducts = http.get(
      `${REST}/products?select=${PRODUCT_LIST_SELECT}&is_active=eq.true&category_id=eq.${cat.id}&order=created_at.desc&offset=0&limit=16`,
      { headers: { ...ANON_HEADERS, Prefer: 'count=exact' }, tags: { name: 'catalog_products' } }
    );
    check(catProducts, { 'catalog products 200': (r) => r.status === 200 });
  }

  // ---- Search "/produits?q=..." (exact .or() filter used by the app) --
  const search = http.get(
    `${REST}/products?select=id,name,slug,price,image_url,image_url_400,image_url_800,brand&is_active=eq.true&or=(search_vector.phfts.creme,name.ilike.%25creme%25,brand.ilike.%25creme%25)&limit=16&offset=0`,
    { headers: { ...ANON_HEADERS, Prefer: 'count=exact' }, tags: { name: 'search_products' } }
  );
  check(search, { 'search 200': (r) => r.status === 200 });

  sleep(2 + Math.random() * 3); // end-of-session pause
}

// ---------------------------------------------------------------------
// SUMMARY — writes a JSON export per run into load-tests/results/
// ---------------------------------------------------------------------
export function handleSummary(data) {
  const vu = __ENV.MAX_VUS || '?';
  return {
    [`load-tests/results/summary-${vu}vu.json`]: JSON.stringify(data, null, 2),
  };
}
