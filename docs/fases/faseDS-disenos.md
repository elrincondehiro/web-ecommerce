# Fase DS — Diseños de ficha y de categoría (propuesta)

> **Estado:** ⏳ propuesta, **sin decidir** (30-oct-2026). Se decide tras el PR de `fix/ficha-movil`.
> **Rama/PR:** `feat/disenos` (cuando se apruebe) · PR #…
> **Anterior:** [Fase H — home](./faseH-home.md) · **Siguiente:** …

## 0. Qué es (y qué no)

- **Plantillas** (Fase O, ya existen): _contenido_ en Markdown (`src/content/plantillas/`, `src/content/guias/`) que sale **dentro** de la ficha estándar: texto común de una categoría, botón con panel (flyout), guía de tallas. No cambian la estructura de la página.
- **Diseños** (esta fase): el _componente `.astro` que pinta la página entera_. Un producto (o una categoría) marcado con `diseno = sin-galeria` se genera con `src/disenos/producto/SinGaleria.astro` en vez de con la ficha estándar; `producto-increible` podría usar las fotos como fondo, animaciones, otra disposición… Conviven con las plantillas (un diseño puede pintar o no `<ProductGuides>`).

## 1. Objetivos

- [ ] Elegir el diseño por producto y por categoría desde la hoja del catálogo y el Admin.
- [ ] La ficha y la categoría actuales pasan a ser el diseño `estandar`, **sin ningún cambio visible** (e2e y Lighthouse iguales).
- [ ] Un diseño nuevo = un fichero `.astro` + una línea en el registro; recibe los datos ya preparados.
- [ ] Error de build si un producto pide un diseño que no existe (como `home.yaml`).
- [ ] 0 KB de JS nuevo por usar el sistema (§4).

## 2. Diseño técnico

### 2.1 Dónde se elige

| Entidad   | Campo                                  | Hoja                          | Admin                                          |
| --------- | -------------------------------------- | ----------------------------- | ---------------------------------------------- |
| Producto  | `metadata.diseno`                      | columna `diseno` (productos)  | Metadata del producto (o widget con un select) |
| Categoría | `metadata.diseno` (su página)          | columna `diseno` (categorías) | Metadata de la categoría                       |
| Categoría | `metadata.diseno_productos` (opcional) | columna `diseno_productos`    | ídem: diseño por defecto de sus productos      |

Prioridad para un producto: el suyo → `diseno_productos` de su categoría más concreta (y de sus padres, hacia arriba) → `estandar`. `-` en la hoja = quitarlo (convención de `catalog:import`).

### 2.2 Estructura

```
src/disenos/
  producto/
    Estandar.astro        ← lo que hoy está en pages/producto/[handle].astro (maquetación)
    SinGaleria.astro      ← ejemplo
  categoria/
    Estandar.astro        ← lo que hoy está en pages/categoria/[handle]/[...page].astro
  index.ts                ← registro: { "estandar": Estandar, "sin-galeria": SinGaleria }
src/lib/disenos.ts        ← resolveDesign(product, tree) + validación (puras, con tests)
```

- `pages/producto/[handle].astro` se queda con lo **común**: `getStaticPaths`, preparación de datos (precios, selector, fotos, relacionados, plantillas, guías, SEO/JSON-LD, LiveSync) en un objeto `FichaData` tipado, y `<Diseno {...data} />` con el componente del registro.
- Cada diseño recibe `FichaData` y decide la maquetación, reutilizando o no los componentes existentes (`BuyBox`, `ProductGallery`, `RichText`, `RelatedProducts`, `AnalyticsTable`, `ProductGuides`…).
- Astro admite elegir el componente en tiempo de render con una variable (`const Diseno = DISENOS[id]; <Diseno … />`); como las páginas son estáticas, se resuelve en el **build**. Fuente a confirmar al implementar: astro-docs (basics/astro-components, dynamic tags).

