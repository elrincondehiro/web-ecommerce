# Fase 13 — Publicar el catálogo en la tienda (rebuild del storefront)

> **Estado:** 🚧 en curso (R-1 backend y R-2 ficheros hechos; R-3 homelab/VPS y la prueba de punta a punta, con el
> próximo despliegue).
> **Rama/PR:** `feat/rebuild-storefront`
> **Anterior:** [Fase MK](./faseMK-marketing.md)

## 1. Objetivos

- [x] Un cambio de catálogo en el Admin del VPS (producto, foto, categoría, colección, etiqueta, opción u oferta) se
      publica solo en la tienda, sin el portátil, tras unos minutos sin cambios.
- [x] Botón «Publicar ahora» en el Admin y estado de la última publicación.
- [ ] Runner del homelab en el túnel WireGuard (`10.77.0.4`) y la API del VPS solo por WireGuard.
- [ ] Prueba de punta a punta en el VPS.

Precio y stock **no** necesitan rebuild: LiveSync los corrige en vivo (fase 6).

## 2. Cómo funciona

```
VPS (Medusa)                                        HOMELAB (LXC del runner de Gitea, WireGuard 10.77.0.4)
 evento de catálogo / «Publicar ahora» del Admin
  └─ storefront_publish_state: pendiente desde…
                                    ◀── cada 2 min: storefront-poll.sh (systemd)
 GET /hooks/storefront-rebuild  ──▶ { publish: true } tras 10 min sin cambios (o al momento con el botón)
                                     ├─ API de Gitea: workflow_dispatch storefront-rebuild.yml
 POST { event: "queued" }      ◀──  └─ avisa «en cola»
                                     workflow (runner del LXC, Docker del LXC):
 POST { event: "started" }     ◀──   1. aviso «empezado» (+ enlace al registro)
 Store API 10.77.0.1:19000     ◀──   2. build de DEPLOYED_REF contra la API del VPS
                                      3. push a GHCR: <ref>-cat<fecha> y :live
 ssh deploy-storefront@10.77.0.1 ◀──  4. SSH: la clave solo puede ejecutar deploy-storefront.sh
                                      5. purga de Cloudflare (token «Cache Purge»)
 POST { event: "finished", ok } ◀──  6. aviso «terminado» (ok o falló)
```

- El **homelab pregunta** (el VPS no llama a casa ni guarda tokens de Gitea). Si el homelab está apagado, los cambios
  esperan y salen cuando vuelve.
- Los cambios que llegan durante un build quedan pendientes y salen en el siguiente. Si falla, lo que iba vuelve a
  pendiente y se reintenta tras la espera. Una publicación «colgada» deja de bloquear a los 60 min.
- El storefront del VPS usa `STOREFRONT_IMAGE_TAG=live`; cada build deja además `<ref>-cat<AAAAMMDD-HHMM>` en GHCR para
  volver atrás (`STOREFRONT_IMAGE_TAG=<ese tag>` + `./dc up -d --wait storefront`).
- Se construye el **código desplegado** (`DEPLOYED_REF`, variable del repo en Gitea): al desplegar una versión nueva,
  cambiarla (p. ej. `v0.3.0`).

## 3. Qué se ha hecho

**Backend** (R-1):

- Módulo `storefrontPublish` (`src/modules/storefront-publish`, tabla `storefront_publish_state`, una fila; migración
  `Migration20261113134053`). `update(fn)` en transacción con `FOR UPDATE`.
- `lib/storefront-publish.ts`: eventos (`CATALOG_EVENTS`, de `core-flows/events` de Medusa 2.22.6), estados
  (`idle`, `queued`, `running`, `ok`, `failed`), la regla de la espera (`shouldPublish`) y el secreto (`validSecret`,
  comparación en tiempo constante).
- Subscriber `storefront-catalog-changed` (todos los `CATALOG_EVENTS`).
- `GET|POST /hooks/storefront-rebuild` (secreto `x-rebuild-secret` = `STOREFRONT_REBUILD_SECRET`, ≥ 32 caracteres;
  sin configurar, 404). No está en Internet: Caddy no la expone en la tienda y en `api.` el WAF de Cloudflare solo deja
  `POST /hooks/payment/*`.
- `GET|POST /admin/storefront-publish` y la página del Admin **«Publicar en la tienda»** (`/app/publicar`): cambios
  pendientes, siguiente paso, última publicación (con enlace al registro y el error) y «Publicar ahora». Se refresca
  cada 15 s.
