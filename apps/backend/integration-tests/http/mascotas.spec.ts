import { medusaIntegrationTestRunner } from "@medusajs/test-utils";
import type { MedusaContainer } from "@medusajs/framework/types";
import { Modules } from "@medusajs/framework/utils";
import {
  createApiKeysWorkflow,
  createSalesChannelsWorkflow,
  deleteCustomersWorkflow,
  linkSalesChannelsToApiKeyWorkflow,
} from "@medusajs/medusa/core-flows";
import { PETS_MODULE } from "../../src/modules/pets";
import type PetsModuleService from "../../src/modules/pets/service";
import petsCustomerDeleted, {
  config as petsCustomerDeletedConfig,
} from "../../src/subscribers/pets-customer-deleted";

/**
 * Mascotas (Fase M): `/store/customers/me/pets*` y `/admin/customers/:id/pets*`.
 * - Solo con sesión; cada cliente ve y toca solo las suyas (las ajenas: 404).
 * - Salud solo con consentimiento (sin él: 400; retirarlo la borra); fechas parciales válidas.
 * - Foto pública: WebP con consentimiento; cambiarla o quitarla borra el fichero anterior.
 * - Baja de la cuenta (`customer.deleted`): se borran sus mascotas.
 * Sin S3_BUCKET el módulo File usa el proveedor local (uploads/), como en CI.
 */
jest.setTimeout(120 * 1000);

type Res = { status: number; data: Record<string, unknown> };
const asRes = (e: { response: Res }) => e.response;
type Pet = Record<string, unknown> & { id: string };

/** Cabecera WebP mínima (RIFF....WEBPVP8 ): la ruta solo comprueba el formato. */
const WEBP = Buffer.concat([
  Buffer.from("RIFF"),
  Buffer.from([24, 0, 0, 0]),
  Buffer.from("WEBPVP8 "),
  Buffer.alloc(16, 1),
]).toString("base64");

