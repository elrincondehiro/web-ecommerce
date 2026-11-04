/**
 * Datos que el cliente añade a una línea del carrito (`line_item.metadata`): correa a medida
 * (Fase E-2) y caja de snacks (Fase CS). Qué datos admite una línea lo decide el diseño de su
 * producto (lib/disenos.ts `datos_linea`).
 *
 * - `lineDataError`: validación (backend, hook validar-carrito). El cliente puede escribir la
 *   metadata por la Store API: todo se vuelve a validar y nada de esto toca importes.
 * - `cajaFromForm`: del formulario de la ficha a la metadata (storefront, action `cart.addCaja`).
 * - `lineDetails`: textos para el carrito, el pedido, los emails y el Admin.
 *
 * Funciones PURAS y sin dependencias. ⚠️ Este fichero existe IGUAL en el storefront
 * (apps/storefront/src/lib/line-data.ts) y en el backend (apps/backend/src/lib/line-data.ts); los
 * tests comprueban que son idénticos. Cambia los dos a la vez.
 */

export type LineDataKind = "correa" | "caja";

// ── Correa a medida ────────────────────────────────────────────────────────

export const CORREA_LINE_META = { notes: "observaciones", exactCm: "medida_cm" } as const;
export const NOTES_MAX = 200;

/** Medida exacta válida para un largo: (largo − 1) m < medida ≤ largo m, en centímetros. */
export function exactRange(lengthM: number) {
  return { minCm: (lengthM - 1) * 100 + 1, maxCm: lengthM * 100 };
}

// ── Caja de snacks ─────────────────────────────────────────────────────────

/** Claves de la metadata de una línea de caja (cortas: viajan en cada carrito y pedido). */
export const CAJA_META = {
  animal: "caja_animal",
  name: "caja_nombre",
  breed: "caja_raza",
  puppy: "caja_cachorro",
  age: "caja_edad",
  weight: "caja_peso",
  dislikes: "caja_no_gusta",
  tried: "caja_probado",
  hair: "caja_pelo",
  chew: "caja_mastica",
  chewOther: "caja_mastica_otro",
  health: "caja_salud",
  /** Identificador aleatorio de cada caja: dos envíos del formulario nunca se juntan en una línea. */
  ref: "caja_ref",
} as const;

/** `caja_ref`: lo genera la action con `crypto.randomUUID()` (minúsculas). */
const CAJA_REF_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * Una caja de snacks va siempre en su línea con cantidad 1: cada una se prepara para su mascota.
 * Para otra caja (aunque sea para el mismo peque), otro envío del formulario.
 */
export const CAJA_QUANTITY_ERROR =
  "Cada caja de snacks va en su propia línea: para otra caja, vuelve a rellenar el formulario.";

/** ¿Es la línea de una caja de snacks? (por sus datos). */
export const isCajaLine = (metadata: Record<string, unknown> | null | undefined) =>
  typeof metadata?.[CAJA_META.ref] === "string";

/**
 * Contenido de una caja (Fase CS-3): líneas del pedido a 0 € que la tienda añade desde el Admin,
 * con `caja_de` = id de la línea de su caja. El cliente no las ve hasta que se le propone la caja
 * (CS-4): hasta entonces la caja dice «Preparando tu caja».
 */
export const CAJA_CONTENT_KEY = "caja_de";
export const CAJA_PREPARING = "Preparando tu caja";

/** Estado de una caja tal y como lo ve el cliente (GET /store/cajas?pedido=…). */
export type CajaClientState = "preparando" | "propuesta" | "aceptada";
export const CAJA_CLIENT_LABEL: Record<CajaClientState, string> = {
  preparando: CAJA_PREPARING,
  propuesta: "Te la hemos enseñado por email: dinos si te convence",
  aceptada: "Caja aceptada: la enviamos con tu pedido",
};

export const isCajaContentLine = (metadata: Record<string, unknown> | null | undefined) =>
  typeof metadata?.[CAJA_CONTENT_KEY] === "string";

/**
 * Líneas que ve el cliente en su pedido: sin el contenido de las cajas, salvo el de las cajas de
 * `visible` (ids de sus líneas: propuestas o aceptadas).
 */
export const customerLines = <T extends { metadata?: Record<string, unknown> | null }>(
  items: readonly (T | null | undefined)[] | null | undefined,
  visible: ReadonlySet<string> = new Set(),
): T[] =>
  (items ?? []).filter(
    (i): i is T =>
      !!i &&
      (!isCajaContentLine(i.metadata) || visible.has(i.metadata?.[CAJA_CONTENT_KEY] as string)),
  );

