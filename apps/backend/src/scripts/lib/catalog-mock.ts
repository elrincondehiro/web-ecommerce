/**
 * Catálogo de PRUEBA para `catalog:import` (Fase S, S-1) — solo desarrollo. Funciones puras.
 *
 * Genera `productos.csv` (formato de `catalog/plantilla/LEEME.md`) con N productos `mock-*`
 * repartidos por las HOJAS del árbol de `categorias.csv` (los productos van solo en la
 * subcategoría más concreta). Determinista: los mismos N dan la misma hoja (handles fijos
 * para e2e y fixtures). Sustituye a `seed:mock`, `seed:mock:v2` y `seed:mock:ofertas`
 * (archivados como `*.old`, ver `src/scripts/OBSOLETOS.md`).
 *
 * Incluye lo que necesita el storefront de la Fase S: opciones globales (Talla, Color, Peso…),
 * ofertas (`precio_oferta`), Collection `destacados`, agotados, contenido neto (`neto_g` /
 * `neto_ml`), componentes analíticos y productos a granel (publicados desde la Fase S, S-3).
 * IVA orientativo (solo pruebas): alimentación reducido, libros superreducido, resto general.
 */
import type { CategorySheet } from "./catalog-sheet";

type Kind = "food" | "wet" | "snack" | "supp" | "wear" | "size" | "liquid" | "single" | "book";

interface Profile {
  kind: Kind;
  nouns: string[];
  /** Peso relativo en el reparto (más productos en piensos, snacks, ropa…). */
  weight: number;
  /** Precio base (€). */
  base: number;
}

const PROFILES: Record<string, Profile> = {
  "piensos-perro": {
    kind: "food",
    nouns: ["Pienso", "Pienso light", "Pienso senior"],
    weight: 3,
    base: 24.9,
  },
  "barf-perro": { kind: "wet", nouns: ["Menú BARF", "Hamburguesa BARF"], weight: 1, base: 4.9 },
  "comida-humeda-perro": { kind: "wet", nouns: ["Lata", "Paté"], weight: 2, base: 2.9 },
  "comida-cocinada-perro": { kind: "wet", nouns: ["Guiso", "Estofado"], weight: 1, base: 5.9 },
  "snacks-perro": { kind: "snack", nouns: ["Premios", "Galletas", "Tiras"], weight: 3, base: 3.9 },
  "suplementos-perro": {
    kind: "supp",
    nouns: ["Aceite de salmón", "Articulaciones", "Probiótico"],
    weight: 1,
    base: 12.9,
  },
  "paseo-perro": { kind: "wear", nouns: ["Collar", "Arnés", "Correa"], weight: 3, base: 14.9 },
  "viaje-perro": { kind: "size", nouns: ["Transportín", "Bolsa de viaje"], weight: 1, base: 29.9 },
  "ropa-perro": { kind: "wear", nouns: ["Abrigo", "Chubasquero", "Jersey"], weight: 2, base: 19.9 },
  "entrenamiento-perro": {
    kind: "single",
    nouns: ["Clicker", "Bolsa de premios", "Silbato"],
    weight: 1,
    base: 6.9,
  },
  "comederos-perro": { kind: "size", nouns: ["Comedero", "Bebedero"], weight: 1, base: 9.9 },
  "ducha-perro": { kind: "liquid", nouns: ["Champú", "Acondicionador"], weight: 1, base: 8.9 },
  "antiparasitarios-perro": {
    kind: "single",
    nouns: ["Collar antiparasitario", "Pipeta"],
    weight: 1,
    base: 15.9,
  },
  "ojos-oidos-piel-patas-perro": {
    kind: "liquid",
    nouns: ["Limpiador ótico", "Bálsamo de patas"],
    weight: 1,
    base: 7.9,
  },
  "empapadores-toallitas-perro": {
    kind: "single",
    nouns: ["Empapadores", "Toallitas"],
    weight: 1,
    base: 5.9,
  },
  "primeros-auxilios-perro": {
    kind: "single",
    nouns: ["Botiquín", "Venda cohesiva"],
    weight: 1,
    base: 9.9,
  },
  "motivadores-perro": { kind: "single", nouns: ["Mordedor", "Tug"], weight: 1, base: 8.9 },
  "peluches-perro": { kind: "size", nouns: ["Peluche", "Peluche sonoro"], weight: 1, base: 7.9 },
  "estimulacion-mental-perro": {
    kind: "single",
    nouns: ["Alfombra olfativa", "Puzle"],
    weight: 1,
    base: 14.9,
  },
  "mas-juguetes-perro": { kind: "single", nouns: ["Pelota", "Frisbee"], weight: 1, base: 5.9 },
  "camas-sofas-perro": { kind: "size", nouns: ["Cama", "Sofá"], weight: 2, base: 34.9 },
  "camas-refrescantes-perro": {
    kind: "size",
    nouns: ["Cama refrescante", "Manta refrescante"],
    weight: 1,
    base: 24.9,
  },
  "alimentacion-gato": {
    kind: "food",
    nouns: ["Pienso gato", "Pienso gato esterilizado"],
    weight: 2,
    base: 14.9,
  },
  "juguetes-gato": { kind: "single", nouns: ["Caña", "Ratón"], weight: 1, base: 4.9 },
  "higiene-cuidados-gato": {
    kind: "liquid",
    nouns: ["Champú gato", "Spray"],
    weight: 1,
    base: 7.9,
  },
  "accesorios-gato": { kind: "single", nouns: ["Rascador", "Arenero"], weight: 1, base: 19.9 },
  "descanso-gato": { kind: "size", nouns: ["Cama gato", "Cueva"], weight: 1, base: 19.9 },
  "accesorios-para-ti": {
    kind: "single",
    nouns: ["Taza", "Bolsa", "Gorra"],
    weight: 1,
    base: 12.9,
  },
  "libros-para-ti": { kind: "book", nouns: ["Guía", "Manual"], weight: 1, base: 14.9 },
};
const DEFAULT_PROFILE: Profile = { kind: "single", nouns: ["Artículo"], weight: 1, base: 9.9 };

