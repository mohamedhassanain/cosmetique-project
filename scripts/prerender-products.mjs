#!/usr/bin/env node
/**
 * Prerendering statique des fiches produit (SEO / partage social).
 *
 * Pourquoi :
 *   - Les robots de WhatsApp/Facebook/Google ne exécutent PAS JavaScript.
 *   - Sans HTML statique, un lien https://site/produit/[slug] partagé sur WhatsApp
 *     n'affiche aucun og:title / og:image / og:description dans l'aperçu.
 *   - L'app React génère ces balises côté client uniquement (useSeo).
 *
 * Solution (Option A) :
 *   - Ce script appelle l'API publique Supabase (produits actifs, lecture ouverte).
 *   - Il génère un fichier HTML par produit dans dist/prerendered/produit/[slug]/index.html
 *     contenant les meta tags OG + twitter + un <meta http-equiv="refresh"> qui redirige
 *     les vrais utilisateurs vers l'app React (les bots s'arrêtent au HTML).
 *   - Les rewrites (vercel.json / netlify.toml) servent ce HTML aux User-Agent bots,
 *     et laissent l'app React servir les navigateurs standards.
 *
 * Usage :
 *   VITE_SUPABASE_URL=https://xxx.supabase.co VITE_SUPABASE_PUBLISHABLE_KEY=yyy npm run prerender
 *   (les mêmes var d'env que l'app ; la lecture des produits actifs est publique)
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

const ORIGIN = process.env.SITE_ORIGIN || 'https://kissariya-cosmetiques.com';

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

async function main() {
  console.log('🔎 Récupération des produits actifs…');
  const { data: products, error } = await supabase
    .from('products')
    .select(PRODUCT_SELECT)
    .eq('is_active', true);

  if (error) {
    console.error('❌ Erreur Supabase :', error.message);
    process.exit(1);
  }

  const outputRoot = path.resolve('dist', 'prerendered');
  let count = 0;

  for (const product of products || []) {
    const dir = path.join(outputRoot, 'produit', product.slug);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, 'index.html'), buildProductHtml(product), 'utf8');
    count += 1;
  }

  console.log(`✅ ${count} fiche(s) produit prérédue(s) dans dist/prerendered/produit/…`);
  console.log('Déployez le dossier dist/ avec les rewrites (vercel.json / netlify.toml) pour servir le HTML statique aux robots.');
}

main().catch((err) => {
  console.error('❌ Erreur inattendue :', err);
  process.exit(1);
});
