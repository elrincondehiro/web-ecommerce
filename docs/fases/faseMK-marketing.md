# Fase MK — Marketing respetuoso

> **Estado:** 🚧 en curso: MK-A (4-nov-2026) y MK-B (5-nov-2026) hechas; MK-C a MK-F pendientes.
> **Rama/PR:** `feat/marketing-comunicaciones` (MK-A, MK-B…; un PR con 2–3 subfases) · PR #…
> **Anterior:** [Fase CS — caja de snacks](./faseCS-caja-snacks.md)

## 0. Qué es y orden (decisión del usuario, 4-nov-2026)

Marketing **poco invasivo**: nada de mendigar reseñas y el email de carrito abandonado como última opción. Todo
email comercial depende de un consentimiento expreso y tiene baja de un clic.

| Subfase | Contenido                                                                                                                                                                                                                                         | Estado |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| MK-A    | **Comunicaciones**: apartado en la cuenta (casillas por tema) + baja de un clic en cada email (A + B)                                                                                                                                             | ✅     |
| MK-B    | **Avisos de stock**, solo con cuenta («Avísame cuando vuelva», por variante; un email y se borra)                                                                                                                                                 | ⏳     |
| MK-C    | **Comparador** de alimentación por materia seca: tablas estáticas por tipo (pienso con pienso, latas con latas) + comparación dinámica de 2–4 productos                                                                                           | ⏳     |
| MK-D    | **Escaparate** de «Mis peques» (on-demand, solo nombre, foto y edad; tarjetas flotantes y fila de arcoíris para las fallecidas; botón de pausa; casilla propia + moderación en el Admin) y **cumpleaños** (email respetuoso + señal en la cuenta) | ⏳     |
| MK-E    | **Analítica sin cookies**: Umami autoalojado                                                                                                                                                                                                      | ⏳     |
| MK-F    | **Gincana de huellas**: solo con cuenta, «todos hasta N», niveles por color (1 €, 3 €, 5 €…) con presupuesto por huella                                                                                                                           | ⏳     |

Aparcado: **Google Shopping** (feed de Merchant Center), hasta el catálogo final y el rebuild por webhook (cuando los
cambios estructurales sean mínimos).

## 1. MK-A — Comunicaciones (hecha)

### 1.1 Qué se ha hecho

- **Temas** (`lib/comms.ts`, **idéntico** en backend y storefront; el test del storefront lo comprueba): `novedades`
  (Novedades y ofertas), `cumpleanos` (Cumpleaños de mis peques) y `gincana` (Gincana de huellas). Cada uno con
  `version` del texto: súbela al cambiar el texto de un tema.
- **Backend**:
  - Módulo `comms` (`comms_consent`, migración nueva): una fila por cada vez que se activa un tema, que se **cierra**
    (`revoked_at`, `revoked_via`: cuenta | baja | admin) al quitarlo; nunca se borra salvo al borrar el cliente. Queda la
    prueba de qué se aceptó, cuándo, desde dónde y con qué versión del texto (RGPD art. 7.1). Enlace de solo lectura
    con el cliente (`src/links/comms-customer.ts`).
  - Workflows `set-comms-consents`, `unsubscribe-comms` y `delete-comms-consents` (pasos con compensación).
  - Rutas: `GET/POST /store/customers/me/comms` (sesión), `GET/POST /store/comms/unsubscribe` (token, sin sesión) y
    `GET /admin/customers/:id/comms` (widget).
  - Token de baja (`lib/comms-token.ts`): `<cliente>.<tema>.<HMAC-SHA256>` con `COMMS_UNSUBSCRIBE_SECRET`; sin BD ni
    caducidad; solo sirve para quitar ese tema a ese cliente.
  - **`sendMarketingEmail`** (`src/subscribers/_email.ts`): el único camino para un email comercial. Comprueba el
    consentimiento (si no hay, no envía y devuelve `false`), añade el pie de baja y las cabeceras `List-Unsubscribe` +
    `List-Unsubscribe-Post` (vía `provider_data.headers`; el proveedor solo deja pasar esas dos).
  - Widget del Admin «Comunicaciones (emails comerciales)» en la ficha del cliente, **solo lectura**, con el historial.
  - Subscriber `comms-customer-deleted`: al borrar el cliente se borran sus consentimientos.
