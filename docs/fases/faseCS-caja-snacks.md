# Fase CS — Caja de snacks

> **Estado:** ✅ hecha (3-nov-2026): CS-1 a CS-4. Producto, diseño `caja` (100 % estático), «¿Para quién es?»
> hasta el pedido, rellenar la caja desde el Admin y proponerla al cliente (aceptar / rechazar, 24 h, aviso de
> 48 h laborables) y flags `genera_puntos` / `pago_descuento` (§6). Pendiente aparte: §7.
> **Rama/PR:** `feat/caja-snacks` · PR #…
> **Anterior:** [Fase DS — diseños](./faseDS-disenos.md)

## 0. Qué es

Un producto «Caja de snacks» sin stock propio. El cliente elige cuánto paga y para qué mascota es. Tras el pago, la
tienda la rellena desde el Admin con productos del catálogo (cuyo stock se descuenta solo) y el cliente acepta la caja
o dice qué no le gusta.

## 1. Decisiones del usuario

| Tema                  | Decisión                                                                                                                                                                                                              |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Precio                | **Pasos**: 15, 20, 25, 30, 40 y 50 €. Una variante por importe (`sin_stock`). Si hay demanda, se pasa a precio libre (mín./máx.).                                                                                     |
| Varias cajas          | Sí, sin límite: **una caja por envío del formulario**, siempre en su línea y con cantidad 1 (cada una se prepara para su mascota). 10 perros = 10 envíos, 10 líneas del mismo pedido.                                 |
| IVA                   | **Reducido (10 %)**: tipo de producto `iva-reducido` (siempre son snacks).                                                                                                                                            |
| Puntos                | **Genera puntos** (`genera_puntos` vacío = sí).                                                                                                                                                                       |
| Descuentos            | **Descontable** de momento (`pago_descuento` vacío = sí), para probar. Con `pago_descuento = no` no admitiría códigos, promociones **ni pago con puntos** (§6).                                                       |
| Formulario (diseño 1) | En la ficha, 100 % estático (ver §2). Un diseño 2 (con las mascotas de «Mis peques» si hay sesión, no estático) queda para después, para medir uno frente al otro.                                                    |
| Salud                 | Con **consentimiento**: sin la casilla marcada, el campo de alergias no se guarda.                                                                                                                                    |
| Carrito y checkout    | **Sin edición** de los datos: si hay un error, se quita la caja y se vuelve a añadir.                                                                                                                                 |
| Rellenar              | En el Admin, dentro del pedido: productos y cantidades; ver valor PVP frente a lo pagado. El stock se reserva y descuenta solo.                                                                                       |
| Propuesta al cliente  | Email con el contenido y dos botones: **Aceptar** y **No me convence** (formulario: qué no le gusta). A las **24 h** sin respuesta, `aceptada_auto`. Si rechaza, se **rehace** y se vuelve a proponer con otras 24 h. |
| Envío                 | **No se puede enviar** el pedido hasta que todas sus cajas estén `aceptada` / `aceptada_auto`.                                                                                                                        |
| Aviso interno         | Caja con **48 h laborables** sin rellenar → aviso a la tienda. Laborables = lunes a viernes **sin festivos**; si contar festivos es complicado, basta con saltar los fines de semana.                                 |
| Loyverse              | No se tiene en cuenta: desaparece al desplegar la web.                                                                                                                                                                |

## 2. Formulario «¿Para quién es?» (diseño `caja`, CS-2)