const ADJECTIVES = [
  "Natural",
  "Premium",
  "Esencial",
  "Original",
  "Plus",
  "Confort",
  "Sport",
  "Eco",
];
const COLORS = ["Rojo", "Azul", "Negro", "Verde"];
const FLAVOURS = ["Pollo", "Ternera", "Salmón", "Cordero"];

export const MOCK_HEADER = [
  "handle",
  "titulo",
  "subtitulo",
  "descripcion",
  "categorias",
  "etiquetas",
  "iva",
  "coleccion",
  "estado",
  "marca",
  "proteina_pct",
  "grasa_pct",
  "fibra_pct",
  "cenizas_pct",
  "humedad_pct",
  "analitico:Calcio",
  "granel",
  "descatalogado",
  "sustituto",
  "opcion:Talla",
  "opcion:Color",
  "opcion:Peso",
  "opcion:Volumen",
  "opcion:Tamaño",
  "opcion:Sabor",
  "opcion:Encuadernación",
  "sku",
  "precio",
  "precio_oferta",
  "stock",
  "peso_g",
  "neto_g",
  "neto_ml",
  "paso_g",
  "min_g",
  "precio_kg",
  "stock_g",
] as const;
type Column = (typeof MOCK_HEADER)[number];
type Row = Partial<Record<Column, string>>;

interface Variant {
  options: Partial<Record<Column, string>>;
  /** Multiplicador del precio base. */
  factor: number;
  netG?: number;
  netMl?: number;
}

export const slug = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

/** «12,95» (coma decimal, como la hoja de un usuario). Termina en ,90 o ,95. */
const money = (n: number) => n.toFixed(2).replace(".", ",");
const roundPrice = (n: number, i: number) => Math.max(0.95, Math.floor(n) + (i % 2 ? 0.95 : 0.9));

/**
 * Categorías que llena otro script (la correa a medida, `correas:sync`, Fase E-2): el mock no
 * pone productos en ellas y su padre sigue contando como hoja (así los handles `mock-*` no
 * cambian al añadirlas).
 */
export const NOT_MOCKED = new Set(["correas-perro"]);

/** Hojas del árbol (categorías sin hijas), en el orden de la hoja. */
export function leafCategories(categories: CategorySheet[]): CategorySheet[] {
  const tree = categories.filter((c) => !NOT_MOCKED.has(c.handle));
  const parents = new Set(tree.map((c) => c.parent).filter(Boolean));
  return tree.filter((c) => !parents.has(c.handle) && c.active !== false);
}

