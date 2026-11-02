# Fase CSS — CSS por página (optimización)

> **Estado:** ✅ decidido el 2-nov-2026: se aplica **todo menos el reparto en ficheros por componente**. Rama `perf/css-por-pagina` (sale de `feat/familias-opciones`).

## 1. Objetivo

Que cada página descargue solo el CSS que usa, sin perder nada (ni visual ni funcional). Pedido por el usuario tras la pasada de Lighthouse de la Fase FO: «optimización radical del CSS… que se carguen las cosas donde correspondan», también sus propios cambios visuales.

## 2. Diagnóstico (build de los mocks, 1261 páginas)

- Todas las páginas llevaban **el mismo CSS** dentro del HTML (Fase R-3b, `inlineStylesheets: "always"`): **70 KB, 13,1 KB gzip, 11,4 KB brotli** = 36 % (home) a 60 % (404) del HTML. Las fichas, 9 KB más (el selector).
- Cobertura real (Chromium `CSS.startRuleUsageTracking`, recorrido por todas las zonas en móvil/escritorio, claro/oscuro, menús, filtros, sugerencias, carrito con producto, checkout): cada página usa ~9 de los 13 KB gzip.
- Sobraba, por página:

| Bloque                                                                 | Dónde sobraba                     | brotli |
| ---------------------------------------------------------------------- | --------------------------------- | ------ |
| CSS del selector (`variant-picker.css`, siempre para 20 valores)       | 913 de 1057 fichas (sin selector) | ~615 B |
| Panel de filtros, «Solo disponibles», casillas, puntos de familia      | todo menos listados y `/buscar/`  | ~715 B |
| Carrusel                                                               | todo menos home y fichas          | ~320 B |
| Prosa y descripciones (`prose-page`, `rich-text`)                      | carrito, checkout, legales…       | ~290 B |
| Pago y checkout                                                        | todo menos checkout               | ~200 B |
| `tw-animate-css` (dependencia): **ninguna** clase usada, ~70 variables | todas                             | ~180 B |
| Filas de chips/categorías, carrito, correa, alias `sidebar/chart`      | varias                            | ~400 B |

- **No se toca** (decisión): las utilidades de Tailwind son un único fichero; solo 81 de 431 reglas no salen en el HTML estático y casi todas son del área privada. Dividirlas con `source()` por zonas duplicaría o perdería las clases compartidas por ~320 B gzip. Preflight, tema, `@property` de Tailwind y los componentes de todas las páginas (cabecera, menús, avisos, toasts, flyout, sugerencias) se usan en todas.

## 3. Qué se ha hecho (un commit por bloque, revertibles)

1. `c947093` (en `feat/familias-opciones`): colores de familias fuera de `global.css` → `HeadStyle` de las páginas con filtros (las de su panel; `/buscar/`, las del catálogo porque SearchLive cambia el panel sin recargar y la CSP no aplicaría un `<style>` nuevo).
2. `8ce30b3`: **selector de la ficha**. `pickerHeadCss(picker)` = reglas de **sus** posiciones (`pickerCss(n)`, n = valores de la opción A) + colores de sus muestras, en el `<head>` de cada ficha con selector (`HeadStyle`, hash en la CSP). Se borra `styles/variant-picker.css` (fichero generado y su test de «al día»). Antes: 9,3 KB (20 posiciones) en las 1057 fichas.
3. `13774fa`: **`tw-animate-css` eliminado** (`pnpm --filter storefront remove`), aprobado por el usuario.
4. `6828953`: **CSS por componente**. `global.css` queda como núcleo y lo demás va a `src/styles/components/*.css`, importado desde el frontmatter del componente que lo usa (astro-docs, _Styles and CSS › Bundle control_: cada página lleva el CSS de los componentes que pinta):
   - `filters.css` ← `FilterPanel` · `scroll-rows.css` ← `ActiveFilters`, `CategoryNav` · `carousel.css` ← `HomeCarousel`, `RelatedProducts` · `prose.css` ← `RichText`, `ProductGuides`, `sobre-nosotros`, `correa-a-medida` (incluye los `--prose-mark` del usuario: el token sigue en los bloques de tema de `global.css`, solo se mueven las reglas que lo usan) · `checkout.css` ← checkout y `StripePayment` · `cart.css` ← `CartView` · `correa.css` ← `ColorPicker` · `variant-picker.css` ← `VariantPicker` (rayas y foto en gris de las agotadas).
   - Fuera los alias `--chart-*` / `--sidebar-*` (tokens de shadcn sin uso; se recrean si un día se añade un componente que los use).
   - `.swatch` sigue en el núcleo (selector de la ficha y correa). `.cart-notice` también (avisos sin JS en todas las páginas).
   - `var(--color-*)` → `var(--*)` en `checkout.css` (las de Tailwind solo existen si alguna utilidad las usa).
   - Sin `@apply` ni `theme()`: CSS normal con variables del tema (recomendación de Tailwind v4, _compatibility_: los ficheros separados no ven el tema).

## 4. Resultado

**CSS por página** (bytes del `<style>`, brotli):

