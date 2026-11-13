# Pendientes y próximos pasos — para elegir qué hacer en cada sesión

> Recopilación de todo lo aplazado en los documentos de fase (secciones «Pendientes / riesgos») y en `ESTADO.md`, revisada al cerrar la fase 11 (21-oct-2026) y la Fase G. El detalle y las fuentes siguen en cada documento enlazado; aquí solo el resumen para decidir.
> Al hacer algo de esta lista: hacerlo en su fase, tacharlo aquí y actualizar el documento de origen.

Leyenda: **🔴 bloquea abrir la tienda** · 🟠 importante · 🟢 mejora / cuando haya tiempo · 👤 depende del usuario o de terceros (gestoría).

## 0. Al empezar la próxima sesión (5 min)

- [x] Portátil al día con Renovate #79 (2-nov-2026): Node **24.22.2** (`fnm default`), pnpm 12.16.1, `pnpm install`, las dos infras (`infra:up`, `real:infra:up`) con Meilisearch 1.56 y `db:migrate` en las dos BD (script `create-super-admin-role` de Medusa 2.22.2). En terminales abiertas antes: `fnm use`.
- [ ] (Opcional) Runner de Gitea: la etiqueta `ubuntu-latest` apunta a `docker://node:24.21.0-trixie` (config del runner en el LXC, fuera del repo). Funciona igual (`setup-node` instala la de `.node-version`); cambiarla a `24.22.0-trixie` para alinear, y entonces actualizar README §4.1, AGENTS §8.2 y ESTADO §5.
- [ ] 🟠 Runner de Gitea sin memoria: el `quality` del PR de Renovate #79 falló en el build en Gitea y pasó en GitHub con el mismo commit (y en local). Causa probable: LXC de 4 GB + 1 GB swap con `capacity: 2` (build del backend ~2,3 GB de pico + otro job a la vez). Si vuelve a pasar: «Re-run» con el runner libre; arreglo de fondo en el homelab: `capacity: 1` o más RAM/swap (ESTADO §5). Confirmar con el log (`Killed` / 137 / heap).
- [ ] Gitea: si el siguiente PR de Renovate entra en conflicto con otro merge, **Actions → Renovate → Run workflow** (lo regenera; nunca resolver el lockfile a mano).

## 1. VPS de pruebas: `v0.3.0` desplegada (13-nov-2026)

Hecho: backup, `compose.prod.yml` y `Caddyfile` nuevos, `.env.prod` (`IMAGE_TAG=0.3.0`, `COMMS_UNSUBSCRIBE_SECRET`, Umami, IBAN **de prueba**, `CAJA_FESTIVOS`, `STOREFRONT_REBUILD_SECRET`, `STOREFRONT_IMAGE_TAG=live`), **Meilisearch 1.55 → 1.56.2** (snapshot + `MEILI_UPGRADE_DB` una vez: sin incidencias), backend 0.3.0 (migraciones e índice `product_v2`), Store API solo en `10.77.0.1:19000` (comprobado cerrado desde fuera), `stripe-region.js` (transferencia), caja de snacks cargada y **storefront publicado por el rebuild del homelab** (`:live`). Incidencias: `metadata.plantilla` antigua en las correas (borrada a mano; `correas:sync` ya la borra sola) y el primer build pasó de 50 min (límite subido a 150).

Queda:

- [ ] **Umami**: `./dc up -d --wait umami caddy`; DNS `stats` con proxy; Cloudflare Access en `stats.` (panel) con Bypass para `/script.js` y `/api/send`; cambiar la contraseña de `admin`, crear el sitio y poner `UMAMI_URL` + `UMAMI_WEBSITE_ID` en las **variables de Gitea** (el siguiente rebuild ya lleva el script).
- [ ] **Temporizador del rebuild**: `systemctl enable --now storefront-poll.timer` en el LXC del runner (hasta ahora se lanzó a mano).
- [ ] Agentes de monitorización: copiar `docker/monitoring/compose.agents.yml` (Beszel 0.21.1, Dozzle v11.4.2) y `./dcm up -d` en `/opt/monitor-agents`.
- [ ] Comprobaciones: compra de prueba (tarjeta, Bizum, PayPal, transferencia), la caja (pedido → capturar → preparar → proponer → responder), Admin → «Búsquedas», «Escaparate» y «Publicar en la tienda»; cabeceras y HIT de Cloudflare.
- [ ] Borrar del VPS las copias `*.v0.2.0` cuando todo esté bien, y del LXC las claves de la puesta en marcha si quedan (`/root/deploy-storefront*`, `/root/vps-known`).
- [ ] Repetir la tanda B de la prueba de carga (fase 11) en el VPS.

## 2. 🔴 Antes de abrir la tienda de verdad (fase «producción definitiva»)

