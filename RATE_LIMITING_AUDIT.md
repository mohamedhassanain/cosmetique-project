# RATE LIMITING AUDIT — Kissariya Cosmétiques

Date: 2026-08-14
Scope: server-side anti-abuse / rate limiting for `orders` and `contact_messages` creation.
This document is the **Step 1 audit** — no code was modified before it was completed.

---

## 1. Current architecture

```
Browser
   ↓
React/Vite frontend (React 18, React Query, zod)
   ↓
Supabase (Auth / PostgreSQL / Storage)
```

- No backend, no Edge Functions, no proxy. The browser talks directly to PostgREST
  (`/rest/v1/*`) and GoTrue (`/auth/v1/*`) with the **anon** key.
- Deployment: Nginx static container (Docker) or Netlify/Vercel — frontend only.
- Docker/Nginx serve static files only; no routing to any backend.

## 2. Order creation flow (current)

Call sites of `supabase.from('orders').insert(...)` / `createOrder`:

| Caller | File | Trigger | Notes |
|---|---|---|---|
| `createOrder()` | `src/services/order.service.ts` | used by all paths below | single direct PostgREST INSERT to `orders` |
| `openWhatsAppOrder()` | `src/services/whatsapp.service.ts` | product detail / quick-view “WhatsApp” click | silent tracking order `customer_name='WhatsApp Click'`, `product_id` set, `total_price = product.price` |
| `CartSheet` “Commander sur WhatsApp” | `src/components/cart/CartSheet.tsx` | cart checkout | `customer_name='En attente'`, `customer_phone=''`, multi-line product summary in `notes`, client-computed `total_price` |
| `useCreateOrder` (admin “Ajouter” dialog) | `src/hooks/useOrders.tsx` + `src/pages/admin/AdminOrders.tsx` | admin manual order entry | same direct INSERT, authenticated session |

Client-side protections today:
- Module-level anti-double-click lock in `whatsapp.service.ts` (`whatsappOrderInFlight`).
- `useRef` lock in `CartSheet` (`orderLockRef`).
- No honeypot, no debounce, no timing gate. README’s mention of “honeypot + debounce côté client” is **inaccurate** — neither exists in code.

## 3. Contact message flow (current)

- **No frontend code exists** that inserts into `contact_messages`.
- The table exists (`name`, `email`, `phone`, `subject`, `message`, `is_read`, `created_at`).
- A `contactSchema` (zod) exists in `src/lib/schemas.ts` but is not used by any component.
- Footer “Contact” link is a dead `href="#"`.
- Because the anon INSERT policy exists (`contact_messages_insert_public`), **anyone can still INSERT via REST without a UI**.

## 4. Current RLS policies (from `supabase/database.sql`)

Admin model: any authenticated user is admin (`is_admin()` = `auth.uid() IS NOT NULL`); accounts are created manually, no public signup.

| Table | Public | Admin |
|---|---|---|
| `orders` | **INSERT WITH CHECK (true)** | SELECT / UPDATE / DELETE via `is_admin()` |
| `contact_messages` | **INSERT WITH CHECK (true)** | SELECT via `is_admin()` (no UPDATE/DELETE policy) |
| `products` | SELECT `is_active=true` | SELECT all + ALL |
| `categories / subcategories / product_images / site_settings / promos` | SELECT | ALL |

### Critical finding
Both write tables carry an **unconditional anon INSERT policy** (`WITH CHECK (true)`), i.e. there is currently **no** server-side protection on `orders` and `contact_messages` creation. Anybody can POST to:
- `POST /rest/v1/orders`
- `POST /rest/v1/contact_messages`
Directly, bypassing the frontend entirely.

## 5. Edge Functions

- `supabase/functions/` does not exist. **No Edge Functions**.
- No `supabase/migrations/` content. `supabase/config.toml` defines `project_id = "khktvzedjlcrqtjoyfky"` (note: `.env.example` references a different project id `ygkeuhatokvkdwwoccty` — likely a stale sample; deployment must use the real project).

## 6. Environment variables (`.env.example`)

