# Fase MK — Marketing respetuoso

> **Estado:** ✅ cerrada (12-nov-2026): MK-A (4-nov), MK-B (5-nov), MK-C, MK-D y MK-E (11-nov) y MK-E2 (12-nov). **MK-F (gincana) y MK-C2 (snacks), para después de abrir** (decisión del usuario).
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
| MK-D    | **Escaparate** de «Mis peques» (on-demand, solo nombre, foto y edad; tarjetas flotantes y fila de arcoíris para las fallecidas; botón de pausa; casilla propia + moderación en el Admin) y **cumpleaños** (email respetuoso + señal en la cuenta) | ✅     |
| MK-E    | **Analítica sin cookies**: Umami autoalojado                                                                                                                                                                                                      | ✅     |
| MK-E2   | **Búsquedas sin resultados** (backend, sin datos personales, página en el Admin)                                                                                                                                                                  | ✅     |
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
  elegida (oculta, selector de opciones o la fila marcada de la tabla de variantes: desde `fix/ficha-ofertas`, #86, las
  agotadas también se pueden elegir). Sin JS: 303 a la ficha con `#aviso-<código>` (`CartNotice`); con JS lo envía `CartClient` como el
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

## 3. MK-C — Comparador de alimentación (hecha)

### 3.1 Qué se ha hecho

El comparador es la **vista tabla de la búsqueda**: mismos filtros (categorías, proteína y grasa sobre materia seca,
precio, «Solo disponibles»…), orden y paginación que `/buscar/`, sin páginas estáticas nuevas.

- **`/comparar/`**: alias legible de `/buscar/?vista=tabla` (la ruta fija la vista; `/buscar/?vista=tabla` redirige
  301 aquí). noindex y canonical a sí misma, como `/buscar/`. Fragmento `/comparar/parcial/` para `SearchLive` (con JS
  los filtros se aplican en el sitio).
- **Interruptor Tarjetas | Tabla comparativa** (`ViewToggle`): dos enlaces con los mismos filtros, solo si algún
  resultado tiene datos analíticos (humedad y proteína).
- **Tabla** (`CompareTable`), compacta (decisión del usuario): proteína y grasa **sobre materia seca** (lo que se filtra y
  ordena), **€/kg** (el formato más barato por kilo) y **€/kg de materia seca**. Sin dato, «—». Precio y stock frescos
  (como las tarjetas de la búsqueda).
- **Orden** «Más proteína (MS)» (de más a menos) y «Menos grasa (MS)» (de menos a más; decisión del usuario; sin dato, al final): `proteina_ms` y `grasa_ms`
  pasan a `sortable()` en el índice `product` (`db:migrate` crea `product_v5` y se rellena al arrancar el backend).
- **Comparar 2–4** (`/comparar/elegidos/?p=…`): casillas en la tabla y lado a lado con foto (miniaturas del build,
  como `/buscar/`), precio, proteína, grasa, fibra y cenizas MS, **hidratos estimados\*** (MS), humedad, €/kg, €/kg MS y
  «Otros» de la etiqueta. Nota fija: «\* Hidratos estimados: **los calculamos nosotros** como 100 − proteína − grasa −
  fibra − cenizas − humedad… No figuran en la etiqueta del fabricante». Más de 4 → los 4 primeros y un aviso; menos de 2
  → mensaje. Las casillas solo cuentan dentro de la página.
- **Entradas**: «Comparar» en la cabecera (escritorio y menú móvil) y en el pie; botón «Tabla comparativa» en las
  categorías **hoja** con datos; botón «Comparar con otros de <categoría>» bajo los componentes analíticos de la ficha
  (`?marcar=`: la fila sale marcada y, si no está en la página, la primera).
- **Solo productos comparables**: `/comparar/` filtra siempre por `has_analytics` (campo nuevo del índice: humedad y
  proteína), así resultados **y facetas** solo llevan a productos con datos (sin «Juguetes» ni «Ropa» en el panel).
- **Entrada**: «Comparar» de la cabecera y el pie lleva a `/comparar/` sin nada elegido: todos los productos con datos,
  y se va filtrando (decisión del usuario; el filtro `has_analytics` ya deja fuera lo demás).
