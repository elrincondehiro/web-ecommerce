# Fase 8 — Emails

> **Estado:** ✅ completada (09-oct-2026; probada con Mailpit y con Resend)
> **Rama/PR:** `feat/emails` · PR en Gitea (`feat/emails` → `main`)
> **Anterior:** [Fase D](./faseD-diseno.md) · **Siguiente:** Fase 9 (cuenta de cliente)

## 1. Objetivos

- [x] `packages/emails` con React Email: plantillas de **pedido**, **envío**, **restablecer contraseña** y **confirmar email (registro)**, siempre con texto plano y `PreviewProps`.
- [x] Proveedor de notificaciones propio `resend-notification` (canal `email`): Resend o, en desarrollo, Mailpit, según `EMAIL_TRANSPORT`.
- [x] Subscribers (en el worker): `order.placed`, `shipment.created`, `auth.password_reset`, `auth.verification_requested`.
- [x] Email de pedido con **IVA desglosado** por tipo (21 / 10 / 4 %).
- [x] Sin duplicados (`idempotency_key` en Medusa y `idempotencyKey` en Resend).
- [x] Envío de prueba con Resend (`delivered@resend.dev` y un buzón real, §5.4).

## 2. Qué se ha hecho

**`packages/emails`** (nuevo, `"name": "emails"`)

- `src/order-placed.tsx`, `order-shipped.tsx`, `password-reset.tsx`, `verify-email.tsx`: cada una exporta el componente (`default`), `subject()`, su tipo de props y `PreviewProps`.
- `src/_components/` (`Layout`, `ui`, `blocks`) y `src/_lib/` (`theme`, `format`, `tax`, `types`): con `_` para que `email dev` no las muestre como plantillas.
- `src/index.ts`: `renderEmail(id, props)` → `{ subject, html, text }`, `isTemplateId`, `previewProps`, `buildTaxBreakdown` y los tipos.
- Compilado con `tsc` a `dist/` en CommonJS (`tsconfig.build.json`); `prepare` lo genera en cada `pnpm install`, así que el CI y Docker lo tienen antes del `typecheck`.
- Tests (Vitest, `src/emails.test.ts`): las 4 plantillas generan HTML y texto, desglose de IVA, escapado de datos del cliente.
- Logo para emails: `apps/storefront/public/email/logo.png` (240×224, 19 KB, PNG; generado desde `src/assets/marca/logo.png`).
- Pie común: aviso «correo automático, no respondas» (no hay reply-to), datos legales **provisionales** (lorem ipsum) y enlaces a condiciones, privacidad y aviso legal.

**Backend**

- `src/modules/resend-notification/` (`index.ts`, `service.ts`, `transport.ts`): `AbstractNotificationProviderService`, `identifier = "resend-notification"`, `validateOptions`. Renderiza con `renderEmail` y envía `html` + `text`. Con `smtp` carga `nodemailer` con `import()` (devDependency) y lo **prohíbe en producción**.
- `medusa-config.ts`: Notification Module solo si hay `EMAIL_TRANSPORT` (obligatorio en producción), con `notification-local` para el canal `feed` (panel del Admin) y `resend-notification` para `email`; `admin.storefrontUrl` = `STOREFRONT_URL`.
- `src/lib/emails.ts`: datos de Medusa → props (totales, IVA por tipo desde `tax_lines`, dirección con el país en español, líneas del envío, seguimiento, URLs de reset y verificación). Funciones puras, con tests.
- `src/subscribers/`:
  - `_email.ts` (utilidades; Medusa ignora los ficheros con `_`): `sendEmail()` con `idempotency_key`, `linksFrom()`, `hashKey()`.
  - `order-placed-email.ts` → `order-placed` (clave `order-placed/<order_id>`).
  - `shipment-created-email.ts` → `order-shipped`; respeta `no_notification` (casilla del Admin); clave `order-shipped/<fulfillment_id>`.
  - `password-reset-email.ts` → `password-reset`: cliente → `<storefront>/cuenta/restablecer/?token=` (página de la fase 9); usuario del Admin → `<backend>/app/reset-password?token=` (ya funciona).
  - `verification-requested-email.ts` → `verify-email`: `<storefront>/cuenta/verificar/?token=<code>` (página de la fase 9).
