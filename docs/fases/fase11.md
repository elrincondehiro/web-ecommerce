# Fase 11 — Despliegue de prueba en Hetzner

> **Estado:** ✅ cerrada (21-oct-2026; tag `v0.1.0` lo crea el usuario)
> **Rama/PR:** #59, #60, #61 y #63 (11-7 a 11-10 y cierre) · tag `v0.1.0`
> **Anterior:** [Fase R](./faseR-relacionados.md) · **Siguiente:** fase 12 (monitorización)

Despliegue **de prueba**, no la producción definitiva: dominio de pruebas, **Stripe en modo test**, **productos mock** y la tienda cerrada al público (Cloudflare Access, sin indexar). El usuario hace lo de los paneles (Hetzner, Cloudflare, Resend, Stripe, GitHub) y ejecuta los comandos en el VPS; el agente prepara la configuración del repo, explica cada paso y revisa los resultados.

> ⚠️ **El repo es público (réplica en GitHub).** Aquí no van IP del VPS, puertos de SSH, claves, emails personales ni nada que ayude a atacar el servidor. Esos datos solo están en `docker/.env.prod` del VPS (ignorado por git) y en las notas del usuario.

## 1. Objetivos

- [x] **11-0** Requisitos: dominios, VPS, Resend, R2, Stripe, Access (§2).
- [x] **11-1** VPS: sistema limpio, usuario sin root, SSH solo con clave y **solo por WireGuard**, actualizaciones automáticas, Docker, swap; firewall de Hetzner (80/443 solo desde Cloudflare).
- [x] **11-2** Cloudflare: Full (strict) + Origin CA, Always HTTPS, Access (Admin y tienda), reglas de caché, rate limiting.
- [x] **11-3** Caddy: Origin CA, `trusted_proxies` + `CF-Connecting-IP`, cabeceras de seguridad, `X-Robots-Tag: noindex`, CSP con Stripe.
- [x] **11-4** R2 (bucket de imágenes de prueba, token) y Resend (`RESEND_API_KEY`).
- [x] **11-5** Datos: migraciones, usuario del Admin, catálogo mock, imágenes en R2, Meilisearch, `stripe:region`, webhook de Stripe test.
- [x] **11-6** Storefront real: build en el portátil contra `api.`, publicado en GHCR por el usuario.
- [x] **11-7** Backups `pg_dump` → bucket R2 privado, con heartbeat y **restauración probada**.
- [x] **11-8** Monitorización: agentes Beszel y Dozzle, Uptime Kuma con `/health` (a través de WireGuard).
- [x] **11-9** Lista de comprobación de punta a punta y Lighthouse contra el dominio real.
- [x] **11-10** Prueba de carga con k6 2.3.0 (aprobada por el usuario; §5.7).

## 2. Requisitos (11-0)

### 2.1 Dominios (zona `hirobordercollie.es` en Cloudflare, plan Free)

| Uso                                       | Host                                                | Proxy CF | Variables                                                  |
| ----------------------------------------- | --------------------------------------------------- | -------- | ---------------------------------------------------------- |
| Tienda                                    | `hirobordercollie.es` (raíz); `www` → 301 a la raíz | sí       | `STORE_DOMAIN`, `SITE_URL`, `STOREFRONT_URL`, `STORE_CORS` |
| Store API + webhooks de Stripe            | `api.hirobordercollie.es`                           | sí       | `API_DOMAIN`, `STOREFRONT_BUILD_BACKEND_URL`               |
| Admin de Medusa                           | `admin.hirobordercollie.es`                         | sí       | `ADMIN_DOMAIN`, `ADMIN_CORS`, `AUTH_CORS`                  |
| Imágenes (dominio propio de un bucket R2) | `imagenes.hirobordercollie.es`                      | sí (R2)  | `S3_FILE_URL`, `IMAGE_BASE_URL`                            |
| Envío de emails (dominio verificado)      | `develop.hirobordercollie.es`                       | —        | `EMAIL_FROM` (`pedidos@develop.hirobordercollie.es`)       |
| Rebotes de Resend (lo creó Resend)        | `send.develop.hirobordercollie.es` (MX + SPF)       | —        | —                                                          |

- Solo subdominios de **primer nivel**: el SSL Universal gratuito y un Origin CA `*.hirobordercollie.es` cubren un nivel; `api.develop.…` necesitaría Advanced Certificate Manager (de pago). Fuente: cloudflare-docs (Advanced Certificate Manager, «Wildcard coverage»; SSL, «Universal SSL covers your apex domain and first-level subdomains»).
- En la raíz había un despliegue antiguo de Medusa (Express): se elimina al reinstalar el VPS (11-1).

### 2.2 VPS

- Hetzner **CPX22** (x86, 2 vCPU, 4 GB), Nuremberg, Debian 13. IPv4 + IPv6.
- Firewall de Hetzner rehecho en 11-1: 80/443 solo desde los rangos de Cloudflare y SSH solo por WireGuard (§4.1).
- **Reinstalación** (Rebuild) en vez de limpiar a mano: lleva meses con otro despliegue y no sabemos qué quedó instalado (paquetes, usuarios, cron, reglas). Partir de cero hace la 11-1 reproducible.
- Acceso de emergencia: consola web de Hetzner (si se pierde el túnel o la clave).

### 2.3 Cloudflare Access (Zero Trust Free)

- Requiere crear la organización Zero Trust (plan Free; pide método de pago aunque no cobra). Fuente: cloudflare-docs (cloudflare-one/setup).
- Inicio de sesión con **One-time PIN**: quien abre la web escribe su email y, si está en la política, recibe un código. Fuente: cloudflare-docs (identity-providers/one-time-pin).
- Aplicaciones:
  - `admin.` → solo el email del administrador.
  - **Tienda** (raíz y `www`) → el administrador + familiares que prueben (sus emails en la política). Así no la indexa nadie mientras sea de prueba.
  - `api.` **sin** Access: la llaman el storefront del navegador y los webhooks de Stripe. Se protege con CORS, rate limiting y `X-Robots-Tag`.
- Máquinas (Lighthouse, k6, Uptime Kuma): **service token** (política «Service Auth», limitable por IP) o comprobación por WireGuard. Fuente: cloudflare-docs (access-controls/policies/common-policies).
- Además, `X-Robots-Tag: noindex, nofollow` en Caddy para todo el entorno de prueba (11-3), por si se quita Access.

### 2.4 Emails (Resend)

- Dominio `develop.hirobordercollie.es` **verificado** (DKIM en `resend._domainkey.develop.`, SPF/MX en `send.develop.`, DMARC `p=none` en la raíz). Fuente: resend-docs (knowledge-base/what-if-my-domain-is-not-verifying).
- `EMAIL_FROM="El Rincón de Hiro <pedidos@develop.hirobordercollie.es>"`.
- `EMAIL_REPLY_TO` y `SHOP_NOTIFY_EMAIL`: dirección personal del usuario hasta tener las de empresa (una dirección inexistente perdería las respuestas de los clientes).
- Los emails llegan de verdad: a las direcciones del usuario y de su familia.

### 2.5 R2

- Bucket de imágenes de prueba con el dominio propio `imagenes.` (se **reutiliza** el bucket `imagenes`, que ya tiene el dominio conectado: su contenido de pruebas se borra en 11-4) y un **bucket privado de backups** (11-7), cada uno con su token de API limitado a ese bucket (Object Read & Write). Fuente: cloudflare-docs (r2/buckets/public-buckets, r2/api/tokens).

### 2.6 Stripe

- La cuenta de **test** de siempre. En 11-5: endpoint de webhook nuevo `https://api.hirobordercollie.es/hooks/payment/stripe_stripe` y su `STRIPE_WEBHOOK_SECRET`. Las claves solo en `docker/.env.prod` del VPS.

### 2.7 Imagen del storefront

- La construye y la sube el usuario a GHCR desde el portátil (PAT clásico con `write:packages` en la organización, ya creado), contra la API ya desplegada (11-6). Tag `sha-<7>` igual que el backend (CI publica el storefront solo como `…-fixtures`, así que no choca) y `IMAGE_TAG` único en el compose.

## 3. Decisiones tomadas

