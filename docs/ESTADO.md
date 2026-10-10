# Estado del proyecto — punto de partida para una sesión nueva

> **Léeme primero** (agentes de IA): resume dónde está el proyecto, cómo se trabaja y qué sigue.
> Después lee `AGENTS.md` (reglas, **obligatorio**) y solo lo que necesites de `README.md` y `docs/fases/`.
> Última actualización: 11-oct-2026 · **Fase 10 cerrada**. Después: mejoras del storefront (`feat/storefront-mejoras`) y, en una sesión nueva, el **importador de catálogo** (CSV + `products:import`), ver §6.6. Luego, fase 11 (producción en Hetzner), §6.5.

## 1. Dónde estamos

| Fase                                        | Estado | Doc                                                        |
| ------------------------------------------- | ------ | ---------------------------------------------------------- |
| Prefase (decisiones, SSH, repos, MCPs)      | ✅     | [prefase.md](./fases/prefase.md)                           |
| 0 Fundaciones (monorepo pnpm, infra Docker) | ✅     | [fase0.md](./fases/fase0.md)                               |
| 1 CI básico + Renovate                      | ✅     | [fase1.md](./fases/fase1.md)                               |
| 2 Backend Medusa                            | ✅     | [fase2.md](./fases/fase2.md)                               |
| 3 Storefront base (Astro)                   | ✅     | [fase3.md](./fases/fase3.md)                               |
| 6 Ficheros R2 + imágenes                    | ✅     | [fase6.md](./fases/fase6.md)                               |
| 4 Carrito                                   | ✅     | [fase4.md](./fases/fase4.md)                               |
| 5 Checkout + Stripe                         | ✅     | [fase5.md](./fases/fase5.md)                               |
| 7-1 Búsqueda + filtros                      | ✅     | [fase7.md](./fases/fase7.md)                               |
| 7-2 Sugerencias                             | ✅     | [fase7.md](./fases/fase7.md)                               |
| I-Marca (identidad visual + tema)           | ✅     | [faseI-marca.md](./fases/faseI-marca.md)                   |
| I-Interficie (UX/UI)                        | ✅     | [faseI-interficie.md](./fases/faseI-interficie.md)         |
| D Diseño (afinar colores, interfaz…)        | ✅     | [faseD-diseno.md](./fases/faseD-diseno.md)                 |
| 8 Emails                                    | ✅     | [fase8.md](./fases/fase8.md)                               |
| 9 Cuenta de cliente                         | ✅     | [fase9.md](./fases/fase9.md)                               |
| Auditoría previa a la fase 10               | ✅     | [auditoria-pre-fase10.md](./fases/auditoria-pre-fase10.md) |
| 10 CD + imágenes Docker                     | ✅     | [fase10.md](./fases/fase10.md)                             |

Roadmap completo y tiempos: README §13.

## 2. Qué hay construido

- **Monorepo pnpm 12.10.1**, Node **24.21.0** (fnm). Workspaces: `apps/*`, `packages/*`.
  - `packages/config`: TS base, ESLint 10 flat (incluye CommonJS/jest), Prettier.
  - `apps/backend`: **Medusa 2.21.2**, TS 6.0.3 (funciona; plan B: 5.9.3 solo en backend).
  - `apps/storefront`: Astro 7.3.8 (`@astrojs/node` 11.1.7) estático, shadcn-svelte (preset `vega`) sin hidratar; solo un bundle JS en el catálogo (`CartClient`, ~1 KB gzip), el común `SiteClient` (~1,4 KB), `ScrollDrag` en carruseles, otro en `/buscar/` (`SearchLive`, ~0,9 KB gzip), `CartLive` en `/carrito/` (~0,6 KB) y otro en el checkout (`StripePayment`, ~2 KB gzip). Modo `STOREFRONT_DATA=fixtures` para CI. Detalle en [fase3.md](./fases/fase3.md).
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
- **CI** (`.github/workflows/ci.yml`, mismo fichero en Gitea y GitHub; fase 10-3):
  - **`quality`**: install `--frozen-lockfile`, lint, format:check, build (storefront con fixtures; genera `.medusa/types`), typecheck, test y `check:budget`.
  - **`integration`**: tests HTTP del backend con Postgres/Redis de `services:` (hosts `*-localhost` y `SWC_NATIVE_BINDING_CACHE`, ver fase10.md §4.6).
  - **`audit`**: `pnpm audit --prod` (nivel y excepciones en `pnpm-workspace.yaml` → `audit`).
  - **`lighthouse`**: `@lhci/cli` móvil sobre fixtures detrás de un proxy brotli; referencia = notas de GitHub (100 en todo salvo SEO de `/carrito/`, `noindex`).
  - Los cuatro son checks obligatorios en Gitea y GitHub.