- Tests unitarios: `src/lib/__tests__/emails.unit.spec.ts` y `src/modules/resend-notification/__tests__/service.unit.spec.ts` (transporte simulado).

**Otros**: `pnpm dev:emails` (raíz), `apps/backend/.env.example`, README §4.3, §8.5, §9, §13 y §14, AGENTS §1, §4 y §5.

## 3. Decisiones tomadas

| Decisión                                                                                                                                                                        | Motivo                                                                                                                                                                         | Fuente consultada                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| **React Email 6 sin `@react-email/components`**: componentes y `render` desde `react-email` 6.11.0; previsualización con `@react-email/ui` 6.11.0 (devDependency, trae Next 16) | `@react-email/components` 1.0.12 y sus subpaquetes están marcados como obsoletos en npm; la guía de actualización a la 6.0 dice que se quiten. Decisión del usuario (opción A) | context7 `/resend/react-email` (updating-react-email, cli, monorepo pnpm) + `pnpm view … deprecated` |
| Versiones: las de README §4 / `package.json` (`resend` 6.31.0, `react-email` 6.11.0), no las últimas                                                                            | Las menores las sube Renovate (decisión del usuario)                                                                                                                           | —                                                                                                    |
| React **18.3.1** en `emails` (la misma que el Admin de Medusa)                                                                                                                  | `react-email` y `render` aceptan `^18 \|\| ^19`; una sola copia de React en el lockfile                                                                                        | `pnpm view … peerDependencies`                                                                       |
| `emails` compilado a CJS (`dist/`) con `prepare`                                                                                                                                | El backend es CommonJS (`module: Node16`); así funciona en `medusa develop`, `medusa build`, Jest y CI sin tocar su tsconfig                                                   | prueba local (`medusa build`, jest, `pnpm install` limpio)                                           |
| `EMAIL_TRANSPORT` = `smtp` (Mailpit) / `resend`; sin valor no se registra el módulo                                                                                             | Elegido por variable (usuario); CI y tests sin emails, como Stripe/Meilisearch/S3                                                                                              | context7 `/medusajs/medusa` (Notification Module, providers, `channels`)                             |
| `nodemailer` 10.0.16 solo como **devDependency**, cargado con `import()`                                                                                                        | Solo hace falta en desarrollo (aprobado por el usuario); `smtp` en producción falla al arrancar                                                                                | README de nodemailer                                                                                 |
| Proveedor propio que recibe `template` + `data` y renderiza él                                                                                                                  | El subscriber no conoce HTML; el patrón de la guía de Resend de Medusa                                                                                                         | context7 `/medusajs/medusa` (integrations/guides/resend)                                             |
| Idempotencia: `idempotency_key` de Medusa (no reenvía si ya salió bien; reintenta los fallidos) + `idempotencyKey` de Resend (24 h)                                             | Los eventos pueden repetirse; comprobado: reemitir `order.placed` no envía un segundo email                                                                                    | código de `@medusajs/notification` 2.21.2 + MCP resend-docs (send-with-nodejs)                       |
| Claves de reset/verificación = hash del token (`hashKey`)                                                                                                                       | Ni el token ni el email en la BD de notificaciones ni en Resend                                                                                                                | —                                                                                                    |
| `notification-local` para `feed`                                                                                                                                                | Al configurar el módulo se sustituye la config por defecto de Medusa (que lo trae)                                                                                             | `@medusajs/utils` 2.21.2 (`define-config.js`)                                                        |
| Remitente `El Rincón de Hiro <pedidos@develop.hirobordercollie.es>`, **sin reply-to**                                                                                           | El dominio solo envía (SPF, DKIM, DMARC ya en Cloudflare); el pie avisa de no responder                                                                                        | usuario                                                                                              |
| Logo PNG en `<EMAIL_ASSETS_URL>/email/logo.png` (por defecto, el storefront). `EMAIL_ASSETS_URL` es una **base**, no la URL de un fichero                                       | Recurso de marca versionado; Gmail/Outlook no muestran SVG ni bien WebP; en prod sale por la CDN de Cloudflare                                                                 | usuario                                                                                              |
| IVA desglosado por tipo: base = total − IVA, agrupado por la suma de `tax_lines[].rate`, envío incluido                                                                         | Precios con IVA incluido; redondeo por grupo                                                                                                                                   | context7 `/medusajs/medusa` (order totals)                                                           |
| El email de pedido **no** enlaza a `/pedido/<id>/`                                                                                                                              | Esa página solo muestra datos con la cookie `last_order` (fase 5, P7); el historial llega con la cuenta (fase 9)                                                               | fase5.md                                                                                             |
| Reset y verificación: plantillas + subscribers ya (opción b); páginas del storefront y `authVerificationsPerActor` en la fase 9                                                 | El reset del Admin funciona ya; se prueba con `curl`                                                                                                                           | context7 `/medusajs/medusa` (reset password, email verification) + core-flows 2.21.2 (TTL 15 min)    |
| Enlace de verificación solo con `?token=<code>` (sin email)                                                                                                                     | `POST /auth/verification/confirm` solo pide `code`; el email es un dato personal                                                                                               | `@medusajs/medusa` 2.21.2 (`validators.js`)                                                          |
| `pnpm dev` no arranca la previsualización (script `preview` del paquete, `pnpm dev:emails` en la raíz)                                                                          | `pnpm dev` sigue siendo backend + storefront                                                                                                                                   | —                                                                                                    |

