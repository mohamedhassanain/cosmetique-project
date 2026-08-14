// =====================================================================
// KISSARIYA - CONTROLLED SUPABASE BOTTLENECK INVESTIGATION (A -> H)
// =====================================================================
// Progressive, reproducible, per-workload tests against the REAL Supabase
// project (read-only by default; write scenarios F/G require a DEDICATED
// test project and the Edge Functions deployed).
//
// Modes (WORKLOAD):
//   A  product listing      (products, active, limit 60)
//   B  product search       (hybrid search_vector.phfts + ilike)
//   C  categories           (categories + subcategories)
//   D  site settings        (site_settings)
//   E  product details      (by slug, full public select)
//   F  order creation       (POST Edge Function create-order: rate limited)
//   G  contact message      (POST Edge Function create-contact: rate limited)
//   H  mixed browsing       (home -> detail -> catalog -> search)
//
// F/G test the protected write path's rate limiting (3/10min per IP):
// keep MAX_VUS <= 5 and expect 201s then 429s. NEVER run against
// production.
//
// Metrics: counters for status buckets (2xx/4xx/429/5xx/timeout) exported
// per run for dashboard correlation.
//
// Usage (read-only - levels 50/100/250/500/700/1000):
//   k6 run -e SUPABASE_URL=https://xxx.supabase.co -e SUPABASE_ANON_KEY=<anon> \
//          -e WORKLOAD=H -e MAX_VUS=500 k6/bottleneck-controlled.js
// =====================================================================
import http from "k6/http";
import { check, sleep } from "k6";
import { Counter } from "k6/metrics";

const status2xx = new Counter("status_2xx");
const status4xx = new Counter("status_4xx");
const status429 = new Counter("status_429");
const status5xx = new Counter("status_5xx");
const statusTimeout = new Counter("status_timeout");

const SUPABASE_URL = __ENV.SUPABASE_URL;
const SUPABASE_ANON_KEY = __ENV.SUPABASE_ANON_KEY;
const WORKLOAD = __ENV.WORKLOAD || "H";

const MAX_VUS = Number(__ENV.MAX_VUS || 100);
const RAMP_UP = __ENV.RAMP_UP || "30s";
const SUSTAIN = __ENV.SUSTAIN_DURATION || "2m";
const RAMP_DOWN = __ENV.RAMP_DOWN || "30s";

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error("SUPABASE_URL and SUPABASE_ANON_KEY are required (anon only).");
}

const writeWorkloads = ["F", "G"];
if (writeWorkloads.indexOf(WORKLOAD) !== -1 && Number(MAX_VUS) > 5) {
  throw new Error("WORKLOAD=" + WORKLOAD + " tests the rate limiter: keep MAX_VUS <= 5 (limit 3/10min per IP).");
}

const REST = SUPABASE_URL.replace(/\/+$/, "") + "/rest/v1";
const EDGE = SUPABASE_URL.replace(/\/+$/, "") + "/functions/v1";

const ANON_HEADERS = { apikey: SUPABASE_ANON_KEY, Authorization: "Bearer " + SUPABASE_ANON_KEY, Accept: "application/json", "Content-Type": "application/json" };

const SITE_SETTINGS_SELECT = "site_name,site_description,whatsapp_number,logo_url,hero_title,hero_subtitle";
const CATEGORIES_SELECT = "id,name,slug";
const SUBCATEGORIES_SELECT = "id,category_id,name,slug";
const PROMOS_SELECT = "id,badge,title,subtitle,link,image_url,sort_order";
const PRODUCT_LIST_SELECT = "id,name,slug,price,original_price,is_promotion,is_featured,image_url,image_url_400,image_url_800,brand,category_id,subcategory_id,categories(name,slug)";
const PRODUCT_DETAIL_SELECT = "id,name,slug,description,ingredients,how_to_use,price,original_price,is_promotion,is_featured,image_url,image_url_800,video_url,category_id,subcategory_id,stock_quantity,weight_grams,brand,location_city,location_url,show_location,categories(name,slug)";
const SEARCH_SELECT = "id,name,slug,price,image_url,image_url_400,image_url_800,brand";

export const options = {
  stages: [
    { duration: RAMP_UP, target: MAX_VUS },
    { duration: SUSTAIN, target: MAX_VUS },
    { duration: RAMP_DOWN, target: 0 },
  ],
  thresholds: {
    http_req_failed: ["rate<0.05"],
  },
  noConnectionReuse: false,
  summaryTrendStats: ["avg", "min", "med", "max", "p(90)", "p(95)", "p(99)"],
};

function track(res) {
  if (res.status >= 200 && res.status < 300) status2xx.add(1);
  else if (res.status === 429) status429.add(1);
  else if (res.status >= 500) status5xx.add(1);
  else if (res.status >= 400) status4xx.add(1);
  if (res.timings.duration >= 60000) statusTimeout.add(1);
  return res;
}

function get(url, name) {
  return track(http.get(url, { headers: ANON_HEADERS, tags: { name: name } }));
}

function post(url, body, name) {
  return track(http.post(url, JSON.stringify(body), { headers: ANON_HEADERS, tags: { name: name } }));
}

export function setup() {
  var data = { slugs: [], categories: [] };
  var p = get(REST + "/products?select=slug&is_active=eq.true&order=created_at.desc&limit=10", "setup_slugs");
  if (p.status === 200 && Array.isArray(p.json())) {
    data.slugs = p.json().map(function (x) { return x.slug; }).filter(Boolean);
  }
  var c = get(REST + "/categories?select=id,name,slug&order=sort_order.asc", "setup_categories");
  if (c.status === 200 && Array.isArray(c.json())) {
    data.categories = c.json();
  }
  return data;
}

