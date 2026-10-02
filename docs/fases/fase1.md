# Fase 1 — CI básico (PR) + Renovate

> **Estado:** ✅ completada (01-oct-2026) · PR #1 (`70e8033`) en `main` de Gitea y GitHub
> **Rama/PR:** `chore/fase1-ci-basico` → PR #1 en Gitea (squash) · cierre: `docs/fase1-cierre`
> **Anterior:** [Fase 0](./fase0.md) · **Siguiente:** [Fase 2 — Backend base](./fase2.md)

## 1. Objetivos

- [x] `ci.yml` único que funciona **igual** en Gitea Actions y GitHub Actions.
- [x] Runner del homelab (runner **de usuario**, etiqueta `ubuntu-latest` → `node:24.21.0-trixie`).
- [x] Gitea → GitHub sincronizado con **push mirror HTTPS + PAT**.
- [x] Checks obligatorios: Gitea `CI / quality*` (protección de rama) y GitHub `quality` (ruleset, origen GitHub Actions).
- [x] PR de prueba: rojo bloqueado (`test/ci-rojo`), verde mergeable (PR #1).
- [x] Renovate autoalojado contra Gitea: ejecución manual en verde.
- [x] Estado de fase 0 y versiones actualizados (Gitea 28.0.0, gitea-runner 4.0.1).

## Resumen de lo realizado

| Elemento                         | Resultado                                                                                          |
| -------------------------------- | -------------------------------------------------------------------------------------------------- |
| `.github/workflows/ci.yml`       | job `quality`: install `--frozen-lockfile` → lint → format:check → typecheck → test → build        |
| `.github/workflows/renovate.yml` | lunes 04:00 UTC + manual, solo en Gitea (`if: github.server_url != 'https://github.com'`)          |
| Prueba de bloqueo                | `test/ci-rojo` (variable sin usar) → `quality` rojo → merge bloqueado → PR cerrado y rama borrada  |
| PR #1                            | `quality` verde en Gitea → squash merge → mirror → GitHub Actions `CI` `success` en `70e8033`      |
| Renovate                         | 1ª ejecución: **exit 137 (OOM)** con LXC de 512 MB → LXC subido a **4 GB RAM + 1 GB swap** → verde |
| Token GitHub de Renovate         | 401 en la 1ª ejecución → regenerado (`RENOVATE_GITHUB_COM_TOKEN`) → OK                             |

### Incidencias y lecciones

- **Renovate necesita ~1 GB de RAM** (pico medido: ~945 MiB con este repo, que aún es pequeño; crecerá con Medusa/Astro). El LXC que ejecuta el runner necesita **≥ 3–4 GB**. Requisito apuntado en README §4.1.
- **Gitea no admite push mirror por SSH** → HTTPS + PAT fine-grained (Contents RW + Workflows RW). El PAT caduca en 1 año.
- La etiqueta `ubuntu-latest` del runner de Gitea es Debian 13 + Node 24: no trae herramientas de la imagen Ubuntu de GitHub.

## 2. Decisiones

| #   | Decisión                                                                                                                                                                                | Fuente                                                               |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| P1  | **PR y merge en Gitea**. GitHub recibe todo por **push mirror HTTPS + PAT fine-grained** (Gitea no admite mirror SSH). Bypass en el ruleset de GitHub: _Repository admin_               | docs.gitea.com/usage/repo-mirror · código Gitea v28 · `/github/docs` |
| P2  | Runner del homelab instalado por el usuario: binario `gitea-runner` + usuario de sistema `gitea-runner` en grupo `docker` (equivale a montar `docker.sock`). Aceptado: servidor privado | usuario                                                              |
| P3  | Actions fijadas por **SHA + tag en comentario**                                                                                                                                         | usuario                                                              |
| P4  | **Renovate autoalojado** (opción b) — forma de ejecutarlo: ver §7                                                                                                                       | docs.renovatebot.com                                                 |
| P5  | Nuevas versiones fijadas aprobadas (abajo)                                                                                                                                              | usuario                                                              |
| P6  | Runner ya desplegado por el usuario en LXC Debian 13 (Proxmox)                                                                                                                          | usuario                                                              |

## 3. Versiones (README §4)

| Pieza                      | Versión                                                      |
| -------------------------- | ------------------------------------------------------------ |
| Gitea (servidor)           | **28.0.0** (nuevo esquema de versiones: 1.27.x → 28)         |
| gitea-runner               | 4.0.1 (verificar en el homelab con `gitea-runner --version`) |
| `actions/checkout`         | `3d3c42e5aac5ba805825da76410c181273ba90b1` # v7.0.1          |
| `pnpm/action-setup`        | `ea17c68df8912ef543352723c149a84f56e3d413` # v6.1.0          |
| `actions/setup-node`       | `820762786026740c76f36085b0efc47a31fe5020` # v7.0.0          |
| Imagen de jobs (propuesta) | `node:24.21.0-trixie` (Debian 13.7 + Node 24.21.0 + git)     |
| `renovate/renovate`        | 44.125.2                                                     |

### Gitea 28.0.0 — cambios relevantes (release notes)

- **BREAKING `RUN_RETENTION_DAYS`** (#38855): por defecto **400 días**; las ejecuciones de Actions más antiguas se borran. Además `0` ahora significa "conservar siempre" también en `LOG_RETENTION_DAYS`/`ARTIFACT_RETENTION_DAYS`.
- **BREAKING proxy interno de egress para Git** (#39426): las operaciones Git salientes (migraciones, **push mirrors**) pasan por un proxy con `[security] ALLOWED_HOST_LIST` / `EGRESS_MODE`. En modo `lax` (por defecto) github.com está permitido; si usas `strict`, añade `github.com`.
- **Cuentas bot** de primera clase (#38966): usuarios sin contraseña que solo autentican con tokens → ideal para Renovate.
- Mejoras de Actions: `max-parallel`, matrices dinámicas, `self:` en `uses:`, API de gestión de runs.

## 4. Hallazgo importante: la etiqueta `debian-13` → `docker://debian:13`

`debian:13` **no trae Node ni git** (verificado). Las actions JavaScript (`actions/checkout`, `pnpm/action-setup`, `actions/setup-node`) se ejecutan con `node` **dentro del contenedor del job** (`gitea_runner/act/runner/action.go`: `node --preserve-symlinks-main …`), así que el job fallaría en el primer paso. Ver §7-A.

## 5. Plan de ejecución (ejecutado)

### 5.1 `.github/workflows/ci.yml`

- `on: pull_request` (→ `main`) y `push` (`main`).
- `concurrency: ${{ github.workflow }}-${{ github.head_ref || github.run_id }}`, `cancel-in-progress: true`; `permissions: contents: read`.
- Job **`quality`** (nombre estable = check obligatorio), sin `paths:`:
  checkout → pnpm/action-setup (versión de `packageManager`) → setup-node (`.node-version`, `cache: pnpm`) → `pnpm install --frozen-lockfile` → `lint` → `format:check` → `typecheck` → `test` → `build`.
- `runs-on`: ver §7-A (misma etiqueta en Gitea y GitHub).

### 5.2 Renovate (autoalojado en Gitea Actions)

**Ficheros:** `.github/workflows/renovate.yml` y `renovate.json`, que ahora incluye `helpers:pinGitHubActionDigests` y el grupo `github actions`.

**Cómo funciona:**

- Cada **lunes a las 04:00 UTC**, y también a mano con _Run workflow_, el runner levanta el contenedor `renovate/renovate:44.125.2`.
- Renovate entra en Gitea con el PAT del bot, revisa `package.json`, `compose.dev.yml` y los workflows, y abre PRs agrupados.
- Esos PRs pasan por el mismo `ci.yml`.
- El job lleva `if: github.server_url != 'https://github.com'`, así que en GitHub no se ejecuta nunca.
- `onboarding: false` y `requireConfig: required` porque `renovate.json` ya existe y no hace falta el PR de bienvenida.

**Pasos en Gitea (tú):**

1. **Dar acceso al bot al repo:** repo → _Ajustes → Colaboradores_ → añade `renovate-bot` con permiso **Escritura**. Necesita escritura para crear sus ramas `renovate/*` y los PRs.
   - El bot **no** necesita poder mergear: en la protección de `main` **no** lo pongas en la lista de usuarios con permiso de push o merge.
2. **Guardar el PAT como secret:** repo → _Ajustes → Actions → Secretos → Añadir secreto_:
   - Nombre: `RENOVATE_TOKEN`
   - Valor: el PAT de `renovate-bot`, con scopes `repo` (lectura y escritura), `user` (lectura), `issue` (lectura y escritura) y `organization` (lectura).
   - Gitea no deja crear secretos con nombres que empiecen por `GITEA_` o `GITHUB_`, por eso el nombre es `RENOVATE_TOKEN`.
3. **Opcional, para ver changelogs en los PR:** crea en GitHub un _fine-grained PAT_ **sin permisos**, que solo da acceso a repos públicos. Guárdalo en Gitea como secret `RENOVATE_GITHUB_COM_TOKEN`. Sin él, Renovate funciona igual pero los PRs no traen notas de versión de GitHub.
4. **Email del bot:** en _Administración del sitio → Cuentas_ ponle uno a `renovate-bot` (p. ej. `renovate-bot@noreply.hirokobu.duckdns.org`). Renovate lo usa como autor de los commits.
5. **Probar** cuando `renovate.yml` esté en `main`: repo → _Actions → Renovate → Run workflow_. El primer día debería abrir PRs, o ninguno si todo está al día.

> Los workflows `schedule` en Gitea **solo se ejecutan desde la rama por defecto**. Hasta que se mergee el PR de la fase 1, Renovate no se programa.

### 5.3 Push mirror Gitea → GitHub ✅ (configurado por el usuario)

> **Corrección del plan:** Gitea **no admite push mirrors por SSH** ("Currently Gitea supports no ssh push mirrors" — docs.gitea.com/usage/repo-mirror; código v28.0.0 `modules/git/remote.go` `ParseRemoteAddr` solo inyecta credenciales en URLs `http(s)://`). Se usa **HTTPS + PAT fine-grained**.

1. **GitHub → Fine-grained token** `gitea-mirror-web-ecommerce`:
   - _Only select repositories_ → `elrincondehiro/web-ecommerce`
   - **Contents: Read and write** y **Workflows: Read and write** (este último hace falta porque el repo tiene `.github/workflows/`)
   - Caducidad de 1 año. ⚠️ Anota cuándo renovarlo: cuando caduque, el mirror falla y Gitea lo muestra en "Mirror settings".
2. **Gitea → Ajustes → Repositorio → Mirror settings → Push**:
   - URL `https://github.com/elrincondehiro/web-ecommerce.git`
   - usuario `elrincondehiro`, contraseña = el token
   - ✅ _Sync when new commits are pushed_, intervalo `8h`
3. **GitHub ruleset `main` → Bypass list → Repository admin (Always)**. El PAT hace push **como tu usuario** y el mirror hace **force push** (`+refs/heads/*`, `+refs/tags/*`), así que sin bypass chocaría con _Block force pushes_ y _Require PR_. No hace falta ninguna deploy key.
4. Local: `origin` deja de empujar a GitHub (lo hace el mirror):
   `git remote set-url --delete --push origin git@github.com:elrincondehiro/web-ecommerce.git`

> ⚠️ El mirror **sobrescribe** GitHub: nunca hagas commits directamente en GitHub.

### 5.4 Checks obligatorios (tras la 1ª ejecución)

- **Gitea**: protección de `main` → _Enable status check_ → patrón del contexto que aparezca (p. ej. `CI / quality (pull_request)`).
- **GitHub**: ruleset `main` → _Require status checks_ → `quality`. (Con el bypass del mirror, el push de `main` entra aunque el check se ejecute después.)

### 5.5 Comandos

```bash
git switch -c chore/fase1-ci-basico
# crear/editar: .github/workflows/ci.yml, renovate.json, (renovate según §7-B)
# docs: fase0 ✅, fase1, prefase (Gitea 28.0.0, runner), README §4/§7/§10/§13, AGENTS §8
pnpm lint && pnpm format:check
git commit -m "ci: workflow de CI básico y Renovate (fase 1)"
git push -u gitea chore/fase1-ci-basico
# → abrir PR en Gitea; ver ejecución en el runner del homelab
```

## 6. Cómo testear esta fase

```bash
# En el homelab
gitea-runner --version
systemctl status gitea-runner
# Gitea → Ajustes → Actions → Runners → runner "Idle"

# PR rojo
git switch -c test/ci-rojo && printf 'const x = 1\n' > tmp.ts && git add tmp.ts \
  && git commit -m "test: ci rojo" && git push -u gitea test/ci-rojo
#   → PR en Gitea: "quality" falla y el merge está bloqueado
# PR verde → merge → mirror empuja main a GitHub → GitHub Actions ejecuta "quality" en main
git ls-remote gitea main; git ls-remote github main   # mismo SHA tras el mirror
```

## 7. Decisiones finales A/B

- **A → opción 2**: runner **de usuario** con etiqueta `ubuntu-latest` → `docker://node:24.21.0-trixie` (Debian 13.7, Node 24.21.0, git). El `ci.yml` usa `runs-on: ubuntu-latest` igual en Gitea y GitHub. Cuidado: en Gitea **no** hay herramientas de la imagen Ubuntu de GitHub.
- **B → opción 1**: Renovate como workflow programado en Gitea Actions (§5.2).

### Verificación local previa al PR

- `actionlint` 1.7.7 sobre los workflows: sin errores.
- `renovate-config-validator` (imagen 44.125.2): `renovate.json` válido.
- Simulación del job `quality` en `node:24.21.0-trixie`: install, lint, format, typecheck, test y build ✅.

## 8. Anexo — Runner solo para tu usuario

Gitea tiene runners de **instancia**, **organización**, **usuario** y **repositorio**. Un runner de usuario solo acepta jobs de los repos de ese usuario, así que un familiar con cuenta propia no podría usarlo.

1. Gitea → avatar → _Configuración → Actions → Runners → Crear nuevo runner_ → copia el token (**de usuario**).
2. En el LXC:
   ```bash
   sudo systemctl stop gitea-runner
   # localiza el fichero de registro (.runner) en el WorkingDirectory del servicio
   systemctl cat gitea-runner | grep -E "WorkingDirectory|ExecStart"
   sudo -u gitea-runner mv <WorkingDirectory>/.runner <WorkingDirectory>/.runner.bak
   cd <WorkingDirectory>
   sudo -u gitea-runner gitea-runner register --config /etc/gitea-runner/config.yaml \
     --instance https://git.hirokobu.duckdns.org --token <TOKEN_DE_USUARIO> \
     --name homelab-jacknoddy --no-interactive
   sudo systemctl start gitea-runner
   ```
   Las etiquetas se toman de `runner.labels` en `config.yaml` si están definidas.
3. _Administración del sitio → Actions → Runners_ → borra el runner de instancia antiguo.
4. Opcional, para reforzarlo: en `app.ini`, sección `[actions]`, deja Actions activado y desactiva el uso de runners globales en los repos de otros usuarios. Además, que esos usuarios no tengan permiso para crear runners propios en el LXC, que es el que tiene acceso a Docker.

> Ojo: el grupo `docker` equivale a root en ese LXC. Si algún día abres la instancia, considera un runner en **otro LXC/VM** o la variante rootless.