/** Línea mínima para agrupar el contenido de las cajas (pedido o carrito). */
type ContentLike = {
  id?: string | null;
  quantity?: number | null;
  product_title?: string | null;
  variant_title?: string | null;
  metadata?: Record<string, unknown> | null;
  variant?: { metadata?: Record<string, unknown> | null } | null;
};

const gramsLabel = (g: number) =>
  g >= 1000 && g % 100 === 0 ? `${String(g / 1000).replace(".", ",")} kg` : `${g} g`;

/**
 * Contenido de cada caja (id de su línea → «3 × Orejas», «150 g · Premios»), solo de las cajas
 * de `visible` (propuestas o aceptadas). El granel va en gramos (`paso_g` de la variante).
 */
export function cajaContents(
  items: readonly (ContentLike | null | undefined)[] | null | undefined,
  visible: ReadonlySet<string>,
): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const i of items ?? []) {
    const box = i?.metadata?.[CAJA_CONTENT_KEY];
    if (!i || typeof box !== "string" || !visible.has(box)) continue;
    const q = Number(i.quantity ?? 0);
    if (!(q > 0)) continue;
    const variant = i.variant_title && i.variant_title !== "Única" ? i.variant_title : null;
    const title = [i.product_title ?? "Producto", variant].filter(Boolean).join(" · ");
    const step = Number(i.variant?.metadata?.paso_g);
    const line =
      Number.isInteger(step) && step > 0 ? `${gramsLabel(q * step)} · ${title}` : `${q} × ${title}`;
    out.set(box, [...(out.get(box) ?? []), line]);
  }
  return out;
}

/**
 * Detalles de una línea en un PEDIDO: los de `lineDetails` y, en las cajas, su estado para el
 * cliente («Preparando tu caja» si no se sabe); en el contenido de una caja, «En la caja».
 */
export function orderLineDetails(
  metadata: Record<string, unknown> | null | undefined,
  state: CajaClientState = "preparando",
): string[] {
  if (isCajaContentLine(metadata)) return ["En la caja de snacks"];
  return isCajaLine(metadata)
    ? [...lineDetails(metadata), CAJA_CLIENT_LABEL[state]]
    : lineDetails(metadata);
}

/** Solo perro o gato (decisión del usuario: por ahora no hay snacks para otros animales). */
export const CAJA_ANIMALS = { perro: "Perro", gato: "Gato" } as const;
export const CAJA_HAIR = { si: "Sí", no: "No", igual: "Me da igual" } as const;
export const CAJA_CHEW = {
  tranquilo: "Tranquilo",
  ansioso: "Ansioso",
  engulle: "Engulle",
} as const;
/** Longitudes máximas (caracteres). */
export const CAJA_MAX = { short: 30, long: 80 } as const;
export const CAJA_AGE = { years: { min: 1, max: 25 }, months: { min: 1, max: 12 } } as const;
export const CAJA_WEIGHT = { min: 0.5, max: 100, step: 0.5 } as const;

export type CajaAnimal = keyof typeof CAJA_ANIMALS;
export type CajaHair = keyof typeof CAJA_HAIR;
export type CajaChew = keyof typeof CAJA_CHEW;

/** Datos de una caja tal y como van en la metadata de la línea. */
export interface CajaData {
  caja_animal: CajaAnimal;
  caja_nombre: string;
  caja_raza?: string;
  caja_cachorro: boolean;
  /** Años (o meses si es cachorro). */
  caja_edad: number;
  caja_peso: number;
  caja_no_gusta?: string;
  caja_probado?: string;
  caja_pelo: CajaHair;
  caja_mastica?: CajaChew[];
  caja_mastica_otro?: string;
  /** Solo con el consentimiento marcado. */
  caja_salud?: string;
  caja_ref: string;
}

/** Lo que llega del formulario de la ficha (action `cart.addCaja`; vacíos → null). */
export interface CajaForm {
  animal?: string | null | undefined;
  nombre?: string | null | undefined;
  raza?: string | null | undefined;
  cachorro?: boolean | null | undefined;
  edad?: number | null | undefined;
  peso?: number | null | undefined;
  no_gusta?: string | null | undefined;
  probado?: string | null | undefined;
  pelo?: string | null | undefined;
  mastica?: string[] | null | undefined;
  mastica_otro?: string | null | undefined;
  salud?: string | null | undefined;
  salud_ok?: boolean | null | undefined;
}

