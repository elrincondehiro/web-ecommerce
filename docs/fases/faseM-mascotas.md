# Fase M — Mascotas de los clientes («Mis peques») y aviso de pedidos

> **Estado:** ✅ completada (24-oct-2026)
> **Rama/PR:** `feat/mascotas-avisos` · PR #…
> **Anterior:** [Fase R — rendimiento](./faseR-rendimiento.md) · **Siguiente:** más peticiones de frontend y backend

## 1. Objetivos

- [x] **Mis peques**: en la cuenta, una pestaña con mini fichas de las mascotas del cliente (tantas como tenga, tope 20) y «+ Añadir mascota».
  - Ficha: nombre, tipo (perro, gato, conejo, hurón, roedor, ave, reptil u otro con texto), raza o mezcla, nacimiento (mes y año, día opcional, «aproximado»), sexo, esterilizado, peso, alimentación actual, procedencia, salud (un texto), foto y fallecimiento (mes y año, día opcional).
  - Fallecidas: en gris, al final, «🌈 En nuestro recuerdo», con la opción de borrarlas.
- [x] **Consentimientos**: la salud solo se guarda con la casilla marcada; la foto, solo si se acepta que sea **pública**. Sin la casilla no se guarda nada y el formulario vuelve con un aviso y lo escrito.
- [x] **Admin**: ver y editar las mascotas en la ficha del cliente (para clientes que no sepan hacerlo) y verlas en la ficha del pedido.
- [x] **Aviso de pedido nuevo** a la tienda: email a `SHOP_NOTIFY_EMAIL` (pedido, cliente y mascotas) y push por **ntfy** (tema propio para pedidos, sin datos personales).
- [x] Preparado para **compartir** fichas más adelante (protectoras): `status` y `share_token`, sin uso aún.
- [x] Texto provisional en `/privacidad/`.

## 2. Qué se ha hecho

### 2.1 Backend (`apps/backend`)

- **Módulo `pets`** (`src/modules/pets`, tabla `pet`, migración `Migration20261024165435`): todos los campos de §1 + `health_consent_at`, `photo_url`, `photo_file_id`, `photo_consent_at`, `status` (`casa` | `adopcion` | `acogida`, por defecto `casa`) y `share_token` (índice único parcial). Enlace de solo lectura al cliente (`src/links/pet-customer.ts`), como la lista de deseos.
- **Reglas puras** en `src/lib/pets.ts` (fechas parciales, edad, consentimientos, WebP) con tests (`pets.unit.spec.ts`). Esquema zod común en `src/lib/pets-schema.ts`.
- **Workflows** (`src/workflows/pets`): crear (tope `PET_MAX_PER_CUSTOMER` = 20), editar, poner/quitar foto (`uploadFilesWorkflow` público + `deleteFilesWorkflow` de la anterior) y borrar (una o todas, con sus fotos). Pasos con compensación; borrar ficheros, al final (no tiene compensación en Medusa).
- **Rutas**:
  - `GET|POST /store/customers/me/pets`, `POST|DELETE /store/customers/me/pets/:id`, `POST|DELETE /store/customers/me/pets/:id/photo`. Siempre el cliente del token; una mascota ajena da **404**.
  - `GET|POST /admin/customers/:id/pets`, `POST|DELETE /admin/customers/:id/pets/:petId[/photo]`. En el Admin, `health_consent` = «el cliente lo ha autorizado».
  - La foto llega ya reducida (WebP) en base64: límite del cuerpo de **1 MB solo en esas rutas** (`bodyParser.sizeLimit`); la ruta comprueba la cabecera WebP y ≤ 600 KB.
- **Baja de la cuenta**: subscriber de `customer.deleted` (`pets-customer-deleted.ts`) que borra sus mascotas y fotos.
- **Widgets del Admin** (`src/admin/components/pets.tsx`): ficha del cliente (`customer.details.after`: ver, añadir, editar, foto, borrar) y del pedido (`order.details.side.after`: solo ver, sin las fallecidas). La foto se reduce en el navegador (canvas → WebP 800 px): al redibujarla se pierden los metadatos.
- **Aviso de pedido nuevo** (`src/subscribers/order-placed-shop-notify.ts`, lógica pura en `src/lib/shop-notify.ts`):
  - email `order-received-shop` (plantilla nueva en `packages/emails`) a `SHOP_NOTIFY_EMAIL`: artículos, descuentos, envío, total, email y dirección del cliente, sus mascotas **vivas** (con alimentación y salud) y el botón «Abrir el pedido en el Admin»;
  - push ntfy: `POST <NTFY_URL>/<NTFY_ORDERS_TOPIC>` con `Title: Pedido nuevo n. 1042`, `Priority: high`, `Tags: shopping_cart` (🛒), `Click: <Admin>/app/orders/<id>` y cuerpo «Pedido n.º 1042 · 45,90 € · 3 artículos». **Sin nombre, email, dirección ni mascotas**: en ntfy.sh cualquiera que adivine el tema lo lee.
  - Corre en el worker; los dos avisos son independientes y un fallo solo deja un aviso en el log (sin datos del cliente). Sin las variables, no se envía.

