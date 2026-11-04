# Fase MK — Marketing respetuoso

> **Estado:** 🚧 en curso: MK-A hecha (4-nov-2026); MK-B a MK-F pendientes.
> **Rama/PR:** `feat/marketing-comunicaciones` (MK-A) · PR #…
> **Anterior:** [Fase CS — caja de snacks](./faseCS-caja-snacks.md)

## 0. Qué es y orden (decisión del usuario, 4-nov-2026)

Marketing **poco invasivo**: nada de mendigar reseñas y el email de carrito abandonado como última opción. Todo
email comercial depende de un consentimiento expreso y tiene baja de un clic.

| Subfase | Contenido                                                                                                                                                                                                                                         | Estado |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| MK-A    | **Comunicaciones**: apartado en la cuenta (casillas por tema) + baja de un clic en cada email (A + B)                                                                                                                                             | ✅     |
| MK-B    | **Avisos de stock**, solo con cuenta («Avísame cuando vuelva», por variante; un email y se borra)                                                                                                                                                 | ⏳     |
| MK-C    | **Comparador** de alimentación por materia seca: tablas estáticas por tipo (pienso con pienso, latas con latas) + comparación dinámica de 2–4 productos                                                                                           | ⏳     |
| MK-D    | **Escaparate** de «Mis peques» (on-demand, solo nombre, foto y edad; tarjetas flotantes y fila de arcoíris para las fallecidas; botón de pausa; casilla propia + moderación en el Admin) y **cumpleaños** (email respetuoso + señal en la cuenta) | ⏳     |
| MK-E    | **Analítica sin cookies**: Umami autoalojado                                                                                                                                                                                                      | ⏳     |
| MK-F    | **Gincana de huellas**: solo con cuenta, «todos hasta N», niveles por color (1 €, 3 €, 5 €…) con presupuesto por huella                                                                                                                           | ⏳     |

Aparcado: **Google Shopping** (feed de Merchant Center), hasta el catálogo final y el rebuild por webhook (cuando los
cambios estructurales sean mínimos).

## 1. MK-A — Comunicaciones (hecha)

### 1.1 Qué se ha hecho

- **Temas** (`lib/comms.ts`, **idéntico** en backend y storefront; el test del storefront lo comprueba): `novedades`
  (Novedades y ofertas), `cumpleanos` (Cumpleaños de mis peques) y `gincana` (Gincana de huellas). Cada uno con
  `version` del texto: súbela al cambiar el texto de un tema.
- **Backend**:
  - Módulo `comms` (`comms_consent`, migración nueva): una fila por cada vez que se activa un tema, que se **cierra**
    (`revoked_at`, `revoked_via`: cuenta | baja | admin) al quitarlo; nunca se borra salvo al borrar el cliente. Queda la
    prueba de qué se aceptó, cuándo, desde dónde y con qué versión del texto (RGPD art. 7.1). Enlace de solo lectura
    con el cliente (`src/links/comms-customer.ts`).
  - Workflows `set-comms-consents`, `unsubscribe-comms` y `delete-comms-consents` (pasos con compensación).
  - Rutas: `GET/POST /store/customers/me/comms` (sesión), `GET/POST /store/comms/unsubscribe` (token, sin sesión) y
    `GET /admin/customers/:id/comms` (widget).
  - Token de baja (`lib/comms-token.ts`): `<cliente>.<tema>.<HMAC-SHA256>` con `COMMS_UNSUBSCRIBE_SECRET`; sin BD ni
    caducidad; solo sirve para quitar ese tema a ese cliente.
  - **`sendMarketingEmail`** (`src/subscribers/_email.ts`): el único camino para un email comercial. Comprueba el
    consentimiento (si no hay, no envía y devuelve `false`), añade el pie de baja y las cabeceras `List-Unsubscribe` +
    `List-Unsubscribe-Post` (vía `provider_data.headers`; el proveedor solo deja pasar esas dos).
  - Widget del Admin «Comunicaciones (emails comerciales)» en la ficha del cliente, **solo lectura**, con el historial.
  - Subscriber `comms-customer-deleted`: al borrar el cliente se borran sus consentimientos.
- **Emails** (`packages/emails`): `Layout` acepta `unsubscribe: { url, topic }` y pinta «Recibes este email porque
  activaste «X» en tu cuenta. Darme de baja o elegir qué recibir en Mi cuenta → Comunicaciones». Las plantillas
  comerciales (MK-D, MK-F) lo declaran en sus props; `sendMarketingEmail` solo acepta esas plantillas.
- **Storefront** (0 KB de JS, sin JS funciona igual):
  - `/cuenta/comunicaciones/` (on-demand): casillas apagadas por defecto, action `account.comms`, entrada en el menú.
  - `/baja/?t=…` (on-demand, `private, no-store`, `Referrer-Policy: same-origin`): con GET muestra «¿Quieres dejar de
    recibir emails de X?» y un botón (abrir el enlace no da de baja); el POST del botón da de baja; el POST de un clic del
    cliente de correo (`List-Unsubscribe=One-Click`) responde 200 vacío.
  - Privacidad: párrafo «Comunicaciones» (`#comunicaciones`), provisional para la gestoría.

