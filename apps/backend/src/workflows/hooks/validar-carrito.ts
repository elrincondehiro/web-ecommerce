import { MedusaError, ContainerRegistrationKeys } from "@medusajs/framework/utils";
import type { MedusaContainer } from "@medusajs/framework/types";
import {
  addToCartWorkflow,
  completeCartWorkflow,
  createCartWorkflow,
  updateLineItemInCartWorkflow,
} from "@medusajs/medusa/core-flows";
import { bulkMinimumError, bulkRule } from "../../lib/granel";
import { DISCONTINUED_MESSAGE, isDiscontinued } from "../../lib/descatalogado";
import { isCorrea, lineMetadataError, variantLength } from "../../lib/correas";
import { KIT_SHORTAGE_MESSAGE, kitShortages, type DemandLine } from "../../lib/kit-demand";
import { pointsDiscount } from "../../lib/points";
import { CODE_MESSAGES, customerCodes } from "../../lib/codes";
import { POINTS_MODULE } from "../../modules/points";
import type PointsModuleService from "../../modules/points/service";

/** Puntos (Fase L-2): el saldo cambió entre aplicar y pagar (otro pedido, ajuste…). */
export const POINTS_BALANCE_MESSAGE =
  "Tu saldo de puntos ha cambiado. Vuelve a aplicar los puntos en el pago.";

/**
 * Validaciones del carrito con los hooks `validate` oficiales. Medusa admite UN solo handler por
 * hook (docs: workflow-hooks «A hook can have only one handler»), así que van todas aquí. Se
 * ejecutan antes de tocar el carrito, así que un error lo deja como estaba.
 * - Descatalogados (Fase E): no se pueden añadir (sí cambiar la cantidad o quitar una línea que ya
 *   estaba en el carrito).
 * - Puntos (Fase L-2, al completar): el descuento de puntos no puede superar el saldo actual.
 * - Códigos (Fase P, al completar): como mucho UNO, y solo con cuenta (segunda barrera: la Store
 *   API estándar de promociones está cerrada en middlewares.ts).
 * - Granel (S-3): la cantidad total de una variante en el carrito × `paso_g` no puede quedar por
 *   debajo de `min_g` (metadata de la variante, la escribe `catalog:import`).
 * - Metadata de la línea (E-2): solo las correas la admiten, y solo `observaciones` y
 *   `medida_cm` (`lib/correas.ts`).
 * - Piezas compartidas (E-2): la demanda de TODO el carrito por artículo de inventario no puede
 *   superar el stock libre (`lib/kit-demand.ts`; Medusa lo comprueba línea a línea). También al
 *   completar el carrito, porque entre añadir y pagar otro cliente puede haber comprado.
 */
type Quantities = Map<string, number>;

interface CartItem {
  id?: string;
  variant_id?: string | null;
  quantity?: unknown;
  metadata?: unknown;
}

interface NewLine {
  variant_id: string;
  metadata?: unknown;
}

const add = (map: Quantities, variantId: string | null | undefined, qty: unknown) => {
  if (!variantId) return;
  map.set(variantId, (map.get(variantId) ?? 0) + Number(qty ?? 0));
};

const demandLines = (items: CartItem[]): DemandLine[] =>
  items.flatMap((i) =>
    i.variant_id ? [{ variant_id: i.variant_id, quantity: Number(i.quantity ?? 0) }] : [],
  );

async function check(
  container: MedusaContainer,
  quantities: Quantities,
  {
    adding = new Set<string>(),
    lines = [],
    newLines = [],
    salesChannelId,
  }: {
    adding?: ReadonlySet<string>;
    /** Líneas finales del carrito (para la demanda conjunta de piezas). */
    lines?: DemandLine[];
    /** Líneas nuevas o cambiadas cuya metadata hay que validar. */
    newLines?: NewLine[];
    salesChannelId?: string | null;
  } = {},
) {
  const ids = [...new Set([...quantities.keys(), ...newLines.map((l) => l.variant_id)])];
  if (!ids.length) return;
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const { data } = await query.graph({
    entity: "product_variant",
    fields: ["id", "metadata", "product.metadata"],
    filters: { id: ids },
  });
  const byId = new Map(data.map((v) => [v.id, v]));
  for (const v of data) {
    const product = (v as { product?: { metadata?: Record<string, unknown> | null } | null })
      .product;
    if (adding.has(v.id) && isDiscontinued(product?.metadata)) {
      throw new MedusaError(MedusaError.Types.NOT_ALLOWED, DISCONTINUED_MESSAGE);
    }
    const rule = bulkRule(v.metadata as Record<string, unknown> | null);
    if (!rule) continue;
    const message = bulkMinimumError(rule, quantities.get(v.id) ?? 0);
    if (message) throw new MedusaError(MedusaError.Types.INVALID_DATA, message);
  }
  for (const line of newLines) {
    const v = byId.get(line.variant_id) as
      | { metadata?: Record<string, unknown> | null; product?: { metadata?: unknown } | null }
      | undefined;
    const correa = isCorrea(v?.product?.metadata as Record<string, unknown> | null | undefined);
    const message = lineMetadataError(line.metadata, correa, variantLength(v?.metadata));
    if (message) throw new MedusaError(MedusaError.Types.INVALID_DATA, message);
  }
  if ((await kitShortages(container, lines, salesChannelId)).length) {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      KIT_SHORTAGE_MESSAGE,
      "insufficient_inventory",
    );
  }
}

