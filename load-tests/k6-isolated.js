import http from "k6/http";
import { check, sleep } from "k6";
const SUPABASE_URL = __ENV.SUPABASE_URL;
const SUPABASE_ANON_KEY = __ENV.SUPABASE_ANON_KEY;const ENDPOINT = __ENV.ENDPOINT || "home";
const MAX_VUS = Number(__ENV.MAX_VUS || 100);
const RAMP_UP = __ENV.RAMP_UP || "20s";
const SUSTAIN = __ENV.SUSTAIN_DURATION || "60s";
const RAMP_DOWN = __ENV.RAMP_DOWN || "20s";
const REST = SUPABASE_URL.replace(/\/+$/, "") + "/rest/v1";
const ANON_HEADERS = { apikey: SUPABASE_ANON_KEY, Authorization: "Bearer " + SUPABASE_ANON_KEY, Accept: "application/json", "Content-Type": "application/json" };
const SITE_SETTINGS_SELECT = "site_name,site_description,whatsapp_number,logo_url,hero_title,hero_subtitle";
const CATEGORIES_SELECT = "id,name,slug";
const SUBCATEGORIES_SELECT = "id,category_id,name,slug";
const PROMOS_SELECT = "id,badge,title,subtitle,link,image_url,sort_order";
const PRODUCT_LIST_SELECT = "id,name,slug,price,original_price,is_promotion,is_featured,image_url,image_url_400,image_url_800,brand,category_id,subcategory_id,categories(name,slug)";
const PRODUCT_DETAIL_SELECT = "id,name,slug,description,ingredients,how_to_use,price,original_price,is_promotion,is_featured,image_url,image_url_800,video_url,category_id,subcategory_id,stock_quantity,weight_grams,brand,location_city,location_url,show_location,categories(name,slug)";
const SEARCH_SELECT = "id,name,slug,price,image_url,image_url_400,image_url_800,brand";
export const options = { stages: [ { duration: RAMP_UP, target: MAX_VUS }, { duration: SUSTAIN, target: MAX_VUS }, { duration: RAMP_DOWN, target: 0 } ], thresholds: { http_req_failed: ["rate<0.05"], http_req_duration: ["p(95)<2000"] }, summaryTrendStats: ["avg", "min", "med", "max", "p(90)", "p(95)", "p(99)"] };
export function setup() {
  const productsRes = http.get(REST + "/products?select=slug&is_active=eq.true&order=created_at.desc&limit=10", { headers: ANON_HEADERS, tags: { name: "setup_products_slugs" } });
  let slugs = [];
  if (productsRes.status === 200) { slugs = productsRes.json().map(function (p) { return p.slug; }).filter(Boolean); }
  const catsRes = http.get(REST + "/categories?select=id,name,slug&order=sort_order.asc", { headers: ANON_HEADERS, tags: { name: "setup_categories" } });
  let categories = [];
  if (catsRes.status === 200) { categories = catsRes.json(); }
  return { slugs: slugs, categories: categories };
}
function pick(arr) { if (!arr || arr.length === 0) { return null; } return arr[Math.floor(Math.random() * arr.length)]; }
function gh(url, name) { return http.get(url, { headers: ANON_HEADERS, tags: { name: name } }); }
export default function (data) {
  if (ENDPOINT === "catalog") {
    const cats = gh(REST + "/categories?select=id,name,slug&order=sort_order.asc", "catalog_categories");
    check(cats, { "cats 200": (r) => r.status === 200 });
    const cat = pick(data.categories);
    const subs = gh(REST + "/subcategories?select=id,category_id,name,slug&category_id=eq." + (cat ? cat.id : "none") + "&order=sort_order.asc", "catalog_subcategories");
    check(subs, { "subs 200": (r) => r.status === 200 });
    const catProducts = gh(REST + "/products?select=" + PRODUCT_LIST_SELECT + "&is_active=eq.true" + (cat ? "&category_id=eq." + cat.id : "") + "&order=created_at.desc&offset=0&limit=17", "catalog_products");
    check(catProducts, { "products 200": (r) => r.status === 200 });
    sleep(2 + Math.random() * 3);
    return;
  }
  if (ENDPOINT === "search") {
    const terms = ["creme", "serum", "bio"];
    const term = terms[Math.floor(Math.random() * terms.length)];
    const search = gh(REST + "/products?select=" + SEARCH_SELECT + "&is_active=eq.true&or=(search_vector.phfts." + term + ",name.ilike.%25" + term + "%25,brand.ilike.%25" + term + "%25)&limit=17&offset=0", "search_products");
    check(search, { "search 200": (r) => r.status === 200 });
    sleep(2 + Math.random() * 3);
    return;
  }
  if (ENDPOINT === "detail") {
    const slug = pick(data.slugs);
    const detail = gh(REST + "/products?select=" + PRODUCT_DETAIL_SELECT + "&is_active=eq.true&slug=eq." + (slug ? encodeURIComponent(slug) : "none") + "&limit=1", "product_detail");
    check(detail, { "detail 200": (r) => r.status === 200 });
    sleep(2 + Math.random() * 3);
    return;
  }
  var settings = gh(REST + "/site_settings?select=" + SITE_SETTINGS_SELECT + "&limit=1", "home_site_settings");
  check(settings, { "settings 200": (r) => r.status === 200 });
  var cats = gh(REST + "/categories?select=" + CATEGORIES_SELECT + "&order=sort_order.asc", "home_categories");
  check(cats, { "cats 200": (r) => r.status === 200 });
  var subs = gh(REST + "/subcategories?select=" + SUBCATEGORIES_SELECT + "&order=sort_order.asc", "home_subcategories_all");
  check(subs, { "subs 200": (r) => r.status === 200 });
  var promos = gh(REST + "/promos?select=" + PROMOS_SELECT + "&is_active=eq.true&order=sort_order.asc", "home_promos");
  check(promos, { "promos 200": (r) => r.status === 200 });
  var products = gh(REST + "/products?select=" + PRODUCT_LIST_SELECT + "&is_active=eq.true&order=created_at.desc&limit=24", "home_active_products");
  check(products, { "products 200": (r) => r.status === 200 });
  sleep(2 + Math.random() * 3);
}
export function handleSummary(data) {
  return { ["load-tests/results/k6-" + ENDPOINT + "-" + __ENV.MAX_VUS + "vu.json"]: JSON.stringify(data, null, 2) };
}
