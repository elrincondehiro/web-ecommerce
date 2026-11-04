/**
 * Caja de snacks (Fase CS-3/4, docs/fases/faseCS-caja-snacks.md): rellenarla desde el Admin y
 * proponerla al cliente (aceptar / rechazar).
 * Lógica pura (sin contenedor): estados, validación del contenido, PVP y qué ve el cliente.
 *
 * El contenido son líneas del pedido a 0 € añadidas con una **edición de pedido** de Medusa
 * (spike CS-3: el total no cambia, se reservan al confirmar y se descuentan al enviar). Cada línea
 * lleva `metadata.caja_de = <id de la línea de la caja>`. Solo con el pago **capturado**: con un
 * pago solo autorizado, Medusa 2.22.2 cancela el cobro al confirmar la edición
 * (`create-or-update-order-payment-collection`: cobro `authorized` + importe pendiente → recrea).
 */
import { CAJA_CONTENT_KEY } from "./line-data";

/**
 * Estados de una caja (CS-3 + CS-4):
 * pendiente → rellena → propuesta → aceptada | aceptada_auto (24 h sin respuesta) | rechazada.
 * Una rechazada se vuelve a rellenar (→ rellena) y se vuelve a proponer A MANO.
 */
export const CAJA_ESTADOS = [
  "pendiente",
  "rellena",
  "propuesta",
  "aceptada",
  "aceptada_auto",
  "rechazada",
] as const;
export type CajaEstado = (typeof CAJA_ESTADOS)[number];

/** Estados en los que el contenido se puede cambiar (no está propuesto ni aceptado). */
export const CAJA_EDITABLE: readonly CajaEstado[] = ["pendiente", "rellena", "rechazada"];

/** Estados que se pueden proponer al cliente. */
export const CAJA_PROPONIBLE: readonly CajaEstado[] = ["rellena"];

/** Estados aceptados: el pedido solo se envía con TODAS sus cajas así. */
export const CAJA_ACEPTADA: readonly CajaEstado[] = ["aceptada", "aceptada_auto"];

/** Estados en los que el cliente ve el contenido (desde que se le propone; rechazada: se rehace). */
export const CAJA_VISIBLE: readonly CajaEstado[] = ["propuesta", "aceptada", "aceptada_auto"];

/** Estados «sin preparar» para el aviso interno de 48 h laborables. */
export const CAJA_SIN_PREPARAR: readonly CajaEstado[] = ["pendiente", "rechazada"];

export const CAJA_ESTADO_LABEL: Record<CajaEstado, string> = {
  pendiente: "Sin preparar",
  rellena: "Preparada (sin proponer)",
  propuesta: "Propuesta al cliente",
  aceptada: "Aceptada",
  aceptada_auto: "Aceptada automáticamente (24 h)",
  rechazada: "Rechazada por el cliente",
};

/** Máximo del motivo de rechazo («¿Qué no le gusta?»). */
export const CAJA_MOTIVO_MAX = 500;

/** Clave de la metadata de las líneas del contenido: id de la línea de su caja (line-data.ts). */
export const CAJA_DE = CAJA_CONTENT_KEY;

/** Categorías de las que se puede llenar una caja (y todas sus hijas), por handle. */
export const CAJA_SNACK_CATEGORIES = ["snacks-perro", "snacks-gato"] as const;

/** Máximos del contenido de una caja (contra errores de tecleo en el Admin). */
export const CAJA_CONTENT_MAX = { lines: 30, quantity: 20, grams: 1000 } as const;

export const CAJA_MESSAGES = {
  notCaptured:
    "Captura el pago del pedido antes de preparar la caja (con el pago solo autorizado, Medusa lo cancelaría al guardar el contenido).",
  notEditable:
    "Esta caja está propuesta o aceptada: su contenido ya no se puede cambiar (si la rechaza, sí).",
  canceled: "El pedido está cancelado.",
  empty: "Añade al menos un producto a la caja.",
  tooMany: `Como mucho ${CAJA_CONTENT_MAX.lines} productos distintos por caja.`,
  quantity: `Cantidad no válida (de 1 a ${CAJA_CONTENT_MAX.quantity}).`,
  grams: `Gramos no válidos (hasta ${CAJA_CONTENT_MAX.grams} g, en pasos del producto).`,
  duplicate: "Hay un producto repetido: junta sus cantidades.",
  notSnack: "Solo se pueden meter productos de Snacks (perro o gato) y sus subcategorías.",
  unknown: "Hay un producto que no existe o no está publicado.",
  pendingEdit:
    "El pedido tiene una edición sin terminar (Admin → pedido): confírmala o cancélala antes.",
  shipBlocked:
    "No se puede enviar: el pedido tiene cajas de snacks sin aceptar por el cliente (o sin preparar).",
  notProposable: "Para proponer, todas las cajas del pedido tienen que estar preparadas.",
  nothingToPropose: "No hay ninguna caja preparada que proponer.",
} as const;

