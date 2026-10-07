# Fase I-Marca — Identidad visual y tema

> **Estado:** ✅ completada (07-oct-2026; visto bueno visual del usuario, incluido Stripe en oscuro)
> **Rama/PR:** `feat/i-marca`
> **Anterior:** [Fase 7](./fase7.md) · **Siguiente:** I-Interficie (UX/UI: cabecera completa, home, ofertas) → [Fase 8](./PLANTILLA.md)

## 1. Objetivos

- [x] Logo, símbolo, favicon, manifest e imagen para compartir (`og:image`).
- [x] Paleta de marca en claro y oscuro con contraste AA comprobado por test.
- [x] Tipografía: Baloo 2 (titulares) + Nunito Sans (texto), sin Inter.
- [x] Estilo **Retro 80** (esquinas rectas, borde de 2–3 px, sombra sólida) aplicado a los componentes.
- [x] Selector de tema claro/oscuro (sigue al sistema; con JS se puede forzar y se recuerda).
- [x] Revisión visual del usuario (el agente no puede ver imágenes). Pendiente de su parte: probar más a fondo en móvil y escritorio.

## 2. Qué se ha hecho

- **Activos** (`src/assets/marca/`, `public/`): logo, logo B/N y símbolo (recortado, alpha suave, sin paleta); favicon `.svg`/`.ico`, `apple-touch-icon`, iconos 192/512/maskable, `og-default.png` (1200×630), `site.webmanifest`. La cabecera usa `public/simbolo-header.webp` (108 px = 3× de 36 px) para verse nítido en pantallas de alta densidad.
- **Tokens** (`global.css`): `:root` (claro, fondo crema `#F3E8DC`, tarjetas blancas) y dos bloques oscuros idénticos: `[data-theme="dark"]` (elección) y `@media (prefers-color-scheme: dark)` (sistema, si no se eligió "claro"). Oscuro = variante **B** (pizarra `#26343C`, líneas y sombras negras, azul `#62C0E4`). `@custom-variant dark` de Tailwind sigue la misma regla.
- **Rosa `#F883A1`**: solo como fondo con texto oscuro; para texto, `--accent-text`. Azul claro `--primary` = `#16708F` (el `#19799D` original no daba AA sobre el crema).
- **Retro 80**: `--radius: 0`, `--line` (trazo de marca), sombras sólidas `--shadow*`; botón con sombra que se hunde al pulsar; cajas y campos con `border-2 border-line`; toasts, flyout y sugerencias con trazo y sombra; tarjetas de producto con marco y sombra.
- **Iconos**: Phosphor 2.1.1 (MIT), solo trazo, copiados en `src/lib/icons.ts` (sin dependencia npm) y `components/Icon.astro`.
- **Tema**: `ThemeInit.astro` (script inline en `<head>`, ~150 B, hash registrado para la CSP igual que `LiveSync`) aplica `localStorage["tema"]` antes de pintar; el botón `[data-theme-toggle]` (nace `hidden`) lo activa `SiteClient`.
- **Stripe**: `src/lib/stripe-theme.ts` con la apariencia de marca: temas `stripe`/`night`, colores de los tokens en hex (Stripe no admite oklch ni `var()`; `stripe-theme.test.ts` comprueba que coinciden con `global.css`), esquinas rectas y borde de 2 px, y la misma Nunito Sans de la web (`fontData` de la Fonts API → `elements({ fonts })`, con URL absoluta). Se elige según el tema al montar; no cambia en vivo si se alterna después. La fuente solo se pasa si `SITE_URL` es `https:` (Stripe rechaza `http:`; en local se ve su fuente por defecto).
- **CSP**: `CSP_ENABLED` en `astro.config.mjs` (hoy `false`, fase 11). Con `false`, `LiveSync` y `ThemeInit` no tocan `Astro.csp`: Astro avisaba en cada página del build (2397 avisos; 1196 ya en `main`, por `LiveSync`). Ahora: 0 avisos.
- **Tokens de shadcn sin uso** (`sidebar-*`, `chart-*`): restaurados como alias de la paleta de marca.
- **Cabecera**: símbolo + nombre, fija (`sticky`) solo desde `sm` (en móvil mide 142 px).

## 3. Decisiones tomadas

