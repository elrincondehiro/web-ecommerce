/**
 * Seed base de la tienda (fase 2) — SOLO ESPAÑA.
 *
 * Crea (idempotente donde es razonable):
 *   - Canal de venta "Tienda online" y moneda EUR por defecto (precios con IVA incluido).
 *   - Región "España" (EUR, precios con IVA incluido).
 *   - Región fiscal ES con IVA general 21 % y tipos reducidos 10 % y 4 % aplicados
 *     por tipo de producto (product_type "iva-reducido" / "iva-superreducido").
 *   - Almacén, envío estándar/exprés y publishable API key.
 *
 * NO crea productos: para eso está `pnpm --filter backend seed:mock`.
 *
 * Basado en medusa-starter-default (commit 9565d9d) y en la documentación de Medusa:
 *   - Tax Module: "Override Tax Rates with Rules" (TaxRateRule reference = product_type).
 *   - createRegionsWorkflow (`is_tax_inclusive`), createTaxRegionsWorkflow (`default_tax_rate`).
 *
 * ⚠️ Los tipos impositivos son orientativos. Confirma con tu gestoría qué productos
 *    van al 10 % / 4 % (y si aplica recargo de equivalencia, Canarias/Ceuta/Melilla, etc.).
 */
import type { ExecArgs } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import {
  createApiKeysWorkflow,
  createProductTypesWorkflow,
  createRegionsWorkflow,
  createSalesChannelsWorkflow,
  createShippingOptionsWorkflow,
  createShippingProfilesWorkflow,
  createStockLocationsWorkflow,
  createTaxRatesWorkflow,
  createTaxRegionsWorkflow,
  linkSalesChannelsToApiKeyWorkflow,
  linkSalesChannelsToStockLocationWorkflow,
  updateSalesChannelsWorkflow,
  updateStoresWorkflow,
} from "@medusajs/medusa/core-flows";

export const SALES_CHANNEL_NAME = "Tienda online";
export const REGION_NAME = "España";
export const COUNTRY = "es";
export const CURRENCY = "eur";

/** Tipos de producto que disparan los IVA reducidos (reference = product_type). */
export const PRODUCT_TYPE_IVA_REDUCIDO = "iva-reducido"; // 10 %
export const PRODUCT_TYPE_IVA_SUPERREDUCIDO = "iva-superreducido"; // 4 %

