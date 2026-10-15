# Fase L — Lista de deseos y programa de puntos (análisis)

> **Estado:** ✅ cerrada el 15-oct-2026 (pendiente de los textos de la gestoría, §6.6). Análisis y decisiones en §0.1. L-0 (spike) ✅ (§6.1). L-1 (lista de deseos) ✅ (§6.2). L-1b (compartir) ✅ (§6.3). L-2 (puntos, backend) ✅ (§6.4). L-3 (storefront y emails) ✅ (§6.5). L-4 (legal y cierre) ✅ (§6.6).
> **Rama/PR:** `feat/faseL-deseos-puntos`: varias subfases por PR (decisión del usuario: los PR largos tardan en Gitea). **PR 1** (#52, mergeado): análisis + L-0 + L-1 + L-1b (lista de deseos completa). **PR 2** (rama `feat/faseL-puntos`): puntos (L-2…L-4).
> **Anterior:** [Fase E](./faseE-urls-correas.md) · **Siguiente:** fase 11 (producción, ESTADO §6.5)
> Nombre provisional. Origen: handover en ESTADO §6.11; antecedentes en fase9.md §7.

## 0. Fuentes consultadas

| Tema                                  | Fuente                                                                                                                                                                                      |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Store Credit / Loyalty Plugin         | context7 `/medusajs/medusa`: `commerce-modules/store-credit` (concepts, workflows), `commerce-modules/loyalty`, user-guide `loyalty/store-credits`, `orders/payments` (reembolso a crédito) |
| Código real del plugin                | tarball `@medusajs/loyalty-plugin@2.21.2` (`pnpm view … dist.tarball`, descomprimido en `/tmp`, **no instalado**): `.medusa/server/src/{workflows,api,subscribers,links,modules}`           |
| Totales de carrito con _credit lines_ | `@medusajs/utils@2.21.2` `dist/totals/cart` y `totals/credit-lines` (node_modules)                                                                                                          |
| Puntos con promociones (alternativa)  | context7: tutorial `how-to-tutorials/tutorials/loyalty-points`, `promotion/promotion-taxes`, `promotion/actions` (reparto proporcional)                                                     |
| Pedido con total 0                    | context7: `troubleshooting/payment/zero-total`, `storefront-development/checkout/payment`                                                                                                   |
| Lista de deseos                       | context7: `plugins/guides/wishlist` (módulo, links, workflows, rutas, compartir)                                                                                                            |
| Server islands, actions               | astro-docs: `guides/server-islands` (caching, Referer), `guides/actions` (`accept: "form"`)                                                                                                 |
| Eventos de pedido                     | `@medusajs/utils` `core-flows/events` (`order.placed`, `order.canceled`, `order.fulfillment_created`, `delivery.created`, `order.return_received`, `payment.captured/refunded`)             |

## 0.1 Decisiones del usuario y de la gestoría (14-oct-2026)

| Tema             | Decisión                                                                                                                                                                                                                                                                                                                                                                                    |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M2 tienda física | Sigue dando y aceptando puntos. **Por ahora, saldos separados**: los de la web solo valen en la web y los de la tienda solo en la tienda. Más adelante, el POS de la tienda será otro frontend contra este mismo Medusa (fase futura, fuera de esta). El modelo de datos debe permitir unificarlos después: un saldo por cliente; los movimientos de tienda llevarán su propio `reference`. |
| M1 migración     | **Sin migrar** saldos del POS.                                                                                                                                                                                                                                                                                                                                                              |
| K2 base          | **0,8 % sobre los productos con IVA, sin envío.**                                                                                                                                                                                                                                                                                                                                           |
| U5 caducidad     | **No caducan.** El programa es una recompensa por la confianza, no una herramienta de marketing: nada de presionar para comprar. Sin job de caducidad.                                                                                                                                                                                                                                      |
| §3.3 / G1        | El canje es un **descuento y reduce la base imponible** → **P-B** (módulo propio + promoción). Se descarta P-A: no hay dependencia nueva.                                                                                                                                                                                                                                                   |
| G2               | Basta con el reparto proporcional entre líneas que ya hace Medusa.                                                                                                                                                                                                                                                                                                                          |
| G3               | No se provisiona ahora, pero interesa un **informe de saldos vivos** (cuánto se podría descontar). Va en L-2 como script o ruta del admin.                                                                                                                                                                                                                                                  |
| G4               | Los emails «has ganado puntos» y los avisos de la lista de deseos son **comerciales**: necesitan consentimiento y baja. **No se envían en esta fase.** Los puntos se ven en «Mi cuenta».                                                                                                                                                                                                    |
| G5               | El texto de las condiciones lo aporta el usuario (documento de la gestoría).                                                                                                                                                                                                                                                                                                                |
| G6               | Al eliminar la cuenta **se pierde el saldo**, pero los **movimientos se conservan ≥ 4 años**: no se borran en cascada y quedan anonimizados (con `customer_id` como referencia).                                                                                                                                                                                                            |
| G7               | Sin requisitos (no se migra).                                                                                                                                                                                                                                                                                                                                                               |
| G8               | El enlace público de la lista no necesita aviso si no muestra datos personales.                                                                                                                                                                                                                                                                                                             |

Pendientes de confirmar (se preguntan en el plan de cada subfase): W1-W7 (lista de deseos), K1 (cuándo se abona), K3 (exclusiones), U2 (0,50 € por pagar) y si el email de **confirmación del pedido** (transaccional) puede decir «ganarás X puntos».

## 1. Objetivos del análisis

- [ ] Decidir el alcance de la **lista de deseos** (§2) y del **programa de puntos** (§3).
- [ ] Decidir la **mecánica de canje** de los puntos (§3.3: _credit line_ o promoción), la decisión con más consecuencias (IVA y factura).
- [ ] Contestar las preguntas del usuario (§5) y llevar las de la gestoría (§6).
- [ ] Aprobar el plan por subfases (§7) y la dependencia nueva (si se elige Store Credit).

---

## 2. Lista de deseos

### 2.1 Lo que da Medusa

No hay paquete: la guía oficial describe un **módulo propio** `wishlist` (`Wishlist` + `WishlistItem`), links read-only a `customer`, `sales_channel` y `product_variant`, workflows con validación de canal de venta y rutas:

- `GET/POST /store/customers/me/wishlists`
- `POST /store/customers/me/wishlists/items`, `DELETE …/items/:id`
- `POST …/wishlists/share` → JWT con `wishlist_id` firmado con `http.jwtSecret` y caducidad `jwtExpiresIn`
- `GET /store/wishlists/:token`

Lo aprovechable: la estructura (módulo + links + workflows + rutas). Lo que no conviene copiar tal cual:

- **Guarda variantes.** Para nosotros es mejor el producto (§2.2).
- **El token de compartir es un JWT con el secreto de sesión.** Caduca a los 7 días y no se puede revocar. Es mejor un token aleatorio guardado en la lista: se revoca regenerándolo y sin caducidad.

### 2.2 Decisiones a tomar (con propuesta)

| #   | Pregunta                                | Opciones                                                              | Propuesta                                                                                                                                                                                                                                                                                            |
| --- | --------------------------------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| W1  | ¿Quién?                                 | a) solo con cuenta · b) también invitados (cookie + fusión al entrar) | **a**. Sin cuenta, el corazón lleva a `/cuenta/entrar/?next=…`. Tras entrar, el producto se añade solo (PRG con `next` + `add`). La opción b necesita una tabla de invitados, la fusión y una purga: mucho trabajo para algo que se usa poco.                                                        |
| W2  | ¿Producto o variante?                   | a) variante (guía) · b) producto, con variante opcional               | **b**: `product_id` obligatorio y `variant_id` opcional. Desde la tarjeta se guarda el producto; desde la ficha, el producto (más la variante elegida si se pulsa con una seleccionada). La **correa a medida** se guarda como producto color×material, sin variante: en la lista sale «Configurar». |
| W3  | ¿Una lista o varias?                    | —                                                                     | **Una por cliente** (índice único `customer_id`). Varias listas son las «listas de carritos» que ya se descartaron.                                                                                                                                                                                  |
| W4  | ¿Compartir?                             | a) no · b) enlace público                                             | **b, en una subfase aparte (L-1b)**. Token aleatorio de 32 bytes en `wishlist.share_token` (nulo = no compartida), página `/deseos/<token>/` on-demand con `noindex` y un botón «Dejar de compartir». En la página pública no salen nombre ni email: solo «Lista de deseos».                         |
| W5  | ¿Avisos de stock o de bajada de precio? | —                                                                     | **No en esta fase.** Es comunicación comercial (LSSI art. 21): pide consentimiento y baja. Se junta con el carrito abandonado en la fase de marketing (fase9.md §7). El modelo deja sitio para ello (`created_at` y el precio al guardar en `metadata`).                                             |
| W6  | ¿Precio y stock en la lista?            | —                                                                     | Sí, **frescos**: `/cuenta/deseos/` es on-demand y `private, no-store`, como el carrito. Precio calculado con `region_id` y stock de las variantes, con «Añadir al carrito» por línea (action existente si hay una sola variante; si no, enlace a la ficha).                                          |

### 2.3 Corazón en páginas estáticas sin JS nuevo

Las restricciones: home, listados y fichas son estáticas, con 0 bundles salvo excepciones. `SiteClient` está en **1 527 / 1 536 B**, sin margen. `CartClient` está en **1 380 / 2 048 B** (~660 B libres; medido en `dist/` el 14-oct).

