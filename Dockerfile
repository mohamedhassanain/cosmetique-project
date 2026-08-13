# =====================================================================
# KISSARIYA COSMÉTIQUES — production Dockerfile (frontend only)
# ---------------------------------------------------------------------
# Architecture stays: browser → Cloudflare → Docker/Nginx → Supabase.
# Nginx ONLY serves the React/Vite static build. No backend is created.
# Supabase (Auth/PostgreSQL/Storage) remains the sole backend.
#
# Stage 1 (build) : node LTS alpine → npm ci → vite build (no dev server).
# Stage 2 (runtime) : nginx alpine → copy dist/ → serve static files.
#
# Required build args (browser-public only, never secrets):
#   VITE_SUPABASE_URL             (https://xxx.supabase.co)
#   VITE_SUPABASE_PUBLISHABLE_KEY (anon/publishable key)
# Optional build args:
#   VITE_SUPABASE_PROJECT_ID
#   VITE_SENTRY_DSN
#   VITE_SENTRY_ENVIRONMENT
#   RUN_PRERENDER=true            (generates dist/prerendered SEO pages)
#
# docker-compose.yml reads the root .env automatically and passes the
# VITE_* values as build args. Plain docker build requires --build-arg:
#   docker build --build-arg VITE_SUPABASE_URL=... \
#                --build-arg VITE_SUPABASE_PUBLISHABLE_KEY=... \
#                -t my-ecommerce-frontend .
# =====================================================================

# ---------------- Stage 1: build ----------------
FROM node:22-alpine AS build

WORKDIR /app

# Browser-public configuration (baked into the bundle, same as Netlify/Vercel).
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_PUBLISHABLE_KEY
ARG VITE_SUPABASE_PROJECT_ID
ARG VITE_SENTRY_DSN
ARG VITE_SENTRY_ENVIRONMENT

# Fail fast instead of producing a broken bundle with empty Supabase config.
RUN test -n "$VITE_SUPABASE_URL" -a -n "$VITE_SUPABASE_PUBLISHABLE_KEY" \
    || (echo "ERROR: VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY are required build args" && exit 1)

# Dependencies first for layer caching.
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# Application source + config.
COPY . .

# Production build (vite build → dist/). Never `npm run dev`.
# VITE_* values are injected as shell env only for this command (the anon
# publishable key is public by design — same value shipped in every web
# bundle today). No ENV layer, no files written into the image.
RUN VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
    VITE_SUPABASE_PUBLISHABLE_KEY=$VITE_SUPABASE_PUBLISHABLE_KEY \
    VITE_SUPABASE_PROJECT_ID=$VITE_SUPABASE_PROJECT_ID \
    VITE_SENTRY_DSN=$VITE_SENTRY_DSN \
    VITE_SENTRY_ENVIRONMENT=$VITE_SENTRY_ENVIRONMENT \
    npm run build

# Optional: prerender SEO product pages (queries public Supabase at build time).
# Off by default so the build has no network dependency; enable with
# --build-arg RUN_PRERENDER=true (or the compose override documented in
# DOCKER_DEPLOYMENT.md).
ARG RUN_PRERENDER=false
RUN if [ "$RUN_PRERENDER" = "true" ]; then npm run prerender; fi

# ---------------- Stage 2: runtime ----------------
FROM nginx:1.27-alpine AS runtime

# Nginx: SPA fallback, gzip, cache headers, security headers.
# No proxy, no backend, no Supabase Auth proxying.
COPY nginx/default.conf /etc/nginx/conf.d/default.conf
COPY nginx/security-headers.inc /etc/nginx/conf.d/security-headers.inc

# Copy ONLY the production build output.
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

# Run nginx in the foreground so Docker keeps the container alive.
CMD ["nginx", "-g", "daemon off;"]