- **Sin saltos de layout**: el interruptor mide 32 px como los botones de la fila (con altura mínima) y `/comparar/`
  tiene la misma estructura que `/buscar/` (sin texto bajo el título). Medido en e2e.
- **Botones** «Tabla comparativa» (junto a «Filtrar», en las categorías hoja con datos) y «Comparar con otros de
  <categoría>» (ficha), con el estilo de «Filtrar» y el icono `table` de Phosphor.
- **0 JS nuevo**: `SearchLive` sigue en 982 B (mismo bundle).

### 3.2 Decisiones

| Decisión                                                                | Motivo                                                                                     | Fuente                                                                     |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| Vista tabla de `/buscar/` en vez de páginas propias                     | Usuario: misma potencia de filtros (varias categorías + rangos MS) con mucho menos trabajo | —                                                                          |
| Mezcla tipos (pienso y latas juntos), sin campo nuevo en el CSV         | Usuario; la materia seca los pone en la misma escala                                       | —                                                                          |
| `/comparar/` como la misma página (no redirección)                      | Usuario: que la URL diga «comparar». Sin problema de SEO: noindex y canonical a sí misma   | —                                                                          |
| Hidratos y €/kg MS calculados por nosotros, con nota                    | Usuario: siempre que se diga que los hidratos son nuestros (reclamaciones)                 | —                                                                          |
| Solo proteína y grasa como filtros/orden (fibra, cenizas, hidratos, no) | Usuario                                                                                    | —                                                                          |
| Orden por nutrientes en el índice                                       | `sortable()` en la definición; Meilisearch deja al final los documentos sin el campo       | context7 /medusajs/medusa (search modifiers, reindexing); meilisearch-docs |

## 4. MK-D — Escaparate «Vuestros peques» y cumpleaños (hecha)

### 4.1 Qué se ha hecho

- **Casilla propia** en la ficha de «Mis peques»: «Quiero que salga en el escaparate Vuestros peques» (solo nombre,
  foto y edad). Distinta del consentimiento de la foto. Se guarda aunque aún no haya foto.
- **Moderación** (modelo `pet`: `showcase_consent_at`, `showcase_status` pendiente/aprobada/rechazada,
  `showcase_reviewed_at`; migración aditiva): casilla + foto → `pendiente`; **cada foto nueva vuelve a `pendiente`**
  (decisión del usuario); quitar la casilla o la foto la saca al momento. Página del Admin **«Escaparate»**
  (`/app/escaparate`: pendientes, publicadas y rechazadas; aprobar o rechazar) y estado en el widget de mascotas.
- **`GET /store/showcase`** (público): SOLO `name`, `photo` y `label` (edad en texto o, fallecidas, «Hiro · 2009–2023»).
  Nunca el dueño, la raza, la salud ni ids. Hasta `SHOWCASE_MAX` (120) por grupo, las aprobadas más recientes.
- **`/peques/`** (on-demand, `s-maxage=300`, **noindex**, decisión del usuario; enlace solo en el pie): tarjetas que
  flotan con movimiento aleatorio **solo CSS** (por tarjeta, en el `<head>` con `HeadStyle`; semilla del día: el orden
  cambia cada día e igual para todos, cacheable), fallecidas en una franja con **arco iris en semicírculo** y desfile,
  **«Parar el movimiento»** (casilla + `:has()`, WCAG 2.2.2) y quietas con `prefers-reduced-motion`. 0 JS.
- **Cumpleaños**: job `pets-birthday` (worker, `PETS_BIRTHDAY_CRON`, `0 9 * * *` UTC: 10:00/11:00 en Madrid, aceptado
  por el usuario) con la fecha de Madrid: con día, ese día (29-feb → 28); con solo mes, el día 1; vivas y nacidas antes
  de este año. Un email `pet-birthday` por cliente con todas, **solo con el tema «Cumpleaños de mis peques»**
  (`sendMarketingEmail`: pie y cabeceras de baja; clave por mascotas y año). **Aviso en la cuenta** aunque no tenga el
  email: «🎂 ¡Hoy cumple Hiro 5 años!» en el resumen y en su ficha (la primera semana del mes si solo se sabe el mes).
