# Fase 5 — Checkout + Stripe

> **Estado:** ⏳ plan aprobado (04-oct-2026). No hay código escrito.
> **Rama/PR:** `feat/fase5-checkout` (se crea desde `main` cuando se apruebe el plan) · PR pendiente
> **Anterior:** [Fase 4](./fase4.md) · **Siguiente:** Fase 7 (búsqueda)

## 1. Objetivos

- [ ] Stripe como proveedor de pago en Medusa (`@medusajs/medusa/payment-stripe`, incluido en `@medusajs/medusa` 2.21.2, **sin dependencia nueva en el backend**).
- [ ] Checkout on-demand (`/checkout/`): email, dirección de envío y facturación, método de envío y pago. Los pasos de datos y de envío funcionan **sin JS**.
- [ ] Pago con **Payment Element** de Stripe (requiere JS: sin JS se avisa con `<noscript>`).
- [ ] Creación del pedido (`cart.complete`) y página de confirmación.
- [ ] Webhooks de Stripe verificados con firma y **sin pedidos duplicados** al reenviarlos.
- [ ] Criterio de salida (README §13): pago de prueba de extremo a extremo y reenvío de webhook sin duplicados.

## 2. Plan aprobado (decisiones del usuario en §2.9)

### 2.1 Backend

- `medusa-config.ts`: módulo `@medusajs/medusa/payment` con el proveedor `@medusajs/medusa/payment-stripe` (`id: "stripe"`, provider id `pp_stripe_stripe`), **solo si existe `STRIPE_API_KEY`**. Así el CI y `medusa build` siguen funcionando sin claves (mismo patrón que `file-s3`).
  - Opciones (verificadas en `@medusajs/payment-stripe@2.21.2/dist/types`): `apiKey`, `webhookSecret` (obligatorio en producción con `required()`), `capture: false` (P1: solo autorizar; captura desde el Admin) y `automaticPaymentMethods: true` (los métodos se eligen en el Dashboard de Stripe).
- Región España: añadir `pp_stripe_stripe` a `payment_providers` (§2.9 P5).
  - `seed.ts` para BD nuevas, y un script idempotente `pnpm --filter backend stripe:region` para la BD actual (usa `updateRegionsWorkflow`).
- Webhook: ruta incluida en Medusa `/hooks/payment/stripe_stripe`. El subscriber `payment-webhook-handler` ejecuta `processPaymentWorkflow`, que captura o autoriza y, si el navegador se cerró antes de completar, **crea el pedido** (`completeCartAfterPaymentStep`).
  - Idempotencia (código de `@medusajs/core-flows` 2.21.2): `completeCartWorkflow` toma un lock por `cart_id` y, si ya existe `order_cart`, devuelve el pedido existente. `processPaymentWorkflow` comprueba si ya hay `payment` antes de autorizar. Si el pedido falla después de cobrar (p. ej. sin stock), `compensatePaymentIfNeededStep` **reembolsa**.
  - Eventos que hay que escuchar (doc de Medusa, proveedor Stripe): `payment_intent.amount_capturable_updated`, `payment_intent.succeeded`, `payment_intent.payment_failed` y `payment_intent.partially_funded`.
- `docker/compose.dev.yml` (`stripe-cli`): añadir `--events <los 4 de arriba>` al `listen`. El secreto `whsec_…` se obtiene con `stripe listen --print-secret` (es estable por cuenta).
- Variables nuevas: `STRIPE_API_KEY` y `STRIPE_WEBHOOK_SECRET` en `apps/backend/.env.example` (ya están en README §14).
- **Importes**: Medusa v2 trabaja en unidad principal (4.95). El proveedor convierte a céntimos (`getSmallestUnit`). No convertimos nada a mano.

### 2.2 Storefront: rutas