**Infra y cuentas** (fase11 §7, fase10 §7):

- [ ] Dominio definitivo, emails (`EMAIL_FROM`, `EMAIL_REPLY_TO`, `SHOP_NOTIFY_EMAIL` de empresa) y verificación en Resend.
- [ ] VPS: IP primaria nueva, borrar `ssh.` de DNS, endpoint de WireGuard por IP.
- [ ] Tokens nuevos (R2 imágenes y backups, Resend, service token de Access) para el entorno definitivo.
- [ ] Stripe **live** (claves, webhook nuevo) y registrar el dominio en _Payment method domains_ (Apple/Google Pay; faseI-marca §7.1). Activar **Bizum** (requisitos propios) y **PayPal** en live (Fase PG).
- [ ] 👤 Condiciones de compra: métodos de pago, plazos de la transferencia y cancelación (texto provisional; gestoría).
- [ ] Rate limiting en Cloudflare del formulario de reclamar pedidos (`/cuenta/pedidos/?_action=account.claimOrder`) y de `POST /store/customers/me/order-claims` en `api.` (Fase G).
- [ ] Quitar Access de la tienda, `ROBOTS=index`, decidir el **robots.txt gestionado de Cloudflare** (`Content-Signal`, SEO 61 en Lighthouse).
- [ ] `CART_CLEANUP_DAYS=30` (hoy 5).
- [ ] **Fase H**: al cargar el catálogo real, poner `novedades.desde: <fecha de la carga>` en `apps/storefront/src/content/home.yaml` (si no, todo el catálogo sale como novedad 30 días) y cambiar `etiquetas.valores` y `colecciones.handles` por los reales.
- [ ] Entorno «real» reiniciado de cero (12-nov-2026, [entorno-real.md](./entorno-real.md)): crear el usuario del Admin (`pnpm real:medusa user -e … -p …`) y volver a cargar `catalog/real/` siguiendo las plantillas por caso.
- [ ] **Entorno «real» local** ([entorno-real.md](./entorno-real.md), temporal): el catálogo real se prepara en local en `:4322`/`:9002` con infra propia, sin tocar los mocks. Al pasarlo a producción, **limpiarlo** (entorno-real.md §Limpieza): volúmenes, `.env.real`, `scripts/real-env.sh` y los scripts `real:*` del `package.json` raíz.
- [ ] Borrar los productos mock y cargar el catálogo real: herramientas en `migracion/loyverse/` (Fase V/W), revisión por categorías en curso; inventario → stock real; fotos reales (`images:import`); script de limpieza de objetos huérfanos del bucket (fase6 §7).
- [ ] Normalizar los **valores de opciones** del catálogo real («L 69-81cm», «S/M» frente a «S-M», «400gr» frente a «400g»…) antes de producción (faseV §7).
- [ ] Revocar el token de Loyverse al acabar la migración.
- [ ] Bucket lock en `hiro-backups` (valorar).
- [ ] Renovate en producción: todo con aprobación en el Dependency Dashboard salvo `vulnerabilityAlerts`; desplegar solo versiones con tag.

**Funcional**:

- [x] ~~🔴 **Pedidos de invitado → cuenta**~~: hecho en la [Fase G](./fases/faseG-invitados.md) (mismo email automático, reclamar con otro email, asignación manual `orders:assign`).
- [ ] Carritos de «invitado con email» con pago de Stripe pendiente: no se limpian (fase10 §7). Purgado definitivo de los borrados en suave.
- [ ] Baja de cuenta automática (borrado/anonimizado con workflow; ahora es manual, fase9 §7).

**👤 Gestoría** (todos los textos son provisionales):

- [ ] Condiciones de compra (con códigos), condiciones del programa de puntos, privacidad, cookies, aviso legal y pie legal de los emails (`packages/emails/src/_components/Layout.tsx`).
- [ ] Aviso de puntos del email de confirmación (G4/G5).
- [ ] Clasificación de productos en IVA reducido/superreducido.
- [ ] Omnibus (precio anterior en ofertas), desistimiento de personalizados (correas, TRLGDCU art. 103 c), antiparasitarios (RD 666/2023).
- [ ] Comunicaciones comerciales: texto del párrafo «Comunicaciones» de privacidad y de cada tema (Fase MK-A; consentimiento y baja ya hechos), y si el aviso de stock pedido por el cliente (MK-B) es comercial.
- [ ] Fase MK-D/E/E2: párrafos de privacidad «Escaparate», «Cumpleaños», «Analítica de visitas» y «Búsquedas», y el de `/cookies/`. **¿La analítica sin cookies (Umami, interés legítimo) necesita banner o consentimiento?** (la AEPD no la ha eximido expresamente; faseMK §4b.2).
- [ ] Privacidad: párrafo «Pedidos sin iniciar sesión» (Fase G; se asocian a la cuenta con el mismo email; con otro email, solo si se acepta desde ese email).
- [ ] Privacidad y casillas de «Mis peques» (Fase M): datos de las mascotas, consentimiento de la salud y de la foto pública (faseM §7).
- [ ] Caja de snacks (Fase CS): datos de «¿Para quién es?» y el consentimiento de la salud, el motivo del rechazo, la aceptación automática a las 24 h (¿condiciones de compra?), desistimiento de un producto preparado a medida y **IVA de la caja** (hoy reducido; ¿y si lleva algo de IVA general?).