- **Datos de prueba**: `pnpm --filter backend pets:mock [N=60] [borrar]` (clientes `peques-mock-*@example.com`, fotos
  de picsum en WebP —paisajes, no animales—, ≈15 % fallecidas, ≈20 % pendientes, algunas cumplen hoy).
- Privacidad: párrafos «Escaparate» y «Cumpleaños», provisionales (gestoría).
- **Ajustes tras revisarlo el usuario**: con foto, la ficha enseña «Aceptaste que la foto sea pública el …» (la casilla
  solo hace falta para subir o cambiar la foto; retirarlo = quitar la foto; también en el widget del Admin); arcoíris
  con nombre y años en líneas fijas (todas las tarjetas igual de altas, sombra sin cortar); **resumen de la cuenta con
  una tarjeta por apartado y en el orden del menú** (Lista de deseos —con el nº de productos—, Avisos de stock —«Estás
  esperando N» y «¡Ha vuelto…!»—, Mis pedidos, Mis datos, Mis puntos, Mis peques, Direcciones y Comunicaciones —temas
  activos—).

- **Avisos como toast también sin JS** (`StaticToast.astro`, petición del usuario): las confirmaciones de la cuenta
  («Dirección guardada», «Preferencias guardadas», «Ficha guardada»…) y de los POST sin JS (carrito, lista de deseos,
  avisos de stock) salen abajo con el aspecto de los toasts de `CartClient`; se van solas a los 4 s (CSS), se pausan con
  el ratón o el teclado y se cierran con ✕ (casilla + `:has()`); con `prefers-reduced-motion` no se van solas. Los
  errores y las instrucciones siguen arriba y fijos. 0 JS.

### 4.2 Decisiones

| Decisión                                         | Motivo                                                                            | Fuente                                                          |
| ------------------------------------------------ | --------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Casilla propia del escaparate                    | El consentimiento de la foto (Fase M) no cubre mostrarla en la tienda             | RGPD art. 7                                                     |
| Moderar cada foto                                | Usuario                                                                           | —                                                               |
| `/peques/` noindex                               | Usuario: sin fotos de clientes en buscadores; retirada inmediata; no penaliza     | —                                                               |
| Movimiento solo CSS, por tarjeta en el `<head>`  | 0 JS y CSP sin `style="…"`; `Astro.csp.insertStyleHash` vale en páginas on-demand | astro-docs (`csp.insertStyleHash`)                              |
| Pausa con `:has()` y `prefers-reduced-motion`    | WCAG 2.2.2 (pausar animaciones de más de 5 s) y accesibilidad vestibular          | context7 MDN (`prefers-reduced-motion`, `animation-play-state`) |
| Orden barajado por día, no por visita            | Igual para todos → la página se cachea (Cloudflare) sin cargar el servidor        | —                                                               |
| Cumpleaños a las 9:00 UTC con la fecha de Madrid | Usuario (no importa la hora local); la fecha sí debe ser la de Madrid             | context7 /medusajs/medusa (scheduled jobs)                      |

## 4b. MK-E — Analítica sin cookies con Umami (hecha)

### 4b.1 Qué se ha hecho

- **Umami 3.4.1** (`ghcr.io/umami-software/umami:3.4.1`) con BD `umami` y usuario propios **en el mismo Postgres**
  (servicio `umami-db-init`, idempotente), `mem_limit: 512m`, `DISABLE_TELEMETRY=1`, sal por defecto (**mensual**).
  - Dev: perfil `umami` de `compose.dev.yml` → `pnpm infra:umami:up` / `infra:umami:down`; panel y recogida en
    `http://localhost:3100` (`UMAMI_BIND=0.0.0.0` para la red local). ~130 MB de RAM en reposo.
  - Prod: `compose.prod.yml` (`umami-db-init` + `umami`, red interna) y Caddy `{$STATS_DOMAIN}` → `umami:3000`
    (noindex; `script.js` 1 h de caché). Variables `STATS_DOMAIN`, `UMAMI_DB_PASSWORD`, `UMAMI_APP_SECRET`,
    `UMAMI_URL`, `UMAMI_WEBSITE_ID` en `.env.prod.example`. **Panel detrás de Cloudflare Access** con excepciones
    (Bypass) para `/script.js` y `/api/send`.
