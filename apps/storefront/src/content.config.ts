// Contenido EDITORIAL (fase I-Interficie): barra de anuncios, home, datos de la tienda y
// páginas de contenido. El contenido COMERCIAL (ofertas, destacados) vive en Medusa.
// Colecciones de build (se leen en `astro build`; un cambio aquí = rebuild). Fuente: astro-docs
// (guides/content-collections: `defineCollection`, loaders `glob()`/`file()`, `z` de
// astro/zod, `image()` en el schema).
import { defineCollection } from "astro:content";
import { file, glob } from "astro/loaders";
import { z } from "astro/zod";

/** Barra de anuncios (marquee CSS): mensajes cortos en orden; `activo: false` lo oculta. */
const anuncios = defineCollection({
  loader: file("src/content/anuncios.yaml"),
  schema: z.object({
    id: z.string(),
    texto: z.string().min(1).max(90),
    enlace: z.string().startsWith("/").optional(),
    activo: z.boolean().default(true),
  }),
});

/**
 * Bloques de la home (un único fichero `home.yaml` con id "home"). Fase H:
 * - `hero` y `categorias` OBLIGATORIOS (sin ellos el build falla: nunca una home vacía); el resto
 *   OPCIONALES: si no están en el yaml, no se pintan.
 * - Cada bloque salvo el hero lleva `orden` (entero ≥ 1): se pintan de menor a mayor. Dos bloques
 *   con el mismo orden hacen fallar el build (lib/home.ts). El hero va siempre el primero.
 */
const orden = z.number().int().min(1).max(99);
const home = defineCollection({
  loader: file("src/content/home.yaml"),
  schema: ({ image }) =>
    z.object({
      id: z.string(),
      hero: z.object({
        antetitulo: z.string(),
        titulo: z.string(),
        texto: z.string(),
        cta: z.object({ texto: z.string(), enlace: z.string().startsWith("/") }),
        imagen: image(),
        imagenAlt: z.string(),
      }),
      // Categorías destacadas: handles de cualquier nivel, en este orden. Las que no existan o
      // no tengan productos se omiten (aviso en el build); si no queda ninguna, el build falla.
      categorias: z.object({
        orden,
        titulo: z.string(),
        handles: z.array(z.string().min(1)).min(1).max(24),
      }),
      destacados: z
        .object({
          orden,
          titulo: z.string(),
          coleccion: z.string(),
          maximo: z.number().int().min(1).max(24),
        })
        .optional(),
      // Novedades: creados en los últimos `dias` (y no antes de `desde`, YYYY-MM-DD: fecha de
      // corte para la carga inicial) o con la etiqueta `novedad`. «Ver todas» → /buscar/ por
      // novedades. Se calcula en el build (lo mantiene al día el siguiente build).
      novedades: z
        .object({
          orden,
          titulo: z.string(),
          dias: z.number().int().min(1).max(365),
          desde: z
            .string()
            .regex(/^\d{4}-\d{2}-\d{2}$/)
            .optional(),
          maximo: z.number().int().min(1).max(24),
        })
        .optional(),
      // Tarjetas de colecciones (handles de Medusa, en este orden; las vacías se omiten). Foto: la
      // propia de la colección o la de su primer producto. Enlazan a /coleccion/<handle>/.
      colecciones: z
        .object({
          orden,
          titulo: z.string(),
          handles: z.array(z.string().min(1)).min(1).max(12),
        })
        .optional(),
      ofertas: z
        .object({ orden, titulo: z.string(), texto: z.string(), cta: z.string() })
        .optional(),
      // «Busca por…»: chips de etiquetas de Medusa → /buscar/?etiqueta=… (sin páginas propias:
      // páginas finas/duplicadas perjudican el SEO). Las etiquetas sin productos se omiten.
      etiquetas: z
        .object({
          orden,
          titulo: z.string(),
          valores: z.array(z.string().min(1)).min(1).max(24),
        })
        .optional(),
      valores: z
        .object({
          orden,
          titulo: z.string(),
          items: z
            .array(
              z.object({
                icono: z.enum(["heart", "seal-check", "paw-print"]),
                titulo: z.string(),
                texto: z.string(),
              }),
            )
            .min(1)
            .max(4),
        })
        .optional(),
    }),
});

/** Datos de contacto y redes (pie). Un único fichero `tienda.yaml` con id "tienda". */
const tienda = defineCollection({
  loader: file("src/content/tienda.yaml"),
  schema: z.object({
    id: z.string(),
    email: z.email(),
    telefono: z.string(),
    direccion: z.object({ calle: z.string(), cp: z.string(), ciudad: z.string() }),
    redes: z.array(
      z.object({
        red: z.enum(["instagram", "whatsapp", "youtube"]),
        nombre: z.string(),
        url: z.url(),
      }),
    ),
  }),
});

/** Páginas de contenido en Markdown (Sobre nosotros…): /<id>/. */
const paginas = defineCollection({
  loader: glob({ pattern: "*.md", base: "./src/content/paginas" }),
  schema: z.object({
    titulo: z.string(),
    descripcion: z.string().max(160),
    entradilla: z.string().optional(),
  }),
});

/**
 * Landing de la correa a medida (Fase E-2c): `src/content/correa.md` → /producto/correa-a-medida/.
 * Frontmatter = textos fijos de la página (título, entradilla, CTA, plazo) y cuerpo en Markdown =
 * los bloques de «cómo la hacemos». Imagen opcional (astro:assets).
 */
const correa = defineCollection({
  loader: glob({ pattern: "correa.md", base: "./src/content" }),
  schema: ({ image }) =>
    z.object({
      titulo: z.string(),
      descripcion: z.string().max(160),
      entradilla: z.string(),
      cta: z.string().max(30),
      /** Plazo de fabricación: se muestra en la landing y en la ficha de cada color. */
      plazo: z.string().max(80),
      imagen: image().optional(),
      imagenAlt: z.string().optional(),
    }),
});

/**
 * Plantillas de ficha (Fase O): `src/content/plantillas/<id>.md`. Contenido común (cómo medir,
 * consejos…) en Markdown; se aplica a los productos de las categorías de `categorias` (y de sus
 * subcategorías) o a los que lo pidan con `metadata.plantilla` (columna `plantilla` de la hoja).
 * La correa a medida NO es una de estas: tiene su propia ficha (lib/correa.ts).
 */
const plantillas = defineCollection({
  loader: glob({ pattern: "*.md", base: "./src/content/plantillas" }),
  schema: z.object({
    /** Título del bloque en la ficha («Cómo medir a tu perro»). */
    titulo: z.string().min(1).max(80),
    /** Texto del botón que lo abre; sin él, el bloque va desplegado en la ficha. */
    boton: z.string().max(40).optional(),
    categorias: z.array(z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)).default([]),
  }),
});

/**
 * Guías de tallas (Fase O): `src/content/guias/<id>.md`, una por modelo (las tallas cambian de
 * una marca o un modelo a otro). El producto la elige con `metadata.guia_tallas`.
 */
const guias = defineCollection({
  loader: glob({ pattern: "*.md", base: "./src/content/guias" }),
  schema: z.object({
    titulo: z.string().min(1).max(80),
    marca: z.string().optional(),
  }),
});

export const collections = { anuncios, home, tienda, paginas, correa, plantillas, guias };
