# Fase DS — Diseños de ficha y de categoría

> **Estado:** ✅ completada (3-nov-2026)
> **Rama/PR:** `feat/disenos` · PR #…
> **Anterior:** [Fase FO — familias de opciones](./faseFO-familias.md) · **Siguiente:** [Fase CS — caja de snacks](./faseCS-caja-snacks.md) (propuesta)

## 0. Qué es (y qué no)

| Concepto               | Campo                  | Qué decide                                                                                                    |
| ---------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------- |
| **Diseño** (esta fase) | `metadata.diseno`      | El componente `.astro` que pinta la página **entera** (ficha o categoría).                                    |
| **Plantilla** (Fase O) | `metadata.plantilla`   | Contenido Markdown **dentro** de la ficha estándar (`src/content/plantillas/`). Ya no tiene casos especiales. |
| **Guía de tallas** (O) | `metadata.guia_tallas` | Markdown por modelo (`src/content/guias/`).                                                                   |
| **Grupo** (Fase E-2c)  | `metadata.grupo`       | Agrupar varios productos en una tarjeta y una landing en los listados. Hoy solo existe `correa`.              |

Antes de esta fase `plantilla = "correa"` hacía dos cosas: contenido de ficha y «este producto es una correa» (25 usos
de `isCorrea()`). Esta fase lo separa: la correa es el **diseño** `correa`, la agrupación la decide **`grupo`** y el
backend valida la línea del carrito por la **variante** (`largo_m`). `plantilla` vuelve a ser solo contenido. Sin
retrocompatibilidad (decisión del usuario: no hay producción que conservar; el próximo despliegue regenera los datos
desde cero).

## 1. Objetivos

- [x] Diseño por **producto** (`metadata.diseno`) y por **categoría** (`metadata.diseno` de la categoría = su página).
- [x] **Herencia**: una categoría puede fijar el diseño de sus productos (`metadata.diseno_productos`), también para
      los de sus subcategorías.
- [x] La ficha y la categoría actuales pasan a ser el diseño `estandar` **sin ningún cambio visible** (HTML idéntico,
      así que Lighthouse no cambia; e2e iguales).
- [x] La correa a medida pasa a ser el diseño `correa` (adiós a `plantilla = "correa"`; `isCorrea()` se deriva del diseño).
- [x] Un diseño nuevo = un `.astro` + una entrada en el registro; recibe los datos ya preparados.
- [x] Error de build si un producto o una categoría piden un diseño que no existe o que no es de su tipo.
- [x] Columnas `diseno` (productos y categorías) y `diseno_productos` (categorías) en `catalog:import`.
- [x] **Widget del Admin** con un desplegable en la ficha del producto y en la de la categoría.
- [x] 0 KB de JS nuevo en la tienda por usar el sistema.

Fuera de alcance: diseño de ejemplo (la correa ya es el segundo diseño), grupos genéricos (otra landing distinta de
la de la correa), diseños de `/buscar/`, colecciones u ofertas.

## 2. Diseño técnico

### 2.1 Dónde se elige y prioridad

| Entidad   | Campo                       | Hoja                                    | Admin                  |
| --------- | --------------------------- | --------------------------------------- | ---------------------- |
| Producto  | `metadata.diseno`           | columna `diseno` (`productos.csv`)      | widget en el producto  |
| Categoría | `metadata.diseno`           | columna `diseno` (`categorias.csv`)     | widget en la categoría |
| Categoría | `metadata.diseno_productos` | columna `diseno_productos` (categorías) | widget en la categoría |

- **Ficha**: el `diseno` del producto → el `diseno_productos` de su categoría más concreta → el de sus padres, hacia
  arriba → `estandar`.
- **Página de categoría**: su `diseno` → `estandar`. **Sin herencia** entre categorías: el diseño de una página de
  categoría no pasa a sus hijas (se decidió así para que una landing especial no se copie sin querer; si hiciera
  falta, se añade después).
- `-` en la hoja = quitarlo (convención de `catalog:import`; Medusa borra la clave con `""`, context7 «Manage
  Metadata»).

### 2.2 Estructura