| Campo                             | Control                                                                                   | Validación                                                                          |
| --------------------------------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Importe                           | radios 15 / 20 / 25 / 30 / 40 / 50 € (LiveSync)                                           | obligatorio                                                                         |
| Es un…                            | radios Perro / Gato                                                                       | obligatorio (solo perro o gato; «Otro» se quitó: no hay snacks para otros animales) |
| Nombre                            | texto                                                                                     | obligatorio, 30                                                                     |
| Raza o mezcla                     | texto                                                                                     | 30                                                                                  |
| Es cachorro (menos de 1 año)      | casilla                                                                                   | —                                                                                   |
| Edad                              | número + «años» (o «meses» si es cachorro)                                                | obligatorio; cachorro 1–12 meses, si no 1–25 años                                   |
| Peso                              | número + «kg aprox.»                                                                      | obligatorio; 0,5–100 en saltos de 0,5                                               |
| ¿Algo que no le guste?            | texto                                                                                     | 80                                                                                  |
| ¿Qué ha probado antes?            | texto                                                                                     | 80                                                                                  |
| ¿Snacks con pelo?                 | radios Sí / No / Me da igual                                                              | por defecto «Me da igual»                                                           |
| ¿Cómo mastica?                    | casillas Tranquilo / Ansioso / Engulle + «Otro»                                           | «Otro»: 30                                                                          |
| Consentimiento de salud           | casilla                                                                                   | —                                                                                   |
| Alergias o condiciones especiales | texto, siempre visible; apagado (gris, sin poder escribir) hasta marcar el consentimiento | 80; **sin el consentimiento no se guarda**                                          |

Sin JS, con CSS (`:has()`, `.caja-form` en `global.css`): «meses» si es cachorro, «¿Qué animal?» solo con «Otro» y el
campo de salud solo con su casilla. Sin `required` en lo que depende de otro campo: lo valida el servidor y vuelve con
el aviso `#carrito-caja`.

## 3. Qué se ha hecho (CS-1 y CS-2)

**Datos de la línea** (`lib/line-data.ts`, **idéntico** en storefront y backend, test que lo compara):

- `CAJA_META` (claves `caja_*` de `line_item.metadata`), `cajaFromForm` (formulario → metadata; la salud solo con
  `salud_ok`), `lineDataError` (validación: correa o caja según el diseño) y `lineDetails` (textos del carrito, el
  pedido, los emails y el Admin: «Para: Toby (perro, Border collie)», «3 años · 12,5 kg aprox.», «Mastica: engulle»…).
- Lo de la correa (medida exacta, observaciones) se movió aquí: un solo sitio para los datos de las líneas.

**Diseños** (`lib/disenos.ts`): diseño `caja` (`configurable`, `elegir: «Elegir caja»`, sin selector ni guías, no se
hereda, elegible en la hoja y el Admin) y la propiedad nueva **`datos_linea`** (`correa` | `caja` | null): qué datos
admite la línea. `validar-carrito` la lee del producto (antes: «solo variantes con `largo_m`»).

**Backend** (`apps/backend`):

- `catalog:import`: columna **`sin_stock`** (`manage_inventory: false`; sin stock en la hoja, no vale con granel; al
  cambiarla en una variante existente Medusa crea o retira su artículo de inventario: core-flows 2.22.2
  `update-product-variants`). Ejemplo en `catalog/plantilla/caja/productos.csv`.
- Hook `validar-carrito`: `lineDataError(metadata, productDesign(producto).datos_linea, largo)`. Una caja sin datos o
  con datos que no valen → 400 «… caja de snacks.»; datos de caja en otro producto → 400.
- Emails (cliente y tienda): `details` de `lineDetails` (ya se pintaban).
- Widget del Admin `order-cajas.tsx` (zona `order.details.side`): «Caja de snacks» con los datos de cada caja del
  pedido (solo lectura; el Admin no enseña la metadata de las líneas).

**Storefront** (`apps/storefront`):

- `src/disenos/producto/Caja.astro` + `src/components/caja/CajaForm.astro` (registro `DISENOS` de la ficha).
- Action `cart.addCaja` (`accept: "form"`; casillas con el mismo nombre → `z.array`, casilla suelta → booleano, vacíos
  → null: astro-docs, _actions_): comprueba que la variante es del producto, `cajaFromForm`, cantidad 1.
