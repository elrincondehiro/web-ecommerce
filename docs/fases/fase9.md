# Fase 9 — Cuenta de cliente

> **Estado:** ✅ completada (10-oct-2026)
> **Rama/PR:** `feat/cuenta` · PR #32 (`d27945b`)
> **Anterior:** [Fase 8](./fase8.md) · **Siguiente:** [Auditoría previa a la fase 10](./auditoria-pre-fase10.md)

## 1. Objetivos

- [x] Registro (solo email + contraseña) con **verificación de email obligatoria**.
- [x] Entrar / salir; sesión de **7 días** en cookie httpOnly; el carrito de invitado pasa a la cuenta.
- [x] El carrito **sigue a la cuenta** entre dispositivos y tras salir/entrar (opción a: si el navegador ya tiene carrito, gana ese).
- [x] Recuperar contraseña (`/cuenta/recuperar/` → email → `/cuenta/restablecer/?token=`).
- [x] «Mi cuenta» en la cabecera (enlace fijo; la cabecera sigue estática).
- [x] Mis datos (nombre, apellidos, teléfono) y «Cambiar contraseña» (envía el enlace de restablecer, opción a).
- [x] Direcciones guardadas (añadir, editar, borrar, predeterminada).
- [x] Mis pedidos (listado + detalle solo del dueño).
- [x] Checkout con sesión: email y dirección rellenados, elegir dirección guardada, «Guardar en mi cuenta».
- [x] Email de **bienvenida** y **solicitud de baja** (email a la tienda, `SHOP_NOTIFY_EMAIL`).
- [x] Enlace «Ver mi pedido» en el email de pedido (solo clientes con cuenta).
- [x] Todo sin JS (formularios + Astro Actions + PRG); **0 KB de JS nuevo**.

Fuera de esta fase (decisión del usuario, 09-oct-2026): formas de pago guardadas (ni Stripe Link ni `account holder` de Medusa) y programa de puntos (ver §7).

## 2. Qué se ha hecho

### 2.1 Flujo de Medusa 2.21.2 (probado con curl antes de programar)

Con `http.authVerificationsPerActor.customer = [{ entity_type: "email", auth_provider: "emailpass" }]`:

1. `POST /auth/customer/emailpass/register { email, password }` → token sin actor. Si la identidad ya existe (otro cliente o un admin con ese email): 401 «Identity with email already exists».
2. `POST /auth/customer/emailpass` → `{ verification_required: true, token }` mientras el email no esté confirmado.
3. `POST /auth/verification/request { entity_id: email, entity_type: "email" }` con ese token como Bearer → evento `auth.verification_requested` → email `verify-email` (fase 8). Cada solicitud **invalida el código anterior**.
4. `POST /auth/verification/confirm { code }` (sin autenticar) → `verified_at`; reutilizar el código → 400.
5. Login → token con `actor_id: ""` → `POST /store/customers { email }` con ese token (crea el cliente con `has_account`, emite `customer.created`) → **login de nuevo** (token con `actor_id`). La guía de Medusa recomienda volver a entrar en lugar de `auth.refresh`.

Otros comportamientos verificados en el código instalado:

- `POST /auth/customer/emailpass/update` solo acepta el **token de restablecer** (`purpose: "reset"`, un solo uso, 15 min; `validate-token.js`): no sirve para cambiar la contraseña con la sesión → opción a.
- `POST /auth/customer/emailpass/reset-password` responde **201 «Created» en texto** exista o no la cuenta (`throwOnError: false`). `client.fetch` del SDK lo intenta leer como JSON; hay que usar `sdk.auth.resetPassword`, que pide `accept: text/plain`.
- `GET /store/orders/:id` **no comprueba el dueño** (cualquiera con el id lo lee). `/cuenta/pedidos/<id>/` compara el `customer_id` del pedido con el del cliente y responde 404 si no coinciden.
- `GET /store/orders` filtra por el `actor_id` del token.
- `POST /store/carts/:id/customer` (`transferCart`) asocia el carrito al cliente; la Store API no devuelve `customer_id` del carrito, pero el pedido sí queda asociado.
- `updateCartWorkflow`: un cliente con cuenta puede cambiar el email del carrito.
- `validateAndTransformBody` de Medusa **rechaza campos fuera del esquema** (400).

