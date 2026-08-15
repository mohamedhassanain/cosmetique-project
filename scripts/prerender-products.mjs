#!/usr/bin/env node
/**
 * Prerendering statique des fiches produit + sitemap.xml (SEO).
 *
 * - Fiches produit : HTML statique par produit actif (og + twitter + redirect)
 *   servi aux robots (WhatsApp/Facebook/Google) et aux navigateurs via
 *   <meta http-equiv="refresh">.
 * - sitemap.xml : URLs canoniques publiques (accueil, /produits, /contact,
 *   catégories, produits actifs) — jamais /admin, /auth, ni URLs de filtres.
 *   Généré au build (aucune infra serveur ajoutée) ; à régénérer quand le
 *   catalogue change (npm run prerender).
 *
 * Usage :
 *   VITE_SUPABASE_URL=https://xxx.supabase.co VITE_SUPABASE_PUBLISHABLE_KEY=yyy \
 *   SITE_ORIGIN=https://domaine-final.com npm run prerender
 */
import { createClient } from '@supabase/supabase-js';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ VITE_SUPABASE_URL et VITE_SUPABASE_PUBLISHABLE_KEY sont requis.');
  process.exit(1);
}

const ORIGIN = (process.env.SITE_ORIGIN || 'https://kissariya-cosmetiques.com').replace(/\/+$/, '');

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const PRODUCT_SELECT = `
  id, name, slug, description, price,
  image_url, brand, is_active,
  categories(name)
`;

// NB : les entités HTML sont construites à partir de String.fromCharCode(38) ('&')
// pour que le fichier source ne contienne jamais le caractère '&' littéral.
function escapeHtml(value) {
  const amp = `${String.fromCharCode(38)}amp;`;
  const lt = `${String.fromCharCode(38)}lt;`;
  const gt = `${String.fromCharCode(38)}gt;`;
  const quot = `${String.fromCharCode(38)}quot;`;
  const apos = `${String.fromCharCode(38)}#39;`;
  return String(value ?? '')
    .replaceAll('&', amp)
    .replaceAll('<', lt)
    .replaceAll('>', gt)
    .replaceAll('"', quot)
    .replaceAll("'", apos);
}

function escapeXml(value) {
  return escapeHtml(value);
}

function firstImage(imageUrl) {
  if (!imageUrl) return null;
  try {
    const parsed = JSON.parse(imageUrl);
    if (Array.isArray(parsed)) return parsed[0] || null;
    return imageUrl;
  } catch {
    return imageUrl;
  }
}

function buildProductHtml(product) {
  const slug = product.slug;
  const url = `${ORIGIN}/produit/${encodeURIComponent(slug)}`;
  const image = firstImage(product.image_url || null);
  const description = (product.description || `Découvrez ${product.name} sur Kissariya Cosmétiques.`)
    .slice(0, 200);
  const title = `${product.name} — Kissariya Cosmétiques`;
  const priceLabel = Number(product.price).toLocaleString('fr-FR');

  return `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(description)}" />

    <!-- Open Graph (WhatsApp, Facebook) -->
    <meta property="og:type" content="product" />
    <meta property="og:url" content="${escapeHtml(url)}" />
    <meta property="og:title" content="${escapeHtml(title)}" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    ${image ? `<meta property="og:image" content="${escapeHtml(image)}" />` : ''}
    <meta property="product:price:amount" content="${product.price}" />
    <meta property="product:price:currency" content="MAD" />

    <!-- Twitter Card -->
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtml(title)}" />
    <meta name="twitter:description" content="${escapeHtml(description)}" />
    ${image ? `<meta name="twitter:image" content="${escapeHtml(image)}" />` : ''}

    <!-- Redirection vers l'app React pour les navigateurs (les bots ignorent ce tag) -->
    <meta http-equiv="refresh" content="0; url=${escapeHtml(url)}" />
    <link rel="canonical" href="${escapeHtml(url)}" />
  </head>
  <body style="margin:0;font-family:system-ui,sans-serif;background:#fef8fa;color:#5b2333;display:flex;align-items:center;justify-content:center;min-height:100vh;text-align:center;">
    <div>
      <h1 style="font-size:1.25rem;margin-bottom:0.5rem;">${escapeHtml(product.name)}</h1>
      <p style="color:#9d6b7a;">${escapeHtml(priceLabel)} DH</p>
      <a href="${escapeHtml(url)}" style="display:inline-block;margin-top:1rem;background:#f0a0b8;color:#fff;padding:0.75rem 1.5rem;border-radius:9999px;text-decoration:none;font-weight:bold;">Voir le produit</a>
    </div>
  </body>
</html>
`;
}

/** Génère sitemap.xml depuis les données publiques réelles. */
function buildSitemap({ categories, products }) {
  const now = new Date().toISOString();
  const urls = [
    { loc: `${ORIGIN}/`, lastmod: now, priority: '1.0' },
    { loc: `${ORIGIN}/produits`, lastmod: now, priority: '0.9' },
    { loc: `${ORIGIN}/contact`, lastmod: now, priority: '0.5' },
  ];

  for (const category of categories || []) {
    urls.push({
      loc: `${ORIGIN}/produits?categorie=${encodeURIComponent(category.slug)}`,
      lastmod: now,
      priority: '0.8',
    });
  }

  for (const product of products || []) {
    urls.push({
      loc: `${ORIGIN}/produit/${encodeURIComponent(product.slug)}`,
      lastmod: now,
      priority: '0.7',
    });
  }

  const entries = urls
    .map(
      (u) => `  <url>\n    <loc>${escapeXml(u.loc)}</loc>\n` +
        `    <lastmod>${u.lastmod}</lastmod>\n    <priority>${u.priority}</priority>\n  </url>`
    )
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</urlset>\n`;
}

async function main() {
  console.log('🔎 Récupération des produits et catégories actifs…');
  const [productsRes, categoriesRes] = await Promise.all([
    supabase.from('products').select(PRODUCT_SELECT).eq('is_active', true),
    supabase.from('categories').select('id, slug').order('sort_order', { ascending: true }),
  ]);

  if (productsRes.error) {
    console.error('❌ Erreur Supabase (products) :', productsRes.error.message);
    process.exit(1);
  }
  if (categoriesRes.error) {
    console.error('❌ Erreur Supabase (categories) :', categoriesRes.error.message);
    process.exit(1);
  }

  const products = productsRes.data || [];
  const categories = categoriesRes.data || [];

  const outputRoot = path.resolve('dist');
  let count = 0;

  // Fiches produit prérendues
  for (const product of products) {
    const dir = path.join(outputRoot, 'prerendered', 'produit', product.slug);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, 'index.html'), buildProductHtml(product), 'utf8');
    count += 1;
  }

  // Sitemap.xml (racine dist → servi par Nginx à /sitemap.xml)
  await writeFile(path.join(outputRoot, 'sitemap.xml'), buildSitemap({ categories, products }), 'utf8');

  console.log(`✅ ${count} fiche(s) produit prérendue(s) dans dist/prerendered/produit/…`);
  console.log(`✅ sitemap.xml généré (${categories.length} catégories, ${products.length} produits).`);
  console.log('Déployez le dossier dist/ avec les rewrites (vercel.json / netlify.toml) pour servir le HTML statique aux robots.');
}

main().catch((err) => {
  console.error('❌ Erreur inattendue :', err);
  process.exit(1);
});