| Opción             | Cómo                                                                                                                                                                                                                                                                                 | JS                                                                                           | Pros / contras                                                                                                                                                                                                                          |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **H1** (propuesta) | `<form method="post" action={actions.wishlist.add}>` con botón ♡ «Guardar». Sin JS: PRG 303 de vuelta a la página con aviso `:target` (igual que el carrito). Con JS, `CartClient` lo intercepta si el form lleva `data-cart-form`: misma respuesta JSON `{code,count,msg}` → toast. | **~0-60 B** en `CartClient`: que `code !== "added"` no abra el panel; posible `code: "wish"` | Sin bundle nuevo y sin petición extra. **Contra:** la página estática no sabe si el producto ya está guardado, así que el botón no cambia a ♥. `add` es **idempotente** («Ya estaba en tu lista»). Quitar se hace en `/cuenta/deseos/`. |
| H2                 | H1 + **server island** privada en la ficha (`server:defer`, `no-store`) que pinta el botón en estado ♥/♡ (toggle)                                                                                                                                                                    | 0 B propio (runtime de islands ya presente)                                                  | Estado correcto en la ficha. **Contra:** una petición más por ficha **para todos** (también anónimos): la página estática no sabe si hay sesión. No se puede meter en la island de LiveSync, que es compartida y con `s-maxage`.        |
| H3                 | Contador/estado en `CartClient` vía `/cuenta/deseos/ids`                                                                                                                                                                                                                             | +200-300 B y una petición                                                                    | Rompe el «sin petición extra» y se come casi todo el margen de `CartClient`. Descartada.                                                                                                                                                |

**Propuesta:** H1 en tarjetas y ficha; **H2 solo en la ficha** si al usarlo se echa de menos ver el estado (decisión W7, se puede dejar para después). Al estar en `/_astro/`, `check:budget` no cambia (mismo bundle, mismos límites).

### 2.4 Modelo de datos

```
módulo wishlist (src/modules/wishlist)
  wishlist         id, customer_id (único), sales_channel_id, share_token (único, nulo), metadata
  wishlist_item    id, wishlist (belongsTo), product_id, variant_id (nulo), metadata, created_at
                   índice único (wishlist_id, product_id, variant_id)
links (defineLink, readOnly: true, sin tabla):
  wishlist.customer_id      → customer
  wishlist_item.product_id  → product
  wishlist_item.variant_id  → product_variant
```

Workflows (pasos compensables): `addToWishlist` (crea la lista si no existe; valida producto publicado, en el canal y **no descatalogado**, E-1) y `removeFromWishlist`. Para compartir: `setWishlistShare` / `revokeWishlistShare` (L-1b).

Rutas (validación zod en `middlewares.ts`, `authenticate("customer", ["bearer"])`):

- `GET /store/customers/me/wishlist`
- `POST …/wishlist/items` y `DELETE …/wishlist/items/:id`
- `POST/DELETE …/wishlist/share` (L-1b)
- `GET /store/wishlists/:token` (L-1b, sin auth, solo campos públicos)

Baja de la cuenta: hoy es manual (fase9 §7); el borrado de la lista va en ese procedimiento.

### 2.5 Flujo

```
Tarjeta/ficha (estática) ── POST wishlist.add ──► Astro action ──► POST /store/customers/me/wishlist/items
   │ sin sesión → 303 /cuenta/entrar/?next=<página>&wish=<product_id>
   │ con JS      → CartClient: toast «Guardado en tu lista»
   └ sin JS      → 303 <página>#wish-ok (aviso CSS)
/cuenta/deseos/ (on-demand, no-store) ── GET …/wishlist + precios/stock frescos ──► lista + «Añadir» / «Quitar»
```

---

## 3. Programa de puntos

### 3.1 Regla de la tienda (ya acordada)

El **0,8 %** de cada compra se convierte en puntos. **1 punto = 1 €** de descuento, con decimales (0,15 puntos = 0,15 €), y se pueden usar o acumular. Hoy lo calcula un script diario en un POS que desaparecerá: no hay que integrarlo.

### 3.2 Lo que hace realmente `@medusajs/loyalty-plugin` 2.21.2

Inspeccionado en el código, no solo en la documentación:

- **Licencia MIT, versión igual a Medusa.** Sin `dependencies`. Sus _peer deps_ (`react` 18.3.1, `@medusajs/ui` 4.2.6, `admin-sdk`, `dashboard`, `icons` 2.21.2) **ya están** en el backend.
- **Dos módulos:**
  - `store-credit`: `store_credit_account` (`customer_id`, `currency_code`, `code`) + `store_credit_account_transaction` (`credit`/`debit`, `amount`, `reference`, `reference_id`, `note`). El **saldo no se guarda**: es la suma de los movimientos, así que hay un histórico auditable gratis.
  - `loyalty`: gift cards, que no usamos.
- **No se pueden desactivar las gift cards:** el plugin se registra entero. Trae:
  - el subscriber `order.placed`: consulta cada pedido y no hace nada si no hay productos `is_giftcard`;
  - las rutas `/store/gift-cards/:code` y `/store/carts/:id/gift-cards`;
  - las pantallas de admin (Store Credits y Gift Cards; ~2,8 MB, solo en el admin).

  Registrar solo el módulo `store-credit` (como `modules`, sin el plugin) **no está documentado**. Se puede probar en el spike, pero perderíamos sus workflows, rutas y admin.

- **Ocupa 4 hooks** (Medusa admite **un handler por hook**):
  - `completeCartWorkflow.hooks.beforePaymentAuthorization`: debita el saldo, compensable;
  - `completeCartWorkflow.hooks.orderCreated`;
  - `refreshCartItemsWorkflow.hooks.beforeRefreshingPaymentCollection`;
  - `createOrderCreditLinesWorkflow.hooks.creditLinesCreated`: reembolso a crédito.

  Hoy solo usamos los hooks `validate` (`validar-carrito.ts`), así que **no hay choque**. Pero esos 4 quedan bloqueados para nosotros en el futuro.

- **Canje:** `POST /store/carts/:id/store-credits` (`{ amount? }`, cliente autenticado) crea una _credit line_ `reference: "store-credit"`. El importe es como mucho el saldo y se limita a `cart.total` **en ese momento**.
- ⚠️ **La _credit line_ de puntos no se recalcula si el carrito cambia.** El refresco del plugin solo toca las de gift card. Si después de aplicar 10 € se quitan productos, la línea se queda en 10 € y el total puede bajar de lo debido o quedar en 0 o menos. Hay que borrarla o recalcularla nosotros en cada cambio del carrito. El hook natural (`beforeRefreshingPaymentCollection`) ya lo ocupa el plugin: habrá que hacerlo en la action del storefront o en un workflow propio que envuelva las mutaciones.
- **Reembolso a crédito:** desde el admin, un reembolso puede ir al saldo del cliente («Settlement type»). No hay nada automático al **cancelar** un pedido: devolver los puntos gastados y anular los ganados es cosa nuestra.
- ⚠️ **IVA:** en `@medusajs/utils` (`totals/cart`) las _credit lines_ se restan **después** de impuestos, con tipo 0 (`// TODO: … tax rate for credit lines`). `tax_total` **no baja**: Medusa trata el canje como un **medio de pago** (un vale), no como un descuento que reduzca la base imponible. Ver §3.3 y la gestoría (§6, G1).

### 3.3 Mecánica de canje: la decisión clave

|                     | **P-A: Store Credit (plugin)**                                                                    | **P-B: módulo propio + promoción** (tutorial oficial _loyalty-points_)                                                                                                                                         |
| ------------------- | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Saldo y movimientos | Del plugin (cuentas + movimientos + admin)                                                        | Módulo propio `points` (cuenta + movimientos; admin con un widget propio)                                                                                                                                      |
| Canje               | _Credit line_ tras el IVA. **No reduce la base imponible**: funciona como un vale o pago parcial. | Promoción `fixed`, `target_type: order`, `is_tax_inclusive: true`, regla `customer_id`, uso 1. **Reduce la base**: Medusa la reparte por líneas y el desglose de IVA (`buildTaxBreakdown`) sale bien por tipo. |
| Encaja con…         | Puntos como «saldo a favor» (como una tarjeta regalo)                                             | Puntos como **descuento** en la compra (como en el ticket de la tienda física, a confirmar)                                                                                                                    |
| Trabajo             | Menos backend; recálculo de la línea a nuestro cargo (§3.2 ⚠️)                                    | Más backend: crear y borrar la promoción al aplicar o cambiar, idempotencia, limpieza de promociones caducadas. El recálculo al cambiar el carrito lo hace Medusa (las promociones se recalculan solas).       |
| Dependencias        | **Nueva**: `@medusajs/loyalty-plugin` 2.21.2 (+ gift cards y admin que no usamos)                 | Ninguna                                                                                                                                                                                                        |
| Riesgos             | 4 hooks ocupados; línea obsoleta; IVA quizá no deseado                                            | Una promoción por canje; tarea propia de limpieza; interacción con otros descuentos (si algún día hay cupones)                                                                                                 |

**Propuesta provisional: depende de G1 (gestoría).**

- Si el canje de puntos es un **descuento** (lo habitual en programas de fidelización de comercio minorista: el descuento previo o simultáneo reduce la base, art. 78.Tres.2.º LIVA), **P-B** deja bien la factura y el IVA de serie.
- Con **P-A** habría que corregir el IVA a mano, y Medusa no lo hace.
- Si la gestoría dice que es un **medio de pago** (como un vale), **P-A** es más sencilla.

