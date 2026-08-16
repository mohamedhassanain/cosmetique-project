# SEO IMPLEMENTATION REPORT — Kissariya Cosmétiques

Date : 2026-08-16
Objectif : fondation SEO technique pour l'e-commerce (marque + produits/catégories),
sans régression de performance ni changement d'architecture.

Statuts utilisés :
- **IMPLEMENTED** — code en place
- **VERIFIED** — vérifié localement par lint / tsc / vitest / build / Docker / Nginx
- **REQUIRES FINAL DOMAIN** — à finaliser quand le domaine de production est connu
- **REQUIRES GOOGLE SEARCH CONSOLE** — action GSC nécessaire
- **REQUIRES CONTENT/AUTHORITY** — dépend du contenu réel et du temps

Architecture de production : **Cloudflare → Docker → Nginx → React/Vite → Supabase**.
Pas de backend, pas de Next.js/SSR, pas de Redis, pas de Kubernetes.

---

## 1. État SEO initial (avant)

- `useSeo` minimal : title/description/og title/desc/image sur 2 pages (Produit, Contact) ;
  pas de canonical, pas d'og:url dynamique, pas de JSON-LD.
- `robots.txt` : tout-allow, aucune disallow privée, aucune référence sitemap.
- **Aucun** `sitemap.xml`.
- `/produits` (catalogue + catégories) : même titre pour toutes les vues → risque de doublons.
- `/produit/:slug` : titre/description dynamiques OK, mais pas de canonical ni Product JSON-LD.
- **Soft-404** : un slug produit inconnu déclenchait une erreur PGRST116 (`fetchProductBySlug`
  en `.single()`) → la page « Produit introuvable » était rendue **sans noindex** = page
  indexable sur une URL inexistante.
- Prerendering : déjà en place pour les fiches produit, mais **uniquement** pour Vercel/Netlify
  (rewrites par User-Agent) ; **Nginx (architecture Docker) ne routait pas** `/produit/:slug`
  vers le HTML prérendu.
