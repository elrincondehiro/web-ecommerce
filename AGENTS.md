# AGENTS.md — Directrices para agentes de IA

Este fichero es de **lectura obligatoria** para cualquier agente de IA (y persona) que trabaje en este repositorio. Si hay contradicción entre el código existente y este documento, **manda este documento**. Si algo no está cubierto, pregunta antes de inventar convenciones.

Contexto del proyecto, arquitectura, **versiones de referencia (README §4)** y roadmap: [`README.md`](./README.md).

> **Sesión nueva → lee primero [`docs/ESTADO.md`](./docs/ESTADO.md)** (estado actual, cómo se trabaja y siguiente fase). Detalle por fase en [`docs/fases/`](./docs/fases/). No inicies ninguna fase sin autorización explícita del usuario.

---

## ⛔ REGLA Nº 1 — Consultar documentación y confirmar antes de empezar

Esta regla está **por encima de todas las demás**.

**Antes de empezar cualquier parte nueva** (una fase del roadmap, crear el storefront, crear el backend, añadir un módulo, un servicio, un compose, un Dockerfile, un workflow de CI, una integración):

1. **Consulta la documentación**, en este orden:
   1. **MCP específico** de la tecnología (`astro-docs`, `svelte`, `cloudflare-docs`, `meilisearch-docs`, `resend-docs`, `stripe`).
   2. Si no hay MCP específico o no cubre el tema → **`context7`** (p. ej. Medusa `/medusajs/medusa`, Tailwind, shadcn-svelte, SeaweedFS, Caddy…).
   3. Solo si ninguno responde → documentación oficial por HTTP (p. ej. `docs.medusajs.com/llms-full.txt`), indicándolo.
2. **Verifica** que lo consultado corresponde a las **versiones fijadas** (las de los ficheros: `package.json`, `docker/*.yml`, workflows; README §4 como referencia).
3. **Presenta un plan** al usuario: qué vas a crear/ejecutar, comandos exactos, ficheros afectados y fuentes consultadas.
4. **Espera confirmación explícita del usuario.** No ejecutes nada (ni scaffolding, ni `pnpm add`, ni `docker compose up`, ni migraciones, ni escritura de ficheros de código) hasta recibirla.

**Ante cualquier duda — aunque sea pequeña — no ejecutes nada: pregunta y espera.** Documentación contradictoria, un flag que no aparece en la doc, una versión incompatible, un paso ambiguo del plan: todo eso es motivo para parar y preguntar. Es preferible preguntar de más que ejecutar algo equivocado.

## 0. Resumen de reglas

0. **REGLA Nº 1** (arriba): documentación (MCP específico → context7) + plan + confirmación del usuario antes de empezar cualquier parte nueva. Ante la duda, no ejecutar y esperar.

1. **pnpm siempre.** Nunca `npm`, `npx`, `yarn`. Usa `pnpm`, `pnpm dlx`, `pnpm exec`, `pnpm --filter <pkg>`.
2. **fnm, no nvm.** La versión de Node está en `.node-version`. No añadas `.nvmrc`.
3. **Estático primero.** Orden: HTML estático → server island → ruta on-demand → isla Svelte en cliente. Justifica por escrito cada `client:*`.
4. **Mínimo JS en cliente.** Cada KB de JS enviado al navegador necesita un motivo. Respeta el presupuesto (§3.4).
5. **Mejora progresiva.** Todo flujo crítico (añadir al carrito, buscar, login) funciona sin JS con `<form>` + Astro Actions.
6. **Servicios en Docker.** Postgres, Redis, Meilisearch, SeaweedFS, Mailpit y Stripe CLI corren con `docker/compose.dev.yml`. No instales nada de eso en el host.
7. **Nunca commits a `main`.** Trabaja en `feat/*`, `fix/*`, `chore/*`, `docs/*`; abre PR; CI en verde; merge squash.
8. **Conventional Commits** con scope: `feat(storefront): …`, `fix(backend): …`.
9. **Cero secretos en el repo.** Solo `.env.example`. Nunca registres claves en logs ni las envíes al cliente (salvo las `PUBLIC_*` pensadas para ello).
10. **Antes de terminar una tarea**: `pnpm lint && pnpm typecheck && pnpm test && pnpm build` sin errores.
11. **Versiones fijadas.** La **fuente de verdad** son los ficheros (`package.json`/`pnpm-lock.yaml`, `docker/*.yml`, `.github/workflows/*`, `.node-version`). README §4 es una **referencia** que se revisa al cerrar cada fase. No subas ni bajes versiones por iniciativa propia.
12. **Documentación vía MCP, no de memoria.** Antes de escribir código contra una API, consúltala en el MCP correspondiente (§1.1).

