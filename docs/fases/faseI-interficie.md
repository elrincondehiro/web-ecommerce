# Fase I-Interficie — UX/UI (cabecera, pie, home, ofertas)

> **Estado:** ⏳ planificada. **Borrador de partida**: recoge lo acordado con el usuario; el plan detallado se hace al empezar (REGLA Nº 1: documentación → plan → confirmación).
> **Rama/PR:** `feat/i-interficie` (por crear desde `main` con I-Marca ya mergeada)
> **Anterior:** [I-Marca](./faseI-marca.md) · **Siguiente:** Fase 8 (Emails)

## 0. Punto de partida (lo que ya existe tras I-Marca)

- Identidad: Baloo 2 (titulares) + Nunito Sans (texto), estilo **Retro 80** (`--radius: 0`, `--line`, sombras sólidas `shadow-*`), paleta claro (fondo crema) / oscuro (pizarra, líneas negras) con test de contraste AA (`src/lib/theme.test.ts`). Cómo usar los tokens: [faseI-marca.md](./faseI-marca.md) §4.
- Cabecera actual (`src/layouts/BaseLayout.astro`): símbolo + nombre, menú de categorías en una línea con scroll, búsqueda con sugerencias (`SiteClient`), selector de tema y carrito. Fija (`sticky`) solo desde `sm` (en móvil mide 142 px).
- Pie actual: copyright + enlaces legales.
- Activos sin usar todavía: `src/assets/marca/logo.png` y `logo-bn.png` (no hay logo en negativo: en oscuro, el logo va en un **recuadro crema** con borde).
- Iconos: Phosphor de trazo copiados en `src/lib/icons.ts` + `<Icon>`. Para iconos nuevos (redes, menú, tarjetas…), copiar su SVG de `@phosphor-icons/core@2.1.1/assets/regular/` (MIT). Los logos de Visa/Mastercard/AMEX **no** están en Phosphor: decidir fuente y licencia.
- JS por página hoy: `CartClient` 992 B + `SiteClient` 1036 B (≤ 1536) + inline ~1017 B (≤ 1434). Cualquier JS nuevo va en `SiteClient` (AGENTS §3.4) o necesita excepción aprobada.

## 1. Objetivos (lo que busca el usuario)

1. **Barra de anuncios** sobre la cabecera:
   - texto en movimiento (_marquee_) leído de un `.md` (Content Collections);
   - **solo CSS**: se para con `:hover` y con `prefers-reduced-motion` (entonces, texto estático);
   - accesible: el texto completo legible por lectores de pantalla una sola vez (el duplicado del bucle, `aria-hidden`).
2. **Cabecera y menú**:
   - **Tienda ▾**: desplegable con las categorías (sin JS: `<details>` o `popover`; revisar teclado y móvil);
   - **Ofertas** → `/ofertas/`;
   - **Sobre nosotros** (página de contenido, `.md`);
   - **Mi cuenta**: "Entrar / Registrarse" hasta la fase 9 (decidir a dónde apunta mientras tanto);
   - se mantienen búsqueda, tema y carrito; rediseñar el móvil (hoy 142 px).
3. **Pie de 4 columnas** (datos en §2): contacto, redes, información/legal, métodos de pago; con el logo.
4. **Home**:
   - **hero** con imagen provisional y texto desde `.md`;
   - **categorías destacadas**;
   - **carrusel** de productos de una **Collection de Medusa** (CSS scroll-snap; flechas solo si se justifican);
   - **banner de ofertas**;
   - **bloque de valores** (§2).
5. **`/ofertas/`**: productos con precio rebajado (**Price Lists** de Medusa), con el patrón de precio/stock de AGENTS §3.2 (build + `LiveSync`).

Reparto de contenido (decidido): **editorial** (anuncios, hero, valores, Sobre nosotros) en Content Collections `.md`/`.yaml`; **comercial** (ofertas, destacados) en Medusa (Price Lists, Collections o etiquetas).

## 2. Datos aportados por el usuario

| Dato                            | Valor                                                                                                                       |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Redes                           | Instagram, WhatsApp, YouTube (URLs por pedir)                                                                               |
| Email                           | tienda@elrincondehiro.com                                                                                                   |
| Teléfono                        | 640260110                                                                                                                   |
| Dirección                       | C\Parlament 52, 08015 Barcelona                                                                                             |
| Métodos de pago que se muestran | Transferencia, Visa, Mastercard, AMEX                                                                                       |
| Tono                            | cercano, joven, creativo; especialistas en perros (venden comida y accesorios para perros y gatos)                          |
| Valores (sin eslogan)           | recomiendan lo mejor para el perro o el gato aunque pierdan la venta; rechazan pedidos por debajo de su estándar de calidad |

