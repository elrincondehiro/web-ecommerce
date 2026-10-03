# Fase 3 — Storefront base (Astro)

> **Estado:** ✅ terminada (03-oct-2026)
> **Rama/PR:** `feat/fase3-storefront-base` · PR #12 (squash `84293e2`); al final se entregó en un solo PR
> **Anterior:** [Fase 2](./fase2.md) · **Siguiente:** Fase 4 (carrito)

## 1. Objetivos

- [x] `apps/storefront`: Astro 7.3.5 + Svelte 5.57.1 + Tailwind 4.3.3 + shadcn-svelte 1.7.0 (bits-ui 2.19.3), adapter `@astrojs/node` 11.1.6 standalone.
- [x] Home, listado paginado, categorías y ficha **estáticos** desde la Store API (`@medusajs/js-sdk` 2.21.2).
- [x] Precio (con IVA) y stock en **server islands**, con fallback estático.
- [x] SEO: title/description/canonical, Open Graph, JSON-LD (`WebSite`, `BreadcrumbList`, `Product`), sitemap y `robots.txt`.
- [x] Fuente Inter auto-alojada (Fonts API) e imágenes con dimensiones fijas (placeholder local).
- [x] Lint/format/typecheck/test del storefront, más una comprobación del presupuesto de JS en CI.
- [x] Lighthouse móvil ≥ 95 y **0 bundles JS** en home/listado/ficha (resultados en §5).

## 2. Qué se ha hecho

**Estructura (`apps/storefront`)**

| Ruta                                            | Qué                                                                                                          |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `astro.config.mjs`                              | adapter node, svelte, sitemap, Tailwind (vite), Fonts API, `astro:env`, `$lib`                               |
| `src/lib/medusa.ts`                             | única puerta al backend (SDK); modo `fixtures`                                                               |
| `src/lib/catalog.ts` · `format.ts` · `seo.ts`   | funciones puras (precio mínimo, stock, paginación, JSON-LD); tests Vitest                                    |
| `src/lib/__fixtures__/*.json`                   | catálogo mock (24 productos, 5 categorías, región ES) para CI                                                |
| `src/lib/components/ui/{button,badge,skeleton}` | shadcn-svelte (preset `vega`), usados **sin** `client:*`                                                     |
| `src/layouts/BaseLayout.astro`                  | `<html lang="es">`, Seo, Font, cabecera con categorías, skip link                                            |
| `src/components/*.astro`                        | tarjeta, rejilla, paginación, migas, Seo, `CatalogPage`                                                      |
| `src/components/server/*.astro`                 | server islands: `PricedProductGrid`, `ProductBuyBox`                                                         |
| `src/pages/`                                    | `index`, `productos/[...page]`, `categorias/[handle]/[...page]`, `producto/[handle]`, `404`, `robots.txt.ts` |
| `scripts/check-js-budget.mjs`                   | presupuesto: 0 `/_astro/*.js` y ≤ 1 KB gzip de JS inline (runtime de islands)                                |
| `scripts/update-fixtures.mjs`                   | regenera los fixtures desde un Medusa local                                                                  |

**Render por página (AGENTS.md §3.1)**

| Página                         | Render                  | Datos volátiles                                                     |
| ------------------------------ | ----------------------- | ------------------------------------------------------------------- |
| `/`                            | estático                | rejilla de destacados en server island                              |
| `/productos/`, `/productos/N/` | estático, 24 por página | rejilla completa en server island (`categoryId`, `offset`, `limit`) |
| `/categorias/<h>/[N/]`         | estático                | igual que el listado                                                |
| `/producto/<handle>/`          | estático                | `ProductBuyBox`: precio "Desde", stock, tabla por variante          |
| `/_server-islands/*`           | on-demand (node)        | `Cache-Control: public, s-maxage=60, stale-while-revalidate=300`    |

El fallback de la rejilla es **la misma rejilla sin precios** (la imagen tiene la misma URL), así que no hay saltos de layout (CLS 0) ni descargas dobles.

**Herramientas compartidas (`packages/config`)**

- ESLint: `eslint-plugin-astro` y `eslint-plugin-svelte` en la config compartida.
- Prettier: plugins astro, svelte y tailwind. Se resuelven por ruta absoluta desde el propio paquete; `tailwindStylesheet` está en `prettier.config.js` de la raíz.