---

## 1. Stack y versiones

Resumen orientativo (fuente de verdad: los ficheros del repo; tabla de referencia en **README §4**, revisada al cerrar cada fase):

| Pieza       | Versión                                               | Notas                                                                                                                  |
| ----------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Node        | **24.21.0** (`.node-version`)                         | gestionado con fnm                                                                                                     |
| pnpm        | **12.9.1** (`packageManager`)                         | workspaces, `node-linker=hoisted`, `save-exact=true`                                                                   |
| Medusa      | **2.21.2**                                            | `@medusajs/*` todos en la **misma** versión                                                                            |
| Astro       | **7.3.5**                                             | `@astrojs/node` 11.1.6 standalone, `@astrojs/svelte` 9.0.1                                                             |
| Svelte      | **5.57.1** (runes)                                    | `$state`, `$derived`, `$props`, `$effect`; **no** API de Svelte 4 (`export let`, stores para estado local, `on:click`) |
| Tailwind    | **4.3.3**                                             | plugin `@tailwindcss/vite`, config CSS-first (`@theme` en `global.css`); **no** `tailwind.config.js`                   |
| UI          | shadcn-svelte 1.7.0 + bits-ui 2.19.5                  | componentes copiados en `src/lib/components/ui`                                                                        |
| TypeScript  | **6.0.3**                                             | TS 7 no soportado aún por Astro/Medusa                                                                                 |
| PostgreSQL  | `postgres:17.11-alpine`                               |                                                                                                                        |
| Redis       | `redis:8.10.2-alpine`                                 |                                                                                                                        |
| Meilisearch | `getmeili/meilisearch:v1.54.3`                        |                                                                                                                        |
| S3 local    | `chrislusf/seaweedfs:4.48`                            | solo dev; prod = Cloudflare R2. MinIO descartado                                                                       |
| Caddy       | `caddy:2.11.4-alpine`                                 |                                                                                                                        |
| React Email | react-email 6.11.0 · components 1.0.12 · render 2.1.0 | solo en `packages/emails`                                                                                              |

Reglas de dependencias:

- Añade dependencias con `pnpm --filter <app> add <pkg>@<versión exacta>` (o `-D`). Nunca edites el lockfile a mano.
- Una dependencia **nueva** requiere aprobación del usuario y añadirla a README §4 en el mismo PR.
- Cambios de versión de dependencias existentes: vía PRs de **Renovate** (o `chore(deps): …` explícitos). No hace falta tocar README §4 en ese PR: se sincroniza al **cerrar cada fase** (paso obligatorio del documento de fase).
- Renovate (`renovate.json`): minor/patch agrupados en un PR semanal; **majors solo con aprobación** en el Dependency Dashboard; PostgreSQL fijado a `<18`; nada de npm con menos de 24 h (igual que `minimumReleaseAge` de pnpm).
- Antes de añadir una dependencia al **storefront cliente**, comprueba su peso (bundlephobia / `pnpm build` + análisis). Prefiere APIs nativas del navegador.
- No introduzcas React en el storefront. React solo existe en `packages/emails`.
- No asumas APIs de Medusa v1, Astro ≤ 6, Svelte 4 ni Tailwind v3: **consulta la documentación** (§1.1).

### 1.1 Fuentes de documentación (MCP)

Configurados en `.pi/mcp.json` (proyecto) y `~/.pi/agent/mcp.json` (usuario). Ver README §5.

