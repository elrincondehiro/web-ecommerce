// e2e de los avisos de stock (Fase MK-B). Requisitos: los de cuenta.spec.ts (Mailpit) y el
// producto de prueba `prueba-arnes-estampado` (catalog/prueba-arnes: Rayas / M siempre agotada).
// - Sin JS: ficha agotada → «Avísame» sin sesión → Entrar → el aviso queda creado (cookie de
//   10 min, como el ♡) → «Avisos de stock» → Quitar. Otra vez desde la ficha con sesión.
// - Con JS: «Avísame» → toast (CartClient), sin recargar; axe y CSP en la página de avisos.
// El email lo prueba el backend (integration-tests/http/avisos-stock.spec.ts): aquí no se repone
// stock para no tocar los datos que usan otros e2e.
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { skipIfRemote, testEmail } from "./_remote";

const MAILPIT = process.env.MAILPIT_URL ?? "http://localhost:8025";
const PASSWORD = "Secreta-123";
const ESTAMPADO = "/producto/prueba-arnes-estampado/";

const pick = (page: Page, value: string) => page.locator(`label:has(input[value="${value}"])`);
const notify = (page: Page) =>
  page.locator("form[data-cart-form]").getByRole("button", { name: /^Agotado\. Avísame/ });

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

/** Cuenta verificada y SIN sesión (para probar el aviso pendiente al entrar). */
async function createVerifiedAccount(page: Page, email: string) {
  await page.goto("/cuenta/registro/");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Contraseña").fill(PASSWORD);
  await page.getByLabel(/He leído y acepto/).check();
  await page.getByRole("button", { name: "Crear cuenta" }).click();
  await page.goto(await verifyLink(page, email));
  await page.getByRole("button", { name: "Confirmar mi email" }).click();
}

async function login(page: Page, email: string) {
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Contraseña").fill(PASSWORD);
  await page.getByRole("button", { name: "Entrar" }).click();
}

async function soldOutCombo(page: Page) {
  await page.goto(ESTAMPADO);
  await pick(page, "Estampado:Rayas").click();
  await pick(page, "Talla:M").click();
  await expect(notify(page)).toBeVisible();
}

const rows = (page: Page) =>
  page.getByRole("list", { name: "Mis avisos de stock" }).getByRole("listitem");

test.describe("avisos de stock sin JS", () => {
  skipIfRemote();
  test.use({ javaScriptEnabled: false });

  test("sin sesión → entrar → creado → quitar; con sesión desde la ficha", async ({ page }) => {
    const email = testEmail("avisos");
    await createVerifiedAccount(page, email);

    await soldOutCombo(page);
    await notify(page).click();
    await expect(page).toHaveURL(/\/cuenta\/entrar\/\?next=/);
    await expect(page.getByText(/para que te avisemos cuando vuelva/)).toBeVisible();
    await login(page, email);
    await expect(page).toHaveURL(new RegExp(ESTAMPADO));

    await page.goto("/cuenta/avisos/");
    await expect(rows(page)).toHaveCount(1);
    await expect(rows(page).first()).toContainText("Variante: Rayas / M");
    await expect(rows(page).first()).toContainText("Esperando desde el");

    await rows(page)
      .first()
      .getByRole("button", { name: /^Quitar el aviso/ })
      .click();
    await expect(page.getByText("No tienes avisos de stock.")).toBeVisible();

    // Con sesión: vuelve a la ficha con el aviso (:target); repetir → «Ya te íbamos a avisar»
    await soldOutCombo(page);
    await notify(page).click();
    await expect(page).toHaveURL(/#aviso-alert_added$/);
    await expect(page.locator("#aviso-alert_added")).toBeVisible();
    await soldOutCombo(page);
    await notify(page).click();
    await expect(page.locator("#aviso-alert_already")).toBeVisible();
    await page.goto("/cuenta/avisos/");
    await expect(rows(page)).toHaveCount(1);
    // Se deja limpio: si alguien repone Rayas / M, no salen emails de los e2e.
    await rows(page)
      .first()
      .getByRole("button", { name: /^Quitar el aviso/ })
      .click();
    await expect(page.getByText("No tienes avisos de stock.")).toBeVisible();
  });
});

test.describe("avisos de stock con JS", () => {
  skipIfRemote();

  test("«Avísame» con toast, sin recargar; axe y CSP en «Avisos de stock»", async ({ page }) => {
    const csp: string[] = [];
    page.on("console", (m) => {
      if (/Content Security Policy/i.test(m.text())) csp.push(m.text());
    });
    const email = testEmail("avisos-js");
    await createVerifiedAccount(page, email);
    await page.goto("/cuenta/entrar/");
    await login(page, email);
    await expect(page).toHaveURL(/\/cuenta\/$/);

    await soldOutCombo(page);
    await notify(page).click();
    await expect(page.locator("#toasts")).toContainText("Te avisaremos por email cuando vuelva.");
    await expect(page).toHaveURL(new RegExp(`${ESTAMPADO}$`));

    // Resumen de la cuenta (Fase MK-D): «Estás esperando 1 producto»; temas activos
    await page.goto("/cuenta/comunicaciones/");
    await page.getByRole("checkbox", { name: /Novedades y ofertas/ }).check();
    await page.getByRole("button", { name: "Guardar" }).click();
    await page.goto("/cuenta/");
    await expect(page.locator("#resumen-avisos ~ p")).toContainText("Estás esperando 1 producto");
    await expect(page.locator("#resumen-comunicaciones ~ p")).toHaveText(
      "Recibes: Novedades y ofertas.",
    );

    await page.goto("/cuenta/avisos/");
    await expect(rows(page)).toHaveCount(1);
    const { violations } = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"])
      .analyze();
    expect(violations.map((v) => v.id)).toEqual([]);
    expect(csp).toEqual([]);
    await rows(page)
      .first()
      .getByRole("button", { name: /^Quitar el aviso/ })
      .click();
    await expect(page.getByText("No tienes avisos de stock.")).toBeVisible();
  });
});