### 2.2 Backend (`apps/backend`)

- `medusa-config.ts`: `http.jwtExpiresIn: "7d"` (también el Admin) y `authVerificationsPerActor.customer`.
- `src/workflows/request-account-deletion.ts`: comprueba que el cliente existe (`useQueryGraphStep`) y emite `customer.deletion_requested` (no borra nada).
- `src/api/store/customers/me/deletion-request/route.ts` → `POST` (202). La sesión la exige Medusa (`/store/customers/me*`); el id sale del token. Body `{ reason?: string ≤ 500 }` validado en `src/api/middlewares.ts`.
- `src/api/store/customers/me/carts/route.ts` → `GET` `{ cart_id }`: el carrito sin completar **más reciente con artículos** del cliente (últimos 10 por `updated_at`; filtra por los canales de la publishable key). Medusa 2.21.2 no tiene ruta de la Store API para listar los carritos de un cliente.
- Subscribers:
  - `customer-created-email.ts`: bienvenida si `has_account` (no en compras de invitado). Clave `welcome/<customer_id>`.
  - `account-deletion-requested-email.ts`: email `account-deletion-request` a `SHOP_NOTIFY_EMAIL` (sin variable: aviso en el log, sin datos del cliente).
- `src/lib/emails.ts`: `orderUrl` = `<storefront>/cuenta/pedidos/<id>/` si `customer.has_account` (campo añadido a `ORDER_EMAIL_FIELDS`); `accountUrl`, `accountOrderUrl`.
- Test de integración `integration-tests/http/cuenta.spec.ts` (5): sin verificar no hay sesión; flujo completo de verificación; `GET /me/carts` (401 sin sesión; devuelve el más reciente con artículos, no el vacío ni el de un invitado); la baja exige sesión, rechaza campos extra y emite el evento con el id del token. El proyecto usa `event-bus-redis`, así que el test espía `eventBus.emit` (`TestEventUtils` solo vale para el bus en memoria).

### 2.3 Emails (`packages/emails`)

- `welcome.tsx` («¡Bienvenido a El Rincón de Hiro!», botón «Ir a mi cuenta»).
- `account-deletion-request.tsx` (interno: id, email, fecha y motivo; recuerda el plazo del RGPD).
- `order-placed.tsx`: el botón «Ver mi pedido» ya existía (opcional) y ahora apunta a la cuenta.

### 2.4 Storefront (`apps/storefront`)

- **Sesión** (`src/middleware.ts`): lee la cookie `customer_token` y pone `locals.customerToken` si el JWT es de un cliente creado y no ha caducado. Lo comprueba **sin red**, leyendo el payload; la firma la valida Medusa en cada petición. Las actions `account.*` siempre responden 303 (PRG) con el aviso en la cookie `account_flash` (1 min, `Path=/cuenta/`).
- **SDK** (`src/lib/medusa.ts`): `auth: { type: "jwt", jwtTokenStorageMethod: "nostore" }` en la instancia compartida, para que **nunca guarde un token**. Las funciones de cuenta pasan `Authorization: Bearer` en cada petición.
- **Lógica pura** (`src/lib/account.ts`, con tests): rutas, cookies, avisos, lectura del JWT, `safeNext` (sin redirecciones abiertas), validación de formularios (contraseña de 8 caracteres o más con letras y números; dirección con las reglas del checkout), `orderStatusLabel` y `sameAddress`.
- **Actions** (`src/actions/account.ts`): `register`, `login`, `logout`, `verify`, `recover`, `reset`, `profile`, `password`, `addressSave`, `addressDelete`, `addressDefault`, `deleteRequest`.
- **Carrito y cuenta** (opción a):
  - al entrar, si el navegador tiene un carrito vivo, pasa a ser del cliente (`transferCart`); si no lo tiene (u otro dispositivo, o tras salir), se carga el último carrito de la cuenta (`GET /store/customers/me/carts`) en la cookie `cart_id`;
  - con sesión, `cart.add` crea el carrito **ya asociado** al cliente (`createCart` con el Bearer): así sigue a la cuenta aunque no llegue al checkout;
  - «Salir» borra `cart_id` del navegador (ordenador compartido); el carrito sigue en la cuenta.