- Variables: `STOREFRONT_REBUILD_SECRET`, `STOREFRONT_REBUILD_QUIET_MIN` (1–120, 10).

**Workflow y scripts** (R-2):

- `.github/workflows/storefront-rebuild.yml`: solo Gitea, `workflow_dispatch`, `concurrency` sin cancelar.
- `docker/compose.prod.yml`: el backend publica la Store API en `${WG_BIND:-10.77.0.1}:19000` (solo WireGuard;
  sustituye a `compose.prod.build.yml`, borrado) y el storefront usa `STOREFRONT_IMAGE_TAG` (o `IMAGE_TAG`).
- `docker/rebuild/`: `deploy-storefront.sh` + `dc-storefront` (VPS), `storefront-poll.sh` + `.service` + `.timer` +
  `storefront-rebuild.env.example` (LXC del runner).

## 4. Decisiones

| Decisión                                     | Motivo                                                                                | Fuente                                                     |
| -------------------------------------------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Build en el runner del homelab, no en el VPS | El VPS (4 GB) va justo para el build (fase 11); el runner ya existe                   | Usuario                                                    |
| El homelab pregunta (sondeo cada 2 min)      | Ningún token de Gitea en el VPS; sin abrir nada hacia casa; tolera el homelab apagado | —                                                          |
| Automático tras 10 min sin cambios + botón   | Usuario; no construir 20 veces seguidas al editar varios productos                    | —                                                          |
| GHCR con `:live` + tag por build             | Usuario (como ahora); volver atrás con un tag                                         | —                                                          |
| `DEPLOYED_REF` (variable del repo)           | El storefront sale del mismo código que el backend que corre en el VPS                | —                                                          |
| SSH con `command=` + `restrict`              | La clave del workflow solo puede «pull + recrear el storefront»                       | context7 /openssh/openssh-portable (authorized_keys)       |
| Docker del LXC (socket montado en los jobs)  | Caché de BuildKit del host entre builds (minutos en vez de 10–30)                     | context7 /websites/gitea (runner: `container.docker_host`) |
| `capacity: 1` en el runner                   | Un build (~2,4 GB) y un CI a la vez agotaban los 4 GB del LXC                         | Usuario; ESTADO §5                                         |

## 5. Puesta en marcha (R-3, la hace el usuario)

### 5.1 WireGuard: el LXC del runner como `10.77.0.4`

1. LXC (como root): `apt install wireguard-tools` y `wg genkey | tee /etc/wireguard/wg0.key | wg pubkey`
   (`chmod 600 /etc/wireguard/wg0.key`). Si el LXC no es privilegiado y `wg-quick up` falla («Unknown device type»),
   el módulo se carga en el **host de Proxmox** (`modprobe wireguard`, y en `/etc/modules`).
2. `/etc/wireguard/wg0.conf` del LXC:
   ```ini
   [Interface]
   Address = 10.77.0.4/32
   PrivateKey = <contenido de /etc/wireguard/wg0.key>
   [Peer]
   PublicKey = <clave pública del VPS>
   Endpoint = <endpoint del VPS, como en la VM .3>
   AllowedIPs = 10.77.0.1/32
   PersistentKeepalive = 25
   ```
   `systemctl enable --now wg-quick@wg0` y `ping -c2 10.77.0.1`.
3. VPS (`/etc/wireguard/wg0.conf`): otro `[Peer]` con la clave pública del LXC y `AllowedIPs = 10.77.0.4/32`;
   `sudo wg syncconf wg0 <(sudo wg-quick strip wg0)`.

### 5.2 Runner de Gitea (`/etc/gitea-runner/config.yaml`)

- `runner.capacity: 1` (un job a la vez).
- `container.docker_host` vacío (por defecto: el runner monta el Docker del LXC en los jobs). El usuario
  `gitea-runner` en el grupo `docker` (`usermod -aG docker gitea-runner`).
- `systemctl restart gitea-runner`.
- Caché de BuildKit del LXC que no caduque a las 48 h: `/etc/docker/daemon.json` con la misma política que el portátil
  (fase11 §7: `builder.gc.policy`, 60 días, `reservedSpace` 20 GB) y `systemctl restart docker`.

### 5.3 VPS