addToCartWorkflow.hooks.validate(async ({ input, cart }, { container }) => {
  const items = ((input.items ?? []) as CartItem[]).filter(
    (i): i is CartItem & { variant_id: string } => Boolean(i.variant_id),
  );
  if (!items.length) return;
  const quantities: Quantities = new Map();
  for (const item of items) add(quantities, item.variant_id, item.quantity);
  const adding = new Set(quantities.keys());
  // El carrito del hook no trae las líneas: se leen aquí. Añadir una variante que ya está en el
  // carrito suma a su línea (granel) y toda línea cuenta para las piezas compartidas.
  const query = (container as MedusaContainer).resolve(ContainerRegistrationKeys.QUERY);
  const { data: existing } = await query.graph({
    entity: "line_item",
    fields: ["variant_id", "quantity"],
    filters: { cart_id: input.cart_id },
  });
  for (const item of existing as CartItem[]) {
    if (item.variant_id && adding.has(item.variant_id)) {
      add(quantities, item.variant_id, item.quantity);
    }
  }
  await check(container as MedusaContainer, quantities, {
    adding,
    lines: demandLines([...(existing as CartItem[]), ...items]),
    newLines: items,
    salesChannelId: (cart as { sales_channel_id?: string | null }).sales_channel_id,
  });
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
  const metadata = (input.update as { metadata?: unknown }).metadata;
  await check(container as MedusaContainer, quantities, {
    lines: demandLines(items.map((i) => (i.id === item.id ? { ...i, quantity } : i))),
    newLines: metadata !== undefined ? [{ variant_id: item.variant_id, metadata }] : [],
    salesChannelId: (cart as { sales_channel_id?: string | null }).sales_channel_id,
  });
});

createCartWorkflow.hooks.validate(async ({ input, cart }, { container }) => {
  const items = ((input.items ?? []) as CartItem[]).filter(
    (i): i is CartItem & { variant_id: string } => Boolean(i.variant_id),
  );
  const quantities: Quantities = new Map();
  for (const item of items) add(quantities, item.variant_id, item.quantity);
  await check(container as MedusaContainer, quantities, {
    adding: new Set(quantities.keys()),
    lines: demandLines(items),
    newLines: items,
    salesChannelId: (cart as { sales_channel_id?: string | null }).sales_channel_id,
  });
});

completeCartWorkflow.hooks.validate(async ({ cart }, { container }) => {
  const c = cart as {
    items?: CartItem[];
    sales_channel_id?: string | null;
    completed_at?: unknown;
  };
  // Reintento de un carrito ya completado (webhook de Stripe + vuelta del cliente): sus reservas
  // ya restan del stock libre y la comprobación daría un falso «no queda material».
  if (c.completed_at) return;
  await checkPointsBalance(container as MedusaContainer, cart);
  checkCodes(cart);
  const lines = demandLines(c.items ?? []);
  if ((await kitShortages(container as MedusaContainer, lines, c.sales_channel_id)).length) {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      KIT_SHORTAGE_MESSAGE,
      "insufficient_inventory",
    );
  }
});

/** Códigos (Fase P): uno por pedido y solo clientes con cuenta. */
function checkCodes(cart: unknown): void {
  // El carrito del hook trae `items.adjustments.*` y `customer.*`, no `promotions.code`
  // (completeCartFields de core-flows 2.21.2): los códigos salen de los ajustes.
  const c = cart as {
    customer?: { has_account?: boolean | null } | null;
    items?: { adjustments?: { code?: string | null }[] | null }[] | null;
  };
  const codes = [...new Set(customerCodes((c.items ?? []).flatMap((i) => i.adjustments ?? [])))];
  if (!codes.length) return;
  if (codes.length > 1) throw new MedusaError(MedusaError.Types.NOT_ALLOWED, CODE_MESSAGES.one);
  if (!c.customer?.has_account) {
    throw new MedusaError(MedusaError.Types.NOT_ALLOWED, CODE_MESSAGES.account);
  }
}

/**
 * Puntos (Fase L-2): si el carrito canjea puntos, el descuento REAL (ajustes con código PTS-) no
 * puede superar el saldo AHORA (dos carritos del mismo cliente podían aplicar el mismo saldo).
 * El cargo lo hace el subscriber de `order.placed`. El carrito del hook trae
 * `items.adjustments.*` (completeCartFields de core-flows 2.21.2).
 */
async function checkPointsBalance(container: MedusaContainer, cart: unknown): Promise<void> {
  const c = cart as {
    customer_id?: string | null;
    items?: { adjustments?: { code?: string | null; amount?: unknown }[] | null }[] | null;
  };
  const { code, amount } = pointsDiscount(c.items as never);
  if (!code || !(amount > 0)) return;
  const service = container.resolve<PointsModuleService>(POINTS_MODULE);
  const account = c.customer_id ? await service.findAccount(c.customer_id) : null;
  const balance = account ? await service.getBalance(account.id) : 0;
  if (amount > balance + 0.001) {
    throw new MedusaError(MedusaError.Types.NOT_ALLOWED, POINTS_BALANCE_MESSAGE);
  }
}
