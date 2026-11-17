# Fase 13 — Cuenta: baja automática (y lo que sigue)

> **Estado:** 🚧 en curso · puntos 3 (baja de la cuenta) y 4 (limpieza y purga) hechos
> **Rama/PR:** `feat/baja-cuenta` (3) · `feat/limpieza-carritos` (4, sobre la 3)
> **Anterior:** [fase13-optimizacion.md](./fase13-optimizacion.md) · **Plan de puntos:** 3 baja de
> la cuenta → 4 limpieza de carritos de invitado con pago pendiente y purga de borrados → 5
> «Esperando transferencia» en «Mis pedidos» → 6 puntos canjeados en devoluciones → 7 Admin:
> pasar un pedido de invitado a una cuenta → 8 cambiar el email desde «Mis datos».

## 1. Objetivos

- [x] **3. Baja de la cuenta automática** (RGPD, art. 17): antes era una solicitud por email que la
      tienda tramitaba a mano (fase9 §7).
- [x] **4. Limpieza de carritos de invitado con pago pendiente, carritos de cuenta y purga** de lo
      borrado en suave (fase10 §7).
- [x] **5. «Esperando transferencia»** en «Mis pedidos», en la ficha del pedido y en «Mi cuenta».

## 2. Qué se ha hecho

### 2.1 Baja de la cuenta

- **Storefront** (`/cuenta/eliminar/`, sin JS): el cliente **escribe** «eliminar mi cuenta» y su
  contraseña (motivo opcional). La frase evita el clic sin querer y que un gestor de contraseñas
  rellene y envíe el formulario (el campo lleva `autocomplete="off"` y las marcas de 1Password,
  LastPass y Bitwarden para que no lo toquen). Action `account.deleteAccount`: si se borra, cierra
  la sesión, quita el carrito del navegador y lleva a «Entrar» con el aviso `account_deleted`.
  Errores junto a su campo (frase, contraseña) y aviso `delete_pending` con pedidos en curso.
- **Backend**:
  - `POST /store/customers/me/delete` (sustituye a `deletion-request`): comprueba la frase y la
    contraseña (`authModuleService.authenticate("emailpass")` con el email de la identidad de la
    sesión) y lanza el workflow. Frase, contraseña o pedidos en curso → 400 con el motivo (no 401:
    el storefront lo trataría como sesión caducada).
  - Workflow `delete-account` (`workflows/delete-account/`):
    1. `validate-account-deletion`: el cliente existe y **no tiene pedidos en curso**
       (`lib/account-deletion.ts` `isPendingOrder`: sin cancelar ni cerrar y con algo sin
       **enviar** o con una devolución abierta).
    2. Puntos: si hay saldo, cargo `account_deleted` por todo (G6; los movimientos se conservan).
       Sustituye al script `points:close-account`.
    3. `anonymize-customer`: email `borrado-<id>@invalid`, sin nombre, apellidos, teléfono,
       empresa ni metadata, y **borra las direcciones** (el borrado suave del cliente las dejaría
       con los datos). Compensación: los datos de antes.
    4. `removeCustomerAccountWorkflow` de Medusa: borra (suave) el cliente y su identidad de
       acceso (contraseña). Emite `customer.deleted`.
    5. Historial de emails (`notification`): los enviados al cliente pasan al email anónimo y sin
       los datos de la plantilla (sin compensación: al final).
    6. Evento `customer.account_deleted` → subscribers (worker): email de despedida
       `account-deleted` al email que tenía la cuenta (y vuelve a anonimizar el historial después
       de enviarlo) y aviso `account-deleted-shop` a `SHOP_NOTIFY_EMAIL` (id, fecha, motivo y si
       fue desde la cuenta o el Admin; sin el email).
  - `customer.deleted` → subscribers: mascotas y fotos (Fase M), consentimientos (MK-A), avisos
    de stock (MK-B) y, nuevo, `account-customer-deleted`: **lista de deseos** y **carritos sin
    completar** del cliente (borrado suave).
  - **Admin**: `DELETE /admin/customers/:id` propio (gana a la ruta de Medusa; GET y POST siguen
    siendo los de Medusa): el botón «Eliminar» del cliente hace la misma baja, también bloqueada
    con pedidos en curso (400 con el motivo en el Admin).
- **Emails**: `account-deleted.tsx` (despedida, sin enlaces a la cuenta) y `account-deleted-shop.tsx`
  (sustituye a `account-deletion-request.tsx`).
- **Privacidad**: párrafo «Eliminar tu cuenta» (provisional, para la gestoría).
- **Se conserva**: pedidos (con su email, nombre y dirección: normativa fiscal), movimientos de
  puntos, contadores anónimos de búsquedas. Con el mismo email se puede crear una cuenta nueva.