| Tema                                                                                                | Fuente                                        | Cómo                                                                                                             |
| --------------------------------------------------------------------------------------------------- | --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Astro 7                                                                                             | MCP `astro-docs`                              | buscar en docs                                                                                                   |
| Svelte 5                                                                                            | MCP `svelte`                                  | docs + autofixer: **pasa cada componente `.svelte` nuevo por el autofixer**                                      |
| Medusa v2                                                                                           | MCP `context7` → library `/medusajs/medusa`   | `resolve-library-id` + `query-docs`. Complemento: `curl -s https://docs.medusajs.com/llms-full.txt \| grep -i …` |
| shadcn-svelte (CLI, componentes)                                                                    | skill `.pi/skills/shadcn-svelte` + `context7` | la skill se carga sola; comandos con `pnpm dlx shadcn-svelte@1.7.0` (nunca `@latest`)                            |
| Tailwind v4, shadcn-svelte, bits-ui, React Email, Caddy, PostgreSQL, Redis, SeaweedFS, pnpm, Docker | MCP `context7`                                | `resolve-library-id` + `query-docs`                                                                              |
| Cloudflare (R2, DNS, WAF, Origin CA, caché)                                                         | MCP `cloudflare-docs`                         | buscar en docs                                                                                                   |
| Meilisearch                                                                                         | MCP `meilisearch-docs`                        | buscar en docs                                                                                                   |
| Resend                                                                                              | MCP `resend-docs`                             | buscar en docs                                                                                                   |
| Stripe                                                                                              | MCP `stripe` (cuenta **test**) o `context7`   | docs; herramientas de cuenta solo lectura salvo petición explícita                                               |

Reglas:

- El MCP oficial de Medusa (`docs.medusajs.com/mcp`) **no se usa** (requiere Medusa Cloud).
- El MCP de Stripe **solo** se conecta a la cuenta de **pruebas**. Nunca crear, modificar ni borrar recursos en Stripe sin petición explícita del usuario. Nunca solicitar ni manejar claves live.
- Si un MCP no responde, dilo y usa la alternativa (context7 / `llms-full.txt`); no rellenes huecos inventando APIs.
- Cita en el PR la fuente consultada cuando implementes algo no trivial (p. ej. "según astro-docs: server islands…").

---

## 2. Estructura y responsabilidades

```
apps/backend       Medusa v2: módulos, workflows, subscribers, jobs, rutas API, extensiones admin
apps/storefront    Astro 7: páginas, layouts, componentes estáticos, islas Svelte, actions
packages/emails    Plantillas React Email (exporta componentes + helper de render)
packages/config    tsconfig/eslint/prettier compartidos
docker/            compose.dev.yml, compose.prod.yml, Caddyfile
.github/workflows  CI (ejecutado también por Gitea Actions)
```

- No mezcles responsabilidades: la lógica de negocio va en el **backend** (workflows de Medusa), no en el storefront.
- El storefront solo habla con el backend mediante `@medusajs/js-sdk` (envuelto en `src/lib/medusa.ts`). La búsqueda también va por el backend (`POST /store/search`); el storefront nunca habla con Meilisearch.

---

## 3. Frontend (apps/storefront)

### 3.1 Árbol de decisión para cada componente/página

```
¿El contenido es igual para todos los usuarios y cambia poco?
  └─ Sí → .astro estático (o Svelte SIN client:*), prerender = true.  ✅ FIN
¿Solo una parte es personalizada/volátil (precio, stock, carrito, usuario)?
  └─ Sí → página estática + <Componente server:defer> con fallback (skeleton).  ✅ FIN
¿La página entera depende del usuario/sesión (carrito, checkout, cuenta)?
  └─ Sí → export const prerender = false (on-demand), HTML desde servidor.  ✅ FIN
¿Hace falta interactividad en el navegador que un <form>/<details>/<dialog>/CSS no resuelven?
  └─ Sí → isla Svelte con la directiva más perezosa posible:
          client:visible > client:idle > client:media > client:load
          client:only="svelte" solo si no puede renderizarse en servidor (Stripe Elements).
```

