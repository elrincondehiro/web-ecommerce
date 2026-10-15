# Fase P — Códigos descuento

> **Estado:** ✅ completada (15-oct-2026)
> **Rama/PR:** `feat/faseP-codigos` · PR propia
> **Anterior:** [Fase L](./faseL-deseos-puntos.md) · **Siguiente:** fase 11 (producción en Hetzner, ESTADO §6.5)

## 0.1 Decisiones del usuario

|            | Decisión                                                                                                                                                                   |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Quién      | Solo **clientes con cuenta** (con la sesión iniciada).                                                                                                                     |
| Cuántos    | **Un código por pedido.** Uno nuevo sustituye al anterior.                                                                                                                 |
| Con puntos | **Se combinan.** El código va primero y los puntos después, y siempre quedan ≥ 0,50 € por pagar.                                                                           |
| Q1         | Orden de Medusa con códigos en % (ver §2): **opción A**, aceptarlo y **avisarlo en las condiciones de compra** («el sistema aplica primero el descuento de mayor valor…»). |
| Q2         | Si al añadir un código los puntos ya no caben, **se recortan al nuevo máximo y se avisa** («Hemos ajustado tus puntos…»).                                                  |
| Q3         | El nombre del código se muestra en los resúmenes y en el email: «Código HIRO10 −X €».                                                                                      |
| Q4         | Si se cancela un pedido, **se devuelve el uso del código**.                                                                                                                |

## 1. Objetivos

- [x] Spike P-0 contra la BD de test.
- [x] P-1 backend:
  - ruta propia;
  - la ruta estándar de promociones cerrada;
  - comprobación al completar el pedido;
  - tope de puntos tras el código;
  - recorte de los puntos;
  - devolución del uso al cancelar;
  - tests.
- [x] P-2 storefront (0 JS nuevo):
  - bloque «Código descuento» en el pago;
  - «Código X −Y €» en checkout, carrito, pedido y «Mi cuenta»;
  - el email;
  - e2e.
- [x] P-3: guía del Admin (§3), condiciones de compra (provisional) y documentación.

## 2. Spike P-0 (BD de test aislada, `medusaIntegrationTestRunner`)

**Fuentes:**

- context7 `/medusajs/medusa`: conceptos de promociones, reglas `customer.groups.id`, presupuestos de campaña y `addPromotions`.
- Código de Medusa 2.21.2:
  - `computeActions` y `revertUsage` del módulo de promociones;
  - `calculateAdjustmentAmountFromPromotion`;
  - `registerUsageStep` de `completeCartWorkflow`;
  - los validadores de la Store API.

| Prueba                                                                    | Resultado                                                                                                                                                                                                                         |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Código 10 % + 5 € de puntos (100 €)                                       | Primero el código (−10 €) y luego los puntos (−5 €).                                                                                                                                                                              |
| Código 10 % + 20 € / 50 € de puntos                                       | **Primero los puntos** y el 10 % sobre lo que queda (−8 € / −5 €). Medusa ordena por `application_method.value` de mayor a menor (`order: { application_method: { value: "DESC" } }` y `sortByBuyGetType`), sin distinguir % y €. |
| Orden en que se aplican                                                   | Da igual: se recalcula todo en cada cambio.                                                                                                                                                                                       |
| Dos códigos                                                               | **Medusa aplica los dos** → hay que impedirlo.                                                                                                                                                                                    |
| Código inexistente                                                        | 400 «The promotion code X is invalid».                                                                                                                                                                                            |
| **Caducado, agotado o ya usado por el cliente**                           | **200 sin aplicar nada ni avisar** → hay que comprobarlo antes, en seco.                                                                                                                                                          |
| Límite total (`usage`) y por cliente (`use_by_attribute` + `customer_id`) | Funcionan. Con el límite por cliente, otro cliente sí puede usarlo.                                                                                                                                                               |
| **Cancelar el pedido**                                                    | **No devuelve el uso** (`used` sigue en 1): `cancelOrderWorkflow` no llama a `revertUsage`.                                                                                                                                       |
| **Invitado con `POST /store/carts/:id/promotions`**                       | **Lo aplica** → hay que cerrar la ruta (también `promo_codes` al crear o actualizar el carrito).                                                                                                                                  |
| Caduca después de aplicarlo                                               | Desaparece al siguiente cambio del carrito.                                                                                                                                                                                       |