function pick(arr) {
  if (!arr || arr.length === 0) { return null; }
  return arr[Math.floor(Math.random() * arr.length)];
}

export default function (data) {
  var pause = 1 + Math.random() * 3;

  if (WORKLOAD === "A") {
    var ra = get(REST + "/products?select=" + PRODUCT_LIST_SELECT + "&is_active=eq.true&order=created_at.desc&limit=60", "A_listing");
    check(ra, { "A 200": function (x) { return x.status === 200; } });
    sleep(pause);
    return;
  }

  if (WORKLOAD === "B") {
    var terms = ["creme", "serum", "bio", "huile", "masque"];
    var t = terms[Math.floor(Math.random() * terms.length)];
    var rb = get(REST + "/products?select=" + SEARCH_SELECT + "&is_active=eq.true&or=(search_vector.phfts." + t + ",name.ilike.%25" + t + "%25,brand.ilike.%25" + t + "%25)&limit=17&offset=0", "B_search");
    check(rb, { "B 200": function (x) { return x.status === 200; } });
    sleep(pause);
    return;
  }

  if (WORKLOAD === "C") {
    var cats = get(REST + "/categories?select=id,name,slug&order=sort_order.asc", "C_categories");
    check(cats, { "C cats 200": function (x) { return x.status === 200; } });
    var cat = pick(data.categories);
    var subs = get(REST + "/subcategories?select=id,category_id,name,slug&category_id=eq." + (cat ? cat.id : "none") + "&order=sort_order.asc", "C_subcategories");
    check(subs, { "C subs 200": function (x) { return x.status === 200; } });
    sleep(pause);
    return;
  }

  if (WORKLOAD === "D") {
    var rd = get(REST + "/site_settings?select=" + SITE_SETTINGS_SELECT + "&limit=1", "D_settings");
    check(rd, { "D 200": function (x) { return x.status === 200; } });
    sleep(pause);
    return;
  }

  if (WORKLOAD === "E") {
    var slug = pick(data.slugs);
    var re = get(REST + "/products?select=" + PRODUCT_DETAIL_SELECT + "&is_active=eq.true&slug=eq." + encodeURIComponent(slug || "none") + "&limit=1", "E_detail");
    check(re, { "E 200": function (x) { return x.status === 200; } });
    sleep(pause);
    return;
  }

  if (WORKLOAD === "F") {
    var rf = post(
      EDGE + "/create-order",
      {
        product_name: "Produit test", quantity: 1, total_price: 99,
        customer_name: "k6 Bottleneck", customer_phone: "+212600000000",
        status: "pending", notes: "[k6 controlled]", website: ""
      },
      "F_create_order"
    );
    check(rf, { "F 201 or 429": function (x) { return x.status === 201 || x.status === 429; } });
    sleep(2 + Math.random() * 2);
    return;
  }

  if (WORKLOAD === "G") {
    var rg = post(
      EDGE + "/create-contact",
      {
        name: "k6 Bottleneck", email: "k6@example.com", phone: "+212600000000",
        subject: "Test", message: "Message de test longueur suffisante.", website: ""
      },
      "G_create_contact"
    );
    check(rg, { "G 201 or 429": function (x) { return x.status === 201 || x.status === 429; } });
    sleep(2 + Math.random() * 2);
    return;
  }

  // H - realistic mixed browsing
  var settings = get(REST + "/site_settings?select=*&limit=1", "H_settings");
  check(settings, { "H settings 200": function (x) { return x.status === 200; } });

  var categories = get(REST + "/categories?select=" + CATEGORIES_SELECT + "&order=sort_order.asc", "H_categories");
  check(categories, { "H categories 200": function (x) { return x.status === 200; } });

  var promos = get(REST + "/promos?select=" + PROMOS_SELECT + "&is_active=eq.true&order=sort_order.asc", "H_promos");
  check(promos, { "H promos 200": function (x) { return x.status === 200; } });

  var homeProducts = get(REST + "/products?select=" + PRODUCT_LIST_SELECT + "&is_active=eq.true&order=created_at.desc&limit=60", "H_home_products");
  check(homeProducts, { "H home products 200": function (x) { return x.status === 200; } });

  sleep(1.5 + Math.random() * 2.5);

  var slugH = pick(data.slugs);
  if (slugH) {
    var detail = get(REST + "/products?select=" + PRODUCT_DETAIL_SELECT + "&is_active=eq.true&slug=eq." + encodeURIComponent(slugH) + "&limit=1", "H_detail");
    check(detail, { "H detail 200": function (x) { return x.status === 200; } });
  }

  sleep(1 + Math.random() * 2);

  var catH = pick(data.categories);
  if (catH) {
    var catProducts = get(REST + "/products?select=" + PRODUCT_LIST_SELECT + "&is_active=eq.true&category_id=eq." + catH.id + "&order=created_at.desc&offset=0&limit=17", "H_catalog_products");
    check(catProducts, { "H catalog 200": function (x) { return x.status === 200; } });
  }

  var sterm = ["creme", "serum", "bio"][Math.floor(Math.random() * 3)];
  var search = get(REST + "/products?select=" + SEARCH_SELECT + "&is_active=eq.true&or=(search_vector.phfts." + sterm + ",name.ilike.%25" + sterm + "%25,brand.ilike.%25" + sterm + "%25)&limit=17&offset=0", "H_search");
  check(search, { "H search 200": function (x) { return x.status === 200; } });

  sleep(2 + Math.random() * 3);
}

export function handleSummary(data) {
  var w = __ENV.WORKLOAD || "H";
  var label = __ENV.RUN_LABEL ? "-" + __ENV.RUN_LABEL : "";
  return { ["load-tests/results/controlled-" + w + "-" + (__ENV.MAX_VUS || "?") + "vu" + label + ".json"]: JSON.stringify(data, null, 2) };
}