export default async function seedStore({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const link = container.resolve(ContainerRegistrationKeys.LINK);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const fulfillmentModuleService = container.resolve(Modules.FULFILLMENT);
  const salesChannelModuleService = container.resolve(Modules.SALES_CHANNEL);
  const storeModuleService = container.resolve(Modules.STORE);
  const regionModuleService = container.resolve(Modules.REGION);
  const taxModuleService = container.resolve(Modules.TAX);
  const productModuleService = container.resolve(Modules.PRODUCT);

  if ((await regionModuleService.listRegions({ name: REGION_NAME })).length) {
    logger.info(`La región "${REGION_NAME}" ya existe: seed omitido (BD ya inicializada).`);
    return;
  }

  // ── Tienda y canal de venta ────────────────────────────────────────────────
  logger.info("Seed: tienda y canal de venta…");
  const [store] = await storeModuleService.listStores();
  if (!store) {
    throw new Error("No existe la tienda por defecto. ¿Has ejecutado `medusa db:migrate`?");
  }

  // `medusa db:migrate` ya crea "Default Sales Channel" (+ publishable key enlazada).
  // Se reutiliza y renombra para tener UN solo canal (con dos, el storefront tendría
  // que enviar sales_channel_id al crear carritos).
  let salesChannel =
    (await salesChannelModuleService.listSalesChannels({ name: SALES_CHANNEL_NAME }))[0] ??
    (store.default_sales_channel_id
      ? await salesChannelModuleService.retrieveSalesChannel(store.default_sales_channel_id)
      : undefined);
  if (salesChannel) {
    if (salesChannel.name !== SALES_CHANNEL_NAME) {
      await updateSalesChannelsWorkflow(container).run({
        input: { selector: { id: salesChannel.id }, update: { name: SALES_CHANNEL_NAME } },
      });
    }
  } else {
    const { result } = await createSalesChannelsWorkflow(container).run({
      input: { salesChannelsData: [{ name: SALES_CHANNEL_NAME }] },
    });
    salesChannel = result[0];
  }
  if (!salesChannel) throw new Error("No se pudo obtener el canal de venta");

  // EUR con IVA incluido: updateStoresWorkflow crea la price preference
  // (currency_code=eur, is_tax_inclusive=true). Los precios de producto se definen por
  // moneda, así que es ESTA preferencia la que hace que el PVP lleve el IVA dentro.
  // (doc Medusa: "Tax-Inclusive Pricing" → PricePreference por currency_code / region_id)
  await updateStoresWorkflow(container).run({
    input: {
      selector: { id: store.id },
      update: {
        name: "web-ecommerce",
        default_sales_channel_id: salesChannel.id,
        supported_currencies: [
          { currency_code: CURRENCY, is_default: true, is_tax_inclusive: true },
        ],
      },
    },
  });

  // ── Región España (precios con IVA incluido) ───────────────────────────────
  logger.info("Seed: región España…");
  const { result: regionResult } = await createRegionsWorkflow(container).run({
    input: {
      regions: [
        {
          name: REGION_NAME,
          currency_code: CURRENCY,
          countries: [COUNTRY],
          automatic_taxes: true,
          is_tax_inclusive: true,
          payment_providers: ["pp_system_default"],
        },
      ],
    },
  });
  const region = regionResult[0];
  if (!region) throw new Error("No se pudo crear la región");

  // ── IVA: 21 % general + 10 % y 4 % por tipo de producto ────────────────────
  logger.info("Seed: IVA (21 % / 10 % / 4 %)…");
  const { result: productTypes } = await createProductTypesWorkflow(container).run({
    input: {
      product_types: [
        { value: PRODUCT_TYPE_IVA_REDUCIDO },
        { value: PRODUCT_TYPE_IVA_SUPERREDUCIDO },
      ],
    },
  });
  const typeReducido = productTypes.find((t) => t.value === PRODUCT_TYPE_IVA_REDUCIDO);
  const typeSuperreducido = productTypes.find((t) => t.value === PRODUCT_TYPE_IVA_SUPERREDUCIDO);
  if (!typeReducido || !typeSuperreducido) throw new Error("No se crearon los tipos de producto");

  const { result: taxRegions } = await createTaxRegionsWorkflow(container).run({
    input: [
      {
        country_code: COUNTRY,
        provider_id: "tp_system",
        default_tax_rate: { name: "IVA general", code: "IVA21", rate: 21 },
      },
    ],
  });
  const taxRegion = taxRegions[0];
  if (!taxRegion) throw new Error("No se pudo crear la región fiscal");

  await createTaxRatesWorkflow(container).run({
    input: [
      {
        tax_region_id: taxRegion.id,
        name: "IVA reducido",
        code: "IVA10",
        rate: 10,
        rules: [{ reference: "product_type", reference_id: typeReducido.id }],
      },
      {
        tax_region_id: taxRegion.id,
        name: "IVA superreducido",
        code: "IVA4",
        rate: 4,
        rules: [{ reference: "product_type", reference_id: typeSuperreducido.id }],
      },
    ],
  });

  // ── Almacén y envíos ───────────────────────────────────────────────────────
  logger.info("Seed: almacén y envíos…");
  const { result: stockLocationResult } = await createStockLocationsWorkflow(container).run({
    input: {
      locations: [
        {
          name: "Almacén principal",
          address: { city: "Madrid", country_code: "ES", address_1: "" },
        },
      ],
    },
  });
  const stockLocation = stockLocationResult[0];
  if (!stockLocation) throw new Error("No se pudo crear el almacén");

  await updateStoresWorkflow(container).run({
    input: { selector: { id: store.id }, update: { default_location_id: stockLocation.id } },
  });

  await link.create({
    [Modules.STOCK_LOCATION]: { stock_location_id: stockLocation.id },
    [Modules.FULFILLMENT]: { fulfillment_provider_id: "manual_manual" },
  });

  let [shippingProfile] = await fulfillmentModuleService.listShippingProfiles({ type: "default" });
  if (!shippingProfile) {
    const { result } = await createShippingProfilesWorkflow(container).run({
      input: { data: [{ name: "Perfil de envío por defecto", type: "default" }] },
    });
    shippingProfile = result[0];
  }
  if (!shippingProfile) throw new Error("No se pudo crear el perfil de envío");

  const fulfillmentSet = await fulfillmentModuleService.createFulfillmentSets({
    name: "Envíos desde almacén principal",
    type: "shipping",
    service_zones: [{ name: "España", geo_zones: [{ country_code: COUNTRY, type: "country" }] }],
  });
  const serviceZone = fulfillmentSet.service_zones[0];
  if (!serviceZone) throw new Error("No se pudo crear la zona de servicio");

  await link.create({
    [Modules.STOCK_LOCATION]: { stock_location_id: stockLocation.id },
    [Modules.FULFILLMENT]: { fulfillment_set_id: fulfillmentSet.id },
  });

  const storeRules = [
    { attribute: "enabled_in_store", value: "true", operator: "eq" as const },
    { attribute: "is_return", value: "false", operator: "eq" as const },
  ];
  // Importes en la unidad principal de la moneda (Medusa v2: 4.95 = 4,95 €).
  await createShippingOptionsWorkflow(container).run({
    input: [
      {
        name: "Envío estándar",
        price_type: "flat",
        provider_id: "manual_manual",
        service_zone_id: serviceZone.id,
        shipping_profile_id: shippingProfile.id,
        type: {
          label: "Estándar",
          description: "Entrega en 2-3 días laborables.",
          code: "standard",
        },
        prices: [{ region_id: region.id, amount: 4.95 }],
        rules: storeRules,
      },
      {
        name: "Envío exprés",
        price_type: "flat",
        provider_id: "manual_manual",
        service_zone_id: serviceZone.id,
        shipping_profile_id: shippingProfile.id,
        type: { label: "Exprés", description: "Entrega en 24 h laborables.", code: "express" },
        prices: [{ region_id: region.id, amount: 9.95 }],
        rules: storeRules,
      },
    ],
  });

  await linkSalesChannelsToStockLocationWorkflow(container).run({
    input: { id: stockLocation.id, add: [salesChannel.id] },
  });

  // ── Publishable API key ────────────────────────────────────────────────────
  logger.info("Seed: publishable API key…");
  const { data: existingKeys } = await query.graph({
    entity: "api_key",
    fields: ["id", "token"],
    filters: { type: "publishable" },
  });
  let publishableKey = existingKeys[0] as { id: string; token: string } | undefined;
  if (!publishableKey) {
    const { result } = await createApiKeysWorkflow(container).run({
      input: { api_keys: [{ title: "Storefront", type: "publishable", created_by: "" }] },
    });
    publishableKey = result[0] as { id: string; token: string } | undefined;
  }
  if (!publishableKey) throw new Error("No se pudo crear la publishable key");

  await linkSalesChannelsToApiKeyWorkflow(container).run({
    input: { id: publishableKey.id, add: [salesChannel.id] },
  });

  // Comprobación final de las reglas de IVA
  const rates = await taxModuleService.listTaxRates({ tax_region_id: taxRegion.id });
  logger.info(
    `IVA configurado: ${rates.map((r) => `${r.code}=${r.rate}%`).join(", ")} · tipos de producto: ${(
      await productModuleService.listProductTypes()
    )
      .map((t) => t.value)
      .join(", ")}`,
  );
  logger.info(
    `Publishable key (para el storefront, PUBLIC_MEDUSA_PUBLISHABLE_KEY): ${publishableKey.token}`,
  );
  logger.info("Seed base completado. Catálogo de prueba: pnpm --filter backend seed:mock");
}