⚠️ "Transferencia" se mostraría en el pie, pero **el pago por transferencia aún no existe** (llega tras la fase 8, Emails). Decidir si se muestra ya.

## 3. Decisiones abiertas (resolver en el plan, con el usuario)

1. **Cabecera que se esconde al bajar y reaparece al subir**: sí/no. Opciones: JS en `SiteClient` (~100–150 B) o CSS (_scroll-driven animations_, sin soporte completo hoy). Impacto en CLS y accesibilidad.
2. **Desplegable "Tienda"**: `<details>` / `popover` / mega-menú; comportamiento en móvil (¿menú hamburguesa?).
3. **Barra de anuncios**: varios mensajes o uno; velocidad; si se puede cerrar (cerrarla y recordarlo necesitaría JS).
4. **Home**: qué Collection alimenta el carrusel; cuántos productos; categorías destacadas fijas o desde Medusa; imagen del hero (placeholder hasta tener foto).
5. **Ofertas**: cómo se ve el precio rebajado (precio anterior tachado, % de descuento), de dónde sale (`calculated_price` vs `original_price` de Medusa con Price Lists, **consultar docs**), y si hay "Ofertas" vacía.
6. **Sobre nosotros**: contenido (lo redacta el usuario o borrador nuestro).
7. **"Mi cuenta"** antes de la fase 9: enlace oculto, deshabilitado o página "próximamente".
8. **Logos de tarjetas** en el pie: SVG oficiales de las marcas (normas de uso) o texto.
9. **URLs de redes** y si WhatsApp es un enlace `wa.me/34640260110`.
10. Datos de prueba: crear Collection y Price List de prueba en la BD local con **workflows/scripts** idempotentes (como `seed-mock`), nunca con SQL.

## 4. Pasos para hacer el plan (sesión siguiente)

1. `git switch main && git pull` (I-Marca mergeada); borrar `feat/i-marca` local; `git switch -c feat/i-interficie`.
2. **Documentación** (REGLA Nº 1):
   - astro-docs: Content Collections (Astro 7: `content.config.ts`, loaders `glob`/`file`), `<Image>`/`<Picture>` en el hero, popover/`<details>` (no hay API de Astro, pero sí guías de islas y scripts);
   - context7 `/medusajs/medusa`: Collections (`/store/collections`, productos por `collection_id`), **Price Lists** y precios calculados (`calculated_price.calculated_amount` vs `original_amount`, `price_list_type: sale`), workflows para crear datos de prueba;
   - context7 Tailwind v4: scroll-snap y animaciones (`@keyframes` en `@theme`), `motion-reduce:`;
   - MDN (vía context7 si hace falta): `popover`, `scroll-snap`, _scroll-driven animations_ y su soporte.
3. Revisar el presupuesto de JS por página (AGENTS §3.4) y el **árbol de decisión** (§3.1) para cada pieza: estático → server island → on-demand → isla.
4. Presentar al usuario: decisiones de §3 con opciones y recomendación, ficheros, comandos, impacto en JS/Lighthouse y fuentes consultadas. **Esperar confirmación.**
5. Implementar por bloques pequeños (cabecera → pie → home → ofertas), con e2e (también sin JS) y medidas (`check:budget`, Lighthouse 13.5.0 con `pnpm dlx` como en [faseI-marca.md](./faseI-marca.md) §5.1).

## 5. Avisos para la sesión siguiente

- **`pnpm dlx` y worktrees temporales pueden reescribir `node_modules/.bin`** (shims apuntando a `/tmp`): si el lint falla con errores de parseo sin cambios en el código, `pnpm install --frozen-lockfile --offline --force`.
- **No dejar `astro dev` colgado**: deja `.astro/dev.json` y el siguiente `astro dev` se niega a arrancar (usar `astro dev stop`).
- **El servidor de producción se arranca con `pnpm start`** (carga `.env`); `node dist/server/entry.mjs` a secas falla por falta de `MEDUSA_PUBLISHABLE_KEY`.
- **Stock de los e2e**: si `carrito.spec.ts` falla con `#carrito-stock`, `pnpm backend:stock:mock`.
- **Avisos de Stripe en consola en local** (HTTP, Apple Pay sin dominio, cookies particionadas, "older API"): ver [faseI-marca.md](./faseI-marca.md) §7; no son errores.
- LCP móvil > 1,8 s ya en `main` (fase 13). No empeorarlo: el hero y el carrusel son los candidatos a LCP de la home.
