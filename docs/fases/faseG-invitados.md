# Fase G — Pedidos de invitado → cuenta

> **Estado:** ✅ completada (21-oct-2026)
> **Rama/PR:** `feat/faseG-invitados` · PR #…
> **Anterior:** [Fase 11](./fase11.md) · **Siguiente:** —

Medusa 2.21.2 guarda la compra sin cuenta en un cliente aparte (`has_account = false`). Al registrarse con el mismo email se crea **otro** cliente (`has_account = true`) y los pedidos de invitado se quedan en el primero: no salen en «Mis pedidos» ni dan puntos (context7 `/medusajs/medusa`, _customer-accounts_: «The guest customer's orders stay linked to the guest customer»).

## 1. Objetivos

- [x] **G-0** spike: comportamiento real de Medusa (tests de integración).
- [x] **G-1** enlace automático con el **mismo email**: al crear la cuenta y al comprar sin entrar (C1); puntos con interruptor; insignia «Añadido a tu cuenta».
- [x] **G-2** reclamar un pedido hecho con **otro email** (nº de pedido + email → email de confirmación al email del pedido → aceptar/rechazar). Bloquear `POST /store/orders/:id/transfer/request`. Job que caduca las solicitudes.
- [x] **G-3** asignación manual desde la terminal (`orders:assign`); botón en el Admin más adelante.
- [x] **G-4** cierre (README §13, ESTADO, PENDIENTES, texto de privacidad para la gestoría).

## 0. Decisiones del usuario (21-oct-2026)

| #   | Decisión                                                                                                                                                                                        |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Prueba de propiedad en tres niveles: P1 mismo email → automático (G-1); P2 otro email → reclamación con email (G-2); P3 email perdido → manual (G-3).                                           |
| D2  | Cliente con cuenta que compra sin entrar (C1): automático al hacer el pedido.                                                                                                                   |
| D3  | Al aceptar una reclamación, el pedido **pasa al email de la cuenta**. Si hay disputa, se revierte desde el Admin.                                                                               |
| D4  | Puntos retroactivos **sí**, con interruptor `POINTS_RETROACTIVE`. Los pedidos posteriores a la cuenta (C1) dan puntos siempre.                                                                  |
| D5  | Ventana del abono configurable: `POINTS_ACCRUE_LOOKBACK_DAYS` (120 por defecto).                                                                                                                |
| D6  | Aviso: insignia «Añadido a tu cuenta» en «Mis pedidos» (opción b).                                                                                                                              |
| D7  | G-3 como script; botón del Admin más adelante.                                                                                                                                                  |
| D8  | G-2: solo se reclaman pedidos de **invitado**; nunca se transfieren pedidos entre cuentas. Respuesta **siempre igual** (exista o no el pedido, coincida o no el email, sea o no de una cuenta). |
| D9  | No se borra la ficha de invitado (G-0b): para el cliente es transparente y evita tratar cancelados y carritos a medias.                                                                         |     |

## 2. Qué se ha hecho

### G-0 — Spike (`integration-tests/http/invitados.spec.ts`)

| Prueba                                                        | Resultado (Medusa 2.21.2)                                                                                                                                                                                                                                          |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| C1 sin ficha de invitado previa                               | El pedido sin sesión va a la **cuenta**.                                                                                                                                                                                                                           |
| C1 con ficha de invitado previa                               | Va **siempre al invitado** (3/3; `findOrCreateCustomerStep` busca por email sin filtrar `has_account` y coge la ficha más antigua). También con el email en mayúsculas (Medusa lo pasa a minúsculas).                                                              |
| Transferencia por el backend (solicitud + aceptación)         | Funciona leyendo el token de `order_change.actions.details.token`. Historial `transfer` / `confirmed` con la `description` que se pasa; `update_order_email` cambia `order.email`; sale en `GET /store/orders`; el job de puntos lo abona.                         |
| Vuelta atrás                                                  | `transferOrderToGuestWorkflow` lo devuelve al invitado con su email.                                                                                                                                                                                               |
| Solicitud pendiente                                           | **Bloquea** cualquier otro cambio del pedido («already has an existing active order change»): p. ej. empezar una devolución. Cancelarla lo libera → G-2 necesita caducidad.                                                                                        |
| `POST /store/orders/:id/transfer/request` con un pedido ajeno | **200**: la ruta estándar deja pedir un pedido de OTRA cuenta conociendo su id (sale en `/pedido/<id>/`). No se acepta sin token, pero bloquea el pedido (fila anterior) → G-2 la cierra con un middleware (403), como `/store/carts/:id/promotions` en la Fase P. |
| Eventos                                                       | `order.transfer_requested` también en las transferencias automáticas (el email de G-2 tendrá que saltarse las `auto:`).                                                                                                                                            |

### G-0b — ¿Convertir o borrar la ficha de invitado? (pregunta del usuario)

Ver §3.1. Probado: tras pasar sus pedidos y **borrar en suave** la ficha de invitado, el siguiente pedido sin sesión va **directo a la cuenta**. Un carrito a medias de esa ficha da **404** al actualizarlo («Customer with id … was not found»).

### G-1 — Enlace automático con el mismo email

- **Reglas** `apps/backend/src/lib/guest-orders.ts` (puras, con tests): motivos `auto:mismo-email` / `auto:manual`, marca `metadata.cuenta_vinculada`, `POINTS_RETROACTIVE`, `POINTS_ACCRUE_LOOKBACK_DAYS`, `earnsPoints`.
- **Workflow** `linkOrderToAccountWorkflow` (`src/workflows/guest-orders/`): valida (pedido de invitado, sin cancelar, destino con cuenta y, con `auto:mismo-email`, mismo email) → `requestOrderTransferWorkflow` (con `update_order_email`) → token → `acceptOrderTransferWorkflow` → marca en la metadata (paso compensable).
- **Subscribers**: `guest-orders-account-created` (`customer.created` con cuenta → todos sus pedidos de invitado) y `guest-orders-order-placed` (C1).
- **Script** `pnpm --filter backend orders:link-guests [dry-run]` para los datos que ya existen (idempotente).
- **Puntos**: `points-accrue.ts` y el «pendiente» de `points-summary.ts` respetan `POINTS_RETROACTIVE` (con `false`, los pedidos de antes de la cuenta no dan puntos ni se prometen) y la ventana `POINTS_ACCRUE_LOOKBACK_DAYS`.
- **Email de confirmación**: si hay una cuenta con el email del pedido, se escribe como para la cuenta (puntos que ganará, enlace a «Mis pedidos»), aunque el pedido aún esté en la ficha de invitado (los dos subscribers de `order.placed` van en paralelo).
- **Storefront**: insignia «Añadido a tu cuenta» en `/cuenta/pedidos/` (`wasLinkedToAccount`, 0 JS; `metadata` en `ORDER_LIST_FIELDS`). El historial (`order_change`) no se puede pedir desde la Store API: por eso la marca va en `order.metadata`.
- **Variables** (`apps/backend/.env.example`, `docker/compose.prod.yml` en el bloque común de server y worker, `docker/.env.prod.example`): `POINTS_ACCRUE_LOOKBACK_DAYS=120`, `POINTS_RETROACTIVE=true`.

### G-2 — Reclamar un pedido hecho con otro email

- **Backend**
  - `POST /store/customers/me/order-claims` `{ display_id, email }` → **202 siempre** (`lib/guest-orders-claim.ts`). Solo crea la solicitud si el pedido es de un **invitado**, sin cancelar, con ese email y sin otra solicitud pendiente; tope de 3 pendientes por cliente. Si el email es el de la propia cuenta, lo pasa directamente (como G-1). Usa `requestOrderTransferWorkflow` con `description: "reclamacion"` y `update_order_email` (D3).
  - **Cerradas** con 403 `POST /store/orders/:id/transfer/request` y `…/cancel` (middleware, como `/promotions` en la Fase P). `accept` / `decline` siguen abiertas: exigen el token.
  - `GET /store/order-transfers/:id?token=` → `{ display_id, requested_by: "a***@example.com" }` o 404: lo mínimo para la página (no se usa `GET /store/orders/:id`, que devuelve el pedido entero a quien sepa el id).
  - Subscriber `order-transfer-requested-email` (`order.transfer_requested`): email `order-transfer` al email **del pedido** con el enlace `/cuenta/transferir/?pedido=…&token=…`; se salta las automáticas (`auto:`). También sirve para «Transfer ownership» del Admin.
  - Job `order-transfer-expire` (worker, `ORDER_TRANSFER_EXPIRE_CRON`, 4:15): cancela las pendientes de más de `ORDER_TRANSFER_TTL_DAYS` (7) días (bloquean el pedido, G-0).
- **Emails**: plantilla `packages/emails/src/order-transfer.tsx` (nº de pedido, email enmascarado, plazo; texto plano).
- **Storefront** (0 JS, PRG):
  - `/cuenta/pedidos/`: `<details id="reclamar">` «¿Hiciste un pedido sin iniciar sesión?» con nº + email → action `account.claimOrder` → aviso genérico `claim_sent`.
  - `/cuenta/transferir/` (on-demand, `noindex`, `Referrer-Policy: same-origin`, sin sesión): botones «Sí, añadirlo a esa cuenta» / «No, rechazar» (POST, como `verificar`: los escáneres de correo abren los enlaces) → actions `account.acceptTransfer` / `declineTransfer` → rutas estándar `accept` / `decline`. Bajo `/cuenta/` para la cookie flash.
- **Variables**: `ORDER_TRANSFER_TTL_DAYS=7`, `ORDER_TRANSFER_EXPIRE_CRON="15 4 * * *"` (`.env.example`, `compose.prod.yml`, `.env.prod.example`).

### G-3 — Asignación manual

- Script `pnpm --filter backend orders:assign <nº pedido> <email|cus_…> <motivo…> [dry-run]` (`src/scripts/orders-assign.ts`): el cliente ya no controla el email del pedido y la tienda lo ha comprobado a mano. Mismo workflow (`auto:manual`): solo pedidos de **invitado** sin cancelar; el motivo va en la **nota interna** del order change (solo Admin); el pedido pasa al email de la cuenta. No registra emails ni el motivo.
- Deshacer: Admin → pedido → transferir a invitado. Entre cuentas: «Transfer ownership» del Admin (D10).

### G-4 — Cierre

- `/privacidad/`: párrafo «Pedidos sin iniciar sesión» (**provisional**, para la gestoría).
- README §13, `docs/ESTADO.md` y `docs/PENDIENTES.md` al día. README §4 sin cambios: no hay dependencias nuevas.

## 3. Decisiones tomadas

| Decisión                                                                  | Motivo                                                                                                         | Fuente                                                                             |
| ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Transferencia oficial (order change) y no `updateOrders({ customer_id })` | Queda en el historial del Admin y se deshace con «transferir a invitado».                                      | context7 `/medusajs/medusa` (_order transfer_, _transfer-to-guest_); spike G-0     |
| Solicitud + aceptación dentro de un workflow (`runAsStep`)                | Si algo falla tras la solicitud, la compensación del workflow oficial la borra (no queda el pedido bloqueado). | context7 (_execute another workflow_); core-flows 2.21.2 (`createOrderChangeStep`) |
| Marca en `order.metadata`                                                 | La Store API no deja pedir `order_change`; `metadata` sale por defecto.                                        | `@medusajs/medusa` 2.21.2 `api/store/orders/query-config.js`                       |
| Email de confirmación: «tiene cuenta» = existe cuenta con ese email       | Evita la carrera entre los dos subscribers de `order.placed`.                                                  | Spike G-0 (C1 con ficha previa)                                                    |
| Sin retroactivos: corte por `customer.created_at`                         | Sin metadata extra; reversible (al volver a encenderlo, se abonan los de la ventana).                          | —                                                                                  |

### 3.1 Análisis G-0b: convertir o borrar la ficha de invitado

| Opción                                                          | Viable                                                                                                                                                                                                                                                               |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Convertir** el invitado en cuenta (`has_account = true`)      | **No** de forma soportada: `updateCustomers` y `updateCustomersWorkflow` no aceptan `has_account` (docs). Por SQL chocaría con el índice único `(email, has_account)` porque la cuenta ya existe; y el registro de Medusa siempre crea un cliente nuevo. Descartado. |
| **Borrar en suave** la ficha de invitado tras pasar sus pedidos | **Sí** (`softDeleteCustomers`, reversible con `restoreCustomers`). Probado (G-0b): los pedidos siguientes sin sesión van directos a la cuenta; se acaba el «ir y volver».                                                                                            |
| **No hacer nada** (solo el subscriber C1)                       | Funciona: cada pedido sin sesión hace un viaje invitado → cuenta en segundos (una entrada más en el historial del Admin, invisible para el cliente).                                                                                                                 |

Efectos del borrado que hay que tratar (pendiente de decisión del usuario):

1. **Carritos a medias** de esa ficha: dan 404 al actualizarse. Solución: antes de borrar, quitar su `customer_id` (al poner el email, Medusa encuentra la cuenta).
2. **Pedidos cancelados** de la ficha: no se pueden transferir (Medusa lo impide) y quedarían apuntando a un cliente borrado (el pedido conserva su email). Opciones: no borrar si quedan pedidos, o aceptarlo.
3. **Vuelta atrás desde el Admin** («transferir a invitado» con el mismo email): con la ficha borrada, Medusa encuentra la cuenta y lo rechaza («Only guest customers are allowed»). Habría que revertir con otro email o con un script.
4. Direcciones o grupos de cliente de la ficha de invitado: normalmente no tiene (comprobar).

## 4. Cómo usarlo

```bash
pnpm --filter backend orders:link-guests dry-run   # cuántos pedidos de invitado hay por pasar
pnpm --filter backend orders:link-guests           # pasarlos (idempotente)
pnpm --filter backend orders:assign 1042 ana@example.com "Comprobado por teléfono" dry-run
pnpm --filter backend orders:assign 1042 ana@example.com "Comprobado por teléfono"
# Variables: POINTS_RETROACTIVE (true), POINTS_ACCRUE_LOOKBACK_DAYS (120),
#            ORDER_TRANSFER_TTL_DAYS (7), ORDER_TRANSFER_EXPIRE_CRON ("15 4 * * *")
# El cliente: Mis pedidos → «¿Hiciste un pedido sin iniciar sesión?» (nº + email del pedido).
```

## 5. Cómo testear esta fase

```bash
pnpm --filter backend test                                   # unitarios (guest-orders.unit.spec.ts)
pnpm --filter backend test:integration:http -- invitados     # 12 tests (G-0 a G-3)
pnpm --filter backend test:integration:http                  # suite completa: 56/56
pnpm --filter storefront test                                # wasLinkedToAccount, parseClaimForm
pnpm --filter emails test                                    # plantilla order-transfer
# e2e (backend con EMAIL_TRANSPORT=smtp, pnpm infra:stripe, build + pnpm start):
pnpm --filter storefront exec playwright test e2e/invitados.spec.ts   # G-1 y G-2 sin JS
pnpm --filter storefront test:e2e                                     # completa: 189 ✓, 11 omitidos
```

## 6. Criterio de salida

- [x] G-0 documentado y convertido en tests.
- [x] G-1: pedidos de invitado con el mismo email en la cuenta al crearla y al comprar sin entrar; puntos con interruptor y ventana; insignia.
- [x] G-2: reclamar con otro email, aceptar/rechazar, rutas estándar cerradas, caducidad.
- [x] G-3: `orders:assign` con nota interna; nunca pedidos de otra cuenta.
- [x] G-4: privacidad (provisional), README §13, ESTADO, PENDIENTES.
- [x] Batería completa en verde (§5).

## 7. Pendientes / riesgos

- Ficha de invitado: **no se borra** (D9, §3.1).
- Rate limiting en Cloudflare de `POST /cuenta/pedidos/?_action=account.claimOrder` (y de `/store/customers/me/order-claims` en `api.`), como el resto de formularios de cuenta (fase 11).
- «Transfer ownership» del Admin entre cuentas: **permitido** (D10). El email de aceptación va al email del pedido.
- Botón en el Admin para la asignación manual (hoy `orders:assign`).
- Gestoría: texto de privacidad «Pedidos sin iniciar sesión» (provisional).
- VPS de pruebas: tras desplegar, `orders:link-guests dry-run` y luego sin `dry-run`.
- Gestoría: texto de privacidad «los pedidos hechos con tu email se asocian a tu cuenta».
