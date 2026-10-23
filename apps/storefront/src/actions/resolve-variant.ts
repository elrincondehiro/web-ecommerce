// Variante elegida en la ficha (Fase O). Compartido por `cart.add` y `wishlist.add`.
import { getProductOptionMatrix } from "$lib/medusa";
import { findVariantByOptions } from "$lib/variant-picker";

/**
 * Variante del formulario: `variant_id` (tabla, una variante) o, en el selector de opciones
 * (Fase O), `product_id` + `opcion_1` / `opcion_2`: la busca el servidor entre las variantes del
 * producto. null si no se puede resolver.
 */
export async function resolveVariant(input: {
  variant_id?: string | null | undefined;
  product_id?: string | null | undefined;
  opcion_1?: string | null | undefined;
  opcion_2?: string | null | undefined;
}): Promise<string | null> {
  if (input.variant_id) return input.variant_id;
  const fields = [input.opcion_1, input.opcion_2].filter((f): f is string => Boolean(f));
  if (!input.product_id || !fields.length) return null;
  return findVariantByOptions(await getProductOptionMatrix(input.product_id), fields);
}
