# Fase PG — Pagos: PayPal, Bizum y transferencia

> **Estado:** ✅ completada (26-oct-2026)
> **Rama/PR:** `feat/pagos` · PR #…
> **Anterior:** [Fase M — mascotas y aviso de pedidos](./faseM-mascotas.md) · **Siguiente:** más peticiones de frontend y backend

## 1. Objetivos

- [x] **PayPal y Bizum** además de la tarjeta (con Apple Pay y Google Pay), todo por **Stripe**: mismo proveedor (`pp_stripe_stripe`) y mismo webhook.
- [x] **Captura por método**: tarjeta y PayPal se **autorizan** y se capturan desde el Admin al preparar el envío (como en la fase 5); **Bizum se cobra al momento** (no admite «solo autorizar»).
- [x] Métodos fijados en el **servidor** (no los decide el navegador ni lo que se active en el panel de Stripe).
- [x] **Transferencia bancaria** solo para **clientes con cuenta**: 3 días para pagar, recordatorio el último día y cancelación automática al día siguiente. Capturar en el Admin = marcar como pagado.
- [x] Forma de pago visible en los emails, en el push y en el Admin.
- [x] Sin recargo por método de pago (prohibido en España).

## 2. Qué se ha hecho

### 2.0 PG-0: prueba en el sandbox de Stripe (antes de escribir código)

- Cuenta de pruebas `acct_1FoEZ4Hs0MuuhiGX` (test, ES, EUR); configuración de métodos `pmc_1M3Q7AHs0MuuhiGX353u5f0y` con tarjeta, Apple/Google Pay, PayPal y Bizum.
- Con `capture_method=manual` (lo de antes) Stripe solo ofrece **tarjeta y PayPal**: Bizum no aparece.
- Con captura **mixta** (`capture_method=automatic` + `payment_method_options[card|paypal|link][capture_method]=manual`) aparece Bizum. Fuente: docs.stripe.com/payments/place-a-hold-on-a-payment-method («capture after per payment method»).
- Bizum: `requires_action` (`await_authorization`, sin redirección) y a los ~5 s `succeeded`. PayPal: `requires_action` con `redirect_to_url` y vuelta a `return_url`.
- Medusa 2.21.2 (`@medusajs/payment`, `authorizePaymentSession_`): un PaymentIntent `succeeded` se registra como **autorizado y capturado** a la vez, sin volver a llamar a Stripe.
- La Store API (`POST /store/payment-collections/:id/payment-sessions`) acepta `data` y el proveedor de Stripe lo pasa a Stripe (`normalizePaymentIntentParameters`). Las sesiones solo se crean en esa ruta (`refreshPaymentCollectionForCartWorkflow` solo las borra).

### 2.1 PG-1: backend con Stripe (`apps/backend`)

- **`src/lib/stripe-session.ts`** + middleware en `src/api/middlewares.ts`: para `pp_stripe_stripe` se **sustituye** el `data` del navegador por `payment_method_types: [card, paypal, bizum]`, `capture_method: automatic` y `manual` en tarjeta y PayPal. **Sin Link** (decisión del usuario: con Link el formulario de tarjeta añadía el alta en Link con email, móvil y nombre; al pedir `payment_method_types`, Stripe no mira el panel).
- `medusa-config.ts`: `automaticPaymentMethods: false`. Stripe no admite `automatic_payment_methods` y `payment_method_types` a la vez; con `true` la sesión falla («unknown_error»).
- **`src/lib/payment-method.ts`**: método legible a partir del pago («Tarjeta», «Apple Pay», «Google Pay», «Link», «PayPal», «Bizum», «Transferencia») y estado («· cobrado», «· pendiente de capturar», «· pendiente de recibir»). Nunca datos de la tarjeta.
- **Avisos**: «Forma de pago» en el email del pedido; método y estado en el email a la tienda y en el push de ntfy.
- **Widget del Admin** `src/admin/widgets/order-payment.tsx` (`order.details.side.before`): «Forma de pago: …» y qué hacer (cobrado / capturar al preparar el envío / esperar la transferencia).

### 2.2 PG-2: storefront con Stripe (`apps/storefront`)

- `StripePayment.astro`: aviso «Procesando el pago… Si pagas con Bizum, apruébalo en la app de tu banco» mientras dura `confirmPayment`; Bizum rechazado (`requires_payment_method`) → aviso y reintento.
- `classifyCompleteError`: «More information is required for payment» (Bizum sin aprobar, 3DS a medias) → «El pago aún no está confirmado».
- Textos: checkout («Con tarjeta o PayPal, el cargo se hace cuando preparamos el envío; con Bizum, al momento»), confirmación («Pago recibido.» si ya está cobrado) y pie («Tarjeta, PayPal y Bizum, procesados por Stripe»).
- **CSP**: sin cambios. Stripe.js usa `js.stripe.com`, `api.stripe.com` y `hooks.stripe.com` (ya permitidos); la redirección a PayPal es de página completa.