- **Imágenes** (`images.yml`, solo GitHub → GHCR, públicas): `ghcr.io/elrincondehiro/ecommerce-backend` (`sha-<7>`, `main`; en tag `X.Y.Z`, `X.Y`, `latest`) y `ecommerce-storefront` con sufijo `-fixtures` (no desplegable hasta la fase 11).
- **Producción** (fase 10-1): `docker/compose.prod.yml` + Caddyfile mínimo, probado en local desde cero (`compose.prod.local.yml`, `.env.prod.local`).
- **Limpieza de carritos** (fase 10-4): job `delete-stale-carts` en el worker, borrado **suave** de carritos sin cliente inactivos > `CART_CLEANUP_DAYS` (5 en pruebas, 30 por defecto).
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
CART_CLEANUP_DAYS=5 pnpm --filter backend carts:cleanup   # limpieza de carritos a mano (borrado suave, fase 10-4)
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
- **Fase 9 (cuenta): cerrada** (PR #32, `d27945b`) → ver §6.2. La transferencia y Bizum, después.
- **Auditoría previa a la fase 10: hecha** → ver §6.3.
- **Fase 10 (CD + imágenes Docker): cerrada** (PR #36–#40) → [fase10.md](./fases/fase10.md).
- **Mejoras del storefront** (`feat/storefront-mejoras`, 11-oct-2026; se pueden sumar más antes del merge):
  - `DEV_ALLOWED_HOSTS` (solo dev, se fija en el build): hosts extra en `security.allowedDomains` para entrar desde el móvil por la IP de la LAN. Sin esto, por `http://<IP>` los formularios daban «Cross-site POST form submissions are forbidden» (el navegador no envía `Sec-Fetch-Site` fuera de https/localhost y Astro, sin la IP en la lista, toma la URL como `localhost`). `checkOrigin` sigue activo.
  - Cuenta en móvil: la página desbordaba en horizontal (~420 px) y el panel del carrito se abría fuera de la pantalla. El menú de la cuenta estiraba la columna implícita del grid → `grid-cols-1` + `min-w-0` en `AccountLayout.astro`; e2e a 320 px en `cuenta.spec.ts`.
- **Siguiente: importador de catálogo** (sesión nueva) → §6.6. Después, fase 11 → §6.5.
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

**Estado: ✅** (PR #32). Detalle, flujo de Medusa verificado y pruebas en [fase9.md](./fases/fase9.md).

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
- ~~5 e2e fallaban en `main`~~: era el entorno (reinicio de `medusa develop` y stock), no el código. Resuelto en la auditoría (§6.3): suite completa 97/97.

## 6.3 Auditoría previa a la fase 10

**Estado: ✅** (PR #33, `fde9906`). Detalle y medidas en [auditoria-pre-fase10.md](./fases/auditoria-pre-fase10.md).

- **Lighthouse móvil** (1000 productos, brotli, mediana de 3): todas las páginas con Perf ≥ 99 y A11y 100; LCP ≤ 2 s en los listados. Medir **siempre con compresión** (proxy brotli o Caddy): sin ella, los listados bajan a 91–94.
- **Caché**: el middleware pone `private, no-store` en TODA respuesta de `/carrito/`, `/checkout/`, `/pedido/`, `/cuenta/` y `/_actions/` (también en las redirecciones; Cloudflare cachea los 303 sin cabecera 20 min). Toda ruta por usuario nueva va bajo esos prefijos o se añade a `lib/cache.ts`.
- **Imágenes**: `sizes` con el ancho real (rejilla, carrusel y categorías) y un ancho de 240 px: de −45 % a −48 % de imágenes en los listados. Tarjetas fuera de la rejilla: pasar `imageSizes`.
- **Overrides de seguridad** (`pnpm-workspace.yaml`): `http-cache-semantics` 4.3.0 y `ajv` 8.20.0. Quedan 8 avisos dentro de `@medusajs/*` (Renovate).
- **e2e**: `globalSetup` espera a que el backend responda de forma estable. **No** cambiar de rama ni lanzar `medusa exec` mientras corren (el watcher de `medusa develop` se reinicia). Tres pasadas seguidas: 97/97.

## 6.4 Handover → fase 10 (CD + imágenes Docker)

**Situación al cerrar la sesión (10-oct-2026)**:

- `main` = `3734f39` en local, Gitea y GitHub. No quedan ramas de trabajo abiertas (salvo la de este handover, si no se ha mergeado aún). Ningún proceso en segundo plano; infra Docker de dev en marcha.
- **Verificado en `main` tras el PR #34 de Renovate**:
  - lint, format, typecheck, test (153 + 14 + 34), build (1203 páginas) y `check:budget` en verde;
  - e2e 97/97 dos veces;
  - `db:migrate` solo ejecutó un script de datos interno de Medusa (`create-super-admin-role`), sin cambios de esquema;
  - `pnpm audit --prod`: 8 avisos, todos en `@medusajs/*`. Los dos `overrides` **siguen haciendo falta**: astro 7.3.8 acepta `http-cache-semantics ^4.2.0` y `@rushstack/node-core-library` pide `ajv ~8.13.0`.
- **Playwright 1.64** usa Chromium **1248** (descargado en `~/.cache/ms-playwright`). Para Lighthouse local, `CHROME_PATH` puede apuntar a `chromium-1248` (la 1243 ya no hace falta).

**Qué incluye la fase 10** (README §13 y pendientes de §7; el plan lo presenta el agente y lo aprueba el usuario):

1. **Dockerfiles** multi-stage de `apps/backend` (una imagen para `server` y `worker`, `MEDUSA_WORKER_MODE`; solo `server` migra) y `apps/storefront` (`@astrojs/node` standalone), con `pnpm deploy --filter <app> --prod`, `USER node`, `HEALTHCHECK` y `.dockerignore` (AGENTS §6).
2. **`images.yml`**: push a `main` → `:sha-<7>` + `:main`; tag `vX.Y.Z` → `:X.Y.Z`, `:X.Y`, `:latest`. Debe funcionar igual en Gitea y GitHub (`vars.REGISTRY`, `vars.IMAGE_NAMESPACE`, `REGISTRY_USER`/`REGISTRY_TOKEN`; AGENTS §8.2).
3. **`docker/compose.prod.yml`**: solo Caddy publica 80/443 (la configuración fina de Caddy y Cloudflare es la fase 11).
4. **CI** (§7):
   - generar los tipos de Medusa antes del `typecheck` y deshacer el parche `2f12b98`;
   - tests de integración del backend con `services:`;
   - Lighthouse CI;
   - `pnpm audit --prod --audit-level=high` con excepciones;
   - persistir la caché `.astro`.
5. **Pendientes**:
   - Meilisearch en producción (key propia, también en el worker);
   - job de limpieza de carritos;
   - **`security.allowedDomains`** en `astro.config.mjs` con el dominio real. Desde `@astrojs/node` 11.1.7 se valida `Host` y, sin esto, Astro ignora `X-Forwarded-Host` detrás de Caddy: las URL generadas llevarían el host interno. Comprobado en local que un `Host` falso ya no se cuela.

**Antes de planificar, consultar** (REGLA Nº 1):

- context7: Docker (multi-stage, cache mounts), pnpm (`deploy`, `fetch`), Medusa `/medusajs/medusa` (build, `medusa start`, worker mode, despliegue) y docker/build-push-action;
- astro-docs: node adapter standalone, `allowedDomains`, despliegue con Docker.

Recursos de las runners: el build del backend llega a ~3,7 GB de pico en el LXC de 4 GB (§5); las imágenes deben poder construirse sin dos builds a la vez.

## 6.5 Handover → fase 11 (producción en Hetzner)

- VPS Hetzner CPX22 (x86, 2 vCPU, 4 GB, 80 GB). Imágenes de GHCR **públicas**: el VPS hace `docker pull` sin token (si se vuelven privadas: PAT clásico con `read:packages`).
- Por hacer (README §13 y fase10.md §7):
  - **storefront real**: build contra la API del VPS (secret con la publishable key en CI, o build en el VPS con `STOREFRONT_BUILD_BACKEND_URL`);
  - R2, Cloudflare (Full strict, Origin CA, WAF, regla de caché que respete el origen, rate limiting), firewall;
  - Resend con el dominio real (con `NODE_ENV=production` no vale Mailpit);
  - backups `pg_dump` → R2 con restauración probada;
  - primer tag `v1.0.0` (lo crea el usuario) → comprobar `:X.Y.Z` en GHCR;
  - `CART_CLEANUP_DAYS` a 30 antes de abrir la tienda.
- Primer despliegue con **datos mock**.
- Prueba local de la pila: fase10.md §5.1. El proyecto `web-ecommerce-prodlocal` está parado con sus volúmenes (`$C down -v` para borrarlo).

## 6.6 Handover → importador de catálogo (CSV + scripts)

**Objetivo**: cargar en producción (y en dev) el catálogo real (> 1000 productos con variantes) desde una hoja, sin el Admin uno a uno. Prod pasa a ser la fuente de verdad del catálogo; región, IVA, envíos y Stripe ya son scripts idempotentes (`seed`, `stripe:region`); clientes y pedidos nunca bajan de prod a dev.

**Ya hablado con el usuario (pendiente de sus respuestas antes del plan)**:

- El importador CSV del Admin de Medusa 2.21.2 (una fila por variante) **no conviene**: pide IDs internos (etiquetas, colecciones, tipos, canal, perfil de envío), no carga stock ni nuestros tipos de IVA (`iva-reducido` / `iva-superreducido`) ni las opciones globales Talla/Color (`seed:mock:v2`).
- Propuesta: **plantilla propia con nombres legibles** (una fila por variante; los datos del producto solo en la primera fila de cada `handle`), p. ej. `handle, título, descripción, categoría, etiquetas (a|b), iva, colección, talla, color, sku, precio, precio_oferta, stock, peso_g, estado` + script **`products:import <fichero> [dry-run]`**:
  - valida TODO antes de escribir (informe por fila: categoría inexistente, SKU repetido…);
  - **idempotente** (upsert por `handle` / `sku`): se corrige la hoja y se vuelve a cargar;
  - crea etiquetas y valores de opción que falten; las categorías, mejor creadas a propósito;
  - solo workflows oficiales de Medusa (así Meilisearch se actualiza solo; nada de SQL);
  - aviso de títulos que empiezan en minúscula (la API de Medusa ordena por título distinguiendo mayúsculas: `chaqueta` sale tras «Vestido…»).
- **Fotos**: ya existe `images:import <carpeta>` (`handle_01.jpg`…, `_01` = miniatura; sube por el módulo de ficheros → R2 en prod; idempotente; `dry-run`). Alternativa B: subirlas a R2 a mano y un `images:link` que liste el bucket y asocie (necesita el cliente S3 como dependencia directa → aprobación). Recomendado: A para la carga inicial.

**Preguntas abiertas al usuario** (hacerlas al empezar):

1. ¿CSV UTF-8 (sin dependencias; ojo: Excel en español guarda con `;`) o **.xlsx** con desplegables (dependencia nueva → aprobación)?
2. ¿Qué campos? (subtítulo, material, medidas/peso para envío, EAN, precio de oferta, metadatos: marca, autor, edad…).
3. ¿Precio distinto por variante?
4. ¿Opciones solo Talla y Color u otras?
5. ¿Categorías con jerarquía? ¿Se crean en el Admin o también desde fichero?
6. ¿Fotos por producto (handle), por variante (SKU) o ambas? (por variante: comprobar en la doc qué soporta Medusa 2.21).
7. ¿Fotos en carpeta local (A) o subidas a R2 a mano (B)?

**Antes de planificar, consultar** (REGLA Nº 1): context7 `/medusajs/medusa` (`createProductsWorkflow` / `updateProductsWorkflow` / `batchProductsWorkflow`, inventario y niveles de stock, price lists para el precio de oferta, opciones globales) y el código de `importProductsAsChunksWorkflow` / `normalize-for-import` de `@medusajs/core-flows` 2.21.2 como referencia. Reutilizar lo de `src/scripts/seed-mock*.ts` y `scripts/lib/image-files.ts`.

## 6.7 Posible mejora futura (descartada por ahora): orden y novedades

Plan estudiado el 11-oct-2026 y aparcado por el usuario (no es necesario ahora):

- **Orden de los listados**: preferentes → novedades → resto, alfabético dentro de cada grupo (`Intl.Collator("es", { sensitivity: "base", numeric: true })`, sin dependencias) en categorías, `/productos/`, ofertas y carrusel de la home.
  - ⚠️ Hoy el build y la island de `LiveSync` piden a Medusa el MISMO orden (`order: "title"`) y la misma ventana (offset/limit): por eso coinciden y el precio/stock en vivo funciona (comprobado con `chaqueta`). Si Astro reordena, deja de coincidir → hay que pasar todos los listados al patrón de **manifiesto de páginas** de `/ofertas/` (`lib/offer-pages.ts`: clave corta por página → ids del build en `dist/server`; ~120 KB).
- **Novedad automática**: creado tras `NEW_PRODUCT_SINCE` y hace menos de `NEW_PRODUCT_DAYS` días, **o** con la etiqueta `novedad` de Medusa. Se calcula en el build (un build nocturno lo mantiene al día). `NEW_PRODUCT_SINCE` evita que la carga masiva inicial salga entera como novedad. Medusa solo guarda `created_at` (no la fecha de publicación).
- **Distintivo**: «Novedad» arriba a la izquierda (azul `--primary`, mismo estilo que «Oferta»); en tarjetas estrechas, distintivos apilados y más pequeños con container queries. Ojo: hoy «Agotado» ya ocupa esa esquina.
- **Filtro «Solo novedades»** (como «Solo disponibles»), incluidas las automáticas: en listados, del build; en `/buscar/`, `created_at ≥ corte` `$or` etiqueta `novedad` (el proveedor `@rokmohar/medusa-plugin-meilisearch` 2.3.1 compila `$gte` y `$or`). La etiqueta `novedad` saldría de «Etiquetas».
- **Etiqueta interna `preferente`**: fuera de filtros y del campo `tags` del índice; campo `preferente` (0/1) `sortable` en `src/search/product.ts` → `/buscar/` sin texto: `preferente DESC, title ASC`. Requiere `medusa db:migrate` (reconstruye el índice sin cortes).

## 7. Pendientes conocidos

- **Carritos de «invitado con email»** (con pago de Stripe pendiente) y purgado definitivo de los borrados en suave: ver fase10.md §7.

- **Fase 11 — Cloudflare**: regla de caché que **respete el origen** (no «Cache Everything» por encima de `no-store`); rate limiting de entrar/registro/recuperar/checkout.
- **Fase 11/13**: CSS crítico (~110 ms), LCP variable de la ficha (ancho de 720 px) y logos del pie/cabecera más pequeños ([auditoría](./fases/auditoria-pre-fase10.md) §6).
- PAT del push mirror y token de GitHub para Renovate: **caducan en 1 año** (renovarlos).
- Confirmar con la gestoría la clasificación de productos en IVA reducido/superreducido.