| Ruta                    | Render                                                                | JS                                                 |
| ----------------------- | --------------------------------------------------------------------- | -------------------------------------------------- |
| `/checkout/`            | on-demand, `private, no-store`, `noindex`                             | 0 JS en los pasos de datos y envío; script de pago |
| `/checkout/completar/`  | on-demand (endpoint `GET`/`POST`): `cart.complete` → 303 a `/pedido/` | 0                                                  |
| `/pedido/<id>/`         | on-demand, `private, no-store`, `noindex`                             | 0                                                  |
| `/carrito/` (existente) | "Ir a pagar" pasa a ser un enlace a `/checkout/`                      | 0                                                  |

- **Una sola página con secciones** (§2.9 P3): 1) Contacto y envío · 2) Método de envío · 3) Pago. Los pasos completados se muestran como un resumen con un enlace "Cambiar". Cada paso es un `<form>` que hace POST a `/checkout/?_action=checkout.<x>` y responde con un 303 a `/checkout/#paso-n` (el mismo patrón PRG que el carrito; el middleware se amplía a `checkout.*`).
- Sin carrito o con el carrito vacío → 303 a `/carrito/`.

### 2.3 Storefront: pasos y actions (`src/actions/checkout.ts`, zod)

1. **`checkout.address`**: email, nombre, apellidos, dirección, dirección 2 (opcional), CP (`^\d{5}$`; §2.9 P2), ciudad, provincia, teléfono (§2.9 P6) y "facturación = envío" (checkbox).
   - `sdk.store.cart.update(id, { email, shipping_address, billing_address })` con `country_code: "es"`.
   - La facturación distinta se muestra **sin JS** con CSS `:has(#misma-direccion:not(:checked))`.
   - `autocomplete` correcto en cada campo (`email`, `given-name`, `address-line1`, `postal-code`, `tel`…), `<label>`, errores por campo (lo que devuelve la action con el 303 se pinta en el servidor; ver §2.7).
2. **`checkout.shipping`**: radios con `sdk.store.fulfillment.listCartOptions({ cart_id })` (Estándar 4,95 € / Exprés 9,95 €) → `addShippingMethod`.
3. **`checkout.payment`** ("Continuar al pago"): `sdk.store.payment.initiatePaymentSession(cart, { provider_id: "pp_stripe_stripe" })`.
   - Se ejecuta en una **action** y no en el GET, para no crear un PaymentIntent cada vez que se recarga la página.
   - En el GET se reutiliza la sesión `pending` que ya existe. Si Medusa la borró porque cambió el total (`refreshPaymentCollectionForCartWorkflow`), se vuelve a mostrar el botón "Continuar al pago".
4. **Pago** (JS): el `client_secret` de la sesión va en un `data-` del contenedor (es un dato pensado para el cliente según Stripe). El script:
   - carga Stripe.js con `loadStripe` (`@stripe/stripe-js/pure`, que **solo** se descarga en este paso, §2.9 P4) y monta el Payment Element (`locale: "es"`, `appearance` con nuestros tokens);
   - al enviar: `elements.submit()` → `stripe.confirmPayment({ elements, clientSecret, confirmParams: { return_url: <origin>/checkout/completar/ }, redirect: "if_required" })`;
   - si queda en `requires_capture` o `succeeded`: POST a `/checkout/completar/`. Si hay error: mensaje en `role="alert"` y se reactiva el botón (se desactiva al primer clic contra el doble envío).
   - Texto del botón: **"Pagar y realizar pedido"**. La ley exige que el botón indique que el pedido implica pagar (art. 98.2 TRLGDCU; §2.9 P8).
5. **`/checkout/completar/`**: `sdk.store.cart.complete(id)`.
   - Si es `order`: el pago queda **autorizado** (P1). Borra la cookie `cart_id`, crea la cookie `last_order` (httpOnly, 1 h, §2.9 P7) y responde con un 303 a `/pedido/<id>/`.
   - Si es `cart` con error: 303 a `/checkout/#pago` con aviso.
   - Atiende también el `return_url` de Stripe (GET con `payment_intent` y `redirect_status`) en los métodos con redirección y 3DS. Como `complete` es idempotente, no importa si el webhook llegó antes.