### 2.3 PG-3: transferencia

- **Proveedor**: el pago manual de Medusa (`pp_system_default`): autoriza sin cobrar; **capturar en el Admin = pagado**.
- **`src/lib/transfer.ts`** (puro): configuración (`TRANSFER_IBAN`, `TRANSFER_HOLDER`, `TRANSFER_DAYS`), plazos en **hora de España** (último día = día del pedido + `TRANSFER_DAYS`) y textos.
- **Barreras** (solo con `STRIPE_API_KEY`; sin Stripe, CI y desarrollo, el pago manual es el de pruebas):
  1. middleware de la ruta de sesiones: sin sesión de cliente o sin IBAN → 400;
  2. hook `validate` de `completeCartWorkflow` (`validar-carrito.ts`): un carrito con pago manual solo se completa si el cliente tiene cuenta.
- **Rutas** (solo con sesión, Medusa la exige en `/store/customers/me*`):
  - `GET /store/customers/me/transfer` → `{ enabled, holder, days }` (el checkout decide si la ofrece);
  - `GET /store/customers/me/orders/:id/transfer` → IBAN, titular, concepto («Pedido N»), importe y último día; otro pedido → 404.
- **Región**: `stripe:region` (y `seed.ts`) ponen `pp_stripe_stripe` + `pp_system_default` si hay transferencia configurada; si no, solo Stripe (como en la fase 5).
- **Job `transfer-orders`** (`TRANSFER_CANCEL_CRON`, por defecto a diario a las 9:00; `src/lib/transfer-orders.ts`): pedidos `pending` de los últimos 30 días con pago manual sin capturar:
  - el último día → email de recordatorio con los datos;
  - después → `cancelOrderWorkflow` (libera stock; los subscribers de `order.canceled` devuelven puntos y códigos) y email de cancelación.
    Los emails llevan `idempotency_key` por pedido y etapa.
- **Emails** (`packages/emails`): recuadro `TransferBox` en el email del pedido («Lo prepararemos en cuanto recibamos la transferencia») y plantilla nueva `transfer-reminder` (recordatorio / cancelado).
- **Storefront** (sin JS):
  - checkout: bloque «O paga por transferencia» solo con sesión, con el botón «Realizar pedido y pagar por transferencia» (action `checkout.transfer` → `/checkout/completar/`);
  - `/pedido/<id>/` y `/cuenta/pedidos/<id>/`: recuadro con importe, IBAN, titular y concepto (seleccionables) mientras está pendiente.

### 2.4 Ajustes tras probarlo en el móvil (26-oct-2026)

- **Carga visible**: esqueleto de la lista de métodos (3 filas grises animadas, solo CSS con `<html data-js>`) y «Cargando el pago seguro de Stripe…» encima del hueco reservado (`min-h-72`, sin CLS); a los 8 s, «Está tardando más de lo normal…»; `loaderror` → error. Antes era un texto gris pequeño y el hueco parecía vacío.
- **Descarga anticipada** (`StripePreload.astro`, `slot="head"`, solo con el paso de pago listo): `<script async src="https://js.stripe.com/dahlia/stripe.js">` (la misma URL que usa `@stripe/stripe-js` 9.17.0, que lo reutiliza) y `preconnect` a `api.stripe.com`.
- **Acordeón con radios** en vez de pestañas (`layout: { type: "accordion", radios: "always", spacedAccordionItems: true }`): todos los métodos a la vista. Con pestañas, en el móvil Google Pay quedaba detrás de «más».
- **Transferencia**: con cuenta, el pago tiene dos opciones de primer nivel con `<details name="pago-metodo">` exclusivos (HTML nativo, sin JS): «Tarjeta, Bizum o PayPal» (abierta) y «Transferencia bancaria». Antes era un bloque debajo del botón de pagar y no se veía.
- `.env`: `TRANSFER_IBAN` y `TRANSFER_HOLDER` **entre comillas** (llevan espacios; con `set -a && . .env`, como en el arranque de `medusa start`, sin comillas no se cargaban y la transferencia no salía).

Medidas del formulario (Playwright contra el backend real; desde que se llega a `#pago`):

| Navegador                          | Listo     | 1.er cambio a Bizum | Cambios siguientes |
| ---------------------------------- | --------- | ------------------- | ------------------ |
| Chromium escritorio                | 0,4–0,6 s | ~1 s                | 0,15–0,4 s         |
| Firefox 157 escritorio             | 0,8–1 s   | ~1,6 s              | 0,3–0,6 s          |
| Chromium móvil, CPU 4–6× más lenta | ~0,6 s    | 2–3 s               | 0,4–0,6 s          |

