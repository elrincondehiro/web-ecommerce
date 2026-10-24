// e2e de «Mis peques» (Fase M), SIN JS (mejora progresiva, AGENTS §3.2). Requisitos: los de
// playwright.config.ts y cuenta.spec.ts (backend con EMAIL_TRANSPORT=smtp → Mailpit en :8025).
// - Alta con los dos consentimientos: sin marcarlos no se guarda nada y el formulario conserva lo
//   escrito; marcados, se guarda la salud y la foto (WebP de ≤ 800 px, sin metadatos).
// - Fallecida: en gris y al final; editar (retirar el consentimiento borra la salud); quitar con
//   el popover de confirmación (sin JS el popover nativo funciona igual).
import { expect, test, type Page } from "@playwright/test";
import sharp from "sharp";
import { skipIfRemote, testEmail } from "./_remote";

const MAILPIT = process.env.MAILPIT_URL ?? "http://localhost:8025";
const PASSWORD = "Secreta-123";

async function verifyLink(page: Page, to: string): Promise<string> {
  const re = /\/cuenta\/verificar\/\?token=([\w.-]+)/;
  for (let i = 0; i < 20; i++) {
    const res = await page.request.get(
      `${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${to}`)}`,
    );
    const { messages } = (await res.json()) as { messages: { ID: string }[] };
    for (const m of messages) {
      const msg = (await (await page.request.get(`${MAILPIT}/api/v1/message/${m.ID}`)).json()) as {
        Text: string;
      };
      const match = re.exec(msg.Text);
      if (match) return `/cuenta/verificar/?token=${match[1]}`;
    }
    await page.waitForTimeout(500);
  }
  throw new Error(`Sin email de verificación para ${to}`);
}

async function createAccountAndLogin(page: Page, email: string) {
  await page.goto("/cuenta/registro/");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Contraseña").fill(PASSWORD);
  await page.getByLabel(/He leído y acepto/).check();
  await page.getByRole("button", { name: "Crear cuenta" }).click();
  await page.goto(await verifyLink(page, email));
  await page.getByRole("button", { name: "Confirmar mi email" }).click();
  await page.goto("/cuenta/entrar/");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Contraseña").fill(PASSWORD);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/cuenta\/$/);
}

test.describe("mis peques sin JS", () => {
  skipIfRemote();
  test.use({ javaScriptEnabled: false });

  test("alta con consentimientos, fallecida, editar y quitar", async ({ page }) => {
    await createAccountAndLogin(page, testEmail("mascotas"));
    await page
      .getByRole("navigation", { name: "Mi cuenta" })
      .getByRole("link", { name: "Mis peques" })
      .click();
    await expect(page.getByText("Aún no has añadido ninguna mascota.")).toBeVisible();

    // Foto de móvil con GPS en el EXIF.
    const jpg = await sharp({
      create: { width: 2000, height: 1500, channels: 3, background: "#c08040" },
    })
      .jpeg()
      .withExif({ IFD3: { GPSLatitudeRef: "N", GPSLatitude: "40/1 25/1 0/1" } })
      .toBuffer();
    const photo = { name: "hiro.jpg", mimeType: "image/jpeg", buffer: jpg };

    await page.getByRole("link", { name: "+ Añadir mascota" }).click();
    await page.getByLabel("Nombre").fill("Hiro");
    await page.getByLabel("Tipo de animal").selectOption("perro");
    await page.getByLabel("Raza o mezcla").fill("Border collie");
    await page.locator("#f-birth_year").fill("2021");
    await page.locator("#f-birth_month").selectOption("3");
    await page.getByLabel(/Peso aproximado/).fill("18,5");
    await page.getByLabel(/^Salud/).fill("Alergia al pollo");
    await page.getByLabel(/Subir una foto/).setInputFiles(photo);

    // Sin las casillas: no se guarda nada y se conserva lo escrito.
    await page.getByRole("button", { name: "Añadir" }).click();
    await expect(page).toHaveURL(/\/cuenta\/mascotas\/nueva\/$/);
    await expect(page.getByText(/marca esta casilla o deja el campo de salud vacío/)).toBeVisible();
    await expect(page.getByText(/Para subir la foto, marca esta casilla/)).toBeVisible();
    await expect(page.getByLabel("Nombre")).toHaveValue("Hiro");
    await expect(page.getByLabel(/^Salud/)).toHaveValue("Alergia al pollo");

    await page.getByLabel(/Acepto que guardéis la información de salud/).check();
    await page.getByLabel(/Subir una foto/).setInputFiles(photo);
    await page.getByLabel(/Acepto que la foto sea/).check();
    await page.getByRole("button", { name: "Añadir" }).click();
    await expect(page).toHaveURL(/\/cuenta\/mascotas\/$/);
    await expect(page.getByRole("status").filter({ hasText: "Ficha guardada." })).toBeVisible();

    const hiro = page.locator("main ul.grid > li", { hasText: "Hiro" });
    await expect(hiro).toContainText("(aprox.)");
    await expect(hiro).toContainText("18,5 kg");
    await expect(hiro).toContainText("Salud: Alergia al pollo");
    const src = await hiro.getByRole("img", { name: "Foto de Hiro" }).getAttribute("src");
    const img = await (await page.request.get(src!)).body();
    const meta = await sharp(img).metadata();
    expect(meta.format).toBe("webp");
    expect(Math.max(meta.width!, meta.height!)).toBe(800);
    expect(meta.exif).toBeUndefined();

    // Fallecida: en gris, al final, sin edad actual.
    await page.getByRole("link", { name: "+ Añadir mascota" }).click();
    await page.getByLabel("Nombre").fill("Luna");
    await page.getByLabel("Tipo de animal").selectOption("gato");
    await page.locator("#f-birth_year").fill("2008");
    await page.locator("#f-death_year").fill("2023");
    await page.locator("#f-death_month").selectOption("6");
    await page.getByRole("button", { name: "Añadir" }).click();
    const cards = page.locator("main ul.grid > li");
    await expect(cards).toHaveCount(2);
    await expect(cards.last()).toContainText("En nuestro recuerdo · desde junio de 2023");
    await expect(cards.last()).toHaveClass(/bg-muted/);

    // Editar: retirar el consentimiento de salud la borra; quitar la foto.
    await hiro.getByRole("link", { name: "Editar" }).click();
    await expect(page.getByLabel(/^Salud/)).toHaveValue("Alergia al pollo");
    await page.getByLabel(/Acepto que guardéis la información de salud/).uncheck();
    await page.getByLabel(/^Salud/).fill("");
    await page.getByLabel("Quitar la foto").check();
    await page.getByRole("button", { name: "Guardar cambios" }).click();
    await expect(hiro).not.toContainText("Salud:");
    await expect(hiro.getByRole("img")).toHaveCount(0);
    expect((await page.request.get(src!)).status()).toBe(404);

    // Quitar (confirmación en popover).
    const luna = cards.filter({ hasText: "Luna" });
    await luna.getByRole("button", { name: "Quitar" }).click();
    await page.locator("[popover]:popover-open").getByRole("button", { name: "Quitar" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Ficha eliminada." })).toBeVisible();
    await expect(cards).toHaveCount(1);
  });
});