- Aviso `caja` en el carrito; `classifyCartError` reconoce «caja de snacks».
- **Una caja = una línea con cantidad 1**: cada envío lleva un `caja_ref` aleatorio (UUID), porque Medusa junta las
  líneas de la misma variante con la misma metadata (core-flows 2.22.2 `find-matching-line-item`) y dos envíos con
  los mismos datos acabarían en «2 ×». En el carrito, «1 caja» fija y solo «Quitar». El backend lo exige también
  (`validar-carrito`: cantidad ≠ 1 al añadir o actualizar, o repetir un `caja_ref` → 400).
- La correa sí admite cantidad: N correas iguales en una línea; la demanda de material cuenta cantidad × pieza
  (test HTTP en `correas.spec.ts`).
- `/privacidad/`: párrafo «Caja de snacks» (provisional, para la gestoría).
- Fixtures: el producto `caja-snacks` (solo eso; `update-fixtures.mjs` lo incluye).

**Arreglo encontrado de paso**: el build se saltaba fichas. El catálogo se paginaba con `order=title` y, con títulos
repetidos (los mocks), Postgres no da un orden estable entre páginas: se repetían productos y faltaban otros (11 de
1069 en local, entre ellos `mock-clicker-esencial-018`, el de los e2e del carrito). Ahora se pagina por `id` y se
ordena por título en memoria (mismo orden que antes: comprobado contra `order=title` de la API, 1069 iguales). Medusa
2.22 no admite `order=title,id` (400).

**0 KB de JS nuevo**: la ficha carga solo `SiteClient`, `CartClient` y `ScrollDrag` (galería), como cualquier ficha.

## 4. CS-3 — Rellenar la caja en el Admin ✅

### 4.1 Decisiones del usuario

| Tema                 | Decisión                                                                                                                                                                                                |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cuándo se puede      | **Solo con el pago capturado** (spike §4.2). Bizum llega cobrado; tarjeta y PayPal se capturan al empezar la caja.                                                                                      |
| Qué se puede meter   | Solo productos de **`snacks-perro`, `snacks-gato` y sus subcategorías** (ni la caja ni la correa). **Granel sí**, en gramos (múltiplo del paso, hasta 1000 g) y **sin el mínimo por pedido** de la web. |
| Valor                | **Bloquea** si el PVP del contenido es **menor** que lo pagado por la caja.                                                                                                                             |
| Sin stock en la web  | Se permite (reserva en negativo) **solo en la caja**: se prepara mirando el stock físico; un 0 en la web es un desfase.                                                                                 |
| Cambiar el contenido | Todas las veces que haga falta **mientras no se haya propuesto** (CS-4).                                                                                                                                |
| Qué ve el cliente    | Nada del contenido hasta la propuesta: en su pedido, la caja dice **«Preparando tu caja»**.                                                                                                             |
| Envío                | **Bloqueado** mientras haya cajas sin preparar (CS-4: sin aceptar), con un middleware.                                                                                                                  |

### 4.2 Spike (Medusa 2.22.2, core-flows)

- `orderEditAddNewItemWorkflow` respeta `unit_price: 0` (`is_custom_price`) y guarda `metadata` y `allow_backorder`
  por línea. El total del pedido no cambia y no se manda ningún email.
- `confirmOrderEditRequestWorkflow` crea las reservas (`reservation-item.created`) y llama a
  `createOrUpdateOrderPaymentCollectionWorkflow`. **Con el pago solo autorizado, cancela el cobro** (cobro
  `authorized` + importe pendiente = todo el pedido → lo recrea; cancelar = `paymentIntents.cancel` en Stripe). **Con
  el pago capturado** no queda nada pendiente y el cobro sigue `completed`. → Opción 1: solo con el pago capturado.
- Rehacer: otra edición con `orderEditUpdateItemQuantityWorkflow` (cantidad 0 en las líneas viejas) + líneas nuevas;
  las reservas se recalculan. Envío: descuenta el stock (un snack a 0 en la web queda en −1).
- Una sola edición a la vez por pedido: con otra abierta (p. ej. la nativa del Admin), la nuestra fallaría.
- El workflow de envío (`createOrderFulfillmentWorkflow`) solo tiene hook **después** de crearlo
  (`fulfillmentCreated`) → bloqueo con middleware en `POST /admin/orders/:id/fulfillments`.

