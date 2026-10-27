# Fase H — Home: secciones configurables, colecciones y fotos propias

> **Estado:** ✅ completada (27-oct-2026)
> **Rama/PR:** `feat/home` · PR #…
> **Anterior:** [Fase PG — pagos](./fasePG-pagos.md) · **Siguiente:** más peticiones de frontend y backend

## 1. Objetivos

- [x] **(a) Páginas de colección** `/coleccion/<handle>/` para todas las Collections con productos; el carrusel de la home enlaza a la suya («Ver los N»).
- [x] **(b) Categorías destacadas** elegidas en `home.yaml` (cualquier nivel), en vez de las raíces automáticas.
- [x] **Home configurable**: `hero` y `categorias` obligatorios; el resto opcional; `orden` en el yaml. Nunca un build con la home vacía.
- [x] **Fotos propias** de categorías y colecciones desde el Admin (widget), con la del primer producto como respaldo.
- [x] (c) Novedades: carrusel con los productos de los **últimos 30 días** **o** con la etiqueta `novedad` (decisión del usuario), con fecha de corte opcional (`desde`) para la carga inicial.
- [x] (d) Tarjetas de colecciones y chips «Busca por…» (etiquetas → `/buscar/?etiqueta=…`).
- [x] Descripción de las colecciones desde el Admin (mismo widget).

## 2. Qué se ha hecho

### 2.1 Home configurable (`apps/storefront`)

- **`src/content.config.ts`**: `hero` y `categorias` obligatorios; `destacados`, `ofertas` y `valores` opcionales. Cada bloque salvo el hero lleva `orden` (1–99).
- **`src/lib/home.ts`** (puro, con tests):
  - `orderedBlocks`: bloques presentes de menor a mayor `orden`; un orden repetido **lanza un error**.
  - `featuredCategories`: handles del yaml que existen en el árbol de la tienda (solo categorías con productos), en su orden y sin repetir; avisa de los que faltan y, sin ninguno válido, **lanza un error**.
    Un error en el build de la home hace fallar `astro build` («Caught error rendering /»): no se publica.
- **`src/pages/index.astro`**: el hero, y después los bloques en su orden (`src/components/home/Home*.astro`). Un bloque opcional sin datos (colección vacía, sin ofertas) no se pinta.
- `home.yaml`: `categorias.handles: [perro, gato, para-ti]` (las tres raíces de hoy, sin cambio visible) y `orden` 1–4.

### 2.2 Colecciones

- `lib/medusa.ts`: `getCollections()` (todas, con `metadata`, paginado). `getCollectionByHandle` la usa.
- `lib/shop.ts`: `getShopCollections()` (las que tienen productos, orden por título), `collectionHref`, `getFeaturedBlock()` (carrusel: productos, total y enlace; null si el bloque no está o la colección está vacía).
- **`src/pages/coleccion/[handle]/[...page].astro`**: listado paginado como las categorías, migas + `BreadcrumbList`, en el sitemap. **Sin «Filtrar»**: `/buscar/` no filtra por colección. Cabecera `EntityHeader.astro`: título, y en la página 1 la foto (3:1, 16:9 en móvil; LCP con `fetchpriority=high`) y la descripción propias.
- **LiveSync**: las páginas de colección entran en el manifiesto de listados (`buildListingManifest`).

### 2.3 Fotos propias (Admin)

- **Widgets** `src/admin/widgets/category-image.tsx` (`product_category.details.after`) y `collection-image.tsx` (`product_collection.details.after`) con un componente común `src/admin/components/entity-image.tsx`:
  - la foto se reduce en el navegador (canvas → WebP ≤ 1600 px, **sin metadatos**) y se sube con `POST /admin/uploads` (fichero público);
  - se guarda en la `metadata`: `imagen_url`, `imagen_file_id`, `imagen_alt`;
  - cambiar o quitar borra el fichero anterior (`DELETE /admin/uploads/:id`) **después** de guardar.
  - **Sin rutas propias** en el backend.
