/**
 * Proveedores de pago de la región España (fase 5) — idempotente.
 *
 *   pnpm --filter backend stripe:region
 *
 * Deja la región con SOLO Stripe (`pp_stripe_stripe`) y quita el pago manual
 * `pp_system_default`, que permitiría crear pedidos sin pagar desde la Store API (fase 5, P5).
 * Es para BD ya inicializadas; las nuevas lo reciben en `seed.ts`.
 *
 * Requiere STRIPE_API_KEY (si no, el proveedor no está registrado y el script falla).
 * `updateRegionsWorkflow` → `setRegionsPaymentProvidersStep` sustituye la lista completa
 * (código de @medusajs/core-flows 2.21.2).
 */
import type { ExecArgs } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import { updateRegionsWorkflow } from "@medusajs/medusa/core-flows";
import { REGION_NAME } from "./seed";

export const STRIPE_PROVIDER_ID = "pp_stripe_stripe";

export default async function stripeRegion({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const paymentModuleService = container.resolve(Modules.PAYMENT);

  const providers = await paymentModuleService.listPaymentProviders({ id: [STRIPE_PROVIDER_ID] });
  if (!providers.length) {
    throw new Error(
      `El proveedor ${STRIPE_PROVIDER_ID} no está registrado: falta STRIPE_API_KEY en apps/backend/.env`,
    );
  }

  const { data: regions } = await query.graph({
    entity: "region",
    fields: ["id", "name", "payment_providers.id"],
    filters: { name: REGION_NAME },
  });
  const region = regions[0];
  if (!region) throw new Error(`No existe la región "${REGION_NAME}" (ejecuta antes el seed)`);

  // Tipo explícito: sin los tipos generados de `.medusa/types` (CI), query.graph devuelve `any`.
  const linked: ({ id?: string } | null)[] = region.payment_providers ?? [];
  const current = linked.map((p) => p?.id).filter(Boolean);
  if (current.length === 1 && current[0] === STRIPE_PROVIDER_ID) {
    logger.info(`Región "${REGION_NAME}": ya tiene solo ${STRIPE_PROVIDER_ID}.`);
    return;
  }

  await updateRegionsWorkflow(container).run({
    input: { selector: { id: region.id }, update: { payment_providers: [STRIPE_PROVIDER_ID] } },
  });
  logger.info(
    `Región "${REGION_NAME}": proveedores [${current.join(", ")}] → [${STRIPE_PROVIDER_ID}].`,
  );
}