## 4. Cómo usarlo

```bash
pnpm dev:emails                          # previsualización: http://localhost:3001
pnpm --filter emails build               # tras cambiar una plantilla (el backend usa dist/)
pnpm --filter emails test

# apps/backend/.env (desarrollo con Mailpit)
EMAIL_TRANSPORT=smtp
EMAIL_FROM="El Rincón de Hiro <pedidos@develop.hirobordercollie.es>"
SMTP_HOST=localhost
SMTP_PORT=1025
STOREFRONT_URL=http://localhost:4321
# Mailpit: http://localhost:8025

# Con Resend (prueba real)
EMAIL_TRANSPORT=resend
RESEND_API_KEY=re_...                    # nunca en git ni en logs
EMAIL_ASSETS_URL=https://…               # URL pública para que el logo se vea fuera de tu máquina
```

Nueva plantilla: `src/<id>.tsx` con `default`, `subject` y `PreviewProps` → registrarla en `templates` y `TemplateProps` de `src/index.ts` → `sendEmail(container, { template: "<id>", … })` en un subscriber.

## 5. Cómo testear esta fase

### 5.1 Automático

```bash
pnpm lint && pnpm format:check && pnpm typecheck && pnpm test
STOREFRONT_DATA=fixtures pnpm build && pnpm --filter storefront check:budget
# emails: 11 tests · backend: 33 tests (2 suites nuevas)
```

### 5.2 Previsualización

```bash
pnpm dev:emails     # http://localhost:3001 → 4 plantillas (order-placed, order-shipped, password-reset, verify-email)
```

### 5.3 Envío real a Mailpit (resultados del 09-oct-2026)

