# Estado del proyecto — punto de partida para una sesión nueva

> **Léeme primero** (agentes de IA): resume dónde está el proyecto, cómo se trabaja y qué sigue.
> Después lee `AGENTS.md` (reglas, **obligatorio**) y solo lo que necesites de `README.md` y `docs/fases/`.
> Última actualización: 24-oct-2026 · **Fase R (rendimiento) hecha** ([faseR-rendimiento.md](./fases/faseR-rendimiento.md)): fotos de la galería, 720 px, logos 1×/2×, precarga del 700 (R-1); caché de Medusa en Redis (`MEDUSA_FF_CACHING`, experimental) + caché de 15 s de `LiveSyncData` + una island por ficha (R-2: capacidad sin CDN ~25 → ~100 páginas/s; con Cloudflare caliente apenas cambia, sirve tras cada purga y para carrito/checkout); Speculation Rules y CSS dentro del HTML (R-3). Antes: auditoría de rendimiento, Fase F (#68), Fase O (#67). **Siguiente**: más peticiones de la fase de problemas de frontend y backend. Antes: **Fase V/W (migración desde Loyverse) cerrada** (herramientas; la revisión por categorías sigue a mano). Antes: Fase G (#65), fase 11 (tag `v0.1.0`). Pendientes en [PENDIENTES.md](./PENDIENTES.md). Después: mejoras visuales y de contenido y optimizaciones (fase 13) → empezar por **§6.0 Handover**.

## 1. Dónde estamos

| Fase                                        | Estado | Doc                                                                  |
| ------------------------------------------- | ------ | -------------------------------------------------------------------- |
| Prefase (decisiones, SSH, repos, MCPs)      | ✅     | [prefase.md](./fases/prefase.md)                                     |
| 0 Fundaciones (monorepo pnpm, infra Docker) | ✅     | [fase0.md](./fases/fase0.md)                                         |
| 1 CI básico + Renovate                      | ✅     | [fase1.md](./fases/fase1.md)                                         |
| 2 Backend Medusa                            | ✅     | [fase2.md](./fases/fase2.md)                                         |
| 3 Storefront base (Astro)                   | ✅     | [fase3.md](./fases/fase3.md)                                         |
| 6 Ficheros R2 + imágenes                    | ✅     | [fase6.md](./fases/fase6.md)                                         |
| 4 Carrito                                   | ✅     | [fase4.md](./fases/fase4.md)                                         |
| 5 Checkout + Stripe                         | ✅     | [fase5.md](./fases/fase5.md)                                         |
| 7-1 Búsqueda + filtros                      | ✅     | [fase7.md](./fases/fase7.md)                                         |
| 7-2 Sugerencias                             | ✅     | [fase7.md](./fases/fase7.md)                                         |
| I-Marca (identidad visual + tema)           | ✅     | [faseI-marca.md](./fases/faseI-marca.md)                             |
| I-Interficie (UX/UI)                        | ✅     | [faseI-interficie.md](./fases/faseI-interficie.md)                   |
| D Diseño (afinar colores, interfaz…)        | ✅     | [faseD-diseno.md](./fases/faseD-diseno.md)                           |
| 8 Emails                                    | ✅     | [fase8.md](./fases/fase8.md)                                         |
| 9 Cuenta de cliente                         | ✅     | [fase9.md](./fases/fase9.md)                                         |
| Auditoría previa a la fase 10               | ✅     | [auditoria-pre-fase10.md](./fases/auditoria-pre-fase10.md)           |
| 10 CD + imágenes Docker                     | ✅     | [fase10.md](./fases/fase10.md)                                       |
| C Importador de catálogo (CSV)              | ✅     | [faseC-catalogo.md](./fases/faseC-catalogo.md)                       |
| S Catálogo en el storefront                 | ✅     | [faseS-catalogo-storefront.md](./fases/faseS-catalogo-storefront.md) |
| E URL, descatalogados y especiales          | ✅     | [faseE-urls-correas.md](./fases/faseE-urls-correas.md)               |
| L Lista de deseos y puntos                  | ✅     | [faseL-deseos-puntos.md](./fases/faseL-deseos-puntos.md)             |
| P Códigos descuento                         | ✅     | [faseP-codigos.md](./fases/faseP-codigos.md)                         |
| R Relacionados y venta cruzada              | ✅     | [faseR-relacionados.md](./fases/faseR-relacionados.md)               |
| 11 Despliegue de prueba (Hetzner)           | ✅     | [fase11.md](./fases/fase11.md)                                       |
| G Pedidos de invitado → cuenta              | ✅     | [faseG-invitados.md](./fases/faseG-invitados.md)                     |
| V/W Migración desde Loyverse                | ✅     | [faseV-loyverse.md](./fases/faseV-loyverse.md)                       |
| O Opciones, variantes y plantillas          | ✅     | [faseO-variantes.md](./fases/faseO-variantes.md)                     |
| F Mejoras en filtros                        | ✅     | [faseF-filtros.md](./fases/faseF-filtros.md)                         |
| Auditoría de rendimiento (1000 productos)   | ✅     | [auditoria-rendimiento.md](./fases/auditoria-rendimiento.md)         |
| R Rendimiento (imágenes, cachés, CSS)       | ✅     | [faseR-rendimiento.md](./fases/faseR-rendimiento.md)                 |

Roadmap completo y tiempos: README §13.

## 2. Qué hay construido

- **Monorepo pnpm 12.14.0**, Node **24.22.0** (fnm). Workspaces: `apps/*`, `packages/*`.
  - `packages/config`: TS base, ESLint 10 flat (incluye CommonJS/jest), Prettier.
  - `apps/backend`: **Medusa 2.21.2**, TS 6.0.3 (funciona; plan B: 5.9.3 solo en backend).
  - `apps/storefront`: Astro 7.4.1 (`@astrojs/node` 11.1.9) estático, shadcn-svelte (preset `vega`) sin hidratar; solo un bundle JS en el catálogo (`CartClient`, ~1 KB gzip), el común `SiteClient` (~1,4 KB), `ScrollDrag` en carruseles, otro en `/buscar/` (`SearchLive`, ~0,9 KB gzip), `CartLive` en `/carrito/` (~0,6 KB) y otro en el checkout (`StripePayment`, ~2 KB gzip). Modo `STOREFRONT_DATA=fixtures` para CI. Detalle en [fase3.md](./fases/fase3.md).
    - **Precio/stock**: se escriben en el build y la island invisible `LiveSyncData` devuelve solo datos (`<template>` JSON), que aplica el script estático de `LiveSync` (modo C, compatible con CSP) ([fase6.md](./fases/fase6.md)).
    - **Carrito** (fase 4): cookie `cart_id` httpOnly (`COOKIE_SECURE`). Los formularios hacen POST a `/carrito/?_action=cart.*` y `src/middleware.ts` responde con un 303 a la página de origen + `#carrito-<código>` (sin JS, avisos con `:target`) o con JSON (con JS: toast + contador + flyout en escritorio). Contador en la server island `CartCount`; `/carrito/` on-demand (con JS, `CartLive` aplica los cambios sin recargar; Fase D). e2e: `pnpm --filter storefront test:e2e` ([fase4.md](./fases/fase4.md)).
    - **Checkout** (fase 5): `/checkout/` on-demand (datos → envío → pago). Stripe solo autoriza; la captura se hace desde el Admin. Script de pago de ~2 KB gzip; confirmación en `/pedido/<id>/` con la cookie `last_order`. Páginas legales provisionales `noindex` ([fase5.md](./fases/fase5.md)).
    - **Imágenes**: `<Picture>` AVIF/WebP en build desde el bucket. El primer build tarda unos 11 min con 300 productos × 4 fotos (`avif.effort: 2`; 30 min con 1000); con la caché `node_modules/.astro`, unos 20 s.
- **Infra dev** (`docker/compose.dev.yml`, puertos solo `127.0.0.1`): Postgres 17.11, Redis 8.10.2, Meilisearch v1.54.3 (`MEILI_UPGRADE_DB=true` en dev), SeaweedFS 4.48 (`weed mini`, bucket `medusa` con lectura anónima), Mailpit, Stripe CLI (perfil `stripe`). Credenciales de ejemplo en `docker/.env` (desde `.env.example`).
- **Backend**:
  - Redis para caching, event bus, workflow engine y locking.
  - `MEDUSA_WORKER_MODE` shared/server/worker; `DISABLE_MEDUSA_ADMIN`.
  - Telemetría OFF: `MEDUSA_DISABLE_TELEMETRY=true` + `allowBuilds` de `@medusajs/telemetry` a false.
  - Seed **España**: EUR **IVA incluido**, IVA **21 %** por defecto; **10 %** y **4 %** vía tipo de producto `iva-reducido` / `iva-superreducido`; un solo canal "Tienda online"; envíos 4,95 / 9,95 €; publishable key (sale en el log del seed).
  - **Catálogo mock** (Fase S; **1000 productos** desde la auditoría de rendimiento): `catalog:mock [N=300]` genera `catalog/mock/productos.csv` sobre el árbol real (`catalog/mock/categorias.csv`, 37 categorías) y se carga con `catalog:import catalog/mock`. En la BD local: **300 productos** (728 variantes, 4 fotos de picsum cada uno), 25 en oferta, 11 en `destacados`, 8 a granel publicados (S-3; p. ej. `mock-premios-plus-010`). `stock:mock` repone también el granel (en tramos de 250 g). Los `seed:mock*` antiguos están archivados (`src/scripts/OBSOLETOS.md`).
  - **Búsqueda** (fase 7): Search Module con el proveedor Meilisearch (`@rokmohar/medusa-plugin-meilisearch`), índice `product` en `src/search/product.ts` y `POST /store/search` permitido en `src/api/middlewares.ts`. Sin `MEILISEARCH_HOST` (tests, CI) se usa el proveedor PostgreSQL de Medusa.
  - **Ficheros**: `file-s3` contra SeaweedFS (R2 en producción), activo solo si existe `S3_BUCKET`. Fotos por lotes con `images:import <carpeta>` (`handle_XX.jpg`) y fotos mock con `images:mock` (`.cache/mock-images`, 1,5 GB, ignorado por git).
  - Importes de Medusa v2 en **unidad principal** (4.95 = 4,95 €).
- **CI** (`.github/workflows/ci.yml`, mismo fichero en Gitea y GitHub; fase 10-3):
  - **`quality`**: install `--frozen-lockfile`, lint, format:check, build (storefront con fixtures; genera `.medusa/types`), typecheck, test y `check:budget`.
  - **`integration`**: tests HTTP del backend con Postgres/Redis de `services:` (hosts `*-localhost` y `SWC_NATIVE_BINDING_CACHE`, ver fase10.md §4.6).
  - **`audit`**: `pnpm audit --prod` (nivel y excepciones en `pnpm-workspace.yaml` → `audit`).
  - **`lighthouse`**: `@lhci/cli` móvil sobre fixtures detrás de un proxy brotli; referencia = notas de GitHub (100 en todo salvo SEO de `/carrito/`, `noindex`).
  - Los cuatro son checks obligatorios en Gitea y GitHub. El reparto Gitea/GitHub de la Fase E (#48) se **revirtió**: en Gitea 28 dejaba `main` en naranja (faseE §E-0).
- **Imágenes** (`images.yml`, solo GitHub → GHCR, públicas): `ghcr.io/elrincondehiro/ecommerce-backend` (`sha-<7>`, `main`; en tag `X.Y.Z`, `X.Y`, `latest`) y `ecommerce-storefront` con sufijo `-fixtures` (no desplegable). La imagen real del storefront la construye el usuario en el portátil contra la API del VPS (fase11 §4.7).
- **Despliegue de prueba** (fase 11): `docker/compose.prod.yml` + Caddyfile de producción en el VPS Hetzner, detrás de Cloudflare; backups (`docker/backup/`), monitorización (`docker/monitoring/`) y prueba de carga (`loadtest/`). Detalle en §6.0 y [fase11.md](./fases/fase11.md).
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
pnpm --filter backend catalog:mock [300]          # genera catalog/mock/productos.csv (determinista)
pnpm --filter backend catalog:import catalog/mock  # idempotente; antes: catalog:import catalog/mi-carga (categorías)
pnpm --filter backend images:mock && pnpm --filter backend images:import .cache/mock-images
pnpm backend:stock:mock      # idempotente: repone stock libre de los mock (los e2e de checkout lo gastan)
CART_CLEANUP_DAYS=5 pnpm --filter backend carts:cleanup   # limpieza de carritos a mano (borrado suave, fase 10-4)
pnpm --filter backend points:accrue                        # abono de puntos a mano (el job lo hace a las 4:00, Fase L)
pnpm --filter backend points:adjust <email|cus_…> <credit|debit> <importe> <motivo>   # ajuste manual
pnpm --filter backend points:close-account <cus_…>         # baja de la cuenta: el saldo se pierde (G6)
pnpm --filter backend orders:link-guests [dry-run]         # pedidos de invitado con el email de una cuenta → a la cuenta (Fase G)
pnpm --filter backend orders:assign <nº> <email|cus_…> <motivo> [dry-run]   # asignación manual de un pedido de invitado (G-3)
# relacionados (Fase R): columna `relacionados` de productos.csv (handles separados por |)
pnpm --filter backend codes:create <CODIGO> <pct|eur> <valor> [usos_total] [por_cliente]   # código de prueba (Fase P; lo normal: Admin → Promociones)
pnpm --filter backend catalog:import <carpeta> [dry-run]   # categorias.csv + productos.csv (plantilla en apps/backend/catalog/plantilla)
pnpm --filter backend images:import <carpeta> [dry-run] [replace]
pnpm --filter backend exec medusa db:migrate
pnpm --filter backend test:integration:http   # necesita apps/backend/.env.test
pnpm --filter storefront test:e2e             # Playwright (infra + backend + build del storefront)
pnpm lint && pnpm format:check && pnpm typecheck && pnpm test && pnpm build
```

Publishable key actual (dev): `docker compose --env-file docker/.env -f docker/compose.dev.yml exec -T postgres psql -U medusa -d medusa -tAc "select token from api_key where type='publishable'"`.

## 5. Infra del usuario (contexto)

- Gitea **28.1.0** (actualizado el 15-oct-2026: ya salta bien los jobs con `needs:` sobre uno saltado; reparto del CI reaplicado en #56) en un LXC Debian 13 (Proxmox, homelab), SSH en el puerto 2222 (`gitea:jacknoddy/web-ecommerce.git`). GitHub: `elrincondehiro/web-ecommerce` (réplica).
- **gitea-runner 4.0.1** de **usuario**, binario en el mismo LXC (4 GB RAM + 1 GB swap), `capacity: 2`. La etiqueta `ubuntu-latest` = `docker://node:24.21.0-trixie` (Debian 13 + Node 24; **no** es la imagen Ubuntu de GitHub).
- ⚠️ El build del backend llega a unos 3,7 GB de pico: dos builds a la vez pueden agotar la memoria. El usuario lo deja así de momento.
- VPS **Hetzner** CPX22 (Debian 13) con el despliegue de prueba (fase 11). Monitorización híbrida en la VM `monitor-kbd` del homelab (Proxmox), unida al VPS por **WireGuard** (README §12, fase11 §4.9).

## 6. Siguiente

## 6.0 Handover → sesión nueva tras la fase 11 — LEER PRIMERO

**Fase 11 (despliegue de PRUEBA en Hetzner): ✅ cerrada** (21-oct-2026). Todo el detalle en [fase11.md](./fases/fase11.md); aquí solo lo necesario para seguir.

- **PRs**: #59 (11-0 a 11-2), #60 (Caddy + CSP), #61 (R2, Resend, datos, storefront real) y #63 (backups, monitorización, e2e/Lighthouse remotos, k6 y cierre). **Tag `v0.1.0`** creado. Después, Renovate #62 (Node 24.22, pnpm 12.14, Astro 7.4.1, Meilisearch 1.55…): `main` = `d3dedce`.
- **Qué hay desplegado** (`https://hirobordercollie.es`, `api.`, `admin.`, `imagenes.`): VPS Hetzner CPX22 Debian 13, Docker 29.9.1, `docker/compose.prod.yml` con imágenes `sha-4ad9972` (storefront construido en el portátil, fase11 §4.7). Stripe **test**, 306 productos mock, emails reales por Resend desde `develop.`, fotos en R2. Tienda y Admin detrás de Cloudflare Access; `X-Robots-Tag: noindex`.
- **Acceso**: SSH **solo por WireGuard** (`wg-vps` en el portátil → `deploy@10.77.0.1`); en el VPS, siempre `./dc` (compose con `env -i`; nunca exportar variables de `.env.prod`). Monitorización en la VM `monitor-kbd` del homelab (`./dcm`): Kuma, Beszel, Dozzle; agentes del VPS solo en la IP del túnel.
- **Cloudflare**: Full (strict) + Origin CA, **AOP de zona con CA propia** (mTLS: el origen solo acepta Cloudflare), WAF en `api.` (solo `POST /hooks/payment/*`), caché manda el origen (HTML `s-maxage=86400`, purgar en cada despliegue), rate limiting. Las reglas **temporales** de las pruebas (Bypass por IP y Skip del rate limiting) se quitan al cerrar: para repetir e2e/Lighthouse/k6 hay que volver a crearlas mientras duren.
- **Backups**: diario 03:30 cifrado con age → R2 `hiro-backups`, heartbeat a Kuma; restauración probada (`docker/backup/restore-test.sh`, en el portátil).
- **Medidas**: Lighthouse móvil 99–100 en Rend./A11y/BP (SEO 61 esperado por `noindex`); LCP de fichas ~1,8–2 s (foto principal). Carga (k6, fase11 §5.7): **50 páginas/s durante 10 min vía Cloudflare con 0 errores** y el VPS al 60 % de CPU; **sin Cloudflare el VPS aguanta ~20 páginas/s** (Medusa satura la CPU con las server islands).

**Comandos de pruebas contra el despliegue** (con las reglas temporales de Cloudflare activas):

```bash
E2E_BASE_URL=https://hirobordercollie.es pnpm --filter storefront test:e2e
CHROME_PATH=$(cd apps/storefront && node -p 'require("@playwright/test").chromium.executablePath()') pnpm --filter storefront lhci:remote
# k6 desde la VM: loadtest/README.md
```

**Pendientes antes de abrir de verdad** (fase11 §7): `CART_CLEANUP_DAYS` a 30, quitar Access de la tienda y `ROBOTS=index`, dominio/emails/tokens definitivos, borrar `ssh.` e IP nueva, decidir el robots.txt gestionado de Cloudflare, purga automática en el despliegue, bucket lock de backups. Caducidades: tokens R2/Resend/service token oct-2027, AOP cliente 17-oct-2031.

**Fase R — rendimiento: ✅ cerrada** (#69) ([faseR-rendimiento.md](./fases/faseR-rendimiento.md), con la [auditoría](./fases/auditoria-rendimiento.md)). Lighthouse móvil 99–100 en todo (fichas 95 → 99), escritorio 100.

- **Variables nuevas** (ya en `.env.example`, `docker/compose.prod.yml` y `docker/.env.prod.example`): backend `MEDUSA_FF_CACHING=true` + `MEDUSA_CACHE_TTL=60`; storefront `LIVE_SYNC_CACHE_TTL=15` (runtime). Copiarlas al `.env` local si no están (el backend arranca sin ellas, pero sin la caché).
- **Caché de Medusa en Redis** (experimental): los scripts de catálogo/stock la vacían al terminar (`clearMedusaCache`); un SQL a mano no (vaciarla: faseR-rendimiento.md §7).
- **CSS dentro del HTML** (`build.inlineStylesheets: "always"`) y **Speculation Rules** (`src/lib/speculation.ts`): cada KB de CSS se paga en cada página.
- **Overrides de seguridad** nuevos (body-parser, multer, zod, undici; README §4): quitarlos cuando Renovate suba Medusa/Astro y `pnpm audit --prod` no los muestre.
- **En el VPS, al desplegar**: añadir las variables a `.env.prod` (o dejar los valores por defecto del compose), repetir la tanda B de k6 (fase11 §5.7) y comprobar la invalidación de la caché (faseR §3).
- **Datos locales**: 1068 productos (1000 mock); `e2e/correas.spec.ts` (7 m) falla en local porque `stock:mock` no repone las piezas de la correa (PENDIENTES §4).

**Fase F — mejoras en filtros: ✅ cerrada** ([faseF-filtros.md](./fases/faseF-filtros.md)): rango de precio real en `/buscar/` (`min_price_eur` + `max_price_eur`), sin materia seca ni «Formato: Única» fuera de contexto, subcategorías sangradas, «Solo disponibles» como interruptor lo primero del panel y sin saltos de la rejilla (fila de chips reservada; fila de categorías en todos los listados, con las hermanas en las hojas; las dos en una línea con scroll y `ScrollDrag`). `SearchLive` 982 B (límite 1 KB). ⚠️ En la BD local la cuerda azul de nailon está casi toda reservada por pedidos de e2e (falla `correas.spec.ts`). E2e en otro puerto: `E2E_BASE_URL=http://localhost:<puerto>` (no `127.0.0.1`: Stripe vuelve a `SITE_URL`).

**Fase O — opciones, variantes y plantillas de ficha: ✅ cerrada** (#67) ([faseO-variantes.md](./fases/faseO-variantes.md)):

- Productos con 2 opciones (p. ej. estampado × talla): **un solo producto** con selector de muestras en la ficha, **sin JS**. La action busca la variante por las opciones; CSS por posición (`styles/variant-picker.css`, generado y comprobado por el test; 0,7 KB gzip).
- Fotos por valor: `opcion_fotos` en la hoja + `handle--valor_XX.jpg` en `images:import`.
- Guías de tallas por modelo (`guia_tallas`, `src/content/guias/`; se cambian desde la metadata del producto en el Admin) y plantillas por categoría (`src/content/plantillas/`), en un `popover`. Fotos en el Markdown junto al `.md` (`![alt](./foto.jpg)`), optimizadas por Astro.
- Filtros: opción con un solo producto, `metadata.filtrable = false` en el Admin y grupos plegados.
- Productos de prueba en `apps/backend/catalog/prueba-arnes/` (cargados en la BD local; e2e `variantes.spec.ts`).

**Fase V/W — migración desde Loyverse: ✅ herramientas cerradas** ([faseV-loyverse.md](./fases/faseV-loyverse.md), uso en [`migracion/loyverse/README.md`](../migracion/loyverse/README.md)). Scripts en `migracion/loyverse/` (TypeScript con Node 24, sin dependencias):

- `descargar` (catálogo y tickets, solo lectura, sin datos personales);
- `analizar` (hoja de revisión por variante con sugerencia);
- `informe` (HTML de ventas);
- `seleccion`;
- `convertir` (hojas de `catalog:import`, stock 0, publicado, mapas de opciones y categorías y `handles.csv` editables).

Datos en `migracion/loyverse/datos/`, **fuera de git y de las imágenes**. El usuario revisa por categorías y carga de forma incremental; ya hay 60 productos reales (329 variantes) en la BD local, junto a los mock. ⚠️ El token de Loyverse (acceso total) está en `migracion/loyverse/.env`: revocarlo al acabar.

**Fase G — pedidos de invitado → cuenta: ✅ cerrada** ([faseG-invitados.md](./fases/faseG-invitados.md)). Medusa guarda la compra sin cuenta en un cliente aparte (`has_account=false`) que no se puede convertir; los pedidos se pasan con la **transferencia oficial** (historial en el Admin, reversible con «transferir a invitado»):

- **Mismo email (G-1, automático)**: al crear la cuenta y al comprar sin entrar (con ficha de invitado previa Medusa siempre elige la ficha de invitado: spike G-0). Insignia «Añadido a tu cuenta» (`order.metadata.cuenta_vinculada`). La ficha de invitado **no se borra** (D9).
- **Otro email (G-2)**: «Mis pedidos» → nº + email → respuesta siempre igual → email `order-transfer` al email del pedido → `/cuenta/transferir/` (aceptar/rechazar con botón, sin sesión). Solo pedidos de **invitado**; `POST /store/orders/:id/transfer/request` y `/cancel` cerradas (403). Las solicitudes caducan a los `ORDER_TRANSFER_TTL_DAYS` (7): mientras están pendientes bloquean devoluciones y ediciones del pedido.
- **Manual (G-3)**: `orders:assign <nº> <email|cus_…> <motivo> [dry-run]` (solo pedidos de invitado). Entre cuentas: «Transfer ownership» del Admin (permitido, D10).
- **Puntos**: `POINTS_RETROACTIVE` (true) y `POINTS_ACCRUE_LOOKBACK_DAYS` (120).
- Para los datos del VPS de pruebas: `orders:link-guests [dry-run]` tras desplegar.

**Lista completa de pendientes y próximos pasos, para elegir: [PENDIENTES.md](./PENDIENTES.md).**

**Al empezar:** Node 24.22.0 (`fnm install 24.22.0 && fnm default 24.22.0`, lo subió Renovate #62) y `pnpm install`. **Siguiente despliegue en el VPS**: Meilisearch 1.55 necesita arrancar una vez con `MEILI_UPGRADE_DB=true` (PENDIENTES §1).

**Siguiente** (decidido con el usuario): **mejoras visuales y de contenido** (las trae el usuario); después optimizaciones de la tienda (fase 13: LCP de fichas, capacidad sin CDN, rebuild por webhook). La fase 12 (GlitchTip, vigilante externo) sigue pendiente.

**Pendientes que no son de la fase 11** (no bloquean):

- **Textos de la gestoría**, todos provisionales: condiciones de compra (con el apartado de códigos), condiciones del programa de puntos, privacidad, cookies y el aviso de puntos del email de confirmación.
- **Fase R:** envío gratis por regla de precio `item_total` («te faltan X €»), upselling, alertas de bajada de precio y reposición en la lista de deseos (R8).
- **Fase L:** automatizar la devolución de los puntos canjeados en devoluciones (faseL §6.4); revisar a mano el widget de puntos del Admin.
- **Fase P:** no crear códigos sobre el envío ni promociones automáticas sin revisarlo (faseP §7).

**Cómo se trabaja con este usuario:**

- En español.
- Plan + confirmación antes de cada subfase (REGLA Nº 1); preguntar las dudas.
- Varias subfases por PR, porque Gitea es lento.
- Él crea las PR y hace el merge con squash; yo hago commit y push de la rama y dejo la descripción de la PR en `/tmp/pr-*.md`.
- En el VPS y la VM los comandos los ejecuta él: **cortos, uno por línea**, sin variables sueltas en la shell; los secretos los escribe él directamente (`nano`), nunca por el chat. El repo es público: nada de IP, puertos de SSH ni datos personales.
- Antes de cada PR, la batería completa: lint, formato, typecheck, unitarios, build, `check:budget`, HTTP del backend y e2e. Los e2e necesitan el build completo del storefront servido con `pnpm start` y su `medusa develop` con `EMAIL_TRANSPORT=smtp`.
- No tocar sus procesos (su `medusa develop` en :9000); parar los míos al terminar.
- Context7: si el MCP se queda sin cuota, la API REST con la clave de `~/.pi/agent/mcp.json`.

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
- **Mejoras del storefront** (PR #41, `58d2ee0`):
  - `DEV_ALLOWED_HOSTS` (solo dev, se fija en el build): hosts extra en `security.allowedDomains` para entrar desde el móvil por la IP de la LAN. Sin esto, por `http://<IP>` los formularios daban «Cross-site POST form submissions are forbidden» (el navegador no envía `Sec-Fetch-Site` fuera de https/localhost y Astro, sin la IP en la lista, toma la URL como `localhost`). `checkOrigin` sigue activo.
  - Cuenta en móvil: la página desbordaba en horizontal (~420 px) y el panel del carrito se abría fuera de la pantalla. El menú de la cuenta estiraba la columna implícita del grid → `grid-cols-1` + `min-w-0` en `AccountLayout.astro`; e2e a 320 px en `cuenta.spec.ts`.
- **Fase C (importador de catálogo): cerrada** (PR #42, `2233ae8`) → §6.6 y [faseC-catalogo.md](./fases/faseC-catalogo.md).
- **Fase S (catálogo en el storefront): cerrada** → §6.8 y [faseS-catalogo-storefront.md](./fases/faseS-catalogo-storefront.md): subcategorías + manifiesto de LiveSync (S-1), €/kg/l + analíticos + filtros sobre materia seca (S-2), granel en gramos (S-3). Interruptores en `CATALOG_FEATURES` (`apps/storefront/src/lib/constants.ts`). **Siguiente**: Fase E → §6.9; después, fase 11 → §6.5.
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

## 6.6 Importador de catálogo (CSV + `catalog:import`)

**Estado: ✅** (PR #42, `2233ae8`). Detalle, decisiones y pruebas en [faseC-catalogo.md](./fases/faseC-catalogo.md). Guía para rellenar la hoja: [`apps/backend/catalog/plantilla/LEEME.md`](../apps/backend/catalog/plantilla/LEEME.md).

- `catalog:import <carpeta> [dry-run]` carga primero `categorias.csv` (con jerarquía: columna `padre`) y después `productos.csv`, una fila por variante.
- Formato: CSV UTF-8 sin dependencias, separador `,` o `;`. Las filas `#` son comentarios: las plantillas llevan ahí las instrucciones.
- **Opciones**: una columna por opción con el prefijo `opcion:` (`opcion:Talla`, `opcion:Color`, `opcion:Proteína`, `opcion:Tamaño`…). Son **globales**; las opciones y valores que falten se crean, y el dry-run los lista. Un producto sin opciones lleva «Formato: Única», porque Medusa exige al menos una opción.
- **Herencia** (solo dentro del mismo producto): `precio`, `precio_oferta`, peso y medidas vacíos toman el valor de la fila de arriba. La oferta va con su precio.
- **Todo o nada**: valida todo e informa por fila y columna. Es idempotente: upsert por `handle`/`sku`, y una segunda carga no cambia nada.
- Lo que está en Medusa y no en la hoja **se ignora**. El **stock** solo se fija al crear la variante.
- Celda vacía = no tocar; `-` = borrar. Etiquetas y categorías con valor sustituyen a las actuales.
- Ofertas en la Price List `sale` «Catálogo — ofertas», que gestiona el importador.
- **Analíticos** (`proteina_pct`, `grasa_pct`, `fibra_pct`, `cenizas_pct`, `humedad_pct` y `analitico:<Nombre>`) en la metadata del producto; **contenido neto** (`neto_g`/`neto_ml`) en la de la variante.
- **Granel** (`granel`, `paso_g`, `min_g`, `precio_kg`, `precio_oferta_kg`, `stock_g`): la unidad de venta es un paso de gramos; el inventario va en gramos (artículo propio, `required_quantity = paso_g`) y el mínimo lo valida Medusa en el carrito (`src/workflows/hooks/validar-carrito.ts`; se llamaba `granel-minimo.ts` hasta la Fase E). **Listo en Medusa; el storefront aún no lo muestra** (productos a granel en borrador hasta esa fase).
- **Fotos**: `images:import` como siempre, por producto (`handle_01.jpg`…) desde una carpeta local.
- Las cargas reales van en `apps/backend/catalog/<carpeta>`, fuera de git (solo se versiona `plantilla/`).
- En la BD local quedan 3 productos de una prueba con la plantilla antigua (`camiseta-basica`, `proteina-whey`, `taza-logo`) y 3 subcategorías (`camisetas`, `sudaderas`, `suplementos`). La plantilla actual (collar, pienso, alas a granel, taza, libro) **no** se ha cargado en dev, solo el dry-run.
- **Hoja real del usuario**: `apps/backend/catalog/mi-carga/categorias.csv` (37 categorías perro/gato/«Para ti», dry-run sin errores; fuera de git) y su original `categorias-original.csv`. Aún **no** cargada en dev.
- **Pendiente**:
  - Storefront del catálogo (subcategorías, granel, analíticos, €/kg/l): **Fase S**, §6.8.
  - `stock:import` para reponer stock en masa.
  - Limpieza de los mock en producción (tarea aparte).

## 6.7 Posible mejora futura (descartada por ahora): orden y novedades

Plan estudiado el 11-oct-2026 y aparcado por el usuario (no es necesario ahora):

- **Orden de los listados**: preferentes → novedades → resto, alfabético dentro de cada grupo (`Intl.Collator("es", { sensitivity: "base", numeric: true })`, sin dependencias) en categorías, `/productos/`, ofertas y carrusel de la home.
  - ⚠️ Hoy el build y la island de `LiveSync` piden a Medusa el MISMO orden (`order: "title"`) y la misma ventana (offset/limit). Si Astro reordena, deja de coincidir → **manifiesto de páginas**, ya decidido para la Fase S (§6.8, D-S1): con él, este cambio de orden no tocaría LiveSync.
- **Novedad automática**: creado tras `NEW_PRODUCT_SINCE` y hace menos de `NEW_PRODUCT_DAYS` días, **o** con la etiqueta `novedad` de Medusa. Se calcula en el build (un build nocturno lo mantiene al día). `NEW_PRODUCT_SINCE` evita que la carga masiva inicial salga entera como novedad. Medusa solo guarda `created_at` (no la fecha de publicación).
- **Distintivo**: «Novedad» arriba a la izquierda (azul `--primary`, mismo estilo que «Oferta»); en tarjetas estrechas, distintivos apilados y más pequeños con container queries. Ojo: hoy «Agotado» ya ocupa esa esquina.
- **Filtro «Solo novedades»** (como «Solo disponibles»), incluidas las automáticas: en listados, del build; en `/buscar/`, `created_at ≥ corte` `$or` etiqueta `novedad` (el proveedor `@rokmohar/medusa-plugin-meilisearch` 2.3.1 compila `$gte` y `$or`). La etiqueta `novedad` saldría de «Etiquetas».
- **Etiqueta interna `preferente`**: fuera de filtros y del campo `tags` del índice; campo `preferente` (0/1) `sortable` en `src/search/product.ts` → `/buscar/` sin texto: `preferente DESC, title ASC`. Requiere `medusa db:migrate` (reconstruye el índice sin cortes).

## 6.8 Handover → Fase S (catálogo en el storefront)

Doc de fase: [faseS-catalogo-storefront.md](./fases/faseS-catalogo-storefront.md). **S-1 hecha** (detalle en su §2: `category_tree_handles`, `lib/categories.ts`, `lib/shop.ts`, manifiestos `listing-pages.json` + `shop-categories.json`, catálogo mock `catalog:mock`). **S-2 hecha** (§2 del doc de fase: `proteina_ms`/`grasa_ms`, `unitPrice`, `AnalyticsTable`, interruptores `CATALOG_FEATURES`). **S-3 hecha** (§2: `lib/bulk.ts`, campo de gramos y accesos rápidos, «Quedan», líneas «250 g · 20,00 €/kg» en carrito, pedido y emails, `min_price_eur` del mínimo; interruptores `bulkLiveTotal`, `bulkStockLeft`, `bulkMaxG`). **Fase cerrada** (13-oct-2026); pendientes en su §7.

**Situación al cerrar la Fase C (11-oct-2026)**:

- Fase C mergeada: PR #42 (`2233ae8`). Este handover va en el PR `docs/cierre-fase-c`.
- Medusa ya guarda todo lo que la Fase S tiene que mostrar (contrato en `apps/backend/catalog/plantilla/LEEME.md`):
  - categorías con `parent_category` (productos solo en la hoja más concreta);
  - `product.metadata`: `marca`, `proteina_pct`, `grasa_pct`, `fibra_pct`, `cenizas_pct`, `humedad_pct`, `analitico:<Nombre>`, `granel: true`;
  - `variant.metadata`: `neto_g` / `neto_ml`; granel `paso_g`, `min_g` (precio de Medusa = precio de UN paso; `inventory_quantity` en pasos);
  - mínimo de granel validado por Medusa en el carrito (400 con mensaje en español).

**Decisión D-S1 (11-oct-2026): manifiesto de páginas para LiveSync en TODOS los listados** (categorías, `/productos/`, carrusel de la home), como `/ofertas/` (`lib/offer-pages.ts`). Análisis:

- Hoy la island pide «categoría + offset + limit, orden por título». Si Medusa cambia sin rebuild (alta, baja, cambio de título o de categoría), las páginas **posteriores** se desplazan: hasta N tarjetas por página se quedan con precio/stock del build. Nunca hay datos cruzados (el script empareja por id). Solo se ve mal si además ese producto cambió de precio/stock; ficha, carrito y pago siempre son correctos.
- Con el uso previsto (rebuild tras la carga masiva, pocos cambios, builds diarios/semanales) el impacto es bajo → **no es urgente**. Se hace en la Fase S porque con subcategorías (el padre agrega las hijas) y con el orden de §6.7 la island tendría que repetir la consulta exacta del build; con el manifiesto ya no depende de ella.
- Coste: 0 B de JS de cliente; respuesta de la island igual (~1,2 KB gzip); JSON en `dist/server` (~140 KB con 1000 productos, ~700 KB con 5000) en memoria del servidor Astro; Medusa consulta por ids (igual o más barato); infra sin cambios. HTML de un build anterior → clave desconocida → «{}» (se queda lo del build).
- **Descartada** la «ventana ancha» (offset−K, limit+2K): +~0,5 KB gzip y +40 % de trabajo en Medusa en cada vista, y falla sin avisar al pasar de K cambios.
- Que un producto NUEVO aparezca en los listados depende del **rebuild** (webhook, fase 13), no del manifiesto.

## 6.9 Handover → Fase E (estructura de URL + productos especiales)

> Nombre provisional «Fase E». El usuario dará los detalles al empezar. **Nada de código sin plan aprobado** (REGLA Nº 1). Al empezar, crear `docs/fases/faseE-<nombre>.md` desde [PLANTILLA.md](./fases/PLANTILLA.md).

Dos trabajos:

1. **Análisis de la estructura de handles/URL** de la tienda y del **futuro blog**. Es un análisis con propuesta: decidir antes de escribir código y antes de producción (fase 11), porque cambiar URL después obliga a poner 301 y se pierde SEO.
2. **Páginas o plantillas, estáticas a poder ser, para «productos especiales»**: una página que hace de «constructor» del producto, donde el cliente lo configura. Detalles, en la sesión nueva.

**Cómo están hoy las URL** (`apps/storefront/src/pages/`, `trailingSlash: "always"`, `site` = `SITE_URL`):

- Catálogo: `/producto/<handle>/` y `/categorias/<handle>/` (en la Fase E pasa a `/categoria/<handle>/`, §6.10) (planas, todas las profundidades; `categoryHref` en `lib/categories.ts`). También `/productos/`, `/ofertas/`, `/buscar/`, con paginación `[...page]` → `/productos/2/`.
- Contenido: `/sobre-nosotros/` (Content Collection `paginas`, Markdown en `src/content/paginas/`) y las legales (`/aviso-legal/`, `/privacidad/`, `/cookies/`, `/condiciones/`; `noindex` y fuera del sitemap).
- Transaccional, on-demand: `/carrito/`, `/checkout/`, `/pedido/<id>/` y `/cuenta/*`.
- Internos: `/listados/*.json` (se mueven a `dist/server`, no son públicos), `/buscar/parcial|sugerencias|tarjetas.json`, `/carrito/parcial|flyout` y `/health`.
- Handles: los fija la hoja (Fase C, `apps/backend/catalog/plantilla/LEEME.md`).
  - Minúsculas, números y guiones; **únicos en toda la tienda** (subcategorías con sufijo: `juguetes-perro`).
  - «No lo cambies después»: hoy **no hay redirecciones**, ni en `astro.config` ni en el Caddyfile.
- Sitemap: `@astrojs/sitemap`, que filtra las legales, `/buscar/` y `/listados/`.
- Sin blog. Content Collections actuales: `anuncios`, `home`, `tienda`, `paginas` (`src/content.config.ts`).

**Preguntas para el análisis** (orientativas):

- ¿`/categorias/<handle>/` plano o jerárquico (`/perro/alimentacion/pienso/`)? ¿Singular o plural, con prefijo o sin él?
- ¿Blog en `/blog/<slug>/`, con categorías o etiquetas propias? ¿Enlaces cruzados con productos y categorías?
- ¿Dónde se gestiona el blog? Content Collections (Markdown en el repo, rebuild por cada post) o un CMS. El contenido comercial sigue en Medusa (I-Interficie).
- Redirecciones 301 para handles cambiados o productos retirados: ¿`redirects` de Astro, Caddy o Cloudflare? ¿Qué pasa con un producto despublicado (404 o 410, redirección a su categoría)?
- Colisiones entre handles de producto, categoría, páginas y posts si alguna vez comparten espacio.

**Productos especiales: puntos de partida y restricciones**:

- Hay que respetar el árbol de decisión de AGENTS §3.1 y los presupuestos de §3.4:
  - página estática;
  - precio y stock con LiveSync (AGENTS §3.2);
  - `<form>` + Astro Action que funcione sin JS;
  - JS solo justificado, y si hace falta, en `CartClient`/`SiteClient` o con una excepción aprobada.
- Ya existen y se pueden reutilizar:
  - ficha `producto/[handle].astro` (`BuyBox`, `AddToCart`, `QuantityField`, `Price`, `AnalyticsTable`);
  - opciones o variantes de Medusa;
  - `variant.metadata` / `product.metadata`, que el importador ya rellena;
  - granel como ejemplo de «regla en la metadata de la variante y validación en el servidor» (`lib/bulk.ts`, `apps/backend/src/lib/granel.ts` + hook `validar-carrito`).
- ⚠️ El **tipo de producto** de Medusa ya se usa para el IVA (`iva-reducido` / `iva-superreducido`, `seed.ts` + reglas del Tax Module). Para marcar «especial» hará falta otra cosa: metadata (p. ej. `plantilla`), etiqueta, colección o categoría. Decidirlo en el plan.
- Lo que el cliente configure (texto, combinación de piezas…):
  - si cambia el precio, tiene que ser una variante o validarse en el **backend** (workflow o hook), nunca precio desde el formulario;
  - si va en `line_item.metadata`, recordar que el cliente puede escribirla por la Store API (decisión de S-3): validar en el servidor y no fiarse de ella para nada de importes.
- Revisar cómo llega la configuración al pedido, a los emails (`packages/emails`) y al Admin. El Admin aún muestra el granel en pasos (Fase S §7).

**Documentación que consultar** (REGLA Nº 1):

- astro-docs: rutas, `getStaticPaths`, `redirects`, Content Collections y loaders, sitemap, Actions;
- context7 `/medusajs/medusa`: product types y tags, metadata, line item metadata, workflows y hooks de carrito;
- cloudflare-docs: redirecciones masivas (Bulk Redirects), si se plantea hacerlas en el borde.

**Estado al cerrar la Fase S**:

- **Ramas:** `main` (`7e633de` + S-3 cuando se mergee). PR de S-3: `feat/storefront-granel`; PR de cierre: `docs/cierre-fase-s`.
- **BD local:** 300 productos mock, con el granel publicado.
- **Docker:** limpio. Imágenes antiguas y volúmenes anónimos borrados. Pendiente de que decida el usuario: volúmenes `tienda-dev_*` (proyecto anterior), imágenes `*:prodlocal` / `:local` / `:fixtures` y la caché de build.

## 6.10 Fase E ✅ cerrada

Doc: [faseE-urls-correas.md](./fases/faseE-urls-correas.md).

- **E-0 ↩️ CI revertido** (#49): `ci.yml` vuelve a ser el de `3a42fa8`. Si se quitó `lighthouse` de los checks obligatorios de Gitea, hay que volver a ponerlo.
- **E-1 ✅ URL** (#48):
  - `/categoria/<handle>/`, con 301 desde `/categorias/…`;
  - redirecciones en `apps/storefront/src/lib/redirects.mjs`, validadas en el build;
  - **descatalogado**, que se marca con las columnas `descatalogado` y `sustituto` de la hoja. La ficha sigue, con aviso y `noindex`. El producto sale de listados, búsqueda y sitemap, y Medusa no deja añadirlo al carrito;
  - sitemap con `lastmod`;
  - test de reglas de URL, con reservados `blog`, `ca`, `eu` y `gl`.
- **L-1 ✅** (#50): la island de LiveSync de los listados solo trae datos de tarjeta.
- **E-2 correa a medida** (diseño y decisiones en el doc de fase §3.3):
  - E-2a ✅ medición en local. Encontró la **sobreventa entre líneas** que comparten pieza (Medusa valida línea a línea).
  - **E-2b ✅ backend** (`feat/correas`): hojas `catalog/plantilla/correas/` + `correas:sync` (6 correas × 117 variantes con inventory kit), demanda conjunta de piezas en `validar-carrito.ts` (también al completar), metadata de la línea (`observaciones`, `medida_cm`) solo en correas, `GET /store/correas/disponibilidad` (máscaras, sin cantidades) y categoría `correas-perro`. Manual: `catalog/plantilla/correas/LEEME.md`.
  - **E-2c ✅ storefront** (`feat/correas`, doc de fase §2 E-2c):
    - listados y búsqueda con una sola tarjeta «Correa a medida» (`lib/correa.ts`, `getListingProducts`);
    - **landing** `/producto/correa-a-medida/`: textos en `src/content/correa.md`, selector de color pintado (`color_hex`) con «hasta X m» y CTA (CSS `:has()`, 0 JS), tabla de precios; island con la ruta de disponibilidad (enlaces de kit en memoria, ~80 ms) + 16 variantes por material;
    - ficha de cada color: muestras de color, plazo de fabricación y `CorreaBuilder` con **desplegables** (sin JS: action `cart.addCorrea`, el servidor resuelve la variante; el build comprueba el precio aditivo);
    - bundle `CorreaLive` 788 B gzip (excepción en AGENTS §3.4);
    - medida y observaciones en carrito, checkout, pedidos y emails;
    - `correa-a-medida` reservado (build, importadores, `url-rules.test.ts`);
    - fixtures con 2 colores; e2e con y sin JS y checkout con correa.
  - **E-2d ✅**: excepción `CorreaLive` en AGENTS §3.4, README §4/§13 y cierre del doc de fase.
  - Pendientes (doc de fase §7): fotos de mosquetones (rejilla en vez de desplegable), plazo de fabricación provisional, desistimiento de personalizados (gestoría).
- **BD local**: catálogo mock con 6 descatalogados, categoría `correas-perro` y las 6 correas de la plantilla (`correas:sync catalog/plantilla/correas`).

## 6.12 Fase L ✅ cerrada

Doc: [faseL-deseos-puntos.md](./fases/faseL-deseos-puntos.md).

- **Lista de deseos** (#52): módulo `wishlist`, ♡ en tarjetas, ficha y cabecera (island `HeaderState`), `/cuenta/deseos/` y compartir por enlace con un token revocable (`/deseos/<token>/`).
- **Puntos** (PR 2, `feat/faseL-puntos`):
  - **Backend:**
    - módulo `points` (saldo calculado de los movimientos);
    - canje como promoción de un uso, con IVA y un tope de 0,50 € por pagar;
    - abono con el job `points-accrue` a los `POINTS_CONSOLIDATE_DAYS` días del envío;
    - cancelaciones y devoluciones;
    - rutas Store y Admin, informe de saldos y widget en la ficha del cliente;
    - scripts `points:*`.
  - **Storefront:** `/cuenta/puntos/`, «Usar mis puntos» en el pago (PRG, sin JS), «Puntos −X €» en los resúmenes, «ganarías» para invitados.
  - **Email de confirmación:** puntos usados y los que ganará.
  - **Legal:** `/condiciones-puntos/` y el párrafo de privacidad, **provisionales**.
- **Pendiente:**
  - textos de la gestoría;
  - automatizar la devolución de los puntos canjeados en devoluciones (plan en el doc §6.4);
  - revisar el widget del Admin a mano.

## 6.11 Handover → análisis: lista de deseos y programa de puntos

> ✅ **Análisis hecho**: [faseL-deseos-puntos.md](./fases/faseL-deseos-puntos.md). Las decisiones (§0.1) mandan sobre lo de abajo: puntos solo web, sin migrar, sin caducidad, canje como **promoción** (P-B, sin plugin).

> **Solo análisis y propuesta**, sin código (REGLA Nº 1). Al empezar, crear `docs/fases/faseL-deseos-puntos.md` (nombre provisional) desde [PLANTILLA.md](./fases/PLANTILLA.md). Consultar antes: context7 `/medusajs/medusa` (guía _wishlist_, Loyalty Plugin / Store Credit), astro-docs (actions, server islands) y, para la parte legal, preparar preguntas para la gestoría.
> Requisito previo: el PR de la Fase E (`feat/correas`) mergeado en `main`. Rama nueva desde `main`.

### Lo que ya se habló (fase9.md §7, ESTADO §6.2)

- **Programa de puntos** (regla de la tienda física): el **0,8 %** de cada compra en puntos; **1 punto = 1 €** de descuento, con decimales (0,15 puntos = 0,15 €), para usar o acumular. Hoy lo calcula un script diario en un POS que **desaparecerá**: no hay que integrarlo (¿migrar saldos existentes? preguntar).
  - Encaja con el **Store Credit** del `@medusajs/loyalty-plugin` 2.21.2 (MIT, misma versión que Medusa): cuenta de crédito por cliente (`createStoreCreditAccountsWorkflow`), abonos con referencia (`creditStoreCreditAccountWorkflow`, `reference: "order"`, `reference_id`) y en el checkout `addStoreCreditsToCartWorkflow` (todo el saldo o una parte, como _credit line_ del carrito).
  - Es una **dependencia nueva** (backend): requiere aprobación y entrada en README §4. Comprobar que no arrastra el resto del plugin que no usemos (gift cards) o que se puede desactivar.
- **Lista de deseos**: hasta ahora solo «idea» (alternativa a una lista de carritos, que se descartó: un carrito por cuenta).
  - Medusa tiene una **guía oficial** (no un paquete): módulo propio `wishlist` (+ `wishlist_item`), `defineLink` con cliente y variante, workflows (crear lista, añadir/quitar ítem, validación de canal de venta) y rutas `GET/POST /store/customers/me/wishlists`, `…/items`, `DELETE …/items/:id` y **compartir** (`…/share` → token JWT y `GET /store/wishlists/:token`). context7 `/medusajs/medusa`, `plugins/guides/wishlist`.
- **Carrito abandonado** (misma «fase de marketing»): tutorial oficial; es comunicación comercial (consentimiento/baja). No es parte de este análisis salvo que se decida juntar.

### Preguntas para el análisis (orientativas)

**Lista de deseos**

- ¿Solo con cuenta, o también invitados (cookie + se fusiona al entrar)? ¿Por **producto** o por **variante**? (La guía oficial guarda variantes; la correa a medida tiene 117 → ¿producto?)
- ¿Una lista o varias? ¿Compartir por enlace (regalos)? ¿Aviso por email cuando un deseado baja de precio o vuelve a tener stock (comunicación comercial)?
- Storefront (AGENTS §3): el corazón en tarjetas y fichas **estáticas** sin JS añadido a home/listados/ficha (0 bundles salvo excepciones aprobadas). Opciones: `<form>` + action `wishlist.toggle` (PRG, funciona sin JS) y estado «ya está en la lista» vía server island o `CartClient`/`SiteClient` (¿cabe en sus presupuestos?). Página `/cuenta/deseos/` on-demand.
- ¿Precio y stock en la lista? (Datos frescos: on-demand, como el carrito.)

**Programa de puntos**

- **Cuándo se abonan**: al pagar (`order.placed`/pago capturado) con saldo «pendiente», o al **entregar** / pasado el plazo de desistimiento (14 días). ¿Qué pasa con devoluciones y cancelaciones (descontar el abono, idempotencia)?
- **Base de cálculo**: ¿con IVA? ¿sin envío? ¿se excluyen productos (ofertas, correas a medida)? ¿Se generan puntos sobre la parte pagada con puntos? Redondeo (céntimos).
- **Caducidad** y **límites** de uso (¿mínimo de compra? ¿máximo por pedido? ¿combinable con descuentos?).
- **Solo con cuenta** (Store Credit va por cliente). ¿Se avisa en el checkout de invitado («con cuenta ganarías X»)?
- Dónde se ve: «Mi cuenta» (saldo y movimientos), checkout (aplicar todo/parte), emails de pedido («has ganado X puntos»).
- **Contabilidad/IVA**: un descuento con puntos reduce la base imponible del pedido; ¿cómo lo trata Medusa en `tax_total` y en la factura? Verificar con el desglose de IVA de los emails (`buildTaxBreakdown`). **Gestoría**: condiciones del programa (texto legal en `/condiciones/`), caducidad, y si los puntos tienen tratamiento contable.
- Migración: ¿se importan los saldos del POS actual a cuentas online (por email)? ¿Cómo se vincula un cliente de tienda física con su cuenta online?

### Contexto técnico útil

- Cuenta de cliente: fase 9 (`docs/fases/fase9.md`): JWT en cookie httpOnly, actions `account.*` con PRG, páginas `/cuenta/*` on-demand sin JS, `retrieveCustomer`, `listCustomerOrders`.
- Checkout: fase 5 (`docs/fases/fase5.md`): pasos datos → envío → pago (Stripe Payment Element, bundle `StripePayment` ≤ 30 KB); `CHECKOUT_FIELDS`, `OrderSummary.astro`. Un _credit line_ cambia `total`: comprobar que el importe del Payment Intent se recalcula.
- Emails: `packages/emails` + `apps/backend/src/lib/emails.ts` (`ORDER_EMAIL_FIELDS`, `buildOrderPlacedProps`), subscribers con `sendEmail` e `idempotency_key`.
- Hooks del carrito: un solo handler por hook (`src/workflows/hooks/validar-carrito.ts`).
- Presupuestos de JS: AGENTS §3.4 (CartClient ≤ 2 KB, SiteClient ≤ 1,5 KB, ya en 1,46 KB: poco margen).

### Entregable del análisis

Documento de fase con: opciones (con pros/contras y fuentes), propuesta recomendada, modelo de datos, flujos (diagrama), impacto en JS/rendimiento, lista de preguntas para la gestoría y plan por subfases (p. ej. L-1 lista de deseos, L-2 puntos backend, L-3 puntos storefront/emails). **Esperar aprobación antes de codificar.**

## 7. Pendientes conocidos

- **LiveSync en listados** (perf L-1, `perf/livesync-tarjetas`):
  - Hoy la island de los listados solo devuelve entradas por producto, y la de la ficha todas las variantes. Detalle en [faseE-urls-correas.md](./fases/faseE-urls-correas.md) §2.
  - Medusa sigue calculando precio y stock de **todas** las variantes de la página: ~0,4 ms por variante + ~30 ms (24 × 20 ≈ 230 ms sin caché).
  - **L-2 (aparcada)**: resumen por producto precalculado en el backend (caché Redis invalidada por eventos). Se activa si la island tarda **> 300 ms sin caché en producción**. Antes, consultar caching y eventos de Medusa (REGLA Nº 1).

- **Carritos de «invitado con email»** (con pago de Stripe pendiente) y purgado definitivo de los borrados en suave: ver fase10.md §7.

- **Fase 11 — Cloudflare**: regla de caché que **respete el origen** (no «Cache Everything» por encima de `no-store`); rate limiting de entrar/registro/recuperar/checkout.
- ~~**Fase 11/13**: CSS crítico, LCP de la ficha (720 px) y logos~~: hechos en la [Fase R](./fases/faseR-rendimiento.md) (CSS dentro del HTML, 720 px, logos 1×/2×).
- PAT del push mirror y token de GitHub para Renovate: **caducan en 1 año** (renovarlos).
- Confirmar con la gestoría la clasificación de productos en IVA reducido/superreducido.
- **Fase R:** upselling (`mejor_opcion`), avisos de bajada de precio y reposición en la lista de deseos (R8) y «te faltan X € para el envío gratis» (cuando haya envío gratis por reglas de precio): faseR-relacionados.md §4–§5.
- **Fase P:** rate limiting de `POST /store/carts/:id/code` en Cloudflare (fase 11); no crear códigos sobre el envío ni automáticos sin revisar (faseP-codigos.md §7).
- **Fase L (gestoría):** sustituir los textos provisionales de `/condiciones-puntos/` y del párrafo de puntos de `/privacidad/`, y validar el aviso de puntos del email de confirmación (G4/G5).