- Le HTML prérendu des fiches produit **ne contenait pas les JSON-LD** Product + BreadcrumbList
  (exigés pour l'indexation produit Google), et inventait une meta description de repli
  (« Découvrez … sur Kissariya Cosmétiques ») quand le produit n'avait pas de description.
- Domaine placeholder `https://kissariya-cosmetiques.com` **répété en dur** dans plusieurs
  fichiers (`src/lib/seo.ts`, `scripts/prerender-products.mjs`, `public/robots.txt`,
  `SEO_IMPLEMENTATION_REPORT.md`).

## 2. Corrections implémentées (IMPLEMENTED)

| Problème | Correction |
|---|---|
| Pas de canonical sur aucune page | `useSeo` injecte `<link rel="canonical">` sur toutes les pages publiques (origin runtime absolue) |
| Pas d'og:url / og:site_name / og:type dynamique | `useSeo` les pose systématiquement (+ `ogType: 'product'` sur fiches produit) |
| Pas de JSON-LD | `useSeo` injecte/retire idempotemment des blocs `script[data-seo-id]` |
| Homepage sans métadonnées dynamiques | Homepage : titre « Boutique de cosmétiques naturels et bio au Maroc », description, canonical `/`, JSON-LD WebSite + Organization (données réelles uniquement) |
| `/produits` : doublons de titres | Vues filtrées → **noindex** (canonical vers la vue la plus proche) ; vues catégorie indexées avec titre/description uniques issus de la vraie description en base |
| Aucun sitemap | `scripts/prerender-products.mjs` génère `sitemap.xml` (accueil, `/produits`, `/contact`, catégories, produits actifs) **automatiquement au build Docker** |
| robots.txt permissif / placeholder | `dist/robots.txt` est **généré au build** avec `SITE_ORIGIN` (private routes disallowed) ; `public/robots.txt` devient un template de dev documenté |
| **Soft-404 produit** | `fetchProductBySlug` passe en `maybeSingle()` → slug inconnu = `null` → `ProduitDetail` affiche un **VRAI 404 noindex** (`ProductNotFound`) sans JSON-LD ni meta produit (bug corrigé, voir §11) |
| 404 indexable | `NotFound` → `noindex, nofollow` |
| Twiter card non vérifiée | Retiré `twitter:site` (pas de compte vérifié — ne jamais inventer) |
| Pas de fil d'Ariane | `<nav aria-label="Breadcrumb">` Accueil › Catégorie › Produit + `BreadcrumbList` JSON-LD sur les fiches produit |
| og:image relative | `absoluteUrl()` convertit toutes les URLs OG en absolues (runtime origin) |
| OG image produit | Image réelle du produit (première image) sinon OG par défaut du site |
| **Prerendered HTML incomplet** | `buildProductHtml` inclut désormais **Product JSON-LD + BreadcrumbList** (parité avec React), canonical, OG, Twitter, meta refresh ; meta description **réelle uniquement** (aucun texte inventé) |
| **Nginx ne servait pas le prerender** | `nginx/default.conf` : `map $http_user_agent` (bots list) + rewrite interne `/produit/:slug` → `/prerendered/produit/<slug>/index.html` ; navigateurs → SPA ; produit inconnu → **404 réel** (pas de fallback soft-404) |
| Build non déterministe | `Dockerfile` : `RUN_PRERENDER=true` par défaut + `SITE_ORIGIN` obligatoire au build → l'image contient **toujours** `sitemap.xml`, `robots.txt` et `prerendered/produit/<slug>/` |
| Domaine répété en dur | `SITE_ORIGIN` centralisée (`.env.example`, `docker-compose.yml`, `Dockerfile`, `scripts/prerender-products.mjs`) ; runtime = `window.location.origin` ; placeholder documenté uniquement |

## 3. Technical SEO (IMPLEMENTED / VERIFIED)

- Canonicals uniques et absolus sur : `/`, `/produits`, `/produits?categorie=` (indexable),
  `/produit/:slug`, `/contact`.
- URL canonique pour les vues filtrées (recherche, tri, promo, featured, page>1) → canonical
  sur `/produits` ou `/produits?categorie=x` + `noindex`.
- `robots.txt` ne bloque pas CSS/JS/images/produits/catégories publics.
- Sitemap XML généré au build (aucune infra serveur, sans back-end).
- Nginx sert `sitemap.xml`, `robots.txt` avec cache court (1 h) — `nginx/default.conf`.
- **Nginx sert le HTML prérendu aux bots** sur `/produit/:slug` (WhatsApp, Facebook, Google,
  Twitter, LinkedIn, Pinterest, Slack, Discord, Telegram, VK, Baidu, Yandex) ; les navigateurs
  reçoivent l'app React (SPA), et un produit inexistant retourne **404 réel** (jamais un
  soft-404 indexable).

### Vérification Nginx réelle (container Docker, 2026-08-16)

| URL | User-Agent | Résultat |
|---|---|---|
| `GET /` | navigateur | 200, app React (SPA) |
| `GET /produits` | navigateur | 200, SPA |
| `GET /produits?categorie=soins-visage` | navigateur | 200, SPA |
| `GET /produit/creme-visage` | `WhatsApp` | 200, **HTML prérendu** (canonical + og + twitter + meta refresh + JSON-LD Product + BreadcrumbList) |
| `GET /produit/creme-visage` | navigateur | 200, SPA |
| `GET /produit/shampoin` | `facebookexternalhit` | 200, HTML prérendu (og:title) |
| `GET /produit/produit-inexistant` | `Googlebot` | **404** |
| `GET /sitemap.xml` | — | 200, XML publie uniquement |
| `GET /robots.txt` | — | 200, Sitemap: `<SITE_ORIGIN>/sitemap.xml`, privé géré |
| `GET /health` | — | 200 `ok` |
| `GET /admin` | navigateur | 200, SPA (jamais prérendu — protégé par `RequireAdmin`) |

