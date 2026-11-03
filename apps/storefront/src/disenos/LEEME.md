# Diseños (Fase DS)

Un **diseño** es el componente `.astro` que pinta la página **entera**: una ficha de producto (`producto/`) o la página de una categoría (`categoria/`). Plan y decisiones: [`docs/fases/faseDS-disenos.md`](../../../../docs/fases/faseDS-disenos.md).

| Pieza                                       | Qué hay                                                                                                                                                                         |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/disenos.ts`                        | Ids, propiedades (`heredable`, `configurable`, `elegir`, `live`, `selector`, `guias`, `reservado`) y reglas de elección. **Igual** en `apps/backend/src/lib/disenos.ts` (test). |
| `src/lib/ficha.ts` / `src/lib/categoria.ts` | Datos comunes que recibe cada diseño (`FichaData`, `CategoriaData`), preparados una vez por la página.                                                                          |
| `producto/FichaLayout.astro`                | Esqueleto común de las fichas: `<head>`, migas, galería, título y ♡, descatalogado, descripción, LiveSync y relacionados. Slots: por defecto (compra), `after`, `head`.         |
| `producto/*.astro`, `categoria/*.astro`     | Los diseños. Registro (id → componente) en `pages/producto/[handle].astro` y `pages/categoria/[handle]/[...page].astro`.                                                        |

## Cómo se elige

- **Ficha**: `metadata.diseno` del producto → `metadata.diseno_productos` de su categoría más concreta y de sus padres → `estandar`.
- **Categoría**: su `metadata.diseno` → `estandar` (sin herencia entre categorías).
- Se escribe en la hoja (`catalog:import`, columnas `diseno` y `diseno_productos`) o en el Admin (widgets del producto y de la categoría). Un id que no existe hace **fallar el build** con el producto o la categoría.
- Diseños **de producto** (`heredable: false`, p. ej. `correa`): cambian cómo se compra. Solo en el propio producto, nunca heredados: así el servidor (búsqueda, deseos, carrito, LiveSync) los reconoce con la metadata del producto (`productDesign`).

## Añadir un diseño

1. Su entrada en `src/lib/disenos.ts` y **copiar** el fichero a `apps/backend/src/lib/disenos.ts` (el test compara los dos).
2. El `.astro` en `producto/` o `categoria/` (una ficha, normalmente dentro de `<FichaLayout>`).
3. Su línea en el registro de la página (`DISENOS`; el tipo obliga a tenerlos todos).
4. Si es para la hoja o el Admin, aparece solo (los reservados no).

## Reglas para todo diseño

1. **Precio y stock en vivo**: marcas de LiveSync (`data-pid`, `data-price`, `data-stock`…) y un `<LiveSync>` en la página (AGENTS §3.2). `BuyBox`, `Price`, `CatalogPage` y `FichaLayout` las traen.
2. **Sin JS propio** salvo excepción aprobada (AGENTS §3.4): `check:budget` falla si aparece un bundle nuevo. Un `<script>` de un componente solo sale en las páginas que lo pintan (astro-docs, _client-side-scripts_).
3. **CSS**: nada de `<style>` en el diseño: el registro importa todos los diseños y el CSS va inline en **todas** las páginas. CSS propio en `global.css` (o Tailwind) y lo que dependa de los datos, con `HeadStyle` en el slot `head` (AGENTS §3.3).
4. **CSP**: nada de `style="…"` ni `on*=`.
5. **Mejora progresiva**: comprar, elegir variante y la lista de deseos funcionan sin JS.
6. **SEO y accesibilidad**: un `<h1>`, migas, `alt`; el JSON-LD lo pone la página común.
7. **Rendimiento**: LCP con `priority`, imágenes con `<ProductImage>`/`<Picture>`; Lighthouse móvil ≥ 95.
8. La etiqueta dinámica (`<Diseno … />`) **no admite `client:*`** (astro-docs, _Dynamic Tags_): las islas `server:defer` van dentro de componentes importados normalmente.