Antes de crear una isla de cliente, intenta primero con: HTML nativo (`<details>`, `<dialog>`, `popover`, `<form>`), CSS (`:has()`, `:target`, `@starting-style`, scroll-snap, view transitions de CSS), o un `<script>` pequeño de Astro (se empaqueta y deduplica).

### 3.2 Convenciones

- `src/components/*.astro` → estáticos. `src/islands/*.svelte` → componentes que **se hidratan**. `src/lib/components/ui/*` → shadcn-svelte (se pueden usar en estático también).
- Componentes shadcn-svelte que no necesiten interacción se renderizan **sin** directiva `client:*` (salen como HTML puro).
- Estado compartido entre islas: `nanostores` o eventos DOM; nada de frameworks de estado pesados.
- Datos en build: `src/lib/medusa.ts` expone funciones tipadas (`getProducts`, `getProductByHandle`, …). Úsalas en `getStaticPaths`.
- **Precio y stock nunca se “congelan” en HTML estático** como dato definitivo. Patrón (fase 6): se escriben en el HTML del build como fallback, marcados con `data-pid`/`data-price`/`data-stock`, y `<LiveSync>` los corrige: una server island que solo devuelve datos (`<template>` JSON) y un script estático con hash CSP que los aplica (ver `src/lib/live-sync.ts`). Todo precio o stock nuevo sigue este patrón. Nunca inyectes `<script>`/`<style>` inline desde una island: la CSP los bloquea.
- Mutaciones (carrito, auth, newsletter) con **Astro Actions** (`src/actions`), aceptando `FormData`, validadas con `zod`, usables sin JS.
- Sesión/carrito: cookies `httpOnly`, `Secure`, `SameSite=Lax`. Nunca `localStorage` para tokens.
- Accesibilidad: HTML semántico, `alt` en imágenes, foco visible, contraste AA, formularios con `<label>`.
- SEO: `<title>`, meta description, canonical, Open Graph, JSON-LD `Product`/`BreadcrumbList`, `sitemap`.

### 3.3 Rendimiento — obligatorio

- Imágenes: `astro:assets` (`<Image>`/`<Picture>`), `width`/`height` siempre, AVIF/WebP, `loading="lazy"` salvo LCP (`loading="eager"` + `fetchpriority="high"`).
- Fuentes: auto-alojadas (Astro Fonts API), `font-display: swap`, máximo 2 familias, ficheros **estáticos** de los pesos usados (no la variable completa) y `preload` solo del peso del texto base.
- Terceros (analítica, píxeles, chat): **siempre** vía Partytown (`type="text/partytown"`) o cargados tras interacción. Nunca bloqueantes.
- Trabajo pesado de cliente (filtrado/ordenación grande, parsing) → **Web Worker**.
- Navegación: **Speculation Rules** inline (`<script type="speculationrules">`) y view transitions **nativas en CSS** (`@view-transition`). No actives `prefetch` de Astro ni `<ClientRouter />` (añaden JS a todas las páginas; ver `docs/fases/fase3.md` §7.1).
- Nada de CSS-in-JS en runtime. Tailwind v4 + tokens en `@theme`.
- Cabeceras de caché: assets `/_astro/*` inmutables (1 año); server islands con `s-maxage` corto + `stale-while-revalidate`; rutas por usuario `private, no-store`.
- Sin polyfills salvo necesidad demostrada. Target: navegadores evergreen.

### 3.4 Presupuestos (el CI los comprueba)

| Página                    | JS propio inicial (gzip)                     | LCP (móvil 4G) | CLS    |
| ------------------------- | -------------------------------------------- | -------------- | ------ |
| Home, listado, ficha, CMS | **0 KB** (máx. 5 KB si hay isla justificada) | < 1.8 s        | < 0.05 |
| Carrito                   | ≤ 15 KB                                      | < 2.0 s        | < 0.05 |
| Checkout (con Stripe)     | ≤ 30 KB propios (+ Stripe.js)                | < 2.5 s        | < 0.1  |