**Mínimo de 0,50 € en cualquier orden.** El tope de puntos se calcula sobre `original_item_total − descuento del código **solo**`.

- Ese «código solo» se obtiene con `computeActions` en seco, sin ajustes previos, y es el descuento **máximo** del código.
- Si Medusa aplica antes los puntos, el % descuenta menos y el total solo sube.
- Comprobado en el test de integración: 30 € de productos, `PCT10` y 27 € de puntos → código −0,30 € y total 4,95 € (el envío).

## 3. Guía: crear códigos en el Admin de Medusa

Admin → **Promociones** → **Crear promoción**:

1. **Tipo:** «Cantidad fija» (€) o «Porcentaje», sobre el **pedido** («Order»). Sobre productos concretos solo si la campaña lo pide: elige los productos o categorías en las reglas de «Elementos».
2. **Código** en **MAYÚSCULAS**, sin espacios: letras, números, `-` y `_`, de 2 a 40 caracteres. Ejemplo: `HIRO10`.
   - El cliente puede escribirlo en minúsculas: la tienda lo pasa a mayúsculas.
   - **No empieces ningún código por `PTS-`**: está reservado para los puntos.
3. **Importe fijo:** marca **«Impuestos incluidos»**, para que 5 € sean 5 € con IVA.
4. **Método:** **manual (con código)**. **Nunca «automática»**: no lleva código y se aplicaría a todo el mundo, invitados incluidos.
5. **Clientes especiales:** crea un grupo de clientes («VIP»), añade a esos clientes y pon en la promoción la regla «Grupo de clientes = VIP». Así el código solo vale para ellos.
6. **Campaña** (opcional; para fechas o límites):
   - **fechas** de inicio y fin;
   - **presupuesto «Uso»** = número máximo de usos en total (por ejemplo, los 100 primeros);
   - **presupuesto «Uso por atributo»** con atributo `customer_id` = usos por cliente (por ejemplo, 1).
7. **Estado:** «Activa». Para pausar un código, ponlo en «Borrador».

Desde la terminal, para pruebas: `pnpm --filter backend codes:create <CODIGO> <pct|eur> <valor> [usos_total] [por_cliente]`. Es idempotente, con IVA incluido y sobre el pedido.

## 4. Qué se ha hecho

### Backend (`apps/backend`)

**Reglas** (`src/lib/codes.ts`, funciones puras con tests):

- `normalizeCode` (mayúsculas, formato, sin `PTS-`);
- `codeDiscount` y `customerCodes`;
- `itemsAfterCode`;
- `CODE_MESSAGES` (español).

**Productos para los puntos** (`src/lib/points-room.ts`):

- `pointsRoom` calcula el descuento del código **solo** con `computeActions` en seco (no toca el carrito ni registra usos);
- `maxForRoom` = tope de puntos.
- Lo usan `validateRedeemStep` (aplicar puntos) y el `GET /store/carts/:id/points`, que ahora también devuelve `code` y `code_amount`.

**Workflows** (`src/workflows/codes`):

- `applyCodeWorkflow`:
  - lock `points:<cliente>`, el mismo que los puntos;
  - `validateCodeStep`: carrito propio y sin completar, cliente **con cuenta**, código existente, activo y no automático;
  - **en seco**, que daría descuento: si no, «no se puede usar en este pedido…»;
  - quita el código anterior y aplica con `force_refresh_payment_collection`.
- `removeCodeWorkflow`.

**Ruta `POST/DELETE /store/carts/:id/code`** (sesión de cliente, zod):

- **Con puntos aplicados:** los quita, aplica el código y los vuelve a poner **recortados** al nuevo máximo → `points_adjusted` (Q2). Si el código falla, los restaura.
- **Por qué los quita antes:** con unos puntos que cubren todo, Medusa descartaría el código sin error, porque los aplica primero.

**Store API estándar cerrada** (`src/api/middlewares.ts`): 403 en `/store/carts/:id/promotions` y en `promo_codes` al crear o actualizar el carrito. Los puntos se aplican por dentro, con workflows, y no les afecta.