| Decisión                                             | Motivo                                                                                                                             | Fuente                                              |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| Fuentes A: Baloo 2 + Nunito Sans                     | Elegidas por el usuario comparando A/B/C en una guía temporal                                                                      | `/estilo/` (retirada)                               |
| Estilo Retro 80 con fondo crema del "Neo"            | El Neo exagerado (bordes de 5 px, sombra con _halftone_) se comparó y se descartó; se conservó su fondo crema                      | idem                                                |
| Oscuro B (pizarra + líneas negras)                   | A tenía líneas claras (descartada); C grafito cálido                                                                               | idem                                                |
| Tema por defecto = sistema, con CSS puro             | Cero JS para quien no toca nada                                                                                                    | MDN `prefers-color-scheme`                          |
| Script inline de tema + `localStorage`               | Páginas estáticas: el servidor no puede fijar el tema; sin script habría destello. No es un token, así que no incumple AGENTS §3.2 | astro-docs (scripts), Tailwind v4 `@custom-variant` |
| Límite de JS inline 1,2 → **1,4 KB**                 | Script de tema (~150 B); aprobado por el usuario                                                                                   | AGENTS §3.4                                         |
| Símbolo de cabecera como fichero de `public/`        | `<Image>` en páginas on-demand llamaría a sharp en runtime (D6)                                                                    | fase7.md                                            |
| Logo en oscuro: recuadro crema con borde (pendiente) | Aún no hay logo en negativo                                                                                                        | —                                                   |
| Descartado: logo blanco monocromo                    | Es una silueta sin detalle interior                                                                                                | —                                                   |

## 4. Cómo usarlo

- Colores: `bg-background`, `bg-card`, `bg-primary`, `bg-accent text-accent-foreground`, `text-accent-text`, `border-line`, `shadow-sm|md|lg` (sólida).
- Titulares con Baloo 2 por defecto (`h1`–`h4`); `font-display` para otros elementos.
- Icono nuevo: copia su SVG de `assets/regular/` de Phosphor a `src/lib/icons.ts` y usa `<Icon name="…" />`.
- Si cambias un color: actualiza el `oklch` **y** el hex del comentario (lo lee `theme.test.ts`).

## 5. Cómo testear esta fase

```bash
pnpm infra:up && pnpm dev:backend          # el build del storefront necesita el backend
pnpm lint && pnpm format:check && pnpm typecheck && pnpm test
pnpm --filter storefront build && pnpm --filter storefront check:budget
pnpm --filter storefront start             # y en otra terminal:
pnpm --filter storefront test:e2e          # incluye e2e/tema.spec.ts
```

Visual (a mano): home, listado, ficha, carrito, checkout y `/buscar/` en claro y oscuro, escritorio y móvil; pulsar el botón de tema y recargar; en el checkout, el formulario de Stripe en oscuro.

## 5.1 Resultados (07-oct-2026)

**JS que recibe el navegador** (home, listados, 404, legales), comparado con `main`:

|                          | `main`           | I-Marca                                                   |
| ------------------------ | ---------------- | --------------------------------------------------------- |
| `CartClient`             | 992 B            | 992 B                                                     |
| `SiteClient`             | 862 B            | 1036 B (+ selector de tema)                               |
| JS inline                | 952 B            | 1017 B (+ `ThemeInit`)                                    |
| CSS                      | 7770 B           | 8211 B                                                    |
| HTML (home)              | 6755 B           | 7899 B (iconos, `@font-face` de la 2.ª familia, `<head>`) |
| Fuentes (total en disco) | 72 KB (Inter, 3) | 81 KB (5 ficheros); se precarga solo Nunito 400           |

Todo gzip. `client.svelte.*.js` (24 KB) se genera también en `main` y **ninguna página lo carga**: es un sobrante de la integración de Svelte (componentes shadcn-svelte sin hidratar), anterior a esta fase.

**Lighthouse 13.5.0** (`pnpm dlx`, móvil simulado, Chromium de Playwright, local; 3 pasadas, rango):

| Página        | Perf  | A11y | Buenas prácticas | SEO                       | LCP       | CLS   |
| ------------- | ----- | ---- | ---------------- | ------------------------- | --------- | ----- |
| Home          | 97–99 | 100  | 100              | 100                       | 2,0–2,5 s | 0,008 |
| `/productos/` | 95–98 | 100  | 100              | 100                       | 2,1–2,6 s | 0,001 |
| Ficha         | 96–99 | 100  | 100              | 100                       | 1,8–2,8 s | 0,003 |
| `/carrito/`   | 99    | 100  | 100              | 69 (`noindex`, permitido) | 1,8 s     | 0,001 |

`main` en las mismas condiciones: home LCP 2,0–2,3 s, listado 2,1–2,8 s, ficha 1,8–2,0 s. **El LCP ya superaba el objetivo de 1,8 s antes de esta fase** (el elemento LCP es el título de la primera tarjeta; el desglose por fases es igual en `main` y en la rama). Se revisará en la fase 13 (rendimiento). Ruido alto entre pasadas en local.

