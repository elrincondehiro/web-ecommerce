import { medusaIntegrationTestRunner } from "@medusajs/test-utils";
import type { MedusaContainer } from "@medusajs/framework/types";
import { Modules } from "@medusajs/framework/utils";

/**
 * Carpetas del bucket (Fase H): `POST /admin/uploads` (formulario estándar del Admin y widgets)
 * pone la carpeta según la página de origen (`Referer`) o respeta una carpeta conocida en el
 * nombre (lib/upload-folders.ts). Se comprueba la CARPETA, no el resto de la clave: con S3
 * (`file-s3`, dev y producción) es `<carpeta>/<nombre>-<ulid>.<ext>` y con el proveedor local de
 * Medusa (CI, sin S3_BUCKET) `<carpeta>/<timestamp>-<nombre>.<ext>`.
 */
jest.setTimeout(60 * 1000);

medusaIntegrationTestRunner({
  testSuite: ({ api, getContainer }) => {
    let container: MedusaContainer;
    const uploaded: string[] = [];
    beforeEach(() => {
      container = getContainer();
    });
    // Sin dejar ficheros (con el proveedor local, en apps/backend/static/; con S3, en el bucket)
    afterEach(async () => {
      if (uploaded.length) await container.resolve(Modules.FILE).deleteFiles(uploaded.splice(0));
    });

    async function adminHeaders() {
      const email = `admin-${Date.now()}@example.com`;
      const password = "Admin-123456";
      const user = await container.resolve(Modules.USER).createUsers({ email });
      const auth = container.resolve(Modules.AUTH);
      const { authIdentity } = await auth.register("emailpass", {
        body: { email, password },
      } as never);
      await auth.updateAuthIdentities({ id: authIdentity!.id, app_metadata: { user_id: user.id } });
      const login = await api.post("/auth/user/emailpass", { email, password });
      return { authorization: `Bearer ${login.data.token as string}` };
    }

    const upload = async (headers: Record<string, string>, filename: string) => {
      const form = new FormData();
      form.append("files", new Blob([Buffer.from("x")], { type: "image/jpeg" }), filename);
      const res = await api.post("/admin/uploads", form, { headers });
      const id = (res.data.files as { id: string }[])[0]!.id;
      uploaded.push(id);
      return id;
    };

    it("carpeta según la página del Admin; respeta una carpeta conocida", async () => {
      const h = await adminHeaders();
      const from = (path: string) => ({ ...h, referer: `http://localhost:9000/app/${path}` });
      expect(await upload(from("products/prod_1/media"), "foto.jpg")).toMatch(
        /^productos\/[^/]*foto[^/]*\.jpg$/,
      );
      expect(await upload(from("products/create"), "x.jpg")).toMatch(/^productos\//);
      expect(await upload(from("categories/pcat_1"), "x.jpg")).toMatch(/^categorias\//);
      expect(await upload(from("collections/pcol_1"), "x.jpg")).toMatch(/^colecciones\//);
      expect(await upload(h, "x.jpg")).toMatch(/^contenido\//);
      // Nuestros widgets la dicen con la cabecera (gana al Referer); una carpeta desconocida no
      expect(
        await upload({ ...from("products/p"), "x-upload-folder": "colecciones" }, "y.webp"),
      ).toMatch(/^colecciones\/[^/]*y[^/]*\.webp$/);
      expect(await upload({ ...h, "x-upload-folder": "../etc" }, "z.jpg")).toMatch(/^contenido\//);
      // Una ruta en el nombre no cuenta (multer la quita)
      expect(await upload(h, "../../evil.jpg")).toMatch(/^contenido\/[^/]*evil[^/]*\.jpg$/);
    });
  },
});
