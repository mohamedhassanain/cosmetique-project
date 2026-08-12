// KISSARIYA â€” SEARCH A/B BENCHMARK (vrai Supabase, cle anon, read-only)
// Compare la recherche ACTUELLE (A) vs search_vector seul (B).
import { readFileSync } from 'node:fs';

const env = readFileSync('.env', 'utf8');
function get(key) {
  const m = env.match(new RegExp(`^${key}=["']?(.*?)["']?$`, 'm'));
  return m ? m[1].trim() : '';
}

const URL = get('VITE_SUPABASE_URL');
const KEY =
  get('VITE_SUPABASE_PUBLISHABLE_KEY') ||
  get('SUPABASE_ANON_KEY') ||
  get('VITE_SUPABASE_ANON_KEY');

if (!/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(URL) || KEY.length < 20 || /YOUR_|PLACEHOLDER|xxx/i.test(KEY)) {
  console.error('Missing/invalid Supabase creds in .env');
  process.exit(1);
}

const REST = URL.replace(/\/+$/, '') + '/rest/v1';
const HEADERS = {
  apikey: KEY,
  Authorization: 'Bearer ' + KEY,
  Accept: 'application/json',
  'Content-Type': 'application/json',
};

const SELECT = 'id,name,slug,price,image_url,image_url_400,image_url_800,brand';

const TERMS = [
  { label: 'common-product', term: 'creme' },
  { label: 'brand', term: 'yves' },
  { label: 'partial', term: 'ser' },
  { label: 'rare', term: 'argan' },
  { label: 'short', term: 'bio' },
];

function buildUrl(term, variant) {
  const base =
    REST +
    '/products?select=' +
    encodeURIComponent(SELECT) +
    '&is_active=eq.true' +
    '&limit=17&offset=0';
  if (!term) return base;
  if (variant === 'B') {
    return base + '&search_vector=fts.' + encodeURIComponent(term);
  }
  // A : implementation actuelle du client (parentheses .or() obligatoires).
  return (
    base +
    '&or=' +
    encodeURIComponent(
      `(search_vector.phfts.${term},` +
        `name.ilike.%25${term}%25,` +
        `brand.ilike.%25${term}%25)`
    )
  );
}

async function fetchOnce(url) {
  const start = performance.now();
  let res;
  try {
    res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(30000) });
  } catch (err) {
    return { error: String(err?.name || err), ms: performance.now() - start, status: 0, bytes: 0 };
  }
  const text = await res.text();
  return {
    status: res.status,
    ms: Math.round((performance.now() - start) * 100) / 100,
    bytes: Buffer.byteLength(text),
    body: text,
  };
}

const WARMUP = 5;
const RUNS = 30;

const report = { generatedAt: new Date().toISOString(), url: URL, terms: {} };

for (const { label, term } of TERMS) {
  const entry = { term, A: null, B: null };
  for (const variant of ['A', 'B']) {
    const times = [];
    let errors = 0;
    let statuses = [];
    let bytes = 0;
    let rowCount = 0;
    for (let i = 0; i < RUNS; i++) {
      const r = await fetchOnce(buildUrl(term, variant));
      if (r.error) {
        errors++;
      } else {
        if (i >= WARMUP) times.push(r.ms);
        bytes = r.bytes;
        statuses.push(r.status);
        if (i === RUNS - 1) {
          try { rowCount = JSON.parse(r.body).length; } catch { /* ignore */ }
        }
      }
    }
    entry[variant] = summarize(times, errors, bytes, statuses, rowCount);
  }
  report.terms[label] = entry;
  console.log('[' + label + '] done');
}

console.log(JSON.stringify(report, null, 2));

function pct(arr, p) {
  if (arr.length === 0) return null;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

function summarize(times, errors, bytes, statuses, rowCount) {
  const n = times.length;
  return {
    samples: n,
    errors,
    p50: n ? Math.round(pct(times, 50) * 100) / 100 : null,
    p95: n ? Math.round(pct(times, 95) * 100) / 100 : null,
    p99: n ? Math.round(pct(times, 99) * 100) / 100 : null,
    max: n ? Math.round(Math.max(...times) * 100) / 100 : null,
    avg: n ? Math.round((times.reduce((a, b) => a + b, 0) / n) * 100) / 100 : null,
    bytes,
    statuses: [...new Set(statuses || [])],
    rowCount,
  };
}