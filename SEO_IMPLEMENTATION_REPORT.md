# SEO IMPLEMENTATION REPORT — Kissariya Cosmétiques

Date : 2026-08-15
Objectif : fondation SEO technique pour l'e-commerce (marque + produits/catégories), sans régression de performance ni changement d'architecture.

Statuts utilisés :
- **IMPLEMENTED** — code en place
- **VERIFIED (LOCAL)** — vérifié par lint/tsc/tests/build
- **REQUIRES FINAL DOMAIN** — à finaliser quand le domaine de production est connu
- **REQUIRES GOOGLE SEARCH CONSOLE** — action GSC nécessaire
- **REQUIRES CONTENT/AUTHORITY** — dépend du contenu réel et du temps

---

## 1. État SEO initial (avant)

- `useSeo` minimal : title/description/og title/desc/image sur 2 pages (Produit, Contact) ; pas de canonical, pas d'og:url dynamique, pas de JSON-LD.
- `index.html` : og:image relative (`/og-image.png`), `twitter:site` non vérifié (supprimé), titre générique sur `/produits`.
- `robots.txt` : tout-allow, aucune disallow privée, aucune référence sitemap.
- **Aucun** `sitemap.xml`.
- `/produits` (catalogue + catégories) : même titre pour toutes les vues → risque de doublons.
- `/produit/:slug` : titre/description dynamiques OK, mais pas de canonical ni Product JSON-LD.
- 404 : pas de noindex.
- Prerendering : déjà en place pour les fiches produit (rewrite bots via `vercel.json`/`netlify.toml`).

## 2. Problèmes corrigés (IMPLEMENTED)

| Problème | Correction |
|---|---|
| Pas de canonical sur aucune page | `useSeo` injecte `<link rel="canonical">` sur toutes les pages publiques (origin runtime absolue) |
| Pas d'og:url / og:site_name / og:type dynamique | `useSeo` les pose systématiquement (+ `ogType: 'product'` sur fiches produit) |
| Pas de JSON-LD | `useSeo` injecte/retire idempotemment des blocs `script[data-seo-id]` |
| Homepage sans métadonnées dynamiques | Homepage : titre « Boutique de cosmétiques naturels et bio au Maroc », description, canonical `/`, JSON-LD WebSite + Organization (données réelles uniquement) |
| `/produits` : doublons de titres | Vues filtrées → **noindex** (canonical vers la vue la plus proche) ; vues catégorie indexées avec titre/description uniques issus de la vraie description en base |
| Aucun sitemap | `scripts/prerender-products.mjs` génère `sitemap.xml` (accueil, `/produits`, `/contact`, catégories, produits actifs) au build |
| robots.txt permissif | Disallow `/admin`, `/auth`, `/acces-refuse`, `/checkout`, `/account` + référence Sitemap (placeholder domaine) |
| 404 indexable | `NotFound` → `noindex, nofollow` |
| Twiter card non vérifiée | Retiré `twitter:site` (pas de compte vérifié — ne jamais inventer) |
| Pas de fil d'Ariane | `<nav aria-label="Breadcrumb">` Accueil › Catégorie › Produit + `BreadcrumbList` JSON-LD sur les fiches produit |
| og:image relative | `absoluteUrl()` convertit toutes les URLs OG en absolues (runtime origin) |
| OG image produit | Image réelle du produit (première image) sinon OG par défaut du site |

## 3. Technical SEO (IMPLEMENTED / VERIFIED LOCAL)

- Canonicals uniques et absolus sur : `/`, `/produits`, `/produits?categorie=` (indexable), `/produit/:slug`, `/contact`.
- URL canonique pour les vues filtrées (recherche, tri, promo, featured, page>1) → canonical sur `/produits` ou `/produits?categorie=x` + `noindex`.
- `robots.txt` ne bloque pas CSS/JS/images/produits/catégories publics.
- Sitemap XML généré au build (aucune infra serveur, sans back-end).
- Nginx sert `sitemap.xml` avec cache court (1 h) — `nginx/default.conf`.
- Prerendering produit existant conservé (rewrite `vercel.json`/`netlify.toml`) : les robots reçoivent un HTML statique avec og/canonical/title ; les navigateurs reçoivent l'app (meta refresh).

## 4. Product SEO (IMPLEMENTED)

`ProduitDetail` :
- Title : `Acheter {name} au Maroc | Kissariya Cosmétiques`
- Description : vrai `product.description`
- Canonical : `/produit/{slug}`
- `og:type=product`, image produit réelle (absolue)
- JSON-LD `Product` : `name`, `description`, `image`, `brand` (si renseignée), `offers` (price réel, currency `MAD`, availability réelle InStock/OutOfStock selon `stock_quantity`)
- `BreadcrumbList` (Accueil › Catégorie › Produit)
- Fil d'Ariane visible `<nav aria-label="Breadcrumb">` avec liens internes crawlables

Aucune donnée inventée : pas de `sku`, pas de reviews/ratings, pas de prix fictif — seulement les champs réellement présents en base.

## 5. Category SEO (IMPLEMENTED)