- **Páginas** (on-demand, `private, no-store`, `noindex`; con `CartClient` como el resto de la tienda: el icono abre el panel):
  - `/cuenta/entrar/`, `/cuenta/registro/`, `/cuenta/recuperar/`;
  - `/cuenta/restablecer/?token=`;
  - `/cuenta/verificar/?token=`: confirma con un **botón** (POST), no al abrir la página, porque los escáneres de enlaces del correo gastarían el código;
  - `/cuenta/`, `/cuenta/datos/`, `/cuenta/direcciones/` (`?editar=<id>`), `/cuenta/pedidos/` (`?pagina=`), `/cuenta/pedidos/[id]/` y `/cuenta/eliminar/`.
- **Componentes** `src/components/account/`: `AccountLayout` (menú + «Cerrar sesión»), `AccountNotice`, `AuthCard`, `PasswordField` y `SavedAddressForm`. `Field.astro` admite `id` para poder tener varios formularios en una página.
- **Cabecera**: icono `user` (Phosphor) → `/cuenta/`, y «Mi cuenta» en el menú móvil. Es estática e igual para todos.
- **Checkout** (`pages/checkout/index.astro`, `actions/checkout.ts`):
  - con sesión, propone la dirección predeterminada (o `?direccion=<id>`) y el email de la cuenta;
  - al enviar los datos: `transferCart` y, si se marca la casilla, guarda la dirección si no la tiene ya;
  - sin sesión: enlace «¿Tienes cuenta? Entra» con `?next=/checkout/`.
- e2e `e2e/cuenta.spec.ts` (escritorio y móvil):
  - sin JS: registro → verificar (enlace leído de Mailpit) → entrar → salir; datos + dirección → checkout rellenado; recuperar contraseña (enlace de un solo uso); el carrito sigue a la cuenta (tras salir y en un navegador nuevo);
  - con JS: en las páginas de cuenta el icono del carrito abre el panel.
  - `interficie.spec.ts` actualizado: «Mi cuenta» ahora existe.

## 3. Decisiones tomadas

