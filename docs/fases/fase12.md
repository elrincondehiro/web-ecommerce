# Fase 12 — Monitorización: vigilancia externa y errores de la aplicación

> **Estado:** 🚧 en curso (18-nov-2026)
> **Rama/PR:** `feat/fase12-monitorizacion`
> **Anterior:** [fase11.md](./fase11.md) §4.9 (Kuma, Beszel y Dozzle en el homelab) · README §12

## 1. Objetivos

- [x] **12-A. ¿Quién vigila al vigilante?** Servicios externos gratuitos: **UptimeRobot** vigila
      la tienda desde fuera y **Healthchecks.io** recibe un latido del homelab: si se cae la VM, Kuma
      o la conexión de casa, avisa.
- [x] **12-B. Errores de la aplicación** en **Bugsink** (homelab), con el SDK de Sentry **solo en
      servidor** (Medusa y el SSR del storefront), sin datos personales. Alertas por email
      (Resend) y ntfy.
- **Nada nuevo en el VPS de Hetzner** salvo el SDK dentro de los procesos que ya corren (unos MB).

## 2. Qué se ha hecho

### 2.1 12-A: UptimeRobot y Healthchecks.io (planes gratuitos)

- **Monitor HTTP(s)** `https://api.hirobordercollie.es/health`, cada 5 min (código 200; el plan
  gratuito no tiene keyword). `api.` no lleva Cloudflare Access, pero su regla del WAF solo dejaba
  pasar el webhook de Stripe: se añadió la excepción de `GET`/`HEAD /health` (§4.1). Comprueba
  Cloudflare → Caddy → Medusa (y su BD). Cuando la tienda abra (sin Access), añadir la home.
- **Latido del homelab en Healthchecks.io** (el «Heartbeat» de UptimeRobot es de pago; el plan
  gratuito de Healthchecks.io, «Hobbyist», tiene 20 checks y alertas por email y **ntfy**): la VM
  de monitorización hace ping cada 5 min **si Uptime Kuma responde** (`docker/monitoring/heartbeat/`,
  temporizador de systemd). Sin latidos, Healthchecks.io avisa: se ha caído la VM, Kuma o la
  conexión de casa (y con ellos, todas las alertas del homelab).
- Alertas de UptimeRobot y de Healthchecks.io a tu email (y ntfy en Healthchecks.io).

### 2.2 12-B: Bugsink + SDK de Sentry

- **Bugsink 2.6.3** en la VM (`docker/monitoring/compose.homelab.yml`): un solo contenedor (web +
  tareas), SQLite en el volumen `bugsink`, 2 procesos web (**~210 MB** medidos), `mem_limit` 512 MB.
  En `10.0.10.230:8000` (LAN) y `10.77.0.3:8000` (túnel WireGuard, para el VPS): nada en Internet.
  Un usuario y un equipo (`SINGLE_USER`, `SINGLE_TEAM`), topes de eventos (1000/h por proyecto) y
  90 días como máximo. Alternativa a GlitchTip (decisión del usuario): GlitchTip pide Postgres y
  512 MB–1 GB; Bugsink, 1 contenedor y < 100 MB por proceso (context7 `/websites/bugsink`).
- **Backend** (`@sentry/node` 11.13.0): `apps/backend/instrumentation.ts` (Medusa lo carga al
  arrancar server y worker) y el `errorHandler` de `src/api/middlewares.ts`, que envía **solo los
  5xx** (los 4xx de validación, 404 o sin sesión son respuestas normales). Etiqueta `service`:
  `backend-server` o `backend-worker`. Solo errores: sin trazas ni OpenTelemetry (Bugsink no las
  usa; la guía oficial de Sentry para Medusa añade 5 paquetes de OTel que no hacen falta).
- **Storefront** (`@sentry/node` 11.13.0, **no** `@sentry/astro`): `instrument.mjs` se carga con
  `node --import` antes del servidor (Dockerfile y `pnpm start`/`preview`); el middleware de Astro
  captura los errores de páginas on-demand, islands y actions (500) y los relanza. `@sentry/astro`
  se descartó: añade plugins de Vite al build (sourcemaps con telemetría, instrumentación en
  compilación, middleware) y cambia el build de 1.200 páginas. Así **el build no cambia** y no llega
  nada al navegador (`check:budget`).
- **Sin datos personales** (`lib/error-reporting.ts`, idéntico en backend y storefront, con test):
  - `dataCollection`: sin usuario, cookies, cabeceras, cuerpos, parámetros de la URL, datos de
    consultas SQL ni variables locales (por defecto el SDK 11 lo recoge **todo**);
  - `beforeSend`/`beforeBreadcrumb`: emails → `[email]`; JWT, claves (`sk_…`, `whsec_…`) y cadenas
    largas aleatorias → `[token]`; `token=`, `password:`, `?t=`… → `[filtrado]`; cabeceras
    `authorization`/`cookie`/`x-publishable-api-key` fuera. Los ids de Medusa (`order_01…`) se
    dejan: no son datos personales y sirven para encontrar el pedido.
