# Admin Authentication Security

Date : 2026-08-10
Projet : Kissariya Cosmétiques (React + Vite + Supabase)

---

## Architecture

```
Supabase Dashboard (Authentication → Users → Create user)
        │  l'administrateur de confiance crée manuellement le compte (email + mot de passe)
        ▼
Supabase Auth (projet réservé aux comptes admin)
        │  supabase.auth.signInWithPassword(email, password)   [Route /admin/login]
        ▼
/admin (dashboard admin, protégé par RequireAdmin)
        │
        ▼
RLS PostgreSQL — public.is_admin() = auth.uid() IS NOT NULL
```

- Auth fournisseur : **Supabase Auth (email + mot de passe)**.
- Client : `@supabase/supabase-js` avec la clé **anon publique** uniquement
  (`src/integrations/supabase/client.ts`), protégée par RLS côté base.
- Login : `supabase.auth.signInWithPassword()` — aucune autre méthode.
- Garde frontend : `RequireAdmin` (`src/components/shared/RequireAdmin.tsx`) —
  « pas de session » → redirection `/admin/login` ; « session active » → `/admin`.

## Authorization Model

```
Authenticated Supabase account  =  ADMIN
Unauthenticated visitor         =  NOT ADMIN
```

Il n'existe **intentionnellement AUCUN système de rôles** : pas de table
`admin_users`, pas de colonne `role`, pas d'`app_metadata`/`user_metadata`
de rôle, pas de RPC de gestion d'admins. Cette simplicité est sûre parce que
**l'inscription publique est désactivée** et que l'application n'expose aucun
mécanisme de création de compte (pas de page `signup`, pas d'appel `signUp()`).
Tout compte présent dans le projet Supabase Auth a donc été créé manuellement
par l'administrateur de confiance → c'est un compte admin.

Implémentation :

- `public.is_admin()` = `SELECT auth.uid() IS NOT NULL` (`supabase/database.sql`).
  Sûr sous cette architecture : « authentifié » implique « compte admin créé manuellement ».
- `AuthProvider.isAdmin = !!user` (`src/providers/auth-provider.tsx`).
- RLS : toutes les tables sensibles utilisent `public.is_admin()` pour les
  opérations d'écriture et les lectures admin.

## Existing Accounts

Aucun compte Supabase Auth n'a été supprimé, modifié, migré ou recréé.

Les comptes existants (ex. `admin1@example.com`, `admin2@example.com`,
`admin3@example.com`) restent valides avec leurs identifiants actuels.
Aucune exigence de `role=admin` ne leur est appliquée : leur statut
**authentifié** leur donne l'accès admin, car le projet Auth est admin-only.
Un compte créé plus tard depuis le Dashboard (Authentication → Users →
Create user) pourra également se connecter et accéder à `/admin` sans aucune
configuration supplémentaire.

## Signup

**Aucune inscription publique n'existe** :

- aucune page `/signup` ni équivalent ;
- aucun appel `supabase.auth.signUp()` dans le code applicatif ;
- l'option « Allow new users to sign up » doit rester **DÉSACTIVÉE** dans
  Supabase Dashboard → Authentication → Providers → Email ;
- aucun mécanisme de création de compte dans le frontend (pas de
  `createAdmin()`, pas de clé service_role pour créer des utilisateurs).

Création de compte = uniquement manuelle, par l'administrateur de confiance,
via Supabase Dashboard → Authentication → Users → Create user.

## RLS

RLS activée sur toutes les tables (`supabase/database.sql`). Protections clés :

| Table | Lecture publique | Lecture admin | Écriture |
|---|---|---|---|
| `products` | `is_active = true` | `is_admin()` | `is_admin()` |
| `product_images` | produits actifs uniquement | `is_admin()` | `is_admin()` |
| `categories` / `subcategories` | `true` | `is_admin()` | `is_admin()` |
| `orders` | aucune | `is_admin()` | INSERT public (commande WhatsApp) ; UPDATE/DELETE `is_admin()` |
| `contact_messages` | aucune | `is_admin()` | INSERT public (formulaire) |
| `site_settings` | `true` (données publiques du site) | `is_admin()` | `is_admin()` |
| `promos` | `is_active = true` | `is_admin()` | `is_admin()` |
| Storage `cosmetics-images` | SELECT public | — | `is_admin()` |

Conséquences pour un visiteur anonyme :

- **INSERT** protégé : bloqué (sauf INSERT intentionnels `orders` / `contact_messages`, avec contraintes d'intégrité quantité ≥ 1, prix ≥ 0, nom non vide).
- **UPDATE** protégé : bloqué.
- **DELETE** protégé : bloqué.
- **Accès aux données privées** (lecture des commandes, messages, produits masqués) : bloqué.

## Service Role

Aucune clé `service_role` n'est exposée :

- le frontend n'utilise que `VITE_SUPABASE_PUBLISHABLE_KEY` (clé **anon** publique) ;
- aucune occurrence de `service_role` / `SERVICE_ROLE_KEY` dans le code
  applicatif (React, env Vite, fichiers publics) ;
- seule une référence documentaire inertes subsiste dans l'outillage hors
  application : un placeholder `cle-service-role-jamais-en-frontend`
  dans `postman/environments/Kissariya - Supabase.environment.yaml`
  (outil de test local, jamais bundle ni déployé) ;
- `.gitignore` exclut `.env*` (seul `.env.example` est versionné, sans secrets réels).

## Tests

| Vérification | Résultat |
|---|---|
| TypeScript (`tsc --noEmit`) | ✅ PASS |
| ESLint (`eslint src --max-warnings 0`) | ✅ PASS |
| Tests unitaires (`vitest run`) | ✅ PASS — 11 fichiers, 70/70 |
| E2E Playwright (`npx playwright test`) | ✅ PASS — 6/6 |
| Build production (`vite build`) | ✅ PASS |

Cas de test couverts :

- `sans session, /admin redirige vers /admin/login` (E2E) ✅
- Connexion admin (email/mot de passe, succès + erreur + validation + backoff) ✅
- `redirige vers /admin après un login réussi` (test unitaire Auth) ✅

Cas nécessitant le projet Supabase réel (non exécutés ici — ⚠️ manuels) :

- Login réel d'un compte existant depuis `/admin/login` → `/admin`.
- CRUD produits / commandes avec une session admin réelle.
- Tentative anonyme d'opération admin via l'API REST (doit être bloquée par RLS).

## Remaining Risks

Vérifications manuelles requises dans le Dashboard Supabase :

1. **Inscription publique** : confirmé que Authentication → Providers → Email →
   « Allow new users to sign up » est **désactivé**. (Si actuellement activé,
   tout visiteur pourrait créer un compte — et ce compte serait automatiquement
   admin. C'est le seul point qui rendrait le modèle `auth.uid() IS NOT NULL`
   dangereux.)
2. **Exécution du schéma** : rejouer `supabase/database.sql` dans le SQL Editor
   pour garantir que `is_admin()` et les policies RLS correspondent bien à ce
   fichier (idempotent, sans table `admin_users`).
3. **Login réel** : tester `/admin/login` avec un compte existant
   (ex. `admin1@example.com`) puis naviguer dans `/admin/*`.
4. **Anonyme vs RLS** : depuis un navigateur déconnecté (ou `curl` avec la clé
   anon), vérifier que `GET /rest/v1/orders`, `PATCH /rest/v1/products`,
   `DELETE /rest/v1/products` renvoient bien une erreur/table vide.
5. **Rate limiting** : les INSERT publics (`orders`, `contact_messages`) ne sont
   pas protégés par un rate-limit serveur — prévoir honeypot/rate-limit avant une
   campagne de trafic massive.