export const lowPvpMessage = (pvp: number, paid: number) =>
  `El contenido vale ${euros(pvp)} (PVP) y la caja ${euros(paid)}: tiene que valer al menos lo pagado.`;

export const euros = (n: number) =>
  `${n.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

/** Una línea del contenido. `quantity`: unidades, o GRAMOS si el producto es a granel. */
export interface ContentLine {
  variant_id: string;
  quantity: number;
}

/** Variante candidata, ya leída de la base de datos. */
export interface CandidateVariant {
  id: string;
  /** PVP actual (IVA incluido) en la región del pedido; null = sin precio. */
  price: number | null;
  published: boolean;
  /** ¿Está en una categoría de snacks (o hija)? */
  snack: boolean;
  /** Gramos de cada paso si es a granel (el precio es el de un paso); null = por unidades. */
  stepG: number | null;
}

/** Línea ya convertida a la cantidad de Medusa (pasos en el granel). */
export interface ResolvedLine {
  variant_id: string;
  quantity: number;
}

/**
 * Valida el contenido pedido para una caja y calcula su PVP. Devuelve el mensaje de error o el
 * total. `paid`: lo que pagó el cliente por la caja (precio unitario de su línea).
 */
export function checkContent(
  lines: ContentLine[],
  variants: Map<string, CandidateVariant>,
  paid: number,
): { ok: true; pvp: number; lines: ResolvedLine[] } | { ok: false; message: string } {
  if (!lines.length) return { ok: false, message: CAJA_MESSAGES.empty };
  if (lines.length > CAJA_CONTENT_MAX.lines) return { ok: false, message: CAJA_MESSAGES.tooMany };
  const seen = new Set<string>();
  const resolved: ResolvedLine[] = [];
  let cents = 0;
  for (const l of lines) {
    if (seen.has(l.variant_id)) return { ok: false, message: CAJA_MESSAGES.duplicate };
    seen.add(l.variant_id);
    const v = variants.get(l.variant_id);
    if (!v || !v.published || v.price === null) {
      return { ok: false, message: CAJA_MESSAGES.unknown };
    }
    if (!v.snack) return { ok: false, message: CAJA_MESSAGES.notSnack };
    const units = v.stepG ? bulkUnits(l.quantity, v.stepG) : plainUnits(l.quantity);
    if (units === null) {
      return { ok: false, message: v.stepG ? CAJA_MESSAGES.grams : CAJA_MESSAGES.quantity };
    }
    resolved.push({ variant_id: l.variant_id, quantity: units });
    cents += Math.round(v.price * 100) * units;
  }
  const pvp = cents / 100;
  if (cents < Math.round(paid * 100)) return { ok: false, message: lowPvpMessage(pvp, paid) };
  return { ok: true, pvp, lines: resolved };
}

/** Unidades válidas (1 a 20) o null. */
const plainUnits = (q: number) =>
  Number.isInteger(q) && q >= 1 && q <= CAJA_CONTENT_MAX.quantity ? q : null;

/**
 * Granel: gramos → pasos de Medusa (múltiplo del paso, hasta 1000 g). Sin el mínimo por pedido de
 * la web: en la caja se puede meter menos (decisión del usuario).
 */
const bulkUnits = (grams: number, stepG: number) =>
  Number.isInteger(grams) &&
  grams >= stepG &&
  grams <= CAJA_CONTENT_MAX.grams &&
  grams % stepG === 0
    ? grams / stepG
    : null;

// ── Textos (email de la propuesta, página de respuesta) ────────────────────

const grams = (g: number) =>
  g >= 1000 && g % 100 === 0 ? `${String(g / 1000).replace(".", ",")} kg` : `${g} g`;

/** «3 × Orejas» o, a granel, «150 g · Premios» (`quantity` en gramos si `step_g`). */
export const contentLine = (c: { title: string; quantity: number; step_g: number | null }) =>
  c.step_g ? `${grams(c.quantity)} · ${c.title}` : `${c.quantity} × ${c.title}`;

/** Enlace de respuesta de una caja (`/cuenta/caja/?pedido=…&caja=…&token=…`, sin sesión). */
export function cajaAnswerUrl(
  storefrontUrl: string,
  orderId: string,
  lineItemId: string,
  token: string,
): string {
  const q = new URLSearchParams({ pedido: orderId, caja: lineItemId, token });
  return `${storefrontUrl.replace(/\/+$/, "")}/cuenta/caja/?${q.toString()}`;
}