## 4. Product SEO (IMPLEMENTED / VERIFIED)

`ProduitDetail` :
- Title : `Acheter {name} au Maroc | Kissariya Cosmétiques`
- Description : vraie `product.description` (aucune description inventée)
- Canonical : `/produit/{slug}` (origin runtime)
- `og:type=product`, image produit réelle (absolue)
- JSON-LD `Product` : `name`, `description` (si présente), `image` (si présente),
  `brand` (si renseignée), `offers` (price réel, currency `MAD`, availability réelle
  InStock/OutOfStock selon `stock_quantity`)
- `BreadcrumbList` (Accueil › Catégorie › Produit) **seulement si une catégorie réelle existe**
- Fil d'Ariane visible `<nav aria-label="Breadcrumb">` avec liens internes crawlables

**Parité prerendered ❖ React** : le HTML statique (`dist/prerendered/produit/<slug>/index.html`)
contient exactement les mêmes données SEO que la page React hydratée (même stratégie
canonical/og, mêmes JSON-LD, mêmes règles « uniquement si la donnée existe »).

Aucune donnée inventée : pas de `sku`, pas de reviews/ratings, pas d'address/phone,
pas de prix fictif — seulement les champs réellement présents en base.

## 5. Category SEO (IMPLEMENTED / VERIFIED)