- **Storefront** (`lib/entity-image.ts`, puro): `metadataImage` (solo URLs http(s)), `cardImage` (la propia o la del primer producto con foto), `metadataDescription` (colecciones: `metadata.descripcion`).
- La metadata de las categorías viaja en el árbol (`CategoryNode.metadata`, también en `pruneEmpty` y en el manifiesto `shop-categories.json`).

### 2.6 Carpetas del bucket

De aquí en adelante cada fichero nuevo va a una carpeta (`lib/upload-folders.ts`); lo ya subido se queda donde está (el bucket local es de pruebas y el de producción se vaciará antes de abrir):

| Carpeta        | Qué                                 | Quién                                                                     |
| -------------- | ----------------------------------- | ------------------------------------------------------------------------- |
| `productos/`   | fotos de productos y variantes      | formulario estándar del Admin (crear producto y «Media»), `images:import` |
| `categorias/`  | foto propia de una categoría        | widget                                                                    |
| `colecciones/` | foto propia de una colección        | widget                                                                    |
| `mascotas/`    | «Mis peques»                        | storefront y Admin (Fase M)                                               |
| `contenido/`   | lo demás que se suba desde el Admin | —                                                                         |

- **Formulario estándar del Admin**: Medusa no tiene hook en la subida. Un middleware nuestro en `POST /admin/uploads` (después del de Medusa, que ya ha leído los ficheros con multer) renombra `req.files[].originalname` a `<carpeta>/<nombre>`; el proveedor `file-s3` (y el local en CI) respeta la carpeta de la clave (`<carpeta>/<nombre>-<ulid>.<ext>`). La carpeta sale de la página desde la que se sube (`Referer`: `/app/products/…`, `/app/categories/…`, `/app/collections/…`).
- **Widgets**: mandan la carpeta en la cabecera `x-upload-folder` (gana al `Referer`; solo carpetas conocidas). El nombre del fichero no sirve: multer quita la ruta. Al quitar o cambiar la foto, el id (con carpeta) va codificado en `DELETE /admin/uploads/:id`.
- **`images:import`**: `productos/<handle>_XX.jpg`. Arreglado de paso: importar una carpeta con solo algunas fotos de un producto (p. ej. una `_09` nueva) **borraba de la galería las importadas antes que no venían en la carpeta**; ahora se conservan y todas se ordenan por su nombre (`imageOrder`, compartido con `planProductImages`).
- Tests: `upload-folders.unit.spec.ts`, `integration-tests/http/subidas.spec.ts` (Referer, cabecera, carpeta desconocida, ruta en el nombre) y `imageOrder` en `image-files.unit.spec.ts`. Probado a mano en el Admin: producto (pestaña Media) → `productos/`, widgets → `categorias/` y `colecciones/`, quitar la foto borra el fichero (404).

### 2.5 Ajustes tras la revisión en el móvil

- **Sombra de la última tarjeta** de los carruseles (home y relacionados) y de la última foto de la galería: se cortaba al llegar al final del scroll en anchos sin margen lateral. Carruseles: una columna vacía de 1 px al final del track (`.carousel__track::after`; en una rejilla con scroll ni el padding del track ni un margen de la última columna amplían el área de scroll, medido) y la última tarjeta con `scroll-snap-align: end`. Galería: `pr-1` en la lista. Medido en Chromium y Firefox a 360, 390, 412 y 1280 px.
- **Cabecera de colección**: la foto lleva la sombra retro de la web (`shadow-sm`), como la foto principal de la ficha.

### 2.4 Novedades, colecciones y etiquetas (c y d)

- **Bloques nuevos** en `home.yaml` (opcionales, con `orden`): `novedades` (`dias`, `desde` opcional, `maximo`), `colecciones` (`handles`) y `etiquetas` (`valores`). `lib/home.ts`:
  - `isNew` / `newProducts`: creado en los últimos `dias` y no antes de `desde`, **o** con la etiqueta `novedad` (sin distinguir mayúsculas); de la más reciente a la más antigua;
  - `tagChips`: etiquetas del yaml con algún producto (y su número), en el orden del yaml.