**Otros cambios**

- CI: `STOREFRONT_DATA=fixtures` en el build y un paso nuevo, `check:budget`.
- Skill `.pi/skills/shadcn-svelte` (tag 1.7.0, con comandos fijados).
- Script raíz `dev:storefront`.

## 3. Decisiones tomadas

| Decisión                                                                                       | Motivo                                                                                                                                                                                                                             | Fuente consultada                                           |
| ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Scaffold manual (sin `create astro@latest`)                                                    | `@latest` no está fijado; solo hacen falta unos pocos ficheros                                                                                                                                                                     | astro-docs (install manual, tsconfig `strictest`)           |
| Salida estática y adapter node standalone                                                      | Las server islands necesitan servidor; el resto es HTML estático                                                                                                                                                                   | astro-docs: on-demand rendering, server islands             |
| Una server island por rejilla, con props mínimas                                               | URL GET corta (< 2048 B), así que se puede cachear; una sola petición por página                                                                                                                                                   | astro-docs: server islands → caching                        |
| Fallback = la misma rejilla sin precio                                                         | CLS 0 y contenido indexable sin JS                                                                                                                                                                                                 | astro-docs: fallback slot                                   |
| Medusa en el servidor vía `astro:env/server` (`MEDUSA_PUBLISHABLE_KEY` secret) y no `PUBLIC_*` | El navegador no habla con Medusa en esta fase; nada de claves en el cliente                                                                                                                                                        | astro-docs: `astro:env`, `envField`                         |
| `site` desde `SITE_URL` (env/`.env`) o `https://elrincondehiro.com`                            | La config se evalúa antes de `astro:env`. Se usa `node:util.parseEnv` porque `vite` no es una dependencia directa                                                                                                                  | astro-docs: config; Node 24 `util.parseEnv`                 |
| `prefetch: false`                                                                              | El prefetch de Astro inyecta `/_astro/page.*.js` (1,1 KB gzip) en todas las páginas y rompe el presupuesto de 0 bundles. Se mantiene 0 JS; la navegación rápida irá con Speculation Rules inline + view transitions CSS (ver §7.1) | astro-docs: prefetch; medición en `dist/`                   |
| Presupuesto: 0 bundles `/_astro/*.js` y JS inline ≤ 1 KB gzip                                  | El runtime inline de las server islands (≈ 0,6 KB gzip) lo genera Astro y no es JS "propio" (decisión 4 del plan)                                                                                                                  | medición en `dist/`                                         |
| Precios = `calculated_amount_with_tax` en unidades mayores                                     | Medusa 2.x: 41.95 = 41,95 € (IVA incluido en la región ES)                                                                                                                                                                         | context7 `/medusajs/medusa`; respuesta real de la Store API |
| Stock = `manage_inventory`/`allow_backorder`/`inventory_quantity`                              | `inventory_quantity` solo se devuelve con `+variants.inventory_quantity`                                                                                                                                                           | context7 `/medusajs/medusa`                                 |
| JSON-LD `Product` **sin** `offers`                                                             | El precio quedaría congelado en un HTML estático (ver §7)                                                                                                                                                                          | decisión 6 del plan                                         |
| `CI` con `STOREFRONT_DATA=fixtures`                                                            | El job `quality` no tiene Medusa. Fixtures reales (de la API) y versionados                                                                                                                                                        | decisión 1 del plan                                         |
| shadcn-svelte `init` con el preset `vega` (`--preset bIkeymG`)                                 | La 1.7.0 pide un preset de forma interactiva. `vega` = estilo clásico (Lucide + Inter + neutral). Se respondió a sus confirmaciones con "sí" por defecto                                                                           | código de `shadcn-svelte@1.7.0` (`preset/encodePreset`)     |
| Se deshace lo que `init` mete en `package.json`                                                | Añadía `^` (`tailwind-variants`, `tw-animate-css`, `@lucide/svelte ^1.50.0`) y tres paquetes no aprobados (`cn`, `shadcn-svelte`, `@fontsource-variable/inter`)                                                                    | política README §4                                          |
| `cn()` con `clsx` + `tailwind-merge` (no el paquete `cn`)                                      | `cn@0.4.0` tiene < 24 h y no estaba aprobado; las dos deps aprobadas hacen lo mismo                                                                                                                                                | `pnpm view cn`                                              |
| Sin `@import "shadcn-svelte/tailwind.css"` ni `@fontsource-variable/inter`                     | Obligaría a tener el CLI como dependencia. Ese CSS solo aporta variantes `data-*` y utilidades que los componentes usados no necesitan. La fuente la sirve la Fonts API                                                            | inspección del CSS del paquete                              |
| Componentes: button, badge, skeleton (sin card)                                                | Se borró `card` porque no se usaba (sin código muerto)                                                                                                                                                                             | —                                                           |
| `@lucide/svelte` **retirado**                                                                  | Ningún componente lo usa todavía. Además, `pnpm add @lucide/svelte@1.50.0` añadió sin avisar `minimumReleaseAgeExclude` (versión < 24 h): se revirtió                                                                              | política README §4                                          |
| Imagen de tarjeta con `<img>` y la URL original (no `<Image>`)                                 | Fallback e isla deben pedir la misma URL; el placeholder es un SVG local. La LCP de la ficha usa `<Image>` cuando hay imagen real (fase 6)                                                                                         | astro-docs: `astro:assets`                                  |
| Fuente Inter variable (100–900, latin) con `preload`                                           | Una sola familia y un solo woff2; diseño definitivo más adelante                                                                                                                                                                   | astro-docs: Fonts API, `<Font preload>`                     |
| `trailingSlash: "always"`                                                                      | URLs canónicas únicas                                                                                                                                                                                                              | astro-docs: config                                          |

