# Fase D — Cambios de diseño (afinar colores, interfaz y detalles)

> **Estado:** ⏳ planificada. **Borrador de partida**: el usuario concreta los cambios al empezar; el plan se hace entonces (REGLA Nº 1: documentación → plan → confirmación).
> **Rama/PR:** `feat/d-diseno` (por crear desde `main`)
> **Anterior:** [I-Interficie](./faseI-interficie.md) · **Siguiente:** Fase 8 (Emails)

## 0. Punto de partida (tras I-Marca e I-Interficie)

- **Tokens** en `apps/storefront/src/styles/global.css`: `:root` (claro, crema `#F3E8DC`) y oscuro duplicado en `[data-theme="dark"]` y `@media (prefers-color-scheme: dark)` (pizarra `#26343C`). Cada color en `oklch` **con su hex en comentario**: lo leen `src/lib/theme.test.ts` (contraste AA de 17 pares) y `stripe-theme.test.ts` (Stripe no admite oklch). Cómo usarlos: [faseI-marca.md](./faseI-marca.md) §4.
- **Estilo Retro 80**: `--radius: 0`, `--line`, sombras sólidas `shadow-*`; fuentes Baloo 2 (titulares) + Nunito Sans (texto), solo se precarga Nunito 400.
- **Componentes de layout**: `src/components/layout/` (`AnnouncementBar`, `SiteHeader`, `SiteFooter`); precio en `components/Price.astro`; tarjeta `ProductCard.astro`; ficha `BuyBox.astro`; estilos propios al final de `global.css` (`.announce`, `.site-header`, `.nav-menu`, `.mobile-menu`, `.carousel`, `.price`, `.prose-page`).
- **Contenido editorial**: `src/content/` (`anuncios.yaml`, `home.yaml`, `tienda.yaml`, `paginas/*.md`). Hero con imagen **provisional** (el logo).
- **JS por página**: `CartClient` 992 B + `SiteClient` 1203 B (≤ 1536) + inline ≤ 1144 B (≤ 1434). Un cambio de diseño **no debería** añadir JS; si lo necesita, va en `SiteClient` o pide excepción (AGENTS §3.4).
- **Lighthouse** de referencia (móvil, local): Perf 95–99, A11y 100, SEO 100 ([faseI-interficie.md](./faseI-interficie.md) §5.1).

## 1. Objetivos (por concretar con el usuario)

Lista de cambios que aporte el usuario (colores, espaciados, tipografía, componentes, páginas concretas…). Para cada uno: página/componente afectado, captura o descripción, claro y oscuro, móvil y escritorio.

- [ ] …

Pendientes heredados que pueden entrar aquí (decidir con el usuario):

- Revisión del texto de «Sobre nosotros» (borrador del agente) y de los anuncios.
- Foto del hero (hoy el logo) y logo en negativo para oscuro (hoy recuadro crema).
- Botón de pausa propio para la barra de anuncios (hoy: hover/foco y `prefers-reduced-motion`).
- Precio anterior en el carrito (fuera de alcance en I-Interficie).

## 2. Reglas para esta fase

- El agente **no puede ver imágenes**: el usuario revisa visualmente; el agente mide (DOM con Playwright, contraste por test, Lighthouse, `check:budget`).
- Todo color nuevo o cambiado: `oklch` + hex en el comentario, y `theme.test.ts` en verde (AA). Si afecta a Stripe, `stripe-theme.ts` igual.
- Sin dependencias nuevas salvo aprobación (AGENTS §1). Iconos: Phosphor 2.1.1 copiados en `src/lib/icons.ts`.
- No empeorar CLS ni LCP (candidatos a LCP: hero de la home, primera tarjeta de los listados).

## 3. Pasos para hacer el plan (sesión siguiente)

1. `git switch main && git pull`; `git switch -c feat/d-diseno`.
2. Pedir al usuario la lista de cambios (§1) y resolver dudas antes de tocar nada.
3. **Documentación** (REGLA Nº 1): context7 Tailwind v4 (`@theme`, utilidades), shadcn-svelte/bits-ui si se tocan componentes de `src/lib/components/ui`, astro-docs si cambia algo de imágenes/fuentes; MCP svelte (autofixer) si se toca algún `.svelte`.
4. Presentar el plan: cambios agrupados por bloque, ficheros, impacto en JS/CSS/Lighthouse y fuentes. **Esperar confirmación.**
5. Implementar por bloques con un commit por bloque; medir (`check:budget`, Lighthouse 13.5.0 con `pnpm dlx`, e2e con y sin JS).

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
