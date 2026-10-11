import { MedusaError, ContainerRegistrationKeys } from "@medusajs/framework/utils";
import type { MedusaContainer } from "@medusajs/framework/types";
import {
  addToCartWorkflow,
  createCartWorkflow,
  updateLineItemInCartWorkflow,
} from "@medusajs/medusa/core-flows";
import { bulkMinimumError, bulkRule } from "../../lib/granel";

/**
 * Granel: la cantidad total de una variante en el carrito × `paso_g` no puede quedar por debajo
 * de `min_g` (metadata de la variante, la escribe `catalog:import`). Hooks `validate` oficiales:
 * se ejecutan antes de tocar el carrito, así que un error lo deja como estaba.
 */
type Quantities = Map<string, number>;

async function check(container: MedusaContainer, quantities: Quantities) {
  const ids = [...quantities.keys()];
  if (!ids.length) return;
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const { data } = await query.graph({
    entity: "product_variant",
    fields: ["id", "metadata"],
    filters: { id: ids },
  });
  for (const v of data) {
    const rule = bulkRule(v.metadata as Record<string, unknown> | null);
    if (!rule) continue;
    const message = bulkMinimumError(rule, quantities.get(v.id) ?? 0);
    if (message) throw new MedusaError(MedusaError.Types.INVALID_DATA, message);
  }
}

interface CartItem {
  id?: string;
  variant_id?: string | null;
  quantity?: unknown;
}

const add = (map: Quantities, variantId: string | null | undefined, qty: unknown) => {
  if (!variantId) return;
  map.set(variantId, (map.get(variantId) ?? 0) + Number(qty ?? 0));
};

addToCartWorkflow.hooks.validate(async ({ input }, { container }) => {
  const quantities: Quantities = new Map();
  for (const item of (input.items ?? []) as CartItem[])
    add(quantities, item.variant_id, item.quantity);
  if (!quantities.size) return;
  // Añadir una variante que ya está en el carrito suma a su línea (el carrito del hook no trae
  // las líneas: se leen aquí)
  const query = (container as MedusaContainer).resolve(ContainerRegistrationKeys.QUERY);
  const { data: items } = await query.graph({
    entity: "line_item",
    fields: ["variant_id", "quantity"],
    filters: { cart_id: input.cart_id, variant_id: [...quantities.keys()] },
  });
  for (const item of items as CartItem[]) add(quantities, item.variant_id, item.quantity);
  await check(container, quantities);
});

updateLineItemInCartWorkflow.hooks.validate(async ({ input, cart }, { container }) => {
  const quantity = Number(input.update.quantity ?? NaN);
  if (!Number.isFinite(quantity) || quantity === 0) return; // 0 = quitar la línea
  const items = ((cart as { items?: CartItem[] }).items ?? []) as CartItem[];
  const item = items.find((i) => i.id === input.item_id);
  if (!item?.variant_id) return;
  const quantities: Quantities = new Map([[item.variant_id, quantity]]);
  for (const other of items) {
    if (other.id !== item.id && other.variant_id === item.variant_id) {
      add(quantities, other.variant_id, other.quantity);
    }
  }
  await check(container, quantities);
});

createCartWorkflow.hooks.validate(async ({ input }, { container }) => {
  const quantities: Quantities = new Map();
  for (const item of (input.items ?? []) as CartItem[])
    add(quantities, item.variant_id, item.quantity);
  await check(container, quantities);
});