## 4. Cómo usarlo

```bash
cp apps/storefront/.env.example apps/storefront/.env   # MEDUSA_PUBLISHABLE_KEY: ver docs/ESTADO.md §4
pnpm infra:up && pnpm dev:backend
pnpm dev:storefront                                   # http://localhost:4321
pnpm --filter storefront build && pnpm --filter storefront preview   # servidor de producción
pnpm --filter storefront fixtures:update              # tras cambiar el seed mock
```

Añadir un componente shadcn: `pnpm dlx shadcn-svelte@1.7.0 add <nombre> --no-deps`. Después, revisar que no introduzca dependencias nuevas ni rangos `^`.

## 5. Cómo testear esta fase

```bash
pnpm lint && pnpm format:check && pnpm typecheck && pnpm test && pnpm build   # todo verde
pnpm --filter storefront check:budget        # "OK (32 páginas con 0 bundles JS)"

# Sin backend (como en CI)
STOREFRONT_DATA=fixtures pnpm --filter storefront build && pnpm --filter storefront check:budget

# Server islands contra Medusa
pnpm infra:up && pnpm dev:backend
pnpm --filter storefront build && pnpm --filter storefront preview
#  → /producto/mock-camiseta-clasico-001/ muestra "Desde 4,95 €", S y L agotadas
#  → la petición /_server-islands/… devuelve Cache-Control: public, s-maxage=60, stale-while-revalidate=300
#  → /_astro/* devuelve max-age=31536000, immutable
```

**Lighthouse 13.5.0 (móvil, en local contra `preview`, 03-oct-2026)**

| Página                                 | Perf | A11y | BP  | SEO | LCP   | CLS   | TBT  |
| -------------------------------------- | ---- | ---- | --- | --- | ----- | ----- | ---- |
| `/`                                    | 100  | 100  | 100 | 100 | 1,7 s | 0     | 0 ms |
| `/productos/`                          | 100  | 100  | 100 | 100 | 1,7 s | 0     | 0 ms |
| `/categorias/ropa/`                    | 100  | 100  | 100 | 100 | 1,6 s | 0     | 0 ms |
| `/producto/mock-camiseta-clasico-001/` | 100  | 100  | 100 | 100 | 1,5 s | 0,005 | 0 ms |
| `/producto/mock-taza-esencial-002/`    | 100  | 100  | 100 | 100 | 1,5 s | 0     | 0 ms |