Lighthouse móvil: Performance ≥ 95, Accesibilidad ≥ 95, SEO 100 (salvo páginas `noindex` como `/carrito/`). Si un cambio empeora estas cifras, el PR debe explicar por qué.

Excepción aprobada en la fase 4: home, listados y fichas cargan **un único bundle de carrito** (`CartClient`, ≤ 2 KB gzip, sin imports; fetch + contador + toasts + flyout). Va como fichero en `/_astro/` (caché inmutable) y no inline. `check:budget` lo comprueba; cualquier otro bundle sigue prohibido. El JS inline (runtime de server islands + LiveSync + script de tema) va en ≤ 1,4 KB gzip (subido a 1,2 KB en la fase 7-1 porque las props cifradas de las islands cambian de longitud en cada build, y a 1,4 KB en I-Marca por el script que aplica el tema guardado antes de pintar, ~150 B).

Excepción aprobada en la fase 7-1: `/buscar/` carga, además de `CartClient`, **un bundle de búsqueda** (`SearchLive`, ≤ 1 KB gzip, sin imports, en `/_astro/`) que aplica los filtros en el sitio (modelo híbrido: sin JS los filtros son enlaces y cada clic navega). `check:budget` mide el bundle y el e2e de `/buscar/` comprueba que la página no carga otros.

Excepción aprobada en la fase 7-2: **todas** las páginas (vía `BaseLayout`, también carrito, checkout y pedido) cargan **un bundle común** (`SiteClient`, ≤ 1,5 KB gzip, sin imports, en `/_astro/`): sugerencias de la barra de búsqueda y selector de tema claro/oscuro (I-Marca). Es el sitio para el JS que necesiten todas las páginas; no lo dividas con `import()` dinámico (Vite añade ~750 B de helper, `docs/fases/fase7.md` §2.7.1). `check:budget` exige exactamente uno en cada página estática. En la Fase D lleva también el clic fuera de un popover (solo cierra) y los botones − / + de cantidad (1,46 KB).

Excepción aprobada en la Fase D: `/carrito/` carga **un bundle propio** (`CartLive`, ≤ 1 KB gzip, sin imports, en `/_astro/`) que aplica los cambios de cantidad y «Quitar» sin recargar (sin JS, los formularios de siempre). `check:budget` lo mide y el e2e del carrito comprueba que la página solo carga `SiteClient` + `CartLive`.

Excepción aprobada en la Fase D: las páginas con **carrusel** cargan **un bundle de arrastre** (`ScrollDrag`, ≤ 1 KB gzip, sin imports, en `/_astro/`) para desplazarlo con el ratón. **Recordatorio: todo carrusel nuevo (cualquier contenedor con scroll horizontal) lleva `data-drag-scroll` y su componente incluye `<ScrollDrag />`** (Astro deduplica el script), salvo que el arrastre se meta dentro del propio componente. `check:budget` exige `ScrollDrag` en toda página con `data-drag-scroll` y lo prohíbe en las demás. Hoy: carrusel de la home (`index.astro`) y galería de la ficha (`ProductGallery.astro`).

---

## 4. Backend (apps/backend)