- **Storefront**: variables de **build** `UMAMI_URL`, `UMAMI_WEBSITE_ID` y `UMAMI_DOMAINS` (por defecto el host de
  `SITE_URL`; `data-domains`: en otros hosts no cuenta). Sin las dos primeras no hay script (CI, tests, fixtures).
  - `BaseLayout`: `<script defer src=…/script.js data-website-id data-domains data-do-not-track="true"
data-performance="true" data-before-send="umamiFiltro">`, después de `SiteClient` (orden de ejecución: el filtro
    existe antes del primer envío). CSP: el origen de Umami en `script-src` y `connect-src`.
  - **Filtro** (`lib/analytics.ts` → `window.umamiFiltro` en `SiteClient`, +250 B gzip): de la URL solo quedan `q` y
    `utm_*`; sin `#`; ids y tokens de la ruta → `:id` (`/pedido/`, `/cuenta/pedidos/`, `/cuenta/mascotas/`,
    `/deseos/`) y entonces el título es la ruta; referencia externa = solo el origen.
  - **Eventos** con `data-umami-event` (`umamiEvent()`, 0 JS nuestro), solo en botones: `anadir-carrito` (con
    `producto`: ficha, granel, correa, caja), `avisame-stock`, `deseos-guardar`, `comparar` y `checkout-pagar`. Sin
    `identify` ni importes.
  - `check:budget`: como máximo un script externo con `data-website-id` y `defer`; ningún otro.
  - `/cookies/` (clave `umami.disabled`, que Umami solo lee) y `/privacidad/#analitica` (provisionales, gestoría).
- **Medido**: script 4,8 KB (2,3 KB gzip). Lighthouse móvil (3 pasadas, con / sin Umami): home 90/90/90 vs
  84/89/89, ficha 93/94/95 vs 96/95/91: dentro del ruido; TBT 0 y CLS igual. +4 KB por página la primera vez.

### 4b.2 Decisiones

| Decisión                                                | Motivo                                                                      | Fuente                                              |
| ------------------------------------------------------- | --------------------------------------------------------------------------- | --------------------------------------------------- |
| VPS, subdominio y BD propios                            | Usuario: separable (pg_dump + DNS) si se lleva a otro VPS                   | —                                                   |
| `defer` sin Partytown (excepción ≤ 3 KB gzip)           | Partytown pesa más que Umami                                                | Usuario                                             |
| Filtro en vez de `data-exclude-search`                  | `exclude-search` quita también `q` y los `utm_*` (campañas)                 | código del tracker v3.4.1 (`normalize`), `api/send` |
| Sal mensual (por defecto)                               | Usuario: «visitantes que vuelven» dentro del mes                            | docs.umami.is (`SALT_ROTATION`, metric-definitions) |
| Sin servirlo desde el dominio de la tienda              | Respetar los bloqueadores («marketing respetuoso»)                          | Usuario                                             |
| Eventos solo en botones                                 | En enlaces Umami retrasa la navegación (`preventDefault` + envío)           | código del tracker v3.4.1 (`handleClicks`)          |
| Interés legítimo, sin banner (pendiente de la gestoría) | Sin cookies ni almacenamiento propio; la AEPD no lo ha eximido expresamente | —                                                   |

**Nota**: `/buscar/` redirige a su URL canónica (301) y quita los `utm_*`; las campañas deben enlazar a la home,
fichas, categorías o colecciones (no a una búsqueda).

## 4c. MK-E2 — Búsquedas sin resultados (hecha)

### 4c.1 Qué se ha hecho

- **Módulo `searchLog`** (`src/modules/search-log`, migración `Migration20261112093849`): tabla `search_term`
  (`term`, `week` = lunes UTC, `count`, `zero_count`, `last_total`; único `term + week`). Suma con un solo
  `INSERT … ON CONFLICT DO UPDATE` (atómico). Nada personal: ni IP, ni cliente, ni hora.