- **Emails** (`packages/emails`): `Layout` acepta `unsubscribe: { url, topic }` y pinta «Recibes este email porque
  activaste «X» en tu cuenta. Darme de baja o elegir qué recibir en Mi cuenta → Comunicaciones». Las plantillas
  comerciales (MK-D, MK-F) lo declaran en sus props; `sendMarketingEmail` solo acepta esas plantillas.
- **Storefront** (0 KB de JS, sin JS funciona igual):
  - `/cuenta/comunicaciones/` (on-demand): casillas apagadas por defecto, action `account.comms`, entrada en el menú.
  - `/baja/?t=…` (on-demand, `private, no-store`, `Referrer-Policy: same-origin`): con GET muestra «¿Quieres dejar de
    recibir emails de X?» y un botón (abrir el enlace no da de baja); el POST del botón da de baja; el POST de un clic del
    cliente de correo (`List-Unsubscribe=One-Click`) responde 200 vacío.
  - Privacidad: párrafo «Comunicaciones» (`#comunicaciones`), provisional para la gestoría.

### 1.2 Decisiones

| Decisión                                                         | Motivo                                                                                                                                                                                                                             | Fuente                                                                                  |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| A + B: casillas en la cuenta + permiso por acción (MK-B)         | Usuario. Claro y nada invasivo; los avisos puntuales (stock) se piden donde se usan                                                                                                                                                | —                                                                                       |
| Tres temas desde el principio                                    | Usuario: novedades y ofertas, cumpleaños y gincana                                                                                                                                                                                 | —                                                                                       |
| Historial de filas en vez de un booleano                         | Prueba del consentimiento (cuándo, desde dónde, versión del texto)                                                                                                                                                                 | RGPD art. 7.1                                                                           |
| Baja de un clic con `List-Unsubscribe` + `List-Unsubscribe-Post` | Gmail y Yahoo lo exigen a envíos masivos; la URL acepta POST (vacío, 200) y GET (página con botón)                                                                                                                                 | MCP resend-docs: `add-unsubscribe-to-transactional-emails`, `custom-headers` (RFC 8058) |
| La baja la atiende el storefront (`/baja/`), no `api.`           | El POST de un clic llega sin `Origin` ni `Sec-Fetch-Site` y `checkOrigin` de Astro lo deja pasar (probado: solo bloquea un `Origin` distinto o `Sec-Fetch-Site: cross-site`). Así no hace falta abrir una ruta en el WAF de `api.` | astro-docs (`security.checkOrigin`) + astro 7.4.4 `core/app/origin-check.js`            |
| Token firmado (HMAC) sin BD ni caducidad                         | Una baja tiene que funcionar con un email antiguo; si se filtra, solo quita un tema                                                                                                                                                | —                                                                                       |
| Abrir `/baja/` no da de baja                                     | Antivirus y vistas previas abren los enlaces (como `/cuenta/verificar/`); el POST de un clic sí                                                                                                                                    | AGENTS §3.2 (enlaces que hacen algo)                                                    |
| Widget del Admin de solo lectura                                 | Lo decide el cliente; la tienda no activa comunicaciones por él                                                                                                                                                                    | —                                                                                       |

## 2. MK-B — Avisos de stock (hecha)

### 2.1 Qué se ha hecho

- **Ficha**: en una combinación agotada, «Avísame» en lugar del «Agotado» desactivado (nombre accesible «Agotado.
  Avísame cuando vuelva …»). Envía el **formulario de compra** a `stockAlert.add` (`formaction`), así la variante es la
  elegida (oculta, selector de opciones o, en la tabla de variantes, el «Avísame» de cada fila agotada con
  `alert_variant_id`). Sin JS: 303 a la ficha con `#aviso-<código>` (`CartNotice`); con JS lo envía `CartClient` como el
  ♡ (`data-wish`: fetch + toast), **0 bytes nuevos** (mismo bundle). Correa y caja (diseños configurables), no.
- **Lista de deseos**: las filas con una variante concreta agotada llevan el mismo «Avísame». Las **tarjetas no**
  (decisión del usuario: no saben qué variante se quiere).
- **Sin sesión**: como el ♡ — cookie `stock_alert_pending` (httpOnly, 10 min, en `/cookies/`) y a «Entrar»; al entrar
  se crea el aviso.
- **Mi cuenta → Avisos de stock** (`/cuenta/avisos/`, on-demand, 0 JS): lo que espera, desde cuándo, «¡Ya ha vuelto!» si
  ya hay stock, y «Quitar».