function variantsFor(kind: Kind, i: number): Variant[] {
  switch (kind) {
    case "food":
      return [
        { options: { "opcion:Peso": "3 kg" }, factor: 1, netG: 3000 },
        { options: { "opcion:Peso": "12 kg" }, factor: 2.8, netG: 12000 },
      ];
    case "wet":
      return [
        { options: { "opcion:Peso": "400 g" }, factor: 1, netG: 400 },
        { options: { "opcion:Peso": "800 g" }, factor: 1.7, netG: 800 },
      ];
    case "snack":
      return FLAVOURS.slice(0, 2 + (i % 2)).map((f) => ({
        options: { "opcion:Sabor": f },
        factor: 1,
        netG: 150,
      }));
    case "supp":
      return [
        i % 2 ? { options: {}, factor: 1, netMl: 250 } : { options: {}, factor: 1, netG: 250 },
      ];
    case "wear": {
      const colors = [COLORS[i % COLORS.length]!, COLORS[(i + 1) % COLORS.length]!];
      return ["S", "M", "L"].flatMap((t, k) =>
        colors.map((c) => ({
          options: { "opcion:Talla": t, "opcion:Color": c },
          factor: 1 + k * 0.2,
        })),
      );
    }
    case "size":
      return ["S", "M", "L"].map((t, k) => ({
        options: { "opcion:Tamaño": t },
        factor: 1 + k * 0.35,
      }));
    case "liquid":
      return [
        { options: { "opcion:Volumen": "250 ml" }, factor: 1, netMl: 250 },
        { options: { "opcion:Volumen": "500 ml" }, factor: 1.6, netMl: 500 },
      ];
    case "book":
      return [
        { options: { "opcion:Encuadernación": "Tapa blanda" }, factor: 1 },
        { options: { "opcion:Encuadernación": "Tapa dura" }, factor: 1.5 },
      ];
    default:
      return [{ options: {}, factor: 1 }];
  }
}

/** Componentes analíticos plausibles (% tal cual) por tipo. */
function analyticsFor(kind: Kind, i: number): Row {
  const n = (lo: number, span: number, k = 1) => String(lo + ((i * k) % (span + 1)));
  if (kind === "food")
    return {
      proteina_pct: n(24, 10),
      grasa_pct: n(12, 8, 3),
      fibra_pct: `${n(2, 2)},5`,
      cenizas_pct: `${n(6, 3, 5)},5`,
      humedad_pct: n(8, 2),
      "analitico:Calcio": `1,${n(0, 5)} %`,
    };
  if (kind === "wet")
    return {
      proteina_pct: n(8, 3),
      grasa_pct: n(4, 3, 3),
      fibra_pct: "0,5",
      cenizas_pct: "2,5",
      humedad_pct: n(70, 8),
    };
  if (kind === "snack")
    return { proteina_pct: n(40, 30), grasa_pct: n(8, 12, 3), humedad_pct: n(8, 6) };
  return {};
}

function tagsFor(kind: Kind, leaf: string, i: number): string[] {
  const tags: string[] = [];
  if (i % 10 === 3) tags.push("novedad");
  if ((kind === "food" || kind === "snack") && i % 4 === 0) tags.push("sin cereales");
  if ((kind === "food" || kind === "wet") && i % 5 === 0) tags.push("hipoalergénico");
  if (kind === "snack" || kind === "wet") tags.push("natural");
  if (kind === "wear" && i % 3 === 0) tags.push("reflectante");
  if (leaf.endsWith("para-ti")) tags.push("ideal para regalo");
  return tags;
}

