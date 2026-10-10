# syntax=docker/dockerfile:1.28.0
# Imagen del backend Medusa (fase 10). UNA imagen para `server` y `worker` (MEDUSA_WORKER_MODE);
# solo `server` migra la BD al arrancar (start.sh). Contexto de build: la RAÍZ del monorepo.
#
#   docker build -f apps/backend/Dockerfile -t ecommerce-backend:local .
#
# Fuentes: context7 /medusajs/medusa (learn/build: `medusa build` → .medusa/server;
# deployment/general: predeploy = `medusa db:migrate` + `medusa start`; production/worker-mode),
# context7 /pnpm/pnpm.io (docker.md, cli/fetch, cli/deploy: en pnpm ≥ 12.2 `deploy` no necesita
# injectWorkspacePackages) y AGENTS §6.
# El Admin se compila SIN `admin.backendUrl` (MEDUSA_BACKEND_URL vacío en el build): usa el
# origen del navegador, así la imagen no queda atada a un dominio.

ARG NODE_IMAGE=node:24.21.0-alpine3.24

# ── base: Node + pnpm (versión de `packageManager`, vía corepack) ────────────────────────────────
FROM ${NODE_IMAGE} AS base
ENV PNPM_HOME=/pnpm \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    MEDUSA_DISABLE_TELEMETRY=true
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack install -g pnpm@12.10.1
WORKDIR /repo

# ── deps: descarga del lockfile al store (capa válida mientras no cambie el lockfile) ────────────
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm fetch --store-dir=/pnpm/store

# ── build: install offline, plantillas de email, `medusa build` y node_modules de producción ─────
FROM deps AS build
COPY . .
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --offline --frozen-lockfile --store-dir=/pnpm/store --filter "backend..."
# `emails` (workspace) se compila a dist/ (CommonJS) antes del build y del deploy.
RUN pnpm --filter emails build && pnpm --filter backend build
# Solo dependencias de producción (devDependencies fuera: nodemailer, jest, swc…). El paquete
# `emails` se copia (con su dist/) en vez de enlazarse. Sin --offline: la política de
# minimumReleaseAge de pnpm comprueba el lockfile nuevo del deploy contra los metadatos del
# registro (los paquetes salen del store).
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm --filter backend deploy --prod --prefer-offline --store-dir=/pnpm/store /prod/backend

# ── runtime: .medusa/server (JS compilado + Admin) + node_modules de producción ──────────────────
FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production \
    MEDUSA_DISABLE_TELEMETRY=true \
    PORT=9000
# /server y no /app: recomendación de Medusa para evitar conflictos con el Admin en Docker.
# Propiedad de `node`: Medusa escribe en el directorio de trabajo (p. ej. `static/` del proveedor
# de ficheros local cuando no hay S3_BUCKET).
RUN mkdir /server && chown node:node /server
WORKDIR /server
COPY --from=build --chown=node:node /repo/apps/backend/.medusa/server ./
COPY --from=build --chown=node:node /prod/backend/node_modules ./node_modules
COPY --chown=node:node --chmod=755 apps/backend/docker/start.sh ./start.sh
USER node
EXPOSE 9000
# `medusa start` registra /health en server y en worker (los dos escuchan en PORT).
HEALTHCHECK --interval=15s --timeout=5s --start-period=120s --retries=5 \
    CMD wget -qO- "http://127.0.0.1:${PORT}/health" >/dev/null || exit 1
CMD ["./start.sh"]
