# web-ecommerce

E-commerce **autoalojado**, pensado para ir a **máxima velocidad**: todo lo posible en estático, islas de servidor cuando hace falta y el mínimo JavaScript en el cliente.

| Capa                         | Tecnología                                                                                                                    |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Backend / commerce engine    | **Medusa v2** (Node, TypeScript) + Admin                                                                                      |
| Tienda (storefront)          | **Astro 7** + islas **Svelte 5** + **Tailwind CSS v4** + **shadcn-svelte** (port de shadcn/ui para Svelte)                    |
| Base de datos                | **PostgreSQL**                                                                                                                |
| Colas, eventos, caché, locks | **Redis**                                                                                                                     |
| Búsqueda                     | **Meilisearch**                                                                                                               |
| Pagos                        | **Stripe** (Payment Element + webhooks)                                                                                       |
| Imágenes / ficheros          | **Cloudflare R2** (compatible S3; **SeaweedFS** en local)                                                                     |
| Emails transaccionales       | **Resend** + **React Email**                                                                                                  |
| Borde / proxy                | **Cloudflare** (DNS, CDN, WAF) → **Caddy** (TLS de origen, reverse proxy, compresión, caché de estáticos)                     |
| Monitorización               | **Híbrida autoalojada en 2 máquinas**: homelab (Uptime Kuma, Beszel hub, Dozzle, GlitchTip) + VPS Hetzner (agentes) — ver §12 |
| Control de versiones / CI    | **Gitea** autoalojado (SSH puerto 2222) y/o **GitHub** — Gitea Actions / GitHub Actions                                       |
| Registro de imágenes         | Registro de contenedores de Gitea y/o **GHCR**                                                                                |
| Tooling                      | **pnpm** (nunca npm/yarn) · **fnm** (nunca nvm) · Docker + Docker Compose                                                     |

