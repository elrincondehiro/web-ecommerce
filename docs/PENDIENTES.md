# Pendientes y próximos pasos — para elegir qué hacer en cada sesión

> Recopilación de todo lo aplazado en los documentos de fase (secciones «Pendientes / riesgos») y en `ESTADO.md`, revisada al cerrar la fase 11 (21-oct-2026). El detalle y las fuentes siguen en cada documento enlazado; aquí solo el resumen para decidir.
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

## 2. 🔴 Antes de abrir la tienda de verdad (fase «producción definitiva»)

**Infra y cuentas** (fase11 §7, fase10 §7):

- [ ] Dominio definitivo, emails (`EMAIL_FROM`, `EMAIL_REPLY_TO`, `SHOP_NOTIFY_EMAIL` de empresa) y verificación en Resend.
- [ ] VPS: IP primaria nueva, borrar `ssh.` de DNS, endpoint de WireGuard por IP.
- [ ] Tokens nuevos (R2 imágenes y backups, Resend, service token de Access) para el entorno definitivo.
- [ ] Stripe **live** (claves, webhook nuevo) y registrar el dominio en _Payment method domains_ (Apple/Google Pay; faseI-marca §7.1).
- [ ] Quitar Access de la tienda, `ROBOTS=index`, decidir el **robots.txt gestionado de Cloudflare** (`Content-Signal`, SEO 61 en Lighthouse).
- [ ] `CART_CLEANUP_DAYS=30` (hoy 5).
- [ ] Borrar los productos mock y cargar el catálogo real (`catalog:import`, fotos reales); script de limpieza de objetos huérfanos del bucket (fase6 §7).
- [ ] Bucket lock en `hiro-backups` (valorar).
- [ ] Renovate en producción: todo con aprobación en el Dependency Dashboard salvo `vulnerabilityAlerts`; desplegar solo versiones con tag.

**Funcional**:

- [ ] 🔴 **Pedidos de invitado → cuenta** (fase propia): al registrarse con el mismo email, los pedidos de invitado no salen en «Mis pedidos» ni dan puntos. Decidir A (pasarlos al verificar el email) o B (transferencia oficial de Medusa), puntos retroactivos y «cliente con cuenta que compra sin entrar» (fase11 §7).
- [ ] Carritos de «invitado con email» con pago de Stripe pendiente: no se limpian (fase10 §7). Purgado definitivo de los borrados en suave.
- [ ] Baja de cuenta automática (borrado/anonimizado con workflow; ahora es manual, fase9 §7).

**👤 Gestoría** (todos los textos son provisionales):

- [ ] Condiciones de compra (con códigos), condiciones del programa de puntos, privacidad, cookies, aviso legal y pie legal de los emails (`packages/emails/src/_components/Layout.tsx`).
- [ ] Aviso de puntos del email de confirmación (G4/G5).
- [ ] Clasificación de productos en IVA reducido/superreducido.
- [ ] Omnibus (precio anterior en ofertas), desistimiento de personalizados (correas, TRLGDCU art. 103 c), antiparasitarios (RD 666/2023).
- [ ] Comunicaciones comerciales (carrito abandonado, avisos de precio): consentimiento y baja.

## 3. Fases del roadmap que quedan

| Fase                          | Contenido                                                                                                                                                      | Notas                                                                                            |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| **12 Monitorización (resto)** | GlitchTip + `@sentry/node` / `@sentry/astro` **solo en servidor**; vigilante externo del homelab (UptimeRobot / Healthchecks.io); alertas de error de app      | Kuma, Beszel, Dozzle y WireGuard ya están (fase 11-8). Dependencias nuevas: requieren aprobación |
| **Pedidos de invitado**       | §2                                                                                                                                                             | Antes de abrir                                                                                   |
| **13 Optimización continua**  | ver §4                                                                                                                                                         | —                                                                                                |
| **Marketing**                 | carrito abandonado (tutorial oficial de Medusa), avisos de bajada de precio / reposición (R8), envío gratis por `item_total` («te faltan X €»), upselling (R3) | Comunicación comercial → gestoría                                                                |

## 4. Fase 13 — rendimiento y operación (candidatas)

- [ ] 🟠 **Rebuild del storefront por webhook** de catálogo: hoy un producto, foto, oferta o categoría nuevos no aparecen hasta el siguiente build (fase3, fase6, faseI-interficie). Con ello: `offers.price` en el JSON-LD (fase3 §7).
- [ ] 🟠 **Capacidad sin Cloudflare ~20 páginas/s** (fase11 §5.7): caché corta de `LiveSyncData` en Astro, módulo de caché de Medusa en Redis, o L-2 (resumen por producto en Redis, ESTADO §7). Repetir la tanda B y la B2 a 20 páginas/s.
- [ ] LCP de las fichas ~1,8–2 s: foto principal a 720 px, CSS crítico (~110 ms), logos del pie y la cabecera más pequeños (auditoría pre-fase 10 §6).
- [ ] Speculation Rules inline y view transitions CSS (sin JS; fase3 §7.1).
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
- **Cuenta** (fase9): revocación de JWT (lista o sesiones), cambio de email, más datos del cliente (lista del usuario).
- **Diseño** (faseD, faseI): foto del hero, logo en negativo, botón de pausa de la barra de anuncios, textos de «Sobre nosotros»; probar Safari/WebKit; `/productos/` 91–94 en Lighthouse **local**.
- **Fotos reales**: script de preparación (sRGB, sin EXIF/GPS, ~2400 px, JPEG q85–90; fase6).
- **CI**: RAM del runner (dos builds a la vez pueden agotar los 4 GB; fase2); quitar los `overrides` de seguridad cuando las dependencias traigan las versiones arregladas; vigilar los 5 avisos moderados de `pnpm audit`.
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