| Decisión                                                                                                            | Motivo                                                                                                                                  | Fuente consultada                                                                                        |
| ------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Tienda en la raíz, `api.`, `admin.`, `imagenes.`; emails desde `develop.`                                           | Primer nivel = certificados gratuitos (Universal SSL + Origin CA)                                                                       | cloudflare-docs; usuario                                                                                 |
| Reinstalar el VPS (Rebuild de Hetzner)                                                                              | Estado desconocido tras meses con otro despliegue                                                                                       | usuario                                                                                                  |
| SSH solo por WireGuard (túnel directo portátil ↔ VPS)                                                               | IP dinámica del usuario; no exponer SSH a Internet                                                                                      | usuario                                                                                                  |
| Access en `admin.` y en la tienda; `api.` sin Access; `X-Robots-Tag: noindex`                                       | Dominio de prueba que no debe indexarse; los webhooks y el navegador necesitan `api.`                                                   | cloudflare-docs; usuario                                                                                 |
| `api.` solo para el webhook de Stripe (WAF); build del storefront por WireGuard                                     | El navegador no llama a la Store API; menos superficie (probar códigos o vaciar stock sin el límite de `/checkout/`)                    | código del storefront; usuario                                                                           |
| Authenticated Origin Pulls + firewall solo Cloudflare                                                               | Aunque se conozca la IP, el origen solo acepta peticiones que pasan por Cloudflare (y su WAF)                                           | cloudflare-docs (authenticated-origin-pull)                                                              |
| Caché: manda el origen (`Cache-Control`); sin cabecera, no se cachea                                                | `private, no-store` → BYPASS; nada por usuario puede quedar en la CDN                                                                   | cloudflare-docs (cache-rules settings, cache-responses)                                                  |
| Sin Rocket Loader, Email Obfuscation, RUM, Speed Brain ni Bot Fight Mode                                            | Inyectan JS (presupuesto y CSP), precargan por su cuenta o bloquean webhooks sin poder saltarse                                         | cloudflare-docs                                                                                          |
| AOP **de zona** con CA propia (10 años) y certificado de cliente (5 años); la clave de la CA fuera del VPS          | El certificado global es común a todas las cuentas de Cloudflare: otra zona podría llegar a nuestro origen sin pasar por nuestro Access | cloudflare-docs (authenticated-origin-pull/set-up/zone-level, global)                                    |
| Caddy: mTLS `require_and_verify` + Origin CA; `trusted_proxies` estático con los rangos de Cloudflare               | Imagen oficial sin módulos extra; los rangos se revisan junto al firewall                                                               | context7 `/websites/caddyserver` (directives/tls, caddyfile/options)                                     |
| HTML estático `s-maxage=86400` (Caddy) + purga en cada despliegue                                                   | Lo que de verdad aguanta el pico (analisis-js §5 P5); el navegador revalida siempre                                                     | cloudflare-docs (cache-rules: «use cache-control header if present»); usuario                            |
| CSP por hashes de Astro (`<meta>`) + cabecera de Caddy para `frame-ancestors`/`base-uri`/`form-action`/`object-src` | `<meta>` no admite esas directivas; `staticHeaders` del adapter Node asigna mal las rutas                                               | astro-docs (security.csp); MCP stripe (security/guide, CSP de Stripe.js); código de @astrojs/node 11.1.7 |
| Solo 443/tcp (sin 80 ni HTTP/3)                                                                                     | Full (strict): Cloudflare siempre conecta por 443; el 80 lo redirige Cloudflare                                                         | cloudflare-docs (full-strict); usuario                                                                   |
| HSTS 1 año sin `includeSubDomains`                                                                                  | El dominio tendrá otros usos                                                                                                            | usuario                                                                                                  |
| Imagen del storefront construida y publicada por el usuario                                                         | El VPS va justo para el build (2 vCPU, 4 GB)                                                                                            | ESTADO §6.0; usuario                                                                                     |

## 4. Cómo usarlo

### 4.1 VPS base (11-1)

Hecho por el usuario en el VPS, con los comandos que se le pasaron. Resumen para poder repetirlo:

| Paso | Qué                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Fuente                                                                      |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| A    | Rebuild con Debian 13 + clave SSH; regla temporal TCP 22 solo desde la IP del usuario                                                                                                                                                                                                                                                                                                                                                                                 | panel de Hetzner                                                            |
| B    | `apt full-upgrade`; usuario `deploy` (sudo con contraseña, la clave de root copiada); swap de 2 GB (`/swapfile`, `vm.swappiness=10`); zona `Europe/Madrid`; `unattended-upgrades` con reinicio automático a las **04:30** (`/etc/apt/apt.conf.d/52unattended-upgrades-local`) y **`20auto-upgrades` escrito a mano** (`APT::Periodic::Update-Package-Lists "1"` y `Unattended-Upgrade "1"`): `dpkg-reconfigure -f noninteractive` responde «no» y lo deja sin activar | `/jnv/ansible-role-unattended-upgrades`                                     |
| C    | WireGuard punto a punto `10.77.0.0/30` (VPS `.1`, portátil `.2`), UDP propio; en el VPS `wg-quick@wg0`; en el portátil, conexión `wg-vps` de NetworkManager (importada, `AllowedIPs` solo `10.77.0.1/32`, MTU 1340 para ir también dentro del túnel del homelab, sin autoconexión)                                                                                                                                                                                    | `/wireguard/wireguard-tools`, `/websites/networkmanager_dev`                |
| D    | `/etc/ssh/sshd_config.d/10-hardening.conf`: sin root, sin contraseña, `AllowUsers deploy`, `MaxAuthTries 3`. SSH **solo por el túnel** (el firewall de Hetzner no abre el 22; `sshd` escucha en todas las interfaces para poder volver a abrirlo en una emergencia)                                                                                                                                                                                                   | —                                                                           |
| E    | Docker del repositorio oficial (`docker.sources`), versiones fijadas y en `apt-mark hold`: `docker-ce` 29.9.1, `containerd.io` 2.4.2, `docker-buildx-plugin` 0.38.0, `docker-compose-plugin` 5.6.0. `daemon.json`: log `local` (10 MB), `live-restore`. `deploy` en el grupo `docker`                                                                                                                                                                                 | `/docker/docs` (engine/install/debian, logging/drivers/local, live-restore) |
| F    | Firewall de Hetzner: TCP 80/443 solo desde los rangos de Cloudflare (`cloudflare.com/ips-v4` y `ips-v6`), UDP de WireGuard desde cualquier origen, ICMP. Todo lo demás se descarta (por defecto en Hetzner)                                                                                                                                                                                                                                                           | `/websites/hetzner_cloud` (Firewalls)                                       |

- Entrar: `nmcli connection up wg-vps && ssh deploy@10.77.0.1`.
- **IP del origen**: durante la prueba sigue el registro sin proxy `ssh.` (endpoint del túnel). **Antes de producción**: borrarlo, endpoint de WireGuard por IP y, después, IP primaria nueva en Hetzner (la actual estuvo publicada en DNS; queda en históricos). Regla: ningún A/AAAA sin proxy hacia el VPS. Aunque se conozca la IP, 80/443 solo aceptan a Cloudflare.
- Emergencia (túnel caído): consola web de Hetzner, o regla temporal TCP 22 desde la IP del momento.
- **Rangos de Cloudflare**: cambian muy de vez en cuando. Revisarlos al tocar el firewall o Caddy (`trusted_proxies`, 11-3).
- Caddy sin `443/udp` (HTTP/3): Cloudflare llega al origen por TCP.

### 4.2 Cloudflare (11-2)

Todo en el panel (lo hace el usuario). Fuentes: cloudflare-docs (ssl/origin-configuration: Origin CA, Full strict, Authenticated Origin Pulls; edge-certificates; cache/how-to/cache-rules y cache/concepts/cache-responses; waf/rate-limiting-rules; cloudflare-one: setup, one-time-pin, common-policies; rules/url-forwarding; speed: rocket-loader, speed-brain, RUM beacon; waf/tools/scrape-shield/email-address-obfuscation; waf/feature-interoperability).