### 2.2 Storefront (`apps/storefront`)

- Páginas on-demand, **0 KB de JS propio** (solo `SiteClient` + `CartClient`, como el resto de la cuenta): `/cuenta/mascotas/` (lista), `/cuenta/mascotas/nueva/` y `/cuenta/mascotas/<id>/` (editar). «Mis peques» en el menú de la cuenta.
- `components/account/PetForm.astro` (formulario multipart) y `PetCard.astro` (mini ficha; «Quitar» confirma en un `popover` nativo).
- Actions `account.petSave` y `account.petDelete` (`src/actions/pets.ts`), dentro de `account.*` para reutilizar el PRG y la cookie flash del middleware. Validación por campo en `lib/pets.ts` (tests en `pets.test.ts`).
- **Foto** (`lib/pet-photo.ts`): JPG, PNG, WebP o AVIF de hasta **8 MB**; sharp aplica la orientación EXIF, reduce a 800 px (sin ampliar), convierte a WebP (calidad 80) y **no copia los metadatos** (sin GPS). Se envía al backend en base64. sharp ya era dependencia (servicio de imágenes); en runtime se carga solo en esta action.
- `security.actionBodySizeLimit` = 9 MB (antes, 1 MB por defecto) en `astro.config.mjs`.
- Cookie flash: valores de hasta 500 caracteres (el campo de salud).
- `/privacidad/`: apartados provisionales «Mis peques», «Salud de tus mascotas» y «Fotos de tus mascotas» (para la gestoría).
- e2e `e2e/mascotas.spec.ts` (sin JS, escritorio y móvil) y `/cuenta/mascotas/` y `/nueva/` en la prueba de desbordamiento de `cuenta.spec.ts`.

## 3. Decisiones tomadas

| Decisión                                                                                                    | Motivo                                                                                                             | Fuente consultada                                                                                                                              |
| ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Módulo propio + enlace de solo lectura (no `customer.metadata`)                                             | Varias mascotas por cliente, consultas por cliente, consentimientos con fecha; mismo patrón que la lista de deseos | context7 `/medusajs/medusa` (módulos, `defineLink` readOnly; guía `wishlist`)                                                                  |
| Fechas como año + mes + día opcionales                                                                      | El usuario: «mes y año con día opcional» en las dos; la edad se calcula y no se queda vieja                        | —                                                                                                                                              |
| Salud: un solo texto, con consentimiento; sin la casilla **no se guarda nada** (aviso)                      | Que no se pierda nada sin que el cliente lo sepa; retirar el consentimiento borra la salud                         | Decisión con el usuario (nota: la salud de un animal no es dato especial del RGPD, pero el consentimiento es lo prudente)                      |
| Foto **pública** obligatoria con consentimiento (bucket público actual, `mascotas/<aleatorio>-<ULID>.webp`) | El usuario quiere poder compartir fichas (protectoras); el bucket privado necesita otro módulo de ficheros         | context7 `/medusajs/medusa` (File Module: un solo proveedor)                                                                                   |
| La foto se limpia en el servidor de Astro con sharp (y en el Admin con canvas)                              | Quitar el GPS del EXIF antes de publicarla; sin dependencias nuevas                                                | context7 `/lovell/sharp` (`keepMetadata`: por defecto se quitan los metadatos; `autoOrient`, `resize` `inside` + `withoutEnlargement`, `webp`) |
| `actionBodySizeLimit` 9 MB                                                                                  | Por defecto 1 MB (astro 7.4.1, `core/config/schemas/defaults.js`); la foto puede pesar hasta 8 MB                  | astro-docs (actions: formularios con `File`) + código de astro 7.4.1                                                                           |
| `bodyParser.sizeLimit: "1mb"` solo en las rutas de foto                                                     | Medusa limita a 100 KB; la foto llega reducida (~50–150 KB, base64)                                                | context7 `/medusajs/medusa` («parse-body»)                                                                                                     |
| Actions de mascotas dentro de `account.*`                                                                   | Reutilizar el PRG y la cookie flash del middleware sin tocarlo                                                     | —                                                                                                                                              |
| Push ntfy sin datos personales, cabeceras en ASCII, `Tags: shopping_cart` para el emoji                     | En ntfy.sh el tema es la única protección; `fetch` no acepta cabeceras no ASCII                                    | context7 `/websites/ntfy_sh` (publish: `Title`, `Priority`, `Tags`, `Click`, `Authorization`)                                                  |
| Enlace del aviso: `ADMIN_URL` (si no, `MEDUSA_BACKEND_URL`) + `/app/orders/<id>`                            | En producción el Admin va en otro dominio (`admin.`) y detrás de Access                                            | —                                                                                                                                              |
| `status` y `share_token` ya en el modelo                                                                    | La fase de compartir fichas (protectoras) no tendrá que migrar datos                                               | Decisión con el usuario                                                                                                                        |