```
apps/storefront/src/
  lib/disenos.ts              PURO (Vitest). Lo usan el build Y el servidor (búsqueda, LiveSync, actions):
                              registro de propiedades + resolveProductDesign() + resolveCategoryDesign()
  disenos/
    producto/Estandar.astro   la maquetación actual de pages/producto/[handle].astro
    producto/Correa.astro     ColorPicker + plazo + CorreaBuilder
    categoria/Estandar.astro  la maquetación actual de pages/categoria/[handle]/[...page].astro
    index.ts                  { producto: { estandar, correa }, categoria: { estandar } } (solo .astro)
    LEEME.md                  reglas para crear un diseño (§2.4)
  pages/producto/[handle].astro          getStaticPaths + FichaData + <Diseno {...data} />
  pages/categoria/[handle]/[...page].astro  getStaticPaths + CategoriaData + <Diseno {...data} />

apps/backend/src/
  lib/disenos.ts              ids y nombres de los diseños, IDÉNTICO a apps/storefront/src/lib/disenos-ids.ts
                              (test que compara los dos, como option-families.ts)
  admin/widgets/product-design.tsx, category-design.tsx
```

- **Componente elegido en el build** con una variable (astro-docs, _reference/astro-syntax → Dynamic Tags_):
  `const Diseno = DISENOS.producto[id]; <Diseno {...data} />`. Nombre en mayúscula; la etiqueta dinámica **no admite
  `client:*`** (no usamos islas de cliente; el `server:defer` de LiveSync va dentro de componentes importados de forma
  normal: se comprueba en DS-0).
- **Datos comunes, una vez**: `FichaData` (producto, migas, categoría, precios, galería, selector, plantilla y guía,
  relacionados, JSON-LD, bloque de descatalogado) y `CategoriaData` (página, facetas, fila de categorías, migas,
  título). Lo propio de un diseño (colores de la correa, plazo) lo calcula el diseño.
- **Propiedades del diseño en `lib/disenos.ts`**, no en el `.astro`, para que el código de servidor que no pinta la
  ficha las pueda consultar sin importar componentes:

  | Propiedad      | Para qué                                                               | `estandar`  | `correa`        |
  | -------------- | ---------------------------------------------------------------------- | ----------- | --------------- |
  | `configurable` | No se añade sin pasar por la ficha (deseos, sugerencias, relacionados) | no          | sí              |
  | `chooseLabel`  | Texto del botón de la tarjeta                                          | (el actual) | «Elegir medida» |
  | `live`         | Datos extra de LiveSync                                                | —           | `correa`        |
  | `guides`       | Pinta plantilla y guía de tallas                                       | sí          | no              |

### 2.3 Qué pasa con cada uso de `isCorrea()`

| Uso de hoy                                                       | Pasa a                                                             |
| ---------------------------------------------------------------- | ------------------------------------------------------------------ |
| Ficha (`[handle].astro`)                                         | diseño `correa`                                                    |
| `LiveSyncData` (`correaLive`)                                    | `live === "correa"`                                                |
| Deseos, sugerencias del carrito, relacionados, `medusa.ts`       | `configurable`                                                     |
| `ProductCard` («Elegir medida»)                                  | `chooseLabel`                                                      |
| Agrupar (`groupCorreas`, `shop.ts`, `search-server.ts`, landing) | `grupo === "correa"` (ya se guardaba, no se leía)                  |
| Backend: ruta de disponibilidad                                  | `grupo === "correa"`                                               |
| Backend: `validar-carrito` (medida y observaciones)              | la **variante** tiene `largo_m`                                    |
| `correas-plan`                                                   | escribe `diseno: "correa"` (y `grupo`, como antes)                 |
| `plantillas.ts` (`if (own === CORREA_TEMPLATE)`)                 | se quita                                                           |
| `catalog-sheet.ts`                                               | `diseno = correa` solo lo escribe `correas:sync`: error en la hoja |

### 2.4 Reglas para todo diseño (`src/disenos/LEEME.md`)

1. **Precio y stock en vivo**: marcas de LiveSync (`data-pid`, `data-price`, `data-stock`…) y el `<LiveSync>` de la
   página (AGENTS §3.2). `BuyBox`/`Price`/`CatalogPage` las traen hechas.
2. **Sin JS propio** salvo excepción aprobada (AGENTS §3.4). `check:budget` falla si un diseño añade un bundle. Un
   `<script>` de un componente solo sale en las páginas que lo pintan (astro-docs, _client-side-scripts_: desde Astro 5
   los scripts se renderizan donde se declaran).
3. **CSS**: un `<style>` en un diseño entraría en **todas** las páginas (el registro importa todos los diseños y el CSS
   va inline, R-3b). Por eso, igual que en AGENTS §3.3: CSS propio en `global.css` (o clases de Tailwind) y lo que
   dependa de los datos, con `HeadStyle` en el `<head>`. Esto corrige la regla 7 de la propuesta del 30-oct, que era
   anterior a la decisión de perf CSS.