| #   | Qué                                                                                                                                                                                        |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | DNS: raíz, `api` y `admin` con proxy (A + AAAA al VPS), `www` CNAME con proxy. `imagenes` (R2) y los registros de Resend sin tocar                                                         |
| 2   | SSL/TLS **Full (strict)**, TLS mínimo 1.2, TLS 1.3, Always Use HTTPS. HSTS **no** en Cloudflare (lo pone Caddy, sin `preload` ni `includeSubDomains`)                                      |
| 3   | Certificado **Origin CA** ECC (`hirobordercollie.es` + `*.hirobordercollie.es`, 15 años) en `/opt/ecommerce/certs/` del VPS                                                                |
| 4   | **Authenticated Origin Pulls** global (Caddy exige el certificado de cliente de Cloudflare en 11-3)                                                                                        |
| 5   | Redirect Rule 301 `www` → raíz                                                                                                                                                             |
| 6   | Off: Rocket Loader, Email Obfuscation, inyección de Web Analytics, Speed Brain, Bot Fight Mode (no se puede saltar en Free: bloquearía webhooks y k6). Browser Cache TTL = respetar origen |
| 7   | Zero Trust Free + One-time PIN. Access: `admin.` (24 h, solo el administrador) y tienda raíz + `www` (7 días, familia). Máquinas: service token (11-9)                                     |
| 8   | WAF (custom rule, Free = 5 sin regex): en `api.` solo `POST /hooks/payment/*`; el resto, 403                                                                                               |
| 9   | Cache Rules: tienda «eligible», Edge TTL «usar Cache-Control si existe, si no bypass» (manda el origen); `api.` y `admin.` bypass                                                          |
| 10  | Rate limiting (1 regla en Free, solo por ruta): entrar, registro, recuperar, restablecer y `/checkout/`, 8 peticiones / 10 s por IP, bloqueo 10 s                                          |

- **`api.` no la usa el navegador**: el storefront habla con Medusa por la red interna (`backend-server:9000`), Stripe.js con Stripe, el Admin por `admin.` y las imágenes salen de R2. Solo hace falta el webhook de Stripe. El build del storefront (11-6) lee la API **por el túnel WireGuard**, no por `api.`.
- El código de descuento se aplica con `/checkout/?_action=checkout.applyCode` (no llega `POST /store/carts/:id/code` desde fuera): entra en el rate limiting de `/checkout/`.
- La búsqueda no cabe en la única regla del plan Free: sugerencias y filtros van con `s-maxage=60` en la CDN; se mide con k6 (11-10).

### 4.3 Caddy y CSP (11-3)

**Caddy** (`docker/Caddyfile`, imagen `caddy:2.11.7-alpine`):

- **TLS** (`CADDY_TLS_MODE`): `cloudflare` (por defecto) = certificado Origin CA (`/certs/origin.pem` + `origin.key`) y **mTLS**: `client_auth { mode require_and_verify; trust_pool file /certs/aop-ca.pem }`. Sin el certificado de cliente que presenta Cloudflare (Authenticated Origin Pulls **de zona**, firmado por nuestra CA), el handshake falla. `internal` = CA local de Caddy (prueba local de la fase 10).
- **IP real**: `trusted_proxies static <rangos de Cloudflare>` + `client_ip_headers CF-Connecting-IP` (los mismos rangos que el firewall de Hetzner, §4.1).
- **Cabeceras** (los tres dominios): HSTS 1 año (sin `includeSubDomains` ni `preload`), `X-Content-Type-Options`, `Referrer-Policy`, sin `Server`. Tienda: `X-Frame-Options DENY` y una CSP en cabecera con lo que no admite el `<meta>` (`frame-ancestors`, `base-uri`, `form-action`, `object-src`). `X-Robots-Tag: noindex, nofollow` en la tienda según `ROBOTS` (`noindex` por defecto) y siempre en `api.` y `admin.`.
- **Caché**: `/_astro/*` inmutable 1 año; el **HTML prerenderizado** (`public, max-age=0` de `@astrojs/node`) pasa a `public, max-age=0, s-maxage=86400`: Cloudflare lo guarda 24 h y el navegador revalida (ETag → 304). Las rutas por usuario (`private, no-store`), las server islands (`s-maxage=60`) y los 404 no se tocan.
- **Solo 443/tcp** publicado (sin 80 ni 443/udp).
- **Tras cada despliegue: purgar la caché de Cloudflare** (Caching → Configuration → **Purge Everything**). El HTML viejo apunta a ficheros de `/_astro/` que ya no existen en la imagen nueva.

**CSP del storefront** (`astro.config.mjs`, `CSP_ENABLED = true`, se fija en el build):

- Astro escribe en cada página un `<meta http-equiv="content-security-policy">` con `script-src`/`style-src` = `'self'` + hashes de los scripts/estilos inline (runtime de server islands, LiveSync, ThemeInit, `@font-face`, SwatchStyles), más `CSP_DIRECTIVES`: `default-src 'self'`, `img-src 'self' data: <origen de IMAGE_BASE_URL> https://*.stripe.com`, `font-src 'self'`, `connect-src 'self' https://api.stripe.com`, `frame-src https://js.stripe.com https://*.js.stripe.com https://hooks.stripe.com`. `script-src` añade `https://js.stripe.com https://*.js.stripe.com`. En las rutas on-demand Astro la manda también en cabecera.
- `markdown.syntaxHighlight: false`: Shiki usa estilos en línea (incompatibles con la CSP) y el contenido no tiene bloques de código.
- **Regla nueva**: un `<style>`/`<script>` inline que registre su hash con `Astro.csp` debe ir en el `<head>` (`slot="head"` del layout) o en una server island. Desde un componente del `<body>` el hash llega tarde (Astro ya ha escrito el `<meta>`) y el navegador lo bloquea. Por eso `SwatchStyles` sale ahora de `ColorPicker` y lo pone cada página con `slot="head"`. Nada de `style="…"` ni `on*=` en el HTML.
- El `<meta>` va detrás de los primeros scripts/estilos del `<head>`, pero sus hashes los cubren: el navegador aplica la política a medida que la lee y estos están en ella (comprobado con Chromium: 0 violaciones). `staticHeaders` de `@astrojs/node` (CSP en cabecera también en lo estático) se probó y no vale: su búsqueda por ruta (`pathname.includes`) asigna mal la home y las páginas sin barra final.

### 4.4 Authenticated Origin Pulls de zona (11-3)

| Pieza                                                               | Dónde                                                                                             | Caduca          |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | --------------- |
| CA propia `CN=Hiro AOP CA` (`aop-ca.pem`, pública)                  | VPS `/opt/ecommerce/certs/aop-ca.pem` + copia del usuario                                         | **15-oct-2036** |
| Clave de la CA (`aop-ca.key`, cifrada con contraseña)               | **solo** fuera de línea (gestor de contraseñas / USB del usuario); nunca en el VPS                | —               |
| Certificado de cliente `CN=hirobordercollie.es` (5 años) + su clave | subidos a Cloudflare (SSL/TLS → Origin Server → AOP → Zone-level); la clave, borrada del portátil | **17-oct-2031** |
| Origin CA (servidor)                                                | VPS `/opt/ecommerce/certs/origin.pem` + `origin.key`                                              | 13-oct-2041     |

Alerta de Cloudflare «Zone-level Authenticated Origin Pulls Certificate Expiration» (30 y 14 días antes).

**Renovar el certificado de cliente** (antes de oct-2031), con la carpeta de la CA (`aop-ca.key`, `aop-ca.pem`, `aop-ca.srl`, `aop-client.ext`):

```bash
umask 077
openssl req -new -nodes -newkey rsa:4096 -keyout aop-client.key -subj "/CN=hirobordercollie.es" -out aop-client.csr
openssl x509 -req -in aop-client.csr -CA aop-ca.pem -CAkey aop-ca.key -CAserial aop-ca.srl -days 1825 -sha256 -extfile aop-client.ext -out aop-client.pem
# Cloudflare → AOP → Zone-level → Upload (el nuevo) → activar → borrar el antiguo; luego shred -u aop-client.key aop-client.csr
```

`aop-client.ext`: `basicConstraints=CA:FALSE`, `keyUsage=digitalSignature,keyEncipherment`, `extendedKeyUsage=clientAuth`. Renovar la CA (antes de oct-2036) = crear otra, cambiar `aop-ca.pem` en el VPS (recargar Caddy) y subir un certificado de cliente firmado por ella.

Comprobado (18-oct-2026): `openssl s_client` en el VPS → Origin CA y `Acceptable client certificate CA names: CN=Hiro AOP CA`; `curl` sin certificado de cliente → handshake rechazado (exit 56); a través de Cloudflare `POST api./hooks/payment/…` → **502** (TLS + mTLS correctos, backend aún apagado); puerto 80 cerrado.

### 4.5 R2 y Resend (11-4)