export type CajaField =
  | "animal"
  | "nombre"
  | "raza"
  | "edad"
  | "peso"
  | "no_gusta"
  | "probado"
  | "pelo"
  | "mastica"
  | "mastica_otro"
  | "salud";

// Caracteres de control (salvo el salto de línea): no pintan nada en el taller ni en el email
// eslint-disable-next-line no-control-regex
const CONTROL_RE = /[\u0000-\u0009\u000b-\u001f\u007f]/;
// Textos cortos de una línea: sin saltos
// eslint-disable-next-line no-control-regex
const LINE_CONTROL_RE = /[\u0000-\u001f\u007f]/;

const has = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);
const len = (s: string) => [...s].length;

/** Texto corto limpio: null si vacío, false si no vale (largo o con caracteres de control). */
function cleanText(raw: unknown, max: number): string | null | false {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== "string") return false;
  const s = raw.trim().replace(/\s+/g, " ");
  if (!s) return null;
  if (len(s) > max || LINE_CONTROL_RE.test(s)) return false;
  return s;
}

const isStep = (n: number, step: number) => Math.abs(n / step - Math.round(n / step)) < 1e-9;

/**
 * Del formulario de la ficha a la metadata de la línea. Devuelve los datos o los campos con
 * error (el formulario vuelve con un aviso). Sin `salud_ok`, la salud NO se guarda (decisión del
 * usuario, como «Mis peques» en la Fase M).
 */
export function cajaFromForm(
  f: CajaForm,
  ref: string,
): { ok: true; data: CajaData } | { ok: false; fields: CajaField[] } {
  const bad: CajaField[] = [];
  const text = (field: CajaField, raw: unknown, max: number) => {
    const v = cleanText(raw, max);
    if (v === false) bad.push(field);
    return v || undefined;
  };
  const animal = f.animal ?? "";
  if (!has(CAJA_ANIMALS, animal)) bad.push("animal");
  const name = text("nombre", f.nombre, CAJA_MAX.short);
  if (!name && !bad.includes("nombre")) bad.push("nombre");
  const breed = text("raza", f.raza, CAJA_MAX.short);
  const puppy = f.cachorro === true;
  const range = puppy ? CAJA_AGE.months : CAJA_AGE.years;
  const age = f.edad;
  if (typeof age !== "number" || !Number.isInteger(age) || age < range.min || age > range.max) {
    bad.push("edad");
  }
  const weight = f.peso;
  if (
    typeof weight !== "number" ||
    !Number.isFinite(weight) ||
    weight < CAJA_WEIGHT.min ||
    weight > CAJA_WEIGHT.max ||
    !isStep(weight, CAJA_WEIGHT.step)
  ) {
    bad.push("peso");
  }
  const dislikes = text("no_gusta", f.no_gusta, CAJA_MAX.long);
  const tried = text("probado", f.probado, CAJA_MAX.long);
  const hair = f.pelo ?? "igual";
  if (!has(CAJA_HAIR, hair)) bad.push("pelo");
  const chew = [...new Set(f.mastica ?? [])];
  if (chew.some((c) => !has(CAJA_CHEW, c))) bad.push("mastica");
  const chewOther = text("mastica_otro", f.mastica_otro, CAJA_MAX.short);
  // Salud: solo con el consentimiento; sin él, se descarta (aunque venga escrita)
  const health = f.salud_ok === true ? text("salud", f.salud, CAJA_MAX.long) : undefined;
  if (bad.length) return { ok: false, fields: bad };
  const data: CajaData = {
    caja_animal: animal as CajaAnimal,
    caja_nombre: name!,
    caja_cachorro: puppy,
    caja_edad: age as number,
    caja_peso: weight as number,
    caja_pelo: hair as CajaHair,
    caja_ref: ref,
  };
  if (breed) data.caja_raza = breed;
  if (dislikes) data.caja_no_gusta = dislikes;
  if (tried) data.caja_probado = tried;
  if (chew.length) data.caja_mastica = chew as CajaChew[];
  if (chewOther) data.caja_mastica_otro = chewOther;
  if (health) data.caja_salud = health;
  return { ok: true, data };
}

// ── Validación (backend) ───────────────────────────────────────────────────

/** Entradas con valor (sin vacíos), o un error si la metadata no es un objeto. */
function entriesOf(metadata: unknown): [string, unknown][] | string {
  if (metadata === undefined || metadata === null) return [];
  if (typeof metadata !== "object" || Array.isArray(metadata))
    return "Datos de la línea no válidos.";
  return Object.entries(metadata as Record<string, unknown>).filter(
    ([, v]) => v !== undefined && v !== null && v !== "",
  );
}

