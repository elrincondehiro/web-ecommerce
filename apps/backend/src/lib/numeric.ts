/** Número de un valor de Medusa (number, string o BigNumber de MikroORM). Nunca lanza. */
export type Numeric =
  number | string | { toJSON(): unknown } | { valueOf(): unknown } | null | undefined;

export function toNumber(value: Numeric): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value) || 0;
  const n = Number(value.valueOf());
  return Number.isFinite(n) ? n : 0;
}