> Las directrices para agentes de IA están en [`AGENTS.md`](./AGENTS.md). Léelas antes de tocar código.
>
> **Estado:** [prefase](./docs/fases/prefase.md) ✅ completada · [fase 0](./docs/fases/fase0.md) 🚧 en curso. Detalle de cada fase en [`docs/fases/`](./docs/fases/).
>
> ⛔ **Regla nº 1 para agentes**: antes de empezar cualquier parte nueva (fase, storefront, backend, módulo, infraestructura…) se consulta la documentación — primero el **MCP específico**, si no **context7** —, se presenta un plan y **se espera confirmación del usuario**. Ante cualquier duda, no se ejecuta nada. Detalle en [`AGENTS.md`](./AGENTS.md#-regla-nº-1--consultar-documentación-y-confirmar-antes-de-empezar).

---

## Índice

1. [Arquitectura](#1-arquitectura)
2. [Estrategia de rendimiento del frontend](#2-estrategia-de-rendimiento-del-frontend)
3. [Estructura del repositorio](#3-estructura-del-repositorio)
4. [Versiones fijadas](#4-versiones-fijadas)
5. [MCPs de documentación para agentes](#5-mcps-de-documentación-para-agentes)
6. [Requisitos previos](#6-requisitos-previos)
7. [Crear el repositorio (Gitea + GitHub)](#7-crear-el-repositorio-gitea--github)
8. [Instalación y arranque en local](#8-instalación-y-arranque-en-local)
9. [Comandos habituales](#9-comandos-habituales)
10. [Flujo de Git, CI e imágenes](#10-flujo-de-git-ci-e-imágenes)
11. [Despliegue en el VPS](#11-despliegue-en-el-vps)
12. [Monitorización](#12-monitorización)
13. [Plan de trabajo (roadmap)](#13-plan-de-trabajo-roadmap)
14. [Variables de entorno](#14-variables-de-entorno)

---

## 1. Arquitectura

```
                         ┌──────────────────────────────┐
  Navegador ──HTTPS──▶   │ Cloudflare (DNS, CDN, WAF)   │
                         └──────────────┬───────────────┘
                                        │ HTTPS (Origin CA / Full strict)
                         ┌──────────────▼───────────────┐
                         │ Caddy (VPS)                  │
                         │  tienda.dominio   → storefront (estático + node)
                         │  api.dominio      → medusa-server
                         │  admin.dominio    → medusa-server (/app)
                         └───┬───────────────┬──────────┘
                             │               │
              ┌──────────────▼───┐   ┌───────▼─────────────┐
              │ storefront       │   │ medusa-server       │◀── Stripe webhooks
              │ Astro (node      │──▶│ (API Store + Admin) │
              │ standalone):     │   └───────┬─────────────┘
              │ server islands,  │           │ eventos/colas
              │ carrito, checkout│   ┌───────▼─────────────┐
              └──────────────────┘   │ medusa-worker       │── Resend (emails)
                                     │ (subscribers, jobs, │── Meilisearch (indexado)
                                     │  workflows)         │── R2 (ficheros)
                                     └───────┬─────────────┘
                     ┌───────────────┬───────┴──────┬──────────────┐
                     │ PostgreSQL    │ Redis        │ Meilisearch  │
                     └───────────────┴──────────────┴──────────────┘
```

Puntos clave:

- **Medusa se despliega en dos procesos** con la misma imagen: `server` (`MEDUSA_WORKER_MODE=server`) y `worker` (`MEDUSA_WORKER_MODE=worker`, `DISABLE_MEDUSA_ADMIN=true`). Así los picos de tráfico no bloquean colas/emails/indexado.
- Medusa usa los módulos Redis oficiales: **event bus**, **workflow engine**, **locking** y **caché**.
- **Stripe**: proveedor de pagos oficial de Medusa (`@medusajs/medusa/payment-stripe`). Los webhooks van directos a `api.dominio/hooks/payment/stripe_stripe`.
- **R2**: proveedor de ficheros S3 de Medusa (`@medusajs/medusa/file-s3`) apuntando al endpoint de R2. Las imágenes se sirven por un dominio público propio de R2 (`img.dominio`) con caché de Cloudflare.
- **Meilisearch**: módulo/plugin de Medusa que indexa productos mediante subscribers (`product.created/updated/deleted`). El storefront consulta Meilisearch con una **search-only key** (nunca la master key).
- **Ficheros en local**: SeaweedFS expone una API S3 en `:8333`; el mismo provider `file-s3` sirve para local (SeaweedFS) y producción (R2) cambiando solo variables de entorno.
- **Emails**: plantillas en `packages/emails` (React Email), renderizadas en un **Notification Module Provider** propio de Medusa que envía por Resend. En local se previsualizan con `email dev`.
- **Storefront**: Astro genera HTML estático para catálogo, fichas, CMS y legal; un servidor Node (adapter `@astrojs/node`, modo standalone) atiende únicamente las **server islands** y las rutas dinámicas (carrito, checkout, cuenta).

## 2. Estrategia de rendimiento del frontend

Orden de preferencia **obligatorio** para cualquier pieza de UI:

1. **HTML estático prerenderizado** (`.astro`, o componente Svelte **sin** directiva `client:*`, que se renderiza a HTML sin enviar JS).
2. **Server island** (`server:defer`) para lo personalizado o volátil: precio por región, stock, contador del carrito, "hola, Juan". La página sigue siendo estática y cacheable; la isla se pide aparte con su propia caché corta.
3. **Ruta on-demand** (`export const prerender = false`) solo cuando la página entera es por usuario: carrito, checkout, cuenta.
4. **Isla Svelte en cliente**, en este orden de directivas: `client:visible` → `client:idle` → `client:media` → `client:load` (casi nunca). `client:only="svelte"` solo para lo que no puede renderizarse en servidor (p. ej. Stripe Payment Element).

Técnicas aplicadas:

- **Mejora progresiva**: añadir al carrito, buscar, filtrar y login funcionan con `<form>` + **Astro Actions** sin JS; la isla Svelte solo mejora la experiencia si se hidrata.
- **Cero JS por defecto**: presupuesto de JS por página (ver `AGENTS.md`). Home/listado/ficha: objetivo **0 KB** de JS propio en la carga inicial.
- **Web Workers**: scripts de terceros (analítica, píxeles) movidos a un worker con **Partytown**; cálculos pesados de cliente (filtros facetados grandes) en Web Workers propios.
- **Navegación instantánea**: `prefetch` de Astro (estrategia `hover`/`viewport`) + **Speculation Rules** para prerender de enlaces probables.
- **Imágenes**: `astro:assets` (`<Image>`/`<Picture>`) con AVIF/WebP, `width/height` explícitos, `loading="lazy"` salvo la imagen LCP (`fetchpriority="high"`). Originales en R2.
- **Fuentes**: Astro Fonts API, auto-alojadas, `font-display: swap`, subset y `preload` solo de la principal.
- **CSS**: Tailwind v4 (plugin Vite, configuración CSS-first con `@theme`). CSS crítico inline cuando Astro lo decida (`build.inlineStylesheets: 'auto'`).
- **Caché**: `/_astro/*` con `Cache-Control: public, max-age=31536000, immutable`; HTML estático con `s-maxage` en Cloudflare + purga en despliegue; server islands con `Cache-Control` corto (`s-maxage=30, stale-while-revalidate`).
- **Datos de catálogo en build**: se leen de la Store API de Medusa en `astro build`. Precio y stock **siempre** vía server island, así que el HTML estático no se queda desactualizado en lo crítico. Cambios de catálogo → subscriber en Medusa → webhook → CI reconstruye y despliega el storefront (con _debounce_).

## 3. Estructura del repositorio

Monorepo con **pnpm workspaces**:

```
web-ecommerce/
├── apps/
│   ├── backend/                 # Medusa v2 (API + Admin + worker)
│   │   ├── src/
│   │   │   ├── api/             # rutas custom (store/admin/hooks)
│   │   │   ├── modules/         # módulos propios (resend-notification, meilisearch…)
│   │   │   ├── subscribers/     # eventos → emails, indexado, rebuild storefront
│   │   │   ├── workflows/
│   │   │   ├── jobs/
│   │   │   └── admin/           # extensiones del Admin
│   │   ├── medusa-config.ts
│   │   └── Dockerfile
│   └── storefront/              # Astro 7
│       ├── src/
│       │   ├── pages/
│       │   ├── layouts/
│       │   ├── components/      # .astro (estático) y ui/ (shadcn-svelte)
│       │   ├── islands/         # componentes Svelte que se hidratan (client:*)
│       │   ├── actions/         # Astro Actions (carrito, auth…)
│       │   ├── lib/             # cliente Medusa (@medusajs/js-sdk), utils
│       │   └── styles/global.css
│       ├── astro.config.mjs
│       └── Dockerfile
├── packages/
│   ├── emails/                  # plantillas React Email (consumidas por backend)
│   └── config/                  # tsconfig/eslint/prettier compartidos
├── docker/
│   ├── compose.dev.yml          # SOLO infraestructura para desarrollo local
│   ├── compose.prod.yml         # stack completo para el VPS
│   ├── caddy/Caddyfile
│   ├── .env.example             # credenciales/puertos de la infra local (copiar a .env)
│   ├── monitoring/              # compose.homelab.yml (Kuma, Beszel hub, Dozzle, GlitchTip, cloudflared)
│   └── postgres/init/           # scripts init opcionales
├── .github/workflows/           # CI (Gitea Actions también los lee)
├── docs/fases/                  # prefase.md, fase0.md … faseN.md (qué se hizo y cómo testearlo)
├── .pi/mcp.json                 # MCPs de documentación del proyecto (sin secretos)
├── .node-version                # versión de Node para fnm (24.21.0)
├── .npmrc
├── pnpm-workspace.yaml
├── package.json
├── .env.example
├── AGENTS.md
└── README.md
```

## 4. Versiones fijadas

Verificadas el **30-sep-2026** en npm, Docker Hub y nodejs.org. **Son la fuente de verdad**: cualquier cambio de versión se hace en un PR `chore(deps): …` que actualice esta tabla.

Política:

- `package.json`: versiones **exactas** (sin `^` ni `~`). `saveExact: true` en `pnpm-workspace.yaml`.
- Imágenes Docker: tag **completo** `x.y.z` (nunca `latest`, ni en dev).
- Actualizaciones mediante **Renovate** (PRs agrupados por familia: medusa, astro, svelte, tailwind, react-email, imágenes docker).
- Todos los paquetes `@medusajs/*` en la **misma** versión. Todos los `@tailwindcss/*` igual que `tailwindcss`.

### 4.1 Sistema y herramientas (host)

| Herramienta             | Versión     | Dónde se fija                           |
| ----------------------- | ----------- | --------------------------------------- |
| Node.js (LTS "Krypton") | **24.21.0** | `.node-version` (fnm) y `engines`       |
| pnpm                    | **12.8.1**  | `packageManager` en `package.json` raíz |
| fnm                     | 1.39.0      | host                                    |
| Docker Engine           | 29.8.1      | host / VPS                              |
| Docker Compose          | 5.5.1       | host / VPS                              |
| git                     | 2.55.0      | host                                    |
| Gitea                   | 1.27.3      | servidor Gitea                          |
| Gitea act_runner        | 0.6.1       | `gitea/act_runner:0.6.1`                |

### 4.2 Imágenes Docker

| Servicio                | Imagen                            | Uso                                                               |
| ----------------------- | --------------------------------- | ----------------------------------------------------------------- |
| Node (base Dockerfiles) | `node:24.21.0-alpine3.24`         | build y runtime de backend y storefront                           |
| PostgreSQL              | `postgres:17.9-alpine`            | dev + prod                                                        |
| Redis                   | `redis:8.8.3-alpine`              | dev + prod                                                        |
| Meilisearch             | `getmeili/meilisearch:v1.54.2`    | dev + prod                                                        |
| Caddy                   | `caddy:2.11.4-alpine`             | prod                                                              |
| SeaweedFS (S3 local)    | `chrislusf/seaweedfs:4.48`        | solo dev (en prod → Cloudflare R2)                                |
| Mailpit                 | `axllent/mailpit:v1.31.3`         | solo dev                                                          |
| Stripe CLI              | `stripe/stripe-cli:v1.52.1`       | solo dev (webhooks)                                               |
| Uptime Kuma             | `louislam/uptime-kuma:2.5.5`      | monitorización · homelab                                          |
| Beszel hub              | `henrygd/beszel:0.20.0`           | monitorización · homelab                                          |
| Beszel agent            | `henrygd/beszel-agent:0.20.0`     | monitorización · VPS Hetzner (y homelab)                          |
| Dozzle                  | `amir20/dozzle:v11.1.3`           | logs · homelab (UI) + VPS (modo agent)                            |
| GlitchTip               | `glitchtip/glitchtip:6.2.6`       | errores de aplicación · homelab                                   |
| cloudflared             | `cloudflare/cloudflared:2026.9.3` | túnel para exponer GlitchTip/Beszel del homelab sin abrir puertos |

> MinIO se descarta: ha dejado de publicar imágenes en Docker Hub.

### 4.3 Paquetes (instalados con pnpm)

> Se instalan **siempre con pnpm**. Las versiones son las publicadas en el registro público de paquetes JavaScript (registry.npmjs.org), del que pnpm también descarga; `npm` como herramienta no se usa nunca.

| Paquete                                                                                                                   | Versión    | App                                               |
| ------------------------------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------- |
| `@medusajs/medusa`, `@medusajs/framework`, `@medusajs/cli`, `@medusajs/admin-sdk`, `@medusajs/test-utils`                 | **2.21.2** | backend                                           |
| `create-medusa-app`                                                                                                       | 2.21.2     | scaffolding                                       |
| `@medusajs/js-sdk`, `@medusajs/types`                                                                                     | 2.21.2     | storefront                                        |
| `astro`                                                                                                                   | **7.3.5**  | storefront                                        |
| `@astrojs/svelte`                                                                                                         | 9.0.1      | storefront                                        |
| `@astrojs/node`                                                                                                           | 11.1.6     | storefront                                        |
| `@astrojs/partytown`                                                                                                      | 2.1.8      | storefront                                        |
| `@astrojs/sitemap`                                                                                                        | 3.7.4      | storefront                                        |
| `svelte`                                                                                                                  | **5.57.1** | storefront                                        |
| `tailwindcss`, `@tailwindcss/vite`                                                                                        | **4.3.3**  | storefront                                        |
| `shadcn-svelte` (CLI)                                                                                                     | 1.7.0      | storefront (dev)                                  |
| `bits-ui`                                                                                                                 | 2.19.3     | storefront                                        |
| `@stripe/stripe-js`                                                                                                       | 9.17.0     | storefront                                        |
| `meilisearch` (cliente JS)                                                                                                | 0.62.0     | storefront + backend                              |
| `stripe` (Node)                                                                                                           | 22.6.2     | backend (si se usa fuera del provider oficial)    |
| `resend`                                                                                                                  | 6.31.0     | backend                                           |
| `react-email` (CLI preview)                                                                                               | 6.11.0     | emails (dev)                                      |
| `@react-email/components`                                                                                                 | 1.0.12     | emails                                            |
| `@react-email/render`                                                                                                     | 2.1.0      | emails / backend                                  |
| `typescript`                                                                                                              | **6.0.3**  | todo el monorepo                                  |
| `vitest`                                                                                                                  | 5.0.3      | tests                                             |
| `@playwright/test`                                                                                                        | 1.63.0     | e2e                                               |
| `eslint` 10.11.0 · `@eslint/js` 10.0.1 · `typescript-eslint` 8.71.0 · `eslint-config-prettier` 10.1.8 · `globals` 17.12.0 | —          | `packages/config` (lint)                          |
| `prettier`                                                                                                                | 3.9.9      | `packages/config` (formato)                       |
| `@types/node`                                                                                                             | 24.9.2     | raíz (alineado con Node 24)                       |
| `@sentry/node` _(propuesto, fase 12)_                                                                                     | 11.1.0     | backend → envía errores a GlitchTip               |
| `@sentry/astro` _(propuesto, fase 12)_                                                                                    | 11.1.0     | storefront, **solo servidor** (sin JS de cliente) |

> **TypeScript 7 no se usa todavía**: Astro y Medusa declaran `typescript ^5 \|\| ^6`.
> **Astro 7** requiere `@astrojs/node` ≥ 11 y `@astrojs/svelte` ≥ 9 (`@astrojs/node` 9.x y `@astrojs/svelte` 8.x son para Astro 6).

## 5. MCPs de documentación para agentes

Los agentes (pi) consultan documentación **actualizada** a través de servidores MCP en lugar de fiarse de su memoria. Están en dos ficheros:

**`.pi/mcp.json`** (en el repo, sin secretos, solo documentación pública):

| Servidor           | URL                                    | Cubre                                      |
| ------------------ | -------------------------------------- | ------------------------------------------ |
| `astro-docs`       | `https://mcp.docs.astro.build/mcp`     | Astro 7                                    |
| `svelte`           | `https://mcp.svelte.dev/mcp`           | Svelte 5 (docs + autofixer de componentes) |
| `cloudflare-docs`  | `https://docs.mcp.cloudflare.com/mcp`  | R2, DNS, WAF, Origin CA, Cache             |
| `meilisearch-docs` | `https://www.meilisearch.com/docs/mcp` | Meilisearch                                |
| `resend-docs`      | `https://resend.com/docs/mcp`          | Resend                                     |

**`~/.pi/agent/mcp.json`** (personal, fuera del repo):

| Servidor   | URL                            | Cubre                                                                                                                                |
| ---------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| `context7` | `https://mcp.context7.com/mcp` | **Medusa v2** (`/medusajs/medusa`), Tailwind v4, shadcn-svelte, React Email, Caddy, PostgreSQL, Redis, SeaweedFS, pnpm, Stripe docs… |
| `stripe`   | `https://mcp.stripe.com`       | Búsqueda en docs de Stripe + herramientas sobre la cuenta (requiere login)                                                           |

**Medusa**: su MCP oficial (`docs.medusajs.com/mcp`) exige login con cuenta Medusa Cloud, así que **no se usa**. Alternativas: Context7 (`/medusajs/medusa`) y `https://docs.medusajs.com/llms-full.txt` (consultable con `curl`).

### 5.1 Activar los MCPs

```bash
cd ~/Proyectos/web-ecommerce
pi                 # la primera vez pregunta si confías en el proyecto → sí (necesario para leer .pi/mcp.json)
pi mcp list        # todos deben aparecer "connected" salvo stripe ("needs sign-in")
```

Dentro de una sesión: `/mcp` abre el gestor de servidores y `/reload` reconecta tras cambios.

**Context7 (opcional, más cuota)**: crea una API key en context7.com y añade en `~/.pi/agent/mcp.json`:

```json
"context7": { "url": "https://mcp.context7.com/mcp", "headers": { "CONTEXT7_API_KEY": "${CONTEXT7_API_KEY}" } }
```

y exporta `CONTEXT7_API_KEY` en tu shell (si la variable no existe, el servidor falla al arrancar).

### 5.2 Login en Stripe MCP

El MCP de Stripe usa **OAuth**:

```bash
pi mcp login stripe          # o /mcp login stripe dentro de pi
```

1. Se abre el navegador en `access.stripe.com`.
2. Inicia sesión y, **muy importante, selecciona la cuenta/entorno de PRUEBAS (sandbox/test mode)**. Nunca autorices la cuenta live.
3. Aprueba el acceso. pi guarda el token en `~/.pi/agent/mcp-auth.json` y lo refresca solo.
4. `pi mcp list` → `stripe: connected`. Luego `/reload` en la sesión abierta.

Para desconectar: `pi mcp logout stripe`. Si trabajas por SSH sin navegador, pega en pi la URL a la que te redirige el navegador tras aprobar.

**Alternativa sin OAuth (más control)**: crea en el Dashboard de Stripe (modo test) una **restricted key** `rk_test_…` de solo lectura y úsala como cabecera:

```json
"stripe": { "url": "https://mcp.stripe.com", "headers": { "Authorization": "Bearer ${STRIPE_MCP_KEY}" } }
```

Reglas: la cuenta **live** de Stripe **nunca** se conecta al MCP; las claves live solo existen en los secrets del VPS/CI.

## 6. Requisitos previos

- **fnm** con integración en la shell (cambio automático de versión al entrar al directorio):
  ```bash
  # ~/.bashrc o ~/.zshrc
  eval "$(fnm env --use-on-cd --version-file-strategy=recursive)"
  ```
- **Node 24.21.0** (vía fnm, ver `.node-version`).
- **pnpm 12.8.1** (el proyecto fija la versión en `packageManager`).
- **Docker** + **Docker Compose v2**.
- **Stripe CLI**: no se instala; se usa como contenedor.
- Cuentas: Stripe (modo test para desarrollo; live solo en producción), Resend, Cloudflare (R2 + DNS).

## 7. Crear el repositorio (Gitea + GitHub)

### 7.1 SSH para Gitea en el puerto 2222

`~/.ssh/config`:

```sshconfig
Host *
    AddKeysToAgent yes

Host gitea
    HostName git.hirokobu.duckdns.org
    Port 2222
    User git
    IdentityFile ~/.ssh/id_ed25519
    IdentitiesOnly yes

Host github.com
    User git
    IdentityFile ~/.ssh/id_ed25519
    IdentitiesOnly yes
```

**Clave con passphrase → ssh-agent** (la passphrase **nunca** se guarda en `.env` ni en ningún fichero):

```bash
systemctl --user enable --now ssh-agent.socket          # agente como servicio de usuario
# en ~/.zshenv:
export SSH_AUTH_SOCK="$XDG_RUNTIME_DIR/ssh-agent.socket"
# una vez por sesión de escritorio (pide la passphrase):
ssh-add ~/.ssh/id_ed25519
```

Los agentes de IA (pi) heredan `SSH_AUTH_SOCK` y usan la clave ya desbloqueada sin conocer la passphrase.

Prueba (verificada el 30-sep-2026 ✅):

```bash
ssh -T gitea            # Hi there, jacknoddy! …
ssh -T git@github.com   # Hi elrincondehiro! …
```

### 7.2 Inicializar

```bash
cd ~/Proyectos/web-ecommerce
git init -b main
echo "24.21.0" > .node-version
fnm install && fnm use
```

### 7.3 Remotos (flexibilidad Gitea ↔ GitHub)

Repos vacíos ya creados (verificado con `git ls-remote`):

| Plataforma      | Usuario          | URL SSH                                           |
| --------------- | ---------------- | ------------------------------------------------- |
| Gitea (homelab) | `jacknoddy`      | `gitea:jacknoddy/web-ecommerce.git`               |
| GitHub          | `elrincondehiro` | `git@github.com:elrincondehiro/web-ecommerce.git` |

```bash
# Remotos individuales
git remote add gitea  gitea:jacknoddy/web-ecommerce.git
git remote add github git@github.com:elrincondehiro/web-ecommerce.git

# Remoto "origin" que hace fetch de Gitea y push a AMBOS
git remote add origin gitea:jacknoddy/web-ecommerce.git
git remote set-url --add --push origin gitea:jacknoddy/web-ecommerce.git
git remote set-url --add --push origin git@github.com:elrincondehiro/web-ecommerce.git

git remote -v
```

- `git push origin <rama>` publica en los dos.
- `git push gitea` / `git push github` para uno solo.
- La fuente de verdad para _fetch/pull_ se elige cambiando la URL de fetch de `origin`.
- Alternativa: **mirror push** desde Gitea (Ajustes del repo → Mirror → Push mirror a GitHub).

Los workflows viven en `.github/workflows/`: **Gitea Actions los ejecuta también** (usa `.gitea/workflows/` si existe y si no `.github/workflows/`). Así un único CI sirve en ambas plataformas. El registro destino se decide con variables del repo (`REGISTRY`, `IMAGE_NAMESPACE`) — ver §10.

### 7.4 Protección de `main`

Objetivo en ambas plataformas: `main` solo cambia vía PR, con CI en verde, sin push directo ni force-push ni borrado.

- **Gitea** ✅ configurado: _Ajustes del repo → Ramas → Protección de rama_ sobre `main`.
- **GitHub** ✅ configurado con **Rulesets** (sustituyen a la antigua "branch protection"): _Settings → Rules → Rulesets → New branch ruleset_:
  - Enforcement: **Active** · Target: **Include default branch** · Bypass list vacía (o solo _Repository admin_).
  - ✅ Restrict deletions · ✅ Block force pushes · ✅ Require linear history.
  - ✅ Require a pull request before merging (approvals = 0 si trabajas solo).
  - ✅ Require status checks to pass → **los checks se añaden al terminar la fase 1 (CI básico)**: solo aparecen tras la primera ejecución del workflow.
  - _Settings → General → Pull Requests_: solo _Allow squash merging_ + _Automatically delete head branches_.

> **Orden del primer push:** la protección exige PR, así que el commit inicial de la fase 0 se hace directamente sobre `main` **una sola vez** (repo vacío; puede requerir desactivar temporalmente la regla o usar el bypass de admin). Desde ahí, todo por PR.

## 8. Instalación y arranque en local

### 8.1 Ficheros raíz

Implementados en la **fase 0** — ver [`docs/fases/fase0.md`](./docs/fases/fase0.md) para el detalle y las decisiones:

| Fichero                                   | Contenido                                                                                                                                                                                                              |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `package.json`                            | `packageManager: pnpm@12.8.1`, `engines` (Node 24.21.0 / pnpm 12.8.1), scripts `infra:*`, `lint`, `format`, `typecheck`, `test`, `build`                                                                               |
| `pnpm-workspace.yaml`                     | workspaces, `saveExact`, `engineStrict`, `publicHoistPattern` (requisito Medusa), `allowBuilds`                                                                                                                        |
| `.npmrc`                                  | `public-hoist-pattern[]` exigido por la **doc oficial de Medusa**. pnpm ≥ 11 solo lee auth/registry de `.npmrc`, por eso los mismos patrones están también en `pnpm-workspace.yaml` (**mantener ambos sincronizados**) |
| `.node-version`                           | `24.21.0` (fnm)                                                                                                                                                                                                        |
| `eslint.config.js` / `prettier.config.js` | reexportan `packages/config`                                                                                                                                                                                           |
| `renovate.json`                           | grupos por familia, `rangeStrategy: pin`, sin majors de Node/TS                                                                                                                                                        |

### 8.2 Infraestructura con Docker (antes de instalar nada más)

Ningún servicio (Postgres, Redis, Meilisearch…) se instala en el host: todo corre en contenedores definidos en [`docker/compose.dev.yml`](./docker/compose.dev.yml) (tags de §4.2, puertos publicados solo en `127.0.0.1`).

```bash
cp docker/.env.example docker/.env    # credenciales de EJEMPLO (solo dev) y puertos
pnpm install
pnpm infra:up                         # espera a que todo esté healthy (--wait)
pnpm infra:ps
```

- **SeaweedFS** usa `weed mini` (master + volume + filer + S3 + admin UI en un proceso). Credenciales y bucket `medusa` se crean al arrancar desde `docker/.env`. Lectura pública del bucket (una vez):
  ```bash
  docker compose --env-file docker/.env -f docker/compose.dev.yml exec -T seaweedfs \
    weed shell <<< "s3.anonymous.set -bucket medusa -access Read,List"
  ```
- **Conflicto de puertos** con otro proyecto local: cambia `POSTGRES_PORT`, `REDIS_PORT`, `MEILI_PORT`… en `docker/.env`.
- **Stripe CLI** solo con `pnpm infra:stripe` (requiere `STRIPE_API_KEY=sk_test_…` en `docker/.env`).

### 8.3 Backend (Medusa v2)

```bash
mkdir -p apps packages
# Revisa flags actuales: pnpm dlx create-medusa-app@2.21.2 --help
pnpm dlx create-medusa-app@2.21.2 backend \
  --directory-path apps \
  --db-url "postgres://medusa:medusa@localhost:5432/medusa" \
  --no-browser
# Rechaza el starter de Next.js (la tienda es Astro).
cd apps/backend
rm -f package-lock.json yarn.lock      # solo pnpm
```

Ajustes:

- `package.json` → `"name": "backend"`.
- Fijar todos los `@medusajs/*` a `2.21.2` exactos.
- `.env` (ver §14): `DATABASE_URL`, `REDIS_URL`, `STORE_CORS=http://localhost:4321`, `ADMIN_CORS`, `AUTH_CORS`, `JWT_SECRET`, `COOKIE_SECRET`, Stripe, S3/R2, Meilisearch, Resend.
- `medusa-config.ts` → registrar módulos Redis (event bus, workflow engine, locking, cache), `payment-stripe`, `file-s3`, notificación Resend y Meilisearch (las fases del roadmap los van añadiendo).

```bash
pnpm install                     # desde la raíz del monorepo
pnpm --filter backend exec medusa db:migrate
pnpm --filter backend exec medusa user -e admin@local.test -p supersecret
pnpm dev:backend                 # API http://localhost:9000 · Admin http://localhost:9000/app
```

En el Admin: crear región (EUR), canal de venta y **Publishable API Key** → copiarla a `apps/storefront/.env` como `PUBLIC_MEDUSA_PUBLISHABLE_KEY`.

### 8.4 Storefront (Astro 7 + Svelte 5 + Tailwind v4 + shadcn-svelte)

```bash
cd ~/Proyectos/web-ecommerce
pnpm create astro@latest apps/storefront -- --template minimal --no-install --no-git
cd apps/storefront
# package.json → "name": "storefront"
pnpm add astro@7.3.5 @astrojs/svelte@9.0.1 @astrojs/node@11.1.6 \
  @astrojs/partytown@2.1.8 @astrojs/sitemap@3.7.4 svelte@5.57.1 \
  tailwindcss@4.3.3 @tailwindcss/vite@4.3.3 bits-ui@2.19.3 \
  @medusajs/js-sdk@2.21.2 @medusajs/types@2.21.2
pnpm add -D typescript@6.0.3
pnpm dlx shadcn-svelte@1.7.0 init        # requiere alias $lib → ver abajo
```

- Alias `$lib` para shadcn-svelte: en `tsconfig.json` → `"paths": { "$lib/*": ["./src/lib/*"] }` y en `astro.config.mjs` → `vite.resolve.alias`.
- `astro.config.mjs` (esqueleto orientativo; se valida contra `astro-docs` MCP en la fase 3):
  ```js
  import { defineConfig } from "astro/config";
  import svelte from "@astrojs/svelte";
  import node from "@astrojs/node";
  import partytown from "@astrojs/partytown";
  import sitemap from "@astrojs/sitemap";
  import tailwindcss from "@tailwindcss/vite";

  export default defineConfig({
    site: "https://tienda.tudominio.com",
    output: "static", // estático por defecto; on-demand solo donde se indique
    adapter: node({ mode: "standalone" }),
    integrations: [svelte(), partytown({ config: { forward: ["dataLayer.push"] } }), sitemap()],
    prefetch: { prefetchAll: false, defaultStrategy: "hover" },
    build: { inlineStylesheets: "auto" },
    image: { domains: ["img.tudominio.com", "localhost"] },
    vite: { plugins: [tailwindcss()] },
  });
  ```

```bash
pnpm dev:storefront              # http://localhost:4321
```

### 8.5 Emails (React Email)

```bash
mkdir -p packages/emails && cd packages/emails
pnpm init                        # "name": "emails"
pnpm add react react-dom @react-email/components@1.0.12 @react-email/render@2.1.0
pnpm add -D react-email@6.11.0 @types/react typescript@6.0.3
# scripts: "dev": "email dev --dir src --port 3001"
pnpm dev:emails                  # previsualización en http://localhost:3001
```

El backend depende de `"emails": "workspace:*"` y renderiza con `render()` antes de enviar vía Resend.

### 8.6 Todo junto

```bash
pnpm infra:up
pnpm dev                          # backend :9000 + storefront :4321
pnpm infra:stripe                                    # webhooks Stripe (perfil opcional)
```

| Servicio            | URL local                 |
| ------------------- | ------------------------- |
| Storefront          | http://localhost:4321     |
| Medusa API          | http://localhost:9000     |
| Medusa Admin        | http://localhost:9000/app |
| Meilisearch         | http://localhost:7700     |
| SeaweedFS S3 API    | http://localhost:8333     |
| SeaweedFS admin UI  | http://localhost:23646    |
| Mailpit             | http://localhost:8025     |
| React Email preview | http://localhost:3001     |

## 9. Comandos habituales

```bash
pnpm infra:up | infra:down | infra:ps | infra:logs | infra:stripe
pnpm dev | dev:backend | dev:storefront | dev:emails
pnpm lint && pnpm typecheck && pnpm test && pnpm build
pnpm --filter backend exec medusa db:generate <modulo>   # migraciones de módulos propios
pnpm --filter backend exec medusa db:migrate
pnpm --filter storefront build && pnpm --filter storefront preview
```

## 10. Flujo de Git, CI e imágenes

```
feat/*, fix/*, chore/*  ──PR──▶  CI (lint · typecheck · test · build · lighthouse)  ──verde──▶  merge (squash) a main
                                                                                         │
                                          main  ──▶ build & push imágenes  :sha-<7 chars>  (+ :main)
                                          tag v1.2.3 ──▶ build & push  :1.2.3  :1.2  :latest   → desplegable
```

- **Ramas**: `feat/<descripcion-corta>`, `fix/…`, `chore/…`, `docs/…`. Nunca commits directos a `main`.
- **Commits**: [Conventional Commits](https://www.conventionalcommits.org/) (`feat(storefront): …`).
- **Versionado**: SemVer. Release = `git tag -a v1.2.3 -m "v1.2.3" && git push origin v1.2.3`.
- **Workflows** (`.github/workflows/`):
  - `ci.yml` — en `pull_request`: `pnpm install --frozen-lockfile`, lint, typecheck, test, build, presupuesto de JS y Lighthouse CI sobre el storefront.
  - `images.yml` — en `push` a `main` y tags `v*.*.*`: build multi-stage con Buildx y push usando `docker/metadata-action`:
    ```yaml
    tags: |
      type=sha,prefix=sha-,format=short
      type=raw,value=main,enable={{is_default_branch}}
      type=semver,pattern={{version}}
      type=semver,pattern={{major}}.{{minor}}
      type=raw,value=latest,enable=${{ startsWith(github.ref, 'refs/tags/v') }}
    ```
  - `deploy.yml` (opcional) — en tag: SSH al VPS y `docker compose pull && up -d`.
- **Registro configurable** mediante variables del repo:

  | Plataforma | `REGISTRY`          | Imagen                                          |
  | ---------- | ------------------- | ----------------------------------------------- |
  | Gitea      | `git.tudominio.com` | `git.tudominio.com/<usuario>/ecommerce-backend` |
  | GitHub     | `ghcr.io`           | `ghcr.io/<usuario>/ecommerce-backend`           |

  Secrets: `REGISTRY_USER`, `REGISTRY_TOKEN`. (El registro de Gitea funciona por HTTPS, no por el puerto SSH 2222.)

- Imágenes publicadas: `ecommerce-backend` (server y worker usan la misma) y `ecommerce-storefront`.

## 11. Despliegue en el VPS

- `docker/compose.prod.yml`: `caddy`, `backend-server`, `backend-worker`, `storefront`, `postgres`, `redis`, `meilisearch`. Solo Caddy expone puertos (80/443); el resto en red interna.
- Imágenes referenciadas como `${REGISTRY}/${IMAGE_NAMESPACE}/ecommerce-backend:${IMAGE_TAG}` → se decide en el `.env` del VPS desde dónde se hace pull (Gitea o GHCR) y qué versión.
- **Cloudflare**: proxy activado, SSL **Full (strict)** con **Origin CA certificate** montado en Caddy; firewall del VPS permitiendo 80/443 solo desde rangos IP de Cloudflare; `trusted_proxies` de Caddy con esos rangos para obtener la IP real (`CF-Connecting-IP`).
- **Migraciones**: el contenedor `backend-server` ejecuta `medusa db:migrate` antes de `medusa start` (el worker no migra).
- Despliegue manual:
  ```bash
  ssh vps
  cd /opt/web-ecommerce
  sed -i 's/^IMAGE_TAG=.*/IMAGE_TAG=1.2.3/' .env
  docker compose -f compose.prod.yml pull
  docker compose -f compose.prod.yml up -d
  ```
- Alternativa "build en el VPS": `git pull` desde Gitea/GitHub y `docker compose -f compose.prod.yml build` (los Dockerfiles lo soportan igual).
- **Backups**: `pg_dump` diario (contenedor/cron) a R2, retención 14 días; snapshot de Meilisearch opcional (se puede reindexar).
- **Hetzner**: activar el **Firewall de Hetzner Cloud** (80/443 solo desde rangos de Cloudflare; SSH solo desde tu IP/homelab) y los backups/snapshots del proveedor como segunda capa.

## 12. Monitorización

Modelo **híbrido autoalojado en dos máquinas**: el VPS de la tienda solo ejecuta **agentes ligeros**; los paneles, el histórico y las **alertas viven en el homelab**. Así, si el VPS cae, el homelab lo detecta y avisa (un monitor en la misma máquina que vigila no sirve).

```
  HOMELAB (junto a Gitea)                                  VPS HETZNER (ecommerce)
 ┌───────────────────────────────────────┐              ┌────────────────────────────────────┐
 │ Uptime Kuma ── HTTP/keyword/TLS ─────────────────────────▶ tienda / api / admin (vía Cloudflare)│
 │ Beszel hub   ◀── WebSocket (saliente) ─────────────── beszel-agent (host + contenedores)  │
 │ Dozzle (UI)  ─── red privada (Tailscale/WireGuard) ──▶ dozzle agent (logs Docker)          │
 │ GlitchTip    ◀── HTTPS (túnel Cloudflare) ─────────── Medusa + Astro SSR (SDK Sentry)     │
 │   └ Postgres + Valkey propios          │              │                                      │
 │ Alertas → Telegram / email            │              │ /health de Medusa y storefront      │
 └───────────────────────────────────────┘              └────────────────────────────────────┘
        ▲ vigilante externo del homelab: UptimeRobot / Healthchecks.io (gratis) → ¿quién vigila al vigilante?
```

| Necesidad                                                                                | Herramienta                                     | Dónde                                     | RAM aprox.                |
| ---------------------------------------------------------------------------------------- | ----------------------------------------------- | ----------------------------------------- | ------------------------- |
| Disponibilidad (tienda, API, admin, certificado, tiempo de respuesta) + página de estado | **Uptime Kuma** 2.5.5                           | homelab                                   | ~150 MB                   |
| Métricas de host y contenedores (CPU, RAM, disco, red), histórico y alertas              | **Beszel** 0.20.0 (hub + agent)                 | hub: homelab · agent: VPS y homelab       | hub ~50 MB · agent ~15 MB |
| Logs de contenedores en vivo                                                             | **Dozzle** v11.1.3                              | UI: homelab · agent: VPS                  | ~30 MB por nodo           |
| Errores de aplicación (traza, release, usuario afectado)                                 | **GlitchTip** 6.2.6 (API compatible con Sentry) | homelab (con su propio Postgres + Valkey) | ~500 MB–1 GB              |
| Heartbeats de jobs (backup diario, rebuild)                                              | Uptime Kuma (monitor _push_)                    | homelab                                   | —                         |
| Vigilar al homelab                                                                       | UptimeRobot o Healthchecks.io (free)            | externo                                   | —                         |

**Impacto en el VPS Hetzner: ~50 MB de RAM** (beszel-agent + dozzle agent). Nada se publica a Internet desde el VPS por la monitorización.

### 12.1 Conectividad entre homelab y VPS

El homelab está detrás de un router doméstico (DuckDNS). Dos necesidades:

1. **VPS → homelab** (Beszel agent y SDK de errores empujan datos): exponer **Beszel hub** y **GlitchTip** con **Cloudflare Tunnel** (`cloudflared`, sin abrir puertos en el router) en subdominios propios (p. ej. `status.`, `errors.`, `metrics.`), protegidos con **Cloudflare Access** salvo los endpoints de ingesta.
2. **Homelab → VPS** (Dozzle UI lee logs del agente): **red privada** entre ambas máquinas — **Tailscale** (más simple) o **WireGuard** (sin terceros). El agente de Dozzle solo escucha en la interfaz privada.

> Decisión pendiente antes de la fase 12: **Tailscale o WireGuard**.

### 12.2 Integración con la aplicación

- Medusa y el storefront exponen endpoints de salud (`/health`) que vigila Uptime Kuma.
- Errores: `@sentry/node` en Medusa y `@sentry/astro` en el storefront **solo en servidor** (no se envía SDK al navegador para no romper el presupuesto de 0 KB JS). DSN apuntando a GlitchTip. _(Dependencias propuestas; requieren aprobación al llegar a la fase.)_
- Alertas: Telegram (bot) y email (Resend/SMTP) desde Uptime Kuma, Beszel y GlitchTip.
- Ficheros: `docker/monitoring/compose.homelab.yml` (Kuma, Beszel hub, Dozzle, GlitchTip, cloudflared) y servicios `beszel-agent` + `dozzle-agent` dentro de `compose.prod.yml`.

## 13. Plan de trabajo (roadmap)

El CI básico se **adelanta a la fase 1** para que todos los PR estén protegidos desde el principio. La publicación de imágenes (CD) queda en la fase 10.

Cada fase tiene su propio documento en [`docs/fases/`](./docs/fases/) con objetivos, qué se hizo, decisiones y **comandos para testearla**. Este README solo mantiene la visión general.

| Fase                                   | Documento                                                                                        | Estado |
| -------------------------------------- | ------------------------------------------------------------------------------------------------ | ------ |
| Prefase (SSH, repos, MCPs, decisiones) | [prefase.md](./docs/fases/prefase.md)                                                            | ✅     |
| 0 Fundaciones                          | [fase0.md](./docs/fases/fase0.md)                                                                | 🚧     |
| 1 … 13                                 | `faseN.md` (se crea al iniciar cada fase, a partir de [PLANTILLA.md](./docs/fases/PLANTILLA.md)) | ⏳     |

### 13.1 Vista general

```
Semana →               1    2    3    4    5    6    7    8    9    10   11
 0 Fundaciones         ██
 1 CI básico (PR)       █
 2 Backend base          ██
 3 Storefront base          █████
 4 Carrito                        ████
 5 Checkout + Stripe                  █████
 6 Ficheros R2                  ██              (en paralelo con 3–4)
 7 Búsqueda                                ████
 8 Emails                                      ███
 9 Cuenta de cliente                              ████
10 CD: imágenes + Docker                  ████      (en paralelo, cuando haya apps)
11 Producción (Hetzner)                               ████
12 Monitorización                                        ████
13 Optimización continua                                     ░░░░░░░░
                                                        ▲ v1.0.0
```

```mermaid
gantt
    title Roadmap web-ecommerce (días efectivos, estimación)
    dateFormat  X
    axisFormat  d%s
    section Base
    0 Fundaciones          :f0, 0, 2d
    1 CI básico (PR)       :f1, after f0, 1d
    2 Backend base         :f2, after f1, 2d
    section Tienda
    3 Storefront base      :f3, after f2, 6d
    6 Ficheros R2          :f6, after f2, 2d
    4 Carrito              :f4, after f3, 4d
    5 Checkout + Stripe    :f5, after f4, 6d
    7 Búsqueda             :f7, after f5, 4d
    8 Emails               :f8, after f7, 3d
    9 Cuenta de cliente    :f9, after f8, 4d
    section Operación
    10 CD imágenes+Docker  :f10, after f5, 4d
    11 Producción          :f11, after f9, 4d
    12 Monitorización      :f12, after f11, 4d
```

### 13.2 Detalle por fase

**Tiempo** = días de trabajo efectivo (1 desarrollador + agente de IA) **incluyendo tests**. No incluye tiempos de revisión/espera del usuario. Son estimaciones.

| #   | Fase                         | Qué hace                                                                                                                                                                                                                                                                   | Tiempo    | Test / criterio de salida                                                                           | Coste servicios                                      |
| --- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | --------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| 0   | **Fundaciones**              | Monorepo pnpm, `.node-version`, `.npmrc`, `compose.dev.yml` (Postgres, Redis, Meilisearch, SeaweedFS, Mailpit, Stripe CLI), bucket local, ESLint/Prettier/TS compartidos, Renovate, `.gitignore`, remotos Gitea+GitHub, primer push                                        | 1–2 d     | `pnpm infra:up` + `pnpm install` limpios; push en ambos remotos                                     | 0 €                                                  |
| 1   | **CI básico (PR)**           | `ci.yml`: install `--frozen-lockfile` → lint → typecheck → test → build. Runner de Gitea (`act_runner`) en el homelab + GitHub Actions. Añadir los checks como obligatorios en Gitea y en el ruleset de GitHub                                                             | 1 d       | Un PR de prueba bloqueado si falla un check y mergeable si pasa, en **ambas** plataformas           | 0 €                                                  |
| 2   | **Backend base**             | Medusa 2.21.2, módulos Redis (event bus, workflow engine, locking, caché), admin, región EUR, canal, publishable key, seed                                                                                                                                                 | 1–2 d     | Admin operativo; Store API responde; CI verde                                                       | 0 €                                                  |
| 3   | **Storefront base**          | Astro 7 + Svelte 5 + Tailwind 4 + shadcn-svelte, layout, home, listado y ficha **estáticos**, precio/stock en server island, SEO (meta, JSON-LD, sitemap), fuentes e imágenes                                                                                              | 4–6 d     | Lighthouse móvil ≥ 95; **0 KB JS** propio en ficha                                                  | 0 €                                                  |
| 4   | **Carrito**                  | Cookie `cart_id` httpOnly, Astro Actions sin JS (añadir/actualizar/quitar), contador en server island, mejora progresiva                                                                                                                                                   | 3–4 d     | Playwright **con JS desactivado**                                                                   | 0 €                                                  |
| 5   | **Checkout + Stripe**        | Checkout on-demand, direcciones, envío, Payment Element (`client:only`), webhooks idempotentes, creación de pedido                                                                                                                                                         | 4–6 d     | Pago test extremo a extremo; reenvío de webhook sin duplicados                                      | 0 € (test)                                           |
| 6   | **Ficheros R2**              | `file-s3` con SeaweedFS (local) / R2 (prod), dominio público de imágenes, `astro:assets` AVIF/WebP                                                                                                                                                                         | 1–2 d     | Subida desde Admin visible en tienda optimizada                                                     | R2: 10 GB gratis, luego $0.015/GB-mes, egress gratis |
| 7   | **Búsqueda**                 | Indexado Meilisearch vía subscribers, search-only key, `/buscar` SSR sin JS + autocompletado `client:idle`                                                                                                                                                                 | 3–4 d     | < 50 ms; funciona sin JS                                                                            | 0 €                                                  |
| 8   | **Emails**                   | `packages/emails` (React Email), provider Resend, pedido / envío / reset password, texto plano                                                                                                                                                                             | 2–3 d     | Preview + envío test (Mailpit/Resend)                                                               | Resend Free (100/día, 3.000/mes) → Pro ≈ $20/mes     |
| 9   | **Cuenta de cliente**        | Registro, login, pedidos, direcciones (on-demand, cookies httpOnly)                                                                                                                                                                                                        | 3–4 d     | e2e de registro/login/pedidos                                                                       | 0 €                                                  |
| 10  | **CD: imágenes + Docker**    | Dockerfiles multi-stage (backend, storefront), `images.yml` (`sha-xxxxxxx` en main, `x.y.z` en tag), registro Gitea/GHCR, presupuesto de JS y Lighthouse CI en `ci.yml`                                                                                                    | 3–4 d     | Merge → `:sha-*`; tag → `:1.2.3` en el registro                                                     | 0 €                                                  |
| 11  | **Producción (Hetzner)**     | `compose.prod.yml`, Caddyfile, Cloudflare (Full strict, Origin CA, WAF, rate limit), firewall Hetzner, backups `pg_dump` → R2, `deploy.yml` opcional, `v1.0.0`                                                                                                             | 3–4 d     | Despliegue desde tag; **restauración de backup probada**                                            | VPS + dominio                                        |
| 12  | **Monitorización (híbrida)** | Homelab: Uptime Kuma, Beszel hub, Dozzle, GlitchTip (+Postgres/Valkey), cloudflared. VPS: beszel-agent, dozzle agent. Red privada (Tailscale/WireGuard), SDK de errores en server, `/health`, heartbeats de backups, alertas Telegram/email, vigilante externo del homelab | **3–4 d** | Alerta de prueba recibida por cada fuente (caída web, CPU/disco, error de app, backup no ejecutado) | 0 € (homelab + capas gratuitas)                      |
| 13  | **Optimización continua**    | Rebuild del storefront por webhook de catálogo, Speculation Rules, Partytown, auditorías periódicas                                                                                                                                                                        | continua  | Core Web Vitals en verde                                                                            | —                                                    |

**Total hasta `v1.0.0` con monitorización: ~34–52 días efectivos ≈ 8–11 semanas** a tiempo completo. La monitorización híbrida en dos máquinas añade ~2 días respecto a una solución en un solo servidor (túnel, red privada, GlitchTip con su BD, alertas y vigilante externo).

### 13.3 Coste mensual estimado en producción

| Concepto                                                                                                                             | € / mes                                                                 |
| ------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| VPS Hetzner 4 vCPU / 8 GB (Medusa server + worker, Postgres, Redis, Meilisearch, Caddy, storefront, agentes) — mínimo razonable 4 GB | 8–25                                                                    |
| Backups/snapshots de Hetzner (opcional, ~20 % del VPS)                                                                               | 2–5                                                                     |
| Cloudflare (DNS, CDN, WAF básico, Origin CA, Tunnel, Access hasta 50 usuarios)                                                       | 0                                                                       |
| Cloudflare R2 (< 10 GB)                                                                                                              | 0–2                                                                     |
| Resend                                                                                                                               | 0 → ~19                                                                 |
| Stripe                                                                                                                               | sin cuota fija; comisión por transacción (verificar tarifa en tu panel) |
| Monitorización (homelab + UptimeRobot/Healthchecks free)                                                                             | 0 (+ electricidad del homelab)                                          |
| Dominio                                                                                                                              | ~1                                                                      |
| **Total**                                                                                                                            | **~10–50 €/mes**                                                        |

## 14. Variables de entorno

Cada app tiene su `.env` (ignorado por git) y un `.env.example` versionado.

**apps/backend/.env**

```ini
DATABASE_URL=postgres://medusa:medusa@localhost:5432/medusa
REDIS_URL=redis://localhost:6379
JWT_SECRET=change_me
COOKIE_SECRET=change_me
STORE_CORS=http://localhost:4321
ADMIN_CORS=http://localhost:9000
AUTH_CORS=http://localhost:9000,http://localhost:4321
MEDUSA_WORKER_MODE=shared            # prod: server | worker
DISABLE_MEDUSA_ADMIN=false
MEDUSA_BACKEND_URL=http://localhost:9000

STRIPE_API_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

S3_ENDPOINT=http://localhost:8333    # SeaweedFS · prod: https://<account_id>.r2.cloudflarestorage.com
S3_REGION=auto                       # SeaweedFS acepta cualquiera; R2 usa "auto"
S3_BUCKET=medusa
S3_ACCESS_KEY_ID=seaweed
S3_SECRET_ACCESS_KEY=seaweed12345
S3_FORCE_PATH_STYLE=true             # necesario en SeaweedFS
S3_FILE_URL=http://localhost:8333/medusa   # prod: https://img.tudominio.com

MEILISEARCH_HOST=http://localhost:7700
MEILISEARCH_API_KEY=dev_master_key_change_me_32chars_min

RESEND_API_KEY=re_...
RESEND_FROM="Tienda <no-reply@tudominio.com>"

STOREFRONT_REBUILD_WEBHOOK=          # opcional: dispara rebuild del storefront

SENTRY_DSN=                          # fase 12: DSN del proyecto en GlitchTip (vacío = desactivado)
```

**apps/storefront/.env**

```ini
PUBLIC_MEDUSA_BACKEND_URL=http://localhost:9000
PUBLIC_MEDUSA_PUBLISHABLE_KEY=pk_...
PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
PUBLIC_MEILISEARCH_HOST=http://localhost:7700
PUBLIC_MEILISEARCH_SEARCH_KEY=...    # search-only key, NUNCA la master
```

**docker/.env (VPS)**

```ini
REGISTRY=git.tudominio.com           # o ghcr.io
IMAGE_NAMESPACE=tu_usuario
IMAGE_TAG=1.2.3                      # o sha-abc1234
DOMAIN_STORE=tienda.tudominio.com
DOMAIN_API=api.tudominio.com
DOMAIN_ADMIN=admin.tudominio.com
```