Mi inclinación, a falta de la gestoría: **P-B**. No añade dependencias, no ocupa hooks, deja el IVA bien por tipo (4/10/21 %) y Medusa recalcula al cambiar el carrito.

### 3.4 Abono: cuándo y sobre qué

| #   | Pregunta                     | Propuesta                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| --- | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| K1  | ¿Cuándo se abonan?           | Al **consolidar** el pedido: un **job diario** abona los pedidos entregados (`delivery.created`) o enviados hace **≥ 14 días + margen** (desistimiento) que no estén cancelados. Hasta entonces salen como **«pendientes»** en la cuenta y en el email del pedido («ganarás X puntos»). Es lo que ya hacía el POS (script diario) y evita abonar y luego retirar. Alternativa más simple: abonar al pagar (`order.placed`) y retirar en devoluciones, con riesgo de saldo negativo si ya se gastaron. |
| K2  | ¿Base?                       | **Importe de los productos pagado de verdad, IVA incluido:** `item_total` después de descuentos y **sin envío**. **No genera puntos la parte pagada con puntos**: con P-B ya está restada (es descuento); con P-A hay que restar la _credit line_. A confirmar con el usuario y con la tienda física: ¿el 0,8 % del POS era sobre el ticket con IVA?                                                                                                                                                  |
| K3  | ¿Exclusiones?                | Por defecto, ninguna. Se puede marcar un producto con `metadata.sin_puntos` (hoja del catálogo) si se quiere excluir algo, como ofertas o correas a medida. Pregunta abierta al usuario.                                                                                                                                                                                                                                                                                                              |
| K4  | Redondeo                     | Al céntimo, **hacia abajo**: `floor(base × 0,008 × 100) / 100`. Un pedido de 30 € da 0,24 puntos.                                                                                                                                                                                                                                                                                                                                                                                                     |
| K5  | Devoluciones y cancelaciones | Con K1 casi no hay casos: si se cancela o devuelve antes de consolidar, se calcula sobre lo que queda (`items.refundable_total` / `return_received_total`). Si se devuelve **después**, un movimiento `debit` (`reference: "return"`) por la parte devuelta, sin bajar de 0 (lo que falte se pierde; a confirmar). Cancelar un pedido que **gastó** puntos los devuelve (`credit`, `reference: "order_canceled"`).                                                                                    |
| K6  | Idempotencia                 | Un abono por pedido: `reference: "order"`, `reference_id: order_id`. Antes de abonar se comprueba si ya existe (índice o consulta en el paso). El job puede repetirse sin duplicar.                                                                                                                                                                                                                                                                                                                   |

### 3.5 Canje: límites

| #   | Pregunta                    | Propuesta                                                                                                                                                                                                                                                                                                                                                                                 |
| --- | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| U1  | ¿Mínimo para usar?          | Ninguno: se usa con cualquier saldo mayor que 0.                                                                                                                                                                                                                                                                                                                                          |
| U2  | ¿Máximo por pedido?         | Que quede **al menos el mínimo de Stripe** por pagar (**0,50 € en EUR**, verificar con el MCP de Stripe). Así nunca hay un pedido de total 0: Stripe no crea sesión con 0 € y el proveedor manual `pp_system_default` se **quitó a propósito** (fase 5, P5). Alternativa para cubrir el 100 %: un proveedor manual solo para totales 0, que es un riesgo de seguridad y no lo recomiendo. |
| U3  | ¿Todo o parte?              | Ambas: «Usar mis X €» (todo, con el tope de U2) o un campo con importe. Se puede quitar.                                                                                                                                                                                                                                                                                                  |
| U4  | ¿Combinable con descuentos? | Sí (hoy no hay cupones). Con P-B, la promoción de puntos se aplica la última.                                                                                                                                                                                                                                                                                                             |
| U5  | Caducidad                   | Propuesta: **sin caducidad** al principio, o la misma regla que la tienda física si la tiene. Si la hay (p. ej. 24 meses sin compras), job mensual con `debit` `reference: "expiry"` y aviso previo por email (transaccional o comercial: gestoría, G4).                                                                                                                                  |
| U6  | Invitados                   | Solo con cuenta. En el checkout de invitado, una línea estática: «Con cuenta ganarías X puntos» (sin JS, calculada en el servidor).                                                                                                                                                                                                                                                       |

### 3.6 Migración de saldos del POS

Opciones (pregunta al usuario, M1):

- **a) Por email:** se importa un CSV `email,saldo` y se abona a la cuenta online con ese email si existe. Si no existe, se guarda pendiente y se abona al registrarse (`customer.created`). **Riesgo:** emails del POS sin verificar.
- **b) Por código:** cada cliente recibe en tienda un código de canje, y en «Mi cuenta → Puntos» lo canjea y el saldo pasa a su cuenta. Con P-A es nativo: `claimStoreCreditAccountWorkflow`, cuentas sin `customer_id` con `code`. Con P-B, un movimiento con código de un solo uso.
- **c) No migrar:** se cierra el POS y se empieza de cero, o la tienda canjea los saldos antes del cierre.

**Propuesta:** b (seguro y sin datos personales en la importación) con a como apoyo, si el POS tiene emails fiables.

**Pregunta grande (M2):** cuando desaparezca el POS, ¿la **tienda física** seguirá dando y aceptando puntos? Si es así, el saldo tiene que ser **común** (tienda + online) y hace falta una forma de abonar y canjear en el mostrador: el admin de Medusa (crédito/débito manual con nota) o una pantalla propia. Esto cambia el alcance: confirmarlo antes de L-2.

### 3.7 Dónde se ve

- **Mi cuenta → Puntos** (`/cuenta/puntos/`, on-demand, sin JS): saldo, pendientes (pedidos aún no consolidados) y movimientos (fecha, concepto, pedido).
- **Checkout**, paso de pago (antes de Stripe):
  - «Tienes X € en puntos» + `<form>` usar / quitar (action `checkout.applyPoints`, PRG);
  - el resumen (`OrderSummary.astro`) muestra la línea «Puntos −X €».
  - El Payment Intent se recalcula: ya pasa con cada cambio del carrito (refresco de la payment collection). Comprobarlo en el spike.
- **Emails:**
  - confirmación: «Puntos usados −X €» y «Ganarás Y puntos cuando se entregue»;
  - email al consolidar: «Ya tienes Y puntos», transaccional (verificar G4).

  Hay que añadir campos a `ORDER_EMAIL_FIELDS` y `buildOrderPlacedProps`.

- **Condiciones** del programa en `/condiciones/` (o `/puntos/`), con texto de la gestoría.

### 3.8 Modelo de datos (según la opción)

```
P-A  store_credit_account (plugin)  ← link customer (plugin)
     store_credit_account_transaction: credit order|migration|order_canceled|adjustment ; debit order(canje)|return|expiry
     + nada propio salvo el job de abono y los subscribers de cancelación

P-B  módulo points (propio)
     points_account      id, customer_id (único), metadata
     points_transaction  id, account, type credit|debit, amount (bigNumber), reference, reference_id, note, created_at
                         índice único (reference, reference_id, type) → idempotencia
     saldo = Σcredit − Σdebit (como el plugin)
     canje → promoción de un uso (customer_id) creada por workflow; metadata.cart_id; job de limpieza
```

### 3.9 Flujo (P-B; con P-A es igual salvo el canje)

```
Checkout (paso pago) ── POST checkout.applyPoints(amount) ──► workflow applyPoints
     lock(cart) → saldo ≥ amount → amount ≤ total − 0,50 → promoción fija (uso 1, customer_id) → cart.promo_codes
completeCart ──► order.placed ──► subscriber: debit(reference "order", order_id) + email «ganarás Y»
job diario ──► pedidos entregados/enviados ≥ 14 d, no cancelados, sin abono ──► credit(order_id) + email
order.canceled ──► devolver puntos gastados (credit) · no abonar
return_received tras abono ──► debit proporcional (mín. 0)
```

---

## 4. Impacto en JS y rendimiento

| Página                               | Cambio                            | JS                                                                                                                              |
| ------------------------------------ | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Home, listados, ficha                | Botón ♡ (`<form>`), HTML estático | `CartClient` +0-60 B (sigue ≤ 2 KB). Sin bundle nuevo. Opcional H2: una island privada en la ficha (petición extra, 0 B propio) |
| `/cuenta/deseos/`, `/cuenta/puntos/` | On-demand, `no-store`             | 0 B propios (como el resto de `/cuenta/*`: `SiteClient` + `CartClient`)                                                         |
| Checkout                             | Formulario de puntos sin JS (PRG) | 0 B. `StripePayment` no cambia (el importe sale del servidor)                                                                   |
| `/deseos/<token>/` (L-1b)            | On-demand, `noindex`              | `SiteClient` + `CartClient`                                                                                                     |

No hacen falta excepciones nuevas en AGENTS §3.4. Lighthouse no debería moverse en las páginas estáticas (un botón más por tarjeta, tamaño fijo, sin CLS).

---

## 5. Preguntas para el usuario (decidir antes de programar)

**Lista de deseos**

1. W1: ¿solo con cuenta? (propuesta: sí)
2. W2: ¿producto, con variante opcional? (propuesta: sí)
3. W4: ¿compartir por enlace, en una subfase aparte? (propuesta: sí, L-1b)
4. W7: ¿basta H1 (botón «Guardar», sin estado ♥ en páginas estáticas) o quieres el estado en la ficha (H2, una petición más por ficha)?
5. W5: avisos de stock y precio, ¿se dejan para la fase de marketing? (propuesta: sí)

