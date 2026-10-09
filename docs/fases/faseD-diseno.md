# Fase D — Cambios de diseño (afinar colores, interfaz y detalles)

> **Estado:** ✅ completada (12-oct-2026)
> **Rama/PR:** `feat/d-diseno` (desde `main` = `34b17ab`) · PR por abrir
> **Anterior:** [I-Interficie](./faseI-interficie.md) · **Siguiente:** Fase 8 (Emails)

## 0. Punto de partida (tras I-Marca e I-Interficie)

- **Tokens** en `apps/storefront/src/styles/global.css`: `:root` (claro, crema `#F3E8DC`) y oscuro duplicado en `[data-theme="dark"]` y `@media (prefers-color-scheme: dark)` (pizarra `#26343C`). Cada color en `oklch` **con su hex en comentario**: lo leen `src/lib/theme.test.ts` (contraste AA de 17 pares) y `stripe-theme.test.ts` (Stripe no admite oklch). Cómo usarlos: [faseI-marca.md](./faseI-marca.md) §4.
- **Estilo Retro 80**: `--radius: 0`, `--line`, sombras sólidas `shadow-*`; fuentes Baloo 2 (titulares) + Nunito Sans (texto), solo se precarga Nunito 400.
- **Componentes de layout**: `src/components/layout/` (`AnnouncementBar`, `SiteHeader`, `SiteFooter`); precio en `components/Price.astro`; tarjeta `ProductCard.astro`; ficha `BuyBox.astro`; estilos propios al final de `global.css` (`.announce`, `.site-header`, `.nav-menu`, `.mobile-menu`, `.carousel`, `.price`, `.prose-page`).
- **Contenido editorial**: `src/content/` (`anuncios.yaml`, `home.yaml`, `tienda.yaml`, `paginas/*.md`). Hero con imagen **provisional** (el logo).
- **JS por página**: `CartClient` 992 B + `SiteClient` 1203 B (≤ 1536) + inline ≤ 1144 B (≤ 1434). Un cambio de diseño **no debería** añadir JS; si lo necesita, va en `SiteClient` o pide excepción (AGENTS §3.4).
- **Lighthouse** de referencia (móvil, local): Perf 95–99, A11y 100, SEO 100 ([faseI-interficie.md](./faseI-interficie.md) §5.1).

## 1. Objetivos (lista del usuario, plan aprobado)

**Bloque 1 — solo CSS (0 JS)**

- [x] 1.1 Hover de botones con más contraste: variante 4 de `/estilo/` (se hunde 2 px + sombra xs, y el color se mezcla con el texto: `btn-hover-*` en `global.css`, `button.svelte`).
- [x] 1.2 Coherencia «Añadir» / «Elegir opciones»: par 2, los dos azules (`ProductCard.astro`).
- [x] 1.3 Hover de la cabecera (menú, lupa, tema, carrito, ☰) igual en todos: claro = gris de siempre (`--muted`) + contorno de 2 px (`inset`, no mueve nada); oscuro = azul claro (`--secondary`). Tokens `--header-hover-*`, clase `.header-hover`. El azul claro sobre crema se descartó (revisión del usuario).
- [x] 1.4 Banner de ofertas en oscuro: la variante `outline` fija `text-foreground` (ya no hereda el texto del banner).
- [x] 1.5 Imágenes del carrito (flyout y página) con marco y sombra retro.
- [x] 1.6 Galería de la ficha: marco y sombra retro. Una foto por vista con snap y scroll (se probó el 85 % con la siguiente asomando y el usuario lo descartó). Miniaturas con sombra negra: el gris era el `ring-offset` (blanco) de Tailwind, siempre activo; ahora solo con foco.
- [x] 1.7 Carruseles: 4,3 tarjetas en escritorio y 2,3 en móvil; barra de scroll visible con colores de marca; flechas `::scroll-button` (solo Chromium; mejora progresiva). En móvil, separación de 1,25 rem (17 px visibles tras la sombra) y la fila cantidad + «Añadir» baja de línea si no cabe (a 360 px se salía 4 px).
- [x] 1.8 Ficha: variante agotada atenuada por color (`--muted-foreground`, mantiene AA; con `opacity` Lighthouse marcaba contraste) y sin clic.
- [x] 1.9 Listado: producto agotado atenuado (imagen con `opacity`, texto por color) y sin selector de cantidad (también en la ficha). Productos con varias variantes y todas agotadas: botón «Agotado» desactivado en lugar de «Elegir opciones» (antes no salía ninguno; p. ej. Aceite de oliva Ligero 463).
- [x] 1.10 Panel de filtros en móvil: el pie no se desplaza; solo hace scroll la lista. Causa (Playwright, Pixel 7): las `<legend class="sr-only">` (absolutas) desbordaban el panel; `.filter-panel__body { position: relative }`.