### 2.3 Reglas para todo diseño (se documentarán en `src/disenos/LEEME.md`)

1. **Precio y stock en vivo**: mantener las marcas de LiveSync (`data-pid`, `data-price`, `data-stock`, `data-if-stock`…) y el `<LiveSync>` de la página (AGENTS §3.2). Usar `BuyBox`/`Price` las trae hechas.
2. **Sin JS propio** salvo excepción aprobada (AGENTS §3.4): `check:budget` falla si un diseño añade un bundle. Animaciones con CSS (`@keyframes`, `animation-timeline: scroll()`/`view()`, `@starting-style`, view transitions).
3. **CSP**: nada de `style="…"` ni `on*=`; CSS en clases (Tailwind o `global.css`) o `<style>` del componente (Astro lo empaqueta).
4. **Mejora progresiva**: comprar, elegir variante y la lista de deseos funcionan sin JS (los componentes existentes ya lo hacen).
5. **SEO y accesibilidad**: un `<h1>` con el título, migas, `alt`; el JSON-LD lo pone la página común.
6. **Rendimiento**: la LCP (foto o título) con `priority`; imágenes con `<ProductImage>`/`<Picture>` (AVIF/WebP). Un fondo con la foto: `<Picture>` con `object-cover` detrás, no `background-image` con una URL sin optimizar. Lighthouse móvil ≥ 95 también en las fichas con diseño propio.
7. **CSS por página**: el CSS va inline en el HTML (`inlineStylesheets: "always"`, Fase R-3b). El CSS de un diseño (su `<style>` o clases nuevas) se descarga en **las páginas que lo usan** si va en el componente; si va en `global.css`, en todas. Preferir el `<style>` del componente.

### 2.4 Validación

- `catalog:import` comprueba que `diseno`/`diseno_productos` son ids con formato válido (`a-z0-9-`). El storefront valida contra el registro en el build: id desconocido → **error de build** con el producto y el valor (nunca una ficha rota en producción).
- Test unitario de `resolveDesign` (prioridad producto → categoría → padres → estándar).
- e2e: un producto de prueba con `sin-galeria` no tiene galería y sigue pudiendo añadirse al carrito, con y sin JS.

## 3. Trabajo estimado

1. Extraer la ficha actual a `disenos/producto/Estandar.astro` + `FichaData` (sin cambio visible; e2e completos).
2. Registro, `resolveDesign`, validación y herencia (tests).
3. Lo mismo para la página de categoría.
4. Columnas `diseno` y `diseno_productos` en `catalog:import` (+ dry-run), LEEME de la plantilla y `src/disenos/LEEME.md` con las reglas.
5. Un diseño de ejemplo (`SinGaleria`) con su e2e.

Tamaño parecido a la Fase H (a+b). Sin dependencias nuevas.

## 4. ¿Afecta al cliente? (build time)

Todo se decide en el **build**: qué diseño usa cada página, los datos y el HTML. El navegador recibe el mismo tipo de página que hoy (HTML estático + CSS inline + los mismos bundles), así que **el sistema en sí no añade nada** al cliente: ni JS, ni peticiones, ni tiempo de carga. Lo que pese cada página depende de **lo que lleve su diseño** (más fotos, CSS de animaciones…), igual que si se cambiara la ficha estándar. Detalle en la respuesta del 30-oct-2026 y en §2.3 (reglas 2, 6 y 7).

## 5. Decisiones pendientes

- [ ] ¿Se implementa? (tras `fix/ficha-movil`).
- [ ] Nombre del campo: `diseno` (propuesto; evita confundirlo con las «plantillas» de la Fase O).
- [ ] ¿Herencia por categoría (`diseno_productos`) desde el principio o solo por producto?
- [ ] ¿Selector en el Admin (widget con la lista de diseños) o basta con Metadata?
- [ ] ¿Qué diseños concretos quieres primero (además de `estandar`)?
