# Estado del proyecto — punto de partida para una sesión nueva

> **Léeme primero** (agentes de IA): resume dónde está el proyecto, cómo se trabaja y qué sigue.
> Después lee `AGENTS.md` (reglas, **obligatorio**) y solo lo que necesites de `README.md` y `docs/fases/`.
> Última actualización: 03-oct-2026 · fase 3 en curso (PR 3a).

## 1. Dónde estamos

| Fase                                        | Estado          | Doc                              |
| ------------------------------------------- | --------------- | -------------------------------- |
| Prefase (decisiones, SSH, repos, MCPs)      | ✅              | [prefase.md](./fases/prefase.md) |
| 0 Fundaciones (monorepo pnpm, infra Docker) | ✅              | [fase0.md](./fases/fase0.md)     |
| 1 CI básico + Renovate                      | ✅              | [fase1.md](./fases/fase1.md)     |
| 2 Backend Medusa                            | ✅              | [fase2.md](./fases/fase2.md)     |
| **3 Storefront base (Astro)**               | 🚧 **en curso** | [fase3.md](./fases/fase3.md)     |

Roadmap completo y tiempos: README §13.

## 2. Qué hay construido

- **Monorepo pnpm 12.8.1**, Node **24.21.0** (fnm). Workspaces: `apps/*`, `packages/*`.
  - `packages/config`: TS base, ESLint 10 flat (incluye CommonJS/jest), Prettier.
  - `apps/backend`: **Medusa 2.21.2**, TS 6.0.3 (funciona; plan B: 5.9.3 solo en backend).
  - `apps/storefront` (fase 3, en revisión): Astro 7.3.5 estático + server islands de precio y stock, shadcn-svelte (preset `vega`) sin hidratar, 0 bundles JS. Modo `STOREFRONT_DATA=fixtures` para CI. Detalle en [fase3.md](./fases/fase3.md).
- **Infra dev** (`docker/compose.dev.yml`, puertos solo `127.0.0.1`): Postgres 17.11, Redis 8.10.2, Meilisearch v1.54.3 (`MEILI_UPGRADE_DB=true` en dev), SeaweedFS 4.48 (`weed mini`, bucket `medusa` con lectura anónima), Mailpit, Stripe CLI (perfil `stripe`). Credenciales de ejemplo en `docker/.env` (desde `.env.example`).
- **Backend**:
  - Redis para caching, event bus, workflow engine y locking.
  - `MEDUSA_WORKER_MODE` shared/server/worker; `DISABLE_MEDUSA_ADMIN`.
  - Telemetría OFF: `MEDUSA_DISABLE_TELEMETRY=true` + `allowBuilds` de `@medusajs/telemetry` a false.
  - Seed **España**: EUR **IVA incluido**, IVA **21 %** por defecto; **10 %** y **4 %** vía tipo de producto `iva-reducido` / `iva-superreducido`; un solo canal "Tienda online"; envíos 4,95 / 9,95 €; publishable key (sale en el log del seed).
  - `seed:mock`: catálogo de prueba idempotente (24 productos por defecto).
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
pnpm backend:seed:mock       # idempotente; `-- 100` para 100 productos
pnpm --filter backend exec medusa db:migrate
pnpm --filter backend test:integration:http   # necesita apps/backend/.env.test
pnpm lint && pnpm format:check && pnpm typecheck && pnpm test && pnpm build
```

Publishable key actual (dev): `docker compose --env-file docker/.env -f docker/compose.dev.yml exec -T postgres psql -U medusa -d medusa -tAc "select token from api_key where type='publishable'"`.

## 5. Infra del usuario (contexto)

- Gitea **28.0.0** en un LXC Debian 13 (Proxmox, homelab), SSH en el puerto 2222 (`gitea:jacknoddy/web-ecommerce.git`). GitHub: `elrincondehiro/web-ecommerce` (réplica).
- **gitea-runner 4.0.1** de **usuario**, binario en el mismo LXC (4 GB RAM + 1 GB swap), `capacity: 2`. La etiqueta `ubuntu-latest` = `docker://node:24.21.0-trixie` (Debian 13 + Node 24; **no** es la imagen Ubuntu de GitHub).
- ⚠️ El build del backend llega a unos 3,7 GB de pico: dos builds a la vez pueden agotar la memoria. El usuario lo deja así de momento.
- Producción futura: VPS **Hetzner** (Debian 13). Monitorización híbrida (README §12); red privada **WireGuard** preferida (se decide en la fase 12).

## 6. Siguiente

- **Ahora:** revisar y fusionar el PR de la fase 3 (`feat/fase3-storefront-base`). Al cerrar la fase: README §13 → ✅, `fase3.md` ✅ y actualizar este fichero.
- **Después: fase 4 — Carrito** (README §13): cookie `cart_id` httpOnly, Astro Actions sin JS, contador en server island, Playwright con JS desactivado. REGLA Nº 1 antes de empezar.
- Skill `shadcn-svelte` disponible en `.pi/skills/` (comandos `pnpm dlx shadcn-svelte@1.7.0`). Al añadir componentes, usar `--no-deps` y revisar `package.json` (el CLI mete `^`).

## 7. Pendientes conocidos

- Tests de integración del backend fuera del CI (necesitan Postgres/Redis como `services:`); propuesta para la fase 10.
- PAT del push mirror y token de GitHub para Renovate: **caducan en 1 año** (renovarlos).
- Confirmar con la gestoría la clasificación de productos en IVA reducido/superreducido.
- Login del MCP de Stripe (cuenta **test**) cuando llegue la fase 5.