**Bloque 2 — página temporal `/estilo/`** ✅ hecha y **borrada** (commit «ajustes tras revisión»; no llega a `main`): bordes en oscuro (actual, `rgba(105, 75, 135, 0.20)`, `rgba(50, 105, 95, 0.18)`, sus equivalentes opacos y una opción clara, con contraste medido) y variantes de hover/estilo de botones. Decide el usuario.

**Bloque 3 — JS pequeño** (reevaluar si crece más de lo estimado)

- [x] 3.1 Clic fuera de un popover: solo cierra (`SiteClient`): si el `pointerdown` empieza fuera de todo popover `auto` abierto y no en su botón, se anula el `click` siguiente (fase de captura). Con teclado no cambia nada. Sin JS, como antes.
- [x] 3.2 Panel del carrito (opción **A**): el `<dialog>` modal pasa a `popover`. En móvil y escritorio, lateral derecho a toda altura (móvil 88 %, máx. 26 rem), sobre el icono; se cierra con ✕, Escape o pulsando/tocando fuera (ese clic no activa lo de debajo, 3.1). Se probó en móvil bajo la cabecera con el icono como interruptor y el usuario lo descartó. Al añadir: panel solo en escritorio; en móvil, el aviso. Sin JS: enlace a `/carrito/`.
- [x] 3.3 Cantidad − / + (`QuantityField.astro`, en tarjetas, ficha y `/carrito/`): los botones se muestran con CSS si `<html data-js>`, que pone el script inline del `<head>` (`theme-init.ts`) **antes de pintar** → sin salto de diseño (CLS); el clic lo maneja `SiteClient` (`stepUp`/`stepDown`, respetan min/max, lanzan `input` y `change`). Sin flechas nativas con JS; con el dedo `inputmode="none"` (sin teclado). Sin JS: el campo numérico de siempre.
- [x] 3.4 Arrastrar con el ratón (opción **i**): bundle propio `ScrollDrag` (361 B gzip, ≤ 1 KB) solo donde hay `[data-drag-scroll]`: carrusel de la home y galería de la ficha (con varias fotos). Sin snap mientras se arrastra; si se ha arrastrado (> 5 px) el clic se anula. Excepción y recordatorio para carruseles nuevos en AGENTS §3.4; `check:budget` lo exige y lo limita.

**Bloque 4 — `/buscar/`**

- [x] 4.1 Sin parpadeo: `SearchLive` ya no sustituye todo el contenedor; cambia el **contenido** del panel `#filtros` (mismo elemento: no se cierra ni vuelve a animarse) y sustituye `#resultados`, conservando el scroll de la lista. Si la estructura no coincide, todo como antes. Medido (Pixel 7): mismo elemento, 0 transiciones del panel (antes: elemento nuevo y 2 transiciones).
- [x] 4.2 «Aplicar precio» → **«Ver resultados»**: con JS cierra el panel y aplica (`hidePopover` + fragmento); sin JS, el formulario GET de siempre.

**Bloque 5 — carrito**