**Puntos**

6. M2: ¿la tienda física seguirá usando puntos después de quitar el POS? (cambia el alcance)
7. M1: migración de saldos: ¿por código, por email o no migrar? ¿Hay un export del POS (formato, emails)?
8. K2: ¿el 0,8 % se calcula sobre el importe **con IVA** y **sin envío**? ¿Se excluye algún producto o categoría (K3)?
9. K1: ¿abono al consolidar (entrega + 14 días) o al pagar?
10. U2: ¿te vale que siempre quede al menos 0,50 € por pagar con tarjeta?
11. U5: ¿caducan los puntos? ¿Qué regla tiene hoy la tienda física?
12. §3.3: ¿P-A (plugin, dependencia nueva) o P-B (propio, sin dependencias)? Propuesta: **esperar a G1** e inclinarse por P-B.

## 6. Preguntas para la gestoría

- **G1 (bloquea §3.3).** Cuando un cliente paga parte de una compra con puntos ganados en compras anteriores, ¿es un **descuento** que reduce la base imponible del IVA de esa compra (art. 78.Tres.2.º LIVA), o un **medio de pago** (como un vale o bono) que no la reduce? ¿Cómo lo hace hoy el ticket de la tienda física?
- **G2.** Si es descuento y el pedido tiene productos a varios tipos (4/10/21 %), ¿basta con repartirlo proporcionalmente entre las líneas, como hace Medusa?
- **G3.** ¿Los puntos pendientes de canje se tienen que **provisionar** en contabilidad (pasivo por los saldos de los clientes)? ¿Hace falta un informe periódico de saldos (total abonado, canjeado, caducado)?
- **G4.**
  - ¿Los emails «has ganado X puntos» y «tus puntos caducan» son **transaccionales** o **comerciales** (LSSI art. 21: hace falta consentimiento o baja)?
  - ¿Y los avisos de la lista de deseos (bajada de precio, vuelve a haber stock)?
- **G5.** Texto de las **condiciones del programa** para `/condiciones/`:
  - alta y baja;
  - valor del punto;
  - caducidad;
  - devoluciones;
  - que no se pueden cambiar por dinero;
  - qué pasa con el saldo al darse de baja.

  Y una mención en **privacidad** (tratamiento del historial de compras para calcular puntos).

- **G6.** Al eliminar la cuenta, ¿el saldo de puntos se pierde? ¿Hace falta conservar los movimientos y durante cuánto tiempo (obligación fiscal, como los pedidos)?
- **G7.** Migración del POS: ¿hay algún requisito para trasladar los saldos de los clientes de la tienda física a la web (consentimiento, comunicación)?
- **G8.** Lista compartida: el enlace público no muestra datos personales. ¿Hace falta algún aviso al compartirla?

## 6.1 L-0 ✅ Spike: canje de puntos como promoción (14-oct-2026)

Script desechable `medusa exec` contra la BD local, con los workflows de `core-flows` 2.21.2 (`createCartWorkflow`, `addShippingMethodToCartWorkflow`, `createPromotionsWorkflow`, `updateCartPromotionsWorkflow`, `updateLineItemInCartWorkflow`, `deleteLineItemsWorkflow`). Se borró al acabar, junto con sus datos: 3 carritos y 2 promociones `SPIKE-*`, sin reservas. No se ha commiteado.

Promoción de prueba:

```
type standard · is_automatic false · is_tax_inclusive true
application_method { type fixed, target_type order, allocation across, value, currency_code eur }
rules [{ attribute customer_id, operator eq, values [cus_…] }]
campaign.budget { type usage, limit 1 }
```

Carrito: 2 × 6,90 € al 21 %, 70,90 € al 10 %, 22,90 € al 4 % y envío de 4,95 € al 21 % (precios con IVA incluido).

| Prueba                                             | Resultado                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1. IVA mixto, puntos 5 €**                       | `total` 112,55 → **107,55**; `discount_total` 5 (base 4,55 + IVA 0,45); `tax_total` 10,58 → **10,13**. **Reduce la base imponible** (G1). Reparto proporcional al importe con IVA de cada línea: 0,64 / 3,29 / 1,06 € (G2). **El envío no se toca** (la promoción `order` solo va a líneas de producto). El desglose de `buildTaxBreakdown` sale bien por tipo: 21 % 14,97 + 3,14 · 10 % 61,46 + 6,15 · 4 % 21,00 + 0,84.                                                                                                                                                                                                                           |
| **2a. Cambiar cantidad**                           | Medusa **recalcula y reparte** solo: siguen siendo 5 € entre las líneas nuevas.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| **2b. Quitar líneas**                              | Quedan 6,90 € de producto: el descuento sigue en 5 € → total 6,85.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| **2c. Puntos > productos** (999 €)                 | El descuento **se limita al importe de los productos** (6,90). Total = **solo el envío** (4,95): nunca es negativo y nunca descuenta envío.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| **Importe a cobrar** (`payment_collection.amount`) | ⚠️ Al **aplicar** la promoción con `updateCartPromotionsWorkflow`, **no se actualiza** sin `force_refresh_payment_collection: true` (112,55 con el carrito a 107,55; la ruta `POST /store/carts/:id/promotions` de Medusa sí lo pasa). En cambio, al cambiar o quitar líneas (`refreshCartItemsWorkflow`) **sí** se refresca, aunque en 2c se quedó en 6,85 tras un `replace` sin forzar. **Regla para L-2:** el workflow de canje pasa siempre `force_refresh_payment_collection: true`, y el checkout no muestra el pago si `payment_collection.amount ≠ total` (ya lo comprueba el storefront al crear la sesión de Stripe; verificarlo en L-3). |
| **3a. Otro cliente / invitado**                    | El código **no se aplica**, sin error: `promotions: []`. La regla `customer_id` basta: conocer el código no sirve de nada.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| **3b. Un solo uso**                                | Tras `registerUsage` (lo hace `completeCartWorkflow` → `registerUsageStep`), `budget.used = 1/1` y el mismo código **no se aplica** en otro carrito del mismo cliente (sin error, se ignora).                                                                                                                                                                                                                                                                                                                                                                                                                                                       |

**Conclusiones (diseño de L-2):**

1. **P-B confirmada.** El IVA, el reparto y la exclusión del envío salen bien sin código propio.
2. **El tope de 0,50 €** (U2) lo pone nuestro workflow: Medusa limita a los productos, pero el envío no cuenta. Por ejemplo, con productos de 6,90 € y envío de 4,95 €, canjear 6,90 € deja 4,95 € por pagar, que es más de 0,50 €. **Fórmula:** `máx. canje = min(saldo, item_total_sin_puntos − máx(0, 0,50 − shipping_total))`. Con envío ≥ 0,50 €, el tope es todo el importe de los productos.
3. **Importe en la promoción, sin recálculo extra.** Si el carrito baja después de canjear, Medusa limita el descuento, así que **se gasta menos** de lo canjeado. **El débito del saldo se hace al completar el pedido por el `discount` real** de esa promoción (adjustments del pedido con su `code`), no por el valor de la promoción.
4. **Promoción por canje:** un código aleatorio no adivinable (`PTS-<ulid>`), regla `customer_id`, budget `usage 1` y `metadata.cart_id`. Al cambiar el importe se sustituye: se borra la anterior y se crea otra. La limpieza (promociones sin usar de carritos completados o caducados) va en el job de carritos (`delete-stale-carts`).
5. **Concurrencia:** dos carritos del mismo cliente pueden tener cada uno su promoción con todo el saldo. **Hay que comprobar el saldo al completar** (hook `completeCartWorkflow.hooks.validate`: ya existe uno, `validar-carrito.ts`, que se amplía) y debitar con un lock por cliente en el subscriber. Si no hay saldo suficiente, el pedido no se completa y el usuario tiene que volver a aplicar los puntos.
6. Sin migraciones del módulo Promotion. Solo hace falta el módulo propio `points` (cuenta + movimientos).

## 6.2 L-1 ✅ Lista de deseos (14-oct-2026)

Decisiones confirmadas por el usuario: W1 solo con cuenta, W2 producto con variante opcional, W4 compartir en L-1b, W7 botón «Guardar» sin estado ♥ (**pendiente de comprobación visual; puede cambiar**) y cookie de 10 min con el producto pendiente al entrar.

**Backend** (fuente: guía oficial `plugins/guides/wishlist`, context7 `/medusajs/medusa`):

- **Módulo `src/modules/wishlist`:**
  - `wishlist` (`customer_id` único, `share_token` para L-1b) y `wishlist_item` (`product_id`, `variant_id` opcional);
  - borrado en cascada de las líneas;
  - **dos índices únicos parciales**, uno con `variant_id IS NULL` y otro con `IS NOT NULL`. En PostgreSQL los NULL son distintos entre sí, así que un único índice dejaría guardar dos veces el mismo producto sin variante;
  - la guía guarda el canal de venta; aquí **no**, porque la tienda tiene uno solo. El canal se valida al añadir.
- **Migración** `Migration20261014162452`, solo aditiva: dos tablas nuevas. Se generó con `medusa db:generate wishlist`.
- **Links de solo lectura** (`src/links/wishlist-*.ts`): lista → cliente, línea → producto y línea → variante.
- **Workflows** (`src/workflows/wishlist/`), con un paso compensable por escritura:
  - `addToWishlistWorkflow`: valida que el producto esté publicado, en el canal y **no descatalogado** (400), y que la variante sea del producto. Crea la lista si no existe. Es **idempotente** (`created: false`);
  - `removeFromWishlistWorkflow`: borrado suave. Si la línea es de otra lista responde `deleted: false`, igual que si no existiera.
