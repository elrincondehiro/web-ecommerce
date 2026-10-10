# syntax=docker/dockerfile:1.28.0
# Imagen del storefront Astro (fase 10): HTML estático + servidor Node (@astrojs/node standalone)
# para server islands y rutas on-demand. Contexto de build: la RAÍZ del monorepo.
#
# El HTML del catálogo se genera EN EL BUILD contra la API de Medusa: la imagen lleva los datos
# del momento del build (precio/stock los corrige LiveSync en runtime).
#
#   # Contra un backend (necesita la publishable key como build secret):
#   docker build -f apps/storefront/Dockerfile --network host \
#     --build-arg SITE_URL=https://tienda.example.com \
#     --build-arg MEDUSA_BACKEND_URL=http://localhost:9000 \
#     --secret id=medusa_publishable_key,env=MEDUSA_PUBLISHABLE_KEY \
#     -t ecommerce-storefront:local .
#   # Sin backend (CI; NO desplegable): --build-arg STOREFRONT_DATA=fixtures
#
# Variables de RUNTIME (no se fijan en el build): MEDUSA_BACKEND_URL, MEDUSA_PUBLISHABLE_KEY,
# PUBLIC_STRIPE_PUBLISHABLE_KEY, COOKIE_SECURE, SERVER_TIMING, SEARCH_*_CACHE_TTL.
# Fuentes: astro-docs (recipes/docker "Multi-stage build (using SSR)", integrations-guide/node
# "Environment variables": el adapter no carga .env), context7 /pnpm/pnpm.io (docker, fetch,
# deploy) y AGENTS §6.

ARG NODE_IMAGE=node:24.21.0-alpine3.24

# ── base: Node + pnpm (versión de `packageManager`, vía corepack) ────────────────────────────────
FROM ${NODE_IMAGE} AS base
ENV PNPM_HOME=/pnpm \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    ASTRO_TELEMETRY_DISABLED=1
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack install -g pnpm@12.10.1
WORKDIR /repo

# ── deps: descarga del lockfile al store (capa válida mientras no cambie el lockfile) ────────────
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm fetch --store-dir=/pnpm/store

# ── build: install offline + astro build ─────────────────────────────────────────────────────────
FROM deps AS build
COPY . .
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --offline --frozen-lockfile --store-dir=/pnpm/store --filter "storefront..."

# Se fijan en el build: dominio público (canonical, sitemap, security.allowedDomains), origen de
# las imágenes que se optimizan, de dónde salen los datos y la API que se consulta al construir.
# Los ARG llegan a los RUN como variables de entorno; los vacíos se quitan (astro:env validaría ""
# como valor) y NO se guardan con ENV en la imagen.
ARG SITE_URL
ARG IMAGE_BASE_URL
ARG STOREFRONT_DATA=medusa
ARG STOREFRONT_MAX_PRODUCTS
ARG MEDUSA_BACKEND_URL=http://localhost:9000

# Publishable key (build secret: no queda en ninguna capa ni en el historial) y ASTRO_KEY
# opcional (clave fija de las props de server islands). La caché de imágenes optimizadas
# (node_modules/.astro) va en un cache mount: con ella, los builds siguientes tardan segundos.
RUN --mount=type=secret,id=medusa_publishable_key \
    --mount=type=secret,id=astro_key \
    --mount=type=cache,id=astro-cache,target=/repo/apps/storefront/node_modules/.astro \
    for v in SITE_URL IMAGE_BASE_URL STOREFRONT_MAX_PRODUCTS; do \
      eval "[ -n \"\${$v:-}\" ]" || unset "$v"; done; \
    if [ -s /run/secrets/medusa_publishable_key ]; then \
      export MEDUSA_PUBLISHABLE_KEY="$(cat /run/secrets/medusa_publishable_key)"; fi; \
    if [ -s /run/secrets/astro_key ]; then export ASTRO_KEY="$(cat /run/secrets/astro_key)"; fi; \
    pnpm --filter storefront build

RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm --filter storefront deploy --prod --prefer-offline --store-dir=/pnpm/store /prod/storefront

# ── runtime: dist/ + node_modules de producción ───────────────────────────────────────────────────
FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production \
    ASTRO_TELEMETRY_DISABLED=1 \
    HOST=0.0.0.0 \
    PORT=4321
WORKDIR /app
COPY --from=build --chown=node:node /prod/storefront/package.json ./package.json
COPY --from=build --chown=node:node /prod/storefront/node_modules ./node_modules
COPY --from=build --chown=node:node /repo/apps/storefront/dist ./dist
USER node
EXPOSE 4321
# /health/ (src/pages/health.ts): solo comprueba que el proceso responde.
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
    CMD wget -qO- "http://127.0.0.1:${PORT}/health/" >/dev/null || exit 1
CMD ["node", "./dist/server/entry.mjs"]