- [x] 5.1 Ofertas en el panel y en `/carrito/`: `items.compare_at_unit_price` en `CART_FULL_FIELDS`; con IVA como `unit_price` (`is_tax_inclusive`, comprobado en BD: 12,75 / 15,95). `Price.astro` sin `id` = precio estático (sin marcas de LiveSync); oferta solo si el anterior es mayor.
- [x] 5.2 «Actualizar» en variante secundaria (azul claro, más contraste que el borde); cantidad, «Actualizar» y «Quitar» en una línea también en móvil (medido: misma fila, sin desbordar).
- [x] 5.3 `CartLive` (625 B gzip, ≤ 1 KB, solo `/carrito/`, excepción aprobada): 500 ms tras el último cambio envía la línea por `fetch` (JSON del middleware), pide `/carrito/parcial/` (partial, astro-docs) y sustituye `[data-cart-view]`; «Quitar» igual; foco vuelve a la misma línea; contador y aviso `aria-live`. «Actualizar» se oculta solo cuando CartLive está cargado (`<html data-cart-live-on>`). Si falla → envío normal. Sin JS: los formularios de siempre.
- [x] 5.4 Panel: miniatura y nombre enlazan al producto; «Quitar» por línea (POST; con JS lo envía CartClient y recarga el panel sin cerrarlo). **Tres partes** (propuesta del usuario): cabecera fija, lista + totales con scroll, pie fijo con **total** y «Ver carrito» (medido, 5 líneas en 1280×700: pie 606–700 tras hacer scroll en la lista).

**Pendientes heredados** (decidir con el usuario más adelante): texto de «Sobre nosotros» y anuncios, foto del hero, logo en negativo, botón de pausa de la barra.

## 1.1 Decisiones del usuario (08-oct-2026)

| Decisión                          | Detalle                                                                                                                                                                                                                                                                                                    |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 3.1 JS pequeño para el clic fuera | `<dialog closedby>` no funciona en Safari (MDN BCD 8.1.4); reevaluar si pasa de lo estimado                                                                                                                                                                                                                |
| 3.2 Panel del carrito en móvil    | 85–90 % del ancho, bajo el botón del carrito (interruptor); añadir en móvil solo muestra el aviso                                                                                                                                                                                                          |
| 1.7 Carruseles                    | 4,3 / 2,3 tarjetas; flechas sí; arrastrar con ratón solo si es pequeño                                                                                                                                                                                                                                     |
| 3.3 Cantidad                      | − / + también en las tarjetas (por ahora)                                                                                                                                                                                                                                                                  |
| 1.1, 1.2, bordes                  | en `/estilo/` (11-oct-2026): oscuro con borde **H** `#8FA3AD` (4,89 sobre fondo, 3,75 sobre tarjeta) y sombra aparte **S1** `#05090B` (`--shadow-color`); hover **4**; par **2** (los dos azules). Descartados: los rgba del usuario (1,1:1, menos que el actual), opacos, rosa como borde con acento azul |
| 4.2                               | «Ver resultados»: aplica el precio y cierra                                                                                                                                                                                                                                                                |
| 5.3                               | 500 ms; solo en `/carrito/`                                                                                                                                                                                                                                                                                |
| 5.4                               | flyout: enlace al producto y «Quitar» por línea                                                                                                                                                                                                                                                            |
| Safari                            | **sin probar en esta máquina**: WebKit de Playwright no arranca en Arch (faltan ICU 74, libxml2 2 y otras); se quitó. Probar en otra máquina o más adelante                                                                                                                                                |

## 1.2 Hecho por bloque

**Bloque 1 + tokens de `/estilo/`** (commit «feat(storefront): bloque 1 de la Fase D»):