6. **`/pedido/<id>/`**: muestra el número de pedido, las líneas, el envío y el total **solo si** `last_order` coincide con el id. Si no, muestra "Pedido recibido" sin datos personales. La Store API devuelve pedidos por id sin autenticar (`store/orders/[id]/route.js`); la cookie evita que una URL compartida exponga la dirección.

### 2.4 Stripe en el cliente

- `@stripe/stripe-js@9.17.0` (ya está en README §4 como previsto para el storefront, **pero no está instalado**). Fija el release train de Stripe.js `dahlia` y siempre carga `https://js.stripe.com/dahlia/stripe.js` (requisito PCI de Stripe: no se autoaloja). `pure.mjs` pesa 2,4 KB gzip.
- **Alternativa sin dependencia**: `<script src="https://js.stripe.com/dahlia/stripe.js">` directo en el paso de pago, sin tipos y con la versión a mano.
- Script de Astro (`<script>`) y **no** isla Svelte. AGENTS §3.1 pide probar antes un `<script>` de Astro: el Payment Element es un iframe de Stripe, y no hace falta el runtime de Svelte. Se pasará por el autofixer de Svelte solo si al final hiciera falta una isla.
- La clave publicable `PUBLIC_STRIPE_PUBLISHABLE_KEY` (`pk_test_…`) entra por `astro:env` (server/public) y va en un `data-` del HTML. Sin variable (CI con fixtures), el paso de pago muestra "Pago no disponible" y el build no falla.
- ⚠️ A verificar al implementar: Medusa crea los PaymentIntents con `stripe` (Node) **15.12.0**, API `2024-04-10`, y el cliente usa Stripe.js `dahlia`. Según la doc de Stripe, el versionado de Stripe.js es independiente de la API del servidor. Se comprobará con un pago real de prueba.

### 2.5 Presupuesto de JS y rendimiento

- `/checkout/` ≤ 30 KB gzip propios + Stripe.js (AGENTS §3.4). Previsto: script de pago ~2–3 KB + `pure.mjs` 2,4 KB.
- `check:budget`: nueva regla. Las páginas `checkout/*` pueden cargar **un** bundle de pago. El resto de páginas sigue igual (solo `CartClient`). `/pedido/` y `/carrito/`: 0 JS.
- El `CartClient` (toasts y flyout) **no** se carga en el checkout (`cartClient={false}`, como en `/carrito/`).
- Lighthouse móvil ≥ 95 en `/checkout/` (paso de datos). LCP < 2,5 s y CLS < 0,1 con el Payment Element: se reserva altura para el iframe.

### 2.6 CSP y seguridad

- Directivas de Stripe.js (guía de seguridad de Stripe) para la fase 11 (Caddy y `security.csp`): `script-src https://js.stripe.com https://*.js.stripe.com`, `frame-src https://js.stripe.com https://*.js.stripe.com https://hooks.stripe.com`, `connect-src https://api.stripe.com`. Se anotan en §8 para la fase 11.
- `checkOrigin` de Astro protege las actions (CSRF). Webhooks solo con firma (`webhookSecret`).
- Ningún secreto (`sk_`, `whsec_`) llega al storefront.

### 2.7 Errores y avisos (sin JS)

- Mismo patrón que la fase 4 (fragmento + `:target`) para los avisos generales: `#checkout-error`, `#checkout-expired`, `#pago-error`.
- **Errores por campo** del formulario de dirección: un fragmento no basta. Propuesta: la action guarda los errores y los valores en una cookie flash httpOnly de corta duración (`checkout_flash`, 1 min, solo `path=/checkout/`), y el GET la lee, la pinta y la borra. **Sin `session`** de Astro (`session: false` desde la fase 4). Además, la validación HTML (`required`, `pattern`, `type=email`) evita la mayoría de los viajes al servidor.

### 2.8 Tests

