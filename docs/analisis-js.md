# Análisis del JS de cliente y servidor (15-oct-2026)

> **Estado:** análisis, sin cambios de código. Hay que decidir §5 antes de tocar nada.
> **Base:** `main` en `e3df318` (después de #56). Build completo contra la BD local (384 páginas), servido con `pnpm start` (`dist/server/entry.mjs`).
> **Cómo se ha medido:**
>
> - `check:budget` (gzip de los ficheros de `/_astro/`);
> - el aporte de cada parte de un bundle: el bundle sin esa parte, compilado con el esbuild del monorepo (0.28.2, `--minify`) y comprimido;
> - el HTML y los tiempos con `curl` contra `localhost:4321`.

## 1. Resumen

1. **El reparto actual se hizo por los presupuestos, no por lo que necesita cada página.**
   - **CartClient** (1923 B, el 94 % de su límite) va en **todas** las páginas estáticas, incluidas las legales, «Sobre nosotros», la landing de la correa y `/cuenta/*`. Ahí solo hacen falta la cabecera (estado de la sesión e icono del carrito) y los toasts.
   - **SiteClient** (1495 B, el 97 %) lleva los botones −/+ de cantidad y el clic fuera de un popover, que en realidad solo usan las páginas con formularios de compra.
2. **El JS de cliente está bien acotado en general:** 0 islas de framework, todos los bundles en `/_astro/` con caché inmutable y menos de 4 KB por página. Ningún bundle se carga donde no hay nada que hacer, salvo lo del punto 1.
3. **El mayor coste no es el JS:**
   - **El HTML de los listados** pesa 282 KB sin comprimir (19 KB con gzip), con 24 tarjetas de ~9 KB cada una. Repartido así: 44 KB de SVG repetidos, 125 KB de atributos `class` y 41 KB de `srcset`. El coste en el navegador (parseo, DOM, memoria en móvil) es mayor que el de 2 KB de JS.
   - **El `LiveSyncData` de los listados** tarda unos **70 ms** por petición sin caché. Es la island cara: llama a Medusa con todas las variantes. HeaderState tarda unos 2 ms.
4. **En servidor no hay nada grave:**
   - el bundle de fixtures (`products.json`, 271 KB) va en la imagen pero no se carga en producción (`import()` dinámico);
   - el chunk `client.svelte` de 9,8 KB no lo carga ninguna página;
   - Svelte solo se usa para renderizar en servidor `Badge` y `Button` (shadcn-svelte).

## 2. JS de cliente

### 2.1 Qué carga cada página (build de `main`)

| Página                                             | Bundles                                 | Islands                   | JS inline (gzip) |
| -------------------------------------------------- | --------------------------------------- | ------------------------- | ---------------- |
| Home                                               | SiteClient, CartClient, ScrollDrag      | HeaderState, LiveSyncData | 1142 B           |
| Listados y categorías (`/productos/`, `/ofertas/`) | SiteClient, CartClient                  | HeaderState, LiveSyncData | 1142 B           |
| Ficha                                              | SiteClient, CartClient, ScrollDrag      | HeaderState, LiveSyncData | 1164 B           |
| Ficha de correa                                    | SiteClient, CartClient, CorreaLive      | HeaderState, LiveSyncData | ~1160 B          |
| Landing de la correa                               | SiteClient, CartClient                  | HeaderState, LiveSyncData | ~1140 B          |
| `/buscar/`                                         | SiteClient, CartClient, SearchLive      | HeaderState               | 612 B            |
| Legales, «Sobre nosotros», 404                     | SiteClient, **CartClient**              | HeaderState               | 609 B            |
| `/cuenta/*` (on-demand)                            | SiteClient, **CartClient**              | HeaderState               | 612 B            |
| `/carrito/`                                        | SiteClient, CartLive                    | — (servidor)              | 169 B            |
| `/checkout/`                                       | SiteClient, StripePayment (+ Stripe.js) | —                         | ~170 B           |

El **JS inline** es el mismo en todas las páginas estáticas (unos 1,2 KB):

| Script                                  | gzip  |
| --------------------------------------- | ----- |
| tema + `data-js` + pista de la cabecera | 169 B |
| runtime de las server islands           | 327 B |
| petición de HeaderState                 | 222 B |
| petición de LiveSyncData                | 295 B |
| aplicar LiveSync                        | 434 B |

### 2.2 Qué lleva cada bundle (aporte de cada parte, gzip)

Cada cifra es lo que se ahorraría al quitar esa parte. No suman el total, porque gzip comparte el diccionario entre partes.

**CartClient — 1966 B medidos (1923 B en `check:budget`):**

| Parte                                                                   | B    | Dónde hace falta de verdad                                            |
| ----------------------------------------------------------------------- | ---- | --------------------------------------------------------------------- |
| Envío de los formularios de compra, toasts, panel del carrito, contador | ~900 | páginas con `data-cart-form`: home, listados, fichas, lista de deseos |
| Toasts y evento `toast`                                                 | 219  | donde hay compra o lista de deseos                                    |
| **Estado de la cabecera** (pista, ♥ guardados, island)                  | 241  | **todas** las páginas con cabecera                                    |
| **Total del granel**                                                    | 206  | **solo las fichas de granel** (1 de 11 tipos de página)               |
| **Compartir la lista** (L-1b)                                           | 170  | **solo `/cuenta/deseos/`**                                            |
| Envío del ♡ (en `submit`)                                               | 112  | páginas con ♡                                                         |
| ♡ que sigue a la variante                                               | 63   | solo fichas con variantes                                             |
| Icono del carrito abre el panel                                         | 50   | todas las páginas con cabecera                                        |

**SiteClient — 1512 B medidos (1495 B en `check:budget`):**

| Parte                                      | B   | Dónde hace falta de verdad                                                       |
| ------------------------------------------ | --- | -------------------------------------------------------------------------------- |
| Sugerencias de la búsqueda                 | 728 | todas (la búsqueda está en la cabecera)                                          |
| Clic fuera de un popover + −/+ de cantidad | 258 | popover: todas (menú Tienda, menú móvil). −/+: fichas, carrito y lista de deseos |
| Selector de tema                           | 190 | todas                                                                            |
| Cabecera que se oculta al bajar            | 183 | todas                                                                            |

**Dónde no encajan las cosas:**

- **CartClient en páginas sin compra:** legales, «Sobre nosotros», 404, landing de la correa y `/cuenta/*` (salvo «deseos»). Allí solo se usan el estado de la cabecera y el icono del carrito, unos 300 B de los 1923.
  - Estas páginas son la mayoría de las visitas de quien entra a «cotillear»: las abre una vez.
  - El coste real es pequeño (caché inmutable: se descarga una vez por versión), pero se **ejecuta** en cada página.
- **El total del granel y compartir la lista** (376 B) van en CartClient para todos solo porque «es el único bundle de carrito permitido» (excepción de la fase 4).
- **El estado de la cabecera vive en CartClient**, aunque es de la cabecera (como el tema, que está en SiteClient). Por eso el carrito y el checkout, que no cargan CartClient, calculan ese estado en el servidor.
- **Los −/+ de cantidad en SiteClient**, que se carga en todas las páginas, para ahorrar presupuesto a CartClient.

### 2.3 Lo que está bien y no tocaría

- **CartLive, SearchLive, ScrollDrag y CorreaLive:** cada uno solo en su página, sin imports y por debajo de 1 KB.
- **StripePayment:** solo en el checkout.
- **El script del `<head>`:** tema, `data-js` y la pista antes de pintar. Es justo lo que tiene que ir inline.
- **El runtime de las server islands, inline:** lo genera Astro y no se puede mover a `/_astro/`.
- **Sin `import()` dinámico:** sigue valiendo lo de la fase 7 (§2.7.1). El helper de Vite añade unos 750 B, así que es mejor tener bundles separados por página que uno con trozos perezosos.

## 3. Islands y peticiones por página

| Island / ruta                | Tiempo (local, sin caché)                                                                                   | Caché                                      | Nota                                                                                     |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------ | ---------------------------------------------------------------------------------------- |
| HeaderState                  | ~2 ms (sin carrito ni sesión); con carrito y sesión, 2 llamadas a Medusa (`retrieveCart` + lista de deseos) | `private, no-store`                        | Correcto: es por usuario. En **todas** las páginas estáticas.                            |
| LiveSyncData (listado de 24) | **~70 ms**                                                                                                  | `public, max-age=30, s-maxage=60, swr=300` | Es la cara. Con la caché de Cloudflare (60 s + SWR) casi siempre se servirá desde caché. |
| `/buscar/`                   | ~20–60 ms                                                                                                   | `s-maxage=60, swr=300`                     | Correcto.                                                                                |
| `/buscar/sugerencias/`       | ~1–13 ms                                                                                                    | `max-age=60, s-maxage=60`                  | Correcto.                                                                                |
| `/carrito/`, `/cuenta/*`     | 2–6 ms (más Medusa)                                                                                         | `private, no-store`                        | Correcto.                                                                                |

**Para el pico del anuncio** (fase 11, prueba de carga):

- **LiveSyncData:** con caché en Cloudflare, Medusa recibe como mucho 1 petición por minuto y página de listado. **Hay que comprobar que Cloudflare la cachea de verdad**: sus URL llevan parámetros cifrados que cambian en cada build, pero dentro de un mismo build son estables.
- **HeaderState** no se puede cachear. Para un visitante nuevo, sin cookie de carrito ni sesión, no llama a Medusa (2 ms). Bien.
- **El HTML estático** (`public, max-age=0`) llega siempre al servidor: hace falta la regla de caché de Cloudflare (ya anotada para la fase 11).

## 4. JS de servidor (`dist/server`, 2,4 MB; 80 chunks)

| Chunk                              | Tamaño              | Qué es                                                              | ¿Problema?                                                                                                                                              |
| ---------------------------------- | ------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `entry.mjs` + `runtime` + `server` | ~1 MB               | Astro 7, zod y Svelte en servidor                                   | Normal. Se carga una vez al arrancar.                                                                                                                   |
| `products_*.mjs` (fixtures)        | 271 KB              | `src/lib/__fixtures__/products.json`                                | Solo disco: `import()` dinámico, nunca se carga en producción. Se podría excluir del build de producción.                                               |
| `card-images.json`                 | 341 KB              | manifiesto de imágenes de las tarjetas                              | Se lee en las rutas on-demand que pintan tarjetas (`/buscar/`, lista de deseos). Correcto, pero comprobar que se lee **una vez** y no en cada petición. |
| `client.svelte` (cliente)          | 9,8 KB              | runtime de hidratación de Svelte                                    | **Ninguna página lo carga.** Lo genera `@astrojs/svelte`. Solo ocupa la imagen.                                                                         |
| Svelte (servidor)                  | parte de `server_*` | para `Badge` y `Button` de shadcn-svelte, renderizados sin hidratar | Funciona, pero arrastra Svelte, `tailwind-variants` y `tailwind-merge` a un servidor que solo pinta dos componentes.                                    |

**El middleware** es barato: sin red, solo lee la cookie del token y aplica PRG a las actions. Correcto.

## 5. Propuestas (para decidir)

### P1 · Reparto de bundles por lo que necesita cada página — ❌ DESCARTADA (medida)

| Bundle                                                                      | Contenido                                                                                                                                                           | Dónde                                           |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| **SiteClient**                                                              | búsqueda, tema, cabecera que se oculta, clic fuera de popovers, **estado de la cabecera** (pista, cuenta, ♡, contador) y **el icono del carrito** que abre el panel | **todas** las páginas                           |
| **CartClient**                                                              | envío de los formularios de compra, toasts, panel, ♡ (envío y ♥ guardados de las tarjetas), **−/+ de cantidad**                                                     | solo páginas con `data-cart-form` o `data-wish` |
| **ProductClient** (nuevo, o dentro de CartClient con su propio presupuesto) | total del granel y ♡ que sigue a la variante                                                                                                                        | solo fichas                                     |
| **AccountClient** (nuevo)                                                   | compartir la lista                                                                                                                                                  | solo `/cuenta/deseos/`                          |

**Cifras estimadas:**

- **SiteClient:** ~1,8 KB (límite propuesto 2 KB). Cada página carga un solo bundle común, con todo lo de la cabecera.
- **CartClient:** ~1,3 KB, y ya no va en las legales, «Sobre nosotros», 404, landing de la correa ni `/cuenta/*`.
- **El estado de la cabecera** funciona también en carrito y checkout sin calcularlo en el servidor (se podría quitar el `server`-state de SiteHeader; sería opcional).
- **En total:** la home, los listados y las fichas cargan lo mismo o ~100 B más, porque se reparte. Las legales y la cuenta cargan **~1,2 KB menos**. Se elimina la presión de los límites.

**Coste:** reescribir el reparto en AGENTS §3.4 y `check:budget`, y ajustar los e2e que comprueban qué bundles carga cada página.

**Medición antes de decidir:**

- Configuración: `/condiciones/`, una página que no necesita CartClient; Pixel 7 con CPU 4× más lenta y 4G lento (la de Lighthouse); 6 cargas en frío por variante.
- Comparación: la página tal cual frente a la misma con CartClient bloqueado.

|                      | FCP    | DOM listo | Carga   | TBT  |
| -------------------- | ------ | --------- | ------- | ---- |
| Con CartClient (hoy) | 869 ms | 936 ms    | 1387 ms | 0 ms |
| Sin CartClient       | 837 ms | 863 ms    | 1352 ms | 0 ms |

- **Con caché**, CartClient se ejecuta en 0,9 ms (`/_astro/` inmutable): quien llega desde la home o un listado ya lo tiene.
- **La ganancia** solo existe en una primera visita directa a una página sin compra, y es de ~35–70 ms en un móvil lento, sin bloqueo del hilo.
- **El riesgo es alto:** toca los dos bundles que hacen casi todo (añadir, panel, lista, contador, estado de la sesión, toasts), comunicados por eventos.

**Decisión del usuario:** descartada. **Solo se sube el límite de SiteClient a 2 KB**, para tener margen y no repartir por falta de sitio.

- **Los toasts** siguen en CartClient. Ya son globales en todas las páginas con CartClient (todas las estáticas y la cuenta). Si un blog futuro sin CartClient los necesita, se mueven entonces a SiteClient (~220 B).
- **Revisar** solo si un bundle se acerca a su límite y la nueva función no le corresponde.

### P2 · Quitar `client.svelte` y el runtime de Svelte en servidor (opcional)

- **Hoy:** Svelte solo renderiza `Badge` y `Button` (shadcn-svelte), y en `.astro` ya se usan `buttonVariants` y `badgeVariants` directamente.
- **Propuesta:** dos componentes `.astro` equivalentes (mismas clases de `tailwind-variants`) y quitar `@astrojs/svelte`.
- **Se gana:** ~350 KB menos en el servidor, un build más rápido y nada de `client.svelte`.
- **Se pierde:** la puerta a islas Svelte (AGENTS §3.1 lo prevé para Stripe Elements con `client:only`, pero el checkout ya usa Stripe con JS propio). Además, quitar una integración necesita tu aprobación (AGENTS §1).
- **Mi opinión:** **no ahora.** Es un cambio de stack sin ganancia para el usuario final. Se puede revisar en la fase 13.

### P3 · HTML de los listados más ligero — ❌ DESCARTADA (medida)

- **SVG repetidos** (44 KB por listado): el ♡, el carrito y las estrellas de cada tarjeta se pintan en línea. Con un `<symbol>` por icono y `<use href="#…">` en cada tarjeta, quedarían ~5 KB.
- **Clases:** revisar las tarjetas (`ProductCard`) y pasar las combinaciones repetidas a componentes de Tailwind (`@apply` en una clase `.card-*`). Eso **sí** está permitido: es CSS en el build, no CSS-in-JS. Calculo -60 a -80 KB sin comprimir por listado.
- **`srcset`:** revisar si las tarjetas necesitan tantas anchuras.
- **Objetivo:** listados de < 150 KB sin comprimir. Menos parseo en móvil y un DOM más pequeño.

**Medición antes de decidir:**

- Al HTML real de `/productos/` se le aplicaron los dos cambios: 94 SVG pasan a 19 `<symbol>` + `<use>`, y las 5 cadenas de clases largas repetidas a una clase corta.
- Las dos versiones se sirvieron con el mismo CSS y JS en caché.
- Pixel 7 con la CPU 4× más lenta, mediana de 8 cargas.

|     | HTML   | gzip    | FCP    | DOM interactivo | Layout | Estilos | Tareas | Heap JS |
| --- | ------ | ------- | ------ | --------------- | ------ | ------- | ------ | ------- |
| Hoy | 282 KB | 19,8 KB | 132 ms | 265 ms          | 36 ms  | 49 ms   | 295 ms | 680 KB  |
| P3  | 179 KB | 18,4 KB | 116 ms | 254 ms          | 35 ms  | 45 ms   | 287 ms | 680 KB  |

- **Se ahorra** -1,4 KB de descarga y ~10–15 ms de procesado.
- **Lo caro** son las 24 tarjetas (imágenes, layout, estilos), no el tamaño del HTML, que se comprime muy bien.
- **El riesgo:** un `<use>` hacia un símbolo que no está en la página (on-demand, partials) se ve en blanco y no da ningún error.

**Decisión del usuario:** descartada.

### P4 · Servidor: fixtures fuera de producción y `card-images.json` leído una vez (pequeña)

- En el build de la imagen, excluir `__fixtures__` cuando `STOREFRONT_DATA` no sea `fixtures` (se puede resolver con `define` o un alias de Vite). Son -271 KB de imagen. Es poco, pero es limpio.
- Comprobar que el manifiesto de imágenes se lee una vez por proceso y no en cada petición. Si no, cachearlo en memoria.

### P5 · LiveSyncData (para la fase 11)

- Confirmar con Cloudflare que se cachea: `CF-Cache-Status: HIT` en la segunda petición.
- Si con la prueba de carga Medusa sufre, valorar la opción ya aparcada en ESTADO §7 (L-2): un resumen por producto precalculado en el backend, en Redis.

### P6 · Pequeños ajustes

- **El desplazamiento del menú de escritorio por la fuente web** (~0,0002, el último que queda):
  - el menú usa Nunito Sans **600** (`font-semibold`), y solo se precarga el peso del texto base (400);
  - el fallback con métricas ajustadas cubre la altura, pero no del todo el ancho de la negrita;
  - **opciones:** precargar también el 600 (unos 20 KB más en el arranque) o aceptarlo (es imperceptible).
  - Mi propuesta: aceptarlo.
- **La pista de la cabecera** se guarda en la página donde llega la island. Si al entrar en la cuenta se pone también desde el servidor (en la respuesta del login), desaparecería el último parpadeo, el de la primera página tras entrar. Unos 20 B de JS.

## 6. Orden propuesto

1. ~~**P1**~~: descartada tras medirla (ver arriba). Solo se sube el límite de SiteClient a 2 KB.
2. ~~**P3**~~: descartada tras medirla (ver arriba).
3. **P4** (fixtures fuera de la imagen, por limpieza) y **P6** (la pista de la cabecera se guarda al entrar en la cuenta): hechas en esta PR (§7).
4. **P5:** en la fase 11, con la prueba de carga.
5. **P2:** se aparca.

## 7. Conclusión y lo hecho en esta PR

- **Lo que hay está muy cerca de lo óptimo** para esta web:
  - el JS es pequeño y se carga donde toca, sin bloquear el hilo;
  - el HTML se comprime muy bien.
- **P1 y P3**, medidas y descartadas: ganan entre 10 y 70 ms en un móvil lento, y el riesgo de romper algo no lo compensa.
- **Lo que sí importa para el rendimiento real** está en la fase 11:
  - la caché de Cloudflare del HTML estático y de `LiveSyncData` (P5);
  - la prueba de carga.
- **Hecho en esta PR:**
  - **SiteClient** con límite de 2 KB (`check:budget`, e2e de sugerencias, AGENTS §3.4).
  - **P4:** las fixtures fuera del build de producción.
    - `astro.config.mjs` define `import.meta.env.USE_FIXTURES` (variable de entorno o `.env`) y `lib/medusa.ts` lo usa en `useFixtures`.
    - Con `medusa`, los `import()` de `__fixtures__` son código muerto y no entran: `dist/server` baja de 2,4 a 2,1 MB.
    - Con `STOREFRONT_DATA=fixtures` (el CI) se construyen igual (100 páginas, `check:budget` OK).
  - **P6:** en las páginas on-demand, `BaseLayout` pone `<html data-auth>` desde el servidor si hay sesión (la cookie la lee el middleware, sin red).
    - Tras entrar, `/cuenta/` sale ya con el icono de sesión sin esperar al JS, y su CartClient guarda la pista para la primera página estática siguiente.
    - Antes, la primera página estática después de entrar aún parpadeaba.
    - e2e en `deseos.spec.ts`.