| Pieza                        | Configuración                                                                                                                                                                                                                                                                 |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bucket `imagenes`            | Location hint WEUR (sin jurisdicción → endpoint `https://<account_id>.r2.cloudflarestorage.com`, **sin** `/imagenes` al final). Vaciado. Dominio `imagenes.hirobordercollie.es` activo; `r2.dev` desactivado. Sin CORS (solo `<img>` y descargas del build desde el servidor) |
| Token `vps-pruebas-imagenes` | Object Read & Write **solo** `imagenes`, 1 año → `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` en `.env.prod`                                                                                                                                                                   |
| Bucket `hiro-backups`        | Jurisdicción **EU** (endpoint `https://<account_id>.eu.r2.cloudflarestorage.com`), privado, regla de ciclo de vida «borrar a los 30 días»                                                                                                                                     |
| Token `vps-pruebas-backups`  | Object Read & Write **solo** `hiro-backups`, 1 año; en el gestor de contraseñas del usuario hasta la 11-7                                                                                                                                                                     |
| Resend `vps-pruebas`         | Sending access, solo `develop.hirobordercollie.es` → `RESEND_API_KEY`. Seguimiento de aperturas/clics desactivado (por defecto)                                                                                                                                               |
| Logo de los emails           | `imagenes/email/logo.png` (`image/png`, `Cache-Control: public, max-age=86400`) → `EMAIL_ASSETS_URL=https://imagenes.hirobordercollie.es`                                                                                                                                     |

- Subir/borrar objetos sin instalar nada: `curl --aws-sigv4 "aws:amz:auto:s3" --user "$KEY:$SECRET" -T fichero "$S3_ENDPOINT/<bucket>/<clave>"`.
- Las fotos de los productos las sube Medusa (`images:import`, 11-5): guarda la referencia en la BD.
- **UTF-8**: `EMAIL_FROM` lleva «ó». Comprobar con `grep -a '^EMAIL_FROM=' .env.prod | od -c` (`303 263`). Para JSON a mano, `\u00f3` y `--data-binary @fichero` (una línea larga pegada en la terminal dio 400 «Request body must be valid JSON»).

Fuentes: cloudflare-docs (r2/api/tokens, r2/reference/data-location, r2/buckets/public-buckets, object-lifecycles, bucket-locks, cors; changelog «Empty a bucket»); resend-docs (api-keys/create-api-key: `sending_access` + `domain_id`; dashboard/domains/tracking; emails/send-email: `Idempotency-Key`); código de `@medusajs/file-s3` 2.21.2.

### 4.6 Datos en el VPS (11-5)

Todo con `./dc` (`/opt/ecommerce/dc`: `docker compose --env-file .env.prod -f compose.prod.yml` con el entorno **vacío**, `env -i`). **Regla**: nunca `export`/`source .env.prod` ni variables con secretos en la shell del VPS. Compose da prioridad a las variables de la shell sobre `--env-file` (Docker docs, _variable-interpolation → precedence_): una `MEILISEARCH_API_KEY=pendiente` que se quedó en la shell tapaba la buena y el backend no arrancaba («The provided API key is invalid»). Un contenedor guarda las variables de cuando se creó: tras cambiar `.env.prod`, `./dc up -d --wait <servicio>` (lo recrea). Ver valores sin mostrarlos: `grep -c '^VAR=prefijo' .env.prod` o `./dc exec -T <svc> sh -c 'printenv VAR | cut -c1-8'`.

| Paso        | Comando / acción                                                                                                                                                                                                                                                                                                                           |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Stripe test | Endpoint `vps-pruebas` → `https://api.hirobordercollie.es/hooks/payment/stripe_stripe`, eventos `payment_intent.amount_capturable_updated`, `.succeeded`, `.payment_failed`, `.partially_funded`. `STRIPE_API_KEY` (la `sk_test` de siempre), `STRIPE_WEBHOOK_SECRET` (el del endpoint, no el de la CLI) y `PUBLIC_STRIPE_PUBLISHABLE_KEY` |
| Infra       | `IMAGE_TAG=sha-4ad9972`; `./dc up -d --wait postgres redis meilisearch`; key propia de Meilisearch con la master key (`POST /keys`, fase10 §4.3) → `MEILISEARCH_API_KEY`                                                                                                                                                                   |
| Backend     | `./dc up -d --wait backend-server` (migra) y `backend-worker` (no migra)                                                                                                                                                                                                                                                                   |
| Seed        | `./dc exec -T backend-server ./node_modules/.bin/medusa exec ./src/scripts/seed.js` → publishable key a `MEDUSA_PUBLISHABLE_KEY`; `stripe-region.js`                                                                                                                                                                                       |
| Catálogo    | `catalog/mock` y `catalog/plantilla/correas` por `scp` y `./dc cp` al contenedor (no van en la imagen: `.dockerignore`); `import-catalog.js catalog/mock` (dry-run antes) y `correas-sync.js catalog/correas`                                                                                                                              |
| Fotos       | `mock-images.js` (picsum, ~460 MB, en el contenedor) e `import-images.js .cache/mock-images` → R2. Después se borran `.cache/mock-images` y `catalog` del contenedor y `datos/` del VPS                                                                                                                                                    |
| Admin       | `medusa user -e <email> --invite` → token en la terminal (no se envía email; caduca en 24 h) → `https://admin.hirobordercollie.es/app/invite?token=…`                                                                                                                                                                                      |

Resultado (18-oct-2026): 306 productos (`/store/products` con la publishable key), fotos desde `imagenes.hirobordercollie.es`, región España solo con Stripe, índice `product` en Meilisearch, Admin con usuario propio. «Send test event» de Stripe → **200** y 0 errores de firma en el worker. Medusa responde 200 a todo POST en `/hooks/payment/*` y verifica la firma después, en el worker (`payment-webhook` → `constructEvent`; código de `@medusajs/medusa` 2.21.2): mirar siempre los logs del worker. Memoria en reposo: server ~280 MB, worker ~330 MB, Postgres ~50 MB, Meilisearch ~70 MB, Redis ~13 MB, Caddy ~15 MB.

Fuentes: context7 `/medusajs/medusa` (medusa-cli `user --invite`, deployment/general, Stripe provider «Setup Stripe Webhooks»); meilisearch-docs (create API key); código de `@medusajs/payment-stripe` 2.21.2.

### 4.7 Storefront real (11-6)

- **Build en el portátil** contra el backend del VPS por un túnel SSH (por WireGuard) al loopback: `docker/compose.prod.build.yml` publica la Store API solo en `127.0.0.1:19000` del VPS.
  1. VPS: `./dc -f compose.prod.build.yml up -d --wait backend-server`.
  2. Portátil: `ssh -N -L 19000:127.0.0.1:19000 deploy@10.77.0.1` (terminal aparte).
  3. `git worktree add /tmp/build-main main` (la imagen = el commit del tag).
  4. Publishable key del VPS a un fichero temporal (`ssh … grep … > /tmp/pk`, `chmod 600`) y `docker build --network host -f apps/storefront/Dockerfile --build-arg SITE_URL=https://hirobordercollie.es --build-arg IMAGE_BASE_URL=https://imagenes.hirobordercollie.es --build-arg MEDUSA_BACKEND_URL=http://localhost:19000 --secret id=medusa_publishable_key,src=/tmp/pk -t ghcr.io/elrincondehiro/ecommerce-storefront:sha-<7> .`; `shred -u /tmp/pk`.
  5. `docker push` (login en GHCR con el PAT del usuario, `write:packages`); `git worktree remove`.
  6. VPS: `./dc pull storefront && ./dc up -d --wait storefront`; `./dc up -d --wait backend-server` (sin el override: cierra el 19000).
  7. Cloudflare → **Purge Everything**.
- Sin `ASTRO_KEY` fija (cada build tiene la suya; con la purga en cada despliegue no hace falta).
- **Tags**: durante la fase, `sha-<7>` (mismo tag para backend y storefront). `v0.1.0` al cerrar la fase 11; lo crea el usuario (AGENTS §8.3).

### 4.8 Backups (11-7)

Ficheros en `docker/backup/` → en el VPS, `/opt/ecommerce/backup/`:

| Fichero                               | Qué hace                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `backup.sh`                           | `pg_dump -Fc` (dentro del contenedor, por tubería) → `age -r <clave pública>` → fichero `.dump.age`; tar.gz de la configuración (`.env.prod`, `certs/`, compose, Caddyfile, `dc`, `backup.env`) → `.tar.gz.age`; subida a R2 con `curl --aws-sigv4` y comprobación del tamaño (`HEAD`); copia local de las últimas `KEEP_LOCAL` (3); heartbeat a Uptime Kuma (`up` con el tamaño, `down` con el paso que falló) |
| `backup.env.example`                  | Clave pública de age, endpoint `.eu` + token de `hiro-backups`, `KUMA_PUSH_URL`. En el VPS: `backup/backup.env`, `600`, separado de `.env.prod`                                                                                                                                                                                                                                                                 |
| `ecommerce-backup.service` / `.timer` | `oneshot` como `deploy`, `ProtectSystem=full`, `NoNewPrivileges`; cada día **03:30 Europe/Madrid** (`Persistent=yes`, ±5 min), antes del reinicio de las 04:30                                                                                                                                                                                                                                                  |
| `restore-test.sh`                     | En el **portátil** (tiene la clave privada): descarga el último dump de R2 → `age -d` → por SSH a `pg_restore --no-owner --single-transaction` en una BD nueva `medusa_restore_test`; compara recuentos con la real y la borra                                                                                                                                                                                  |

- **Cifrado con age** (clave pública en el VPS): quien tenga el VPS o el token de R2 no puede leer los backups. La clave privada, solo en el gestor de contraseñas del usuario. El dump **nunca** está en claro en un disco (ni en el VPS ni en el portátil).
- En R2: `postgres/AAAA/MM/medusa-AAAAMMDD-HHMMSS.dump.age` y `config/AAAA/MM/config-….tar.gz.age`; el ciclo de vida del bucket borra a los 30 días.
- No se copian Meilisearch (se reindexa desde la BD), Redis (colas y caché) ni las fotos (ya en R2).
- Probado en local (19-oct-2026, contra SeaweedFS y un Postgres 17.11 con `sh` de Debian 13 y `age` 1.2.1 del paquete de trixie): backup OK, retención local, `down` en Kuma con Postgres parado, sin `age` y con una credencial de R2 mala (y sin borrar las copias locales buenas), restauración con los mismos recuentos, nada de secretos en el log.

**En el VPS (19-oct-2026)**: primer backup a mano `OK` (`medusa-20261019-191938.dump.age` + `config-…` en `hiro-backups`); timer activo (`next: 20-oct 03:33:46 CEST`). **Restauración probada desde R2** con `restore-test.sh` en el portátil: `restaurada 306 · 1430 · 1 · 2` = `real 306 · 1430 · 1 · 2` (productos · variantes · pedidos · clientes). El `NOTICE … does not exist, skipping` es del `dropdb --if-exists` previo.

**Desastre (VPS perdido)**: VPS nuevo (§4.1) → descargar el último `config-….tar.gz.age` y descifrar en el portátil (`age -d -i <clave> … | tar -xzf - -C /opt/ecommerce`) → `./dc up -d --wait postgres redis meilisearch` → `pg_restore -d "$POSTGRES_DB" --no-owner --single-transaction` con el backend parado → `./dc up -d --wait backend-server backend-worker storefront caddy` → reindexar Meilisearch (`POST /admin/search-indexes/:id/reindex` o `db:migrate`).

Fuentes: context7 `/websites/postgresql_17` (backup-dump, app-pgrestore: `--no-owner`, `--single-transaction`), `/filosottile/age` (README: `-r`, `-d -i`), `/louislam/uptime-kuma-wiki` (Internal-API: push), `/systemd/systemd` (timers: `OnCalendar` con zona horaria, `Persistent`, `RandomizedDelaySec`); `systemd-analyze calendar` y `verify`; cloudflare-docs (R2, 11-4).

### 4.9 Monitorización (11-8)

```
 HOMELAB: VM monitor-kbd (Proxmox 230, 10.0.10.230)      VPS (10.77.0.1)
 Uptime Kuma :3001 ── HTTPS por Cloudflare (service token) ──▶ tienda / admin / api
             └─ ping por el túnel ───────────────────────────▶ 10.77.0.1
 Beszel hub  :8090 ── SSH (clave del hub) ────────────────────▶ beszel-agent 10.77.0.1:45876
 Dozzle      :8080 ── TLS mutuo (certificado propio) ─────────▶ dozzle agent 10.77.0.1:7007
 Kuma :3001 en 10.77.0.3 ◀── heartbeat del backup (push) ─────  backup.sh
```

- **VM** `Monitor_KBD` (Proxmox; hostname `monitor-kbd`, Linux no admite `_`): Debian 13, 2 vCPU, 2 GB, 20 GB, QEMU guest agent (se activa en Proxmox → Options y arranque en frío; el servicio no se «enable»: lo arranca udev). Base como el VPS (§4.1): `deploy` sin contraseña de root, SSH solo con clave, `unattended-upgrades` con reinicio a las **05:00** (media hora después del VPS), Docker 29.9.1 en `hold`. En la VM el locale es `es_ES.UTF-8`: para filtrar mensajes del sistema, `LC_ALL=C`.
- **WireGuard** del VPS de `/30` a **`/24`**: VPS `.1`, portátil `.2`, VM `.3` (`AllowedIPs=10.77.0.1/32`, `PersistentKeepalive=25`; sale por la IP de casa, sin abrir puertos en el router). En la VM y en el VPS, `docker.service.d/10-after-wireguard.conf` (`After=wg-quick@wg0`): Kuma publica en `10.77.0.3` y los agentes escuchan en `10.77.0.1`, IPs que no existen hasta que sube el túnel.
- **`docker/monitoring/compose.homelab.yml`** (VM, `/opt/monitor`, `./dcm`): Uptime Kuma 2.5.6, Beszel 0.21.0 (hub + agente local por socket), Dozzle v11.3.2 (login `simple`, `./dozzle-data/users.yml` con `dozzle generate`; sin acciones ni shell). Interfaces solo en `10.0.10.230` (LAN y WireGuard del homelab).
- **`docker/monitoring/compose.agents.yml`** (VPS, `/opt/monitor-agents`, `./dcm`): `beszel-agent` (`LISTEN=10.77.0.1:45876`, modo SSH: sin `HUB_URL`) y Dozzle `agent` (`DOZZLE_AGENT_ADDR=10.77.0.1:7007`, TLS con el certificado de `dozzle generate-certs`, el mismo en los dos lados). ~12 MB cada uno.
- **Kuma**: notificaciones por **Resend** (API key `kuma-alertas`, solo envío, `alertas@develop.…`) y **ntfy** (`ntfy.sh`, tema secreto largo; solo avisos sin datos personales). Monitores:

  | Monitor                     | Qué comprueba                                                                                                                             |
  | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
  | Tienda                      | `https://hirobordercollie.es/health/` con el service token de Access en las cabeceras, cada 60 s; caducidad del certificado de Cloudflare |
  | Tienda + backend + búsqueda | `/buscar/sugerencias/?q=pienso` cada 120 s (503 si fallan Medusa o Meilisearch; avisa con retraso por la caché de 60 s + swr)             |
  | Admin (Access)              | `admin.` → 302 (sin seguir redirecciones), cada 300 s                                                                                     |
  | API (WAF)                   | `api.` → 403, cada 300 s                                                                                                                  |
  | VPS por el túnel            | ping a `10.77.0.1`, cada 60 s                                                                                                             |

  Todos los HTTP con **3 reintentos** (cada 20–30 s) y **timeout de 15 s**; el ping, 3 reintentos. Con 0 reintentos (la configuración inicial de Admin y API) cada corte de pocos segundos de la conexión de casa avisaba por email y ntfy (timeout de 48 s, `ECONNRESET`, «stream aborted»): desde la VM, 10 de 60 peticiones a `api.` tardaron 3,7–9 s (lo normal, ~0,1 s); `mtr` sin pérdidas reales hasta Cloudflare (el 41 % de un salto intermedio es su límite de respuestas ICMP). Con los reintentos queda en «Pending» y solo avisa una caída real (1–2 min).
  | Backup diario | Push, 26 h; `KUMA_PUSH_URL=http://10.77.0.3:3001/api/push/<token>` en `backup.env` |

- Probado (20-oct-2026): `ss` del VPS solo en `10.77.0.1:45876` y `:7007`; Kuma en `10.0.10.230:3001` y `10.77.0.3:3001`; Beszel con los dos sistemas; Dozzle con `monitor-kbd` y `vps-hetzner` (un duplicado offline desapareció al reiniciar la interfaz con el agente ya arrancado); pruebas de email y ntfy recibidas; todos los monitores en verde; heartbeat del backup; `./dc stop storefront` → avisos de **Down** y de **Up** por email y ntfy. En local: Dozzle rechaza un certificado ajeno; Beszel rechaza otra clave SSH y no ejecuta comandos; Dozzle sin login → 401.