```bash
pnpm infra:up && pnpm dev:backend                     # con EMAIL_TRANSPORT=smtp
# Reset de contraseña (usuario del Admin):
curl -X POST localhost:9000/auth/user/emailpass/reset-password -H 'Content-Type: application/json' \
  -d '{"identifier":"<email del admin>"}'
# → "Restablece tu contraseña" en http://localhost:8025, enlace a /app/reset-password?token=…

# Verificación de email (cliente nuevo):
TOKEN=$(curl -s -X POST localhost:9000/auth/customer/emailpass/register -H 'Content-Type: application/json' \
  -d '{"email":"prueba@example.com","password":"Prueba-1234-x"}' | jq -r .token)
curl -X POST localhost:9000/auth/verification/request -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -d '{"entity_id":"prueba@example.com","entity_type":"email"}'
# → "Confirma tu email para activar tu cuenta", enlace a /cuenta/verificar/?token=…

# Pedido: completar un checkout (fase 5) → "Hemos recibido tu pedido n.º N" con IVA desglosado.
# Envío: Admin → pedido → Preparar → Marcar como enviado (con n.º de seguimiento) →
#        "Tu pedido n.º N está en camino". Sin la casilla "Enviar notificación", no se envía.
```

Resultados: las 4 plantillas llegan a Mailpit con HTML y texto. Pedido 68: 19,95 € + 4,95 € de envío = 24,90 €, «IVA 21 % sobre 20,58 € → 4,32 €». Volver a emitir `order.placed` **no** envía un segundo email (idempotencia). La comprobación de HTML de Mailpit da un 0,9 % de propiedades no soportadas. Ningún log contiene emails ni tokens.

### 5.4 Envío con Resend

1. En `apps/backend/.env`: `EMAIL_TRANSPORT=resend`, `RESEND_API_KEY=re_…` (clave con permiso solo de envío) y, si quieres ver el logo en un buzón real, `EMAIL_ASSETS_URL` con la **base** pública de los recursos (el logo se pide en `<base>/email/logo.png`; copia ahí `apps/storefront/public/email/logo.png`).
2. `pnpm dev:backend` y lanzar el reset de 5.3 con `identifier` = un admin cuyo email sea `delivered@resend.dev` o tu buzón.
3. Comprobar en el panel de Resend (Emails) que sale como **Delivered** y, en tu buzón, que llega a la bandeja de entrada.

Resultados (09-oct-2026): las 4 plantillas enviadas por el Notification Module con `EMAIL_TRANSPORT=resend` a `delivered@resend.dev` y a un Gmail real (8 envíos, estado `success`), más el flujo real `POST /auth/user/emailpass/reset-password` → subscriber → Resend. **Todo llegó correctamente** a la bandeja de entrada (confirmado por el usuario).

## 6. Criterio de salida

- [x] Previsualización de las 4 plantillas (`pnpm dev:emails`).
- [x] Envío de prueba a Mailpit de las 4 plantillas desde los eventos reales.
- [x] Envío de prueba con Resend (§5.4).
- [x] lint, format, typecheck, test, build y presupuesto en local; el CI `quality` del PR lo comprueba de nuevo.

## 7. Pendientes / riesgos

- **Fase 9**: páginas `/cuenta/restablecer/` y `/cuenta/verificar/` del storefront y `http.authVerificationsPerActor.customer` (registro pendiente hasta confirmar). El email del pedido podrá enlazar al historial de la cuenta.
- **Pie legal**: sustituir el lorem ipsum (razón social, NIF, dirección) por los datos de la gestoría (`packages/emails/src/_components/Layout.tsx`).
- **Producción (fases 10/11)**: `EMAIL_TRANSPORT=resend`, `RESEND_API_KEY`, `EMAIL_FROM`, `STOREFRONT_URL` y `EMAIL_ASSETS_URL` en **server y worker** (los subscribers corren en el worker). Dominio de envío definitivo (hoy `develop.hirobordercollie.es`).
- **Resend Free**: 100 emails/día y 3.000/mes; los envíos a `@resend.dev` también cuentan.
- **Rebotes y quejas**: sin webhook de Resend todavía (cuando haya volumen, para dejar de escribir a direcciones que rebotan).
- `pnpm install` es más pesado por `@react-email/ui` (Next 16, ~235 MB). Solo devDependency de `emails`: no entra en las imágenes de producción (`pnpm deploy --prod`).
- El build del storefront en local sin backend falla en el prerender (`fetch failed`); es lo de siempre: usar `STOREFRONT_DATA=fixtures` o arrancar el backend.