## 3. Fases del roadmap que quedan

| Fase                          | Contenido                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Notas                                                                                            |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| **12 Monitorización (resto)** | GlitchTip + `@sentry/node` / `@sentry/astro` **solo en servidor**; vigilante externo del homelab (UptimeRobot / Healthchecks.io); alertas de error de app                                                                                                                                                                                                                                                                                                                                                                                              | Kuma, Beszel, Dozzle y WireGuard ya están (fase 11-8). Dependencias nuevas: requieren aprobación |
| ~~Pedidos de invitado~~       | ✅ [Fase G](./fases/faseG-invitados.md)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | —                                                                                                |
| **13 Optimización continua**  | ver §4                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | —                                                                                                |
| **CS Caja de snacks**         | ✅ hecha. Aparcado: **productos sin códigos pero con pago con puntos** (hoy `pago_descuento = no` quita los dos: los puntos son una promoción en Medusa; opciones en [faseCS-caja-snacks.md](./fases/faseCS-caja-snacks.md) §6.2) y el diseño 2                                                                                                                                                                                                                                                                                                        | Cuando se decida                                                                                 |
| **MK Marketing**              | ✅ [faseMK-marketing.md](./fases/faseMK-marketing.md): A comunicaciones y baja de un clic, B avisos de stock (con cuenta), C comparador (`/comparar/`), D escaparate «Vuestros peques» + cumpleaños, E analítica Umami, E2 búsquedas sin resultados. **Después de abrir**: F gincana de huellas y MK-C2 (características de snacks). Aparcados: Google Shopping (con el catálogo final y el rebuild por webhook), carrito abandonado (última opción), avisos de bajada de precio (R8), envío gratis por `item_total` («te faltan X €»), upselling (R3) | Comunicación comercial → gestoría                                                                |

## 4. Fase 13 — rendimiento y operación (candidatas)

- [x] ~~**Rebuild del storefront** de catálogo~~: ✅ [fase13-rebuild.md](./fases/fase13-rebuild.md) (en marcha en el VPS de prueba desde `v0.3.0`). **Queda**: `offers.price` en el JSON-LD (fase3 §7) ahora que el HTML se regenera solo.
- [x] ~~**Capacidad sin Cloudflare ~20 páginas/s**~~: [Fase R-2](./fases/faseR-rendimiento.md) (caché de Medusa + caché de `LiveSyncData`): ~100 páginas/s en local con Medusa en 2 núcleos. **Queda**: repetir la tanda B de la fase 11 en el VPS tras desplegar.
- [x] ~~LCP de las fichas (P1–P5 de la auditoría de rendimiento)~~: [Fase R](./fases/faseR-rendimiento.md).
- [x] ~~Caché de `LiveSyncData` (P8) y una island por ficha (P6)~~: Fase R-2.
- [ ] Caché de Medusa (`MEDUSA_FF_CACHING`, experimental en 2.21.2): en cada subida de Medusa, repetir la prueba de invalidación (Admin, pedido, script; faseR-rendimiento.md §3). Una escritura por SQL a mano no la invalida (vaciarla, §7).
- [x] ~~Speculation Rules inline (P7)~~: Fase R-3.
- [ ] View transitions CSS (sin JS; fase3 §7.1).
- [ ] `stock:mock` solo repone los 100 primeros productos mock (`query.graph` sin paginación): el clicker de los e2e se agota (Fase PG).
- [x] ~~`stock:mock` no repone las piezas de la correa~~: `pnpm backend:orders:cancel` cancela los pedidos de prueba (`@example.com`) y libera sus reservas (ejecutarlo tras los e2e).
- [ ] Partytown si se añaden terceros.
- [ ] `ASTRO_KEY` fija (si se deja de purgar la CDN en cada despliegue; fase3).
- [ ] Imagen del backend de ~1 GB: adelgazar (fase10 §7).
- [ ] P2 del análisis del JS: quitar `@astrojs/svelte` (aparcada; analisis-js §5).

## 5. Pendientes técnicos menores 🟢

