# Estado del proyecto — punto de partida para una sesión nueva

> **Léeme primero** (agentes de IA): resume dónde está el proyecto, cómo se trabaja y qué sigue.
> Después lee `AGENTS.md` (reglas, **obligatorio**) y solo lo que necesites de `README.md` y `docs/fases/`.
> Última actualización: 09-oct-2026 · **Fase 9 (cuenta de cliente) en curso** en `feat/cuenta`: implementada y probada en local, pendiente de revisión y PR (§6.2).

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
| D Diseño (afinar colores, interfaz…)        | ✅     | [faseD-diseno.md](./fases/faseD-diseno.md)         |
| 8 Emails                                    | ✅     | [fase8.md](./fases/fase8.md)                       |
| 9 Cuenta de cliente                         | 🚧     | [fase9.md](./fases/fase9.md)                       |

Roadmap completo y tiempos: README §13.

## 2. Qué hay construido

- **Monorepo pnpm 12.9.1**, Node **24.21.0** (fnm). Workspaces: `apps/*`, `packages/*`.
  - `packages/config`: TS base, ESLint 10 flat (incluye CommonJS/jest), Prettier.
  - `apps/backend`: **Medusa 2.21.2**, TS 6.0.3 (funciona; plan B: 5.9.3 solo en backend).
  - `apps/storefront`: Astro 7.3.5 estático, shadcn-svelte (preset `vega`) sin hidratar; solo un bundle JS en el catálogo (`CartClient`, ~1 KB gzip), el común `SiteClient` (~1,4 KB), `ScrollDrag` en carruseles, otro en `/buscar/` (`SearchLive`, ~0,9 KB gzip), `CartLive` en `/carrito/` (~0,6 KB) y otro en el checkout (`StripePayment`, ~2 KB gzip). Modo `STOREFRONT_DATA=fixtures` para CI. Detalle en [fase3.md](./fases/fase3.md).
    - **Precio/stock**: se escriben en el build y la island invisible `LiveSyncData` devuelve solo datos (`<template>` JSON), que aplica el script estático de `LiveSync` (modo C, compatible con CSP) ([fase6.md](./fases/fase6.md)).
    - **Carrito** (fase 4): cookie `cart_id` httpOnly (`COOKIE_SECURE`). Los formularios hacen POST a `/carrito/?_action=cart.*` y `src/middleware.ts` responde con un 303 a la página de origen + `#carrito-<código>` (sin JS, avisos con `:target`) o con JSON (con JS: toast + contador + flyout en escritorio). Contador en la server island `CartCount`; `/carrito/` on-demand (con JS, `CartLive` aplica los cambios sin recargar; Fase D). e2e: `pnpm --filter storefront test:e2e` ([fase4.md](./fases/fase4.md)).
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
pnpm dev:emails              # previsualización de emails :3001 (Mailpit en :8025)
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
- **Fase D (diseño): cerrada** (PR #30, `20ca7ff`; [faseD-diseno.md](./fases/faseD-diseno.md), tabla final en §3).
  - Tokens: borde oscuro `#8FA3AD` y `--shadow-color`; hover de botones (`btn-hover-*`) y de la cabecera (`.header-hover`).
  - Carruseles 4,3 / 2,3 con flechas `::scroll-button` y arrastre con ratón (`ScrollDrag`, 361 B; todo carrusel nuevo lleva `data-drag-scroll` + `<ScrollDrag />`, AGENTS §3.4). Galería: una foto por vista.
  - Panel del carrito = `popover` lateral (✕, Escape o clic fuera; el clic fuera no activa lo de debajo), en tres partes con pie fijo (total + «Ver carrito») y «Quitar» por línea.
  - Cantidad − / + (`QuantityField.astro`, `<html data-js>` antes de pintar); `/carrito/` se actualiza sin recargar (`CartLive`, 625 B, parcial `/carrito/parcial/`); ofertas tachadas en el carrito (`compare_at_unit_price`).
  - `/buscar/` sin parpadeo del panel de filtros; «Ver resultados».
  - Pendientes: `/productos/` 91–94 en Lighthouse local; Safari sin probar; textos, foto del hero, logo en negativo, botón de pausa.
  - Aviso conocido en el build (local y CI, no rompe nada): «Found 6 warnings while optimizing generated CSS … 'scroll-button' is not recognized». Es Lightning CSS (1.32.0, vía `@tailwindcss/node` 4.3.3), que aún no conoce `::scroll-button()`; las reglas salen intactas en `dist/`. **No hacer nada**: desaparecerá al actualizar Lightning CSS (Renovate).
- **Fase 8 (emails): cerrada** (PR #31, `19e4cfd`) → ver §6.1.
- **Fase 9 (cuenta): en curso** → ver §6.2. La transferencia y Bizum, después.
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

## 6.1 Fase 8 — Emails

**Estado: ✅** (`feat/emails`, PR a `main`). Todo el detalle (decisiones, fuentes, cómo probar) en [fase8.md](./fases/fase8.md).

- `packages/emails` (React Email **6**: `react-email` + `@react-email/ui`; `@react-email/components` está obsoleto): `order-placed`, `order-shipped`, `password-reset`, `verify-email`. Se compila a `dist/` en `pnpm install`.
- Backend: proveedor `resend-notification` (`EMAIL_TRANSPORT=smtp` → Mailpit en dev, `resend` → Resend) y 4 subscribers con `idempotency_key`. Sin `EMAIL_TRANSPORT` no se envía nada (CI, tests).
- Remitente `El Rincón de Hiro <pedidos@develop.hirobordercollie.es>`, sin reply-to (aviso en el pie). Pie legal provisional.
- `EMAIL_ASSETS_URL` = **base** pública de los recursos de los emails (logo en `<base>/email/logo.png`); vacía = `STOREFRONT_URL`.
- Probada con Resend: las 4 plantillas llegan a `delivered@resend.dev` y a un Gmail real (fase8.md §5.4).
- Las páginas `/cuenta/restablecer/` y `/cuenta/verificar/` y el enlace del email de pedido a la cuenta se hicieron en la fase 9 (§6.2).
- Pendiente: pie legal con los datos de la gestoría (`packages/emails/src/_components/Layout.tsx`); variables de email también en el worker (fases 10/11).

## 6.2 Fase 9 — Cuenta de cliente

**Estado: 🚧** (`feat/cuenta`). Detalle, flujo de Medusa verificado y pruebas en [fase9.md](./fases/fase9.md).

- **Verificación de email obligatoria** (`authVerificationsPerActor.customer`) y sesión de **7 días** (`jwtExpiresIn`, también el Admin).
- Registro solo con email + contraseña. El cliente de Medusa se crea en el **primer login tras verificar** (por eso no se pide el nombre al registrarse).
- JWT en la cookie httpOnly `customer_token`. El middleware pone `locals.customerToken` (sin red). El SDK compartido usa `nostore` y las llamadas de cuenta pasan el Bearer en cada petición: **nunca** guardar el token en la instancia del SDK.
- Páginas `/cuenta/*` on-demand, sin JS, actions `account.*` con PRG (cookie `account_flash`).
- Verificar con **botón** (POST); `Referrer-Policy: same-origin` (con `no-referrer` el POST lleva `Origin: null` → 403 de `checkOrigin`).
- Cambiar contraseña = email de restablecer (opción a). `GET /store/orders/:id` no comprueba el dueño: comparar `customer_id`.
- Backend: `POST /store/customers/me/deletion-request` (workflow + evento `customer.deletion_requested` → email a `SHOP_NOTIFY_EMAIL`), bienvenida en `customer.created` con `has_account`.
- Checkout con sesión: dirección predeterminada, elegir guardada, «Guardar en mi cuenta», `transferCart`.
- **Carrito entre dispositivos** (opción a): al entrar gana el carrito del navegador; si no hay, se carga el último de la cuenta (`GET /store/customers/me/carts`, ruta propia). Con sesión, el carrito nace asociado al cliente. Las páginas de cuenta cargan `CartClient` (el icono abre el panel).
- **Más adelante** (detalle en fase9.md §7):
  - **Fase 10/11**: job propio que **limpie carritos** sin completar (Medusa no lo hace; 764 en la BD local).
  - **Fase de marketing** (tras producción): **programa de puntos** (0,8 % → Store Credit del `@medusajs/loyalty-plugin`) y **carrito abandonado** (tutorial oficial; comunicación comercial: consentimiento/baja).
  - **Más datos del cliente** cuando el usuario pase la lista (campos de Medusa, `metadata` o módulo propio + `defineLink`).
  - Formas de pago guardadas: descartadas por ahora. Lista de deseos: idea.
- 5 e2e (`buscar` 103/112, `carrito` 169, `interficie` 50/128) **ya fallaban en `main`** con la BD local: revisar aparte.

## 7. Pendientes conocidos

- **Fase 10 — typecheck del backend en CI igual que en local**: en local `tsc` usa los tipos generados en `apps/backend/.medusa/types` (ignorado por git; lo crean `medusa develop` y `medusa build`). En CI `typecheck` va antes que `build` y esos tipos no existen, así que `query.graph` devuelve `any` y fallan los parámetros implícitos. Solución prevista: generar los tipos en CI antes del `typecheck` (p. ej. ejecutar antes el build del backend; `medusa build` los genera con `skipDbConnection`, sin BD), **sin tocar código**. Después, **deshacer el parche del commit `2f12b98`** (tipo explícito `linked` en `apps/backend/src/scripts/stripe-region.ts`) y comprobar que el CI sigue en verde con los tipos generados ([fase5.md](./fases/fase5.md) §8).
- **Fase 10 — Meilisearch en producción**: crear una key propia del backend (no la master) con permisos solo de índices, documentos, ajustes, tareas y búsqueda; `MEILISEARCH_HOST`/`MEILISEARCH_API_KEY` también en el `backend-worker`, que es el que llena el índice. Para cargas masivas, reindexar a mano: los eventos van a ~2,5/s en dev ([fase7.md](./fases/fase7.md) §2.0.2).
- **Fase 10/11 — limpieza de carritos**: scheduled job que borre carritos de invitado sin completar con más de N días (Medusa no lo hace) ([fase9.md](./fases/fase9.md) §7).
- Tests de integración del backend fuera del CI (necesitan Postgres/Redis como `services:`); propuesta para la fase 10.
- PAT del push mirror y token de GitHub para Renovate: **caducan en 1 año** (renovarlos).
- Confirmar con la gestoría la clasificación de productos en IVA reducido/superreducido.
