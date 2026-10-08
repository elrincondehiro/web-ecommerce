# Estado del proyecto — punto de partida para una sesión nueva

> **Léeme primero** (agentes de IA): resume dónde está el proyecto, cómo se trabaja y qué sigue.
> Después lee `AGENTS.md` (reglas, **obligatorio**) y solo lo que necesites de `README.md` y `docs/fases/`.
> Última actualización: 08-oct-2026 · **I-Interficie cerrada** (PR #28, `db788b8`) → **siguiente: Fase D (diseño)** ([faseD-diseno.md](./fases/faseD-diseno.md), plan por hacer) → 8 Emails.

## 1. Dónde estamos

| Fase                                        | Estado | Doc                                                |
| ------------------------------------------- | ------ | -------------------------------------------------- |
| Prefase (decisiones, SSH, repos, MCPs)      | ✅     | [prefase.md](./fases/prefase.md)                   |
| 0 Fundaciones (monorepo pnpm, infra Docker) | ✅     | [fase0.md](./fases/fase0.md)                       |
| 1 CI básico + Renovate                      | ✅     | [fase1.md](./fases/fase1.md)                       |
| 2 Backend Medusa                            | ✅     | [fase2.md](./fases/fase2.md)                       |
| 3 Storefront base (Astro)                   | ✅     | [fase3.md](./fases/fase3.md)                       |
| 6 Ficheros R2 + imágenes                    | ✅     | [fase6.md](./fases/fase6.md)                       |
| 4 Carrito                                   | ✅     | [fase4.md](./fases/fase4.md)                       |
| 5 Checkout + Stripe                         | ✅     | [fase5.md](./fases/fase5.md)                       |
| 7-1 Búsqueda + filtros                      | ✅     | [fase7.md](./fases/fase7.md)                       |
| 7-2 Sugerencias                             | ✅     | [fase7.md](./fases/fase7.md)                       |
| I-Marca (identidad visual + tema)           | ✅     | [faseI-marca.md](./fases/faseI-marca.md)           |
| I-Interficie (UX/UI)                        | ✅     | [faseI-interficie.md](./fases/faseI-interficie.md) |
| D Diseño (afinar colores, interfaz…)        | ⏳     | [faseD-diseno.md](./fases/faseD-diseno.md)         |

Roadmap completo y tiempos: README §13.

## 2. Qué hay construido

- **Monorepo pnpm 12.9.1**, Node **24.21.0** (fnm). Workspaces: `apps/*`, `packages/*`.
  - `packages/config`: TS base, ESLint 10 flat (incluye CommonJS/jest), Prettier.
  - `apps/backend`: **Medusa 2.21.2**, TS 6.0.3 (funciona; plan B: 5.9.3 solo en backend).
  - `apps/storefront`: Astro 7.3.5 estático, shadcn-svelte (preset `vega`) sin hidratar; solo un bundle JS en el catálogo (`CartClient`, ~1 KB gzip), otro en `/buscar/` (`SearchLive`, ~0,8 KB gzip) y otro en el checkout (`StripePayment`, ~2 KB gzip). Modo `STOREFRONT_DATA=fixtures` para CI. Detalle en [fase3.md](./fases/fase3.md).
    - **Precio/stock**: se escriben en el build y la island invisible `LiveSyncData` devuelve solo datos (`<template>` JSON), que aplica el script estático de `LiveSync` (modo C, compatible con CSP) ([fase6.md](./fases/fase6.md)).
    - **Carrito** (fase 4): cookie `cart_id` httpOnly (`COOKIE_SECURE`). Los formularios hacen POST a `/carrito/?_action=cart.*` y `src/middleware.ts` responde con un 303 a la página de origen + `#carrito-<código>` (sin JS, avisos con `:target`) o con JSON (con JS: toast + contador + flyout en escritorio). Contador en la server island `CartCount`; `/carrito/` on-demand con 0 JS. e2e: `pnpm --filter storefront test:e2e` ([fase4.md](./fases/fase4.md)).
    - **Checkout** (fase 5): `/checkout/` on-demand (datos → envío → pago). Stripe solo autoriza; la captura se hace desde el Admin. Script de pago de ~2 KB gzip; confirmación en `/pedido/<id>/` con la cookie `last_order`. Páginas legales provisionales `noindex` ([fase5.md](./fases/fase5.md)).
    - **Imágenes**: `<Picture>` AVIF/WebP en build desde el bucket. El primer build tarda unos 30 min con 1000 productos × 4 fotos (`avif.effort: 2`); con la caché `node_modules/.astro`, unos 20 s.
- **Infra dev** (`docker/compose.dev.yml`, puertos solo `127.0.0.1`): Postgres 17.11, Redis 8.10.2, Meilisearch v1.54.3 (`MEILI_UPGRADE_DB=true` en dev), SeaweedFS 4.48 (`weed mini`, bucket `medusa` con lectura anónima), Mailpit, Stripe CLI (perfil `stripe`). Credenciales de ejemplo en `docker/.env` (desde `.env.example`).
- **Backend**:
  - Redis para caching, event bus, workflow engine y locking.
  - `MEDUSA_WORKER_MODE` shared/server/worker; `DISABLE_MEDUSA_ADMIN`.
  - Telemetría OFF: `MEDUSA_DISABLE_TELEMETRY=true` + `allowBuilds` de `@medusajs/telemetry` a false.
  - Seed **España**: EUR **IVA incluido**, IVA **21 %** por defecto; **10 %** y **4 %** vía tipo de producto `iva-reducido` / `iva-superreducido`; un solo canal "Tienda online"; envíos 4,95 / 9,95 €; publishable key (sale en el log del seed).
  - `seed:mock`: catálogo de prueba idempotente (24 productos por defecto). En la BD local hay **1000 productos mock con 4 fotos** cada uno.
  - `seed:mock:v2` (fase 7, idempotente): 6 etiquetas repartidas por todos los `mock-*` y 100 productos `mock-v2-*` con las opciones **globales** Talla y Color (con 4 fotos cada uno). No toca variantes, handles ni imágenes de los existentes.
  - **Búsqueda** (fase 7): Search Module con el proveedor Meilisearch (`@rokmohar/medusa-plugin-meilisearch`), índice `product` en `src/search/product.ts` y `POST /store/search` permitido en `src/api/middlewares.ts`. Sin `MEILISEARCH_HOST` (tests, CI) se usa el proveedor PostgreSQL de Medusa.
  - **Ficheros**: `file-s3` contra SeaweedFS (R2 en producción), activo solo si existe `S3_BUCKET`. Fotos por lotes con `images:import <carpeta>` (`handle_XX.jpg`) y fotos mock con `images:mock` (`.cache/mock-images`, 1,5 GB, ignorado por git).
  - Importes de Medusa v2 en **unidad principal** (4.95 = 4,95 €).
- **CI** (`.github/workflows/ci.yml`, mismo fichero en Gitea y GitHub):
  - Job **`quality`**: install `--frozen-lockfile`, lint, format:check, typecheck, test, build (storefront con fixtures) y `check:budget`. Es check obligatorio en ambas plataformas.
  - Actions fijadas por **SHA + tag en comentario**.
- **Renovate autoalojado** (`renovate.yml`, solo en Gitea, bot `renovate-bot`, secret `RENOVATE_TOKEN`):
  - Se ejecuta los lunes a las 04:00 UTC, a mano, y al marcar casillas del Dependency Dashboard.
  - Un PR semanal con todo lo no-major; los majors solo con aprobación; `postgres < 18`; nada de npm con menos de 24 h.

## 3. Cómo se trabaja (resumen de AGENTS.md)

1. **REGLA Nº 1**: antes de cada parte nueva:
   - Consultar la documentación: primero el **MCP específico** (`astro-docs`, `svelte`, `cloudflare-docs`, `meilisearch-docs`, `resend-docs`, `stripe`), luego **context7** (Medusa = `/medusajs/medusa`, Tailwind, shadcn-svelte…), y como último recurso `docs.medusajs.com/llms-full.txt`.
   - Presentar un plan con comandos exactos y **esperar confirmación**.
   - **Ante la duda, no ejecutar.**
2. **pnpm siempre** (nunca npm/npx/yarn); **fnm**, no nvm. Versiones **exactas**.
3. **Git**:
   - Rama `feat|fix|chore|docs/*` → `git push -u origin <rama>` (origin = **Gitea**) → **PR en Gitea** → `quality` verde → **squash merge** (lo hace el usuario).
   - GitHub se actualiza solo por **push mirror** (HTTPS + PAT). Nunca escribir en GitHub.
   - Los agentes no hacen push a `main` ni crean tags.
4. **Commits** Conventional con scope (`feat(storefront): …`). Identidad git local: `jacknoddy <jacknoddy@gmail.com>`.
5. **SSH**: la clave tiene passphrase y el usuario la carga en el agente cada ~8 h. Si un push falla por clave, pedir `ssh-add ~/.ssh/id_ed25519`, nunca la passphrase.
   - En la sesión del agente puede faltar la variable: `export SSH_AUTH_SOCK=$XDG_RUNTIME_DIR/ssh-agent.socket`.
6. **Versiones**: la fuente de verdad son los ficheros (`package.json`/lockfile, `docker/*.yml`, workflows). README §4 es una referencia que se **sincroniza al cerrar cada fase**.
   - Toda dependencia **nueva** requiere aprobación y entrar en README §4.
7. **Documento de fase**: al empezar, crear `docs/fases/faseN.md`; al terminar, rellenarlo, poner ✅ en README §13, sincronizar README §4 y **actualizar este ESTADO.md**.
8. **Antes de entregar**: `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test && pnpm build`.
9. **No dejar procesos en segundo plano** (`medusa develop`, servidores…). Para matarlos, usar `pgrep -f "[m]edusa"`: el patrón con corchetes evita que `pkill -f` mate la propia shell.

## 4. Comandos del día a día

```bash
pnpm infra:up | infra:down | infra:ps | infra:logs | infra:stripe
pnpm dev                     # todas las apps
pnpm dev:storefront          # :4321 (necesita apps/storefront/.env y el backend en marcha)
pnpm dev:backend             # API :9000 · Admin :9000/app (usuario admin ya creado por el usuario)
pnpm backend:seed            # idempotente
pnpm backend:seed:mock       # idempotente; `backend:seed:mock 100` para 100 (pnpm 12: sin `--`)
pnpm backend:seed:mock:v2    # idempotente: etiquetas + 100 productos mock-v2 (Talla/Color)
pnpm backend:seed:mock:ofertas  # idempotente: Collection destacados + Price List sale de prueba (I-Interficie)
pnpm backend:stock:mock      # idempotente: repone stock libre de los mock (los e2e de checkout lo gastan)
pnpm --filter backend images:import <carpeta> [dry-run] [replace]
pnpm --filter backend exec medusa db:migrate
pnpm --filter backend test:integration:http   # necesita apps/backend/.env.test
pnpm --filter storefront test:e2e             # Playwright (infra + backend + build del storefront)
pnpm lint && pnpm format:check && pnpm typecheck && pnpm test && pnpm build
```

Publishable key actual (dev): `docker compose --env-file docker/.env -f docker/compose.dev.yml exec -T postgres psql -U medusa -d medusa -tAc "select token from api_key where type='publishable'"`.

## 5. Infra del usuario (contexto)

- Gitea **28.0.0** en un LXC Debian 13 (Proxmox, homelab), SSH en el puerto 2222 (`gitea:jacknoddy/web-ecommerce.git`). GitHub: `elrincondehiro/web-ecommerce` (réplica).
- **gitea-runner 4.0.1** de **usuario**, binario en el mismo LXC (4 GB RAM + 1 GB swap), `capacity: 2`. La etiqueta `ubuntu-latest` = `docker://node:24.21.0-trixie` (Debian 13 + Node 24; **no** es la imagen Ubuntu de GitHub).
- ⚠️ El build del backend llega a unos 3,7 GB de pico: dos builds a la vez pueden agotar la memoria. El usuario lo deja así de momento.
- Producción futura: VPS **Hetzner** (Debian 13). Monitorización híbrida (README §12); red privada **WireGuard** preferida (se decide en la fase 12).

## 6. Siguiente

- **Fase 4 (carrito): cerrada** (PR #18, `ce526aa`). Detalle, medidas y pendientes en [fase4.md](./fases/fase4.md) §5–8.
- **Fase 5 (checkout + Stripe): cerrada** (PR #20, `72dd7e4`). Resultados en [fase5.md](./fases/fase5.md) §5.1 y pendientes en §7.
  - Stripe solo **autoriza**; la captura se hace desde el Admin. La región España tiene solo `pp_stripe_stripe` (`pnpm --filter backend stripe:region`, idempotente).
  - El checkout es una sola página `/checkout/`. Los pasos de datos y envío funcionan sin JS (PRG + cookie `checkout_flash`). El pago usa un `<script>` con `@stripe/stripe-js/pure` (1,9 KB gzip).
  - Tras pagar: `/checkout/completar/` → `/pedido/<id>/`. El detalle solo se ve con la cookie `last_order`.
  - Para probarlo hacen falta las claves de test en los `.env`, `pnpm infra:stripe` (webhooks) y el backend en marcha.
- **Fase 7-1 (búsqueda + filtros): cerrada** (PR #24, `5868c83`; [fase7.md](./fases/fase7.md), criterio de salida §6 cumplido). Incluye el PR #23 de Renovate (pnpm 12.9.1, eslint 10.12.0, bits-ui 2.19.5…) y README §4 sincronizado.
  - Resumen:
    - **D1 = A**: Meilisearch como proveedor del Search Module (§2.0.1–2.0.2); solo el proveedor del plugin, sin su página de Admin;
    - backend: índice `product` con `in_stock`, job de stock (D8) y tests de integración;
    - storefront: `/buscar/` on-demand, barra de búsqueda en la cabecera, panel "Filtrar" en categorías y `/productos/` (lleva a `/buscar/?categoria=`);
    - **D10**: filtros en modelo **híbrido** (enlaces sin JS; con JS, `SearchLive` ≤ 1 KB y el fragmento `/buscar/parcial/`; §2.3.3). View transitions **desactivadas** en todo el sitio por ahora;
    - **D9**: caché de tarjetas **solo en Astro** (`SEARCH_CARD_CACHE_TTL`, 30 s); `MEDUSA_FF_CACHING` apagado. `Server-Timing` opcional con `SERVER_TIMING=true`;
    - el manifiesto de miniaturas no es público (`dist/server/card-images.json`); un solo panel de filtros (popover en móvil, barra lateral en escritorio);
    - presupuesto: JS inline ≤ 1,2 KB gzip (antes 1 KB; 1,4 KB desde I-Marca); excepción `SearchLive` ≤ 1 KB (AGENTS §3.4);
    - las demos de filtros (`/demo/filtros/*`, `DEMO_FILTERS`) se usaron para decidir D10 y **ya están borradas**.
  - El storefront **no** debe enviar `search_options.typo_tolerance`: Meilisearch lo rechaza.
  - ⚠️ **Riesgo de CPU (D8 = L)**: `in_stock` **no** se reindexa con cada cambio de stock ni de reservas (costaría CPU en cada pedido, en un VPS compartido). El job `search-stock-sync` (cada 5 min, `SEARCH_STOCK_SYNC_CRON`) agrupa los cambios y reindexa solo esos productos. No añadir eventos de inventario al índice ([fase7.md](./fases/fase7.md) §2.1 y §2.1.1).
- **Fase 7-2 (sugerencias): cerrada** (PR #25, `c604a84`; [fase7.md](./fases/fase7.md) §2.7, D11):
  - `SiteClient` (862 B gzip, ≤ 1,5 KB): JS común de **todas** las páginas (vía `BaseLayout`); hoy, el combobox de sugerencias de la cabecera. Sin `import()` dinámico (Vite añade ~750 B de helper);
  - `/buscar/sugerencias/`: fragmento con ≤ 6 títulos, ≤ 2 categorías y "Ver todos"; caché 60 s en navegador/CDN y en Astro (`SEARCH_SUGGEST_CACHE_TTL`); política con Cloudflare en §2.7.2.
- **I-Marca (identidad visual + tema): cerrada** (PR #27, `82c7665`; [faseI-marca.md](./fases/faseI-marca.md)).
- **I-Interficie (UX/UI): cerrada** (PR #28, `db788b8`; [faseI-interficie.md](./fases/faseI-interficie.md)).
  - Barra de anuncios CSS, cabecera con `popover` sin JS que se oculta al bajar (`SiteClient` 1203 B), pie de 4 columnas, home (hero, categorías, carrusel de la Collection `destacados`, ofertas, valores), `/ofertas/`, `/sobre-nosotros/`.
  - Contenido editorial en Content Collections (`apps/storefront/src/content/`); comercial en Medusa (Collections, Price Lists `sale`).
  - **Precio tachado + descuento** en toda la tienda (`Price.astro`, `LiveSync` con precio anterior). Backend: `GET /store/ofertas` y `seed:mock:ofertas`.
  - `/ofertas/`: la island recibe una clave de página (manifiesto `dist/server/offer-pages.json`), no los ids: JS inline fijo (~1,1 KB).
- **Siguiente: Fase D (diseño)**: afinar colores, componentes e interfaz con el usuario ([faseD-diseno.md](./fases/faseD-diseno.md)). **No empezar sin plan + confirmación** (REGLA Nº 1). Después: 8 Emails → 9 Cuenta; la transferencia y Bizum, tras Emails.
- **Aviso de fuentes en Firefox** (de Inter): resuelto en I-Marca. Con Baloo 2 + Nunito Sans, Firefox y Chromium usan la precarga del 400 sin avisos (comprobado con Playwright).
- **Precio/stock**: todo precio o stock nuevo sigue el patrón _build + corrección por server island_ (modo C, AGENTS §3.2).
- **Pendientes de la fase 6**:
  - Persistir la caché `.astro` en CI (fase 10).
  - Limpiar objetos huérfanos del bucket.
  - Script de preparación de fotos reales.
  - Compresión/caché en Caddy y CSS crítico (fases 11/13).
- Skill `shadcn-svelte` disponible en `.pi/skills/` (comandos `pnpm dlx shadcn-svelte@1.7.0`). Al añadir componentes, usar `--no-deps` y revisar `package.json` (el CLI mete `^`).
- Navegación en la fase 13: Speculation Rules inline y view transitions CSS, sin JS ([fase3.md §7.1](./fases/fase3.md)).
- **No borrar** `apps/storefront/node_modules/.astro` (caché de imágenes, ~2 GB) ni `apps/backend/.cache/mock-images`.
- Matar procesos **por PID**. Un `pkill -f` con un patrón que coincida con la propia shell la mata (exit 143).

## 7. Pendientes conocidos

- **Fase 10 — typecheck del backend en CI igual que en local**: en local `tsc` usa los tipos generados en `apps/backend/.medusa/types` (ignorado por git; lo crean `medusa develop` y `medusa build`). En CI `typecheck` va antes que `build` y esos tipos no existen, así que `query.graph` devuelve `any` y fallan los parámetros implícitos. Solución prevista: generar los tipos en CI antes del `typecheck` (p. ej. ejecutar antes el build del backend; `medusa build` los genera con `skipDbConnection`, sin BD), **sin tocar código**. Después, **deshacer el parche del commit `2f12b98`** (tipo explícito `linked` en `apps/backend/src/scripts/stripe-region.ts`) y comprobar que el CI sigue en verde con los tipos generados ([fase5.md](./fases/fase5.md) §8).
- **Fase 10 — Meilisearch en producción**: crear una key propia del backend (no la master) con permisos solo de índices, documentos, ajustes, tareas y búsqueda; `MEILISEARCH_HOST`/`MEILISEARCH_API_KEY` también en el `backend-worker`, que es el que llena el índice. Para cargas masivas, reindexar a mano: los eventos van a ~2,5/s en dev ([fase7.md](./fases/fase7.md) §2.0.2).
- Tests de integración del backend fuera del CI (necesitan Postgres/Redis como `services:`); propuesta para la fase 10.
- PAT del push mirror y token de GitHub para Renovate: **caducan en 1 año** (renovarlos).
- Confirmar con la gestoría la clasificación de productos en IVA reducido/superreducido.
