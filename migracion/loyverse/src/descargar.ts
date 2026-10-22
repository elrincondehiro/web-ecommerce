/**
 * Paso 1: descarga el catálogo y los tickets de Loyverse a `datos/bruto/` (fuera de git).
 *
 *   pnpm --filter migracion-loyverse descargar [--solo-catalogo] [--solo-tickets]
 *        [--desde=AAAA-MM] [--forzar]
 *
 * - Catálogo: artículos (con los borrados, marcados), categorías, proveedores, tiendas, impuestos
 *   y stock de la tienda. Se vuelve a bajar entero cada vez (son pocas peticiones).
 * - Tickets: por meses (`tickets/AAAA-MM.jsonl`). Los meses cerrados ya descargados se saltan
 *   (reanudable); el mes en curso siempre se vuelve a bajar. `--forzar` los baja todos de nuevo.
 *   `--desde` por defecto = mes del artículo más antiguo.
 * - Privacidad: de cada ticket se quitan el cliente, el empleado, la nota y los detalles de pago
 *   (tarjeta); se guardan fechas, importes, tipo de pago y líneas (artículo, variante, cantidad,
 *   precio, coste, descuento).
 * Nunca se imprime el token.
 */
import { LoyverseClient } from "./api.ts";
import { RAW, RECEIPTS, exists, readJson, writeJson, writeJsonl } from "./files.ts";
import { isClosed, monthKey, monthsBetween } from "./months.ts";
import type { Category, InventoryLevel, Item, Receipt, Store, Supplier, Tax } from "./types.ts";
import { join } from "node:path";

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const option = (name: string) =>
  args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);

// eslint-disable-next-line no-console -- script de terminal
const log = (msg: string) => console.log(msg);

/** Lo que se guarda de un ticket (sin datos personales). */
export function trimReceipt(r: Receipt) {
  return {
    receipt_number: r.receipt_number,
    receipt_type: r.receipt_type,
    refund_for: r.refund_for ?? null,
    created_at: r.created_at,
    receipt_date: r.receipt_date ?? r.created_at,
    cancelled_at: r.cancelled_at ?? null,
    source: r.source ?? null,
    store_id: r.store_id ?? null,
    pos_device_id: r.pos_device_id ?? null,
    total_money: r.total_money ?? null,
    total_tax: r.total_tax ?? null,
    total_discount: r.total_discount ?? null,
    payments: (r.payments ?? []).map((p) => ({
      name: p.name ?? null,
      type: p.type ?? null,
      money_amount: p.money_amount ?? null,
    })),
    line_items: (r.line_items ?? []).map((l) => ({
      item_id: l.item_id ?? null,
      variant_id: l.variant_id ?? null,
      item_name: l.item_name ?? null,
      variant_name: l.variant_name ?? null,
      sku: l.sku ?? null,
      quantity: l.quantity,
      price: l.price ?? null,
      gross_total_money: l.gross_total_money ?? null,
      total_money: l.total_money ?? null,
      cost: l.cost ?? null,
      cost_total: l.cost_total ?? null,
      total_discount: l.total_discount ?? null,
    })),
  };
}

async function downloadCatalog(client: LoyverseClient) {
  log("Catálogo…");
  const stores = await client.all<Store>("/stores", "stores", { show_deleted: true });
  const live = stores.filter((s) => !s.deleted_at);
  const storeId = process.env.LOYVERSE_STORE_ID || (live.length === 1 ? live[0]!.id : "");
  if (!storeId) {
    throw new Error(
      `Hay ${live.length} tiendas: indica LOYVERSE_STORE_ID en .env (ids en datos/bruto/tiendas.json).`,
    );
  }
  await writeJson(join(RAW, "tiendas.json"), stores);

  const items = await client.all<Item>("/items", "items", { show_deleted: true });
  log(`  artículos: ${items.length} (${items.filter((i) => i.deleted_at).length} borrados)`);
  await writeJson(join(RAW, "articulos.json"), items);

  const categories = await client.all<Category>("/categories", "categories", {
    show_deleted: true,
  });
  log(`  categorías: ${categories.length}`);
  await writeJson(join(RAW, "categorias.json"), categories);

  const suppliers = await client.all<Supplier>("/suppliers", "suppliers", { show_deleted: true });
  log(`  proveedores: ${suppliers.length}`);
  await writeJson(join(RAW, "proveedores.json"), suppliers);

  const taxes = await client.all<Tax>("/taxes", "taxes", { show_deleted: true });
  await writeJson(join(RAW, "impuestos.json"), taxes);

  const inventory = await client.all<InventoryLevel>("/inventory", "inventory_levels", {
    store_ids: storeId,
  });
  log(`  niveles de stock (tienda): ${inventory.length}`);
  await writeJson(join(RAW, "stock.json"), inventory);

  await writeJson(join(RAW, "descarga.json"), {
    catalogo_at: new Date().toISOString(),
    store_id: storeId,
  });
  return items;
}

async function downloadReceipts(client: LoyverseClient, items: Item[] | null) {
  const now = new Date();
  let start = option("desde");
  if (!start) {
    const list = items ?? (await readJson<Item[]>(join(RAW, "articulos.json")));
    const oldest = list
      .map((i) => i.created_at)
      .filter((d): d is string => !!d)
      .sort()[0];
    start = oldest ? monthKey(new Date(oldest)) : monthKey(now);
  }
  const months = monthsBetween(start, now);
  log(`Tickets desde ${start} (${months.length} meses)…`);
  let total = 0;
  for (const month of months) {
    const file = join(RECEIPTS, `${month.key}.jsonl`);
    if (!flag("forzar") && isClosed(month, now) && exists(file)) continue;
    const rows: ReturnType<typeof trimReceipt>[] = [];
    for await (const page of client.paginate<Receipt>("/receipts", "receipts", {
      created_at_min: month.from,
      created_at_max: month.to,
    })) {
      rows.push(...page.map(trimReceipt));
    }
    await writeJsonl(file, rows);
    total += rows.length;
    log(`  ${month.key}: ${rows.length} tickets`);
  }
  log(`Tickets descargados en esta pasada: ${total}`);
}

async function main() {
  const client = new LoyverseClient(process.env.LOYVERSE_TOKEN ?? "", log);
  const started = Date.now();
  let items: Item[] | null = null;
  if (!flag("solo-tickets")) items = await downloadCatalog(client);
  if (!flag("solo-catalogo")) await downloadReceipts(client, items);
  log(`Listo en ${Math.round((Date.now() - started) / 1000)} s → migracion/loyverse/datos/bruto/`);
}

if (import.meta.main) {
  main().catch((err: unknown) => {
    log(`Error: ${(err as Error).message}`);
    process.exitCode = 1;
  });
}
