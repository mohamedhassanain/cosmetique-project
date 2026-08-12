// =====================================================================
// KISSARIYA — BROWSER FLOW MEASUREMENT (real Supabase traffic)
// =====================================================================
// Measures Supabase rest/v1 + storage requests/bytes for a realistic
// public browsing session, using BOTH measurement modes:
//
//   A) COLD per page: fresh browser context per page (real visitors).
//   B) WARM SPA session: same context, in-page navigation (React Query
//      cache hits — this is the cache win the optimizations add).
//
// Flow: home -> catalog page1 -> product detail.
// (Pagination step only if >1 page exists; the real catalog currently
// has 1 active product, so page2 is skipped automatically.)
//
// Usage:
//   node load-tests/measure-browser-flow.mjs http://localhost:5174 out.json
// =====================================================================
import { chromium } from 'playwright';
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const BASE_URL = process.argv[2] || 'http://localhost:5174';
const OUT_FILE = process.argv[3] || 'load-tests/results/browser-before.json';

function isSupabaseHost(url) {
  try {
    return new URL(url).hostname.endsWith('supabase.co');
  } catch {
    return false;
  }
}

function summarize(entries) {
  const rest = entries.filter((e) => e.kind === 'rest');
  const images = entries.filter((e) => e.kind === 'image');
  const bytes = (arr) => arr.reduce((s, e) => s + e.bytes, 0);
  const byUrl = {};
  for (const e of entries) {
    const key = new URL(e.url).pathname.replace(/^\/rest\/v1\//, '');
    byUrl[key] = (byUrl[key] || 0) + 1;
  }
  return {
    restRequests: rest.length,
    restBytes: bytes(rest),
    imageRequests: images.length,
    imageBytes: bytes(images),
    byUrl,
  };
}

const run = async () => {
  const browser = await chromium.launch();

  const measurePage = async (pathname, opts = {}) => {
    const context = await browser.newContext({ deviceScaleFactor: 2, viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    const entries = [];
    page.on('response', async (res) => {
      if (!isSupabaseHost(res.url())) return;
      let bytes = 0;
      try {
        bytes = (await res.body())?.length ?? 0;
      } catch {
        bytes = 0;
      }
      entries.push({
        kind: new URL(res.url()).pathname.includes('/storage/v1/object/') ? 'image' : 'rest',
        url: res.url(),
        bytes,
        status: res.status(),
      });
    });
    await page.goto(`${BASE_URL}${pathname}`, { waitUntil: 'networkidle', timeout: 45000 }).catch(() => {});
    if (opts.clickNextPage) {
      const btn = page.locator('button svg.lucide-chevron-right').last();
      if (await btn.isVisible().catch(() => false)) {
        await btn.click().catch(() => {});
        await page.waitForTimeout(2000);
      }
    }
    await page.waitForTimeout(500);
    const slug = opts.getSlug
      ? ((await page.getAttribute('a[href^="/produit/"]', 'href').catch(() => null)) || '').replace('/produit/', '') || null
      : null;
    await context.close();
    return { summary: summarize(entries), slug };
  };

  const coldHome = await measurePage('/');
  const coldCatalog = await measurePage('/produits');
  const coldDetail = await measurePage(`/produit/${coldHome.slug || 'creme-visage'}`);

  // Warm SPA session (React Query cache persists across client navigations)
  const context = await browser.newContext({ deviceScaleFactor: 2, viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  const entries = [];
  page.on('response', async (res) => {
    if (!isSupabaseHost(res.url())) return;
    let bytes = 0;
    try {
      bytes = (await res.body())?.length ?? 0;
    } catch {
      bytes = 0;
    }
    entries.push({
      kind: new URL(res.url()).pathname.includes('/storage/v1/object/') ? 'image' : 'rest',
      url: res.url(),
      bytes,
      status: res.status(),
    });
  });
  const steps = {};
  const mark = (name) => {
    steps[name] = summarize(entries);
    entries.length = 0;
  };

  await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle', timeout: 45000 }).catch(() => {});
  await page.waitForTimeout(500);
  mark('warm_home');

  // SPA navigation: catalog via header link
  const catLink = page.locator('header a[href="/produits"], a[href="/produits"]').first();
  if (await catLink.isVisible().catch(() => false)) {
    await catLink.click().catch(() => {});
    await page.waitForTimeout(2000);
  } else {
    await page.goto(`${BASE_URL}/produits`, { waitUntil: 'networkidle' }).catch(() => {});
    await page.waitForTimeout(500);
  }
  mark('warm_catalog');

  // SPA navigation: detail via product card
  const detailLink = page.locator('a[href^="/produit/"]').first();
  if (await detailLink.isVisible().catch(() => false)) {
    await detailLink.click().catch(() => {});
    await page.waitForTimeout(2000);
  } else {
    await page.goto(`${BASE_URL}/produit/${coldHome.slug || 'creme-visage'}`, { waitUntil: 'networkidle' }).catch(() => {});
    await page.waitForTimeout(500);
  }
  mark('warm_detail');

  await context.close();
  await browser.close();

  const result = {
    capturedAt: new Date().toISOString(),
    note: 'Catalog currently has 1 active product; page2 step skipped automatically.',
    cold: {
      home: coldHome.summary,
      catalog: coldCatalog.summary,
      detail: coldDetail.summary,
      flowRestRequests: coldHome.summary.restRequests + coldCatalog.summary.restRequests + coldDetail.summary.restRequests,
      flowRestBytes: coldHome.summary.restBytes + coldCatalog.summary.restBytes + coldDetail.summary.restBytes,
      flowImageRequests: coldHome.summary.imageRequests + coldCatalog.summary.imageRequests + coldDetail.summary.imageRequests,
      flowImageBytes: coldHome.summary.imageBytes + coldCatalog.summary.imageBytes + coldDetail.summary.imageBytes,
    },
    warm: {
      home: steps.warm_home,
      catalog: steps.warm_catalog,
      detail: steps.warm_detail,
      sessionRestRequests: steps.warm_home.restRequests + steps.warm_catalog.restRequests + steps.warm_detail.restRequests,
      sessionRestBytes: steps.warm_home.restBytes + steps.warm_catalog.restBytes + steps.warm_detail.restBytes,
    },
    slug: coldHome.slug || 'creme-visage',
  };

  await mkdir(path.dirname(OUT_FILE), { recursive: true });
  await writeFile(OUT_FILE, JSON.stringify(result, null, 2), 'utf8');
  console.log('=== MEASUREMENT ===');
  console.log(JSON.stringify(result, null, 2));
  console.log(`Saved to ${OUT_FILE}`);
};

run().catch((err) => {
  console.error('Measurement failed:', err);
  process.exit(1);
});