### 4.3 Qué se ha hecho

- **Módulo `caja`** (`src/modules/caja`, migración `Migration20261103210911`; enlace de solo lectura con el pedido,
  `src/links/caja-order.ts`): una fila por línea de caja (`order_id`, `line_item_id` único, `estado`
  `pendiente | rellena`, `intento`, `rellenada_at`, `metadata.pvp`). La crea el subscriber `caja-order-placed`
  (idempotente).
- **`lib/caja.ts`** (puro): estados, categorías, `checkContent` (snacks publicados con precio, sin repetidos, 1–20
  unidades o, a granel, gramos múltiplos del paso hasta 1000 g sin el mínimo de la web; ≤ 30 productos; PVP ≥
  pagado en céntimos; devuelve las cantidades de Medusa: gramos → pasos) y los mensajes.
- **Granel en la caja**: como en el carrito, la línea va en pasos (precio de un paso; reserva y descuento de
  `paso_g` gramos por paso: inventory kit). En el widget y en la API la cantidad va en **gramos**.
- **`lib/caja-data.ts`**: lecturas (pedido con sus cajas, snacks con PVP de la región del pedido y libre en la web,
  `shipBlockingCajas`).
- **Workflow `fill-caja`** (`src/workflows/caja`): valida → abre la edición → cancela la edición si algo falla después
  (paso con compensación) → contenido anterior de **esa** caja a 0 → líneas nuevas a 0 € con
  `metadata.caja_de = <línea de la caja>` y `allow_backorder` → confirma → caja `rellena` (+1 intento).
- **Rutas del Admin**: `GET /admin/orders/:id/cajas` (cajas, si se puede rellenar ya y los snacks) y
  `POST /admin/orders/:id/cajas/:lineId` (`{ items: [{ variant_id, quantity }] }`, zod en `middlewares.ts`).
- **Bloqueo del envío**: middleware en `POST /admin/orders/:id/fulfillments` (400 «…cajas de snacks sin preparar»).
- **Widget `order-cajas.tsx`**: una tarjeta por caja con sus datos, estado y contenido; «Preparar caja» / «Cambiar
  contenido» con buscador (nombre o SKU; PVP —€/kg en el granel— y libre en la web, «0 en la web (mira el stock
  físico)»), cantidades (gramos en el granel) y
  «PVP del contenido: X de Y pagados» (el botón de guardar se desactiva si no llega). Si el pago no está capturado,
  lo dice y no deja preparar. Tras guardar, recarga la página (el resumen de Medusa enseña las líneas a 0 €).
- **Cliente**: `customerLines` y `orderLineDetails` (`lib/line-data.ts`): sin las líneas del contenido en
  `/pedido/<id>/` y `/cuenta/pedidos/<id>/`; la caja dice «Preparando tu caja». Emails (pedido y envío): sin el
  contenido (`lib/emails.ts`).
- `orders:cancel`: al cancelar, Medusa libera también las reservas del contenido (comprobado en local).

## 5. CS-4 — Proponer, aceptar o rechazar ✅

### 5.1 Decisiones del usuario

| Tema                  | Decisión                                                                                                                 |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Proponer              | **Un email con todas** las cajas preparadas del pedido (botón «Proponer al cliente» del widget).                         |
| Rechazo               | **Solo texto** («¿Qué no le gusta?», obligatorio, ≤ 500): ahí se puede ser descriptivo.                                  |
| Volver a proponer     | **A mano**: se cambia el contenido y se vuelve a pulsar «Proponer» (el segundo email lleva solo las que tocan).          |
| Aceptación automática | A las **24 h** sin respuesta; se avisa **solo a la tienda**.                                                             |
| Aviso interno         | **48 h laborables** sin preparar (desde el pedido o el rechazo): lunes a viernes en Madrid, festivos en `CAJA_FESTIVOS`. |
| Envío                 | Solo con **todas** las cajas aceptadas (o aceptadas a las 24 h).                                                         |