- Sigue la arquitectura de Medusa v2: **módulos** (datos + servicios), **workflows** (lógica de negocio con compensación), **subscribers** (reacción a eventos), **scheduled jobs**, **API routes** (`src/api/store|admin|hooks`).
- La lógica que modifica datos va en **workflows** con pasos compensables; las rutas API solo validan y llaman al workflow.
- Módulos propios en `src/modules/<nombre>` con `index.ts` que exporta `Module(...)`. Migraciones con `pnpm --filter backend exec medusa db:generate <modulo>`; nunca SQL manual en producción.
- Enlaces entre módulos con `defineLink`, nunca FK directas entre módulos.
- Validación de entrada con `zod` en middlewares (`src/api/middlewares.ts`).
- Redis: usar los módulos oficiales (event bus, workflow engine, locking, caching). No uses `ioredis` directamente salvo en módulo propio justificado.
- **Server vs worker**: nada de trabajo pesado en el request. Emails, indexado de Meilisearch, generación de imágenes, rebuild del storefront → subscribers/jobs (se ejecutan en el worker).
- **Stripe**: proveedor oficial `payment-stripe`. Webhooks verificados con `STRIPE_WEBHOOK_SECRET`. El manejo debe ser **idempotente**. Importes siempre en la unidad que espere Medusa para la versión instalada; no conviertas a mano sin verificarlo.
- **Ficheros**: `file-s3` apuntando a SeaweedFS (local, `forcePathStyle`) o R2 (prod). No guardes ficheros en disco local del contenedor.
- **Búsqueda**: Search Module de Medusa con el proveedor Meilisearch (`@rokmohar/medusa-plugin-meilisearch`). Los índices se declaran en `src/search/*` con `defineSearchIndex` (campos con `searchable`/`filterable`/`sortable`/`facetable` explícitos) y se exponen solo los permitidos en `configureStoreSearch` (`src/api/middlewares.ts`). La key de Meilisearch solo está en el backend. Nada de subscribers ni de llamadas directas a Meilisearch para indexar: lo hace el módulo. Tras cambiar una definición: `medusa db:migrate` (nunca `--execute-all-search` sin revisar antes qué índices borra).
- **Emails**: proveedor de notificaciones propio (`src/modules/resend-notification`) que importa plantillas de `emails` (workspace) y las renderiza con `@react-email/render`. En desarrollo, se permite enviar a Mailpit (SMTP :1025) o usar el modo test de Resend.
- Logs con el logger de Medusa (`container.resolve("logger")`), nunca `console.log` en código final.

---

## 5. Emails (packages/emails)

- Una plantilla por fichero en `src/`, exportando el componente y un tipo de props.
- Usa solo componentes de `@react-email/components` (compatibilidad con clientes de correo). Nada de CSS externo ni JS.
- Incluye siempre versión texto plano (`render(..., { plainText: true })`).
- Cada plantilla tiene `PreviewProps` para la previsualización de `email dev`.

---

## 6. Docker y entornos

- **Desarrollo**: infraestructura en `docker/compose.dev.yml`; las apps corren en el host con `pnpm dev` (hot reload). No añadas las apps al compose de dev salvo petición expresa.
- **Producción**: `docker/compose.prod.yml` con todo el stack; solo **Caddy** publica puertos (80/443). Resto en red interna.
- **Dockerfiles** (en cada app):
  - Multi-stage: `base` (node:24-alpine + corepack/pnpm) → `deps` (`pnpm fetch` / `pnpm install --frozen-lockfile`) → `build` → `runtime` mínimo.
  - Usa `pnpm deploy --filter <app> --prod` para producir un `node_modules` de producción aislado.
  - Usuario no-root (`USER node`), `NODE_ENV=production`, `HEALTHCHECK`, sin herramientas de build en la imagen final.
  - Cache de pnpm con `--mount=type=cache,target=/pnpm/store`.
  - `.dockerignore` que excluya `node_modules`, `.env*`, `.git`, `dist`, `.astro`, `.medusa`.
- La imagen del backend es **una sola** para `server` y `worker`, diferenciada por `MEDUSA_WORKER_MODE`. Solo `server` ejecuta migraciones al arrancar.
- Usa tags **completos y fijos** (los vigentes están en `docker/*.yml`; referencia en README §4.2). **Prohibido `:latest`** en compose y Dockerfiles (dev y prod). El tag `:latest` solo existe como etiqueta de publicación de _nuestras_ imágenes.
- Imágenes referenciadas como `${REGISTRY}/${IMAGE_NAMESPACE}/ecommerce-<app>:${IMAGE_TAG}` para poder elegir Gitea o GHCR.

---

## 7. Caddy + Cloudflare