- `lib/medusa.ts`: `created_at` en los campos del catálogo. `lib/shop.ts`: `getNewBlock()`; las novedades entran en el manifiesto de LiveSync (misma fecha del build que la home).
- **Componentes**: `HomeCarousel.astro` (común a favoritos y novedades; sustituye a `HomeFeatured`), `HomeCollections.astro` (tarjetas con foto propia o del primer producto y nº de productos) y `HomeTags.astro` (chips con su número).
- Enlaces: «Ver todas» de novedades → `/buscar/?orden=novedades`; chips → `/buscar/?etiqueta=<valor>`; tarjetas → `/coleccion/<handle>/`.
- **Admin**: en las colecciones, el widget se llama «Foto y descripción de la tienda» y tiene el campo **Descripción** (`metadata.descripcion`, ≤ 600 caracteres; vacía = se borra). Se puede guardar solo la descripción, sin foto. Las categorías usan su descripción nativa de Medusa.

## 3. Decisiones tomadas

| Decisión                                                                                      | Motivo                                                                                                                                                               | Fuente consultada                                                                                                                                            |
| --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Página para **todas** las colecciones con productos                                           | Páginas indexables útiles (decisión del usuario)                                                                                                                     | —                                                                                                                                                            |
| Home: obligatorios + opcionales + `orden` en el yaml, y build que **falla** si es incoherente | Mostrar u ocultar bloques sin tocar código; nunca una home vacía en producción (decisión del usuario)                                                                | astro-docs (content collections: esquema con zod)                                                                                                            |
| Cambiar secciones de la home no perjudica el SEO                                              | Lo importante: URL, título, H1 y enlaces estables a las categorías principales                                                                                       | —                                                                                                                                                            |
| Fotos en `metadata` (sin migraciones ni módulo propio) y subida con `/admin/uploads`          | Lo que ya da Medusa; la tienda la lee en la Store API                                                                                                                | context7 /medusajs/medusa (admin widgets, `POST /admin/uploads`); código 2.22.1 (`allowedStoreCollectionExtraFields`, categorías con `metadata` por defecto) |
| Al quitar la foto, sus claves con `""`                                                        | Probado en 2.22.1: la metadata de las **categorías se sustituye** y la de las **colecciones se fusiona** (`mergeMetadata`: `""` borra). Con `""` funciona en los dos | prueba con `medusa exec`                                                                                                                                     |
| Sin «Filtrar» en las colecciones                                                              | El índice de búsqueda no tiene la colección (añadirla = migrar el índice)                                                                                            | —                                                                                                                                                            |
| Respaldo: foto del primer producto                                                            | Nada se queda sin foto durante la carga inicial                                                                                                                      | —                                                                                                                                                            |

## 4. Cómo usarlo

- **Home**: `apps/storefront/src/content/home.yaml`. Quitar un bloque opcional = borrarlo del yaml; cambiar el orden = cambiar `orden`. Categorías destacadas: `categorias.handles` (handles de Medusa).
- **Foto de una categoría o colección**: Admin → Productos → Categorías (o Colecciones) → la categoría → «Foto de la tienda». Se ve tras el siguiente build del storefront.
- **Descripción de una colección** (cabecera de su página): Admin → Colecciones → la colección → «Foto y descripción de la tienda».
- **Novedades**: etiqueta `novedad` en Medusa para marcar una a mano; al cargar el catálogo real, poner `novedades.desde` con la fecha de la carga.

