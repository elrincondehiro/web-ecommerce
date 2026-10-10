import { medusaIntegrationTestRunner } from "@medusajs/test-utils";
import type { ICartModuleService, MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import {
  createApiKeysWorkflow,
  createCustomersWorkflow,
  createRegionsWorkflow,
  createSalesChannelsWorkflow,
  linkSalesChannelsToApiKeyWorkflow,
} from "@medusajs/medusa/core-flows";
import { deleteStaleCarts } from "../../src/lib/stale-carts";

/**
 * Limpieza de carritos caducados (fase 10-4): `deleteStaleCarts` (lo que ejecuta el job
 * `delete-stale-carts`). Las fechas se retrasan con SQL directo SOLO en el test.
 */
jest.setTimeout(120 * 1000);

const DAY = 24 * 60 * 60 * 1000;

medusaIntegrationTestRunner({
  inApp: true,
  env: {},
  testSuite: ({ api, getContainer }) => {
    let container: MedusaContainer;
    let cartModule: ICartModuleService;
    let headers: Record<string, string>;
    let regionId: string;
    let customerId: string;

    // knex de la BD del test (conexión de Medusa del contenedor)
    const db = () => container.resolve(ContainerRegistrationKeys.PG_CONNECTION);
    const backdate = async (table: string, where: Record<string, string>, daysAgo: number) => {
      const at = new Date(Date.now() - daysAgo * DAY);
      await db()(table).where(where).update({ updated_at: at, created_at: at });
    };

    const newCart = async (data: Record<string, unknown> = {}) => {
      const cart = await cartModule.createCarts({
        currency_code: "eur",
        region_id: regionId,
        ...data,
      });
      return cart.id;
    };

    beforeEach(async () => {
      container = getContainer();
      cartModule = container.resolve(Modules.CART);
      const {
        result: [channel],
      } = await createSalesChannelsWorkflow(container).run({
        input: { salesChannelsData: [{ name: "Tienda test" }] },
      });
      const {
        result: [apiKey],
      } = await createApiKeysWorkflow(container).run({
        input: { api_keys: [{ title: "test", type: "publishable", created_by: "" }] },
      });
      await linkSalesChannelsToApiKeyWorkflow(container).run({
        input: { id: apiKey!.id, add: [channel!.id] },
      });
      headers = { "x-publishable-api-key": apiKey!.token };
      const {
        result: [region],
      } = await createRegionsWorkflow(container).run({
        input: { regions: [{ name: "España", currency_code: "eur", countries: ["es"] }] },
      });
      regionId = region!.id;
      const {
        result: [customer],
      } = await createCustomersWorkflow(container).run({
        input: { customersData: [{ email: "cliente@example.com" }] },
      });
      customerId = customer!.id;
    });

    it("borra (suave) solo los carritos sin cliente, sin completar e inactivos", async () => {
      const viejo = await newCart();
      const viejoConLinea = await newCart();
      const viejoLineaReciente = await newCart();
      const reciente = await newCart();
      const conCliente = await newCart({ customer_id: customerId });
      const completado = await newCart();

      await cartModule.addLineItems([
        { cart_id: viejoConLinea, title: "Camiseta", quantity: 1, unit_price: 10 },
        { cart_id: viejoLineaReciente, title: "Taza", quantity: 1, unit_price: 5 },
      ]);
      await cartModule.updateCarts(completado, { completed_at: new Date() });

      for (const id of [viejo, viejoConLinea, viejoLineaReciente, conCliente, completado]) {
        await backdate("cart", { id }, 10);
      }
      await backdate("cart_line_item", { cart_id: viejoConLinea }, 10);
      await backdate("cart_line_item", { cart_id: viejoLineaReciente }, 1);

      const { deleted } = await deleteStaleCarts(container, { days: 5 });
      expect(deleted).toBe(2);

      const vivos = await cartModule.listCarts(
        { id: [viejo, viejoConLinea, viejoLineaReciente, reciente, conCliente, completado] },
        { select: ["id"] },
      );
      expect(vivos.map((c) => c.id).sort()).toEqual(
        [viejoLineaReciente, reciente, conCliente, completado].sort(),
      );

      // Borrado suave: siguen en la BD con deleted_at, y sus líneas también
      const borrados = await db()("cart").whereIn("id", [viejo, viejoConLinea]);
      expect(borrados).toHaveLength(2);
      expect(borrados.every((c: { deleted_at: Date | null }) => c.deleted_at)).toBe(true);
      const lineas = await db()("cart_line_item").where({ cart_id: viejoConLinea });
      expect(lineas.every((l: { deleted_at: Date | null }) => l.deleted_at)).toBe(true);

      // El storefront recibe 404 (lo trata como carrito caducado)
      const res = await api
        .get(`/store/carts/${viejo}`, { headers })
        .catch((e: { response: { status: number } }) => e.response);
      expect(res.status).toBe(404);

      // Volver atrás
      await cartModule.restoreCarts([viejo]);
      const [restaurado] = await cartModule.listCarts({ id: viejo }, { select: ["id"] });
      expect(restaurado?.id).toBe(viejo);

      // Restaurar actualiza updated_at: el carrito cuenta como activo y la siguiente pasada no
      // lo vuelve a borrar hasta que pasen otros CART_CLEANUP_DAYS días.
      const [fila] = await db()("cart").where({ id: viejo });
      expect(Date.now() - new Date(fila.updated_at).getTime()).toBeLessThan(DAY);
      expect((await deleteStaleCarts(container, { days: 5 })).deleted).toBe(0);
    });

    it("sin carritos caducados no hace nada", async () => {
      await newCart();
      expect((await deleteStaleCarts(container, { days: 5 })).deleted).toBe(0);
    });
  },
});