«Continuar al pago» → `#pago` tarda ~2–3 s en el servidor (Medusa recalcula y crea el PaymentIntent). Ninguna petición a Stripe falla ni da 429; hCaptcha responde `pass: true`.

**Google Pay**: Stripe lo ofrece (`ordered_payment_method_types_and_wallets` incluye `google_pay`), pero Google Pay y Apple Pay **solo funcionan en HTTPS** (aviso de Stripe.js). Por la IP de la red local (`http://`) no salen; en el VPS (https) sí. Apple Pay además necesita el dominio registrado en Stripe.

## 3. Decisiones tomadas

| Decisión                                                              | Motivo                                                                                                                                                                          | Fuente consultada                                                                     |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| PayPal **por Stripe** y no directo                                    | Sencillez (un proveedor, un webhook) y pocos pagos con PayPal previstos. Directo (o TPV Sabadell) más adelante si las cifras lo justifican                                      | Tarifas de Stripe ES y de PayPal (análisis previo)                                    |
| Captura **mixta** por método                                          | Bizum no admite captura manual; el resto sigue «autorizar y capturar al enviar» (fase 5)                                                                                        | docs.stripe.com/payments/bizum (Manual capture: No), place-a-hold-on-a-payment-method |
| Métodos **fijos en el servidor** (opción a)                           | La tienda ofrece exactamente esto aunque se active otro en el panel; el navegador no puede cambiar ni métodos ni captura. El usuario deja además en el panel solo lo que quiere | PG-0 (Bancontact, EPS, giropay e iDEAL aparecían en modo mixto)                       |
| Middleware que **sustituye** `data` (no un proveedor propio)          | El proveedor oficial ya pasa `data` a Stripe; menos código y mismo webhook                                                                                                      | Código de `@medusajs/payment-stripe` 2.21.2 (`normalizePaymentIntentParameters`)      |
| `automaticPaymentMethods: false`                                      | Incompatible con `payment_method_types`                                                                                                                                         | Error de Stripe en PG-0 («You may only specify one of these parameters»)              |
| Transferencia con el **pago manual** de Medusa                        | Ya existe; capturar = pagado                                                                                                                                                    | `@medusajs/payment` 2.21.2 (`providers/system.js`)                                    |
| Transferencia **solo con cuenta**, 3 días, recordatorio el último día | Decisión del usuario                                                                                                                                                            | —                                                                                     |
| Plazo en **días naturales**, hora de España                           | Más sencillo de explicar («antes del 28 de octubre, incluido»)                                                                                                                  | —                                                                                     |
| Barreras solo con Stripe configurado                                  | En CI y en desarrollo sin claves el pago manual es el pago de pruebas de siempre (tests de las fases 5–M)                                                                       | —                                                                                     |
| IBAN fuera de `GET /store/customers/me/transfer`                      | Solo se da a quien tiene un pedido por transferencia (email y ficha del pedido)                                                                                                 | —                                                                                     |

## 4. Cómo usarlo

```bash
# Variables (apps/backend/.env; en producción, .env.prod: van en el bloque común de server y worker)
TRANSFER_IBAN=ES.. ....        # sin IBAN o titular no se ofrece la transferencia
TRANSFER_HOLDER=Nombre del titular
TRANSFER_DAYS=3                # 1–14
TRANSFER_CANCEL_CRON="0 9 * * *"

# Región: añade (o quita) el pago manual según haya transferencia configurada. Idempotente.
pnpm --filter backend stripe:region
# Producción:
./dc exec -T backend-server ./node_modules/.bin/medusa exec ./src/scripts/stripe-region.js
```

- **Panel de Stripe**: dejar activos solo tarjeta (Apple Pay / Google Pay), PayPal y Bizum. El servidor ya limita a esos, pero así no salen otros en el Dashboard.
- **Admin**, en la ficha del pedido (widget «Forma de pago»):
  - **Bizum**: ya cobrado; no hay que capturar.
  - **Tarjeta / PayPal**: capturar al preparar el envío. La autorización de tarjeta dura 7 días; la de PayPal, 10 días ampliables a 20 por Stripe.
  - **Transferencia**: cuando llegue el dinero, **capturar** el pago (= pagado). Si no llega, el job cancela el pedido al día siguiente del plazo. Para darle más tiempo a un cliente, capturar el pago en cuanto avise o cancelar a mano.

## 5. Cómo testear esta fase

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
pnpm --filter storefront check:budget          # StripePayment 2269 B gzip (límite 30 KB)