Fuentes: context7 `/henrygd/beszel-docs` (agent/hub installation, security: SSH mode, notificaciones Shoutrrr), código de beszel 0.21.0 (`agent/server.go`: `LISTEN` con IP), `/amir20/dozzle` (agent, `generate-certs`, `DOZZLE_AGENT_ADDR`, authentication `simple`, FAQ «duplicate host»), `/louislam/uptime-kuma-wiki` (instalación, push), código de Uptime Kuma 2.5.6 (`server/notification-providers`: `resend`, `ntfy`…), resend-docs (SMTP).

## 5. Cómo testear esta fase

### 5.1 VPS base (11-1)

```bash
# Portátil
ping -c 3 10.77.0.1 && ssh deploy@10.77.0.1 'echo OK túnel'
timeout 5 ssh -p 22 deploy@ssh.hirobordercollie.es   # sin respuesta (filtrado)
# VPS (deploy)
sudo sshd -T | grep -E '^(permitrootlogin|passwordauthentication|allowusers)'   # no · no · deploy
sudo swapon --show; cat /proc/sys/vm/swappiness                                  # 2G · 10
systemctl is-active unattended-upgrades wg-quick@wg0 ssh docker                  # active ×4
apt-config dump | grep -E 'Periodic::(Update-Package-Lists|Unattended-Upgrade)'  # "1" ×2
sudo LC_ALL=C unattended-upgrade --dry-run -d 2>&1 | grep -i 'allowed origins'   # LC_ALL=C: con locale es_ES los mensajes salen en español
docker version --format '{{.Server.Version}}'; docker compose version --short    # 29.9.1 · 5.6.0
apt-mark showhold                                                                # los 5 paquetes de Docker
```

### 5.2 Cloudflare (11-2)

```bash
# DNS + proxy (origen apagado → 521)
for h in hirobordercollie.es api.hirobordercollie.es admin.hirobordercollie.es; do curl -s -o /dev/null -w "%{http_code} $h\n" https://$h/; done
curl -sI http://hirobordercollie.es/ | grep -iE "^(HTTP|location)"                # 301 → https
curl -sI "https://www.hirobordercollie.es/productos/?p=2" | grep -i location      # → https://hirobordercollie.es/productos/?p=2
# Access (tienda y Admin) → 302 a <team>.cloudflareaccess.com
curl -sI https://admin.hirobordercollie.es/ | grep -iE "^(HTTP|location)" | cut -c1-80
curl -sI https://hirobordercollie.es/ | grep -iE "^(HTTP|location)" | cut -c1-80
# WAF de api.: 403 403 403 y 521 (solo POST /hooks/payment/* pasa)
A=https://api.hirobordercollie.es
for x in "GET /admin" "GET /store/products" "GET /hooks/payment/stripe_stripe" "POST /hooks/payment/stripe_stripe"; do
  set -- $x; curl -s -o /dev/null -w "%{http_code} $x\n" -X $1 $A$2; done
# Rate limiting: 8 × 302 y luego 429; tras 12 s, otra vez 302
for i in $(seq 1 12); do curl -s -o /dev/null -w "%{http_code} " https://hirobordercollie.es/cuenta/entrar/; done; echo
# VPS: certificados
openssl x509 -in /opt/ecommerce/certs/origin.pem -noout -enddate -ext subjectAltName          # 2041 · raíz + *.
openssl x509 -in /opt/ecommerce/certs/cloudflare-aop-ca.pem -noout -enddate -fingerprint -sha256   # 2029 · 9A:1A:C2:…
```

Resultado (16-oct-2026): todo como se espera. El rate limiting cuenta también las peticiones que Access responde con 302.

### 5.3 Caddy y CSP (11-3)

```bash
# Repo (portátil)
pnpm lint && pnpm format:check && pnpm typecheck && pnpm test
pnpm --filter storefront build && pnpm --filter storefront check:budget
pnpm --filter storefront test:e2e                    # 187 passed, 9 skipped (con CSP)
pnpm --filter backend test:integration:http          # 44 passed
docker run --rm -v $PWD/docker/Caddyfile:/etc/caddy/Caddyfile:ro caddy:2.11.7-alpine caddy fmt /etc/caddy/Caddyfile >/dev/null   # sin aviso
```

Resultado en local (17-oct-2026), con Caddy y certificados de prueba (CA propia + certificado de cliente, `curl --resolve`):

| Petición                                                                    | Resultado                                                                                                          |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| sin certificado de cliente / de otra CA                                     | el handshake falla (`curl` exit 55)                                                                                |
| home (estático)                                                             | 200, `public, max-age=0, s-maxage=86400`, zstd, HSTS, nosniff, Referrer-Policy, X-Frame, X-Robots, CSP de cabecera |
| `/_astro/*.css`                                                             | `public, max-age=31536000, immutable` (una vez)                                                                    |
| `/carrito/`                                                                 | `private, no-store`, CSP de Astro + la de Caddy                                                                    |
| `/productos/` con `If-None-Match`                                           | 304                                                                                                                |
| `api.…/health` · `admin.…/`                                                 | 200 + `X-Robots-Tag` · 302 → `/app/` + `X-Frame-Options`                                                           |
| `LiveSyncData` (sin Caddy)                                                  | `public, max-age=30, s-maxage=60, stale-while-revalidate=300` (Caddy no lo toca: no es `max-age=0`)                |
| Chromium: home, listado, ficha, correa y landing, búsqueda, carrito, entrar | 0 violaciones de CSP                                                                                               |

### 5.4 R2 y Resend (11-4)

En el VPS, leyendo `.env.prod` sin mostrarlo (`get() { grep -E "^$1=" .env.prod | cut -d= -f2-; }`):

| Comprobación                                                   | Resultado (18-oct-2026)                                                                          |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `PUT` del logo con el token de imágenes                        | 200                                                                                              |
| `curl -sI https://imagenes.hirobordercollie.es/email/logo.png` | 200, `image/png`, `public, max-age=86400`                                                        |
| `PUT` en `hiro-backups` con el token de imágenes               | **403** (el token solo vale para su bucket)                                                      |
| `POST https://api.resend.com/emails` desde `pedidos@develop.…` | 200; email recibido con el logo (al principio sin imagen: tardó en estar disponible en el borde) |

### 5.5 Datos y storefront (11-5, 11-6)

Comprobaciones de máquina a través de Cloudflare Access con un **service token** (`pruebas-portatil`, 1 año; política «Service Auth» solo en la aplicación de la tienda, no en el Admin). En el portátil, fuera del repo: `~/.config/hiro-cf-token` (id y secret, `600`) y `~/.local/bin/cfcurl` (`curl -H "CF-Access-Client-Id: …" -H "CF-Access-Client-Secret: …" "$@"`).

```bash
cfcurl -s -o /dev/null -D - https://hirobordercollie.es/productos/ | grep -iE "^(cf-cache-status|cache-control)"   # ×2: MISS → HIT
cfcurl -s -o /dev/null -D - https://hirobordercollie.es/carrito/ | grep -i cf-cache-status                      # BYPASS
ISL=$(cfcurl -s https://hirobordercollie.es/productos/ | grep -oE '/_server-islands/LiveSyncData[^"]*' | head -1 | sed 's/&amp;/\&/g')
cfcurl -s -o /dev/null -D - "https://hirobordercollie.es$ISL" | grep -i cf-cache-status                         # ×2: MISS → HIT
cfcurl -s https://hirobordercollie.es/ | grep -ciE "cloudflareinsights|email-decode|rocket-loader|speculation"  # 0
curl -s -o /dev/null -w "%{http_code}\n" https://hirobordercollie.es/                                           # 302 (Access)
```

Resultado (18-oct-2026):

| Comprobación                                               | Resultado                                                                                                                                                                                                                                  |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Imagen `ecommerce-storefront:sha-4ad9972`                  | ~300 fichas, `https://hirobordercollie.es/` en el HTML                                                                                                                                                                                     |
| HTML estático (`/productos/`)                              | MISS → **HIT**                                                                                                                                                                                                                             |
| `LiveSyncData`                                             | MISS → **HIT**                                                                                                                                                                                                                             |
| `/carrito/`                                                | **BYPASS**                                                                                                                                                                                                                                 |
| Cabeceras                                                  | HSTS, nosniff, Referrer-Policy, X-Frame-Options, X-Robots-Tag, CSP de cabecera; `content-encoding: zstd`; `server: cloudflare` (el del origen se quita en Caddy). `alt-svc: h3` es el borde de Cloudflare hacia el visitante, no el origen |
| Scripts inyectados por Cloudflare                          | 0                                                                                                                                                                                                                                          |
| Navegador (home, listado, ficha, búsqueda, carrito, Admin) | todo correcto, sin errores de CSP                                                                                                                                                                                                          |
| Puertos publicados en el VPS                               | solo `0.0.0.0:443` (Caddy); el 19000 cerrado tras el build                                                                                                                                                                                 |