- **Backend**:
  - Módulo `stockAlert` (`stock_alert`: cliente, producto, variante, `notified_at`; uno por cliente y variante, 50 por
    cliente). Enlaces de solo lectura con el cliente y la variante.
  - Rutas `GET/POST /store/customers/me/stock-alerts`, `DELETE …/:id`; al crear, 404 si no es del canal o no está
    publicado y 400 si hay stock, es configurable o está descatalogado.
  - **Detección** (job `stock-alerts`, `STOCK_ALERT_CRON`, cada 5 min, worker): solo mira las variantes que alguien
    espera, con `getVariantAvailability` (stock − reservas en los almacenes del canal; granel en pedidos mínimos). Las que
    tienen stock → workflow `fulfill-stock-alerts` (marca y emite `stock_alert.fulfilled`, uno por cliente) → subscriber
    `stock-alerts-email`: **un email por cliente** con todo lo que ha vuelto (`stock-back`) y se borran.
  - **«Puede agotarse pronto»** (decisión del usuario): si las unidades a la venta ≤ clientes que esperaban esa variante
    (3 repuestas para 1 → no; 3 para 20 → sí). Stock ilimitado, nunca.
  - **Caducidad** (job `stock-alerts-expire`, a diario): `STOCK_ALERT_TTL_DAYS` (30–730, **180** por defecto; 365 para
    productos de temporada, decisión del usuario). Limpia también los ya avisados si el email falló a medias.
  - **Lista de espera** para reponer: página del Admin **«Avisos de stock»** (`/app/avisos-stock`, en el menú), widget
    «Clientes esperando stock» en la ficha del producto y `pnpm --filter backend stock-alerts:list [csv fichero.csv]`.
    Por variante: cuántos esperan, SKU, lo que hay a la venta (en rojo si no llega) y desde cuándo. Sin datos de los
    clientes.
  - Al borrar el cliente se borran sus avisos.
- **Email** `stock-back`: lo que ha vuelto (foto, título, variante, enlace), «puede agotarse pronto» y «este aviso se
  envía una sola vez». **Sin** pie de baja de Comunicaciones: lo pidió el cliente para ese producto (opción B). Si la
  gestoría lo considera comercial, se pasa a `sendMarketingEmail` con un tema propio.

### 2.2 Decisiones

| Decisión                                                 | Motivo                                                                                             | Fuente                                                                          |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Solo con cuenta                                          | Usuario: evita abusos (apuntar emails ajenos) y no hace falta doble confirmación                   | —                                                                               |
| Ficha y lista de deseos, no tarjetas                     | Usuario                                                                                            | —                                                                               |
| Cookie de 10 min sin sesión, como el ♡                   | Usuario                                                                                            | Fase L-1                                                                        |
| Caducidad por variable, 180 días                         | Usuario: productos de temporada (de Navidad a Navidad → 365)                                       | —                                                                               |
| «Puede agotarse pronto» si a la venta ≤ esperando        | Usuario: 3 para 1 basta, 3 para 20 no                                                              | —                                                                               |
| Detección en un job propio sobre las variantes esperadas | Pocas variantes por pasada y nada en cada pedido; independiente de la marca de `search-stock-sync` | AGENTS §4; context7 /medusajs/medusa (`getVariantAvailability`, scheduled jobs) |
| Un email por cliente y pasada, y se borra                | No repetir; agrupa lo que vuelve a la vez                                                          | —                                                                               |
| «Avísame» con `formaction` + `data-wish`                 | Reutiliza el envío del ♡ en `CartClient` (al 99 % de su límite): 0 bytes nuevos                    | AGENTS §3.4                                                                     |
| Página del Admin sin icono                               | `@medusajs/icons` no es dependencia directa (el icono es opcional)                                 | context7 /medusajs/medusa (UI routes, `defineRouteConfig`)                      |

## 3. Cómo usarlo

- **Variable nueva** `COMMS_UNSUBSCRIBE_SECRET` (≥ 32 caracteres, `openssl rand -base64 48`): backend (`.env.example`,
  `.env.test.example`), `docker/compose.prod.yml` (bloque común, obligatoria) y `docker/.env.prod.example`. Si cambia,
  los enlaces de los emails ya enviados dejan de valer (la baja sigue en la cuenta).