### 5.2 Qué se ha hecho

- **Estados** (`lib/caja.ts`): `pendiente → rellena → propuesta → aceptada | aceptada_auto | rechazada`; una rechazada
  vuelve a ser editable. Modelo `caja` + `token_hash`, `propuesta_at`, `respondida_at`, `motivo_rechazo` y
  `aviso_at` (migración `Migration20261103223940`).
- **Token** (`lib/caja-time.ts`): 32 bytes aleatorios en el enlace; en la base, solo su SHA-256 (comparación en tiempo
  constante). De un solo uso: se borra al responder. Sin el token correcto (o ya respondida), 404.
- **Workflows** (`src/workflows/caja/respuesta.ts`): `propose-cajas`, `answer-caja`, `auto-accept-caja`, con
  compensación y eventos `caja.propuesta` (lleva los tokens para el email; nunca se registran) y `caja.respondida`.
- **Emails** (`packages/emails`): `caja-propuesta` (cliente: una sección por caja con su contenido —granel en gramos—,
  «Ver y responder» y el plazo) y `caja-tienda` (interno: rechazada con el motivo, aceptada, aceptada a las 24 h,
  sin preparar 48 h; «ya se puede enviar» cuando todas están aceptadas). ntfy sin datos personales.
- **Job** `caja-snacks` (`CAJA_JOBS_CRON`, cada 15 min, `lib/caja-jobs.ts`): aceptación automática y aviso de 48 h
  laborables (una vez por caja y suceso).
- **Rutas**: `POST /admin/orders/:id/cajas/proponer`; `GET/POST /store/cajas/:lineId` (ver y responder con el token,
  sin sesión) y `GET /store/cajas?pedido=` (estado de las cajas para la página del pedido, sin datos).
- **Widget**: estados nuevos, plazo («se acepta sola el …»), motivo del rechazo y «Proponer al cliente» (cuando
  todas están preparadas).
- **Storefront**: página `/cuenta/caja/?pedido=&caja=&token=` (on-demand, `noindex`, `Referrer-Policy:
same-origin`, `private, no-store`, **0 KB de JS propio**): contenido, «Me encanta, ¡adelante!» y «No me convence»
  (`<details>` con el textarea). Se responde con un POST (actions `account.cajaAccept` / `account.cajaReject`),
  nunca al abrir el enlace (antivirus y vistas previas). En el pedido (`/pedido/<id>/` y «Mis pedidos»), desde la
  propuesta se ve el contenido («En la caja de snacks») y el estado de la caja; tras un rechazo vuelve a «Preparando
  tu caja». El email de envío lista el contenido.
- **Script** `caja:e2e <order_id>` (solo desarrollo, pedidos `@example.com`): captura, llena y propone por las rutas
  del Admin del backend en marcha. Desde `medusa exec` un evento no llega a los subscribers (event-bus-redis 2.22.2
  solo encola eventos con subscribers en el proceso que emite), por eso va por HTTP con un usuario temporal.
- **Privacidad**: el motivo del rechazo se guarda con la caja.
- **Variables** (backend, `.env.example`, `docker/compose.prod.yml` server y worker, `docker/.env.prod.example`):
  `CAJA_AUTOACCEPT_HOURS=24`, `CAJA_ALERT_WORK_HOURS=48`, `CAJA_FESTIVOS` y `CAJA_JOBS_CRON`.

## 6. Flags de descuentos y puntos, y la caja en pedidos y emails ✅

### 6.1 Decisiones del usuario