## 4. Cómo usarlo

- Cliente: **Mi cuenta → Mis peques → + Añadir mascota**.
- Tienda (Admin): ficha del cliente → bloque «Mascotas» (+ Añadir, Editar, Borrar; la salud exige marcar «el cliente lo ha autorizado» y la foto, «acepta que sea pública»). Ficha del pedido → «Mascotas del cliente» (columna derecha).
- Avisos de pedido (backend, también en el worker; `.env` / `.env.prod`):

  ```ini
  SHOP_NOTIFY_EMAIL=pedidos@…        # ya existía (bajas)
  NTFY_URL=https://ntfy.sh
  NTFY_ORDERS_TOPIC=<tema largo y aleatorio, solo para pedidos>
  NTFY_TOKEN=                        # opcional
  ADMIN_URL=https://admin.<dominio>  # producción
  ```

  En la app de ntfy, suscribirse al tema nuevo (aparte del de Kuma). Un tema aleatorio: `openssl rand -hex 24`.

- **Producción**: `medusa db:migrate` (crea la tabla `pet`; lo hace el `server` al arrancar) y las variables de arriba.

## 5. Cómo testear esta fase

```bash
pnpm lint && pnpm format:check && pnpm typecheck && pnpm test && pnpm build
pnpm --filter storefront check:budget                     # sin bundles nuevos
pnpm --filter backend test:integration:http               # 64/64; mascotas.spec.ts (7) y aviso-pedido.spec.ts (1)
# e2e: build del storefront servido con `pnpm start` + backend con EMAIL_TRANSPORT=smtp
pnpm --filter storefront exec playwright test e2e/mascotas.spec.ts e2e/cuenta.spec.ts
```

Resultados (24-oct-2026): unitarios 117 (backend) + 268 (storefront) + 22 (emails); HTTP del backend 64/64; e2e de cuenta, deseos y mascotas 38/38; `check:budget` OK (`/cuenta/mascotas/*` solo cargan `SiteClient` y `CartClient`, sin violaciones de CSP).

A mano:

1. Añadir una mascota con salud y foto sin marcar las casillas → no se guarda; aviso en cada casilla y lo escrito se conserva (la foto hay que volver a elegirla).
2. Con las casillas → la foto sale como WebP de ≤ 800 px; `exiftool`/`sharp` no ven EXIF.
3. Añadir fecha de fallecimiento → ficha en gris al final. Quitar → popover de confirmación.
4. Admin: ficha del cliente y del pedido.
5. Pedido de prueba → email «Pedido nuevo n.º …» en Mailpit (a `SHOP_NOTIFY_EMAIL`) y push en el móvil (con `NTFY_*`).

## 6. Criterio de salida

- [x] El cliente añade, edita y quita mascotas sin JS; las fallecidas se distinguen.
- [x] Sin consentimiento no se guarda ni la salud ni la foto; la foto pública no lleva metadatos.
- [x] La tienda ve (y edita) las mascotas en el Admin y en el pedido.
- [x] Cada pedido nuevo avisa por email y por ntfy; el push no lleva datos personales.
- [x] 0 KB de JS nuevo; batería completa en verde.

## 7. Pendientes / riesgos

- 👤 **Gestoría**: revisar los textos provisionales de `/privacidad/` (mascotas, salud y fotos) y de las dos casillas.
- 👤 **ntfy**: crear el tema de pedidos y poner `NTFY_URL` + `NTFY_ORDERS_TOPIC` (+ `ADMIN_URL`) en el `.env.prod` del VPS (y en el `.env` local si se quiere probar). Probado solo contra un ntfy falso en los tests.
- **Fotos privadas** (cuando no se acepte que sea pública): necesitan un bucket privado, un módulo propio con `@aws-sdk/client-s3` (dependencia nueva) y una ruta que sirva la foto con sesión. Aplazado por complejidad.
- **Compartir fichas / protectoras**: usar `share_token` y `status`; solo fichas sin foto o con foto pública; **la salud nunca se comparte**.
- **Backups**: las fotos (como las de producto) solo están en R2; el backup diario solo copia Postgres.
- Las fotos que suba la tienda desde el Admin dependen de que el navegador genere WebP con `canvas.toBlob` (Chrome, Firefox, Edge y Safari ≥ 14 sí).
- El tope de 20 mascotas por cuenta y los límites de texto (alimentación 200, salud 500) son decisiones provisionales.