- **Vitest**: validación de direcciones y CP, mapeo de errores de Medusa y Stripe, decisión de `/pedido/` (cookie ↔ id), helpers puros de `src/lib/checkout.ts`.
- **Playwright** (local, como en la fase 4; necesita las claves de test en `.env`):
  - Sin JS: datos → envío → el paso de pago muestra el aviso `<noscript>`. Errores de validación por campo.
  - Con JS: pago con `4242 4242 4242 4242` → `/pedido/<id>/`. Pago con 3DS (`4000 0000 0000 3220`, autenticación de prueba). Tarjeta rechazada (`4000 0000 0000 0002`) → aviso y se puede reintentar.
- **Webhooks**, script/documentación de prueba manual:
  1. Pago completo → 1 pedido.
  2. `stripe events resend <evt_id>` (con el CLI en Docker) del `payment_intent.succeeded` o del `amount_capturable_updated` → **sigue habiendo 1 pedido** (consulta `order_cart` por `cart_id`).
  3. Cerrar el navegador tras confirmar (sin llamar a `/checkout/completar/`) → el webhook crea el pedido.
- Backend: test de integración (`medusa-test-utils`) de la configuración del proveedor si aporta. Las rutas propias son pocas (solo el script de la región).

### 2.9 Decisiones del usuario (04-oct-2026)

| #   | Decisión                                                                                                                                                                                                                       |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| P1  | **Solo autorizar** (`capture: false`, el valor por defecto del proveedor) y **capturar desde el Admin** al preparar el envío. La autorización de tarjeta caduca a los ~7 días. Se puede cambiar más adelante a `capture: true` |
| P2  | **Solo Península + Baleares**: se rechazan los CP `35`, `38` (Canarias), `51` (Ceuta) y `52` (Melilla) con un mensaje claro (validación en la action, más `pattern` en el HTML)                                                |
| P3  | **Una página** (`/checkout/` + fragmentos `#paso-n`)                                                                                                                                                                           |
| P4  | **Instalar** `@stripe/stripe-js@9.17.0` en el storefront y documentarlo en README §4 (pasa de "previsto" a instalado)                                                                                                          |
| P5  | **Quitar** `pp_system_default` de la región España (solo Stripe)                                                                                                                                                               |
| P6  | **Teléfono obligatorio**                                                                                                                                                                                                       |
| P7  | **Cookie `last_order`** (httpOnly, 1 h) para ver los datos de `/pedido/<id>/`                                                                                                                                                  |
| P8  | Botón **"Pagar y realizar pedido"** + páginas legales **provisionales** con lorem ipsum (`noindex`): `/condiciones/`, `/privacidad/`, `/cookies/` y `/aviso-legal/`. Se rellenarán con una plantilla o el texto de la gestoría |
| P9  | El usuario pone las claves de test en los `.env` cuando exista la rama `feat/fase5-checkout`. El agente no las pide ni las lee; solo comprueba que existen (§2.11)                                                             |
| P10 | **Sin códigos de descuento** en esta fase                                                                                                                                                                                      |

**Envíos**: se usan las opciones que ya existen en Medusa (Estándar 4,95 €, Exprés 9,95 €; seed de la fase 2). El storefront las lee con `listCartOptions` y no fija precios.

**Cookies y RGPD** (pregunta del usuario en P8; pendiente de confirmar con la gestoría):

- Las cookies propias (`cart_id`, `last_order`, `checkout_flash`) son **técnicas y necesarias** para el servicio que pide el usuario. Están exentas de consentimiento (art. 22.2 LSSI; Guía de cookies de la AEPD). Las cookies de Stripe en su iframe sirven para prevenir el fraude en el pago, también ligadas al servicio pedido.
- Con solo esas cookies **no hace falta banner de consentimiento**, pero sí **informar** de ellas: la página `/cookies/` (provisional en esta fase) y un enlace en el pie.
- El **banner pasa a ser obligatorio** en cuanto haya analítica, píxeles o cualquier cookie no necesaria (fase 13, Partytown). Queda anotado en §8 como funcionalidad futura.

