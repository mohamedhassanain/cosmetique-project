// Probe the REAL Supabase API: catalog size, slugs, and payload bytes for
// the exact queries the app runs (BEFORE vs AFTER select shapes).
import { readFileSync } from 'node:fs';
import path from 'node:path';

const envPath = path.resolve('.env');
const env = readFileSync(envPath, 'utf8');
function envVar(name) {
  const m = env.match(new RegExp(`^${name}=(.*)$`, 'm'));
  return m ? m[1].trim().replace(/^"|"$/g, '') : null;
}

const URL = envVar('VITE_SUPABASE_URL');
const KEY = envVar('VITE_SUPABASE_PUBLISHABLE_KEY');
if (!URL || !KEY) {
  console.error('Missing env vars in .env');
  process.exit(1);
}

const REST = `${URL.replace(/\/+$/, '')}/rest/v1`;
const H = {
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
  Accept: 'application/json',
  'Content-Type': 'application/json',
};

async function get(qs, prefer) {
  const headers = prefer ? { ...H, Prefer: prefer } : H;
  const res = await fetch(`${REST}/products?${qs}`, { headers });
  const body = await res.text();
  return { status: res.status, bytes: body.length, countHeader: res.headers.get('content-range') };
}

const SELECT_BEFORE_DETAIL =
  'id,name,slug,description,ingredients,how_to_use,price,original_price,is_promotion,is_featured,is_active,image_url,image_url_400,image_url_800,video_url,category_id,subcategory_id,stock_quantity,weight_grams,brand,location_city,location_url,show_location,created_at,updated_at,categories(name,slug),subcategories(name),product_images(id,url,sort_order)';

const SELECT_AFTER_LIST =
  'id,name,slug,price,original_price,is_promotion,is_featured,image_url,image_url_400,image_url_800,brand,category_id,subcategory_id,categories(name,slug)';

// Count active products
const countRes = await get('select=id&is_active=eq.true&limit=1', 'count=exact');

// Total active products (home uses limit 60)
const home = await get('select=id,name,slug,price,original_price,is_promotion,is_featured,image_url,image_url_400,image_url_800,brand,created_at,category_id,subcategory_id,categories(name,slug),subcategories(name)&is_active=eq.true&order=created_at.desc&limit=60');

// Catalog page 1 with count=exact (BEFORE behavior)
const catExact = await get('select=id,name,slug,price,original_price,is_promotion,is_featured,image_url,image_url_400,image_url_800,brand,created_at,category_id,subcategory_id,categories(name,slug),subcategories(name)&is_active=eq.true&order=created_at.desc&offset=0&limit=16', 'count=exact');

// Catalog page 1 without count (AFTER behavior)
const catNoExact = await get('select=id,name,slug,price,original_price,is_promotion,is_featured,image_url,image_url_400,image_url_800,brand,category_id,subcategory_id,categories(name,slug)&is_active=eq.true&order=created_at.desc&offset=0&limit=16');

const slug = 'creme-visage';

// Product image variants actually stored (to verify which files are downloaded).
const variants = JSON.parse(await (await fetch(`${REST}/products?select=image_url,image_url_400,image_url_800&is_active=eq.true&slug=eq.${slug}&limit=1`, { headers: H })).text());
console.log('IMAGE VARIANTS:', JSON.stringify(variants[0] || null, null, 2));

const detailBefore = await get(`select=${SELECT_BEFORE_DETAIL}&is_active=eq.true&slug=eq.${slug}&limit=1`);
const detailAfter = await get('select=id,name,slug,description,ingredients,how_to_use,price,original_price,is_promotion,image_url,image_url_800,video_url,category_id,subcategory_id,stock_quantity,weight_grams,brand,location_city,location_url,show_location,categories(name,slug)&is_active=eq.true&slug=eq.' + encodeURIComponent(slug) + '&limit=1');

console.log(JSON.stringify({
  activeCountHeader: countRes.countHeader,
  home: { status: home.status, bytes: home.bytes },
  catalogExact: { status: catExact.status, bytes: catExact.bytes, countHeader: catExact.countHeader },
  catalogNoExact: { status: catNoExact.status, bytes: catNoExact.bytes },
  detailBefore: { status: detailBefore.status, bytes: detailBefore.bytes, slug },
  detailAfter: { status: detailAfter.status, bytes: detailAfter.bytes },
}, null, 2));
