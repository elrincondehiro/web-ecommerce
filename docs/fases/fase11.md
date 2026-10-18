# Fase 11 — Despliegue de prueba en Hetzner

> **Estado:** 🚧 en curso (11-0 a 11-3 hechas; siguiente 11-4)
> **Rama/PR:** `feat/fase11-despliegue-prueba` · PR #…
> **Anterior:** [Fase R](./faseR-relacionados.md) · **Siguiente:** fase 12 (monitorización)

Despliegue **de prueba**, no la producción definitiva: dominio de pruebas, **Stripe en modo test**, **productos mock** y la tienda cerrada al público (Cloudflare Access, sin indexar). El usuario hace lo de los paneles (Hetzner, Cloudflare, Resend, Stripe, GitHub) y ejecuta los comandos en el VPS; el agente prepara la configuración del repo, explica cada paso y revisa los resultados.

> ⚠️ **El repo es público (réplica en GitHub).** Aquí no van IP del VPS, puertos de SSH, claves, emails personales ni nada que ayude a atacar el servidor. Esos datos solo están en `docker/.env.prod` del VPS (ignorado por git) y en las notas del usuario.

## 1. Objetivos

- [x] **11-0** Requisitos: dominios, VPS, Resend, R2, Stripe, Access (§2).
- [x] **11-1** VPS: sistema limpio, usuario sin root, SSH solo con clave y **solo por WireGuard**, actualizaciones automáticas, Docker, swap; firewall de Hetzner (80/443 solo desde Cloudflare).
- [x] **11-2** Cloudflare: Full (strict) + Origin CA, Always HTTPS, Access (Admin y tienda), reglas de caché, rate limiting.
- [x] **11-3** Caddy: Origin CA, `trusted_proxies` + `CF-Connecting-IP`, cabeceras de seguridad, `X-Robots-Tag: noindex`, CSP con Stripe.
- [ ] **11-4** R2 (bucket de imágenes de prueba, token) y Resend (`RESEND_API_KEY`).
- [ ] **11-5** Datos: migraciones, usuario del Admin, catálogo mock, imágenes en R2, Meilisearch, `stripe:region`, webhook de Stripe test.
- [ ] **11-6** Storefront real: build en el portátil contra `api.`, publicado en GHCR por el usuario.
- [ ] **11-7** Backups `pg_dump` → bucket R2 privado, con heartbeat y **restauración probada**.
- [ ] **11-8** Monitorización: agentes Beszel y Dozzle, Uptime Kuma con `/health` (a través de WireGuard).
- [ ] **11-9** Lista de comprobación de punta a punta y Lighthouse contra el dominio real.
- [ ] **11-10** Prueba de carga con k6 (herramienta nueva: requiere aprobación).

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

| Paso | Qué                                                                                                                                                                                                                                                                                   | Fuente                                                                      |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| A    | Rebuild con Debian 13 + clave SSH; regla temporal TCP 22 solo desde la IP del usuario                                                                                                                                                                                                 | panel de Hetzner                                                            |
| B    | `apt full-upgrade`; usuario `deploy` (sudo con contraseña, la clave de root copiada); swap de 2 GB (`/swapfile`, `vm.swappiness=10`); zona `Europe/Madrid`; `unattended-upgrades` con reinicio automático a las **04:30** (`/etc/apt/apt.conf.d/52unattended-upgrades-local`)         | `/jnv/ansible-role-unattended-upgrades`                                     |
| C    | WireGuard punto a punto `10.77.0.0/30` (VPS `.1`, portátil `.2`), UDP propio; en el VPS `wg-quick@wg0`; en el portátil, conexión `wg-vps` de NetworkManager (importada, `AllowedIPs` solo `10.77.0.1/32`, MTU 1340 para ir también dentro del túnel del homelab, sin autoconexión)    | `/wireguard/wireguard-tools`, `/websites/networkmanager_dev`                |
| D    | `/etc/ssh/sshd_config.d/10-hardening.conf`: sin root, sin contraseña, `AllowUsers deploy`, `MaxAuthTries 3`. SSH **solo por el túnel** (el firewall de Hetzner no abre el 22; `sshd` escucha en todas las interfaces para poder volver a abrirlo en una emergencia)                   | —                                                                           |
| E    | Docker del repositorio oficial (`docker.sources`), versiones fijadas y en `apt-mark hold`: `docker-ce` 29.9.1, `containerd.io` 2.4.2, `docker-buildx-plugin` 0.38.0, `docker-compose-plugin` 5.6.0. `daemon.json`: log `local` (10 MB), `live-restore`. `deploy` en el grupo `docker` | `/docker/docs` (engine/install/debian, logging/drivers/local, live-restore) |
| F    | Firewall de Hetzner: TCP 80/443 solo desde los rangos de Cloudflare (`cloudflare.com/ips-v4` y `ips-v6`), UDP de WireGuard desde cualquier origen, ICMP. Todo lo demás se descarta (por defecto en Hetzner)                                                                           | `/websites/hetzner_cloud` (Firewalls)                                       |

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

## 6. Criterio de salida

- [ ] Tienda, API y Admin por HTTPS (Full strict) detrás de Cloudflare; Admin y tienda detrás de Access.
- [ ] Pago test (4242 y 3DS), emails reales, imágenes desde R2, búsqueda, puntos, códigos, lista de deseos, relacionados y sin JS.
- [ ] Backup en R2 y **restauración probada**.
- [ ] Latencia medida y prueba de carga (50 páginas/s durante 10 min) documentada.

## 7. Pendientes / riesgos

- **AOP de zona**: certificado de cliente hasta el **17-oct-2031**, CA propia hasta el **15-oct-2036** (§4.4). Renovar antes o la tienda deja de responder (handshake rechazado → 525).
- **Logo de los emails**: con la tienda detrás de Access, Gmail/Outlook no pueden descargarlo de `STOREFRONT_URL`. En 11-4: subir `email/logo.png` a R2 y `EMAIL_ASSETS_URL=https://imagenes.hirobordercollie.es`.
- Antes de producción: borrar `ssh.`, endpoint de WireGuard por IP e IP primaria nueva (§4.1).
- **Purga de Cloudflare en cada despliegue** (a mano hasta tener `deploy`): automatizarla con un token de solo «Cache Purge».
- `ROBOTS=index` y quitar Access de la tienda al abrir de verdad.
- README §4 al cerrar la fase: Docker Engine **29.9.1** en el VPS y en local (antes 29.8.2).
- Antes de abrir de verdad: `CART_CLEANUP_DAYS` a 30, quitar Access y `X-Robots-Tag` de la tienda, dominio y emails definitivos.