- **Rutas** (la sesión la exige Medusa en `/store/customers/me*`; body validado con zod en `middlewares.ts`, que rechaza campos de más):
  - `GET /store/customers/me/wishlist` → `{ items }`, solo ids, del más reciente al más antiguo;
  - `POST …/wishlist/items` → 201 si se crea, 200 si ya estaba;
  - `DELETE …/wishlist/items/:id`.
- **Tests HTTP** en `integration-tests/http/deseos.spec.ts` (4):
  - 401 sin sesión;
  - añadir es idempotente, el producto y su variante cuentan como entradas distintas, y se puede volver a guardar tras quitarlo;
  - se rechaza un producto en borrador, de otro canal o descatalogado, una variante ajena y campos de más;
  - cada cliente solo ve y quita lo suyo.

**Storefront** (fuente: astro-docs, guides/actions; mismo patrón que el carrito, fase 4):

- **`lib/wishlist.ts`** (funciones puras, 8 tests):
  - URL de la action (`/cuenta/deseos/?_action=…`, ruta on-demand y privada);
  - cookie `wish_pending` (httpOnly, 10 min, `product_id[:variant_id]` validado);
  - avisos y `wishRows`.
- **`actions/wishlist.ts`** (`wishlist.add` y `wishlist.remove`):
  - sin sesión, guarda el producto pendiente y responde `login`;
  - el middleware hace un 303 a `back#deseos-<código>` o devuelve JSON `{ code, msg, kind, login }`;
  - sin sesión, 303 a «Entrar» con el aviso `wish_login`.
- **Al entrar**, `account.login` guarda el producto pendiente (`savePendingWish`, en paralelo con `adoptCart`) y borra la cookie.
- **`WishButton.astro`:**
  - en las tarjetas, solo el icono ♡, a la derecha de la acción. En tarjetas estrechas (carrusel móvil, ~146 px) baja a su propia fila. Medido: sin solapes ni desbordes en `/`, `/productos/`, `/ofertas/`, `/buscar/` y fichas, en escritorio y móvil;
  - en la ficha, «♡ Guardar en mi lista» **dentro** del formulario de Añadir (`formaction`, slot `after` de `AddToCart`). Con varias variantes guarda la elegida (`wish=variant`); con una, el producto;
  - en el configurador de la correa guarda el **producto** (color × material). No sale en la tarjeta del grupo «Correa a medida».
- **`/cuenta/deseos/`** (on-demand, `no-store`):
  - precio y stock frescos (`getWishlistProducts`, Store API);
  - «Añadir al carrito» (action `cart.add`) si no hay que elegir nada; si no, «Ver producto»;
  - «Quitar»;
  - aviso de descatalogado con enlace al sustituto;
  - los productos despublicados no salen;
  - enlace en el menú y en el resumen de la cuenta.
- **Avisos sin JS:** `CartNotice` añade los `#deseos-*` (`:target`), con «Ver mi lista».
- **`CartClient`:** los botones `[data-wish]` hacen fetch a su `formaction` y muestran un toast, o navegan a «Entrar». Hubo un fallo en el e2e: sin el atributo `formaction`, `button.formAction` devuelve la URL de la página; por eso el botón siempre lo lleva.

**JS:** `CartClient` pasa de 1 380 a **1 444 B gzip** (+64 B; límite 2 048). Sin bundles nuevos (`check:budget` OK, 384 páginas; el e2e comprueba que solo se cargan `CartClient` y `SiteClient`).

**Revisión del usuario (14-oct, L-1 ajustes):**

| Cambio                                                                | Decisión                                                                                                                                                                                                                                                                                                                           |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ♥ rojo si ya está en la lista (tarjetas, ficha)                       | La island de la cabecera (`HeaderState`, antes `CartCount`) devuelve, además del número del carrito, los productos y variantes guardados (`<template data-wish-state>`), sin peticiones extra. `CartClient` marca `[data-wish-box][data-saved]` (CSS). Sin JS o sin sesión: ♡ siempre.                                             |
| **A**: ♡ blanco guarda (toast); ♥ rojo **lleva a la lista**, no quita | Solo se quita en `/cuenta/deseos/`: un clic por error no borra nada. El ♥ es un enlace real.                                                                                                                                                                                                                                       |
| Tarjetas, opción 1                                                    | ♡ sobre la imagen, arriba a la derecha (círculo `bg-card`, borde y sombra de marca); «Oferta» pasa abajo a la izquierda. El bloque de compra no cambia. Medido a 360, 412 y 1280 px: sin solapes, sin desbordes y el enlace estirado no tapa el corazón.                                                                           |
| **B**: ficha, ♡ junto al título                                       | Lejos de «Añadir». Envía el formulario de compra con `form="comprar"` (guarda la variante elegida) y se enciende si **esa** variante está guardada; al cambiar de variante, `CartClient` actualiza la clave. Correa y productos de una variante: guarda el producto.                                                               |
| **C**: ♡ en la cabecera                                               | Relleno si hay algo guardado, vacío si no. Va a `/cuenta/deseos/` (sin sesión, a «Entrar»).                                                                                                                                                                                                                                        |
| Icono de cuenta con sesión                                            | Versión rellena (`user-fill`, Phosphor 2.1.1 MIT, como el resto). En páginas estáticas, por la island; en carrito, checkout y pedido, del servidor.                                                                                                                                                                                |
| Móvil                                                                 | El selector de tema pasa al menú ☰ («Modo oscuro / Modo claro»); en escritorio sigue en la cabecera. `SiteClient` gestiona los dos botones.                                                                                                                                                                                       |
| Toast en tema claro                                                   | Fondo `card`, texto `card-foreground`, borde `line` y sombra sólida (antes, fondo oscuro con borde y sombra del mismo color). En oscuro, como estaba.                                                                                                                                                                              |
| `/cuenta/deseos/`                                                     | Miniaturas y lista con el marco de la web (`border-2 border-line`, sombra). **«Variante: M / Azul»** en negrita. Cada variante guardada es una fila propia. Cantidad − / + y «Añadir» (`AddToCart`, también granel en gramos) si hay una variante concreta; si hay que elegir, «Elegir opciones» (o «Elegir medida» en la correa). |
| Páginas de la cuenta                                                  | Tarjetas, listas y separadores con `rounded-md border-2 border-line bg-card shadow-sm` (antes `rounded-lg border` de 1 px). El detalle del pedido tiene miniaturas con el marco del carrito.                                                                                                                                       |
| Contraste                                                             | ♥ `destructive` sobre `card` ≥ 3:1 en los dos temas (icono, WCAG 1.4.11; test en `theme.test.ts`).                                                                                                                                                                                                                                 |

**Segunda revisión (14-oct):**

| Cambio                                     | Cómo                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ♥ con contorno                             | `HeartFilled.astro`: relleno `destructive` + contorno del corazón de trazo en `--line` (dos SVG superpuestos). En tarjetas, ficha y cabecera.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ♡ de la cabecera                           | Con algo guardado, ♥ rojo con contorno (el icono de cuenta sigue con relleno del color del texto).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Cabecera al bajar: solo la búsqueda        | Móvil: se sube solo la 1.ª fila (`translate: 0 -3rem`) y la búsqueda queda arriba. Escritorio: logo, menú e iconos se ocultan (`visibility`, sin cambiar el alto: CLS 0) y la búsqueda ocupa el ancho del contenido. Enfocar la búsqueda no despliega la cabecera (el campo no se mueve bajo el dedo); las sugerencias salen debajo. Medido: 360 px → búsqueda en y = 8–44; 1280 px → 80–1200 px de ancho. **Decisión final del usuario: en escritorio la cabecera NO se esconde** (logo, menú, búsqueda e iconos siempre visibles; la barra de anuncios, que no es sticky, se va al bajar y vuelve solo arriba del todo). En móvil se mantiene «solo la búsqueda». |
| Flujo de compra con el estilo de la cuenta | Carrito (lista en tarjeta), checkout (pasos activos en tarjeta con sombra; pendientes, discontinuos sin fondo), resumen y `/pedido/<id>/`: `rounded-md border-2 border-line bg-card shadow-sm`, separadores de 2 px; opciones de envío y direcciones guardadas con `bg-background` sobre la tarjeta (como los campos). Carrito en móvil: «Quitar» baja de línea (antes lo tapaba el precio dentro de la tarjeta).                                                                                                                                                                                                                                                   |

`SiteClient`: **1 500 B** (límite 1 536; queda poco margen). `CartClient`: 1 666 B.

JS tras los ajustes: `CartClient` en **1 666 B** gzip (límite 2 048) y `SiteClient` en **1 475 B** (límite 1 536). Sin bundles nuevos; el JS inline sigue dentro de su límite (`check:budget` OK).

**Cómo testear L-1:**

```bash
pnpm infra:up && pnpm --filter backend exec medusa db:migrate   # crea wishlist y wishlist_item
pnpm --filter backend test:integration:http -- integration-tests/http/deseos.spec.ts   # 4 passed
pnpm --filter storefront exec vitest run src/lib/wishlist.test.ts                    # 8 passed
# e2e (backend en marcha con EMAIL_TRANSPORT=smtp, build COMPLETO: las fichas de las correas
# no entran con STOREFRONT_MAX_PRODUCTS=100):
pnpm --filter storefront build && pnpm --filter storefront exec playwright test e2e/deseos.spec.ts  # 16 passed
```