- **Qué se cuenta**: solo la búsqueda **limpia** de `/buscar/` (texto, página 1, sin filtros ni orden;
  `isPlainSearch`). El storefront manda `x-search-log: 1` a `POST /store/search`; el middleware `logSearch`
  (`lib/search-log-middleware.ts`) no cambia ni retrasa la respuesta: al responder emite `search.logged` con el término
  normalizado y el total, y el subscriber `search-logged` lo suma en el worker. Sugerencias, filtros, páginas y
  `SearchLive` no cuentan.
- **Normalización** (`lib/search-log.ts`): minúsculas, sin acentos (la ñ se queda), sin signos; 2–60 caracteres; se
  descarta lo que lleva `@` o 6+ cifras seguidas (emails, teléfonos, DNI, nº de pedido).
- **Retención**: 52 semanas (job `search-log-purge`, `SEARCH_LOG_PURGE_CRON`, diario 4:45).
- **Admin → «Búsquedas»** (`/app/busquedas`, `GET /admin/search-terms?dias=7|30|90|365[&formato=csv]`): «Sin
  resultados» (los que hoy ya encuentran algo, al final) y «Más buscadas», con enlace a la búsqueda en la tienda
  (`STOREFRONT_URL`) y **Descargar CSV** (`;`, BOM para Excel, sin fórmulas).
- **Campañas**: `/buscar/` y `/comparar/` conservan los `utm_*` al redirigir a la URL canónica (`splitUtm`/`withUtm`).
- 0 JS en el navegador.

### 4c.2 Decisiones

| Decisión                               | Motivo                                                                   | Fuente                                               |
| -------------------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------- |
| En el backend, no en Umami             | Umami no sabe si hubo resultados; aquí cuenta a todos (sin JS, bloqueo)  | —                                                    |
| Solo búsquedas sin filtros             | Usuario: con filtros, 0 resultados no dice nada del término              | —                                                    |
| Cabecera + middleware + evento         | La ruta de Medusa no se toca; el recuento va al worker (AGENTS §4)       | código de `@medusajs/medusa` 2.22.6 (`store/search`) |
| SQL `ON CONFLICT` con `@InjectManager` | Suma atómica con búsquedas simultáneas                                   | context7 /medusajs/medusa (db-operations)            |
| 52 semanas                             | Usuario                                                                  | —                                                    |
| Cifras orientativas                    | `/buscar/` se cachea 60 s en Cloudflare: repetidas en el mismo minuto, 1 | —                                                    |

## 5. Cómo usarlo

- **Búsquedas** (MK-E2): migración del módulo `searchLog` (la aplica el `server`); `SEARCH_LOG_PURGE_CRON` (worker).
  Admin → «Búsquedas»: periodo y «Descargar CSV».
- **Umami** (MK-E): dev `pnpm infra:umami:up` → `http://localhost:3100` (admin / umami la primera vez: cambiarla) →
  crear el sitio → `UMAMI_URL` + `UMAMI_WEBSITE_ID` (+ `UMAMI_DOMAINS` si se entra por IP) en `apps/storefront/.env`
  y reiniciar `pnpm dev`. Para no contar tus visitas: en la consola del navegador `localStorage.setItem("umami.disabled", 1)`.
  Prod: secretos y `STATS_DOMAIN` en `.env.prod`, crear el sitio en el panel, rellenar `UMAMI_URL`/`UMAMI_WEBSITE_ID`
  y reconstruir el storefront; Cloudflare Access en `STATS_DOMAIN` con Bypass para `/script.js` y `/api/send`.
  Campañas: enlaces con `?utm_source=…&utm_medium=…&utm_campaign=…`.

- **Variable nueva** `COMMS_UNSUBSCRIBE_SECRET` (≥ 32 caracteres, `openssl rand -base64 48`): backend (`.env.example`,
  `.env.test.example`), `docker/compose.prod.yml` (bloque común, obligatoria) y `docker/.env.prod.example`. Si cambia,
  los enlaces de los emails ya enviados dejan de valer (la baja sigue en la cuenta).
