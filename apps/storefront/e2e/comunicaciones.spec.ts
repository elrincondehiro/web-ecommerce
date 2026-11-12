// e2e de «Comunicaciones» y de la baja de un clic (Fase MK-A), SIN JS (mejora progresiva,
// AGENTS §3.2). Requisitos: los de cuenta.spec.ts (backend con EMAIL_TRANSPORT=smtp → Mailpit) y
// el mismo COMMS_UNSUBSCRIBE_SECRET que el backend (se lee de apps/backend/.env o de la variable):
// el enlace de baja lo firma el backend al enviar un email comercial, y aún no hay ninguno
// (llegan en MK-D/MK-F), así que aquí se firma igual que en apps/backend/src/lib/comms-token.ts.
import { createHmac } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { skipIfRemote, testEmail } from "./_remote";

const MAILPIT = process.env.MAILPIT_URL ?? "http://localhost:8025";
const PASSWORD = "Secreta-123";

function secret(): string {
  if (process.env.COMMS_UNSUBSCRIBE_SECRET) return process.env.COMMS_UNSUBSCRIBE_SECRET;
  const file = new URL("../../backend/.env", import.meta.url);
  const env = existsSync(file) ? parseEnv(readFileSync(file, "utf8")) : {};
  return env.COMMS_UNSUBSCRIBE_SECRET ?? "";
}

function unsubscribeToken(customerId: string, topic: string): string {
  const body = `${customerId}.${topic}`;
  const sig = createHmac("sha256", secret()).update(`comms-baja/${body}`).digest("base64url");
  return `${body}.${sig}`;
}

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

/** Id del cliente de la sesión (el JWT de la cookie httpOnly lleva `actor_id`). */
async function customerId(page: Page): Promise<string> {
  const cookie = (await page.context().cookies()).find((c) => c.name === "customer_token");
  const payload = JSON.parse(
    Buffer.from(cookie!.value.split(".")[1]!, "base64url").toString("utf8"),
  ) as { actor_id: string };
  return payload.actor_id;
}

const topic = (page: Page, name: RegExp) => page.getByRole("checkbox", { name });

/** Accesibilidad (axe, como accesibilidad.spec.ts; necesita JS) y sin violaciones de la CSP. */
async function checkPage(page: Page, csp: string[]) {
  const { violations } = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"])
    .analyze();
  expect(violations.map((v) => v.id)).toEqual([]);
  expect(csp).toEqual([]);
}

test.describe("comunicaciones: accesibilidad y CSP (con JS)", () => {
  skipIfRemote();

  test("cuenta → Comunicaciones y /baja/ sin fallos de axe ni de la CSP", async ({ page }) => {
    const csp: string[] = [];
    page.on("console", (m) => {
      if (/Content Security Policy/i.test(m.text())) csp.push(m.text());
    });
    await createAccountAndLogin(page, testEmail("comms-a11y"));
    await page.goto("/cuenta/comunicaciones/");
    await topic(page, /Cumpleaños de mis peques/).check();
    await page.getByRole("button", { name: "Guardar" }).click();
    await expect(page.getByText("Preferencias guardadas.")).toBeVisible();
    await checkPage(page, csp);
    const id = await customerId(page);
    await page.goto(`/baja/?t=${encodeURIComponent(unsubscribeToken(id, "cumpleanos"))}`);
    await expect(page.getByRole("button", { name: "Darme de baja" })).toBeVisible();
    await checkPage(page, csp);
    await page.getByRole("button", { name: "Darme de baja" }).click();
    await expect(page.getByRole("heading", { name: "Te hemos dado de baja" })).toBeVisible();
    await checkPage(page, csp);
  });
});

test.describe("comunicaciones sin JS", () => {
  skipIfRemote();
  test.use({ javaScriptEnabled: false });

  test("todo apagado → activar → baja con el enlace del email → de nuevo apagado", async ({
    page,
  }) => {
    expect(secret().length, "COMMS_UNSUBSCRIBE_SECRET del backend").toBeGreaterThanOrEqual(32);

    await createAccountAndLogin(page, testEmail("comms"));
    await page
      .getByRole("navigation", { name: "Mi cuenta" })
      .getByRole("link", { name: "Comunicaciones" })
      .click();
    await expect(page).toHaveURL(/\/cuenta\/comunicaciones\/$/);
    for (const name of [/Novedades y ofertas/, /Cumpleaños de mis peques/, /Gincana de huellas/]) {
      await expect(topic(page, name)).not.toBeChecked();
    }

    await topic(page, /Novedades y ofertas/).check();
    await topic(page, /Gincana de huellas/).check();
    await page.getByRole("button", { name: "Guardar" }).click();
    await expect(page.getByText("Preferencias guardadas.")).toBeVisible();
    await expect(topic(page, /Novedades y ofertas/)).toBeChecked();
    await expect(topic(page, /Cumpleaños de mis peques/)).not.toBeChecked();
    await expect(topic(page, /Gincana de huellas/)).toBeChecked();
    await expect(page.getByText(/Activado el/)).toHaveCount(2);

    // Enlace del email: abrirlo NO da de baja; el botón sí.
    const id = await customerId(page);
    const baja = `/baja/?t=${encodeURIComponent(unsubscribeToken(id, "novedades"))}`;
    await page.goto(baja);
    await expect(page.getByText(/dejar de recibir emails de «Novedades y ofertas»/)).toBeVisible();

    await page.goto("/cuenta/comunicaciones/");
    await expect(topic(page, /Novedades y ofertas/)).toBeChecked();
    await page.goto(baja);
    await page.getByRole("button", { name: "Darme de baja" }).click();
    await expect(page.getByRole("heading", { name: "Te hemos dado de baja" })).toBeVisible();
    await expect(
      page.getByText("Ya no te enviaremos emails de «Novedades y ofertas»."),
    ).toBeVisible();

    // Baja de un clic del cliente de correo (RFC 8058): POST sin cookies ni Origin → 200 vacío.
    const oneClick = await page.request.fetch(
      `/baja/?t=${encodeURIComponent(unsubscribeToken(id, "gincana"))}`,
      {
        method: "POST",
        headers: { cookie: "" },
        form: { "List-Unsubscribe": "One-Click" },
      },
    );
    expect(oneClick.status()).toBe(200);
    expect(await oneClick.text()).toBe("");

    await page.goto("/cuenta/comunicaciones/");
    for (const name of [/Novedades y ofertas/, /Cumpleaños de mis peques/, /Gincana de huellas/]) {
      await expect(topic(page, name)).not.toBeChecked();
    }
  });

  test("enlace de baja no válido: mismo mensaje y sin errores", async ({ page }) => {
    for (const t of ["", "x", "cus_01KABCDEFGHJKMNPQRSTVWXYZ.novedades.firma-falsa"]) {
      await page.goto(`/baja/?t=${encodeURIComponent(t)}`);
      await expect(page.getByText("El enlace no es válido.")).toBeVisible();
      await expect(page.getByRole("button", { name: "Darme de baja" })).toHaveCount(0);
    }
    const res = await page.request.fetch("/baja/?t=x", {
      method: "POST",
      form: { "List-Unsubscribe": "One-Click" },
    });
    expect(res.status()).toBe(404);
  });
});