- **Búsqueda** (fase7 §7): normalizar la URL de `/buscar/` para la caché; desfase del índice con precios (evento); `min_price` no tiene en cuenta las Price Lists; recuentos de facetas con las correas (faseE).
- **Catálogo** (faseC, faseS): `stock:import` para reponer en masa; el Admin muestra el granel en pasos (extensión o aviso en el albarán); variantes sin `variant_rank` (S, L, M); reindexar al cambiar una categoría de padre.
- **Correas** (faseE): fotos de mosquetones (rejilla), plazo de fabricación provisional, ofertas en correas (rompen el build a propósito).
- **Puntos** (faseL §8): devolución automática de puntos canjeados en devoluciones (plan en §6.4); revisar el widget del Admin; unificar con la tienda física (`channel: "tienda"`).
- **Códigos** (faseP): no crear códigos sobre el envío ni promociones automáticas sin revisar `checkCodes`.
- **Home** (faseH §7): el Admin en LibreWolf sube fotos con rayas (canvas con ruido; si molesta, reducir en el backend con sharp); `metadata.descripcion` de categorías no se usa (tienen la suya). Las descripciones admiten formato (`lib/rich-text.ts`, LEEME §Descripciones con formato). Las novedades y los chips se calculan en el build.
- **Pagos** (fasePG §7): estado propio «esperando transferencia» en «Mis pedidos»; conciliación bancaria; PayPal directo o TPV Sabadell si el volumen lo justifica; espaciar los e2e de pago si el hCaptcha de Stripe molesta en CI.
- **Emails** (fase8): webhook de rebotes y quejas de Resend cuando haya volumen; Resend Free = 100/día.
- **Pedidos de invitado** (faseG §7): botón en el Admin para la asignación manual (hoy `orders:assign`).
- **Cuenta** (fase9): revocación de JWT (lista o sesiones), cambio de email, más datos del cliente (lista del usuario).
- **Diseño** (faseD, faseI): foto del hero, logo en negativo, botón de pausa de la barra de anuncios, textos de «Sobre nosotros»; probar Safari/WebKit; `/productos/` 91–94 en Lighthouse **local**.
- **Muestras de color con transparencia** (selector de la ficha, tras `fix/ficha-movil`): hoy la tarjeta de cada color usa la miniatura de su variante (JPG con fondo blanco) en un marco blanco. Mejora: una foto **aparte, solo para la muestra**, `<handle>--<valor>_muestra.png` (PNG/WebP con transparencia), que `images:import` sube al bucket y guarda en la **metadata del valor de la opción** (`metadata.muestra`, como hoy `color`), **no en la galería**; `VariantPicker` la usa si existe y, si no, la miniatura como ahora. La galería (miniaturas y foto grande, con su marco y sombra) sigue con sus JPG. Trabajo: admitir `.png`/`.webp` en `lib/image-files.ts` solo con el sufijo `_muestra` (validar y optimizar con sharp en el build, como el resto), leerla en `lib/variant-picker.ts` (`PickerValue.swatch`), quitar el marco blanco cuando haya muestra propia, e2e y LEEME §Fotos. Hacerlo antes de preparar las fotos definitivas.
- **Fotos reales**: script de preparación (sRGB, sin EXIF/GPS, ~2400 px, JPEG q85–90; fase6).
- **CI**: RAM del runner (dos builds a la vez pueden agotar los 4 GB; fase2); quitar los `overrides` de seguridad cuando las dependencias traigan las versiones arregladas; vigilar los avisos moderados de `pnpm audit`; quitar las excepciones de `audit.ignore` (`pnpm-workspace.yaml`, 4 avisos altos del árbol de build de `@medusajs/*`, la última `GHSA-c4qx-w738-7hr3` del 23-oct-2026) cuando Renovate suba Medusa y `pnpm audit --prod` deje de mostrarlas.
- **Avisos conocidos sin acción**: Lightning CSS no reconoce `::scroll-button()` (se irá con Renovate).

## 6. Caducidades 📅

| Qué                                                                                                                       | Caduca                   | Acción                                |
| ------------------------------------------------------------------------------------------------------------------------- | ------------------------ | ------------------------------------- |
| PAT del push mirror Gitea → GitHub y token de GitHub de Renovate                                                          | ~1 año desde su creación | renovar                               |
| Tokens R2 (`vps-pruebas-imagenes`, `vps-pruebas-backups`), API key Resend `vps-pruebas`, service token `pruebas-portatil` | oct-2027                 | renovar o sustituir en producción     |
| Certificado de cliente de AOP                                                                                             | **17-oct-2031**          | renovar o la tienda da 525            |
| CA propia de AOP                                                                                                          | 15-oct-2036              | —                                     |
| Origin CA de Cloudflare                                                                                                   | 2041                     | —                                     |
| Autorización de un pago de Stripe                                                                                         | ~7 días                  | capturar antes desde el Admin (fase5) |