A mano:

1. Sin sesión, pulsa ♡ en una tarjeta → «Entrar» con el aviso. Al entrar vuelves a la página y el producto ya está en `/cuenta/deseos/`.
2. Con sesión, sin JS: ♡ → aviso «Guardado…» (o «Ya estaba…»).
3. Con JS: toast sin recargar.
4. En la ficha con variantes, elige una y pulsa el ♡ junto al título: se pone rojo; con otra variante vuelve a ♡ vacío.
5. Con sesión: icono de cuenta relleno; ♡ de la cabecera relleno si hay algo guardado. El ♥ rojo de una tarjeta lleva a la lista.
6. En `/cuenta/deseos/`: «Variante: …», − / + y «Añadir».

## 6.3 L-1b ✅ Compartir la lista por enlace (14-oct-2026)

Decisiones (usuario): **S1** el enlace no caduca, se revoca; **S2** la página pública solo muestra productos, con título genérico (un título propio, más adelante); **S3** se puede añadir al carrito desde ella; **S4** no se avisa al dueño de las compras.

Fuentes: context7 `/medusajs/medusa` (guía _wishlist_, compartir; _protected-routes_) y astro-docs (rutas dinámicas on-demand).

**Desviación de la guía:** la guía firma un JWT con `http.jwtSecret` y `jwtExpiresIn` (7 días) con el id de la lista. Aquí uso un **token aleatorio** (32 bytes, base64url, 43 caracteres; `node:crypto`) guardado en `wishlist.share_token`. La columna y su índice único parcial ya estaban desde L-1, así que no hay migración. No caduca, se revoca poniéndolo a nulo y no expone ningún id.

**Backend:**

- **Pasos** `shareWishlistStep` (idempotente: si ya hay token, lo devuelve) y `unshareWishlistStep`, los dos con compensación.
- **Workflows** `shareWishlistWorkflow` (crea la lista si no existe) y `unshareWishlistWorkflow`.
- **Rutas:**
  - `POST/DELETE /store/customers/me/wishlist/share`;
  - `GET /store/customers/me/wishlist` devuelve además `share_token`;
  - `GET /store/wishlists/:token`: pública, devuelve **solo** `{ product_id, variant_id }`. Un token mal formado, desconocido o revocado da 404 (se valida con regex antes de consultar).
- **Tests HTTP** (+3, en total 7 en `deseos.spec.ts`):
  - 401 sin sesión;
  - 404 con un token malo;
  - compartir es idempotente;
  - la página pública no contiene email ni ids (`cus_`, `wl_`, `wli_`);
  - tras revocar, 404, y al volver a compartir cambia el token;
  - compartir sin lista la crea vacía.

**Storefront:**

- **`WishlistRows.astro`:** las filas son las mismas en `/cuenta/deseos/` (`editable`, con «Quitar») y en la página pública (sin «Quitar»).
- **`/cuenta/deseos/`**, bloque «Compartir mi lista» (tarjeta de la web):
  - aviso de privacidad;
  - «Crear enlace para compartir» (action `wishlist.share`, PRG);
  - el enlace en un campo de solo lectura;
  - «Dejar de compartir» (`wishlist.unshare`).
  - Con JS (`CartClient`): «Copiar enlace» (portapapeles + toast) y «Compartir…» (Web Share, solo si el navegador lo admite). Sin JS esos botones están ocultos y el enlace se copia del campo.
- **`/deseos/<token>/`:**
  - on-demand y `noindex`;
  - `private, no-store` (`/deseos/` va en `PRIVATE_PREFIXES`, con test);
  - `Referrer-Policy: same-origin`;
  - token no válido o revocado → 404;
  - título «Lista de deseos», sin datos del dueño;
  - «Variante: …», cantidad y «Añadir al carrito».
- **e2e** (+4, en total 20 en `deseos.spec.ts`):
  - sin JS: crear el enlace; otro navegador sin sesión ve la lista (`noindex`, cabeceras, sin email ni «Quitar») y añade al carrito;
  - con JS: copiar (se comprueba el portapapeles); dejar de compartir → la URL da 404.

**Móvil por la IP de la LAN** (revisión del usuario): en `http://<IP>:4321` el navegador no está en contexto seguro, así que no hay `navigator.clipboard` ni `navigator.share` y los botones no salían (medido: `isSecureContext` false). Ahora «Copiar enlace» sale siempre: usa el portapapeles o, sin él, selecciona el campo con `execCommand("copy")`, obsoleto pero la única opción sin https. «Compartir…» solo aparece con Web Share, es decir, en https y en producción.

**JS:** `CartClient` **1 833 B** gzip (límite 2 048). Sin bundles nuevos.

**Decisiones para L-2** (usuario, 14-oct): K1 abono con un job diario al consolidar el pedido (entregado, o enviado hace 14 días o más, y sin cancelar), y hasta entonces «pendiente»; K3 ningún producto excluido, con opción `sin_puntos` en la hoja; G4 el email de confirmación dice «ganarás X puntos» y, en letra pequeña, cuándo se consolidan (se quita si la gestoría lo ve comercial).

## 6.4 L-2 ✅ Puntos: backend (15-oct-2026)

**Decisiones del usuario:**

- **P1:** se consolidan a los **14 días del último envío**, aunque ya se haya entregado.
- **P2:** los puntos canjeados en un pedido **devuelto** se devuelven a mano desde el Admin. El plan para automatizarlo está más abajo.
- **P3:** widget del Admin en esta subfase.
- **P4:** redondeo al céntimo **hacia abajo**.
- Ya estaban decididos K1-K6, U1-U6, M1, M2 y G1-G8 (§0.1 y §3).

**Fuentes:**

- context7 `/medusajs/medusa`: tutorial _loyalty-points_ (aplicar y quitar como promoción, con lock), _workflows/locks_, _scheduled jobs_, subscriber de `order.canceled` y _admin widgets_.
- Código de `@medusajs/core-flows` 2.21.2:
  - `completeCartWorkflow`: hooks `validate` / `beforePaymentAuthorization` / `orderCreated`, `registerUsageStep`; el carrito del hook trae `items.adjustments.*`;
  - `cancelOrderWorkflow`: no revierte el uso de las promociones;
  - las devoluciones: `confirm-receive-return-request` emite `order.return_received` y `createAndCompleteReturn` lo emite solo con `receive_now`;
  - el modelo `fulfillment`: `shipped_at`, `canceled_at`.
- Spike L-0 (§6.1).

**Modelo** (módulo `src/modules/points`, migración aditiva `Migration20261014221841`):

- **`points_account`:** una cuenta por cliente (índice único parcial). Link de solo lectura al cliente.
- **`points_transaction`:**
  - `type` credit/debit, `amount` en € (> 0), `reference` + `reference_id`;
  - `channel` = `web` (la tienda física irá aparte, M2), `note`, `metadata`;
  - **índice único (reference, reference_id, type)**, que garantiza la idempotencia;
  - la clave foránea a la cuenta es **sin cascada** (G6: los movimientos se conservan).
- **El saldo no se guarda:** se calcula como Σ abonos − Σ cargos, así que cada saldo se puede auditar desde sus movimientos.
- **Referencias** (`lib/points.ts` `REF`):
  - `order`: abono;
  - `order_redeem`: canje;
  - `order_canceled`: devolución de lo canjeado al cancelar;
  - `return`: retirada por devolución;
  - `adjustment`: ajuste manual;
  - `account_deleted`: baja de la cuenta.

**Reglas** (`src/lib/points.ts`, funciones puras con 9 tests unitarios):

- `pointsFor` = 0,8 % al céntimo hacia abajo (con tolerancia de coma flotante: 36,25 € → 0,29).
- `accrualBase` = suma de `items.total` (con IVA, después de descuentos **incluido el de puntos** y neto de lo devuelto y recibido), sin productos `metadata.sin_puntos`.
- `isConsolidated`: sin cancelar, último envío no cancelado hace 14 días o más.
- `maxRedeemable` = `min(saldo, productos − máx(0, 0,50 − envío))`.
- `pointsDiscount`: descuento **real**, la suma de los ajustes con código `PTS-`.

**Hallazgos de Medusa 2.21.2** (comprobados en los tests):

- En un pedido, Query **no calcula `items.total`** (ni `items.quantity` en algunos casos) si no se piden también `total` o `item_total` del pedido.
- Tras recibir una devolución, `items.total` **ya queda neto** de lo devuelto (70 € devueltos → total 0 y `return_received_total` 70): no hay que restarlo otra vez.

**Workflows** (`src/workflows/points`, pasos con compensación):

- **`applyPointsWorkflow`:**
  - lock por **cliente** (`points:<customer_id>`);
  - valida: carrito propio y sin completar; importe > 0, ≤ saldo y ≤ tope;
  - crea la promoción `PTS-<24 hex>`: `fixed`, `order`, `across`, `is_tax_inclusive`, regla `customer_id`, budget de 1 uso, `metadata { points, cart_id }`;
  - quita la anterior si la había y la borra (suave);
  - la aplica con `force_refresh_payment_collection` (lección de L-0: si no, Stripe cobraría el importe viejo).
- **`removePointsWorkflow`:** quita la promoción y la borra.
- **`pointsMovementWorkflow`:** movimiento idempotente con lock por cliente. Crea la cuenta si no existe. Con `clampToBalance`, un cargo no deja el saldo negativo.