- **Migración** del módulo `comms`: `pnpm --filter backend exec medusa db:migrate` (en producción la hace el `server`).
- **Email comercial nuevo** (MK-D, MK-F): plantilla con `unsubscribe?: EmailUnsubscribe` en sus props y `<Layout
unsubscribe={props.unsubscribe}>`, y se envía con `sendMarketingEmail(container, { customerId, topic, to, template,
data, idempotencyKey })`. Nunca con `sendEmail`.
- **Escaparate y cumpleaños** (MK-D): migración del módulo `pets` (la aplica el `server`); `PETS_BIRTHDAY_CRON`
  (worker). Moderación en Admin → «Escaparate». Datos de prueba: `pnpm --filter backend pets:mock 60` (y `borrar`).
- **Comparador** (MK-C): tras desplegar, el `server` migra el índice (versión nueva: ordenable por proteína y grasa
  MS y con `has_analytics`) y lo rellena al arrancar; mientras, el anterior sigue sirviendo y `/comparar/` sale vacío
  unos segundos (sin `has_analytics`; aceptado por el usuario).
- **Avisos de stock** (MK-B): `STOCK_ALERT_TTL_DAYS` (30–730, 180), `STOCK_ALERT_CRON` (5 min) y
  `STOCK_ALERT_EXPIRE_CRON` (diario 4:30). Lista de espera: Admin → «Avisos de stock», el widget del producto o
  `pnpm --filter backend stock-alerts:list [csv fichero.csv]`. Migración del módulo `stockAlert`.
- **Tema nuevo**: añadirlo a `COMMS_TOPICS` en los **dos** `lib/comms.ts`, generar la migración del módulo (el `enum`
  de `topic`) y el párrafo de privacidad.

## 6. Cómo testear

```bash
pnpm --filter backend test                                   # unitarios (comms.unit.spec.ts)
pnpm --filter backend test:integration:http -- comunicaciones   # 5 tests: sesión, guardar, baja, email, borrar cliente
pnpm --filter emails test                                    # layout.test.tsx (pie de baja)
pnpm --filter storefront exec vitest run src/lib/analytics.test.ts   # filtro de Umami (MK-E)
pnpm --filter backend exec jest src/lib/search-log.unit.spec.ts      # normalización, semana, CSV (MK-E2)
pnpm --filter backend test:integration:http -- search               # incluye las estadísticas de búsquedas (MK-E2)
# e2e de analítica (build con UMAMI_URL/UMAMI_WEBSITE_ID; sin ellos se salta): pnpm --filter storefront exec playwright test analitica
pnpm --filter storefront test                                # comms.test.ts (copia idéntica) y cache.test.ts
# e2e (build servido en :4398; el backend con el mismo COMMS_UNSUBSCRIBE_SECRET que lee el test de apps/backend/.env):
E2E_BASE_URL=http://localhost:4398 pnpm --filter storefront exec playwright test comunicaciones
# MK-B
pnpm --filter backend test:integration:http -- avisos-stock   # 4 tests: rutas, Admin, detección, «puede agotarse», email, caducidad
E2E_BASE_URL=http://localhost:4398 pnpm --filter storefront exec playwright test avisos-stock
# MK-D
pnpm --filter backend pets:mock 60
pnpm --filter backend test:integration:http -- mascotas        # escaparate (moderación, datos públicos) y cumpleaños
E2E_BASE_URL=http://localhost:4398 pnpm --filter storefront exec playwright test peques
# MK-C
pnpm --filter backend test:integration:http -- search          # orden por proteina_ms / grasa_ms
E2E_BASE_URL=http://localhost:4398 pnpm --filter storefront exec playwright test comparar
```

A mano (MK-B, hecho el 5-nov-2026): con sesión, guardar en la lista un producto de una variante agotado → «Avísame» en
la lista → reponer 1 unidad (1 esperando) → en ≤ 5 min email «Ha vuelto: …» con «puede agotarse pronto» en Mailpit y el
aviso desaparece de la cuenta.

A mano: Mi cuenta → Comunicaciones (todo apagado) → marcar y guardar → en el Admin, ficha del cliente, widget
«Comunicaciones» con el historial.

## 7. Criterio de salida MK-A