# Tests HTTP (6): parámetros de Stripe impuestos, invitados sin transferencia, transferencia con
# cuenta (datos, 404 a otro cliente, recordatorio, cancelación) y transferencia pagada no cancelada.
pnpm --filter backend test:integration:http -- pagos

# e2e local (backend con Stripe de test + `pnpm infra:stripe` + EMAIL_TRANSPORT=smtp + transferencia
# configurada y `stripe:region`; storefront construido en :4398):
E2E_BASE_URL=http://localhost:4398 pnpm --filter storefront exec playwright test \
  e2e/checkout.spec.ts e2e/transferencia.spec.ts --project=escritorio --workers=1
```

Resultado (26-oct-2026):

- Unitarios: backend 124, storefront 275, emails 24.
- HTTP: `pagos.spec.ts` 6/6, `aviso-pedido.spec.ts` y `invitados.spec.ts` en verde.
- e2e: métodos (pestañas Tarjeta, Bizum, PayPal), Bizum aprobado («Pago recibido.»), Bizum rechazado (`+34600000002`: aviso y reintento), PayPal (página de pruebas de Stripe → vuelta → autorizado) y transferencia sin JS (invitado sin la opción; con cuenta: pedido con IBAN y concepto en la confirmación, en la cuenta y en el email). Resto de la suite: 227 en verde.
- **Link quitado** (26-oct-2026): con Link, el formulario de tarjeta añadía el alta en Link (email, móvil, nombre) aunque estuviera desactivado en el panel (al pedir `payment_method_types`, Stripe no mira el panel). Sin Link, los e2e de tarjeta dejaron de quedarse colgados en tanda: **24 pagos seguidos** (Bizum, PayPal, 4242, rechazada, 3DS, granel × 3) en verde, y la suite de pagos (checkout + invitados + transferencia) 15/16; el que falla es la correa de 7 m, agotada en la BD local por pedidos de e2e anteriores (PENDIENTES §4), sin relación con el pago.
- En el e2e de Bizum se sale del campo del teléfono (`Tab`) antes de pulsar «Pagar»: con el clic inmediato, Stripe a veces no llegaba a confirmar.
- Los e2e usan `mock-clicker-esencial-018`: tras muchos pedidos se agota y `stock:mock` no lo repone (solo mira los 100 primeros productos, `query.graph` sin paginación; PENDIENTES §4).
- Pedidos de prueba en la BD local: Bizum `captured`, PayPal y tarjeta `authorized` (`payment.data->'payment_method'->>'type'`).

## 6. Criterio de salida

- [x] Tarjeta, PayPal y Bizum en el checkout, con la captura de cada método.
- [x] El navegador no puede cambiar los métodos ni el modo de captura (test HTTP).
- [x] Transferencia solo con cuenta (doble barrera), con datos para pagar, recordatorio y cancelación (tests HTTP + e2e sin JS).
- [x] Forma de pago en los emails, el push y el Admin.
- [x] Presupuesto de JS: sin bundles nuevos; `StripePayment` 2269 B gzip (con el esqueleto y el acordeón).

## 7. Pendientes / riesgos

- **Producción**:
  - poner `TRANSFER_IBAN` y `TRANSFER_HOLDER` reales en `.env.prod` y ejecutar `stripe-region.js` tras desplegar;
  - activar Bizum y PayPal en la cuenta **live** de Stripe (Bizum pide requisitos propios);
  - registrar el dominio en _Payment method domains_ (Apple/Google Pay).
- **Condiciones de compra** (`/condiciones/`): el texto de los métodos de pago es provisional (revisión de la gestoría).
- Si los e2e de pago vuelven a quedarse en `/checkout/#pago`, mirar los registros de Stripe (Dashboard → Desarrolladores → Registros) del PaymentIntent que no confirma.
- Datos locales de e2e: al reponer stock, hacerlo siempre por el Inventory Module (`updateInventoryLevels`), nunca por SQL: Medusa lee `raw_stocked_quantity` y un `UPDATE` de `stocked_quantity` deja el producto agotado.
- **Google Pay en local**: no sale por `http://` (solo HTTPS). Para probarlo en el móvil, el VPS o un túnel con https.
- `stock:mock` solo repone los 100 primeros productos mock (falta paginar).
- Activar Bizum y PayPal en el panel (Stripe avisa: «not activated… hidden in live mode»).
- **Transferencia**: no se concilia con el banco (se marca pagada a mano capturando en el Admin). Sin descuento por transferencia por ahora.
- **PayPal directo / TPV Sabadell** (0,40 % + 0,06 €): posible fase futura si el volumen lo justifica (pendiente de la documentación del banco).
- La transferencia la ve el cliente en «Mis pedidos» como «Pendiente», sin un estado propio «esperando transferencia» (posible mejora).