| Página                   | Antes            | Ahora            | Ahorro               |
| ------------------------ | ---------------- | ---------------- | -------------------- |
| Home                     | 11,77 KB         | 10,22 KB         | **−1,54 KB (−13 %)** |
| `/productos/`            | 11,83 KB         | 10,68 KB         | −1,16 KB             |
| Categoría                | 11,83 KB         | 10,98 KB         | −0,85 KB             |
| Colección                | 11,77 KB         | 10,81 KB         | −0,95 KB             |
| Ficha con selector       | 12,25 KB         | 10,86 KB         | −1,39 KB             |
| Ficha sin selector       | 12,25 KB         | 10,69 KB         | **−1,55 KB (−13 %)** |
| Correa (landing / ficha) | 11,89 / 12,27 KB | 10,36 / 10,74 KB | −1,5 KB              |
| Sobre nosotros           | 11,77 KB         | 10,20 KB         | −1,56 KB             |
| Cookies, 404             | 11,77 KB         | 9,89 KB          | **−1,87 KB (−16 %)** |

**Visual**: 94 capturas (18 páginas + filtros, menú, sugerencias, flyout con producto, carrito y checkout; móvil y escritorio; claro y oscuro) antes y después: **0 píxeles distintos**; 0 violaciones de CSP. El comparador se comprobó con un par distinto (lo detecta).

**Tests**: e2e 274 pasan y 16 se saltan (igual que antes), unit 330, typecheck, lint y `check:budget` OK.

**Lighthouse móvil** (12.6.1, mediana de 5, base y rama alternadas, mismo servidor con brotli): todas siguen en **100 / 100 / 100** (ficha de pienso 99 en las dos; SEO 69 en `noindex`). Las diferencias de LCP (±0,15 s) son ruido: van en los dos sentidos y no tienen relación con los bytes (p. ej. home 1,51 → 1,66 s y `/productos/` 1,81 → 1,50 s).

**Recorrido real** (Chromium, 4G lento por CDP 150 ms / 1,6 Mbps, CPU 4×, móvil; 10 repeticiones alternadas): home → categoría → 2 fichas → sobre nosotros → cookies:

- LCP total: 4520 → 4524 ms (igual: la LCP la marcan las imágenes, no el CSS).
- **Bytes de los 6 HTML: 164,2 → 156,3 KB brotli (−7,9 KB, −4,8 %)** en cada recorrido; los mismos ahorros en cada navegación (el CSS va inline y no se cachea entre páginas).

Conclusión: **misma velocidad percibida en las medidas** (no había cuello de botella en el CSS), **menos datos por visita** (−1 a −1,9 KB por página, ~5 % del HTML) y el CSS ordenado por responsabilidad (cada componente trae lo suyo; el núcleo solo lo común).

## 5. Riesgos y pendientes

- Un componente nuevo que use una clase de `src/styles/components/X.css` sin importar el fichero saldría sin estilo. Regla en AGENTS §3.3 (importarlo desde el frontmatter del componente que lo usa).
- Las capturas cubren 18 páginas + 6 estados; el área de cuenta con sesión, pedidos y mascotas no se ha capturado (sin cambios de CSS en esa zona: solo usan utilidades y el núcleo, que no se ha tocado salvo los alias sin uso).

## 6. Cómo testear

```bash
pnpm --filter storefront build && pnpm --filter storefront check:budget
pnpm --filter storefront test
E2E_BASE_URL=http://localhost:4398 pnpm --filter storefront exec playwright test
```

## 7. Decisión (usuario, 2-nov-2026)

Pregunta del usuario: ¿es útil para quien compra o complica el desarrollo por poca ganancia?

- **Para el usuario final**, el reparto por componente no se nota: misma LCP (4520 → 4524 ms en el recorrido), Lighthouse 100 igual; −0,9 a −1,9 KB por página son ~5–10 ms en 4G lento (0,5–1 % del peso de la página, que es sobre todo imágenes).
- **En desarrollo** cuesta: 9 ficheros en vez de uno, un import que hay que recordar en cada componente nuevo y un fallo **silencioso** (una clase de `prose.css` usada sin importarlo se ve bien donde otro componente ya lo importa y sin estilo en el resto).

Se aplica:

| Cambio                                         | Ganancia                       | Coste                                                       |
| ---------------------------------------------- | ------------------------------ | ----------------------------------------------------------- |
| Quitar `tw-animate-css`                        | ~180 B en todas, 1 dependencia | ninguno                                                     |
| Quitar alias `sidebar/chart`                   | ~75 B en todas                 | ninguno                                                     |
| CSS del selector en el `<head>` de sus fichas  | ~600 B en 913 fichas           | **simplifica** (sin fichero generado ni `PICKER_CSS=write`) |
| Colores de familias solo con filtros (rama FO) | ~190 B                         | ninguno                                                     |

**No se aplica** el reparto por componente (`6828953`, revertido en esta rama; el CSS propio vuelve a `global.css`). Regla en AGENTS §3.3: CSS propio en `global.css`; lo que depende de los datos de una página, en su `<head>` (`HeadStyle`).

Si un día hace falta ganar en lo que nota el usuario, el margen está en las imágenes (marcan la LCP) y en la carga de las server islands, no en el CSS.