### 2.2 Limpieza de carritos y purga (punto 4)

- **Job diario `delete-stale-carts`** (`lib/stale-carts.ts`, `CART_CLEANUP_CRON`):
  1. Carritos sin completar ni pedido e inactivos más de `CART_CLEANUP_DAYS` (30) **sin cliente o
     de invitado con email** (cliente sin cuenta): antes se borran sus **sesiones de pago**
     (`deletePaymentSessionsWorkflow`; Stripe cancela el PaymentIntent) y luego el carrito
     (suave). Un workflow por carrito con sesiones: si Stripe falla, ese carrito se salta y se
     reintenta al día siguiente (`skipped` en el log).
  2. Carritos de clientes **con cuenta**: no se borran; a los `CART_EMPTY_DAYS` (90) sin actividad
     se **vacían** (líneas y método de envío en suave, sesiones de pago borradas); el carrito queda.
  3. **Clientes sin cuenta** de esos carritos que se quedan sin pedidos ni carritos: ficha
     anonimizada (mismo paso que la baja) y `deleteCustomersWorkflow` (emite `customer.deleted`).
- **Job semanal `purge-deleted`** (`lib/purge.ts`, `PURGE_CRON`, domingos 4:00): borra **de verdad**
  lo borrado en suave hace más de `PURGE_DAYS` (90): carritos (líneas, envíos… por cascada de la
  BD), sus direcciones y filas de enlace (cobro, promociones); promociones `PTS-` sin usar; fichas
  anonimizadas (`borrado-<id>@invalid`) **sin** pedidos ni cuenta de puntos.
- Variables nuevas: `CART_EMPTY_DAYS`, `PURGE_DAYS`, `PURGE_CRON` (`.env.example`,
  `compose.prod.yml` y `.env.prod.example`). Script: `pnpm --filter backend purge:deleted`.

### 2.3 «Esperando transferencia» (punto 5)

- Backend: `GET /store/customers/me/orders/awaiting-transfer` → `{ order_ids }` (pedidos del cliente
  sin cancelar con el último pago por transferencia y sin cobrar; `lib/payment-method.ts`
  `awaitingTransfer`). Hace falta una ruta propia: `GET /store/orders` no devuelve los pagos (se
  comprobó: `payment_collections.payments` no llega) y `payment_status` es «authorized» también con
  una tarjeta sin capturar.
- Storefront: `orderStatusLabel(order, awaitingTransfer)` → «Esperando transferencia» (antes que el
  estado del envío; «Cancelado» gana). En la lista (`listAwaitingTransfer`, si falla se ve el
  estado normal), en la ficha (con los datos de la transferencia, que ya se pedían) y en la tarjeta
  «Mis pedidos» de «Mi cuenta». 0 JS.

## 3. Decisiones tomadas

| Decisión                                                                                                                  | Motivo                                                                                                                                   | Fuente consultada                                                                                                                           |
| ------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Baja inmediata con frase escrita + contraseña, sin email de confirmación                                                  | Usuario: menos pasos que un email, pero sin clics sin querer ni gestores de contraseñas que rellenen el formulario                       | —                                                                                                                                           |
| Bloquear con pedidos en curso (sin enviar o devolución abierta)                                                           | Usuario (recomendación aceptada): no quedan pedidos sin a quién avisar. «Enviado» basta: la tienda no siempre marca «entregado»          | código de @medusajs/order 2.22.7 (`shipped_quantity`, `ReturnStatus`)                                                                       |
| Anonimizar la ficha además del borrado suave de Medusa                                                                    | `removeCustomerAccountWorkflow` deja nombre, email y teléfono en la fila (`deleted_at`)                                                  | código de @medusajs/core-flows 2.22.7 (`deleteCustomersStep` = `softDeleteCustomers`)                                                       |
| El Admin hace la misma baja (ruta propia `DELETE /admin/customers/:id`)                                                   | Usuario. Un hook no basta: `customersDeleted` corre después del borrado y no puede bloquearlo                                            | context7 `/medusajs/medusa` (RoutesLoader: la ruta registrada después sustituye); `@medusajs/medusa` 2.22.7 `admin/customers/[id]/route.js` |
| Anonimizar el historial de emails (`notification`)                                                                        | Usuario (recomendación aceptada)                                                                                                         | tipos de `@medusajs/notification` 2.22.7 (`listNotifications`/`updateNotifications`)                                                        |
| Identidad de acceso: la borra `removeCustomerAccountWorkflow` (o solo quita el `customer_id` si es también de otro actor) | Patrón oficial                                                                                                                           | context7 `/medusajs/medusa` («Delete User of Actor Type», `deleteAuthIdentityStep`, `setAuthAppMetadataStep`)                               |
| Emails en subscribers, no en el workflow                                                                                  | AGENTS §4: nada de trabajo pesado en la petición                                                                                         | —                                                                                                                                           |
| Carritos de invitado con email: mismo plazo que los sin cliente (30 días)                                                 | Usuario                                                                                                                                  | —                                                                                                                                           |
| Antes de borrar el carrito, borrar sus sesiones de pago                                                                   | Stripe cancela el PaymentIntent al borrar la sesión; `deletePaymentSessionsWorkflow` falla si alguna no se borra (el carrito no se toca) | código de @medusajs/core-flows y @medusajs/payment-stripe 2.22.7                                                                            |
| Carritos de cuenta: vaciar a los 90 días                                                                                  | Usuario: si no han comprado en 90 días, precios y stock habrán cambiado                                                                  | —                                                                                                                                           |
| Purga definitiva a los 90 días de borrado                                                                                 | Usuario                                                                                                                                  | —                                                                                                                                           |
| Borrar (anonimizada) la ficha del cliente sin cuenta sin pedidos ni carritos                                              | Usuario (recomendación aceptada): guarda el email del checkout                                                                           | —                                                                                                                                           |
| Filas de enlace de carritos borradas por SQL en la purga                                                                  | `link.dismiss` también es suave; son tablas de enlace sin lógica                                                                         | código de @medusajs/link-modules 2.22.7                                                                                                     |