- **Sin `SENTRY_DSN` no se inicia nada** (local, CI, tests). En el VPS: `SENTRY_DSN_BACKEND` y
  `SENTRY_DSN_STOREFRONT` en `.env.prod` (runtime; el storefront no hace falta reconstruirlo) y la
  versión (`SENTRY_RELEASE` = `IMAGE_TAG` / `STOREFRONT_IMAGE_TAG`).
- **Alertas** (nuevo error, error que vuelve tras resolverlo, o que pasa su límite de silencio):
  - email por **Resend** (SMTP `smtp.resend.com:465`, usuario `resend`, una API key propia);
  - **ntfy** con el «Custom webhook» de Bugsink y la plantilla de ntfy en la URL (§4.3).

## 3. Decisiones tomadas

| Decisión                                            | Motivo                                                                                                             | Fuente consultada                                                                    |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| UptimeRobot (gratis) para el monitor HTTP externo   | Usuario                                                                                                            | uptimerobot.com/pricing                                                              |
| Healthchecks.io (gratis) para el latido del homelab | El «Heartbeat» de UptimeRobot es de pago; Healthchecks.io está hecho para esto (periodo + gracia) y avisa por ntfy | healthchecks.io/pricing; context7 `/websites/healthchecks_io`                        |
| Latido desde la VM solo si Kuma responde            | Cubre a la vez VM, Kuma y conexión de casa; un monitor push de Kuma no sale hacia fuera                            | context7 `/louislam/uptime-kuma-wiki`; `/api/entry-page` en el código de Kuma 2.5.11 |
| `GET /health` abierto en el WAF de `api.`           | `api.` no tiene Access; UptimeRobot gratis no envía cabeceras (sin service token)                                  | —                                                                                    |
| Bugsink en vez de GlitchTip                         | Usuario: lo más ligero; 1 contenedor, SQLite                                                                       | context7 `/websites/bugsink`, `/websites/glitchtip`                                  |
| `@sentry/node` también en el storefront             | Usuario; `@sentry/astro` cambia el build (plugins de Vite)                                                         | código de `@sentry/astro` 11.13.0 (`integration/index.js`)                           |
| Solo los 5xx de las rutas de Medusa                 | Los 4xx son respuestas normales y llenarían Bugsink                                                                | `getHttpResponseFromError` de @medusajs/framework 2.22.7                             |
| `@sentry/node` 11.13.0 (no 11.14.0)                 | 11.14.0 tenía < 24 h (`minimumReleaseAge`); Renovate la sube                                                       | —                                                                                    |
| Dozzle y Beszel se quedan                           | Usuario                                                                                                            | —                                                                                    |

## 4. Cómo usarlo

### 4.1 Regla del WAF de `api.` (Cloudflare → Security → WAF → Custom rules, acción Block)

```
(http.host eq "api.hirobordercollie.es" and not (starts_with(http.request.uri.path, "/hooks/payment/") and http.request.method eq "POST") and not (http.request.uri.path eq "/health" and http.request.method in {"GET" "HEAD"}))
```

Kuma sigue esperando un 403 en la raíz de `api.` (fase11 §4.9): no cambia.

### 4.2 Latido del homelab (VM `monitor-kbd`)

1. Healthchecks.io → crear cuenta (gratis) → **Add Check**: nombre «homelab», _Simple_, **Period 5
   minutes**, **Grace 10 minutes**. Copia su _Ping URL_ (`https://hc-ping.com/<uuid>`). En
   _Integrations_: email (ya está) y, si quieres, **ntfy** (el mismo tema de Kuma).
2. En la VM:
   ```bash
   sudo install -m 755 docker/monitoring/heartbeat/homelab-heartbeat.sh /usr/local/bin/
   sudo install -m 644 docker/monitoring/heartbeat/homelab-heartbeat.{service,timer} /etc/systemd/system/
   sudo install -m 600 docker/monitoring/heartbeat/homelab-heartbeat.env.example /etc/homelab-heartbeat.env
   sudo nano /etc/homelab-heartbeat.env          # HEARTBEAT_URL=<la Ping URL>
   sudo systemctl daemon-reload && sudo systemctl enable --now homelab-heartbeat.timer
   sudo systemctl start homelab-heartbeat.service && journalctl -u homelab-heartbeat -n 5
   ```
3. En Healthchecks.io el check pasa a «up» con el primer ping. Prueba: `./dcm stop uptime-kuma` en
   la VM → a los ~15 min (periodo + gracia) avisa; `./dcm start uptime-kuma` → vuelve.

### 4.3 Bugsink (VM `monitor-kbd`, `/opt/monitor`)

