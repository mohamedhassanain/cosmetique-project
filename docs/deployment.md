# Checklist de déploiement production — Kissariya Cosmétiques

> À cocher **avant** toute mise en ligne publique du site.

## 1. Supabase

- [ ] Exécuter `supabase/database.sql` dans le SQL Editor (idempotent, rejouable).
- [ ] Vérifier que les policies RLS admin utilisent `public.is_admin()` :
      `R` dans Supabase → `SELECT policyname FROM pg_policies WHERE tablename = 'orders';`
- [ ] Vérifier le profile admin : `SELECT user_id, role FROM public.profiles;` → `role` doit être `admin`.
- [ ] Remplacer le numéro WhatsApp de fallback `+212600000000` par le vrai numéro dans `site_settings`.
- [ ] Activer **2FA / captcha** sur le projet Supabase (Auth → Providers) si disponible.
- [ ] **TODO bloquant à grande échelle** : rate limiting par IP sur `orders` (INSERT public) et
      `contact_messages` — Edge Function Supabase ou edge proxy (cf. README → Sécurité).

## 2. Build & prerendering SEO

```bash
# Depuis la racine, avec les variables du projet :
VITE_SUPABASE_URL=... VITE_SUPABASE_PUBLISHABLE_KEY=... SITE_ORIGIN=https://votre-domaine.fr \
  npm run build && npm run prerender
```

- [ ] Le dossier `dist/` contient `index.html` (SPA) **et** `dist/prerendered/produit/[slug]/index.html` (SEO).
- [ ] `curl -s https://votre-domaine.fr/produit/[slug]` avec un User-Agent bot (ex: `WhatsApp`) retourne
      les meta tags `og:title`, `og:description`, `og:image`, `og:url`, `twitter:card` **dans le HTML brut**
      (sans exécuter de JavaScript).
- [ ] Un navigateur normal (`Mozilla/5.0`) reçoit l'app React (le HTML statique le redirige via
      `<meta http-equiv="refresh">`).

## 3. Cloudflare (recommandé devant Vercel/Netlify)

Une fois le domaine connecté à Cloudflare :

1. **DNS** : ajouter l'enregistrement (A/AAAA/CNAME) pointant vers l'hébergeur (Vercel/Netlify).
   Mode proxy activé (orange) pour que Cloudflare cache.

2. **Cache Rules** (Rules → Cache Rules → Create Rule) :

```
Rule name: Cache Supabase products API
When incoming requests match:
  URI Path → starts with → /rest/v1/products
Cache eligibility: Eligible for cache
Edge Cache TTL: Override origin → 5 minutes
```

```
Rule name: Cache static prerendered product pages
When incoming requests match:
  URI Path → starts with → /prerendered
Cache eligibility: Eligible for cache
Edge Cache TTL: Override origin → 1 hour
```

3. **Vérification** (deux requêtes consécutives doivent montrer un cache hit) :

```bash
curl -sI "https://votre-domaine.fr/produits" -H "User-Agent: Mozilla/5.0"
# 1re requête : cf-cache-status: MISS / DYNAMIC
curl -sI "https://votre-domaine.fr/produits" -H "User-Agent: Mozilla/5.0"
# 2e requête : cf-cache-status: HIT  ← à vérifier avant mise en prod
```

> Si le domaine n'est pas derrière Cloudflare, au minimum activer le cache de l'hébergeur
> (Vercel : Cache-Control par défaut sur les assets ; Netlify : `Cache-Control: public, max-age` via `netlify.toml`).

## 4. Tests & qualité

- [ ] `npm run lint` → 0 erreur.
- [ ] `npm test` → 35+ tests verts.
- [ ] `npm run build` → succès (warning de taille de chunk 600 kB accepté pour le MVP).

## 5. Parcours fonctionnels manuels

- [ ] Accueil : hero, sections, carrousels scrollables.
- [ ] Catalogue : filtres + pagination + recherche (y compris caractères spéciaux `, ( ) %` → pas d'erreur).
- [ ] Détail produit : galerie multi-images/vidéo, location, bouton WhatsApp (ouvre `wa.me`).
- [ ] Back-office : login admin, CRUD produit (avec image + localisation), catégories/sous-catégories,
      commandes (statut), paramètres, publicités (ordre drag & drop).
- [ ] Panier : ajout/retrait, persistance localStorage, commande WhatsApp.
- [ ] PC (souris) : clic produit → nouvel onglet ; mobile/tablette → même onglet.

## 6. Monitoring

- [ ] Sentry (ou équivalent) branché : erreurs React (`ErrorBoundary`) + erreurs de mutation React Query.
      (cf. Phase 7 — ce point est un TODO si non implémenté).