## 5. Cómo testear esta fase

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
pnpm --filter storefront check:budget                     # sin JS nuevo
# e2e de la home y de la página de colección (backend real + storefront construido en :4398)
E2E_BASE_URL=http://localhost:4398 pnpm --filter storefront exec playwright test e2e/interficie.spec.ts
```

Lighthouse (local): `pnpm --filter storefront lhci` con fixtures; contra el catálogo real, un `lighthouserc` temporal con las URLs y `startServerCommand: "node --env-file=.env ./scripts/lhci-server.mjs"` (sin el `.env`, LiveSync da 500 y Buenas prácticas baja a 96).

Resultado (27-oct-2026):

- Unitarios storefront 283 (nuevos: `home.test.ts`, `entity-image.test.ts`, metadata en `categories.test.ts`); `interficie.spec.ts` 38/38.
- Build con fixtures: home con los 4 bloques en orden y `/coleccion/destacados/`. Garantías probadas a mano: orden repetido → falla; sin `categorias` → falla (esquema); ningún handle válido → falla; un handle inexistente → aviso y se omite; sin `destacados` ni `ofertas` → no salen.
- Build real: `/coleccion/destacados/` (36 productos, 2 páginas, en el sitemap), LiveSync corrige precio y stock en la página 2, «Ver los 36» en la home.
- Widget (Playwright en el Admin, con un admin temporal ya borrado): subir (WebP en el bucket, metadata guardada), quitar (fichero borrado: 404), en categoría y colección; la foto de la categoría sale en la home y la de la colección en su cabecera (`fetchpriority=high`), solo en la página 1. Descripción: solo texto; foto + texto; recargar (el campo muestra lo guardado); quitar la foto conserva el texto; vaciar el texto lo borra.
- c y d (build real): los 7 bloques en su orden; novedades con «Ver todas» → `/buscar/?orden=novedades`; chips con su número (p. ej. «sin cereales 50», mismos 50 resultados en `/buscar/`). Con fixtures (CI) no hay novedades ni etiquetas y esos bloques no salen.
- Suite e2e completa contra el backend real: 236 en verde (16 saltados).

## 6. Criterio de salida

- [x] (a), (b), (c) y (d) con tests y sin JS nuevo.
- [x] Lighthouse móvil (catálogo local, mediana de 3, detrás del proxy tipo Caddy): `/`, `/coleccion/destacados/` y su página 2 con **100 en las cuatro categorías**, LCP 1,51 s, CLS ≤ 0,002, TBT 0 ms. Home frente a `main`: LCP igual, HTML +3,2 KB (31,5 KB), +11 imágenes perezosas (+89 KB, por debajo del pliegue).
- [x] Carpetas del bucket con tests (unitarios + HTTP) y probadas en el Admin.
- [x] README §4 y AGENTS §1 sincronizados con las versiones reales (Medusa 2.22.1, Astro 7.4.2, Node 24.22.1, pnpm 12.15.0, imágenes de Docker de Renovate #73).

## 7. Pendientes / riesgos

- ⚠️ **LibreWolf** (o Firefox con `privacy.resistFingerprinting`): la foto que suben los widgets del Admin sale **con rayas**. Esa protección mete ruido en los píxeles que una web lee de un `<canvas>`, y los widgets reducen la foto con canvas (medido: diferencia media 87/255 frente a 1,8 en Firefox normal). Afecta también al widget de mascotas del Admin; el storefront no (allí la reduce el servidor con sharp). Decisión del usuario: no cambiarlo, el Admin se usa con un navegador normal. Si algún día molesta: reducir en el backend con sharp (0.35.5, ya en el monorepo).

- Las fotos y colecciones nuevas se ven tras un build: la reconstrucción del storefront al cambiar el catálogo (PENDIENTES §4) gana importancia.
- Si se quita la foto por la API sin el widget, el fichero se queda en el bucket (huérfano).
- Novedades calculadas en el build: un producto deja de ser novedad cuando se reconstruye el storefront (build diario o reconstrucción automática, PENDIENTES §4).
- Los chips no muestran el número exacto de `/buscar/` si un producto se publica o despublica después del build.