### 2.10 Orden de trabajo (commits pequeños en `feat/fase5-checkout`)

0. El usuario pone las claves de test (§2.11). El agente comprueba que existen sin mostrar su valor.
1. Backend: proveedor Stripe en `medusa-config.ts`, `.env.example`, script de la región + seed, `--events` en el compose. Verificar `GET /store/payment-providers?region_id=…` → `pp_stripe_stripe`.
2. Storefront: `src/lib/checkout.ts` (puro) + tests, funciones de checkout en `medusa.ts`, actions `checkout.*`, middleware ampliado.
3. `/checkout/` pasos 1 y 2 sin JS (+ flash de errores), "Ir a pagar" en `CartView`, páginas legales provisionales y enlaces en el pie.
4. Paso 3: `@stripe/stripe-js`, script de pago, `/checkout/completar/`, `/pedido/<id>/`.
5. Webhooks: `pnpm infra:stripe` + pruebas de reenvío y de navegador cerrado.
6. `check:budget` (regla del checkout), Playwright, Lighthouse.
7. Docs: este fichero, README §4/§8/§13/§14, AGENTS §3.4 si cambia la regla, ESTADO.md.

### 2.11 Claves de Stripe (modo test) que pone el usuario

Dashboard de Stripe en **modo de prueba** → Desarrolladores → Claves de API. Son las claves estándar: no hace falta activar la cuenta, crear códigos ni configurar nada especial. Las tarjetas están activadas por defecto en modo test.

| Clave                  | Fichero                | Variable                        | Para qué                                                                       |
| ---------------------- | ---------------------- | ------------------------------- | ------------------------------------------------------------------------------ |
| Secreta `sk_test_…`    | `apps/backend/.env`    | `STRIPE_API_KEY`                | Medusa crea, autoriza y captura los PaymentIntents                             |
| La misma `sk_test_…`   | `docker/.env`          | `STRIPE_API_KEY`                | Stripe CLI en Docker (`pnpm infra:stripe`) para reenviar webhooks a :9000      |
| Publicable `pk_test_…` | `apps/storefront/.env` | `PUBLIC_STRIPE_PUBLISHABLE_KEY` | Stripe.js / Payment Element en el navegador (es pública por diseño)            |
| `whsec_…` (no se pide) | `apps/backend/.env`    | `STRIPE_WEBHOOK_SECRET`         | La genera el CLI: `docker compose … run --rm stripe-cli listen --print-secret` |

Nunca claves `sk_live_`/`pk_live_` en desarrollo.

## 3. Datos verificados (código instalado, Medusa 2.21.2)

- `@medusajs/payment-stripe@2.21.2` ya está en el lockfile (dependencia de `@medusajs/medusa`) y usa `stripe` **15.12.0** (API `2024-04-10`).
- Opciones: `apiKey`, `webhookSecret`, `capture` (por defecto **false** → `capture_method: manual`), `automaticPaymentMethods`, `paymentMethodConfiguration`, `paymentDescription`, `asyncPaymentMethodTypes`.
- Si falta `webhookSecret`, el proveedor avisa con `console.warn` y los webhooks fallan la firma.
- `initiatePayment` mete `session_id` en el `metadata` del PaymentIntent y usa `idempotencyKey`. `getWebhookActionAndData` ignora los intents sin `metadata.session_id` (eventos de otras integraciones).
- Estados de Stripe → Medusa: `requires_capture` → `authorized`, `succeeded` → `captured`, `requires_action` → `requires_more`.
- js-sdk 2.21.2 `store`: `cart.update`, `cart.addShippingMethod`, `cart.complete`, `fulfillment.listCartOptions`, `payment.listPaymentProviders`, `payment.initiatePaymentSession`.
- Seed: región España con `payment_providers: ["pp_system_default"]`, envíos `Estándar` 4,95 y `Exprés` 9,95 (manual, zona España).

## 4. Fuentes consultadas