function correaError(entries: [string, unknown][], lengthM: number | null): string | null {
  const allowed = new Set<string>(Object.values(CORREA_LINE_META));
  for (const [key, value] of entries) {
    if (!allowed.has(key)) return "Datos de la línea no válidos.";
    if (key === CORREA_LINE_META.notes) {
      if (typeof value !== "string") return "Las observaciones deben ser texto.";
      if (len(value) > NOTES_MAX) {
        return `Las observaciones no pueden pasar de ${NOTES_MAX} caracteres.`;
      }
      if (CONTROL_RE.test(value)) return "Las observaciones tienen caracteres no válidos.";
    }
    if (key === CORREA_LINE_META.exactCm) {
      if (typeof value !== "number" || !Number.isInteger(value) || lengthM === null) {
        return "La medida exacta no es válida.";
      }
      const { minCm, maxCm } = exactRange(lengthM);
      if (value < minCm || value > maxCm) {
        const m = (cm: number) => String(cm / 100).replace(".", ",");
        return `Para una correa de ${lengthM} m, la medida exacta va de ${m(minCm)} a ${m(maxCm)} m.`;
      }
    }
  }
  return null;
}

const CAJA_ERROR = "Revisa los datos de la caja de snacks.";

function cajaError(metadata: Record<string, unknown>): string | null {
  const keys = new Set<string>(Object.values(CAJA_META));
  if (Object.keys(metadata).some((k) => !keys.has(k))) return "Datos de la línea no válidos.";
  const m = metadata;
  const s = (k: string, max: number, required = false) => {
    const v = m[k];
    if (v === undefined) return !required;
    return typeof v === "string" && v.trim() !== "" && len(v) <= max && !LINE_CONTROL_RE.test(v);
  };
  const puppy = m[CAJA_META.puppy];
  const age = m[CAJA_META.age];
  const weight = m[CAJA_META.weight];
  const range = puppy === true ? CAJA_AGE.months : CAJA_AGE.years;
  const chew = m[CAJA_META.chew];
  const ok =
    typeof m[CAJA_META.ref] === "string" &&
    CAJA_REF_RE.test(m[CAJA_META.ref] as string) &&
    typeof m[CAJA_META.animal] === "string" &&
    has(CAJA_ANIMALS, m[CAJA_META.animal] as string) &&
    s(CAJA_META.name, CAJA_MAX.short, true) &&
    s(CAJA_META.breed, CAJA_MAX.short) &&
    typeof puppy === "boolean" &&
    typeof age === "number" &&
    Number.isInteger(age) &&
    age >= range.min &&
    age <= range.max &&
    typeof weight === "number" &&
    Number.isFinite(weight) &&
    weight >= CAJA_WEIGHT.min &&
    weight <= CAJA_WEIGHT.max &&
    isStep(weight, CAJA_WEIGHT.step) &&
    s(CAJA_META.dislikes, CAJA_MAX.long) &&
    s(CAJA_META.tried, CAJA_MAX.long) &&
    typeof m[CAJA_META.hair] === "string" &&
    has(CAJA_HAIR, m[CAJA_META.hair] as string) &&
    (chew === undefined ||
      (Array.isArray(chew) &&
        chew.length > 0 &&
        chew.length <= Object.keys(CAJA_CHEW).length &&
        new Set(chew).size === chew.length &&
        chew.every((c) => typeof c === "string" && has(CAJA_CHEW, c)))) &&
    s(CAJA_META.chewOther, CAJA_MAX.short) &&
    s(CAJA_META.health, CAJA_MAX.long);
  return ok ? null : CAJA_ERROR;
}

/**
 * Valida la metadata que el cliente pone en una línea. `kind` = qué datos admite el diseño de su
 * producto (null = ninguno); `lengthM` = largo de la variante (correa). Devuelve el mensaje de
 * error o null. Las líneas sin datos siempre valen, salvo la caja (los necesita para prepararla).
 */
export function lineDataError(
  metadata: unknown,
  kind: LineDataKind | null,
  lengthM: number | null = null,
): string | null {
  const entries = entriesOf(metadata);
  if (typeof entries === "string") return entries;
  if (kind === "caja") {
    if (!entries.length) return "Falta para quién es la caja de snacks.";
    return cajaError(Object.fromEntries(entries));
  }
  if (!entries.length) return null;
  if (kind === "correa") return correaError(entries, lengthM);
  return "Este producto no admite datos adicionales.";
}

