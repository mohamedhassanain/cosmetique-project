// Measure Supabase REST requests for a FILTERED catalog page (deep-link
// /produits?categorie=soins-visage) — the path where round-2 removed the
// 2 slug→id lookups (client cache) and the count=exact probe.
// Expected AFTER: categories(1) + subcategories(1) + products(1) = 3 total REST.
// Expected BEFORE (round-1): categories(1) + subcategories(1) + products(1) + count
//   + 2 lookup requests (categories slug->id, subcategories slug->id) = 6 total REST.
import { chromium } from 'playwright';

const BASE_URL = process.argv[2] || 'http://localhost:5174';

function isSupabaseRest(url) {
  try {
    return new URL(url).hostname.endsWith('supabase.co') && url.includes('/rest/v1/');
  } catch {
    return false;
  }
}

const run = async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ deviceScaleFactor: 2, viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  const rest = [];
  page.on('response', (res) => {
    if (!isSupabaseRest(res.url())) return;
    rest.push(new URL(res.url()).pathname.replace(/^\/rest\/v1\//, '') + new URL(res.url()).search);
  });
  await page.goto(`${BASE_URL}/produits?categorie=soins-visage`, { waitUntil: 'networkidle', timeout: 45000 }).catch(() => {});
  await page.waitForTimeout(500);
  await browser.close();

  const countByTable = {};
  for (const r of rest) {
    const table = r.split('?')[0];
    countByTable[table] = (countByTable[table] || 0) + 1;
  }
  const result = {
    totalRestRequests: rest.length,
    byTable: countByTable,
    requests: rest,
  };
  console.log(JSON.stringify(result, null, 2));
};

run().catch((err) => {
  console.error('Measurement failed:', err);
  process.exit(1);
});
