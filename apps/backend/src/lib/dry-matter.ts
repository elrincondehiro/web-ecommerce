/**
 * Componentes analíticos sobre MATERIA SECA (Fase S, S-2): `x / (100 − humedad) × 100`, con un
 * decimal. Así se comparan piensos secos y latas en la misma escala. Los porcentajes están en
 * `product.metadata` tal cual la etiqueta (catalog:import: `proteina_pct`, `grasa_pct`,
 * `humedad_pct`). Sin el dato o sin humedad válida (0 ≤ h < 100) → undefined: el producto no
 * entra en ese filtro.
 * Fuera de `src/search`: su loader importa cada fichero como definición de índice.
 */
export function dryMatter(
  metadata: Record<string, unknown> | null | undefined,
  key: string,
): number | undefined {
  const value = metadata?.[key];
  const moisture = metadata?.humedad_pct;
  if (typeof value !== "number" || typeof moisture !== "number") return undefined;
  if (!Number.isFinite(value) || !Number.isFinite(moisture)) return undefined;
  if (value < 0 || moisture < 0 || moisture >= 100) return undefined;
  return Math.round((value / (100 - moisture)) * 1000) / 10;
}

/** Campo del índice → clave de metadata (contrato con el storefront, `lib/search.ts`). */
export const DRY_MATTER_FIELDS = { proteina_ms: "proteina_pct", grasa_ms: "grasa_pct" } as const;