**Firefox**: la precarga de Nunito Sans 400 se usa y no hay avisos (`playwright install firefox`, solo local). El aviso antiguo era de Inter.

## 6. Criterio de salida

- [x] Lint, formato, typecheck, tests (116), build sin avisos, `check:budget` y e2e (55) en verde.
- [x] Contraste AA de 17 pares en claro y oscuro (`theme.test.ts`).
- [x] El usuario da el visto bueno visual (primera revisión).

## 7. Riesgos y pendientes

- LCP > 1,8 s en móvil simulado, igual que en `main` (§5.1): fase 13.
- **e2e y stock**: los e2e de checkout crean pedidos reales en la BD local y van gastando el stock de `mock-bufanda-natural-020`. Con menos de 3 unidades libres, `carrito.spec.ts` (paso 2 → 3) falla con `#carrito-stock`. Se repone con `pnpm backend:stock:mock` (script nuevo, idempotente, con `updateInventoryLevelsWorkflow`; deja 50 libres en los niveles con < 10 y no toca los que el seed dejó a 0 a propósito).
- `logo.png` y `logo-bn.png` aún no se usan en la web (hero y pie de I-Interficie); en oscuro irán en un recuadro crema hasta tener un negativo.
- Stripe en oscuro: se decide el tema al montar el formulario.
- Tras elegir tema con el botón, quien vuelva a "seguir al sistema" tiene que borrar `localStorage["tema"]` (no hay botón de "automático").
- I-Interficie (siguiente): cabecera completa (menú Tienda ▾, ofertas, cuenta), barra de anuncios, pie de 4 columnas, home con hero y `/ofertas/`.

## 7.1 Consola del navegador en el checkout (local)

Revisado con el usuario (Firefox, `http://localhost`). Todo es de Stripe.js y **no son errores de la tienda**:

| Mensaje                                                                                                                                                                    | Causa                                                | Acción                                                                  |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | ----------------------------------------------------------------------- |
| "live Stripe.js integrations must use HTTPS" · "Apple Pay or Google Pay … HTTPS"                                                                                           | local por HTTP                                       | ninguna (producción va por HTTPS, Caddy + Cloudflare)                   |
| "Invalid src value in font configuration … https:// or data:"                                                                                                              | pasábamos la fuente por `http://localhost`           | **corregido**: solo se pasa con `SITE_URL` https                        |
| "You have not registered or verified the domain … apple_pay"                                                                                                               | dominio no registrado en Stripe                      | fase 10/11: registrar el dominio de producción (Payment method domains) |
| "Feature Policy: Skipping unsupported feature name", "Partitioned cookie…", `__cf_bm` rechazada, "Enhanced Tracking Protection", `mozOrientation`, source maps de hCaptcha | iframes de Stripe/hCaptcha y protecciones de Firefox | ninguna (no las controlamos)                                            |
| "Your Elements integration is using an older API … Checkout Sessions"                                                                                                      | aviso promocional de Stripe                          | ver abajo                                                               |

**Checkout Sessions API** (la "API nueva" que recomienda Stripe): **no se migra**. Nuestro pago lo crea el proveedor oficial de Medusa `@medusajs/payment-stripe` 2.21.2, que trabaja solo con **PaymentIntents** (comprobado en su código: `paymentIntents.*`, ningún `checkout.sessions`), y AGENTS §4 manda usar ese proveedor. Migrar supondría un proveedor de pago propio en el backend (sesión de checkout de Stripe con las líneas del carrito, captura manual, webhooks e idempotencia) y rehacer el paso de pago: mucho trabajo y riesgo para ventajas que hoy no usamos (Adaptive Pricing, impuestos/envíos de Stripe; Medusa ya calcula IVA y envíos). Fuente: MCP stripe (guía `payment-element/migration-ewcs`; `capture_method` por método de pago en Checkout Sessions, changelog 2025-09-30). **Reabrir solo si** Medusa añade soporte oficial o se necesita una función exclusiva de Checkout Sessions.

## 8. Datos para I-Interficie (aportados por el usuario)

| Dato                            | Valor                                                                                                                       |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Redes                           | Instagram, WhatsApp, YouTube                                                                                                |
| Email                           | tienda@elrincondehiro.com                                                                                                   |
| Teléfono                        | 640260110                                                                                                                   |
| Dirección                       | C\Parlament 52, 08015 Barcelona                                                                                             |
| Métodos de pago que se muestran | Transferencia, Visa, Mastercard, AMEX                                                                                       |
| Tono                            | cercano, joven, creativo; especialistas en perros                                                                           |
| Valores                         | recomiendan lo mejor para el perro o el gato aunque pierdan la venta; rechazan pedidos por debajo de su estándar de calidad |
