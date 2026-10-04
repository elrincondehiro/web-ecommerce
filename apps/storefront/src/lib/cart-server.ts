// Lectura del carrito en el servidor a partir de la cookie (páginas on-demand y partial del
// flyout). Separado de lib/cart.ts (puro, testeable) porque depende de astro y de Medusa.
import type { AstroCookies } from "astro";
import { CART_COOKIE, isValidId } from "./cart";
import { CART_FULL_FIELDS, retrieveCart, type StoreCart } from "./medusa";

/** Carrito actual con todos los campos, o null si no hay, no existe o ya está completado. */
export async function currentCart(
  cookies: AstroCookies,
  fields = CART_FULL_FIELDS,
): Promise<StoreCart | null> {
  const id = cookies.get(CART_COOKIE)?.value;
  if (!isValidId(id)) return null;
  try {
    const cart = await retrieveCart(id, fields);
    return cart.completed_at ? null : cart;
  } catch {
    return null;
  }
}