`Produits` avec `?categorie=` :
- H1 = nom réel de la catégorie
- Title unique `{Nom} — Produits cosmétiques au Maroc`
- Meta description = vraie `categories.description` (le champ existe en DB et est éditable
  dans l'admin Catégories) — jamais de texte générique inventé
- Canonical `/produits?categorie={slug}`
- Affichage de la description réelle sous le H1
- Lien produit → catégorie (fiche produit) et footer/menu → catégorie

## 6. Structured Data (IMPLEMENTED / VERIFIED)

- `WebSite` + `Organization` sur la homepage (nom, url, logo réels).
- `Product` + `BreadcrumbList` sur les fiches produit (React **et** plein dans le prerender).
- Pas de `LocalBusiness`/adresse inventées.

## 7. Sitemap (IMPLEMENTED / VERIFIED / REQUIRES FINAL DOMAIN)

- `sitemap.xml` généré dans `dist/` par `npm run prerender`, exécuté **automatiquement** au
  build Docker (`RUN_PRERENDER=true` par défaut) :
  - accueil `/`, catalogue `/produits`, `/contact`
  - **toutes les catégories** — le schéma `supabase/database.sql` n'a **aucun champ**
    actif/inactif sur `categories` : on n'invente pas de colonne, toutes sont incluses
  - **produits actifs uniquement** (`is_active = true`)
  - `lastmod` : `updated_at` réel du produit / `updated_at` de la catégorie
- JAMais : admin, auth, checkout, account, 404, recherche, tri, promo, featured, pagination.
- Vérifié : `GET /sitemap.xml` → 200, aucun lien `/admin` ou URL de filtre.
- Domaine : piloté par `SITE_ORIGIN` au build — voir §12.

## 8. Robots.txt (IMPLEMENTED / VERIFIED / REQUIRES FINAL DOMAIN)

- `public/robots.txt` : **template de développement** (placeholder documenté, pas déployé tel quel).
- **production** : `dist/robots.txt` **généré au build** avec `SITE_ORIGIN` →
  `Sitemap: <SITE_ORIGIN>/sitemap.xml`.
- Règles : `Allow: /`, `Disallow: /admin`, `/auth`, `/acces-refuse`, `/checkout`, `/account`.
- CSS / JS / images / produits / catégories publics **non bloqués**.

## 9. Canonicals (IMPLEMENTED / VERIFIED)

- Une seule canonical par page indexable (origin runtime absolue en navigateur).
- Prerendered : canonical `SITE_ORIGIN` (même stratégie que React à la place du runtime).
- Pas de canonical massé sur la homepage — chaque URL canonique est sa propre URL.
- Comportement trailing slash : l'app sert sans trailing slash (canonical cohérent avec
  l'URL réelle).

## 10. Open Graph & Twitter (IMPLEMENTED / VERIFIED)

- og:title / og:description / og:url / og:type / og:image / og:site_name posés sur toutes les
  pages publiques via `useSeo` (et dans le HTML prérendu).
- Images absolues (runtime origin), image produit sur les fiches produit.
- Twitter card `summary_large_image`, sans `twitter:site` inventé.

## 11. Pas de soft-404 (IMPLEMENTED / VERIFIED)

- `fetchProductBySlug` : `.maybeSingle()` → slug inconnu/inactif = `null` (plus d'erreur
  PGRST116 transformée en page indexable).
- `ProduitDetail` : `ProductNotFound` (composant dédié) → `noindex, nofollow`, **aucun**
  JSON-LD Product/BreadcrumbList, aucune meta produit ; canonical posé sur `/produit/<slug>`
  (pour rester cohérent avec l'URL demandée) mais `robots noindex`.
- Nginx : `/produit/<slug>` sans fichier prérendu → **404 réel** pour les bots et les
  navigateurs.
- Les produits inexistants ne sont **jamais** ajoutés au sitemap (requête `is_active = true`
  uniquement).
- Test unitaire ajouté : `fetchProductBySlug → null` (soft-404 supprimé).

## 12. SITE_ORIGIN centralisé (IMPLEMENTED / VERIFIED / REQUIRES FINAL DOMAIN)

**Une seule source de vérité** pour le SEO de production :

| Usage | Source |
|---|---|
| Canonical / og:url runtime | `window.location.origin` (navigateur) — jamais en dur |
| Canonical / og:url / og:image des fiches prérendues | `SITE_ORIGIN` (build) |
| `sitemap.xml` (loc) | `SITE_ORIGIN` (build) |
| `robots.txt` (Sitemap:) | `SITE_ORIGIN` (build) |

**Aucun domaine « final » n'est codé en dur.** Le placeholder `https://kissariya-cosmetiques.com`
n'existe plus que comme valeur **documentée** dans :
- `.env.example` (`SITE_ORIGIN="https://kissariya-cosmetiques.com"` — placeholder local)
- `src/lib/seo.ts` (`DEFAULT_SITE_ORIGIN` — repli hors-DOM, documenté)
- `scripts/prerender-products.mjs` (message d'erreur si `SITE_ORIGIN` manque)

**Quand le domaine final sera acheté** : changer `SITE_ORIGIN` (`.env` / CI/CD) suffit.
`docker compose build` **refuse de builder sans `SITE_ORIGIN`** (fail-fast).

## 13. Docker + Nginx (VERIFIED)

- `Dockerfile` : `RUN_PRERENDER=true` par défaut → `vite build` **puis** `npm run prerender`
  (+ `SITE_ORIGIN` obligatoire).
- Image vérifiée (`docker build` + `docker exec`) :
  `/usr/share/nginx/html/sitemap.xml`, `/usr/share/nginx/html/robots.txt`,
  `/usr/share/nginx/html/prerendered/produit/{creme-visage,shampoin}/index.html`.
- Nginx (`nginx/default.conf`) : map User-Agent → rewrite interne vers `/prerendered/…`,
  location `/prerendered/` avec `try_files $uri =404`, SPA fallback intact, cache headers
  inchangés (immutable 1 an assets, no-store index.html, 1 h robots/sitemap), CSP inchangée.
- `docker-compose.yml` / `docker-compose.scale.yml` : `SITE_ORIGIN` + `RUN_PRERENDER` passés
  au build.
- **Aucune régression perf** : le prerender est **uniquement au build** (0 requête runtime
  supplémentaire pour crawlers/utilisateurs ; pas de backend ; pas de Redis ; pas de lib SEO
  lourde ; bundle inchangé — même sortie Vite que précédemment, code splitting conservé).

## 14. Internal linking (IMPLEMENTED)

- Homepage → sections par catégorie → `/produits?categorie=...` (liens `<Link>` crawlables)
- Footer : chaque catégorie → pages filtres (liens texte)
- Fiche produit : fil d'Ariane (Accueil › Catégorie › Produit) + lien « Tous les produits »
- QuickView « Voir la fiche complète » → lien produit réel

## 15. Image SEO (IMPLEMENTED / VERIFIED)

- `alt` = nom produit (Produit, QuickView, CartSheet) ; thumbnails `alt=""` décoratifs.
- `loading="lazy"` sur les images hors LCP ; `eager` + `width/height` sur l'image principale
  produit (LCP) — pas de CLS.
- `srcSet`/`sizes` pour les variantes 400/800.
- Images via Supabase Storage/CDN (URLs stables), jamais en base.

## 16. Validation (VERIFIED — 2026-08-16)

- `npm run lint` → ✅ 0 erreur / 0 warning
- `npx tsc --noEmit` → ✅ 0 erreur
- `npx vitest run` → ✅ 13 fichiers / **99 tests** (dont 2 nouveaux tests `fetchProductBySlug`)
- `npm run build` → ✅ succès (code splitting conservé — pas de régression de bundle)
- `npm run prerender` (SITE_ORIGIN placeholder) → ✅ 2 fiches produites + sitemap (9 catégories,
  2 produits) + robots.txt
- `docker build` (RUN_PRERENDER par défaut) → ✅ ; image contient
  `sitemap.xml`, `robots.txt`, `prerendered/produit/<slug>/index.html`
- HTTP (container Docker) → voir tableau §3 : `/`, `/produits`, `/produits?categorie`,
  `/produit/<slug>` (bot prérendu / navigateur SPA), `/sitemap.xml`, `/robots.txt`,
  `/health`, `/admin` (SPA protégée), `/produit/<produit-inexistant>` → **404**
- JSON-LD : syntaxe JSON générée via `JSON.stringify` (valide par construction).
  Sitemap : XML échappé.

## 17. Google Search Console setup (REQUIRES GSC)

1. Créer la propriété **Domain** (ou URL prefix) sur `https://{domaine-final}`.
2. Vérifier le domaine (DNS TXT recommandé pour Domain property).
3. Ajouter le sitemap `https://{domaine-final}/sitemap.xml`.
4. URL Inspection sur `/`, `/produits`, `/produit/{un-slug}` → Request indexing.
5. Monitorer Indexing coverage (exclusions) et Core Web Vitals (champs).

## 18. Actions après achat du domaine (REQUIRES FINAL DOMAIN)

- Définir `SITE_ORIGIN=https://{domaine-final}` dans l'environnement de build (`.env` /
  CI/CD) et reconstruire → `sitemap.xml`, `robots.txt` et canonicals/og prérendus utilisent
  automatiquement le domaine final.
- Rien d'autre à coder : le runtime utilise `window.location.origin`, les prérendus sont
  régénérés au build.
- (Option) renseigner `categories.description` dans l'admin Catégories pour des meta
  descriptions réellement utiles.

## 19. Améliorations futures (REQUIRES CONTENT/AUTHORITY)

- Articles/guides « Conseils beauté Maroc » pour du contenu informatif indexable.
- Description éditoriale de homepage + catégories (texte naturel).
- Backlinks / mentions locales (annuaires marocains, presse beauté).
- Mesurer et itérer via GSC (impressions/clics par page).

> ⚠️ **Aucune garantie de ranking Google n'est donnée** : le SEO technique est validé
> localement ; l'indexation réelle dépend du domaine final, de la configuration GSC et du
> contenu. Voir sections 17–19.