### 5.6 Pruebas de principio a fin (11-9)

**Acceso de las pruebas** (reglas **temporales** en Cloudflare, se quitan al acabar la 11-10): política **Bypass** de Access en la tienda y custom rule **Skip → rate limiting**, ambas solo para la IP pública de las pruebas. No se usa el service token en Playwright/Lighthouse: `extraHTTPHeaders`/`extraHeaders` lo enviarían también a Stripe y a R2.

**e2e contra el VPS**: `E2E_BASE_URL=https://hirobordercollie.es pnpm --filter storefront test:e2e` (`e2e/_remote.ts`: sin `webServer`, emails a `delivered+…@resend.dev`, se omiten los tests que leen Mailpit o usan scripts del backend local). Después: `./dc exec -T backend-server ./node_modules/.bin/medusa exec ./src/scripts/stock-mock.js`.

- 20-oct-2026: **143 passed, 47 skipped**; 6 fallos (3 tests × 2 proyectos) que eran de la adaptación, no de la tienda: `X-Robots-Tag` llega como `noindex, nofollow, noindex` (Caddy añade el suyo: ahora se comprueba que contenga `noindex`) y el checkout con puntos usaba la cuenta del test anterior, omitido en remoto (ahora se omite también). Tras corregirlos: 0 fallos.
- Cubre carrito con y sin JS, búsqueda y filtros, sugerencias, correas, interfaz, tema, relacionados, checkout sin JS y **pago con 4242, tarjeta rechazada y 3DS** (Stripe test).

**Lighthouse** (`lighthouserc.remote.cjs`, `pnpm --filter storefront lhci:remote`; Lighthouse 12.6.1, móvil, 4G lento simulado + CPU ×4, mediana de 3; caché de Cloudflare caliente):

| Página                      | Rend. | A11y | BP  | SEO\* | LCP    | FCP    | TBT | CLS   | TTFB  | Peso   | JS propio |
| --------------------------- | ----- | ---- | --- | ----- | ------ | ------ | --- | ----- | ----- | ------ | --------- |
| `/`                         | 100   | 100  | 100 | 61    | 1,24 s | 1,02 s | 0   | 0,002 | 66 ms | 288 KB | 5,7 KB    |
| `/productos/`               | 100   | 100  | 100 | 61    | 1,38 s | 1,03 s | 0   | 0,001 | 61 ms | 290 KB | 4,7 KB    |
| `/categoria/perro/`         | 100   | 100  | 100 | 61    | 1,38 s | 1,03 s | 0   | 0,038 | 75 ms | 273 KB | 4,7 KB    |
| `/categoria/piensos-perro/` | 100   | 100  | 100 | 61    | 1,53 s | 0,98 s | 2   | 0,001 | 27 ms | 289 KB | 4,7 KB    |
| ficha pienso                | 99    | 100  | 100 | 61    | 1,98 s | 0,98 s | 0   | 0     | 25 ms | 368 KB | 5,7 KB    |
| ficha granel                | 99    | 100  | 100 | 61    | 2,05 s | 1,00 s | 0   | 0     | 28 ms | 343 KB | 5,7 KB    |
| correa (grupo)              | 100   | 100  | 100 | 61    | 1,10 s | 0,95 s | 0   | 0,001 | 60 ms | 150 KB | 4,7 KB    |
| correa (color)              | 100   | 100  | 100 | 61    | 1,09 s | 0,94 s | 0   | 0,001 | 63 ms | 153 KB | 6,2 KB    |
| `/carrito/`                 | 100   | 100  | 100 | 61    | 1,45 s | 1,00 s | 0   | 0,001 | 63 ms | 128 KB | 2,8 KB    |

\* SEO 61 = esperado en el entorno de prueba: `is-crawlable` (el `X-Robots-Tag: noindex, nofollow` de Caddy, `ROBOTS=noindex`) y `robots-txt` (la línea `Content-Signal:` del **robots.txt gestionado de Cloudflare**, que se antepone al nuestro y Lighthouse no conoce: «Unknown directive»). Ninguno es un fallo de la tienda.

- **JS propio** = transferido (comprimido), con el script de Stripe fuera (no carga en estas páginas). Con 0 de TBT en todas.
- **LCP de las fichas** (~2 s, por encima de 1,8 s): la foto principal. Ya estaba apuntado (auditoría pre-fase 10 §6: ancho de 720 px). `image-delivery-insight` estima 34 KB de ahorro en imágenes y `uses-responsive-images`, 5 KB. Para la fase 13.
- `/carrito/` vacío: el LCP es el logo del pie (lazy); con productos cambia. `dom-size` avisa en los listados (24 tarjetas).

**Latencias** (portátil, wifi doméstica → Cloudflare MAD → Nuremberg; mediana de 5, TTFB):

| Petición                       | `cf-cache-status`           | TTFB       |
| ------------------------------ | --------------------------- | ---------- |
| Ficha (HTML estático)          | HIT                         | 69 ms      |
| `LiveSyncData` (server island) | HIT                         | 65 ms      |
| `/buscar/?q=pienso`            | HIT                         | 80 ms      |
| `/buscar/sugerencias/?q=pie`   | HIT                         | 67 ms      |
| `/carrito/`                    | BYPASS (VPS)                | 103 ms     |
| `/health/`                     | BYPASS (VPS)                | 112 ms     |
| Home y `/productos/`           | **REVALIDATED** (ver abajo) | 104–114 ms |

**Encontrado: la home y los listados se revalidaban en cada visita.** Cloudflare guardaba la página, pero al revalidar (`If-None-Match`) el origen respondía `304` con solo `public, max-age=0`: Caddy añadía `s-maxage` únicamente a los `200` con `Content-Type: text/html` (un 304 no lo lleva). Cloudflare se quedaba con el `max-age=0` del 304 y, desde entonces, preguntaba al VPS en cada visita (`REVALIDATED`, +40 ms, y carga en el origen). Arreglo en el Caddyfile: el matcher reconoce las páginas por la ruta (`*/`, `trailingSlash: always`) e incluye el `304`. Comprobado en local (Caddy 2.11.7 + `@astrojs/node`): 200 y 304 con `s-maxage=86400`; favicon, `/carrito/` y `/health/` sin cambios. Se despliega con el Caddyfile nuevo + purga de Cloudflare.

**Tras desplegar el arreglo** (Caddyfile + Purge Everything, 20-oct-2026, segunda pasada de Lighthouse): home, listados y correas pasan a **HIT** y su TTFB baja de 60–75 ms a **32–40 ms**; Rend. 100 en todo salvo la ficha de pienso (99, LCP 2,01 s); ficha granel 100 (LCP 1,83 s); CLS máx. 0,018 (`/categoria/perro/`); A11y y BP 100; SEO 61 (igual, esperado).

**Recorrido manual** (usuario, 20-oct-2026, todo correcto): registro → verificación → bienvenida → entrar/salir → recuperar contraseña; compra con cuenta (email con enlace a «Mis pedidos»); Admin: capturar el pago y marcar enviado (email de envío); puntos (`points-adjust.js`) y canje; códigos (`codes-create.js`); lista de deseos compartida; navegación sin JS; consola del navegador sin violaciones de CSP.

### 5.7 Prueba de carga (11-10)

**Herramienta**: k6 **2.3.0** (`grafana/k6:2.3.0`, Docker) en la VM `monitor-kbd`, nunca en el VPS. Script `loadtest/k6/tienda.js`, instrucciones en `loadtest/README.md`.