// ── Textos (carrito, pedido, emails, Admin) ────────────────────────────────

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
const decimal = (n: number) => String(n).replace(".", ",");
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Partes de los datos de una caja (null si la línea no es de una caja). */
function cajaParts(m: Record<string, unknown>) {
  const name = str(m[CAJA_META.name]);
  if (!name) return null;
  const animal = m[CAJA_META.animal];
  const kind =
    typeof animal === "string" && has(CAJA_ANIMALS, animal)
      ? CAJA_ANIMALS[animal as CajaAnimal].toLowerCase()
      : null;
  const about = [kind, str(m[CAJA_META.breed])].filter(Boolean) as string[];
  const age = m[CAJA_META.age];
  const weight = m[CAJA_META.weight];
  const factList = [
    typeof age === "number"
      ? m[CAJA_META.puppy] === true
        ? `Cachorro de ${plural(age, "mes", "meses")}`
        : plural(age, "año", "años")
      : null,
    typeof weight === "number" ? `${decimal(weight)} kg aprox.` : null,
  ].filter(Boolean) as string[];
  const rest: string[] = [];
  const hair = m[CAJA_META.hair];
  if (typeof hair === "string" && has(CAJA_HAIR, hair)) {
    rest.push(`Snacks con pelo: ${CAJA_HAIR[hair as CajaHair].toLowerCase()}`);
  }
  const chew = Array.isArray(m[CAJA_META.chew])
    ? (m[CAJA_META.chew] as unknown[])
        .filter((c): c is CajaChew => typeof c === "string" && has(CAJA_CHEW, c))
        .map((c) => CAJA_CHEW[c].toLowerCase())
    : [];
  const chewOther = str(m[CAJA_META.chewOther]);
  if (chewOther) chew.push(chewOther);
  if (chew.length) rest.push(`Mastica: ${chew.join(", ")}`);
  for (const [key, label] of [
    [CAJA_META.health, "Alergias o condiciones"],
    [CAJA_META.dislikes, "No le gusta"],
    [CAJA_META.tried, "Ha probado"],
  ] as const) {
    const v = str(m[key]);
    if (v) rest.push(`${label}: ${v}`);
  }
  return {
    name,
    who: `Para: ${name}${about.length ? ` (${about.join(", ")})` : ""}`,
    summary: `Para ${name}${about.length || factList.length ? ` (${[...about, ...factList].join(", ")})` : ""}`,
    facts: factList.length ? factList.join(" · ") : null,
    rest,
  };
}

/**
 * Caja de snacks (Fase CS), para que la línea no sea muy ancha:
 * - `name`: «Para Toby», el resumen del `<details>` (carrito, checkout, pedido, cuenta, Admin);
 * - `summary`: «Para Toby (perro, Border collie, 3 años, 12,5 kg aprox.)», la línea de los
 *   emails (los clientes de correo no tienen <details>);
 * - `details`: lo de dentro del `<details>` («Perro, Border collie», «3 años · 12,5 kg aprox.»,
 *   «Mastica: engulle»…); en los emails, sin la primera (ya va en `summary`).
 * null si la línea no es de una caja.
 */
export function cajaSummary(
  metadata: Record<string, unknown> | null | undefined,
): { name: string; summary: string; details: string[]; emailDetails: string[] } | null {
  const p = cajaParts(metadata ?? {});
  if (!p) return null;
  const about = p.who.replace(/^Para: [^(]*/, "").replace(/^\(|\)$/g, "");
  return {
    name: `Para ${p.name}`,
    summary: p.summary,
    details: [
      ...(about ? [about.charAt(0).toUpperCase() + about.slice(1)] : []),
      ...(p.facts ? [p.facts] : []),
      ...p.rest,
    ],
    emailDetails: p.rest,
  };
}

/** Líneas extra de una línea de carrito o pedido, según sus datos (correa o caja). */
export function lineDetails(metadata: Record<string, unknown> | null | undefined): string[] {
  const m = metadata ?? {};
  const out: string[] = [];
  // Correa
  const cm = m[CORREA_LINE_META.exactCm];
  if (typeof cm === "number" && Number.isInteger(cm) && cm > 0) {
    out.push(`Medida exacta: ${(cm / 100).toFixed(2).replace(".", ",")} m`);
  }
  const notes = str(m[CORREA_LINE_META.notes]);
  if (notes) out.push(`Observaciones: ${notes}`);
  // Caja
  const caja = cajaParts(m);
  if (caja) out.push(caja.who, ...(caja.facts ? [caja.facts] : []), ...caja.rest);
  return out;
}