**Al completar el pedido:** el hook `validate` de `validar-carrito.ts` (el único handler de `completeCartWorkflow.hooks.validate`) comprueba que el descuento real de puntos ≤ saldo actual. Si no, error `POINTS_BALANCE_MESSAGE`. Así se cubren dos carritos del mismo cliente con el mismo saldo.

**Subscribers:**

- `order.placed`: cargo `order_redeem` por el descuento **real** del pedido.
- `order.canceled`: abono `order_canceled` por lo canjeado. Idempotente.
- `order.return_received`: si el pedido ya tenía abono, retira `abonado − puntos que genera ahora − lo ya retirado en devoluciones anteriores`, sin dejar el saldo negativo. Idempotente por `return_id`. Si aún no tenía abono, nada: el job calcula sobre lo que quede.

**Job** `points-accrue` (worker, `POINTS_ACCRUE_CRON`, por defecto `0 4 * * *`) y `pnpm --filter backend points:accrue`:

- recorre por páginas los pedidos de los últimos 120 días de clientes con cuenta;
- abona los consolidados que aún no tienen abono `order`;
- `POINTS_CONSOLIDATE_DAYS` (14).

**Limpieza:** el job de carritos (`deleteStalePointsPromotions` en `lib/stale-carts.ts`) borra en suave las promociones `PTS-` **sin usar** cuyo carrito no existe, ya está completado o está inactivo desde antes del corte. Las usadas se conservan.

**Rutas:**

| Ruta                                                        | Para qué                                                                                                                                   |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET /store/customers/me/points`                            | `{ balance, pending, transactions, count }`. `pending` = estimación de los pedidos sin cancelar y sin abonar. Paginado. Sin ids de cuenta. |
| `POST /store/carts/:id/points` `{ amount }`                 | Aplicar puntos. Sesión de cliente (middleware), zod.                                                                                       |
| `DELETE /store/carts/:id/points`                            | Quitar puntos.                                                                                                                             |
| `GET /admin/points/report` (G3)                             | Saldo vivo, cuentas con saldo, abonado, canjeado, devuelto, ajustes, perdido en bajas.                                                     |
| `GET /admin/customers/:id/points`                           | Saldo, pendiente y movimientos.                                                                                                            |
| `POST /admin/customers/:id/points` `{ type, amount, note }` | Ajuste manual. Nota obligatoria; un cargo se recorta al saldo; guarda `user_id` en `metadata`.                                             |

**Admin:**

- Widget `src/admin/widgets/customer-points.tsx` (zona `customer.details.after`): saldo, pendiente, movimientos con su concepto y formulario de ajuste.
- Sin `@medusajs/ui`, que no es dependencia directa: HTML con las clases del dashboard.
- Entra en el build del Admin. **Revisarlo a mano** (necesita sesión del Admin).

**Catálogo:** columna **`sin_puntos`** (sí/no) en `productos.csv` → `metadata.sin_puntos`, con tests en `catalog-import.unit.spec.ts` y documentada en la plantilla y su LEEME.

**Baja (G6):** `pnpm --filter backend points:close-account <cus_…>` hace un cargo `account_deleted` por todo el saldo y conserva los movimientos. Se ejecuta al tramitar la baja, que sigue siendo manual (fase 9).

**Variables nuevas:** `POINTS_ACCRUE_CRON` y `POINTS_CONSOLIDATE_DAYS`, en `apps/backend/.env.example`, `docker/compose.prod.yml` (bloque común de server y worker) y `docker/.env.prod.example`.

**Tests de integración** (`integration-tests/http/puntos.spec.ts`, 6, en total 41 en la suite):

- **canje:** baja el IVA (`tax_total` menor), tope por saldo, 401 sin sesión, 404 con carrito ajeno, sustituir (una sola `PTS-`) y quitar;
- **tope de 0,50 €:** 30,01 € con 30 € de productos da 400 con «como máximo 30,00 €»;
- **pedido:** se carga el descuento real; el segundo carrito con el mismo saldo no se completa; la limpieza conserva la promoción usada y borra la del carrito abandonado;
- **abono:** a los 13 días nada; a los 14 sí. 0,74 € = (100 € menos su parte de los 10 € canjeados) × 0,8 %, sin la línea `sin_puntos` ni el envío. Idempotente;
- **cancelar:** devuelve lo canjeado una sola vez, aunque el evento se repita, y no abona. **Devolución** de 70 € tras abonar 0,80 € → −0,56, idempotente;
- **admin:** nota obligatoria, cargo recortado al saldo, informe, 401 sin sesión del Admin.

**Probado contra el backend local:**

- abono manual de 5 €;
- carrito de 70,90 € → aplicar 3 € → 67,90 € (IVA de 6,45 a 6,17);
- pedir 6 € → «como máximo 5,00 €»;
- quitar → 70,90 €;
- `points:close-account` deja el saldo a 0, y repetirlo no hace nada.

### Plan para automatizar los puntos canjeados en pedidos devueltos (P2)

Hoy se hace a mano (widget del Admin → «Abonar», con nota). Propuesta para cuando se quiera automatizar (subfase propia, con aprobación):

1. **Regla:** al recibir una devolución, devolver la parte proporcional de lo canjeado: `canjeado × (importe devuelto de los productos / productos del pedido)`, redondeado al céntimo hacia abajo. Si se devuelve todo, se devuelve todo lo canjeado.
2. **Dónde:** el subscriber de `order.return_received` que ya existe (`points-return-received.ts`) añade un segundo movimiento `credit` con `reference: "return_redeem"` y `reference_id: return_id`, idempotente con el mismo índice único. El importe devuelto sale de los `items.return_received_total` del pedido, y lo ya devuelto en devoluciones anteriores, de la suma de los `return_redeem` previos (`metadata.order_id`), igual que ya se hace con `return`.
3. **Coordinarlo con el reembolso de Stripe:** el canje es un **descuento** (G1). Si la tienda reembolsa con Stripe lo que el cliente **pagó** por la línea devuelta (precio con descuento), devolver además los puntos de esa línea completa el importe sin pagar dos veces. Hay que confirmar con la gestoría que la factura rectificativa usa ese mismo reparto (G2).
4. **Interruptor** `POINTS_REFUND_REDEEMED_ON_RETURN` (por defecto `false`) para activarlo sin desplegar, y un test de integración: canjeo 10 € en 150 € de productos, devuelvo 70 € y se devuelven 4,66 €; una segunda devolución del resto completa los 10 €.
5. **Admin:** el movimiento aparece en el widget como «Devolución de puntos canjeados».

## 6.5 L-3 ✅ Puntos: storefront y emails (15-oct-2026)

**Decisiones del usuario:**

- **Q1:** «12,34 € en puntos». Se puede cambiar más adelante.
- **Q2:** el cliente decide, con el botón «Usar Y €» destacado.
- **Q3:** el saldo solo en «Mi cuenta» y en el checkout, que son on-demand. Nada en las islands ni en la cabecera, para no añadir JS ni datos.

**Fuentes:**

- astro-docs: actions con `accept: "form"` y PRG con el middleware (como en las fases 5 y 9).
- El patrón de emails de la fase 8.
- Las rutas y reglas de L-2. Las reglas **solo están en el backend**: el storefront presenta lo que le devuelve.

**Backend:**

- **`GET /store/carts/:id/points`** (`lib/points-cart.ts`), con sesión **opcional** (`allowUnauthenticated`):
  - devuelve `{ earn, applied, balance, max }`;
  - si el carrito no es del cliente con sesión, o no hay sesión, `balance` y `max` son `null`;
  - `max` usa la misma fórmula que `applyPointsWorkflow`.
- **`pointsSummary`** añade `order_display_id`, para mostrar «Pedido #123».
- **Email de confirmación** (`buildOrderPlacedProps`):
  - `pointsUsed` = ajustes `PTS-`; `discountTotal` = el resto de descuentos;
  - `pointsEarned`: solo con cuenta, G4;
  - `pointsDays`;
  - `itemTotal` y las líneas van **antes de descuentos** (`original_*`), así que cuadra «Productos − Descuentos − Puntos + Envío = Total».
  - `ORDER_EMAIL_FIELDS` añade `original_item_total`, `items.original_total`, `items.adjustments.*` e `items.product.metadata`.
- **`toNumber`** se mueve a `lib/numeric.ts`, para evitar el ciclo `emails` ↔ `points`. `emails.ts` lo reexporta.
- **Script `points:adjust <email|cus_…> <credit|debit> <importe> <motivo>`:**
  - es el ajuste del Admin desde la terminal; lo usan los e2e;
  - solo el cargo se recorta al saldo.

**Storefront** (0 JS nuevo: todo HTML de servidor y formularios PRG):

- **`/cuenta/puntos/`:**
  - saldo, «Y X € más cuando se consoliden…»;
  - movimientos paginados (20), con enlace al pedido; la nota solo en los ajustes;
  - «Cómo funcionan».
- **Menú y resumen de la cuenta:** «Mis puntos» en el menú y una tarjeta con el saldo en el resumen.
- **Checkout, paso 3:**
  - bloque «Usar mis puntos» (solo con sesión y algo que usar): «Tienes X €» → **«Usar Y €»** (botón principal);
  - «Usar otro importe» en un `<details>`, con importe y «Aplicar»;
  - con puntos aplicados: «Usas Z €» y «Quitar»;
  - actions `checkout.applyPoints` / `checkout.removePoints`: llaman al backend, preparan Stripe con el total nuevo y vuelven a `#pago`;
  - avisos `points_invalid`, `points_max`, `points_login`;
  - `points_changed`: el hook de L-2 al completar, clasificado en `classifyCompleteError`.