| Decisión                                                           | Motivo                                                                                                                                                   | Fuente consultada                                                                 |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Verificación de email obligatoria                                  | Evita cuentas falsas y emails mal escritos (usuario, 09-oct)                                                                                             | context7 `/medusajs/medusa` (verify-account, `authVerificationsPerActor`, v2.16+) |
| Registro solo con email + contraseña; datos en «Mis datos»         | Con la verificación el cliente se crea en el primer login: no hay dónde guardar el nombre (la guía usa `localStorage`, prohibido por AGENTS §3.2)        | guía verify-account («Option A»)                                                  |
| JWT en cookie httpOnly; el servidor de Astro hace de intermediario | Sin tokens en el navegador; sin JS                                                                                                                       | AGENTS §3.2; js-sdk 2.21.2 (`nostore`, cabeceras por petición)                    |
| Sesión de 7 días (`jwtExpiresIn`), también para el Admin           | Usuario (09-oct)                                                                                                                                         | context7 (medusa-config `http.jwtExpiresIn`)                                      |
| «Salir» borra la cookie (el JWT no se puede revocar)               | Medusa no tiene revocación de JWT; caduca a los 7 días                                                                                                   | —                                                                                 |
| Cambiar contraseña = enviar el enlace de restablecer (opción a)    | `/update` solo acepta tokens de reset; una ruta propia sería código de seguridad nuestro                                                                 | código de `@medusajs/medusa` 2.21.2 (`validate-token.js`)                         |
| Confirmar el email con un botón (POST)                             | Los escáneres de enlaces abren el GET y gastarían el código                                                                                              | —                                                                                 |
| `Referrer-Policy: same-origin` en verificar/restablecer            | El token no sale a otros sitios; `no-referrer` hace que Chromium mande `Origin: null` en el POST y `checkOrigin` de Astro responde 403 (visto en el e2e) | astro-docs (`security.checkOrigin`)                                               |
| Mismo aviso exista o no la cuenta (registro, recuperar)            | No revelar qué emails están registrados                                                                                                                  | —                                                                                 |
| Baja = solicitud por email a la tienda (`SHOP_NOTIFY_EMAIL`)       | Usuario (09-oct): automatizar más adelante                                                                                                               | —                                                                                 |
| Bienvenida en `customer.created` + `has_account`                   | El evento también sale en las compras de invitado                                                                                                        | core-flows 2.21.2                                                                 |
| Detalle del pedido: comparar `customer_id`                         | `GET /store/orders/:id` no comprueba el dueño                                                                                                            | código de `@medusajs/medusa` 2.21.2                                               |
| Cabecera con icono fijo (no «Hola, Ana»)                           | Sigue estática y cacheable; 0 JS                                                                                                                         | usuario (09-oct)                                                                  |
| Sin dependencias nuevas                                            | —                                                                                                                                                        | —                                                                                 |

## 4. Cómo usarlo

```bash
pnpm infra:up && pnpm dev            # Mailpit en http://localhost:8025
# http://localhost:4321/cuenta/registro/ → email de verificación en Mailpit → Entrar
```

Variable nueva del backend (`.env.example`): `SHOP_NOTIFY_EMAIL` (avisos internos; hoy, solicitudes de baja). En desarrollo: `jacknoddy@gmail.com`; en producción será un buzón de la empresa (`tienda@` o `attcliente@elrincondehiro.com`).

## 5. Cómo testear esta fase

### 5.1 Automático

```bash
pnpm lint && pnpm format:check && pnpm typecheck && pnpm test   # storefront 151, emails 14, backend 34
STOREFRONT_DATA=fixtures pnpm build && pnpm --filter storefront check:budget   # OK, sin bundles nuevos
pnpm --filter backend test:integration:http -- cuenta            # 5 tests
# e2e (infra + backend con EMAIL_TRANSPORT=smtp + build del storefront):
STOREFRONT_MAX_PRODUCTS=100 pnpm --filter storefront build
pnpm --filter storefront exec playwright test e2e/cuenta.spec.ts   # 10 (escritorio + móvil)
```

### 5.2 Resultados (09-oct-2026, local)

- `e2e/cuenta.spec.ts`: 10/10. Con `cuenta`, `carrito`, `checkout` y `sugerencias`: 51 pasan, 3 se saltan (checkout con Stripe) y fallan los 2 de `carrito` 169, que ya fallaban en `main`.
- La suite completa dio 5 fallos que también salían en `main`. **Corrección (auditoría pre-fase 10 §4.7):** venían del entorno (`medusa develop` reiniciándose a mitad de suite y stock agotado), no del código; con el backend estable, la suite completa da 97/97.
- Prueba manual con curl (sin JS), contra `pnpm dev`:
  - registro, reenvío al entrar sin verificar, confirmar, bienvenida, datos, dos direcciones, cambio de predeterminada, editar y borrar una ajena (error);
  - checkout rellenado y pedido pagado (Stripe test) que aparece en «Mis pedidos», con el email «Ver mi pedido» → `/cuenta/pedidos/<id>/`; un pedido de otro cliente da 404;
  - «Cambiar contraseña» (email), baja (email a `SHOP_NOTIFY_EMAIL`), salir (borra `customer_token` y `cart_id`);
  - recuperar (mismo aviso exista o no la cuenta), restablecer (enlace de un solo uso) y entrar con la contraseña nueva;
  - POST de otro origen → 403; `?next=//evil.test/` → `/cuenta/`.

