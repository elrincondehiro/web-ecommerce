import { medusaIntegrationTestRunner } from "@medusajs/test-utils";
import type { MedusaContainer } from "@medusajs/framework/types";
import { Modules } from "@medusajs/framework/utils";
import { COLOR_FAMILIES } from "../../src/lib/option-families";

/**
 * POST /admin/option-families/:id (Fase FO-5, widget del Admin): familias de una opción global y
 * de sus valores con el mismo plan que familias.csv. Guarda, conserva el resto de la metadata,
 * no reescribe lo que no cambia, valida, rechaza valores de otra opción y emite los eventos que
 * reindexan /buscar/.
 */
jest.setTimeout(60 * 1000);

medusaIntegrationTestRunner({
  testSuite: ({ api, getContainer }) => {
    let container: MedusaContainer;
    let headers: Record<string, string>;
    let option: { id: string; values: { id: string; value: string }[] };
    let other: { id: string; values: { id: string }[] };

    beforeEach(async () => {
      container = getContainer();
      const email = `admin-${Date.now()}@example.com`;
      const password = "Admin-123456";
      const user = await container.resolve(Modules.USER).createUsers({ email });
      const auth = container.resolve(Modules.AUTH);
      const { authIdentity } = await auth.register("emailpass", {
        body: { email, password },
      } as never);
      await auth.updateAuthIdentities({ id: authIdentity!.id, app_metadata: { user_id: user.id } });
      const login = await api.post("/auth/user/emailpass", { email, password });
      headers = { authorization: `Bearer ${login.data.token as string}` };

      const productModule = container.resolve(Modules.PRODUCT);
      const [color, talla] = await productModule.createProductOptions([
        {
          title: "Color",
          values: ["Sea Foam", "Huckleberry", "Rojo"],
          metadata: { filtrable: true },
        } as never,
        { title: "Talla", values: ["S"] } as never,
      ]);
      // Un valor ya tiene su color de muestra: se conserva si el widget no lo cambia
      const rojo = color!.values!.find((v) => v.value === "Rojo")!;
      await productModule.updateProductOptionValues(rojo.id, { metadata: { color: "#c0392b" } });
      option = { id: color!.id, values: color!.values!.map((v) => ({ id: v.id, value: v.value })) };
      other = { id: talla!.id, values: talla!.values!.map((v) => ({ id: v.id })) };
    });

    const idOf = (value: string) => option.values.find((v) => v.value === value)!.id;
    const save = (body: unknown, id = option.id) =>
      api.post(`/admin/option-families/${id}`, body, { headers, validateStatus: () => true });
    const body = (over: Partial<{ familias: unknown; valores: unknown }> = {}) => ({
      familias: COLOR_FAMILIES,
      valores: [
        { id: idOf("Sea Foam"), familias: ["azul", "verde"], color: "#8fd3c1" },
        { id: idOf("Rojo"), familias: ["rojo"], color: "#c0392b" },
      ],
      ...over,
    });

    it("guarda familias y valores (orden de la opción), conserva el resto y avisa de los que faltan", async () => {
      const events: string[] = [];
      const eventBus = container.resolve(Modules.EVENT_BUS);
      const emit = eventBus.emit.bind(eventBus);
      jest.spyOn(eventBus, "emit").mockImplementation(async (data, options) => {
        for (const m of Array.isArray(data) ? data : [data]) events.push(m.name);
        return emit(data, options);
      });

      const res = await save(body());
      expect(res.status).toBe(200);
      expect(res.data).toEqual({
        option_updated: true,
        values_updated: 2,
        without_family: ["Huckleberry"],
      });
      const productModule = container.resolve(Modules.PRODUCT);
      const [saved] = await productModule.listProductOptions(
        { id: option.id },
        { relations: ["values"] },
      );
      expect(saved!.metadata).toMatchObject({ filtrable: true });
      expect((saved!.metadata!.familias as { id: string }[]).map((f) => f.id)).toEqual(
        COLOR_FAMILIES.map((f) => f.id),
      );
      const meta = (v: string) => saved!.values!.find((x) => x.value === v)!.metadata;
      expect(meta("Sea Foam")).toEqual({ familias: ["verde", "azul"], color: "#8fd3c1" });
      expect(meta("Rojo")).toEqual({ familias: ["rojo"], color: "#c0392b" });
      expect(events).toContain("product-option.updated");
      expect(events).toContain("product-option-value.updated");

      // Lo mismo otra vez: nada que escribir
      const again = await save(body());
      expect(again.data).toMatchObject({ option_updated: false, values_updated: 0 });
    });

    it("quitar familias y color de un valor", async () => {
      await save(body());
      const res = await save(
        body({ valores: [{ id: idOf("Sea Foam"), familias: [], color: null }] }),
      );
      expect(res.data).toMatchObject({ option_updated: false, values_updated: 1 });
      const [v] = await container
        .resolve(Modules.PRODUCT)
        .listProductOptionValues({ id: idOf("Sea Foam") });
      expect(v!.metadata).toEqual({});
    });

    it("valida: familia que no existe, id mal escrito, más de 4, valor de otra opción", async () => {
      const bad = await save(
        body({ valores: [{ id: idOf("Rojo"), familias: ["fucsia"], color: null }] }),
      );
      expect(bad.status).toBe(400);
      expect(bad.data.message).toMatch(/fucsia/);

      const badId = await save(body({ familias: [{ id: "Azul Claro", nombre: "x" }] }));
      expect(badId.status).toBe(400);

      const tooMany = await save(
        body({
          valores: [
            {
              id: idOf("Rojo"),
              familias: ["rojo", "rosa", "azul", "verde", "morado"],
              color: null,
            },
          ],
        }),
      );
      expect(tooMany.status).toBe(400);

      const foreign = await save(
        body({ valores: [{ id: other.values[0]!.id, familias: ["rojo"], color: null }] }),
      );
      expect(foreign.status).toBe(400);
      expect(foreign.data.message).toMatch(/no son de la opción/);

      const missing = await save(body(), "opt_no_existe");
      expect(missing.status).toBe(404);
    });

    it("sin sesión de Admin: 401", async () => {
      const res = await api.post(`/admin/option-families/${option.id}`, body(), {
        validateStatus: () => true,
      });
      expect(res.status).toBe(401);
    });
  },
});
