/**
 * Transferencia bancaria (Fase PG-3). Funciones PURAS (configuración, plazos y textos); las usan
 * el middleware, el hook al completar, los emails, la ruta de la tienda y el job diario.
 *
 * - Proveedor: el pago manual de Medusa (`pp_system_default`): autoriza al momento sin cobrar; al
 *   recibir el dinero se CAPTURA desde el Admin (= marcar como pagado).
 * - Solo clientes con cuenta y solo si hay IBAN (`TRANSFER_IBAN`, `TRANSFER_HOLDER`).
 * - Plazo: `TRANSFER_DAYS` días naturales (por defecto 3) desde el día del pedido (hora de
 *   España). El último día se manda un recordatorio; el día siguiente se cancela el pedido.
 * - Sin Stripe configurado (CI, desarrollo sin claves) el pago manual es el pago de pruebas de
 *   siempre y no se restringe: las barreras solo actúan con `STRIPE_API_KEY`.
 */
export const TRANSFER_PROVIDER_ID = "pp_system_default";
export const TRANSFER_DEFAULT_DAYS = 3;
export const TRANSFER_DEFAULT_CRON = "0 9 * * *";
const TZ = "Europe/Madrid";

export type TransferConfig = {
  enabled: boolean;
  iban: string;
  holder: string;
  days: number;
};

/** IBAN sin espacios y en mayúsculas («ES12 3456…» → «ES123456…»). */
export const normalizeIban = (iban: string) => iban.replace(/\s+/g, "").toUpperCase();

/** IBAN en grupos de 4 para leerlo y copiarlo. */
export const formatIban = (iban: string) =>
  normalizeIban(iban)
    .replace(/(.{4})/g, "$1 ")
    .trim();

export function transferDays(value: string | undefined): number {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= 14 ? n : TRANSFER_DEFAULT_DAYS;
}

export function transferConfig(env: NodeJS.ProcessEnv = process.env): TransferConfig {
  const iban = normalizeIban(env.TRANSFER_IBAN ?? "");
  const holder = (env.TRANSFER_HOLDER ?? "").trim();
  return {
    enabled: /^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(iban) && holder.length > 0,
    iban,
    holder,
    days: transferDays(env.TRANSFER_DAYS),
  };
}

/** ¿Se aplican las barreras (solo cuenta, solo con IBAN)? Solo con Stripe configurado. */
export const transferGuarded = (env: NodeJS.ProcessEnv = process.env) =>
  Boolean(env.STRIPE_API_KEY);

/** Día (YYYY-MM-DD) en hora de España. */
export function madridDay(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** Último día para pagar: día del pedido (España) + `days`. */
export function lastPayDay(createdAt: Date | string, days: number): string {
  const [y, m, d] = madridDay(new Date(createdAt)).split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d! + days)).toISOString().slice(0, 10);
}

export type TransferStage = "wait" | "remind" | "cancel";

/** Antes del último día: esperar; el último día: recordatorio; después: cancelar. */
export function transferStage(createdAt: Date | string, now: Date, days: number): TransferStage {
  const today = madridDay(now);
  const last = lastPayDay(createdAt, days);
  if (today > last) return "cancel";
  return today === last ? "remind" : "wait";
}

const MONTHS = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

/** «2026-10-28» → «28 de octubre de 2026». */
export function formatDay(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return `${d} de ${MONTHS[m! - 1]} de ${y}`;
}

/** Concepto de la transferencia (lo que el cliente escribe en su banco). */
export const transferConcept = (displayId: number | string) => `Pedido ${displayId}`;
