import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Plazos de la caja de snacks (Fase CS-4) y su token. Funciones PURAS.
 * - Aceptación automática: `CAJA_AUTOACCEPT_HOURS` (24 h) desde que se propone.
 * - Aviso interno: `CAJA_ALERT_WORK_HOURS` (48 h) LABORABLES sin preparar (desde el pedido o el
 *   rechazo). Laborable = lunes a viernes en Europe/Madrid, salvo los festivos de `CAJA_FESTIVOS`
 *   (`AAAA-MM-DD,…`; vacía = solo fines de semana). Se cuentan días completos de 24 h.
 * - Token: 32 bytes aleatorios (base64url) en el enlace del email; en la base de datos, solo su
 *   SHA-256. De un solo uso: al responder se borra.
 */

export const CAJA_DEFAULTS = { autoAcceptHours: 24, alertWorkHours: 48, cron: "*/15 * * * *" };
const TZ = "Europe/Madrid";

const positive = (raw: string | undefined, fallback: number) => {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

export interface CajaTimeConfig {
  autoAcceptHours: number;
  alertWorkHours: number;
  holidays: Set<string>;
}

/** Festivos de la variable (`2026-12-25,2027-01-01`); lo que no tenga forma de fecha se ignora. */
export function parseHolidays(raw: string | undefined): Set<string> {
  return new Set(
    (raw ?? "")
      .split(",")
      .map((d) => d.trim())
      .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)),
  );
}

export function cajaTimeConfig(env: Record<string, string | undefined> = process.env) {
  return {
    autoAcceptHours: positive(env.CAJA_AUTOACCEPT_HOURS, CAJA_DEFAULTS.autoAcceptHours),
    alertWorkHours: positive(env.CAJA_ALERT_WORK_HOURS, CAJA_DEFAULTS.alertWorkHours),
    holidays: parseHolidays(env.CAJA_FESTIVOS),
  } satisfies CajaTimeConfig;
}

/** Fecha (AAAA-MM-DD) y día de la semana (0 = domingo) de un instante en Madrid. */
function madridDay(t: number): { date: string; weekday: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).formatToParts(new Date(t));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday"));
  return { date: `${get("year")}-${get("month")}-${get("day")}`, weekday };
}

const isWorkday = (t: number, holidays: Set<string>) => {
  const { date, weekday } = madridDay(t);
  return weekday >= 1 && weekday <= 5 && !holidays.has(date);
};

/**
 * Horas laborables entre `from` y `to`: se recorre en tramos de 15 min y cuentan los que caen en
 * un día laborable de Madrid (exacto a 15 min; un aviso no necesita más).
 */
export function workHoursBetween(from: Date, to: Date, holidays: Set<string>): number {
  const STEP = 15 * 60 * 1000;
  let ms = 0;
  for (let t = from.getTime(); t < to.getTime();) {
    const next = Math.min(t + STEP, to.getTime());
    if (isWorkday(t, holidays)) ms += next - t;
    t = next;
  }
  return ms / (60 * 60 * 1000);
}

/** ¿Toca el aviso interno? (horas laborables desde `since` ≥ el umbral). */
export const needsAlert = (since: Date, now: Date, cfg: CajaTimeConfig) =>
  now.getTime() - since.getTime() >= cfg.alertWorkHours * 60 * 60 * 1000 &&
  workHoursBetween(since, now, cfg.holidays) >= cfg.alertWorkHours;

/** Fecha límite para responder (aceptación automática). */
export const deadline = (proposedAt: Date, cfg: Pick<CajaTimeConfig, "autoAcceptHours">) =>
  new Date(proposedAt.getTime() + cfg.autoAcceptHours * 60 * 60 * 1000);

/** «el martes 4 de noviembre a las 18:30» (Madrid), para el email y la página. */
export function deadlineLabel(d: Date): string {
  const day = new Intl.DateTimeFormat("es-ES", {
    timeZone: TZ,
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(d);
  const time = new Intl.DateTimeFormat("es-ES", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
  return `el ${day} a las ${time}`;
}

// ── Token ──────────────────────────────────────────────────────────────────

export const newCajaToken = () => randomBytes(32).toString("base64url");

export const hashCajaToken = (token: string) =>
  createHash("sha256").update(token, "utf8").digest("hex");

/** Compara el token del enlace con el hash guardado (tiempo constante). */
export function tokenMatches(token: string, hash: string | null | undefined): boolean {
  if (!hash || !token || token.length > 200) return false;
  const a = Buffer.from(hashCajaToken(token), "hex");
  const b = Buffer.from(hash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}