## 4. Cómo usarlo

- Cliente: «Mi cuenta → Eliminar mi cuenta».
- Tienda: Admin → Clientes → … → «Eliminar» (misma baja). Con pedidos en curso, el Admin muestra
  el motivo y no borra nada.
- Ver las bajas: `select id, deleted_at from customer where email like 'borrado-%';`.

- Limpieza a mano: `CART_CLEANUP_DAYS=30 pnpm --filter backend carts:cleanup`; purga:
  `pnpm --filter backend purge:deleted`. **Ojo en dev:** la limpieza cancela los PaymentIntents de
  la cuenta de test de Stripe de cada carrito de invitado (en la BD de dev hay cientos).

## 5. Cómo testear esta fase

```bash
pnpm --filter backend exec jest --silent src/lib/__tests__/account-deletion.unit.spec.ts   # 3
TEST_TYPE=integration:http NODE_OPTIONS=--experimental-vm-modules \
  pnpm --filter backend exec jest --silent --maxWorkers=1 --forceExit integration-tests/http/baja-cuenta.spec.ts   # 4
TEST_TYPE=integration:http NODE_OPTIONS=--experimental-vm-modules \
  pnpm --filter backend exec jest --silent --maxWorkers=1 --forceExit integration-tests/http/limpieza.spec.ts   # 3 (punto 4)
# punto 5: pagos.spec.ts («transferencia…») y e2e transferencia.spec.ts
pnpm --filter storefront exec vitest run src/lib/account.test.ts
# e2e sin JS (backend con EMAIL_TRANSPORT=smtp): cuenta.spec.ts → «eliminar la cuenta…»
pnpm --filter storefront exec playwright test cuenta --project escritorio
```

Resultado (17-nov-2026): unit backend 205, storefront 384, emails 35; HTTP 103; e2e 346 (las 6
que fallaron la primera vez eran del `.env` local con `UMAMI_URL` de un Umami apagado; con el
build sin Umami pasan). En Mailpit: «Hemos eliminado tu cuenta» y «Un cliente ha eliminado su
cuenta»; en la BD, la ficha con `borrado-…@invalid` y ningún email en `notification` con el email
antiguo.

## 6. Criterio de salida

- [x] Baja desde la cuenta y desde el Admin, bloqueada con pedidos en curso, con tests HTTP y e2e
      sin JS.
- [x] Limpieza de carritos (invitado con email, cuenta vaciada, clientes sin cuenta) y purga, con
      tests HTTP.
- [x] «Esperando transferencia» (punto 5), con test HTTP y e2e.
- [ ] Puntos 6–8.

## 7. Pendientes / riesgos

- El JWT no se puede revocar (fase9 §7): un token robado de una cuenta ya borrada no sirve
  (`/store/customers/me` falla sin cliente), pero la cookie del navegador se borra igualmente.
- Textos de privacidad y del email de despedida: provisionales (gestoría).
- Pedidos de **invitado** con el email de la cuenta borrada: siguen como estaban (no son de la
  cuenta).