- [x] Casillas en la cuenta, apagadas por defecto, sin JS.
- [x] Baja con el enlace (botón) y de un clic (POST del cliente de correo), sin JS; abrir el enlace no da de baja.
- [x] Ningún email comercial sale sin consentimiento (`sendMarketingEmail`) y todos llevan pie y cabeceras de baja.
- [x] Historial del consentimiento y widget del Admin; borrado al borrar el cliente.
- [x] axe sin fallos y sin violaciones de la CSP en `/cuenta/comunicaciones/` y `/baja/`.

Criterio de salida MK-D:

- [x] Casilla propia, moderación de cada foto y retirada inmediata; la API pública solo da nombre, foto y edad.
- [x] `/peques/` noindex, 0 JS, movimiento aleatorio con pausa y `prefers-reduced-motion`; fallecidas en el arco iris.
- [x] Felicitación solo con el tema activado, una vez al año; aviso en la cuenta.
- [x] axe y CSP sin fallos en claro y oscuro; sin desbordar en móvil.

Criterio de salida MK-C:

- [x] Tabla de los mismos resultados que `/buscar/` en `/comparar/`, con cambio de vista que conserva filtros; sin JS.
- [x] Componentes sobre materia seca, hidratos estimados con su nota, €/kg y €/kg MS.
- [x] Orden por proteína MS (de más a menos) y grasa MS (de menos a más); 2–4 productos lado a lado.
- [x] Entradas en cabecera, pie, categorías hoja y ficha. 0 JS nuevo; axe y CSP sin fallos.

Criterio de salida MK-B:

- [x] «Avísame» por variante en la ficha (selector, tabla y una variante) y en la lista de deseos; sin JS y con JS.
- [x] Sin sesión: entrar y el aviso queda creado.
- [x] Un email por cliente al volver el stock, con «puede agotarse pronto» si no llega para todos; el aviso se borra.
- [x] Caducidad configurable; lista de espera en el Admin (página y widget) y por terminal.
- [x] 0 bytes de JS nuevos; axe y CSP sin fallos en «Avisos de stock».

## 8. Pendientes / riesgos

- 👤 Gestoría: texto de privacidad «Comunicaciones» y el de cada tema (`description`); ¿el aviso de stock pedido por el
  cliente (MK-B) es comunicación comercial?
- Rate limiting de `/baja/` en Cloudflare (como el resto de formularios sin sesión) al abrir la tienda.
- MK-B: si el email `stock-back` falla, el aviso se borra al día siguiente sin reintentar (el job no lo repite para no
  mandar dos). Aceptable con el volumen esperado.
- MK-D: con muchas aprobadas, `/peques/` enseña las 120 más recientes de cada grupo (barajadas cada día); si hace
  falta, paginar o rotar. Las fotos son las del bucket (800 px WebP): unos 40–80 KB cada una, en diferido.
- MK-D: las fotos de `pets:mock` son paisajes de picsum; para ver el escaparate «de verdad», fotos reales.
- 👤 Gestoría: textos de «Escaparate» y «Cumpleaños» (privacidad) y del email de cumpleaños.
- MK-C: el comparador depende del índice de búsqueda (si Meilisearch cae, como `/buscar/`, 503 con su aviso).
- MK-C: «Comparar seleccionados» solo con productos de la misma página (24); ordenar antes ayuda.
- MK-C2 (snacks): características (dureza, duración, olor, se desmenuza, pelo, tamaño, proteína principal,
  monoproteico, proceso, uso, apto cachorros) como columnas `snack:*` de la hoja y filtros; pendiente de que el usuario
  las decida.
- 👤 Gestoría: texto de la nota de los hidratos estimados.
- MK-B: con la caché de Medusa (`MEDUSA_FF_CACHING`), la disponibilidad que lee el job se invalida por evento, de forma
  asíncrona: un aviso puede salir una pasada (5 min) más tarde. El test de integración reintenta el job hasta verlo
  (con Medusa 2.22.6 se notó; con 2.22.2, no).
- MK-B: con reservas (pedidos pendientes) la disponibilidad puede volver a 0 entre la pasada y el email: el texto ya
  dice «puede agotarse pronto» cuando hay pocas.
- Rebotes y quejas de Resend (webhook) cuando haya volumen: una queja debería quitar todos los temas.