medusaIntegrationTestRunner({
  inApp: true,
  env: {},
  testSuite: ({ api, getContainer }) => {
    let container: MedusaContainer;
    let headers: Record<string, string>;
    let events: { name: string; data: Record<string, unknown> }[];

    beforeEach(async () => {
      container = getContainer();
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

      events = [];
      const eventBus = container.resolve(Modules.EVENT_BUS);
      const emit = eventBus.emit.bind(eventBus);
      jest.spyOn(eventBus, "emit").mockImplementation(async (data, options) => {
        for (const m of Array.isArray(data) ? data : [data]) {
          events.push({ name: m.name, data: m.data as Record<string, unknown> });
        }
        return emit(data, options);
      });
    });

    afterEach(() => jest.restoreAllMocks());

    const waitEvent = async (name: string, after = 0) => {
      for (let i = 0; i < 50; i++) {
        const found = events.slice(after).find((e) => e.name === name);
        if (found) return found.data;
        await new Promise((r) => setTimeout(r, 100));
      }
      throw new Error(`No se emitió ${name}`);
    };

    /** Cliente con email verificado (flujo de la fase 9) → cabeceras con su token e id. */
    const customerAuth = async (email: string) => {
      const password = "Secreta-123";
      await api.post("/auth/customer/emailpass/register", { email, password });
      const first = await api.post("/auth/customer/emailpass", { email, password });
      const before = events.length;
      await api.post(
        "/auth/verification/request",
        { entity_id: email, entity_type: "email" },
        { headers: { authorization: `Bearer ${first.data.token}` } },
      );
      const { code } = await waitEvent("auth.verification_requested", before);
      await api.post("/auth/verification/confirm", { code });
      const login = await api.post("/auth/customer/emailpass", { email, password });
      const created = await api.post(
        "/store/customers",
        { email },
        { headers: { ...headers, authorization: `Bearer ${login.data.token}` } },
      );
      const relogin = await api.post("/auth/customer/emailpass", { email, password });
      return {
        id: (created.data.customer as { id: string }).id,
        auth: { headers: { ...headers, authorization: `Bearer ${relogin.data.token}` } },
      };
    };

    async function adminAuth() {
      const email = `admin-${Date.now()}@example.com`;
      const password = "Admin-123456";
      const user = await container.resolve(Modules.USER).createUsers({ email });
      const authModule = container.resolve(Modules.AUTH);
      const { authIdentity } = await authModule.register("emailpass", {
        body: { email, password },
      } as never);
      await authModule.updateAuthIdentities({
        id: authIdentity!.id,
        app_metadata: { user_id: user.id },
      });
      const login = await api.post("/auth/user/emailpass", { email, password });
      return { headers: { authorization: `Bearer ${login.data.token}` } };
    }

    const base = { name: "Hiro", species: "perro" };

    it("401 sin sesión", async () => {
      const get = await api.get("/store/customers/me/pets", { headers }).catch(asRes);
      const post = await api.post("/store/customers/me/pets", base, { headers }).catch(asRes);
      expect([get.status, post.status]).toEqual([401, 401]);
    });

    it("crear, listar (fallecidas al final), editar y borrar; ajenas → 404", async () => {
      const ana = await customerAuth("ana@example.com");
      const luis = await customerAuth("luis@example.com");

      const empty = await api.get("/store/customers/me/pets", ana.auth);
      expect(empty.data.pets).toEqual([]);

      const created = await api.post(
        "/store/customers/me/pets",
        {
          ...base,
          breed: "Border collie",
          birth_year: 2020,
          birth_month: 3,
          sex: "macho",
          neutered: "si",
          weight_kg: 18.26,
          origin: "criador",
          diet: "Pienso de salmón",
        },
        ana.auth,
      );
      expect(created.status).toBe(201);
      const hiro = created.data.pet as Pet;
      expect(hiro).toMatchObject({ name: "Hiro", weight_kg: 18.3, status: "casa", health: null });
      expect(hiro).not.toHaveProperty("photo_file_id");
      expect(hiro).not.toHaveProperty("share_token");

      const gone = await api.post(
        "/store/customers/me/pets",
        { name: "Luna", species: "gato", birth_year: 2005, death_year: 2022, death_month: 6 },
        ana.auth,
      );
      await api.post("/store/customers/me/pets", { name: "Nube", species: "conejo" }, ana.auth);

      const list = (await api.get("/store/customers/me/pets", ana.auth)).data.pets as Pet[];
      expect(list.map((p) => p.name)).toEqual(["Hiro", "Nube", "Luna"]);

      const edited = await api.post(
        `/store/customers/me/pets/${hiro.id}`,
        { ...base, name: "Hiro II", birth_year: 2020 },
        ana.auth,
      );
      expect((edited.data.pet as Pet).name).toBe("Hiro II");
      expect((edited.data.pet as Pet).breed).toBeNull();

      // Otro cliente: ni ve, ni edita, ni borra (404, como «no existe»).
      expect((await api.get("/store/customers/me/pets", luis.auth)).data.pets).toEqual([]);
      const foreignEdit = await api
        .post(`/store/customers/me/pets/${hiro.id}`, base, luis.auth)
        .catch(asRes);
      const foreignDel = await api
        .delete(`/store/customers/me/pets/${hiro.id}`, luis.auth)
        .catch(asRes);
      const foreignPhoto = await api
        .post(
          `/store/customers/me/pets/${hiro.id}/photo`,
          { content: WEBP, consent: true },
          luis.auth,
        )
        .catch(asRes);
      expect([foreignEdit.status, foreignDel.status, foreignPhoto.status]).toEqual([404, 404, 404]);

      const del = await api.delete(
        `/store/customers/me/pets/${(gone.data.pet as Pet).id}`,
        ana.auth,
      );
      expect(del.data.deleted).toBe(true);
      const after = (await api.get("/store/customers/me/pets", ana.auth)).data.pets as Pet[];
      expect(after.map((p) => p.name)).toEqual(["Hiro II", "Nube"]);
    });

    it("valida: fechas parciales, especie «otro», campos extra y salud sin consentimiento", async () => {
      const { auth } = await customerAuth("eva@example.com");
      const post = (body: object) => api.post("/store/customers/me/pets", body, auth).catch(asRes);

      expect((await post({ ...base, birth_month: 3 })).status).toBe(400); // mes sin año
      expect((await post({ ...base, birth_year: 2020, birth_day: 3 })).status).toBe(400); // día sin mes
      expect(
        (await post({ ...base, birth_year: 2021, birth_month: 2, birth_day: 30 })).status,
      ).toBe(400);
      expect((await post({ ...base, birth_year: new Date().getFullYear() + 1 })).status).toBe(400);
      expect((await post({ ...base, birth_year: 2020, death_year: 2019 })).status).toBe(400);
      expect((await post({ name: "X", species: "otro" })).status).toBe(400);
      expect((await post({ ...base, species: "dragon" })).status).toBe(400);
      expect((await post({ ...base, customer_id: "cus_otro" })).status).toBe(400);
      expect((await post({ ...base, health: "Alergia al pollo" })).status).toBe(400);

      const ok = await post({ name: "Pico", species: "otro", species_other: "Cobaya" });
      expect(ok.status).toBe(201);

      // Con consentimiento se guarda; retirarlo (o vaciar la salud) la borra.
      const withHealth = await post({ ...base, health: "Alergia al pollo", health_consent: true });
      const pet = withHealth.data.pet as Pet;
      expect(pet.health).toBe("Alergia al pollo");
      expect(pet.health_consent_at).toBeTruthy();
      const keep = await api.post(
        `/store/customers/me/pets/${pet.id}`,
        { ...base, health: "Alergia al pollo y al trigo", health_consent: true },
        auth,
      );
      expect((keep.data.pet as Pet).health_consent_at).toBe(pet.health_consent_at);
      const withdrawn = await api.post(`/store/customers/me/pets/${pet.id}`, base, auth);
      expect(withdrawn.data.pet).toMatchObject({ health: null, health_consent_at: null });
    });

    it("tope de mascotas por cliente", async () => {
      const { auth } = await customerAuth("muchas@example.com");
      for (let i = 0; i < 20; i++) {
        await api.post("/store/customers/me/pets", { name: `P${i}`, species: "gato" }, auth);
      }
      const extra = await api
        .post("/store/customers/me/pets", { name: "P20", species: "gato" }, auth)
        .catch(asRes);
      expect(extra.status).toBe(400);
    });

    it("foto pública: WebP con consentimiento; al cambiarla o quitarla se borra la anterior", async () => {
      const { auth } = await customerAuth("foto@example.com");
      const pet = (await api.post("/store/customers/me/pets", base, auth)).data.pet as Pet;
      const url = `/store/customers/me/pets/${pet.id}/photo`;

      expect((await api.post(url, { content: WEBP }, auth).catch(asRes)).status).toBe(400);
      expect(
        (await api.post(url, { content: WEBP, consent: false }, auth).catch(asRes)).status,
      ).toBe(400);
      const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, ...Array(20).fill(0)]).toString("base64");
      expect(
        (await api.post(url, { content: jpeg, consent: true }, auth).catch(asRes)).status,
      ).toBe(400);

      const files = container.resolve(Modules.FILE);
      const deleteSpy = jest.spyOn(files, "deleteFiles");
      const first = (await api.post(url, { content: WEBP, consent: true }, auth)).data.pet as Pet;
      expect(first.photo_url).toMatch(/mascotas\/.+\.webp$/);
      expect(first.photo_consent_at).toBeTruthy();
      const svc = container.resolve<PetsModuleService>(PETS_MODULE);
      const firstFile = (await svc.retrievePet(pet.id)).photo_file_id;

      const second = (await api.post(url, { content: WEBP, consent: true }, auth)).data.pet as Pet;
      expect(second.photo_url).not.toBe(first.photo_url);
      expect(deleteSpy).toHaveBeenCalledWith([firstFile]);

      const removed = (await api.delete(url, auth)).data.pet as Pet;
      expect(removed).toMatchObject({ photo_url: null, photo_consent_at: null });
      expect(deleteSpy).toHaveBeenCalledTimes(2);
    });

    it("admin: ver, crear (con autorización de salud), editar y borrar; cliente inexistente → 404", async () => {
      const ana = await customerAuth("admin-mascotas@example.com");
      const admin = await adminAuth();
      const url = `/admin/customers/${ana.id}/pets`;

      expect((await api.get(url, ana.auth).catch(asRes)).status).toBe(401);
      const noAuth = await api.post(url, { ...base, health: "Epilepsia" }, admin).catch(asRes);
      expect(noAuth.status).toBe(400);
      const created = await api.post(
        url,
        { ...base, health: "Epilepsia", health_consent: true },
        admin,
      );
      const pet = created.data.pet as Pet;
      expect(pet.health).toBe("Epilepsia");
      // El cliente la ve en su cuenta.
      const mine = (await api.get("/store/customers/me/pets", ana.auth)).data.pets as Pet[];
      expect(mine.map((p) => p.id)).toEqual([pet.id]);

      const edited = await api.post(`${url}/${pet.id}`, { ...base, name: "Kai" }, admin);
      expect(edited.data.pet).toMatchObject({ name: "Kai", health: null });
      expect(
        (await api.post(`${url}/${pet.id}/photo`, { content: WEBP, consent: true }, admin)).status,
      ).toBe(200);
      expect((await api.delete(`${url}/${pet.id}`, admin)).data.deleted).toBe(true);
      expect((await api.get(url, admin)).data.pets).toEqual([]);

      const missing = await api
        .post("/admin/customers/cus_noexiste/pets", base, admin)
        .catch(asRes);
      expect(missing.status).toBe(404);
    });

    it("baja de la cuenta: se borran sus mascotas", async () => {
      const ana = await customerAuth("baja@example.com");
      await api.post("/store/customers/me/pets", base, ana.auth);
      const before = events.length;
      await deleteCustomersWorkflow(container).run({ input: { ids: [ana.id] } });
      // Medusa emite `customer.deleted` (lo escucha el subscriber)…
      const data = await waitEvent("customer.deleted", before);
      expect(data).toMatchObject({ id: ana.id });
      expect(petsCustomerDeletedConfig.event).toBe("customer.deleted");
      // …y el subscriber se ejecuta en segundo plano. Para no depender de cuánto tarda (en el
      // runner del CI, más de 5 s), se ejecuta aquí y se espera: borrar es idempotente.
      await petsCustomerDeleted({
        event: { name: "customer.deleted", data: { id: ana.id } },
        container,
      } as Parameters<typeof petsCustomerDeleted>[0]);
      const svc = container.resolve<PetsModuleService>(PETS_MODULE);
      expect(await svc.listPets({ customer_id: ana.id })).toEqual([]);
    });
  },
});
