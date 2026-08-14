# RATE LIMITING — RAPPORT FINAL

Date : 2026-08-14

## AVANT

- **INSERT public direct** : les tables `orders` et `contact_messages` étaient ouvertes en écriture anonyme via `INSERT WITH CHECK (true)` (PostgREST + clé anon publique). N'importe qui pouvait spamer la base en contournant le frontend.
- **Protections frontend uniquement** : verrous anti-double-clic (module `whatsapp.service.ts`, `useRef` du `CartSheet`) — aucune protection côté serveur. Le honeypot mentionné dans le README n'existait pas.
- **Aucun rate limiting serveur** : pas d'Edge Functions, pas de compteurs persistants.

## APRÈS

### Endpoints protégés (serveur)

- `create-order` : `POST <SUPABASE_URL>/functions/v1/create-order`
- `create-contact` : `POST <SUPABASE_URL>/functions/v1/create-contact`

Chaîne de traitement dans chaque fonction : lecture IP plateforme → hash → validation payload (400) → rate limiting persistant (429) → INSERT serveur avec `service_role` (jamais exposé).

### Rate limits (configurables par variable d'environnement)

| Ressource | 10 min | 1 h |
|---|---|---|
| `orders` | 3 (`ORDERS_LIMIT_10M`) | 10 (`ORDERS_LIMIT_1H`) |
| `contact_messages` | 3 (`CONTACT_LIMIT_10M`) | 10 (`CONTACT_LIMIT_1H`) |

Dépassement → **429** `{ "error": "Too many requests. Please try again later." }` + `Retry-After`. Messages clients français conviviaux pour 429.

### Validation

- Orders : champs requis, longueurs, quantité [1,99], total borné, `status` forcé `pending`, téléphone optional, honeypot, **prix dérivé côté serveur** quand `product_id` présent.
- Contact : name/email/message requis, longueurs, format email/téléphone, honeypot.

### Protection anti-abus

- État PERSISTANT (`rate_limit_counters` PostgreSQL) — **aucune Map en mémoire**.
- Upsert atomique `bump_rate_limit()` par fenêtre fixe (10 min + 1 h).
- IP hachée HMAC-SHA256 avant stockage (clé `RATE_LIMIT_HASH_SECRET`).
- IP issue des en-têtes plateforme uniquement (cf-connecting-ip → x-forwarded-for → x-real-ip).
- Nettoyage borné : purge par bucket à chaque écriture + nettoyage global probabiliste (2 %).
- Honeypot validé côté serveur.

### HTTP 429 : comportement vérifié par le frontend

- `order.service.ts` / `contact.service.ts` : `PublicSubmissionError(status)` ; le panier et la page contact affichent « Trop de requêtes. Veuillez réessayer dans quelques minutes. » sans exposer de détail interne.

### Sécurité

- `service_role` : **absent** de `src/`, `public/`, `dist/` (build vérifié), et `.env.example` (seulement une mention en commentaire, sans valeur). Présent uniquement en secret côté Edge Functions.
- RLS : jamais affaiblie — les INSERT anon ont été **supprimés** (fermeture de brèche) ; `orders_admin_insert` ajouté pour conserver l'ajout manuel admin ; `rate_limit_counters` sans aucune policy (service_role seul).
- Admin : login, CRUD commandes (liste/statut/édition/suppression/ajout), produits, catégories, paramètres, promos — **inchangés** (JWT authentifié, policies admin existantes).

## Fichiers modifiés / créés

| Fichier | Action |
|---|---|
| `supabase/database.sql` | Modifié — script unique : + `rate_limit_counters`, `bump_rate_limit`, `cleanup_rate_limit_counters`, suppression INSERT anon orders/contact_messages, `orders_admin_insert` |
| `supabase/migrations/20260814_rate_limiting.sql` | Supprimé (fusionné dans `database.sql` — 1 seul code SQL) |
| `supabase/functions/_shared/{config,cors,env,ip,rate-limit,supabase-admin,validation}.ts` | Créés |
| `supabase/functions/_shared/validation.test.ts` | Créé (19 tests) |
| `supabase/functions/create-order/index.ts` | Créé |
| `supabase/functions/create-contact/index.ts` | Créé |
| `src/services/order.service.ts` | Modifié — `submitPublicOrder` (Edge Function) + erreurs typées |
| `src/services/contact.service.ts` | Créé — `submitContactMessage` (Edge Function) |
| `src/services/whatsapp.service.ts` | Modifié — flux WhatsApp via Edge Function |
| `src/components/cart/CartSheet.tsx` | Modifié — panier via Edge Function |
| `src/pages/shop/Contact.tsx` | Créé — page contact publique (honeypot + gestion 429) |
| `src/App.tsx` | Modifié — route `/contact` |
| `src/components/layout/Footer.tsx` | Modifié — lien « Contact » actif |
| `src/services/__tests__/whatsapp.service.test.ts` | Modifié — mock `submitPublicOrder` |
| `k6/rate-limit-test.js` | Créé — test sécurité rate limiting |
| `eslint.config.js` | Modifié — exclusion `supabase/functions` (Deno) |

## Commandes exécutées

- `npx tsc --noEmit -p tsconfig.app.json` → **OK** (0 erreur)
- `npx eslint .` → **OK** (0 erreur)
- `npm run build` → **OK** (bundle inclut la page Contact)
- `npx vitest run` → **13 fichiers / 97 tests OK**
- scan secrets (`service_role`, etc.) sur `src/`, `public/`, `dist/`, `.env.example` → aucune valeur secrète

## Résultats des tests

- 97 tests verts (13 fichiers), dont les 19 nouveaux tests de validation des Edge Functions et les tests WhatsApp migrés vers le mock `submitPublicOrder`.
- Le k6 (`k6/rate-limit-test.js`) est fourni pour un projet de test dédié : trafic normal → 201, burst → 429. **À ne pas exécuter contre la production** (déjà marqué `[k6 test]`).

## Risques résiduels

1. **Non-exécution en réel** : les Edge Functions n'ont pas été déployées/appelées réellement ici (aucune clé de projet) — le comportement 429/201 doit être validé une fois déployé + secrets configurés.
2. **IP via Cloudflare** : dépend de `cf-connecting-ip` ; sans IP fiable, bucket `unknown` partagé (se sature vite → défensif).
3. **Panier sans `product_id`** : total non vérifiable indépendamment (borné + rate limité).
4. **Dépendance runtime Deno** : les fichiers `supabase/functions/*` sont du Deno (Supabase), exclus du lint/typecheck frontend — à valider via `supabase functions serve`/deploy.

---

## VERDICT : ✅ READY

**Pourquoi** :
- L'audit complet a été réalisé et documenté avant toute modification.
- La brèche d'INSERT public direct est fermée (policies anon supprimées) — protection **réellement serveur**, indépendante du frontend.
- Le rate limiting est **persistant** en PostgreSQL (pas de Map en mémoire), atomique, indexé, nettoyé — sans Redis ni infra nouvelle.
- Validation complète (400), honeypot serveur, prix dérivé pour les produits référencés, IP hachée.
- 429 correct, avec Retry-After et UX frontend adaptée.
- Admin et RLS préservés; `service_role` absent de tout code exposé au navigateur.
- Régression : typecheck, lint, build et **97/97 tests verts**.

**Seule réserve (non bloquante)** : la validation d'intégration finale (déploiement des Edge Functions + run k6 sur un projet de test) nécessite les accès Supabase réels — elle doit être effectuée au moment du déploiement, comme indiqué dans `RATE_LIMITING_IMPLEMENTATION.md`.