| Tema                          | Decisión                                                                                                                         |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Nombres                       | `genera_puntos` (antes `sin_puntos`) y `pago_descuento`, sí / no; vacío = sí (por defecto, Medusa).                              |
| `pago_descuento = no`         | Ni códigos, ni promociones, **ni pago con puntos**: es el `discountable` de Medusa (§6.2).                                       |
| «Sin códigos pero con puntos» | Se aparca (PENDIENTES): sería una fase propia (§6.2).                                                                            |
| Envío gratis por código       | Sigue valiendo con un producto `pago_descuento = no` en el carrito (Medusa solo excluye la línea).                               |
| Marca                         | `*` + nota en carrito, checkout y ficha; **no** en las tarjetas de los listados.                                                 |
| Caja en la web                | `<details>` «Para Toby» con lo que nos contó (carrito, checkout, pedido, «Mis pedidos», Admin) y su contenido dentro de la caja. |
| Caja en los emails            | Una línea resumida («Para Toby (perro, 3 años, 12,5 kg aprox.)»), el resto en pequeño y «En la caja» con el contenido.           |

### 6.2 Por qué `pago_descuento` incluye los puntos (verificado en Medusa 2.22.2)

- El canje de puntos es una **promoción** (`PTS-…`, Fase L). El motor de promociones se salta las líneas con
  `is_discountable = false` para **cualquier** promoción (`@medusajs/promotion` `getValidItemsForPromotion`), y la
  línea lo copia de `product.discountable`. No se pueden separar códigos y puntos con flags.
- Para «sin códigos pero con puntos» haría falta: (a) pasar los puntos a **credit lines** del carrito (existen en
  2.22.2; rehacer canje, tope, devoluciones, totales y emails, y confirmar el IVA con la gestoría), o (b) excluir
  esos productos con reglas en cada promoción (frágil). Se aparca.

### 6.3 Qué se ha hecho

- **Hoja**: `genera_puntos` (`metadata.genera_puntos = false`; «sí» borra la clave) y `pago_descuento`
  (`discountable` del producto). Sin compatibilidad con `sin_puntos` (sin producción; en las BD locales ningún
  producto lo usaba). LEEME de la hoja actualizado.
- **Admin**: widget «Descuentos y puntos» en el producto (`product-flags.tsx`, zona `product.details.side`).
- **Tope de puntos** (`lib/points-room.ts`): solo cuentan las líneas descontables; lo no descontable y el envío
  cubren el mínimo a pagar. Antes ofrecía un máximo que Medusa no podía aplicar (el sobrante quedaba sin efecto y
  sin aviso). El checkout dice «Los productos marcados con * no se pueden pagar con puntos» y el error del tope lo
  explica. `GET /store/carts/:id/points` devuelve `excluded`.
- **`*`** (`lib/product-flags.ts`): «No admite códigos descuento ni pago con puntos» y «No genera puntos», en
  carrito, checkout y ficha (`FichaLayout`, estático). El catálogo pide `discountable`.
- **Caja en la web** (`components/order/LineInfo.astro`): `<details>` «Para Toby» y el contenido dentro de la caja
  («En la caja»: «3 × Orejas», «915 g · Galletas»), sin líneas sueltas a 0 €. `cajaSummary` y `cajaContents` en
  `lib/line-data.ts`.
- **Emails**: `contents`, `summary` y `notes` en `EmailLineItem` (`packages/emails`). El de envío agrupa por
  línea del pedido: Medusa crea una línea del envío **por cada pieza** de inventario (la correa salía 5 veces);
  unidades = piezas / `required_quantity`. Cada caja lleva su contenido.

### 6.4 Ajustes de interfaz (revisión del usuario)

- **«Es un…»**: solo perro o gato; fuera «Otro» y su texto en todas partes (formulario, action, validación del
  backend, textos). Sin compatibilidad: una caja «otro» guardada ya no valida.
- **Alergias**: el campo se ve siempre (sin salto de layout) y está apagado hasta marcar el consentimiento: fondo
  gris, borde discontinuo, sin placeholder y sin poder escribir (`pointer-events: none`). Solo CSS (decisión del
  usuario); con teclado se podría llegar, pero sin la casilla el servidor descarta la salud. La etiqueta mantiene
  su contraste (axe).