- **Visitas** (`ramping-arrival-rate`, cookies propias por VU): 88 % curiosean (home → listado al azar entre 5 → ficha al azar entre las 300 del sitemap, **con las server islands** que pediría el navegador: `HeaderState` y `LiveSyncData`), 10 % añaden al carrito (`POST /carrito/?_action=cart.add` sin JS → 303, con `Origin`: `checkOrigin` de Astro) y van a `/carrito/`, 2 % llegan a `/checkout/` (sin pagar); el 20 % busca (`/buscar/?q=`). Solo HTML e islands: lo estático lo sirve Cloudflare y el navegador lo tiene en caché inmutable.
- **Carga**: de 5 a **50 páginas HTML/s** en 2 min, **10 min a 50**, 1 min de bajada (~3,3 páginas por visita). Umbrales: errores < 1 % (`abortOnFail`), p95 < 500 ms páginas estáticas, < 800 ms islands, < 1,5 s carrito y checkout.
- **`Accept-Encoding: br, gzip`** en todas las peticiones: k6 no pide compresión por defecto y bajaba el HTML entero (`/productos/`: 290 KB en vez de ~20 KB). La primera prueba de humo daba p95 de 1 s por eso.
- **Tanda A** (vía Cloudflare, la real): la IP de casa con las reglas temporales (Bypass de Access, Skip del rate limiting). **Tanda B** (directa al origen, sin CDN): `docker/compose.prod.loadtest.yml` publica la tienda en `10.77.0.1:8443` (solo el túnel) y el sitio `loadtest_on` del Caddyfile la sirve con `tls internal` sin mTLS (mismo snippet `tienda`: mismas cabeceras, CSP y caché); k6 con `ORIGEN=1` (`hosts` + `insecureSkipTLSVerify`). Se cierra con `./dc up -d caddy`.

**Resultados (20-oct-2026)**:

|                              | **A: vía Cloudflare**                                         | **B: directa al VPS**                                                 |
| ---------------------------- | ------------------------------------------------------------- | --------------------------------------------------------------------- |
| Ritmo                        | **50 páginas/s** (34 751 páginas, 108 688 peticiones, 13 min) | **~23 páginas/s** (18 032 páginas); 5 017 visitas no empezaron        |
| Errores                      | **0 %**                                                       | 0,72 % (407 de 633 `cart.add` por tiempo agotado, 60 s)               |
| Páginas estáticas p50 / p95  | 56 ms / 646 ms ✗ (red de casa, ver abajo)                     | 93 ms / **104 ms**                                                    |
| Server islands p50 / p95     | 55 ms / 230 ms                                                | 3,9 s / **12,7 s** ✗                                                  |
| Carrito y checkout p50 / p95 | 213 ms / 618 ms                                               | 2,5 s / **60 s** ✗                                                    |
| Por caché de Cloudflare      | HIT p50 56 ms · MISS 119 ms · EXPIRED 176 ms · BYPASS 99 ms   | —                                                                     |
| VPS (Beszel)                 | CPU 60 %, RAM 2,3 GB, load 3,06 / 2,28 / 1,36                 | CPU 83 %, RAM 2,45 GB, load 5,32 / 3,66 / 2,60; alertas de CPU y load |
| CPU por contenedor (B)       | —                                                             | backend-server 49 %, Postgres 14,5 %, storefront 7,5 %, Caddy 5 %     |
| Logs (Dozzle)                | sin errores                                                   | sin errores ni avisos (las peticiones esperan, no fallan)             |

- **A**: el pico previsto (10–15 páginas/s) y el objetivo con margen (50 páginas/s) se atienden **sin errores** y con el VPS al 60 %. El p95 de las páginas estáticas no llega al umbral por la **conexión de casa**: las HIT ni tocan el VPS y tardan más que las islands (que sí llegan, pero pesan < 1 KB). Mismo síntoma que los 403 de 4–9 s de Kuma (§4.9). No se cambia el umbral a posteriori.
- **B** (el peor caso: sin CDN): las páginas estáticas aguantan sobradas; el límite es **Medusa** (`backend-server` es el contenedor que más CPU usa): con ~48 islands/s (precio/stock y carrito) se satura, se forman colas y las peticiones más lentas agotan el tiempo de espera. Capacidad aproximada del VPS sin Cloudflare: **~20 páginas/s** con todo lo dinámico. Sin Cloudflare no hay escenario real (tras una purga, cada página e island vuelve a la caché con su primera visita). Una tanda B2 a 20 páginas/s para afinar el límite se deja para más adelante.

Fuentes: context7 `/grafana/k6-docs` v2.3.x (ramping-arrival-rate, thresholds + `abortOnFail`, tags, `hosts`, `insecureSkipTLSVerify`, `setResponseCallback`/`expectedStatuses`, test lifecycle, web dashboard y `K6_WEB_DASHBOARD_EXPORT`, migración a v2), context7 `/websites/caddyserver` (snippets, `tls internal`); astro-docs (`security.checkOrigin`).

## 6. Criterio de salida

- [x] Tienda, API y Admin por HTTPS (Full strict) detrás de Cloudflare; Admin y tienda detrás de Access.
- [x] Pago test (4242 y 3DS), emails reales, imágenes desde R2, búsqueda, puntos, códigos, lista de deseos, relacionados y sin JS.
- [x] Backup en R2 y **restauración probada**.
- [x] Latencia medida y prueba de carga (50 páginas/s durante 10 min) documentada.

## 7. Pendientes / riesgos

- **AOP de zona**: certificado de cliente hasta el **17-oct-2031**, CA propia hasta el **15-oct-2036** (§4.4). Renovar antes o la tienda deja de responder (handshake rechazado → 525).
- **Logo de los emails**: con la tienda detrás de Access, Gmail/Outlook no pueden descargarlo de `STOREFRONT_URL`. En 11-4: subir `email/logo.png` a R2 y `EMAIL_ASSETS_URL=https://imagenes.hirobordercollie.es`.
- **robots.txt gestionado de Cloudflare** (Security → Settings → «Manage your robots.txt» / AI crawlers): antepone `Content-Signal:` y bloqueos de bots de IA. Decidir antes de producción si se deja (SEO de Lighthouse avisa de la directiva desconocida).
- Antes de producción: borrar `ssh.`, endpoint de WireGuard por IP e IP primaria nueva (§4.1).
- **Purga de Cloudflare en cada despliegue** (a mano hasta tener `deploy`): automatizarla con un token de solo «Cache Purge».
- `ROBOTS=index` y quitar Access de la tienda al abrir de verdad.
- **Caducan en oct-2027**: tokens R2 `vps-pruebas-imagenes` y `vps-pruebas-backups` (1 año) y, si se puso caducidad, la API key de Resend `vps-pruebas`. Antes de producción: tokens y key nuevos para el entorno definitivo.
- Bucket lock en `hiro-backups` (protección frente a borrado malicioso): valorarlo para producción.
- Service token de Access `pruebas-portatil` caduca en oct-2027.
- **Fase propia antes del despliegue definitivo — pedidos de invitado en la cuenta**: Medusa crea un cliente aparte (`has_account=false`) al comprar sin cuenta; al registrarse con el mismo email, el pedido sigue en el invitado y no sale en «Mis pedidos» ni da puntos (context7 `/medusajs/medusa`, _customer-accounts_: «The guest customer's orders stay linked to the guest customer»). Decidir: A (pasarlos automáticamente al verificar el email, subscriber + workflow) o B (transferencia oficial de Medusa con email y aceptación); puntos retroactivos; cliente con cuenta que compra sin iniciar sesión.
- **Caché de build en el portátil**: los cache mounts de BuildKit (`astro-cache`, `pnpm-store`) se borraban a las 48 h sin uso (política por defecto). `/etc/docker/daemon.json` del portátil con `builder.gc.policy` propia (60 días, `reservedSpace` 20 GB, `maxUsedSpace` 60 GB). No usar `docker builder prune` ni `system prune -a`. Comprobar: `docker buildx du --verbose | grep -A3 astro-cache`.
- **Capacidad sin Cloudflare ~20 páginas/s** (§5.7, tanda B; Medusa satura la CPU con las server islands). Para la fase 13, si hace falta: caché corta en memoria de `LiveSyncData` en Astro, el módulo de caché de Medusa sobre Redis (`MEDUSA_FF_CACHING`, consultar antes) o la L-2 de ESTADO §7; repetir la tanda B (y la B2 a 20 páginas/s) tras cambiarlo.
- **Reglas temporales de Cloudflare** de las pruebas (Bypass de Access y Skip del rate limiting para la IP de casa): **quitadas** al cerrar la fase. Para repetir e2e, Lighthouse o k6, volver a crearlas solo mientras duren.
- Carritos de las pruebas de carga (~1 000): los borra el job `delete-stale-carts` a los `CART_CLEANUP_DAYS` días (borrado suave).
- Antes de abrir de verdad: `CART_CLEANUP_DAYS` a 30, quitar Access y `X-Robots-Tag` de la tienda, dominio y emails definitivos.
