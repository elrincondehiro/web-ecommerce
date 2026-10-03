# Fase 2 — Backend base (Medusa 2.21.2)

> **Estado:** ✅ completada (03-oct-2026) · PR #10 (`c6bbd3a`) en `main` de Gitea y GitHub
> **Rama/PR:** `feat/fase2-backend-base` → PR #10 (squash) · cierre: `docs/fase2-cierre`
> **Anterior:** [Fase 1](./fase1.md) · **Siguiente:** Fase 3 — Storefront base (`fase3.md`, se crea al iniciarla)

## 1. Objetivos

- [x] `apps/backend` con Medusa **2.21.2** (todos los `@medusajs/*` iguales), integrado en el monorepo pnpm.
- [x] Postgres de `compose.dev.yml` como BD; migraciones aplicadas.
- [x] Módulos Redis: **event bus**, **workflow engine**, **locking** y **caching**.
- [x] Preparado para `server` / `worker` (`MEDUSA_WORKER_MODE`) y `DISABLE_MEDUSA_ADMIN`.
- [x] Admin operativo en `http://localhost:9000/app` (el usuario lo crea el propio usuario).
- [x] Región **España (EUR, IVA incluido)** con IVA **21 / 10 / 4 %**, canal de venta, envíos y **publishable API key**.
- [x] **Catálogo de prueba** (`seed:mock`), decisión P4.
- [x] `lint`, `typecheck`, `test` y `build` del backend integrados en el CI (`quality`).
- [x] `apps/backend/.env.example` y `.env.test.example` documentados.

## 2. Decisiones

| #   | Decisión                                                                                                                                               | Motivo / fuente                                                                                                                                                                                                                         |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1  | **TypeScript 6.0.3** también en el backend (opción b). Si falla, 5.9.3 solo en `apps/backend`                                                          | Medusa documenta `^5.6.2`. **Resultado: typecheck, build y tests OK con 6.0.3**. Aviso de peers: `cva@1.0.0-beta.1` (dentro de `@medusajs/ui`, admin) declara `typescript <6`; solo afecta a tipos de un paquete compilado, sin impacto |
| P2  | Starter oficial **copiado a mano** (`medusa-starter-default@9565d9d`), sin `create-medusa-app`                                                         | Sin yarn, sin prompt del plugin de Claude, versiones exactas. Se borraron `.git`, `.github`, `yarn.lock`, `.yarn*`, `.npmrc` (ya en la raíz), `.vscode`, READMEs y rutas `custom` de ejemplo                                            |
| P3  | Dependencias de desarrollo aprobadas (README §4.3). Sin `vite` (Medusa trae Vite 7) ni `yalc`                                                          | —                                                                                                                                                                                                                                       |
| P4  | **Solo España** + IVA **21 % (general)**, **10 % (reducido)** y **4 % (superreducido)**; catálogo mock en **esta** fase                                | Tax Module: "Override Tax Rates with Rules" (`TaxRateRule` con `reference: product_type`)                                                                                                                                               |
| P5  | El **usuario crea el admin** con `medusa user`                                                                                                         | Ninguna contraseña en ficheros                                                                                                                                                                                                          |
| P6  | **Telemetría desactivada**: `MEDUSA_DISABLE_TELEMETRY=true` (en `.env`, `.env.test` y CI) + `allowBuilds: "@medusajs/telemetry": false`                | Aunque no se use `create-medusa-app`, `@medusajs/medusa`, `cli` y `framework` dependen de `@medusajs/telemetry` (lee `MEDUSA_DISABLE_TELEMETRY`, código del paquete)                                                                    |
| —   | `nodeLinker` sigue **isolated** (no `hoisted`) + `publicHoistPattern`                                                                                  | Medusa funciona (dev, build, start, tests): la revisión pendiente de la fase 0 queda cerrada                                                                                                                                            |
| —   | **Un solo canal de venta**: el seed reutiliza y renombra el "Default Sales Channel" que crea `db:migrate`                                              | Con dos canales en la publishable key, `POST /store/carts` exige `sales_channel_id` (error real encontrado)                                                                                                                             |
| —   | **IVA incluido** = price preference por `currency_code: eur` (vía `updateStoresWorkflow` → `supported_currencies[].is_tax_inclusive`) **y** por región | Doc "Tax-Inclusive Pricing": los precios de producto son por moneda; solo con la preferencia de región el IVA se sumaba encima (error real encontrado)                                                                                  |
| —   | Importes en **unidad principal** (`4.95` = 4,95 €)                                                                                                     | Doc Medusa v2: "Prices are Stored in Major Units"                                                                                                                                                                                       |
| —   | `medusa-config.ts`: variables obligatorias **solo en producción** (`medusa start` fuerza `NODE_ENV=production`)                                        | `medusa build` carga la config sin `.env` (CI/Docker)                                                                                                                                                                                   |
| —   | Meilisearch dev: `MEILI_UPGRADE_DB=true`                                                                                                               | El PR de Renovate (v1.54.2 → v1.54.3) dejó el contenedor en bucle: BD incompatible con la nueva versión. En prod: snapshot + upgrade controlado (fase 11)                                                                               |