- Cloudflare con proxy, SSL **Full (strict)**, certificado **Origin CA** montado en Caddy (no ACME público detrás del proxy, salvo DNS challenge).
- Caddy: `encode zstd gzip`, `trusted_proxies` con rangos de Cloudflare, `client_ip_headers CF-Connecting-IP`, cabeceras de seguridad (HSTS, `X-Content-Type-Options`, `Referrer-Policy`, CSP que permita Stripe).
- Caché larga e inmutable para `/_astro/*`. El HTML lo sirve el contenedor storefront; Cloudflare lo cachea según `Cache-Control`.
- Admin de Medusa (`admin.dominio`) protegible con Cloudflare Access.

### 7.1 Monitorización (README §12)

- Modelo híbrido: **paneles, histórico y alertas en el homelab**; en el VPS Hetzner **solo agentes** (`beszel-agent`, `dozzle` en modo agent). No añadas herramientas de monitorización pesadas al VPS.
- Los agentes del VPS **no publican puertos a Internet**: Beszel conecta saliente por WebSocket; Dozzle agent solo escucha en la red privada (Tailscale/WireGuard).
- SDK de errores (Sentry → GlitchTip) **solo en servidor** (Medusa y Astro SSR). Nunca en el bundle de cliente.
- Todo servicio nuevo expone un `/health` y se añade a Uptime Kuma; todo job programado crítico (backups) envía un heartbeat.
- Nunca registres datos personales ni secretos en logs o eventos de error (scrubbing activado).

---

## 8. Git, CI y releases

### 8.1 Flujo

```
git switch main && git pull
git switch -c feat/carrito-server-island
# … commits pequeños (Conventional Commits) …
git push -u origin feat/carrito-server-island    # origin empuja a Gitea y GitHub
# abrir PR → CI verde → review → squash merge a main
```

- Ramas: `feat/*`, `fix/*`, `chore/*`, `docs/*`, `refactor/*`, `perf/*`. Nombres en kebab-case.
- Un PR = un cambio coherente. Describe: qué, por qué, impacto en rendimiento (JS enviado, Lighthouse) y cómo probarlo.
- Los agentes **no** hacen push a `main`, **no** crean tags, **no** hacen `force-push` a ramas compartidas y **no** reescriben historia publicada, salvo petición explícita del usuario.

### 8.2 CI

- Orden del roadmap: el **CI básico de PR** (fase 1) va justo después de las fundaciones; la publicación de imágenes (CD) llega en la fase 10.
- Remotos: `gitea:jacknoddy/web-ecommerce.git` (**fuente de verdad**: PR y merge aquí) y `git@github.com:elrincondehiro/web-ecommerce.git` (réplica por **push mirror HTTPS + PAT** de Gitea, con force push: nunca escribir directamente en GitHub). Las ramas se empujan a `origin` (= Gitea).
- Runner de Gitea: la etiqueta `ubuntu-latest` es en realidad `docker://node:24.21.0-trixie` (Debian 13 + Node 24). No asumas herramientas de la imagen Ubuntu de GitHub (p. ej. `docker`, `jq`, navegadores): instálalas en el job o usa `container:`.
- Actions **fijadas por SHA** con el tag en comentario (`uses: actions/checkout@<sha> # v7.0.1`). Nunca por tag flotante.
- Workflows solo para Gitea: condición `if: ${{ github.server_url != 'https://github.com' }}` (p. ej. `renovate.yml`).
- SSH con ssh-agent: el usuario carga la clave con caducidad (~8 h). Si `git push` falla por clave, **no** pidas la passphrase ni la guardes; pide al usuario que ejecute `ssh-add ~/.ssh/id_ed25519`.

- `ci.yml` (PR): `pnpm install --frozen-lockfile` → `lint` → `typecheck` → `test` → `build` → comprobación de presupuesto de JS → Lighthouse CI.
- `images.yml`:
  - push a `main` → imágenes `:sha-<7>` y `:main`.
  - tag `vX.Y.Z` → imágenes `:X.Y.Z`, `:X.Y`, `:latest` (versión desplegable).