**Al completar el pedido** (hook `validate` de `validar-carrito.ts`): como mucho **un** código y solo **con cuenta**. Los códigos salen de `items.adjustments`, porque el carrito del hook no trae `promotions.code`.

**Cancelación** (`subscribers/codes-order-canceled.ts`): `revertUsage` con las mismas acciones que registró `completeCartWorkflow`. Es idempotente con `order.metadata.code_usage_reverted` (Q4).

**Email:** `discountCode` y `discountCodeAmount` en `buildOrderPlacedProps`; «Descuentos» queda para lo demás.

**Script** `codes:create` (§3).

**Hallazgo:** como en los pedidos (L-3), Query **no calcula los totales de las líneas** de un carrito (`subtotal`, `original_total`) si no se pide también un total del carrito (`total` / `item_total`).

### Storefront (`apps/storefront`, 0 JS nuevo)

**Checkout, paso 3:** bloque **«Código descuento»** antes de «Usar mis puntos».

- **Sin sesión:** «Entra en tu cuenta…».
- **Con sesión:** campo y «Aplicar»; con un código, «Código X: −Y €» y «Quitar».
- Nota: «Un código por pedido. Se puede combinar con tus puntos. Condiciones».
- **Actions** `checkout.applyCode` / `checkout.removeCode` (PRG, preparan Stripe con el total nuevo).
- **Avisos de error:** `code_invalid`, `code_not_applied`, `code_login`, `code_one`.
- **Avisos informativos** (`role=status`, en el paso de pago): `points_adjusted` / `points_removed`.

**Resúmenes:** «Código X −Y €» (`data-code-used`) en `OrderTotals` (checkout, `/pedido/`, «Mi cuenta») y en el carrito (`CartView`).

**Condiciones de compra** (`/condiciones/#codigos`, provisional):

- solo con cuenta;
- uno por pedido;
- condiciones de cada código;
- combinables con puntos (mínimo 0,50 € con ajuste avisado);
- **el orden** (el descuento de mayor valor primero, Q1);
- cancelación;
- no canjeables por dinero.

### Emails (`packages/emails`)

Línea «Código X −Y €» en la confirmación del pedido. `PreviewProps` con código y puntos.

## 5. Cómo testear esta fase

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build      # 233 + 93 + 18 unitarios
pnpm --filter backend test:integration:http -- codigos.spec.ts   # 3 (44 en total)
pnpm --filter backend codes:create HIRO10 pct 10                 # código de prueba
pnpm --filter storefront exec playwright test e2e/puntos.spec.ts # incluye Fase P (sin JS y con Stripe)
```

**A mano:**

1. Con cuenta y saldo, en el checkout aplica `hiro10` y luego «Usar Y €».
2. El resumen muestra «Código HIRO10» y «Puntos».
3. Paga con 4242: el email de Mailpit trae las dos líneas.
4. **Sin sesión:** «Entra en tu cuenta para usar un código».

## 6. Criterio de salida

- [x] Un código por pedido y solo con cuenta, con dos barreras: la ruta y la comprobación al completar. La API estándar está cerrada.
- [x] Avisos claros para los códigos caducados, agotados o ya usados, aunque Medusa no avise.
- [x] Código + puntos: ≥ 0,50 € en cualquier orden, con recorte avisado.
- [x] La cancelación devuelve el uso.
- [x] 44 tests HTTP, 171 e2e (9 omitidos), `check:budget` OK.

## 7. Pendientes / riesgos

- **Texto de las condiciones** (provisional) para la gestoría, junto al resto.
- **Rate limiting** de `POST /store/carts/:id/code` (que no puedan ir probando códigos): en Cloudflare, fase 11. Mientras tanto exige sesión, y cada intento queda limitado por el lock por cliente.
- Si algún día hacen falta **promociones automáticas** (sin código), hay que revisar `checkCodes`, que solo mira códigos manuales, y que no se apliquen a invitados.
- **Códigos sobre el envío** (`target_type: shipping_methods`): no se han probado. Las reglas del tope solo tienen en cuenta los productos. No los crees sin revisarlo.