| Variable | Visibility | Notes |
|---|---|---|
| `VITE_SUPABASE_URL` | build-time, public | part of every bundle |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | build-time, public | anon key, RLS-protected |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_TEST_EMAIL/PASSWORD` | k6 load-test only | test project, never production |
| `VITE_SENTRY_DSN` / `ENVIRONMENT` | build-time | monitoring |

No `service_role` / `SUPABASE_SERVICE_ROLE_KEY` appears anywhere in repo source (see §Security baseline). No Edge Function secrets configured.

## 7. Existing tests (Vitest)

- `src/services/__tests__/order.service.test.ts` — mocks Supabase client; `createOrder` test asserts the direct `.insert()` call with defaults.
- `src/services/__tests__/whatsapp.service.test.ts` — mocks `createOrder`; asserts WhatsApp opens even if tracking insert fails.
- `src/services/__tests__/{product,category,storage}.service.test.ts`, hook tests, `src/lib/__tests__`.
- `load-tests/` + `scripts/k6-load-test.js` — k6 load patterns against REST/auth (test project only).

## 8. Admin CRUD (must remain unchanged)

- Login: `supabase.auth.signInWithPassword` (Auth page + `useLoginBackoff` client backoff).
- Orders admin: fetch (paginated, status filter), stats count, update status, edit customer fields, delete, manual create — all via PostgREST with the **authenticated JWT**, protected by `orders_admin_*` policies.
- Products/categories/settings/promos: admin-only PostgREST CRUD behind `is_admin()` policies.

## 9. Database integrity on public inserts today

- `orders`: CHECK `quantity >= 1`, `total_price >= 0`, `product_name` non-empty. No other validation on public INSERT (arbitrary names, phones, huge notes, negative/absurd totals allowed when ≥0, status can be forged from the client).
- `contact_messages`: no CHECK constraints.

## 10. Must change

1. Add persistent (DB-backed) rate limiting for `orders` and `contact_messages` creation, enforced server-side.
2. Add Supabase Edge Functions as the **only** public write path:
   - `create-order`
   - `create-contact`
   They must: validate payloads, enforce rate limits, insert with `service_role` (server-side only), return 400/429/500 without leaking internals.
3. **Close the direct-REST hole**: remove the anon `INSERT WITH CHECK (true)` policies on `orders` and `contact_messages`, and add an admin INSERT policy on `orders` so the admin “Ajouter une commande” dialog keeps working. RLS stays enabled and is strengthened (a public write hole is closed — no policy is weakened).
4. IP handling: derive client IP from platform headers only; hash/anonymize before storage.
5. Rate-limit state: DB table with unique indexed buckets + expiry cleanup — **no in-memory Map** in the Edge Function.
6. Frontend: route public order creation (WhatsApp click + cart) and contact submission through the Edge Functions; admin CRUD keeps direct PostgREST with admin policies.
7. Validation: reject malformed payloads (400); for `product_id`-based orders, derive `total_price` server-side from the products table (client price ignored); cap lengths/quantities; force `status='pending'` for public orders.
8. Tests + k6 script for rate limiting; regression (lint / typecheck / build / vitest).

## 11. Must NOT change

- Architecture (no Spring Boot, no Redis, no new infra, no load balancer).
- Supabase plan / config.
- RLS enabled state; admin authorization model (`is_admin()` = authenticated).
- Admin login + admin CRUD flows (kept on PostgREST with the user’s JWT).
- Public GETs (catalog, categories, settings caching, Cloudflare cache rules).
- Docker/Nginx composition (Edge Functions run on Supabase platform — outside the web container).
- The anon key in `VITE_SUPABASE_PUBLISHABLE_KEY` (public by design).
- Service role key must never enter the frontend/bundle/public files; it is used only inside Edge Functions.

## 12. Risk / discrepancy notes

- `.env.example` Supabase project id differs from `supabase/config.toml` — deployment must use the real project.
- No public contact UI exists — the contact endpoint + service will be added, and a minimal contact page will wire it (footer “Contact” link is currently dead).
- Public cart orders (no `product_id`) cannot have their total independently verified without a line-item schema; mitigation: numeric bounds + server-side rate limiting (documented limitation).
- Because the rate-limit counters live in a base table touched by Edge Functions only, the Supabase-generated frontend types (`src/integrations/supabase/types.ts`) will not be extended for it.