- **Migración** del módulo `comms`: `pnpm --filter backend exec medusa db:migrate` (en producción la hace el `server`).
- **Email comercial nuevo** (MK-D, MK-F): plantilla con `unsubscribe?: EmailUnsubscribe` en sus props y `<Layout
unsubscribe={props.unsubscribe}>`, y se envía con `sendMarketingEmail(container, { customerId, topic, to, template,
data, idempotencyKey })`. Nunca con `sendEmail`.
- **Avisos de stock** (MK-B): `STOCK_ALERT_TTL_DAYS` (30–730, 180), `STOCK_ALERT_CRON` (5 min) y
  `STOCK_ALERT_EXPIRE_CRON` (diario 4:30). Lista de espera: Admin → «Avisos de stock», el widget del producto o
  `pnpm --filter backend stock-alerts:list [csv fichero.csv]`. Migración del módulo `stockAlert`.
- **Tema nuevo**: añadirlo a `COMMS_TOPICS` en los **dos** `lib/comms.ts`, generar la migración del módulo (el `enum`
  de `topic`) y el párrafo de privacidad.

## 4. Cómo testear

```bash
pnpm --filter backend test                                   # unitarios (comms.unit.spec.ts)
pnpm --filter backend test:integration:http -- comunicaciones   # 5 tests: sesión, guardar, baja, email, borrar cliente
pnpm --filter emails test                                    # layout.test.tsx (pie de baja)
pnpm --filter storefront test                                # comms.test.ts (copia idéntica) y cache.test.ts
# e2e (build servido en :4398; el backend con el mismo COMMS_UNSUBSCRIBE_SECRET que lee el test de apps/backend/.env):
E2E_BASE_URL=http://localhost:4398 pnpm --filter storefront exec playwright test comunicaciones
# MK-B
pnpm --filter backend test:integration:http -- avisos-stock   # 4 tests: rutas, Admin, detección, «puede agotarse», email, caducidad
E2E_BASE_URL=http://localhost:4398 pnpm --filter storefront exec playwright test avisos-stock
```

A mano (MK-B, hecho el 5-nov-2026): con sesión, guardar en la lista un producto de una variante agotado → «Avísame» en
la lista → reponer 1 unidad (1 esperando) → en ≤ 5 min email «Ha vuelto: …» con «puede agotarse pronto» en Mailpit y el
aviso desaparece de la cuenta.

A mano: Mi cuenta → Comunicaciones (todo apagado) → marcar y guardar → en el Admin, ficha del cliente, widget
«Comunicaciones» con el historial.

## 5. Criterio de salida MK-A

- [x] Casillas en la cuenta, apagadas por defecto, sin JS.
- [x] Baja con el enlace (botón) y de un clic (POST del cliente de correo), sin JS; abrir el enlace no da de baja.
- [x] Ningún email comercial sale sin consentimiento (`sendMarketingEmail`) y todos llevan pie y cabeceras de baja.
- [x] Historial del consentimiento y widget del Admin; borrado al borrar el cliente.
- [x] axe sin fallos y sin violaciones de la CSP en `/cuenta/comunicaciones/` y `/baja/`.

Criterio de salida MK-B:

- [x] «Avísame» por variante en la ficha (selector, tabla y una variante) y en la lista de deseos; sin JS y con JS.
- [x] Sin sesión: entrar y el aviso queda creado.
- [x] Un email por cliente al volver el stock, con «puede agotarse pronto» si no llega para todos; el aviso se borra.
- [x] Caducidad configurable; lista de espera en el Admin (página y widget) y por terminal.
- [x] 0 bytes de JS nuevos; axe y CSP sin fallos en «Avisos de stock».

## 6. Pendientes / riesgos

- 👤 Gestoría: texto de privacidad «Comunicaciones» y el de cada tema (`description`); ¿el aviso de stock pedido por el
  cliente (MK-B) es comunicación comercial?
- Rate limiting de `/baja/` en Cloudflare (como el resto de formularios sin sesión) al abrir la tienda.
- MK-B: si el email `stock-back` falla, el aviso se borra al día siguiente sin reintentar (el job no lo repite para no
  mandar dos). Aceptable con el volumen esperado.
- MK-B: con reservas (pedidos pendientes) la disponibilidad puede volver a 0 entre la pasada y el email: el texto ya
  dice «puede agotarse pronto» cuando hay pocas.
- Rebotes y quejas de Resend (webhook) cuando haya volumen: una queja debería quitar todos los temas.