1. `monitor.env`: `BUGSINK_SECRET_KEY` (`openssl rand -base64 48`), `BUGSINK_SUPERUSER`
   (`tu-email:contraseña`), `BUGSINK_RESEND_API_KEY` (Resend → API keys → nueva, «bugsink», solo
   envío) y `BUGSINK_FROM_EMAIL` (p. ej. `Errores <errores@develop.hirobordercollie.es>`).
2. Copiar el `compose.homelab.yml` nuevo y `./dcm up -d bugsink`. Panel: `http://10.0.10.230:8000`.
3. Crear dos proyectos, **backend** y **storefront** (Projects → New). Cada uno muestra su DSN
   (`http://<clave>@10.0.10.230:8000/<id>`): en el VPS se usa **con la IP del túnel**,
   `http://<clave>@10.77.0.3:8000/<id>`.
4. Alertas de cada proyecto (icono del megáfono): email (activo por defecto) y **Add → Custom**
   con esta URL de ntfy (el mismo tema secreto de Kuma u otro):
   ```
   https://ntfy.sh/<tema>?tpl=1&t=%F0%9F%90%9B%20Error%20en%20%7B%7B.project_name%7D%7D&m=%7B%7B.title%7D%7D%0A%7B%7B.url%7D%7D&click=http%3A%2F%2F10.0.10.230%3A8000%2F&tags=bug
   ```
   → «🐛 Error en backend», con el error y su enlace. **Test** para probarlo.
5. En el VPS (`/opt/ecommerce/.env.prod`): `SENTRY_DSN_BACKEND` y `SENTRY_DSN_STOREFRONT`, y
   `./dc up -d backend-server backend-worker storefront` (con el `compose.prod.yml` nuevo).
6. Comprobar desde el VPS que llega: `curl -s -o /dev/null -w '%{http_code}\n' http://10.77.0.3:8000/`
   (302). Un error de prueba: en Bugsink, cada proyecto tiene un ejemplo para enviar uno.

### 4.4 Qué mirar en cada herramienta

| Herramienta         | Para qué                                                             | Cuándo entrar                                                                                      |
| ------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| **Kuma**            | ¿Está todo arriba? Tienda, Admin, `api.`, VPS, backups, publicación  | A diario (o solo cuando avise)                                                                     |
| **UptimeRobot**     | La API vista desde fuera                                             | Solo cuando avise                                                                                  |
| **Healthchecks.io** | Si el homelab (VM + Kuma + conexión) está vivo                       | Solo cuando avise                                                                                  |
| **Bugsink**         | Qué ha fallado dentro de la app: traza, ruta, versión, cuántas veces | Cuando avise de un error nuevo                                                                     |
| **Beszel**          | CPU, RAM, disco y red del VPS y de la VM (histórico)                 | Si algo va lento; configurar alertas de disco > 85 % y memoria > 90 % (Beszel → sistema → campana) |
| **Dozzle**          | Logs en vivo de los contenedores                                     | Cuando Bugsink o Kuma avisan y quieres ver qué pasaba alrededor                                    |

## 5. Cómo testear esta fase

```bash
pnpm --filter backend exec jest --silent src/lib/__tests__/error-reporting.unit.spec.ts   # filtro y opciones
pnpm --filter storefront exec vitest run src/lib/error-reporting.test.ts                  # idéntico al del backend
pnpm --filter storefront check:budget          # 0 bytes nuevos en el cliente
sh -n docker/monitoring/heartbeat/homelab-heartbeat.sh
```

Probado en local (18-nov-2026) con un Bugsink 2.6.3 en Docker: una ruta de Medusa que lanzaba un
error llegó como «Error | Prueba de Bugsink para [email] …» (etiqueta `backend-server`, sin
usuario, cookies ni query), un 404 no se envió, y una página on-demand del storefront que fallaba
llegó con el email enmascarado. Sin `SENTRY_DSN`, el storefront arranca igual. El build no lleva
nada de Sentry en `dist/client`. La URL de ntfy, probada con un ntfy 2.15 local (título, mensaje
con enlace, «click» y etiqueta).

## 6. Criterio de salida

- [x] Código y documentación (este PR).
- [ ] Usuario: regla del WAF ✅, monitor HTTP de UptimeRobot ✅, latido en Healthchecks.io (§4.2), Bugsink en la VM y
      DSN en el VPS (§4.3), alertas de Beszel (§4.4).

## 7. Pendientes / riesgos

- Si el homelab está caído, los errores de ese rato se pierden (el SDK no los guarda): aceptable,
  es diagnóstico. Lo avisa el latido de Healthchecks.io.
- Cuando se abra la tienda (sin Access): monitor de la home en UptimeRobot.
- Si se monta el VPS de netcup: Bugsink y Kuma pueden ir allí (mismo compose); los DSN cambian de IP.
