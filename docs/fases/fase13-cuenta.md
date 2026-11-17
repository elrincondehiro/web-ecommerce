# Fase 13 — Cuenta: baja automática (y lo que sigue)

> **Estado:** 🚧 en curso · punto 3 (baja de la cuenta) hecho
> **Rama/PR:** `feat/baja-cuenta`
> **Anterior:** [fase13-optimizacion.md](./fase13-optimizacion.md) · **Plan de puntos:** 3 baja de
> la cuenta → 4 limpieza de carritos de invitado con pago pendiente y purga de borrados → 5
> «Esperando transferencia» en «Mis pedidos» → 6 puntos canjeados en devoluciones → 7 Admin:
> pasar un pedido de invitado a una cuenta → 8 cambiar el email desde «Mis datos».

## 1. Objetivos

- [x] **3. Baja de la cuenta automática** (RGPD, art. 17): antes era una solicitud por email que la
      tienda tramitaba a mano (fase9 §7).

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

## 3. Decisiones tomadas

| Decisión                                                                                                                  | Motivo                                                                                                                          | Fuente consultada                                                                                                                           |
| ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Baja inmediata con frase escrita + contraseña, sin email de confirmación                                                  | Usuario: menos pasos que un email, pero sin clics sin querer ni gestores de contraseñas que rellenen el formulario              | —                                                                                                                                           |
| Bloquear con pedidos en curso (sin enviar o devolución abierta)                                                           | Usuario (recomendación aceptada): no quedan pedidos sin a quién avisar. «Enviado» basta: la tienda no siempre marca «entregado» | código de @medusajs/order 2.22.7 (`shipped_quantity`, `ReturnStatus`)                                                                       |
| Anonimizar la ficha además del borrado suave de Medusa                                                                    | `removeCustomerAccountWorkflow` deja nombre, email y teléfono en la fila (`deleted_at`)                                         | código de @medusajs/core-flows 2.22.7 (`deleteCustomersStep` = `softDeleteCustomers`)                                                       |
| El Admin hace la misma baja (ruta propia `DELETE /admin/customers/:id`)                                                   | Usuario. Un hook no basta: `customersDeleted` corre después del borrado y no puede bloquearlo                                   | context7 `/medusajs/medusa` (RoutesLoader: la ruta registrada después sustituye); `@medusajs/medusa` 2.22.7 `admin/customers/[id]/route.js` |
| Anonimizar el historial de emails (`notification`)                                                                        | Usuario (recomendación aceptada)                                                                                                | tipos de `@medusajs/notification` 2.22.7 (`listNotifications`/`updateNotifications`)                                                        |
| Identidad de acceso: la borra `removeCustomerAccountWorkflow` (o solo quita el `customer_id` si es también de otro actor) | Patrón oficial                                                                                                                  | context7 `/medusajs/medusa` («Delete User of Actor Type», `deleteAuthIdentityStep`, `setAuthAppMetadataStep`)                               |
| Emails en subscribers, no en el workflow                                                                                  | AGENTS §4: nada de trabajo pesado en la petición                                                                                | —                                                                                                                                           |

## 4. Cómo usarlo

- Cliente: «Mi cuenta → Eliminar mi cuenta».
- Tienda: Admin → Clientes → … → «Eliminar» (misma baja). Con pedidos en curso, el Admin muestra
  el motivo y no borra nada.
- Ver las bajas: `select id, deleted_at from customer where email like 'borrado-%';`.

## 5. Cómo testear esta fase

```bash
pnpm --filter backend exec jest --silent src/lib/__tests__/account-deletion.unit.spec.ts   # 3
TEST_TYPE=integration:http NODE_OPTIONS=--experimental-vm-modules \
  pnpm --filter backend exec jest --silent --maxWorkers=1 --forceExit integration-tests/http/baja-cuenta.spec.ts   # 4
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
- [ ] Puntos 4–8.

## 7. Pendientes / riesgos

- El JWT no se puede revocar (fase9 §7): un token robado de una cuenta ya borrada no sirve
  (`/store/customers/me` falla sin cliente), pero la cookie del navegador se borra igualmente.
- Textos de privacidad y del email de despedida: provisionales (gestoría).
- Pedidos de **invitado** con el email de la cuenta borrada: siguen como estaban (no son de la
  cuenta).
