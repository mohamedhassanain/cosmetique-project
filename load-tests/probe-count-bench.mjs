// Benchmark A (count=exact) vs B (no count, limit=pageSize+1) on the REAL
// Supabase catalog/seach queries. Measures bytes + latency (5 iterations each).
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

const SELECT =
  'id,name,slug,price,original_price,is_promotion,is_featured,image_url,image_url_400,image_url_800,brand,category_id,subcategory_id,categories(name,slug)';

// Pick the first active category id for the catalog test.
const cats = await (await fetch(`${REST}/categories?select=id&limit=1`, { headers: H })).json();
const categoryId = cats?.[0]?.id;

const CATALOG_A = `${REST}/products?select=${SELECT}&is_active=eq.true&category_id=eq.${categoryId}&order=created_at.desc&offset=0&limit=16`;
const CATALOG_B = `${REST}/products?select=${SELECT}&is_active=eq.true&category_id=eq.${categoryId}&order=created_at.desc&offset=0&limit=17`;

const SEARCH_A = `${REST}/products?select=${SELECT}&is_active=eq.true&or=(search_vector.phfts.creme,name.ilike.%25creme%25,brand.ilike.%25creme%25)&limit=16&offset=0`;
const SEARCH_B = `${REST}/products?select=${SELECT}&is_active=eq.true&or=(search_vector.phfts.creme,name.ilike.%25creme%25,brand.ilike.%25creme%25)&limit=17&offset=0`;

async function run(url, prefer) {
  const headers = prefer ? { ...H, Prefer: prefer } : H;
  const samples = [];
  for (let i = 0; i < 5; i++) {
    const start = performance.now();
    const res = await fetch(url, { headers });
    const body = await res.text();
    samples.push({ ms: performance.now() - start, bytes: body.length, status: res.status, range: res.headers.get('content-range') });
  }
  return samples;
}

const results = {
  category_id: categoryId,
  catalogA: await run(CATALOG_A, 'count=exact'),
  catalogB: await run(CATALOG_B),
  searchA: await run(SEARCH_A, 'count=exact'),
  searchB: await run(SEARCH_B),
};

console.log(JSON.stringify(results, null, 2));
