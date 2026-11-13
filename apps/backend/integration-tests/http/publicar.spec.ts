import { medusaIntegrationTestRunner } from "@medusajs/test-utils";
import type { MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import storefrontCatalogChanged, { config } from "../../src/subscribers/storefront-catalog-changed";

/**
 * Publicación del catálogo (fase 13): un cambio de catálogo deja la tienda «pendiente»; el homelab
 * pregunta (`GET /hooks/storefront-rebuild`, con secreto) y el workflow avisa al empezar y al
 * terminar; el Admin ve el estado y puede publicar ya.
 */
jest.setTimeout(120 * 1000);

const SECRET = "secreto-de-prueba-de-al-menos-32-caracteres";
type Res = { status: number; data: Record<string, unknown> };

medusaIntegrationTestRunner({
  env: { STOREFRONT_REBUILD_SECRET: SECRET, STOREFRONT_REBUILD_QUIET_MIN: "1" },
  testSuite: ({ api, getContainer }) => {
    let container: MedusaContainer;
    const hook = { headers: { "x-rebuild-secret": SECRET } };
    // Los tests HTTP comparten Redis: eventos de catálogo de otro fichero (catalogo.spec) pueden
    // llegar tarde a este proceso y marcar cambios en cualquier momento. Cada test parte de la
    // fila vacía y no comprueba nada que un cambio tardío pueda alterar.
    beforeEach(async () => {
      container = getContainer();
      await container
        .resolve(ContainerRegistrationKeys.PG_CONNECTION)
        .raw("DELETE FROM storefront_publish_state");
    });

    const admin = async () => {
      const email = `admin-${Date.now()}@example.com`;
      const password = "Admin-123456";
      const user = await container.resolve(Modules.USER).createUsers({ email });
      const auth = container.resolve(Modules.AUTH);
      const { authIdentity } = await auth.register("emailpass", {
        body: { email, password },
      } as never);
      await auth.updateAuthIdentities({ id: authIdentity!.id, app_metadata: { user_id: user.id } });
      const login = await api.post("/auth/user/emailpass", { email, password });
      return { headers: { authorization: `Bearer ${login.data.token}` } };
    };

    it("sin secreto o con otro: 401; con él, la respuesta del homelab", async () => {
      const no = await api
        .get("/hooks/storefront-rebuild")
        .catch((e: { response: Res }) => e.response);
      expect(no.status).toBe(401);
      const bad = await api
        .get("/hooks/storefront-rebuild", { headers: { "x-rebuild-secret": "x".repeat(40) } })
        .catch((e: { response: Res }) => e.response);
      expect(bad.status).toBe(401);
      const ok = await api.get("/hooks/storefront-rebuild", hook);
      expect(ok.status).toBe(200);
      expect(ok.data).toEqual({ publish: false, reason: expect.any(String) });
    });

    it("un cambio de catálogo deja la tienda pendiente; botón, inicio y fin", async () => {
      // Un cambio de catálogo (lo que hace el subscriber con cualquiera de CATALOG_EVENTS)
      expect(config.event).toEqual(
        expect.arrayContaining(["product.created", "price-list.prices_added"]),
      );
      await storefrontCatalogChanged({ container } as Parameters<
        typeof storefrontCatalogChanged
      >[0]);
      const next = (await api.get("/hooks/storefront-rebuild", hook)).data;
      expect(next).toEqual({ publish: false, reason: "esperando 1 min sin cambios" });

      const auth = await admin();
      const before = (await api.get("/admin/storefront-publish", auth)).data;
      expect(before.state.pending_since).not.toBeNull();
      expect(before.configured).toBe(true);
      await api.post("/admin/storefront-publish", {}, auth);
      expect((await api.get("/hooks/storefront-rebuild", hook)).data).toEqual({
        publish: true,
        reason: "pedido desde el Admin",
      });

      await api.post("/hooks/storefront-rebuild", { event: "queued" }, hook);
      expect((await api.get("/hooks/storefront-rebuild", hook)).data.reason).toBe("en cola");
      await api.post(
        "/hooks/storefront-rebuild",
        { event: "started", run_url: "https://git.example/run/7" },
        hook,
      );
      expect((await api.get("/hooks/storefront-rebuild", hook)).data.reason).toBe("en curso");
      await api.post(
        "/hooks/storefront-rebuild",
        { event: "finished", ok: false, error: "build" },
        hook,
      );
      const failed = (await api.get("/admin/storefront-publish", auth)).data.state;
      expect(failed).toMatchObject({
        status: "failed",
        error: "build",
        run_url: "https://git.example/run/7",
      });
      expect(failed.pending_since).not.toBeNull();

      await api.post("/hooks/storefront-rebuild", { event: "started" }, hook);
      await api.post("/hooks/storefront-rebuild", { event: "finished", ok: true }, hook);
      const done = (await api.get("/admin/storefront-publish", auth)).data.state;
      expect(done).toMatchObject({ status: "ok", error: null });

      const invalid = await api
        .post("/hooks/storefront-rebuild", { event: "otro" }, hook)
        .catch((e: { response: Res }) => e.response);
      expect(invalid.status).toBe(400);
      const anon = await api
        .get("/admin/storefront-publish")
        .catch((e: { response: Res }) => e.response);
      expect(anon.status).toBe(401);
    });
  },
});