```bash
# Ficheros (desde el portátil)
scp docker/compose.prod.yml docker/rebuild/deploy-storefront.sh docker/rebuild/dc-storefront deploy@10.77.0.1:/opt/ecommerce/
# En el VPS
sudo install -m 755 -o root -g root /opt/ecommerce/deploy-storefront.sh /usr/local/bin/deploy-storefront.sh
sudo install -m 755 -o root -g root /opt/ecommerce/dc-storefront /opt/ecommerce/dc-storefront && rm /opt/ecommerce/deploy-storefront.sh
sudo useradd -m -s /bin/sh deploy-storefront
echo 'deploy-storefront ALL=(deploy) NOPASSWD: /opt/ecommerce/dc-storefront' | sudo tee /etc/sudoers.d/deploy-storefront && sudo chmod 440 /etc/sudoers.d/deploy-storefront
# SSH: AllowUsers deploy deploy-storefront en /etc/ssh/sshd_config.d/10-hardening.conf → sudo systemctl reload ssh
# Clave del workflow (generada en el portátil: ssh-keygen -t ed25519 -N '' -f /tmp/deploy-storefront)
sudo -u deploy-storefront mkdir -p ~deploy-storefront/.ssh
echo 'restrict,command="/usr/local/bin/deploy-storefront.sh",from="10.77.0.4" ssh-ed25519 AAAA… rebuild' | sudo -u deploy-storefront tee ~deploy-storefront/.ssh/authorized_keys
sudo chmod 600 ~deploy-storefront/.ssh/authorized_keys
```

En `.env.prod`: `STOREFRONT_IMAGE_TAG=live`, `STOREFRONT_REBUILD_SECRET=<openssl rand -hex 32>` y, tras el primer
build, `./dc up -d --wait backend-server backend-worker storefront`.

### 5.4 Gitea (repo → Configuración → Actions)

- **Variables**: `DEPLOYED_REF` (`v0.3.0`), `VPS_WG_IP` (`10.77.0.1`), `STORE_URL` (`https://…`), `IMAGE_BASE_URL`,
  `UMAMI_URL` y `UMAMI_WEBSITE_ID` (vacías si no hay analítica).
- **Secrets**: `GHCR_USER`, `GHCR_TOKEN` (el PAT con `write:packages`), `MEDUSA_PUBLISHABLE_KEY` (la del VPS),
  `STOREFRONT_REBUILD_SECRET`, `DEPLOY_SSH_KEY` (clave privada de arriba), `DEPLOY_SSH_KNOWN_HOSTS`
  (`ssh-keyscan -t ed25519 10.77.0.1` desde el LXC), `CF_ZONE_ID`, `CF_API_TOKEN` (token de solo «Zone → Cache
  Purge» de esa zona).

### 5.5 Temporizador en el LXC

```bash
install -m 755 docker/rebuild/storefront-poll.sh /usr/local/bin/storefront-poll.sh
install -m 600 -o gitea-runner docker/rebuild/storefront-rebuild.env.example /etc/storefront-rebuild.env   # y rellenarlo
install -m 644 docker/rebuild/storefront-poll.service docker/rebuild/storefront-poll.timer /etc/systemd/system/
systemctl daemon-reload && systemctl enable --now storefront-poll.timer
journalctl -u storefront-poll -f        # «workflow lanzado (…)» cuando toca
```

`GITEA_TOKEN`: token de un usuario con escritura en el repo, scope `write:repository`.

## 6. Cómo testear

```bash
pnpm --filter backend exec jest src/lib/storefront-publish.unit.spec.ts      # espera, cola, fallo, secreto
pnpm --filter backend test:integration:http -- publicar                      # rutas: secreto, botón, ciclo completo
# Local, a mano: STOREFRONT_REBUILD_SECRET en apps/backend/.env, editar un producto en el Admin y ver /app/publicar
curl -s -H "x-rebuild-secret: $SECRET" localhost:9000/hooks/storefront-rebuild
```

De punta a punta (VPS): editar un producto → a los ~10–12 min «Publicando…» en el Admin → «Publicado» y el cambio en
la tienda. Con «Publicar ahora», en 1–2 min.

## 7. Criterio de salida

- [ ] Un cambio en el Admin del VPS sale en la tienda sin el portátil, y «Publicar ahora» funciona.
- [ ] Un build roto deja «La última publicación falló» con el enlace al registro y no toca la tienda.
- [ ] El 19000 solo responde por WireGuard (desde fuera, ni conecta).