| Tema                                                            | Fuente                                                                                                                                            |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Proveedor Stripe, opciones, eventos de webhook                  | context7 `/medusajs/medusa` (commerce-modules/payment/payment-provider/stripe) + código de `@medusajs/payment-stripe@2.21.2`                      |
| Flujo de checkout (email → dirección → envío → pago → complete) | context7 `/medusajs/medusa` (storefront-development/checkout/*)                                                                                   |
| Webhooks e idempotencia                                         | context7 (`process-payment.ts`, `payment-webhook.ts`) + código de `@medusajs/core-flows@2.21.2` (`complete-cart`, `compensate-payment-if-needed`) |
| `confirmPayment`, `redirect: "if_required"`, `return_url`       | MCP `stripe` (Express Checkout / Payment Element) + context7 (guía de Stripe del starter de Next.js)                                              |
| Versionado de Stripe.js (`dahlia` en `@stripe/stripe-js` 9)     | MCP `stripe` (`sdks/stripejs-versioning`) + tarball de `@stripe/stripe-js@9.17.0`                                                                 |
| CSP de Stripe.js                                                | MCP `stripe` (`security/guide`)                                                                                                                   |
| Tarjetas de prueba (3DS)                                        | MCP `stripe` (`testing`)                                                                                                                          |
| `client:only`, `security.csp.scriptDirective`                   | MCP `astro-docs`                                                                                                                                  |

## 5. Cómo testear esta fase

Se rellena al implementar.

## 6. Criterio de salida

- [ ] Pago de prueba de extremo a extremo (tarjeta normal y con 3DS) → pedido en el Admin con el pago **autorizado**; captura desde el Admin → `captured` en Medusa y en Stripe.
- [ ] Reenvío de webhook → sin pedidos ni capturas duplicados. Navegador cerrado tras pagar → el pedido se crea por webhook.
- [ ] Pasos de datos y envío sin JS (Playwright). CP de Canarias, Ceuta y Melilla rechazados.
- [ ] Páginas legales provisionales enlazadas en el pie y junto al botón de pago.
- [ ] `check:budget` con la regla del checkout; checkout ≤ 30 KB gzip propios.
- [ ] Lighthouse móvil ≥ 95 en `/checkout/`.
- [ ] lint, format:check, typecheck, test y build en verde (CI sin claves de Stripe).

## 7. Pendientes / riesgos

- Sin JS no se puede pagar con tarjeta (el Payment Element es un iframe de Stripe). Es una limitación de Stripe y se avisa con `<noscript>`.
- Compatibilidad entre Stripe.js `dahlia` y la API `2024-04-10` del servidor: verificar con un pago real (§2.4).
- Si se actualiza Medusa, revisar que `compensatePaymentIfNeededStep` y el lock de `completeCartWorkflow` sigan igual.

## 8. Notas para fases futuras

- **Banner de cookies (RGPD/LSSI)**: obligatorio en cuanto se añada analítica o cualquier cookie no necesaria (fase 13). Debe permitir rechazar con la misma facilidad que aceptar, y no cargar nada antes del consentimiento. Implementarlo sin JS de terceros.
- **Textos legales**: sustituir el lorem ipsum de `/condiciones/`, `/privacidad/`, `/cookies/` y `/aviso-legal/` por el texto de la gestoría o una plantilla revisada.
- **Canarias, Ceuta y Melilla**: región fiscal propia (sin IVA; IGIC/IPSI y aduanas) si se quiere vender allí.
- **Captura automática** (P1): cambiar a `capture: true` si capturar a mano se vuelve pesado.

- **Fase 8 (emails)**: confirmación de pedido con el subscriber `order.placed`.
- **Fase 9 (cuenta)**: historial de pedidos y direcciones guardadas.
- **Fase 11**: directivas CSP de Stripe (§2.6), webhook de producción en el Dashboard de Stripe hacia `api.dominio/hooks/payment/stripe_stripe` con los 4 eventos, y rate limiting del checkout.