4. **CSP**: nada de `style="…"` ni `on*=`.
5. **Mejora progresiva**: comprar, elegir variante y la lista de deseos funcionan sin JS.
6. **SEO y accesibilidad**: un `<h1>`, migas, `alt`; el JSON-LD lo pone la página común.
7. **Rendimiento**: LCP con `priority`, imágenes con `<ProductImage>`/`<Picture>`; Lighthouse móvil ≥ 95.

### 2.5 Widget del Admin

- Zonas: producto y categoría. La lista de zonas de 2.22 es `<entidad>.details` / `.details.side` (las `.before` /
  `.after` son legacy desde 2.17.2; context7, _admin-sdk AGENTS.md_). Los widgets actuales usan `.after`: se confirma
  en DS-0 qué zona usar con la versión instalada.
- Producto: desplegable «Diseño de la ficha» con «Heredado de la categoría (X)» + los diseños de ficha.
- Categoría: «Diseño de esta página» y «Diseño de sus productos».
- Guarda con las rutas del Admin (`POST /admin/products/:id` y `/admin/product-categories/:id`, solo la clave), como
  `entity-image.tsx`. Aviso en el widget: **el cambio se ve tras el siguiente build** de la tienda (las páginas son
  estáticas).
- `diseno = correa` no se ofrece en el desplegable (lo pone `correas:sync`); si el producto lo tiene, se muestra sin
  poder cambiarlo.

### 2.6 Validación

- `catalog:import`: ids con formato `a-z0-9-` **y** que existan en `lib/disenos.ts` del backend (el id de un diseño de
  categoría no vale en un producto y al revés).
- Storefront, en el build: id desconocido o de otro tipo → **error** con el producto o la categoría y el valor.
- Tests: herencia (producto → categoría → padres → estándar), ids iguales en backend y
  storefront.

## 3. Partes

| Parte                        | Qué                                                                                                                                                                                                                               | Estado |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| **DS-0 Spike**               | Componente dinámico con `server:defer` dentro, script solo donde se usa, CSS; zona del widget. Medido en un build.                                                                                                                | ✅     |
| **DS-1 Extraer `estandar`**  | `FichaData` + `CategoriaData` y los dos `Estandar.astro`. **Comprobación**: build antes y después + `diff` del HTML de todas las fichas y categorías (normalizando las props cifradas de las islands y los hashes): **idéntico**. | ✅     |
| **DS-2 Registro y herencia** | `lib/disenos.ts`, `resolveProductDesign`, `resolveCategoryDesign`, errores de build. Vitest.                                                                                                                                      | ✅     |
| **DS-3 Hojas**               | Columnas `diseno` y `diseno_productos` en `catalog:import` (+ dry-run) y LEEME.                                                                                                                                                   | ✅     |
| **DS-4 Correa**              | Diseño `correa` + tabla §2.3 en storefront y backend + `correas:sync` local y real.                                                                                                                                               | ✅     |
| **DS-5 Widget**              | Producto y categoría (§2.5).                                                                                                                                                                                                      | ✅     |
| **DS-6 Docs**                | `src/disenos/LEEME.md`, AGENTS §3.2, LEEME de las hojas, ESTADO, README §13, PENDIENTES.                                                                                                                                          | ✅     |

Sin dependencias nuevas, sin migraciones de base de datos y sin cambio de URL.

## 4. ¿Afecta al cliente?

Todo se decide en el **build**: qué diseño usa cada página, los datos y el HTML. El navegador recibe lo mismo que hoy
(HTML estático + CSS inline + los mismos bundles). Lo que pese cada página depende de lo que lleve su diseño. El
servidor (búsqueda, LiveSync, actions) solo lee propiedades de `lib/disenos.ts` (sin coste medible).

## 5. Decisiones tomadas

| Decisión                                                                                  | Motivo                                                                                              | Fuente                              |
| ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ----------------------------------- |
| Campo `diseno` (no `plantilla`, no `especial`)                                            | `plantilla` ya es el contenido de la Fase O; un marcador «especial» sería un diseño con otro nombre | conversación 3-nov-2026             |
| Fichas **y** categorías, con herencia `diseno_productos`                                  | Generalizar ahora: luego habría que volver a escarbar en el mismo código                            | usuario                             |
| Sin herencia entre páginas de categoría                                                   | Evitar que una landing especial se copie a las hijas                                                | propuesta, revisable                |
| Widget en el Admin                                                                        | Más fácil que escribir la metadata a mano                                                           | usuario                             |
| Sin diseño de ejemplo                                                                     | La correa ya prueba el sistema; el experimento de rendimiento se hace con la caja (CS)              | usuario                             |
| La correa deja `plantilla` y pasa a `diseno` + `grupo`; el backend valida por la variante | Un concepto por campo; el backend no conoce los diseños                                             | conversación 3-nov-2026             |
| CSS de los diseños en `global.css` / `HeadStyle`                                          | El registro importa todos los diseños y el CSS va inline                                            | AGENTS §3.3, astro-docs             |
| Componente elegido con una variable                                                       | Dynamic Tags (sin `client:*`)                                                                       | astro-docs _reference/astro-syntax_ |
| Sin retrocompatibilidad con `plantilla = "correa"`                                        | No hay producción que conservar: el próximo despliegue regenera los datos desde cero                | usuario                             |

