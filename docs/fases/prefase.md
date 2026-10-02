# Prefase — Preparación y toma de decisiones

> **Estado:** ✅ completada (30-sep-2026)
> **Siguiente:** [Fase 0 — Fundaciones](./fase0.md)

Todo lo que ocurre **antes de la fase 0**: preparación del equipo, conexión con Gitea y GitHub, MCPs de documentación y todas las decisiones de arquitectura y versiones.

---

## 1. Objetivos

- [x] Documentar el proyecto: `README.md` (planificación) y `AGENTS.md` (directrices para agentes de IA).
- [x] Fijar versiones de sistema, imágenes Docker y paquetes (README §4).
- [x] Configurar MCPs de documentación para los agentes (README §5).
- [x] Configurar SSH con clave protegida por passphrase mediante **ssh-agent**.
- [x] Verificar acceso a **Gitea** (homelab, puerto 2222) y **GitHub**.
- [x] Crear repositorios vacíos en ambas plataformas.
- [x] Proteger `main` (Gitea: protección de rama · GitHub: rulesets).
- [x] Planificar fases, tiempos, costes y monitorización (README §12–§13).

## 2. Decisiones tomadas

| #   | Tema                      | Decisión                                                                                                | Motivo / alternativa descartada                                                           |
| --- | ------------------------- | ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| D1  | Gestor de paquetes        | **pnpm 12.8.1** (nunca npm/npx/yarn)                                                                    | Preferencia del usuario, workspaces, velocidad                                            |
| D2  | Versiones de Node         | **fnm** + `.node-version` = **24.21.0** (LTS)                                                           | nvm descartado                                                                            |
| D3  | Framework tienda          | **Astro 7.3.5**                                                                                         | Se pidió Astro 6, pero Astro 7 ya es estable; proyecto nuevo → evitar migración inmediata |
| D4  | Backend                   | **Medusa 2.21.2** (todos los `@medusajs/*` iguales)                                                     | —                                                                                         |
| D5  | TypeScript                | **6.0.3**                                                                                               | TS 7 aún no soportado por Astro/Medusa                                                    |
| D6  | PostgreSQL                | **17.9-alpine**                                                                                         | 18 descartado de momento (menos probado con Medusa)                                       |
| D7  | Redis                     | **8.8.3-alpine**                                                                                        | 7.4 / Valkey como alternativas                                                            |
| D8  | S3 local                  | **SeaweedFS 4.48**                                                                                      | MinIO dejó de publicar imágenes en Docker Hub. Prod = Cloudflare R2                       |
| D9  | Versionado                | Versiones **exactas**, sin `:latest`, Renovate para actualizar                                          | Reproducibilidad                                                                          |
| D10 | Frontend                  | Estático → server island → on-demand → isla cliente. Mínimo JS                                          | Requisito de velocidad máxima                                                             |
| D11 | Git                       | `feat/*` → PR → CI verde → squash a `main`; `main` publica `:sha-xxxxxxx`, tag `vX.Y.Z` publica versión | Requisito del usuario                                                                     |
| D12 | Remotos                   | `origin` hace fetch de Gitea y **push a Gitea + GitHub**                                                | Flexibilidad para elegir origen de pull/imágenes                                          |
| D13 | CI                        | **CI básico adelantado a la fase 1** (tras fundaciones)                                                 | PR seguras desde el principio                                                             |
| D14 | Monitorización            | **Híbrida autoalojada**: paneles/alertas en homelab, solo agentes en VPS Hetzner                        | Si cae el VPS, el homelab avisa                                                           |
| D15 | Red privada homelab ↔ VPS | Se decide en fase 12. **Preferencia: WireGuard**                                                        | Tailscale = WireGuard + capa de coordinación de terceros                                  |
| D16 | MCP de Medusa             | **No se usa** (requiere Medusa Cloud). Se usa context7 `/medusajs/medusa` + `llms-full.txt`             | —                                                                                         |
| D17 | MCP de Stripe             | OAuth solo con cuenta de **pruebas**. Nunca la live                                                     | Seguridad                                                                                 |
| D18 | Passphrase SSH            | **Nunca** en `.env`/ficheros → ssh-agent                                                                | Seguridad                                                                                 |
| D19 | Documentación por fase    | Un `docs/fases/faseX.md` por fase (+ este `prefase.md`)                                                 | Evitar que el README crezca                                                               |
| D20 | Regla nº 1 agentes        | Consultar docs (MCP específico → context7), plan, **esperar confirmación**                              | Evitar ejecuciones erróneas                                                               |

## 3. Lo que se hizo

### 3.1 Entorno local (Arch Linux, zsh)

| Herramienta               | Versión detectada                    |
| ------------------------- | ------------------------------------ |
| Node (fnm)                | 24.21.0                              |
| pnpm                      | 12.8.1                               |
| fnm                       | 1.39.0                               |
| Docker / Compose          | 29.8.1 / 5.5.1                       |
| git                       | 2.55.0                               |
| Gitea (servidor, homelab) | 28.0.0 (actualizado tras la prefase) |
| openssh                   | 10.5p1                               |

### 3.2 SSH + ssh-agent

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

Agente:

```bash
systemctl --user enable --now ssh-agent.socket
# ~/.zshenv
export SSH_AUTH_SOCK="$XDG_RUNTIME_DIR/ssh-agent.socket"
# una vez por sesión (pide la passphrase)
ssh-add ~/.ssh/id_ed25519
```

### 3.3 Repositorios

| Plataforma      | Usuario          | URL SSH                                           | Protección de `main`  |
| --------------- | ---------------- | ------------------------------------------------- | --------------------- |
| Gitea (homelab) | `jacknoddy`      | `gitea:jacknoddy/web-ecommerce.git`               | Protección de rama ✅ |
| GitHub          | `elrincondehiro` | `git@github.com:elrincondehiro/web-ecommerce.git` | Ruleset ✅            |

> Las reglas se **desactivan temporalmente** para el primer commit de la fase 0 (repo vacío) y se **reactivan** justo después. Los status checks obligatorios se añaden en la fase 1.

### 3.4 MCPs

- Proyecto — `.pi/mcp.json`: `astro-docs`, `svelte`, `cloudflare-docs`, `meilisearch-docs`, `resend-docs`.
- Usuario — `~/.pi/agent/mcp.json`: `context7`, `stripe` (OAuth, cuenta test).

Detalle y login de Stripe: README §5.

## 4. Comandos para verificar la prefase

```bash
# Herramientas
node -v            # v24.21.0
pnpm -v            # 12.8.1
fnm --version
docker --version && docker compose version

# ssh-agent con la clave cargada
echo $SSH_AUTH_SOCK          # /run/user/1000/ssh-agent.socket
ssh-add -l                   # lista la clave ED25519

# Acceso SSH
ssh -T gitea                 # Hi there, jacknoddy! …
ssh -T git@github.com        # Hi elrincondehiro! …

# Repos accesibles (vacíos antes de la fase 0)
git ls-remote gitea:jacknoddy/web-ecommerce.git
git ls-remote git@github.com:elrincondehiro/web-ecommerce.git

# MCPs
pi mcp list                  # todos "connected" (stripe tras `pi mcp login stripe`)
```

## 5. Pendientes que se arrastran

- [ ] Reactivar protección de `main` en Gitea y GitHub tras el primer commit (fase 0).
- [ ] Login en Stripe MCP con la cuenta de pruebas (`pi mcp login stripe`) — cuando haga falta (fase 5).
- [ ] Elegir red privada homelab ↔ VPS (fase 12, preferencia WireGuard).
- [ ] (Opcional) API key de Context7 para más cuota.