- **Tokens** (`global.css`): `--line` oscuro `#8FA3AD`; nuevo `--shadow-color` (claro = `--foreground`, oscuro `#05090B`) del que salen `--shadow-*`. Stripe en oscuro: borde de `.Input`/`.Tab` = `--line` (`stripe-theme.ts`, comprobado en `stripe-theme.test.ts`).
- **Test nuevo** en `theme.test.ts`: `--line` ≥ 3:1 (WCAG 1.4.11, contraste no textual) sobre fondo, tarjeta y muted, en claro y oscuro.
- **Hover de botones**: texto sobre el color de hover medido (AA): primario 7,0 / 9,3, secundario 6,1 / 5,0, destructivo 7,2 / 8,7 (claro / oscuro); el secundario mezcla menos (15 %) para no bajar de 4,5 en oscuro. Utilidades `@utility btn-hover-*` con `@media (hover: hover)` como la variante `hover:` de Tailwind v4 (context7 `/tailwindlabs/tailwindcss.com`).
- **Flechas del carrusel**: `::scroll-button(inline-start|inline-end)` con `content: "←" / "Anteriores"` (nombre accesible), colocadas con anchor positioning (context7 `/mdn/content`, guía de carruseles). Solo con `hover: hover`; el navegador las desactiva al llegar al final (se ocultan). Medido: árbol accesible con «Anteriores (disabled)» y «Siguientes»; el clic desplaza.
- **Medidas**: carrusel 4,42 tarjetas a 1280 px y 2,49 en Pixel 7 (412 px); galería una foto por vista (540/544 px, el resto deja ver la sombra) con `.avif`; JS sin cambios (`check:budget`: CartClient 992 B, SiteClient 1203 B, SearchLive 811 B). Lighthouse móvil local: home 95/100/100, ficha 99/100/100, `/productos/` 95/100/100, `/buscar/` 93/100 (SEO 69 por `noindex`, como antes); CLS ≤ 0,01. e2e 75 ✔ (3 de Stripe saltados sin la CLI).

**Bloque 3** (commit «feat(storefront): bloque 3 de la Fase D»):

- **JS** (`check:budget`): SiteClient 1203 → **1462 B** (≤ 1536), CartClient 992 → **977 B** (≤ 2048; sin el código del modal), ScrollDrag **361 B** (nuevo, ≤ 1024), inline +14 B (`data-js`). Dentro de lo estimado.
- **Medido** (Playwright, Chromium 153): menú Tienda abierto + clic en una tarjeta → se cierra y no navega; el segundo clic navega. Panel móvil (Pixel 7): lateral, 363/412 px a toda altura; tocar fuera lo cierra sin navegar. − / +: 1 → 3 → 1 (no baja del mínimo). Arrastre: galería avanza una foto (556 px), home desplaza 521 px sin abrir producto. Sin JS: sin botones − / +, flechas nativas, sin cursor de mano, el icono lleva a `/carrito/`.
- **e2e** nuevos: − / + y sin JS sin botones (`carrito.spec.ts`), panel también en móvil y clic fuera que solo cierra, clic fuera de un menú, arrastre del carrusel (`interficie.spec.ts`). 81 ✔ (5 saltados: Stripe sin CLI y los de escritorio en móvil).
- **Lighthouse** móvil: home 97/100/100, ficha 98/100/100 (CLS ≤ 0,01, TBT 0). `/productos/` 93–94: **igual que antes del bloque** (medido con el commit anterior: 91–94), variación local de esa página; no lo empeora este bloque.

**Bloque 4** (commit «feat(storefront): bloque 4 de la Fase D»): `SearchLive` 811 → **947 B** gzip (≤ 1024). e2e de `/buscar/` ampliados (panel = mismo elemento tras un filtro; «Ver resultados» lo cierra). Lighthouse `/buscar/?categoria=ropa` móvil: 94 / A11y 100, CLS 0,001.

**Bloque 5** (commit «feat(storefront): bloque 5 de la Fase D»): CartClient 977 → **1030 B** («Quitar» en el panel), **CartLive 625 B** (nuevo; `check:budget` lo mide y el e2e comprueba que `/carrito/` solo carga SiteClient + CartLive). Botones − / + renombrados «Una unidad más/menos de …» (antes «Añadir/Quitar una unidad», chocaba con «Quitar … del carrito» y «Añadir … al carrito»). e2e 87 ✔ (oferta tachada, «Quitar» en el panel, pie a la vista, actualización automática sin recargar, sin JS los formularios). Lighthouse móvil: `/carrito/` 98 / A11y 100, home 97 / 100.

