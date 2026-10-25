# Pendientes y próximos pasos — para elegir qué hacer en cada sesión

> Recopilación de todo lo aplazado en los documentos de fase (secciones «Pendientes / riesgos») y en `ESTADO.md`, revisada al cerrar la fase 11 (21-oct-2026) y la Fase G. El detalle y las fuentes siguen en cada documento enlazado; aquí solo el resumen para decidir.
> Al hacer algo de esta lista: hacerlo en su fase, tacharlo aquí y actualizar el documento de origen.

Leyenda: **🔴 bloquea abrir la tienda** · 🟠 importante · 🟢 mejora / cuando haya tiempo · 👤 depende del usuario o de terceros (gestoría).

## 0. Al empezar la próxima sesión (5 min)

- [ ] Portátil: `fnm install 24.22.0 && fnm default 24.22.0` (Renovate #62 subió Node; `engineStrict` hace fallar `pnpm install` con 24.21), `pnpm install`, `pnpm infra:up` (Meilisearch local migra solo con `MEILI_UPGRADE_DB=true`).
- [ ] (Opcional) Runner de Gitea: la etiqueta `ubuntu-latest` apunta a `docker://node:24.21.0-trixie` (config del runner en el LXC, fuera del repo). Funciona igual (`setup-node` instala la de `.node-version`); cambiarla a `24.22.0-trixie` para alinear, y entonces actualizar README §4.1, AGENTS §8.2 y ESTADO §5.
- [ ] Gitea: si el siguiente PR de Renovate entra en conflicto con otro merge, **Actions → Renovate → Run workflow** (lo regenera; nunca resolver el lockfile a mano).

## 1. Siguiente despliegue en el VPS de pruebas (cuando haya algo que desplegar)

Hoy el VPS corre `sha-4ad9972`. `main` ya lleva Astro 7.4.1, Node 24.22, Meilisearch 1.55 y los cambios de la fase 11.

- [ ] e2e completos en local contra el backend real (el CI usa fixtures) con Astro 7.4.1.
- [ ] Build del storefront en el portátil (fase11 §4.7) y backend `:0.1.x`/`sha-…` de GHCR.
- [ ] 🟠 **Meilisearch 1.54.3 → 1.55.0**: no arranca sin migrar la BD (probado). Una vez con `MEILI_UPGRADE_DB=true` (override temporal de compose) y después sin él; si se corrompe, borrar el volumen y reindexar (`db:migrate`). Preparar los comandos exactos.
- [ ] Copiar al VPS `compose.prod.yml`, `Caddyfile` y `monitoring/compose.agents.yml` nuevos (Dozzle v11.3.4 también en la VM).
- [ ] Purge Everything en Cloudflare y comprobar HIT.
- [ ] Automatizar la purga con un token de solo «Cache Purge» (fase11 §7) y, quizá, un script `deploy` con estos pasos.
- [ ] **Fase M** (mascotas y avisos): crear en ntfy el tema solo para pedidos y poner `NTFY_URL`, `NTFY_ORDERS_TOPIC` y `ADMIN_URL=https://admin.<dominio>` en `.env.prod` (server y worker los leen del bloque común). La tabla `pet` la crea el `server` al arrancar (`db:migrate`).

## 2. 🔴 Antes de abrir la tienda de verdad (fase «producción definitiva»)

**Infra y cuentas** (fase11 §7, fase10 §7):

- [ ] Dominio definitivo, emails (`EMAIL_FROM`, `EMAIL_REPLY_TO`, `SHOP_NOTIFY_EMAIL` de empresa) y verificación en Resend.
- [ ] VPS: IP primaria nueva, borrar `ssh.` de DNS, endpoint de WireGuard por IP.
- [ ] Tokens nuevos (R2 imágenes y backups, Resend, service token de Access) para el entorno definitivo.
- [ ] Stripe **live** (claves, webhook nuevo) y registrar el dominio en _Payment method domains_ (Apple/Google Pay; faseI-marca §7.1).
- [ ] Rate limiting en Cloudflare del formulario de reclamar pedidos (`/cuenta/pedidos/?_action=account.claimOrder`) y de `POST /store/customers/me/order-claims` en `api.` (Fase G).
- [ ] Quitar Access de la tienda, `ROBOTS=index`, decidir el **robots.txt gestionado de Cloudflare** (`Content-Signal`, SEO 61 en Lighthouse).
- [ ] `CART_CLEANUP_DAYS=30` (hoy 5).
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
- [ ] Comunicaciones comerciales (carrito abandonado, avisos de precio): consentimiento y baja.
- [ ] Privacidad: párrafo «Pedidos sin iniciar sesión» (Fase G; se asocian a la cuenta con el mismo email; con otro email, solo si se acepta desde ese email).
- [ ] Privacidad y casillas de «Mis peques» (Fase M): datos de las mascotas, consentimiento de la salud y de la foto pública (faseM §7).

## 3. Fases del roadmap que quedan

| Fase                          | Contenido                                                                                                                                                      | Notas                                                                                            |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| **12 Monitorización (resto)** | GlitchTip + `@sentry/node` / `@sentry/astro` **solo en servidor**; vigilante externo del homelab (UptimeRobot / Healthchecks.io); alertas de error de app      | Kuma, Beszel, Dozzle y WireGuard ya están (fase 11-8). Dependencias nuevas: requieren aprobación |
| ~~Pedidos de invitado~~       | ✅ [Fase G](./fases/faseG-invitados.md)                                                                                                                        | —                                                                                                |
| **13 Optimización continua**  | ver §4                                                                                                                                                         | —                                                                                                |
| **Marketing**                 | carrito abandonado (tutorial oficial de Medusa), avisos de bajada de precio / reposición (R8), envío gratis por `item_total` («te faltan X €»), upselling (R3) | Comunicación comercial → gestoría                                                                |

## 4. Fase 13 — rendimiento y operación (candidatas)

- [ ] 🟠 **Rebuild del storefront por webhook** de catálogo: hoy un producto, foto, oferta o categoría nuevos no aparecen hasta el siguiente build (fase3, fase6, faseI-interficie). Con ello: `offers.price` en el JSON-LD (fase3 §7).
- [x] ~~**Capacidad sin Cloudflare ~20 páginas/s**~~: [Fase R-2](./fases/faseR-rendimiento.md) (caché de Medusa + caché de `LiveSyncData`): ~100 páginas/s en local con Medusa en 2 núcleos. **Queda**: repetir la tanda B de la fase 11 en el VPS tras desplegar.
- [x] ~~LCP de las fichas (P1–P5 de la auditoría de rendimiento)~~: [Fase R](./fases/faseR-rendimiento.md).
- [x] ~~Caché de `LiveSyncData` (P8) y una island por ficha (P6)~~: Fase R-2.
- [ ] Caché de Medusa (`MEDUSA_FF_CACHING`, experimental en 2.21.2): en cada subida de Medusa, repetir la prueba de invalidación (Admin, pedido, script; faseR-rendimiento.md §3). Una escritura por SQL a mano no la invalida (vaciarla, §7).
- [x] ~~Speculation Rules inline (P7)~~: Fase R-3.
- [ ] View transitions CSS (sin JS; fase3 §7.1).
- [ ] `stock:mock` no repone las piezas de la correa: los e2e de la correa de 7 m fallan en local tras muchos pedidos de prueba.
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
- **Emails** (fase8): webhook de rebotes y quejas de Resend cuando haya volumen; Resend Free = 100/día.
- **Pedidos de invitado** (faseG §7): botón en el Admin para la asignación manual (hoy `orders:assign`).
- **Cuenta** (fase9): revocación de JWT (lista o sesiones), cambio de email, más datos del cliente (lista del usuario).
- **Diseño** (faseD, faseI): foto del hero, logo en negativo, botón de pausa de la barra de anuncios, textos de «Sobre nosotros»; probar Safari/WebKit; `/productos/` 91–94 en Lighthouse **local**.
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