- Los workflows deben funcionar **idénticos en Gitea Actions y GitHub Actions**: usa acciones estándar (`actions/checkout`, `docker/*`, `pnpm/action-setup`), evita funcionalidades exclusivas de GitHub, parametriza el registro con `vars.REGISTRY` / `vars.IMAGE_NAMESPACE` y secrets `REGISTRY_USER` / `REGISTRY_TOKEN`.
- Node en CI se lee de `.node-version` (`actions/setup-node` con `node-version-file`).

### 8.3 Releases

- SemVer. `feat` → minor, `fix`/`perf` → patch, `BREAKING CHANGE` → major.
- Tag anotado: `git tag -a v1.2.3 -m "v1.2.3"`. Lo crea el humano.

---

## 9. Calidad

- TypeScript `strict` en todo el monorepo. Prohibido `any` sin comentario justificando.
- ESLint + Prettier (config compartida en `packages/config`), `eslint-plugin-astro`, `eslint-plugin-svelte`.
- Tests:
  - Backend: tests de integración de Medusa (`medusa-test-utils`) para workflows y rutas propias.
  - Storefront: Vitest para `lib/`, Playwright para flujos críticos (incluido **con JS desactivado** para carrito/búsqueda).
- No dejes código muerto, `TODO` sin issue asociado, ni `console.log`.
- No dejes procesos en segundo plano (servidores de desarrollo, `medusa develop/start`) al terminar. Para matarlos usa patrones que no coincidan con tu propia shell (`pgrep -f "[m]edusa"`).

---

## 10. Seguridad

- Secretos solo en `.env` (ignorado) o en secrets del CI/VPS. Mantén `.env.example` actualizado cuando añadas variables.
- Solo variables `PUBLIC_*` llegan al cliente en Astro. Revisa que ninguna clave secreta tenga ese prefijo.
- CORS explícito (`STORE_CORS`, `ADMIN_CORS`, `AUTH_CORS`); nunca `*`.
- Webhooks (Stripe, rebuild) siempre con verificación de firma.
- Rate limiting en Caddy/Cloudflare para login, checkout y búsqueda.
- Dependencias: `pnpm audit` en CI; no añadas paquetes sin mantenimiento.

---

## 11. Cómo debe trabajar un agente

1. **Lee** `README.md`, este fichero y el código relevante antes de cambiar nada.
2. **Consulta la documentación** según la REGLA Nº 1: primero el MCP específico, si no `context7`.
3. **Planifica** en pocas líneas: qué ficheros, qué comandos, qué estrategia de render (§3.1), el impacto en JS de cliente y qué fuentes consultaste.
4. **Espera confirmación** del usuario antes de ejecutar. Si surge una duda a mitad de trabajo, **para** y vuelve a preguntar.
5. **Documento de fase y ESTADO.md**: al iniciar una fase crea `docs/fases/faseN.md` desde [`PLANTILLA.md`](./docs/fases/PLANTILLA.md); al terminarla, rellénalo (qué se hizo, decisiones con su fuente, **comandos para testear**, criterio de salida), actualiza la tabla de estado en README §13, **sincroniza README §4 con las versiones reales de los ficheros** y **actualiza `docs/ESTADO.md`**. Los detalles van ahí, **no** en el README.
6. **Cambios pequeños y verificables.** No refactorices lo que no te han pedido.
7. **Verifica**: levanta infra (`pnpm infra:up`), ejecuta lint/typecheck/test/build, y cuando toque UI, comprueba el JS enviado (`dist/` o DevTools).
8. **Documenta**: actualiza `README.md`/`.env.example`/este fichero si cambias comandos, variables o convenciones.
9. **Informa** al terminar: qué cambió, cómo probarlo, decisiones tomadas y riesgos pendientes.
10. **Ante la duda, no ejecutes: pregunta y espera.** Especialmente antes de: añadir dependencias al cliente, cambiar la estrategia de render, tocar pagos, migraciones destructivas o CI/CD.

Comandos de referencia:

```bash
pnpm infra:up                     # Postgres, Redis, Meilisearch, SeaweedFS, Mailpit
pnpm dev                          # backend :9000 + storefront :4321
pnpm --filter backend exec medusa db:migrate
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```