`Produits` avec `?categorie=` :
- H1 = nom réel de la catégorie
- Title unique `{Nom} — Produits cosmétiques au Maroc`
- Meta description = vraie `categories.description` (le champ existe en DB et est éditable dans l'admin Catégories) — jamais de texte générique inventé
- Canonical `/produits?categorie={slug}`
- Affichage de la description réelle sous le H1
- Lien produit → catégorie (fiche produit) et footer/menu → catégorie

## 6. Structured Data (IMPLEMENTED)

- `WebSite` + `Organization` sur la homepage (nom, url, logo réels).
- `Product` + `BreadcrumbList` sur les fiches produit.
- Pas de `LocalBusiness`/adresse inventées.

## 7. Sitemap (IMPLEMENTED / REQUIRES FINAL DOMAIN)

- `sitemap.xml` généré dans `dist/` par `npm run prerender` (accueil, `/produits`, `/contact`, catégories, produits actifs).
- Domaine : placeholder `https://kissariya-cosmetiques.com` → **remplacer par `SITE_ORIGIN` au build** (assurez-vous que `dist/sitemap.xml` soit présent avant déploiement).
- À régénérer à chaque changement de catalogue (`npm run prerender`).

## 8. Robots.txt (IMPLEMENTED / REQUIRES FINAL DOMAIN)

`public/robots.txt` :
- `Allow: /`, `Disallow: /admin`, `/auth`, `/acces-refuse`, `/checkout`, `/account`
- `Sitemap:` placeholder → remplacer par le domaine final

## 9. Canonicals (IMPLEMENTED)

- Une seule canonical par page indexable (origin runtime absolue).
- Pas de canonical massé sur la homepage — chaque URL canonique est sa propre URL.
- Comportement trailing slash : l'app sert sans trailing slash (canonical cohérent avec l'URL réelle).

## 10. Open Graph (IMPLEMENTED)

- og:title / og:description / og:url / og:type / og:image / og:site_name posés sur toutes les pages publiques via `useSeo`.
- Images absolues (runtime origin), image produit sur les fiches produit.
- Twitter card `summary_large_image`, sans `twitter:site` inventé.

## 11. Internal linking (IMPLEMENTED)

- Homepage → sections par catégorie → `/produits?categorie=...` (liens `<Link>` crawlables)
- Footer : chaque catégorie + sous-catégories → pages filtres (liens texte)
- Fiche produit : fil d'Ariane (Accueil › Catégorie › Produit) + lien « Tous les produits »
- QuickView « Voir la fiche complète » → lien produit réel

## 12. Image SEO (IMPLEMENTED / VERIFIED LOCAL)

- `alt` = nom produit (Produit, QuickView, CartSheet) ; thumbnails `alt=""` décoratifs.
- `loading="lazy"` sur les images hors LCP ; `eager` + `width/height` sur l'image principale produit (LCP) — pas de CLS.
- `srcSet`/`sizes` pour les variantes 400/800.
- Images via Supabase Storage/CDN (URLs stables), jamais en base.

## 13. Google Search Console setup (REQUIRES GSC)

1. Créer la propriété **Domain** (ou URL prefix) sur `https://{domaine-final}`.
2. Vérifier le domaine (DNS TXT recommandé pour Domain property).
3. Ajouter le sitemap `https://{domaine-final}/sitemap.xml`.
4. URL Inspection sur `/`, `/produits`, `/produit/{un-slug}` → Request indexing.
5. Monitorer Indexing coverage (exclusions) et Core Web Vitals (champs).

## 14. Remaining manual actions after domain purchase (REQUIRES FINAL DOMAIN)

- Définir `SITE_ORIGIN` au build (ex. `https://kissariya-cosmetiques.com`) et reconstruire (sitemap + canonicals/og runtime).
- Remplacer le placeholder `Sitemap:` de `robots.txt` (les canonicals/og sont automatiques au runtime).
- (Option) renseigner `categories.description` dans l'admin pour des meta descriptions de catégories réellement utiles.

## 15. Future SEO improvements (REQUIRES CONTENT/AUTHORITY)

- Articles/guides « Conseils beauté Maroc » pour du contenu informatif indexable.
- Description éditoriale de homepage + catégories (texte naturel).
- Backlinks / mentions locales (annuaires marocains, presse beauté).
- Mesurer et itérer via GSC (impressions/clics par page).

---

## Validation (VERIFIED LOCAL)

- `npx tsc --noEmit` — ✅ 0 erreur
- `npm run lint` — ✅ 0 erreur / 0 warning
- `npx vitest run` — ✅ 13 fichiers / 97 tests
- `npm run build` — ✅ succès
- `dist/` contient `index.html`, `robots.txt`, `favicon-app.svg`, `og-image.png`, `sitemap.xml` (copié depuis `public/` par Vite).
- JSON-LD : syntaxe JSON générée via `JSON.stringify` (valide par construction). Sitemap : XML échappé.
- Non vérifiables ici : comportement réel de Google (GSC), rendu des canonicals sur le domaine final (runtime origin).
