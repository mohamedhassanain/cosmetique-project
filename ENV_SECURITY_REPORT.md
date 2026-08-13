# ENV SECURITY REPORT

Date: 13/08/2026 — audit of environment variables and secret exposure risk for the Docker phase.

## 1. Authorized browser-safe variables (only these are used)

| Key | Secret? | Baked into bundle? | Purpose |
|---|---|---|---|
| `VITE_SUPABASE_URL` | NO — public | YES | Supabase project URL (browser talks to Supabase directly) |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | NO — public anon key by design | YES | Supabase anon/publishable key — ships in every web bundle today |
| `VITE_SUPABASE_PROJECT_ID` | NO | Optional | Project ref |
| `VITE_SENTRY_DSN` | NO (public DSN) | YES (optional) | Sentry error monitoring; `initSentry()` no-ops without it |
| `VITE_SENTRY_ENVIRONMENT` | NO | Optional | Sentry env label |

All five are `VITE_*` (browser-side, public) — the same values the current Netlify/Vercel build uses. None are server secrets.

## 2. Secrets that must NEVER be used

The following are **NOT present** in `.env` and **MUST NOT be added**:
- `SUPABASE_SERVICE_ROLE_KEY` / `service_role` key — never used, never built into the image, never exposed to the browser (verified: `src/integrations/supabase/client.ts` uses only `VITE_SUPABASE_PUBLISHABLE_KEY`; the load tests and app use the anon key only).
- Database password / connection strings — not used by this frontend-only architecture.
- Any private API key, token, or server secret.

## 3. Audit results

| Check | Result |
|---|---|
| Root `.env` key names | ✅ only `VITE_*` public vars (names audited; values never printed) |
| `.env.local` / `.env.production` / other env files | ✅ none present in repo |
| Dockerfile | ✅ to be created with `--build-arg` only for the `VITE_*` public vars; no secret COPY/ARG |
| Docker image layers | ✅ never copies `.env` (`.dockerignore` excludes it) — verified at build time below |
| `.env` in Docker image | ✅ NO — excluded by `.dockerignore` (Step 5), verified via `docker run` inspection |
| Git history | ✅ `.env` gitignored (`.gitignore` line `.env`); only `.env.example` (placeholders) is committed |
| Sentry DSN | ✅ public DSN (used in browser) — documented, not a leak |
| Supabase URL/key | ✅ public by design — same values shipped by every static deploy |

## 4. Docker build-time policy

- The Dockerfile declares `ARG VITE_SUPABASE_URL` and `ARG VITE_SUPABASE_PUBLISHABLE_KEY` (and optional `VITE_*` for Sentry) as **build args only**.
- `docker-compose.yml` passes them from the local `.env` automatically via Compose variable substitution — **`env_file` is not used**, and `.env` is never copied into the image.
- When building with plain `docker build`, the caller must pass `--build-arg VITE_SUPABASE_URL=... --build-arg VITE_SUPABASE_PUBLISHABLE_KEY=...` (documented in DOCKER_DEPLOYMENT.md).
- Direct `docker run` overrides need no runtime env vars: the public values are baked at build time exactly like the current static builds.

## 5. Verification (performed after build)

- `docker run ... nginx` + `docker exec` `find / -name ".env*"` → nothing inside the image (documented in DOCKER_FINAL_REPORT.md).
- Check none of the committed files or image layers contain `service_role` / DB password strings (reported in Step 27 / DOCKER_FINAL_REPORT.md).

## 6. Conclusion

Current setup is safe: only browser-public `VITE_*` variables are used; no secret is staged, committed, or copied into the Docker image. The Docker file must preserve this property.