## 6. Qué se ha hecho

**Storefront** (`apps/storefront`):

- `src/lib/disenos.ts` (y su test): `PRODUCT_DESIGNS` (`estandar`, `correa`), `CATEGORY_DESIGNS` (`estandar`),
  `resolveProductDesign`, `resolveCategoryDesign`, `productDesign` (servidor), `categoryDesignError`.
- `src/lib/ficha.ts` (`FichaData`) y `src/lib/categoria.ts` (`CategoriaData`).
- `src/disenos/producto/FichaLayout.astro` (esqueleto común), `Estandar.astro`, `Correa.astro`;
  `src/disenos/categoria/Estandar.astro`; `src/disenos/LEEME.md`.
- Páginas `producto/[handle].astro` y `categoria/[handle]/[...page].astro`: solo datos comunes + registro `DISENOS`
  (el registro va en la página: svelte-check no resuelve imports de `.astro` desde un `.ts`).
- `isCorrea()` = `productDesign(p).live === "correa"`; agrupar = `isCorreaGrouped()` (`grupo = "correa"`). Deseos,
  sugerencias del carrito, relacionados y tarjeta usan `configurable` y `elegir`. `plantillas.ts` sin el caso de la
  correa. Fixtures con `diseno: "correa"`.

**Backend** (`apps/backend`):

- `src/lib/disenos.ts` (copia idéntica; test en `catalog-import.unit.spec.ts`).
- `catalog:import`: `diseno` en productos (desconocido o reservado → error) y `diseno`/`diseno_productos` en
  categorías (solo heredables). La metadata de la categoría se manda **completa** (`mergedCategoryMetadata`): en 2.22
  se sustituye al actualizar.
- `correas:sync` escribe `diseno: "correa"`. `isCorrea()` (ruta de disponibilidad) = `grupo === "correa"`.
  `validar-carrito`: datos de la línea solo en variantes con `largo_m`.
- Widgets `product-design.tsx` (zona `product.details.side`) y `category-design.tsx`
  (`product_category.details.side`), con `admin/components/design-picker.tsx`. Comprobados en el Admin por el usuario.

**Comprobación de «sin cambios visibles»**: build antes y después y comparación de todo el HTML normalizando las props
cifradas de las islands, sus ids y los hashes de la CSP: 102 páginas con fixtures y **1264** con el catálogo local
(worktree de `main` construido con los mismos datos), 0 diferencias; manifiestos de `dist/server` idénticos.

## 7. Cómo testear esta fase

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
pnpm --filter storefront check:budget       # OK, sin bundles nuevos (CorreaLive 788 B)
pnpm --filter storefront test:e2e           # 278 pasan, 16 se saltan (pagos solo en escritorio…)
pnpm --filter backend correas:sync catalog/plantilla/correas dry-run   # «0 con cambios»
# Hoja: una categoría con diseno_productos = estandar → dry-run «diseño de sus productos»
# Admin: ficha de un producto → «Diseño de la ficha en la tienda»; de una categoría → «Diseños en la tienda»
```

Resultados (3-nov-2026): backend unit 145, storefront unit 338, emails 24, e2e 278 + 16 saltados.

## 8. Criterio de salida

- [x] HTML de fichas y categorías idéntico al de antes con `estandar` (salvo props cifradas y hashes).
- [x] La correa funciona igual (ficha, landing, tarjeta, búsqueda, carrito, pedido, email) con `diseno = correa`.
- [x] Nada lee ya `plantilla = "correa"`.
- [x] Id de diseño desconocido → error en `catalog:import` y en el build.
- [x] Widget en producto y categoría.
- [x] lint, typecheck, test, build, `check:budget` y e2e en verde.

## 9. Pendientes / riesgos

- La BD local tiene ya las correas con `diseno`. La del entorno «real» y la de prueba del VPS no: ejecutar
  `correas:sync` en ellas (o regenerarlas) antes de usarlas con esta versión.
- `grupo` solo admite `correa` (landing propia). Grupos genéricos (otra landing): cuando haga falta.
- Cambiar un diseño en el Admin no se ve hasta el siguiente build (rebuild por webhook: fase 13).