Comando usado (Chromium de Playwright ya presente en `~/.cache/ms-playwright`; la caché dlx se borró después):
`CHROME_PATH=… pnpm dlx lighthouse@13.5.0 <url> --form-factor=mobile --chrome-flags="--headless=new"`.
La primera pasada encontró `heading-order` en los listados (h3 sin h2). Se corrigió con un nivel de encabezado configurable en la tarjeta.

## 6. Criterio de salida

- [x] Lighthouse móvil ≥ 95 (100 en las cuatro categorías).
- [x] 0 KB de JS propio en la ficha (0 bundles; solo el runtime inline de server islands, ≈ 0,6 KB gzip).
- [x] CI: build con fixtures y presupuesto de JS.
- [x] PR #12 revisado y fusionado; README §13 → ✅ y `docs/ESTADO.md` actualizado.

## 7. Pendientes / riesgos

- **Por qué `offers.price` no va en el JSON-LD.** La ficha es HTML generado en el build. Si el JSON-LD llevara `offers.price` y `availability`, esos valores quedarían escritos en el HTML hasta el siguiente build. Google lee el JSON-LD sin ejecutar la server island y mostraría en los resultados enriquecidos un precio o un stock que quizá ya no son ciertos. Además, Merchant Center penaliza que el precio estructurado no coincida con el visible. Se añadirá cuando el HTML se regenere al cambiar el catálogo (webhook de rebuild, fase 13) o si la ficha pasa a on-demand con caché.
- Speculation Rules / prefetch: desactivado hasta la fase 13 (decisión en §7.1).
- Imágenes de catálogo: decidido para la fase 6 optimizarlas en build (`<Picture>`) y que la server island devuelva solo precio/stock (ver `docs/ESTADO.md` §6).
- Imágenes reales (R2/SeaweedFS) y `image.domains` de producción: fase 6.
- Lighthouse CI y Playwright: fases 10 y 4 (decisión 8).
- `ASTRO_KEY` fija para server islands cuando haya despliegues con CDN (fases 10–11).
- El stock que se muestra viene de `inventory_quantity` de la Store API, que agrega las ubicaciones del canal de venta.

### 7.1 Navegación: prefetch / view transitions (medido 03-oct-2026)

Build de producción, Lighthouse 13.5.0 en móvil (3 pasadas) contra `preview` con Medusa real.

| Variante                                    | JS añadido por página (gzip)                | Perf home / ficha | FCP home | LCP home / ficha |
| ------------------------------------------- | ------------------------------------------- | ----------------- | -------- | ---------------- |
| Actual (0 bundles)                          | 0 (solo el inline de las islands, ≈ 0,6 KB) | 100 / 100         | 0,9 s    | 1,7 / 1,5–1,7 s  |
| `prefetch` (hover, `data-astro-prefetch`)   | +1,1 KB, 1 petición                         | 99–100 / 100      | 1,1 s    | 1,7–1,8 / 1,7 s  |
| `prefetch` + `experimental.clientPrerender` | +1,4 KB                                     | —                 | —        | —                |
| `<ClientRouter />` (activa `prefetchAll`)   | **+5,6 KB**                                 | 99 / 100          | 1,2 s    | 1,8 / 1,7 s      |
| `<ClientRouter />` + `prefetch: false`      | +4,7 KB                                     | —                 | —        | —                |

**Decisión del usuario.** Seguimos con 0 JS. En la fase 13 se añadirán:

- **View transitions nativas entre documentos**: `@view-transition { navigation: auto; }` más `view-transition-name` en la imagen de la tarjeta y de la ficha. No añaden JS; funcionan en Chromium y Safari 18.2+, y Firefox navega sin animación.
- **Speculation Rules inline**: `<script type="speculationrules">` con un JSON de ≈ 200 B que no se ejecuta como JS. Hacen `prerender` con `eagerness` moderado. Hay que tener en cuenta que el prerender también dispara las server islands.

Descartados:

- `<ClientRouter />`: pasa a modo SPA, rompe el presupuesto y cambia el ciclo de vida de los scripts.
- `clientPrerender`: hace lo mismo que las Speculation Rules, pero inyectándolas con JS.

Fuentes: astro-docs (view transitions, prefetch, `experimental.clientPrerender`). Medición sobre `dist/`.