## 3. Qué se ha hecho

```
apps/backend/
├── medusa-config.ts            Redis (caching, event bus, workflow engine, locking), worker mode, admin
├── package.json                @medusajs/* 2.21.2, scripts dev/build/start/seed/seed:mock/typecheck/test
├── tsconfig.json               starter + strict + types node/jest (TS 6.0.3)
├── jest.config.js              starter (loadEnv desde @medusajs/framework/utils)
├── .env.example · .env.test.example
├── integration-tests/http/health.spec.ts   (starter)
└── src/
    ├── scripts/seed.ts          España, IVA 21/10/4, almacén Madrid, envíos 4,95 / 9,95 €, publishable key
    ├── scripts/seed-mock.ts     N productos (24 por defecto) en 5 categorías y 3 tipos de IVA, stock
    ├── scripts/__tests__/seed-mock.unit.spec.ts
    ├── admin/ (i18n starter) · api/{admin,store} · jobs · links · modules · subscribers · workflows (vacíos)
```

Fuera del backend:

- `pnpm-workspace.yaml` → `allowBuilds`: `@swc/core`, `esbuild`, `msgpackr-extract` ✅; `protobufjs` y `@medusajs/telemetry` ❌.
- `packages/config/eslint.config.js` → ficheros CommonJS (`jest.config.js`, `integration-tests/setup.js`) y globals de jest.
- `.github/workflows/ci.yml` → `MEDUSA_DISABLE_TELEMETRY=true`.
- `docker/compose.dev.yml` → `MEILI_UPGRADE_DB=true` (solo dev).

### Modelo de IVA

| Tipo          | Tasa | Cómo se aplica                                            | En el catálogo mock     |
| ------------- | ---- | --------------------------------------------------------- | ----------------------- |
| General       | 21 % | Tasa por defecto de la región fiscal ES (`IVA21`)         | Ropa, Hogar, Accesorios |
| Reducido      | 10 % | `TaxRate IVA10` + regla `product_type = iva-reducido`     | Alimentación            |
| Superreducido | 4 %  | `TaxRate IVA4` + regla `product_type = iva-superreducido` | Libros                  |

En el Admin, para que un producto lleve 10 % o 4 %, asígnale el **Tipo** `iva-reducido` o `iva-superreducido`. ⚠️ Confirma con tu gestoría la clasificación real de tus productos (y los casos de Canarias, Ceuta, Melilla o recargo de equivalencia).

## 4. Cómo usarlo

```bash
pnpm infra:up
cp apps/backend/.env.example apps/backend/.env
#   genera JWT_SECRET, COOKIE_SECRET y AUTH_MFA_ENCRYPTION_KEY:  openssl rand -hex 32
cp apps/backend/.env.test.example apps/backend/.env.test
pnpm install
pnpm --filter backend exec medusa db:migrate
pnpm backend:seed                               # una vez (idempotente: no hace nada si existe "España")
pnpm backend:seed:mock                          # 24 productos; `backend:seed:mock -- 100` para 100 (idempotente)
pnpm --filter backend exec medusa user -e <tu-email> -p <tu-contraseña>
pnpm dev:backend                                # http://localhost:9000 · Admin http://localhost:9000/app
```

Reiniciar la BD de desarrollo desde cero:

```bash
C="docker compose --env-file docker/.env -f docker/compose.dev.yml"
$C exec -T postgres psql -U medusa -d postgres -c "DROP DATABASE medusa WITH (FORCE);" -c "CREATE DATABASE medusa OWNER medusa;"
$C exec -T redis redis-cli FLUSHALL
# → db:migrate + seed + seed:mock + user
```