- **Pedido** (`/pedido/<id>/` y «Mis pedidos»): borde también entre «Productos» y la primera línea. El **estado de
  la caja** va el primero bajo el nombre, en negrita y con borde de color: espera al cliente → acento (rosa),
  preparando → azul, aceptada → verde (`data-caja-state`; se prueba así).
- **Carrito**: «1 caja» con la altura del botón «Quitar» (misma línea).
- **`*`** (`components/order/LineFlag.astro`): botón tras el nombre en carrito y checkout que abre un cuadro con la
  explicación (popover nativo, solo clic/toque, Esc o tocar fuera lo cierra, 0 JS), anclado al botón con anchor
  positioning (sin soporte, panel fijo abajo). En la ficha sigue el texto bajo la compra.

## 7. Pendiente

- **«Sin códigos pero con puntos»** (§6.2): fase propia, aparcada.
- **Diseño 2**: mascotas de «Mis peques» en una server island. Parado por decisión del usuario.
- **Reembolso** si el cliente rechaza y no hay arreglo: a mano desde el Admin.

## 8. Cómo testear

```bash
pnpm --filter backend exec medusa exec ./src/scripts/import-catalog.ts catalog/plantilla/caja   # la caja (idempotente)
pnpm lint && pnpm format:check && pnpm typecheck && pnpm test && pnpm build
pnpm --filter backend test:integration:http      # caja.spec.ts y caja-relleno.spec.ts (CS-3 y CS-4)
pnpm --filter storefront check:budget
pnpm --filter storefront test:e2e                # caja.spec.ts y checkout (pago, propuesta, rechazo sin JS, aceptar)
pnpm --filter backend caja:e2e <order_id>         # a mano: captura, llena y propone un pedido de prueba
pnpm backend:orders:cancel                       # al terminar
# A mano: /producto/caja-snacks/ → rellenar → carrito → pagar; Admin → el pedido → capturar el pago →
#   «Caja de snacks» → Preparar caja → buscar snacks → Guardar → Proponer al cliente → email en Mailpit (:8025)
#   → «Ver y responder» → «Me encanta» o «No me convence» → aviso a SHOP_NOTIFY_EMAIL.
```

Resultados (3-nov-2026): backend unit 149, HTTP 79; storefront unit 351; `check:budget` OK (1276 páginas); e2e
**289 pasan, 0 fallan, 17 se saltan** (pagos y ratón solo en escritorio). Antes de la batería, el clicker de los e2e
(`mock-clicker-esencial-018`) tenía 420 de stock tras una reposición anterior y el test «error de stock» (pide 99)
fallaba: se dejó en 50 libres.

## 9. Criterio de salida

- [x] La caja se carga desde la hoja (sin stock, IVA reducido, `diseno = caja`) y la 2.ª carga no cambia nada.
- [x] Ficha estática con el formulario; funciona sin JS y con JS (0 KB propios).
- [x] La salud solo se guarda con el consentimiento; cachorro en meses; peso en saltos de 0,5.
- [x] Varias cajas = varias líneas; los datos se ven en carrito, checkout, pedido, emails y Admin.
- [x] El backend rechaza datos que no valen o en otros productos.
- [x] CS-3: rellenar desde el Admin con el pago capturado, solo snacks, PVP ≥ pagado, rehacer mientras no se
      proponga; reservas correctas (también sin stock en la web); el total y el cobro no cambian.
- [x] CS-3: el cliente no ve el contenido hasta la propuesta.
- [x] Flags `genera_puntos` y `pago_descuento` (hoja y Admin); tope de puntos real con aviso; `*` en carrito,
      checkout y ficha. La caja con `<details>` y su contenido dentro, en la web y en los emails; el email de envío,
      una línea por producto.
- [x] CS-4: un email con todas; enlace de un solo uso (también invitados), aceptar o rechazar con motivo sin JS;
      rehacer y volver a proponer; aceptación automática a las 24 h y aviso de 48 h laborables (fines de semana y
      festivos fuera), solo a la tienda; el envío espera a todas aceptadas.
- [x] lint, format, typecheck, test, HTTP, build, `check:budget` y e2e en verde.