const CSV_SPECIAL = /[",\n;]/;
const cell = (v: string | undefined) =>
  v === undefined ? "" : CSV_SPECIAL.test(v) ? `"${v.replace(/"/g, '""')}"` : v;

export interface MockCatalog {
  csv: string;
  products: number;
  variants: number;
  bulk: number;
  sale: number;
  featured: number;
  discontinued: number;
}

/**
 * `productos.csv` con `count` productos mock en las hojas de `categories`.
 * Reglas (por índice global i = 1…count, sufijo `-NNN` del handle):
 *   - oferta (−20 %): i % 12 === 5 · agotado entero: i % 23 === 7 · primera variante agotada: i % 9 === 4
 *   - destacados: i % 25 === 1 (y con stock) · granel: 1 de cada 3 productos de snacks
 *   - descatalogado (Fase E): i % 50 === 46, con sustituto = el primer producto de su hoja
 */
export function buildMockCatalog(categories: CategorySheet[], count: number): MockCatalog {
  const leaves = leafCategories(categories);
  if (!leaves.length) throw new Error("categorias.csv no tiene categorías hoja activas");
  const slots = leaves.flatMap(
    (l) => Array(PROFILES[l.handle]?.weight ?? 1).fill(l) as CategorySheet[],
  );
  const perLeaf = new Map<string, number>();
  const firstOfLeaf = new Map<string, string>();
  const rows: Row[] = [];
  const stats = { products: 0, variants: 0, bulk: 0, sale: 0, featured: 0, discontinued: 0 };

  for (let i = 1; i <= count; i++) {
    const leaf = slots[(i - 1) % slots.length]!;
    const profile = PROFILES[leaf.handle] ?? DEFAULT_PROFILE;
    const k = perLeaf.get(leaf.handle) ?? 0;
    perLeaf.set(leaf.handle, k + 1);
    const noun = profile.nouns[Math.floor(k / ADJECTIVES.length) % profile.nouns.length]!;
    const adj = ADJECTIVES[(k + i) % ADJECTIVES.length]!;
    const title = `${noun} ${adj}`;
    const num = String(i).padStart(3, "0");
    const handle = `mock-${slug(title)}-${num}`;
    const replacement = firstOfLeaf.get(leaf.handle);
    if (!replacement) firstOfLeaf.set(leaf.handle, handle);
    const discontinued = i % 50 === 46 && Boolean(replacement);
    const skuBase = `MOCK-${num}`;
    const bulk = profile.kind === "snack" && k % 3 === 2;
    const soldOut = i % 23 === 7;
    const onSale = !bulk && i % 12 === 5;
    const featured = !bulk && !soldOut && i % 25 === 1;
    const iva =
      profile.kind === "book"
        ? "superreducido"
        : ["food", "wet", "snack", "supp"].includes(profile.kind)
          ? "reducido"
          : "general";
    const product: Row = {
      handle,
      titulo: title,
      subtitulo: leaf.name ?? "",
      descripcion: `${title}: producto de prueba generado para desarrollo (${leaf.name ?? leaf.handle}).`,
      categorias: leaf.handle,
      etiquetas: tagsFor(profile.kind, leaf.handle, i).join("|"),
      iva,
      coleccion: featured ? "destacados" : "",
      estado: "publicado",
      marca: i % 3 ? "Hiro" : "Rincón",
      ...(discontinued ? { descatalogado: "sí", sustituto: replacement } : {}),
      ...analyticsFor(profile.kind, i),
    };
    stats.products++;
    if (featured) stats.featured++;
    if (discontinued) stats.discontinued++;

    if (bulk) {
      const priceKg = [18, 20, 24][i % 3]!;
      rows.push({
        ...product,
        granel: "sí",
        sku: `${skuBase}-GR`,
        paso_g: "5",
        min_g: "100",
        precio_kg: String(priceKg),
        stock_g: soldOut ? "0" : "2400",
      });
      stats.variants++;
      stats.bulk++;
      continue;
    }
    if (onSale) stats.sale++;
    variantsFor(profile.kind, i).forEach((v, vi) => {
      const price = roundPrice(profile.base * v.factor + ((i * 7) % 9), i);
      const sale = onSale ? roundPrice(price * 0.8, i) : undefined;
      const stock = soldOut || (i % 9 === 4 && vi === 0) ? 0 : 5 + ((i * 7 + vi * 3) % 40);
      rows.push({
        ...(vi === 0 ? product : { handle }),
        ...v.options,
        sku: `${skuBase}-${vi + 1}`,
        precio: money(price),
        precio_oferta: sale !== undefined && sale < price ? money(sale) : "",
        stock: String(stock),
        peso_g: String(Math.round((v.netG ?? 300) * 1.05 + 50)),
        neto_g: v.netG ? String(v.netG) : "",
        neto_ml: v.netMl ? String(v.netMl) : "",
      });
      stats.variants++;
    });
  }

  const lines = [
    "# CATÁLOGO DE PRUEBA generado por `catalog:mock` (Fase S). NO EDITAR: se regenera.",
    MOCK_HEADER.join(","),
    ...rows.map((r) => MOCK_HEADER.map((c) => cell(r[c])).join(",")),
  ];
  return { csv: `${lines.join("\n")}\n`, ...stats };
}