## 5. Cómo testear esta fase

```bash
pnpm dev:backend
curl -s localhost:9000/health                                           # OK
PK=$(docker compose --env-file docker/.env -f docker/compose.dev.yml exec -T postgres \
     psql -U medusa -d medusa -tAc "select token from api_key where type='publishable' limit 1")
curl -s -o /dev/null -w '%{http_code}\n' localhost:9000/store/products  # 400 (sin publishable key)
curl -s localhost:9000/store/regions -H "x-publishable-api-key: $PK"    # España · eur · [es]
curl -s "localhost:9000/store/products?limit=3&fields=title,type.value" -H "x-publishable-api-key: $PK"

# IVA incluido en el carrito (resultado verificado):
#   Taza Esencial 002          PVP 41,95  IVA21  cuota 7,28  total 41,95
#   Café en grano Vintage 008  PVP 16,95  IVA10  cuota 1,54  total 16,95
#   Guía de viaje Clásico 009  PVP 42,95  IVA4   cuota 1,65  total 42,95
#   → total 101,85 € (IVA incluido 10,47 €)

# Admin: http://localhost:9000/app → Productos (24 mock), Ajustes → Regiones (España, IVA incluido),
#        Ajustes → Regiones fiscales → ES (IVA21 + IVA10/IVA4 con reglas), Publishable API keys

# Server / worker (build de producción):
pnpm --filter backend build && cd apps/backend/.medusa/server && set -a && . ../../.env && set +a
MEDUSA_WORKER_MODE=server PORT=9002 ../../node_modules/.bin/medusa start   # /health OK, /app 200
MEDUSA_WORKER_MODE=worker DISABLE_MEDUSA_ADMIN=true PORT=9001 ../../node_modules/.bin/medusa start   # /health OK, /store y /app 404

# Calidad
pnpm lint && pnpm format:check && pnpm typecheck && pnpm test && pnpm build
pnpm --filter backend test:integration:http      # health.spec.ts (BD temporal en el Postgres de dev)
```

## 6. Criterio de salida

- [x] Admin operativo y Store API responde con publishable key (400 sin ella).
- [x] Módulos Redis activos: logs de conexión de caching, event bus, locking y workflow engine; claves `bull:*` en Redis.
- [x] IVA 21/10/4 % aplicado e **incluido** en el PVP (ficha y carrito).
- [x] Server y worker arrancan con la build de producción y se reparten las funciones.
- [x] Lint, format, typecheck, test (unit 2/2, integración 1/1) y build en verde en local y en simulación del job de CI (`node:24.21.0-trixie`).
- [x] `quality` verde en el PR #10 (Gitea y GitHub). Admin revisado por el usuario.

## 7. Pendientes / riesgos

- **RAM del CI** (decisión del usuario: se deja `capacity: 2` y LXC 4 GB de momento; vigilar fallos OOM): el `pnpm build` del backend (admin con Vite) llega a **~3,7 GB** en un contenedor sin límite y **termina bien con un límite de 3 GB** (el sistema recorta la caché). Con `capacity: 2` en un LXC de 4 GB + 1 GB swap, dos builds a la vez **pueden quedarse sin memoria**. Opciones: `capacity: 1`, subir el LXC a 6–8 GB, o (fase 10) build del admin en un job aparte.
- Peer `typescript <6` de `cva` (admin de Medusa): solo un aviso.
- Clasificación real de productos en IVA reducido/superreducido: confirmar con la gestoría.
- Los tests de integración (`test:integration:http`) **no** están en el CI todavía: necesitan Postgres/Redis como servicios del job (posible en Gitea Actions con `services:`). Propuesta para la fase 10 o un PR propio.

## 8. Cierre

- Scripts añadidos en la raíz (rama de cierre): `pnpm dev` (todas las apps en paralelo), `pnpm dev:backend`, `pnpm backend:seed`, `pnpm backend:seed:mock`. En la fase 2 la documentación citaba `pnpm dev:backend` pero el script no existía.
- Incidencia: quedaron procesos `medusa develop/start` de las pruebas del agente ejecutándose en segundo plano (el usuario vio el backend "arrancado"). Parados en el cierre. Para comprobar: `ss -ltnp | grep 9000`.