### 1.2 Decisiones

| Decisión                                                         | Motivo                                                                                                                                                                                                                             | Fuente                                                                                  |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| A + B: casillas en la cuenta + permiso por acción (MK-B)         | Usuario. Claro y nada invasivo; los avisos puntuales (stock) se piden donde se usan                                                                                                                                                | —                                                                                       |
| Tres temas desde el principio                                    | Usuario: novedades y ofertas, cumpleaños y gincana                                                                                                                                                                                 | —                                                                                       |
| Historial de filas en vez de un booleano                         | Prueba del consentimiento (cuándo, desde dónde, versión del texto)                                                                                                                                                                 | RGPD art. 7.1                                                                           |
| Baja de un clic con `List-Unsubscribe` + `List-Unsubscribe-Post` | Gmail y Yahoo lo exigen a envíos masivos; la URL acepta POST (vacío, 200) y GET (página con botón)                                                                                                                                 | MCP resend-docs: `add-unsubscribe-to-transactional-emails`, `custom-headers` (RFC 8058) |
| La baja la atiende el storefront (`/baja/`), no `api.`           | El POST de un clic llega sin `Origin` ni `Sec-Fetch-Site` y `checkOrigin` de Astro lo deja pasar (probado: solo bloquea un `Origin` distinto o `Sec-Fetch-Site: cross-site`). Así no hace falta abrir una ruta en el WAF de `api.` | astro-docs (`security.checkOrigin`) + astro 7.4.4 `core/app/origin-check.js`            |
| Token firmado (HMAC) sin BD ni caducidad                         | Una baja tiene que funcionar con un email antiguo; si se filtra, solo quita un tema                                                                                                                                                | —                                                                                       |
| Abrir `/baja/` no da de baja                                     | Antivirus y vistas previas abren los enlaces (como `/cuenta/verificar/`); el POST de un clic sí                                                                                                                                    | AGENTS §3.2 (enlaces que hacen algo)                                                    |
| Widget del Admin de solo lectura                                 | Lo decide el cliente; la tienda no activa comunicaciones por él                                                                                                                                                                    | —                                                                                       |

## 2. Cómo usarlo

- **Variable nueva** `COMMS_UNSUBSCRIBE_SECRET` (≥ 32 caracteres, `openssl rand -base64 48`): backend (`.env.example`,
  `.env.test.example`), `docker/compose.prod.yml` (bloque común, obligatoria) y `docker/.env.prod.example`. Si cambia,
  los enlaces de los emails ya enviados dejan de valer (la baja sigue en la cuenta).
- **Migración** del módulo `comms`: `pnpm --filter backend exec medusa db:migrate` (en producción la hace el `server`).
- **Email comercial nuevo** (MK-D, MK-F): plantilla con `unsubscribe?: EmailUnsubscribe` en sus props y `<Layout
unsubscribe={props.unsubscribe}>`, y se envía con `sendMarketingEmail(container, { customerId, topic, to, template,
data, idempotencyKey })`. Nunca con `sendEmail`.
- **Tema nuevo**: añadirlo a `COMMS_TOPICS` en los **dos** `lib/comms.ts`, generar la migración del módulo (el `enum`
  de `topic`) y el párrafo de privacidad.

## 3. Cómo testear

```bash
pnpm --filter backend test                                   # unitarios (comms.unit.spec.ts)
pnpm --filter backend test:integration:http -- comunicaciones   # 5 tests: sesión, guardar, baja, email, borrar cliente
pnpm --filter emails test                                    # layout.test.tsx (pie de baja)
pnpm --filter storefront test                                # comms.test.ts (copia idéntica) y cache.test.ts
# e2e (build servido en :4398; el backend con el mismo COMMS_UNSUBSCRIBE_SECRET que lee el test de apps/backend/.env):
E2E_BASE_URL=http://localhost:4398 pnpm --filter storefront exec playwright test comunicaciones
```

A mano: Mi cuenta → Comunicaciones (todo apagado) → marcar y guardar → en el Admin, ficha del cliente, widget
«Comunicaciones» con el historial.

## 4. Criterio de salida MK-A

- [x] Casillas en la cuenta, apagadas por defecto, sin JS.
- [x] Baja con el enlace (botón) y de un clic (POST del cliente de correo), sin JS; abrir el enlace no da de baja.
- [x] Ningún email comercial sale sin consentimiento (`sendMarketingEmail`) y todos llevan pie y cabeceras de baja.
- [x] Historial del consentimiento y widget del Admin; borrado al borrar el cliente.
- [x] axe sin fallos y sin violaciones de la CSP en `/cuenta/comunicaciones/` y `/baja/`.

## 5. Pendientes / riesgos

- 👤 Gestoría: texto de privacidad «Comunicaciones» y el de cada tema (`description`); ¿el aviso de stock pedido por el
  cliente (MK-B) es comunicación comercial?
- Rate limiting de `/baja/` en Cloudflare (como el resto de formularios sin sesión) al abrir la tienda.
- Rebotes y quejas de Resend (webhook) cuando haya volumen: una queja debería quitar todos los temas.