## 6. Criterio de salida

- [x] Todos los flujos funcionan sin JS y pasan los e2e.
- [x] 0 KB de JS nuevo (`check:budget` sin cambios).
- [x] Ningún token, contraseña ni email en logs ni en el navegador (cookies httpOnly, logs sin datos personales).
- [x] Revisión del usuario en el navegador y PR con `quality` en verde (PR #32).

## 7. Pendientes / riesgos

- **Programa de puntos** (fase propia, tras producción). Regla de la tienda física: el **0,8 %** de cada compra en puntos; 1 punto = 1 € de descuento, con decimales (0,15 puntos = 0,15 €), para usar o acumular. Hoy se calcula con un script diario en un POS que desaparecerá, así que **no hay que integrarlo**. Encaja con el **Store Credit** del `@medusajs/loyalty-plugin` 2.21.2 (MIT, compatible): un subscriber de `order.placed` (o mejor al capturar el pago o entregar el pedido) abona el 0,8 % al saldo del cliente, y en el checkout se aplica con `addStoreCreditsToCartWorkflow` (todo o parte). Faltan por decidir el momento del abono (¿al entregar? ¿y las devoluciones?), la caducidad y la parte legal (condiciones).
- **Formas de pago guardadas**: descartadas por ahora (ni Stripe Link ni `account holder`).
- **Limpieza de carritos** (fase 10/11): Medusa 2.21.2 **no** borra los carritos sin completar (no hay job en `@medusajs/medusa`); en la BD local hay 835, 764 sin completar. Hace falta un scheduled job propio: borrar los de invitado sin completar con más de N días (p. ej. 30) y, los de clientes, más tiempo o vaciarlos.
- **Carrito abandonado** (fase de marketing, con los puntos): tutorial oficial _abandoned-cart_ de Medusa: job diario → carritos con email, sin completar y sin cambios en 24 h → email (React Email + `resend-notification`) → `metadata.abandoned_notification`. Es **comunicación comercial** (LSSI/RGPD): consentimiento o baja + mención en privacidad (consultar a la gestoría). El enlace del email abre el carrito en cualquier dispositivo (ya posible con esta fase).
- **Más datos del cliente** (cuando el usuario pase la lista): campos propios de Medusa (`company_name`, `phone`…), `metadata` para datos simples y no sensibles sin búsquedas, o un **módulo propio** + `defineLink` para datos con reglas o informes (p. ej. mascotas). En el storefront: un `Field` en «Mis datos» + su regla en `parseProfileForm`. NIF/CIF → mejor en la dirección de facturación; fecha de nacimiento para felicitaciones = comunicación comercial.
- **Lista de deseos**: alternativa a una "lista de carritos" (no se hace; un carrito por cuenta).
- La baja es manual: automatizar el borrado/anonimizado (workflow con compensación; los pedidos se conservan por obligación fiscal).
- El JWT no se puede revocar: tras «salir», un token robado vale hasta 7 días. Mitigación: cookie httpOnly + `SameSite=Lax` + `Secure`; en el futuro, una lista de revocación o sesiones de Medusa.
- Cambiar el email de la cuenta: no está (exigiría verificar el nuevo).
- Rate limiting de entrar, registro y recuperar en Caddy/Cloudflare (AGENTS §10, fase 11).
- `SHOP_NOTIFY_EMAIL`, las variables de email y la verificación también en el **worker** (fases 10/11).
- ~~Los 5 e2e que fallaban en `main`~~ → resuelto (entorno), ver la auditoría pre-fase 10.