- **Resumen:**
  - con cuenta: «Con este pedido ganarás X € en puntos» y, en pequeño, cuándo se suman;
  - **invitado:** «Con una cuenta ganarías X € en puntos» y «Crear cuenta».
- **`OrderTotals.astro`:** los totales de checkout, `/pedido/<id>/` y «Mi cuenta → pedido» en un solo componente. «Productos» va antes de descuentos, luego «Descuentos», «**Puntos −X €**» (`data-points-used`), envío, total e IVA. Las líneas también van antes de descuentos.
- **Carrito (`CartView`):** si vuelves con puntos aplicados, las líneas se muestran antes del descuento, con «Puntos −X €» aparte, para que el total cuadre.

**Hallazgo de Medusa 2.21.2:** en los **pedidos**, la Store API omite `items.adjustments.code` si se pide como campo suelto (solo devuelve `amount`). Con `*items.adjustments` sí llega. En los carritos y en Query (servidor) funciona.

**Email:**

- «Puntos usados −Z €» entre los totales;
- con cuenta, «Con este pedido ganarás X € en puntos» y, en letra pequeña, «Se suman a tu saldo 14 días después del envío, si el pedido no se cancela ni se devuelve…» (G4: informativo, a revisar con la gestoría);
- `PreviewProps` actualizadas.

**Tests:**

- **Unitarios:** storefront 230 (`points.test.ts` y `points_changed`), backend 90 (props de puntos del email) y emails 17.
- **HTTP:** 41 (`GET …/points` para el dueño, un invitado, un carrito ajeno y uno que no existe).
- **e2e** `e2e/puntos.spec.ts`:
  - sin JS: invitado («ganarías»), «Mis puntos», checkout (usar el máximo → total −5 €, carrito con «Puntos», quitar, importe no válido, por encima del tope, 1,50 €);
  - con JS y Stripe test: pagar con 3 € → `/pedido/` con «Puntos −3,00 €» → email con «Puntos usados» y «ganarás» → saldo 0 y «Usados en el pedido #N».
  - En total, **166 e2e pasados** (8 omitidos: los 7 de siempre y el pago en móvil).

**JS:** sin cambios. `check:budget` OK: CartClient 1833 B, SiteClient 1500 B, sin bundles nuevos.

**Comandos para probar:**

```bash
pnpm --filter backend points:adjust <email> credit 5 "prueba"   # saldo de prueba
# /cuenta/puntos/ → checkout → «Usar 5,00 €» → pagar (4242…) → /pedido/ y Mailpit (:8025)
pnpm --filter storefront exec playwright test e2e/puntos.spec.ts
```

## 6.6 L-4 ✅ Legal y cierre (15-oct-2026)

**Decisión del usuario:** como la gestoría tardará unos días, se pone un **texto provisional** ajustado a lo que hace el programa, para no frenar la fase. Se sustituirá por el suyo (G5).

**Hecho** (0 JS: páginas estáticas):

- **`/condiciones-puntos/`** (`LegalPage` con aviso de «Texto provisional», `noindex` y fuera del sitemap en `LEGAL_PATHS`). Seis apartados con las reglas reales:
  - quién participa: solo con cuenta;
  - cómo se ganan: 0,8 % con IVA tras descuentos, sin envío ni la parte pagada con puntos; 1 punto = 1 €; redondeo hacia abajo; exclusiones; `POINTS_CONSOLIDATE_DAYS` días tras el envío;
  - cómo se usan: descuento con IVA, mínimo de 0,50 € con tarjeta, sin canje por dinero;
  - cancelaciones y devoluciones: lo canjeado en una devolución, caso por caso (P2);
  - saldo, web y tienda física: separados (M2), y la baja de la cuenta (G6);
  - cambios del programa y fraude.
  - `LegalPage` admite `filler={false}`, para no añadir el lorem.
- **Privacidad:** párrafo provisional del programa:
  - qué se guarda;
  - base: relación contractual;
  - no se usa para publicidad;
  - qué pasa al eliminar la cuenta.
- **Enlaces:** desde «Mis puntos», el bloque del checkout («Condiciones») y el pie («Programa de puntos»).
- **e2e:** «Mis puntos» → condiciones → `h1` y `noindex`.

**Para revisar con la gestoría** (cuando llegue su texto):

- condiciones y privacidad completas;
- el aviso del email de confirmación (G4);
- si la retirada por devolución y la pérdida del saldo en la baja de la cuenta son aceptables tal cual.

**Cierre:**

- **README:** §13, Fase L ✅. §4 sin cambios: no hay dependencias nuevas.
- **ESTADO:** actualizado.
- **AGENTS:** sin cambios. No hay bundles nuevos y los tamaños son los mismos (CartClient 1833 B, SiteClient 1500 B).

**Criterio de salida:**

- ✅ lista de deseos (con y sin JS, compartir);
- ✅ puntos de punta a punta: acumular, consolidar, canjear, cancelar, devolver, Admin y email;
- ✅ lint, typecheck, test y build; `check:budget`;
- ✅ 41 tests HTTP y 166 e2e.

**Comandos para testear la fase:**

```bash
pnpm infra:up && pnpm --filter backend exec medusa db:migrate   # tablas wishlist y points
pnpm lint && pnpm typecheck && pnpm test && pnpm build
pnpm --filter backend test:integration:http -- puntos.spec.ts deseos.spec.ts
pnpm --filter storefront exec playwright test e2e/puntos.spec.ts e2e/deseos.spec.ts
pnpm --filter backend points:adjust <email> credit 5 "prueba"   # saldo de prueba
pnpm --filter backend points:accrue                             # abono a mano (lo hace el job a las 4:00)
```

## 7. Plan por subfases (después de aprobar)

| Subfase                                      | Contenido                                                                                                                                                                                                                                                                                                                                                                                        | Depende de     |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------- |
| **L-0 spike** ✅ (§6.1)                      | Medir en local, contra la BD de desarrollo:<br>• si se elige P-A: instalar el plugin y comprobar `tax_total`, el recálculo del Payment Intent, la línea obsoleta al cambiar el carrito, el admin y el subscriber de gift cards;<br>• si se elige P-B: promoción `is_tax_inclusive` sobre un carrito con IVA mixto, desglose `buildTaxBreakdown` y concurrencia (lock).<br>Resultado en este doc. | §5.12, G1      |
| **L-1 lista de deseos** ✅ (§6.2)            | Backend: módulo `wishlist`, links, workflows, rutas y tests HTTP. Storefront: botón ♡ en `ProductCard` y `BuyBox`, actions `wishlist.add/remove`, flujo de entrar con `next`, `/cuenta/deseos/`, ajuste de `CartClient`, e2e con y sin JS.                                                                                                                                                       | W1-W7          |
| L-1b compartir ✅ (§6.3)                     | Token, página pública, revocar                                                                                                                                                                                                                                                                                                                                                                   | W4             |
| **L-2 puntos backend** ✅ (§6.4)             | Cuenta y movimientos (P-A o P-B), canje con tope, subscriber `order.placed` (débito), job de abono (K1) y cancelaciones y devoluciones (K5), idempotencia (K6), script de migración (M1), tests de integración                                                                                                                                                                                   | L-0, G1, M1/M2 |
| **L-3 puntos storefront y emails** ✅ (§6.5) | `/cuenta/puntos/`, bloque del checkout (PRG), `OrderSummary`, «ganarías X» para invitados, plantillas de email y campos de `ORDER_EMAIL_FIELDS`                                                                                                                                                                                                                                                  | L-2, G4        |
| **L-4 legal y cierre** ✅ (§6.6)             | Condiciones (G5), privacidad, README §4/§13, ESTADO, cierre de este doc                                                                                                                                                                                                                                                                                                                          | G5             |

Cada subfase tendrá su propio plan y confirmación (REGLA Nº 1).

## 8. Riesgos y pendientes

**Pendientes al cerrar (15-oct-2026):**

- **Textos de la gestoría:** condiciones del programa, privacidad y el aviso del email de confirmación (G4/G5). Hoy son provisionales (§6.6).
- **Automatizar la devolución de los puntos canjeados** en pedidos devueltos (P2): plan en §6.4, pendiente de aprobar.
- **Widget del Admin:** revisarlo a mano con sesión (§6.4).
- **Unificar con la tienda física** (M2) cuando exista el POS contra Medusa: `channel: "tienda"`.

**Riesgos del análisis** (ya resueltos con P-B, L-0 y L-2):

- P-A: línea de puntos obsoleta al cambiar el carrito (§3.2 ⚠️). Total 0 imposible con Stripe (U2). 4 hooks del checkout ocupados.
- P-B: una promoción por canje. Hace falta limpiar las de carritos abandonados (cabe en el job de limpieza de carritos pendiente, fase9 §7).
- Concurrencia: dos pestañas canjeando a la vez. Lock por cliente (`acquireLockStep`, como el tutorial) y comprobación del saldo **al completar**, no solo al aplicar.
- Mínimo de Stripe en EUR: comprobar el 0,50 € con el MCP de Stripe antes de L-2.
- El job de abono depende de que se marquen entregas o envíos en el admin. Si no se marca la entrega, se usa la fecha de envío + 14 días + margen.