## 2. Reglas para esta fase

- El agente **no puede ver imágenes**: el usuario revisa visualmente; el agente mide (DOM con Playwright, contraste por test, Lighthouse, `check:budget`).
- Todo color nuevo o cambiado: `oklch` + hex en el comentario, y `theme.test.ts` en verde (AA). Si afecta a Stripe, `stripe-theme.ts` igual.
- Sin dependencias nuevas salvo aprobación (AGENTS §1). Iconos: Phosphor 2.1.1 copiados en `src/lib/icons.ts`.
- No empeorar CLS ni LCP (candidatos a LCP: hero de la home, primera tarjeta de los listados).

## 3. Resultado final

| Medida (`check:budget`, gzip) | Inicio de la fase | Final      | Límite |
| ----------------------------- | ----------------- | ---------- | ------ |
| `SiteClient` (todas)          | 1203 B            | **1462 B** | 1536 B |
| `CartClient` (catálogo)       | 992 B             | **1030 B** | 2048 B |
| `SearchLive` (`/buscar/`)     | 811 B             | **947 B**  | 1024 B |
| `ScrollDrag` (carruseles)     | —                 | **361 B**  | 1024 B |
| `CartLive` (`/carrito/`)      | —                 | **625 B**  | 1024 B |
| JS inline                     | ≤ 1144 B          | +14 B      | 1434 B |

- Excepciones nuevas aprobadas en AGENTS §3.4: `ScrollDrag` (con el recordatorio para carruseles nuevos) y `CartLive`.
- Calidad: lint, format, typecheck, 133 tests unitarios, e2e **87 ✔** (escritorio + móvil, con y sin JS).
- Lighthouse móvil local: home 97, ficha 97–99, `/carrito/` 98, `/buscar/` 93–94 (como antes), todas A11y 100 y CLS ≤ 0,01.
- Sin dependencias nuevas ni cambios de versión: README §4 no cambia.

## 3.1 Criterio de salida

- [x] Bloques 1–5 hechos y revisados visualmente por el usuario; `/estilo/` borrada.
- [x] Colores nuevos en `oklch` + hex, `theme.test.ts` y `stripe-theme.test.ts` en verde.
- [x] Todo flujo del carrito y de los filtros funciona sin JS (e2e).
- [x] Presupuesto de JS dentro de los límites; CLS sin empeorar.

## 3.2 Pendientes / riesgos

- `/productos/` da 91–94 en Lighthouse local (ya antes de la fase): mirarlo aparte.
- Safari/WebKit sin probar en esta máquina (Arch); `::scroll-button` y `anchor-name` son mejora progresiva (solo Chromium).
- Heredados: textos de «Sobre nosotros» y anuncios, foto del hero, logo en negativo, botón de pausa de la barra.

## 4. Cómo testear (base)

```bash
pnpm infra:up && pnpm dev:backend
pnpm lint && pnpm format:check && pnpm typecheck && pnpm test   # incluye theme.test.ts (AA)
pnpm --filter storefront build && pnpm --filter storefront check:budget
pnpm --filter storefront start             # y en otra terminal:
pnpm --filter storefront test:e2e
```

## 5. Avisos

- Ver avisos de [faseI-interficie.md](./faseI-interficie.md) §7 y de I-Marca (`.astro/dev.json` si se queda `astro dev` colgado; `pnpm start` carga `.env`; `pnpm backend:stock:mock` si fallan los e2e de carrito por stock; `pnpm backend:seed:mock:ofertas` para tener ofertas y destacados).
- `medusa develop` puede quedarse con el hijo caído tras un `EADDRINUSE` (otro backend en :9000): parar los dos procesos `cli.js develop`/`start` y arrancar de nuevo.
