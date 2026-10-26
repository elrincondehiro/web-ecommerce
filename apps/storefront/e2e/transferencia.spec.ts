// e2e de la transferencia bancaria (Fase PG-3), SIN JS (mejora progresiva, AGENTS §3.2).
// Requisitos: los de checkout.spec.ts y cuenta.spec.ts (backend con Stripe de TEST,
// EMAIL_TRANSPORT=smtp → Mailpit en :8025) y la transferencia configurada en el backend
// (TRANSFER_IBAN y TRANSFER_HOLDER + `pnpm --filter backend stripe:region`).
// - Invitado: no ve la opción de transferencia.
// - Con cuenta: «Transferencia bancaria» → «Realizar pedido por transferencia» → pedido sin pagar, con el
//   IBAN y el concepto en la confirmación, en «Mis pedidos» y en el email.
import { expect, test, type Page } from "@playwright/test";
import { skipIfRemote, testEmail } from "./_remote";

const MAILPIT = process.env.MAILPIT_URL ?? "http://localhost:8025";
const PASSWORD = "Secreta-123";
const PRODUCT = "/producto/mock-clicker-esencial-018/";

async function mailText(page: Page, to: string, match: RegExp): Promise<string> {
  for (let i = 0; i < 30; i++) {
    const res = await page.request.get(
      `${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${to}`)}`,
    );
    const { messages } = (await res.json()) as { messages: { ID: string }[] };
    for (const m of messages) {
      const msg = (await (await page.request.get(`${MAILPIT}/api/v1/message/${m.ID}`)).json()) as {
        Text: string;
      };
      if (match.test(msg.Text)) return msg.Text;
    }
    await page.waitForTimeout(500);
  }
  throw new Error(`Sin email que cumpla ${match} para ${to}`);
}

async function createAccountAndLogin(page: Page, email: string) {
  await page.goto("/cuenta/registro/");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Contraseña").fill(PASSWORD);
  await page.getByLabel(/He leído y acepto/).check();
  await page.getByRole("button", { name: "Crear cuenta" }).click();
  const text = await mailText(page, email, /\/cuenta\/verificar\/\?token=/);
  const token = /\/cuenta\/verificar\/\?token=([\w.-]+)/.exec(text)![1];
  await page.goto(`/cuenta/verificar/?token=${token}`);
  await page.getByRole("button", { name: "Confirmar mi email" }).click();
  await page.goto("/cuenta/entrar/");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Contraseña").fill(PASSWORD);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/cuenta\/$/);
}

async function toPayment(page: Page, email?: string) {
  await page.goto(PRODUCT);
  await page
    .locator("#comprar")
    .getByRole("button", { name: /^Añadir .* al carrito$/ })
    .click();
  await page.goto("/checkout/");
  const data: Record<string, string> = {
    ...(email ? {} : { Email: testEmail("transferencia-invitado") }),
    Teléfono: "600 123 456",
    Nombre: "Ana",
    Apellidos: "Pérez",
    Dirección: "Calle Mayor 1",
    "Código postal": "28001",
    Población: "Madrid",
  };
  const step = page.locator("#datos");
  for (const [label, value] of Object.entries(data)) {
    await step.getByLabel(label, { exact: true }).first().fill(value);
  }
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByRole("button", { name: "Continuar al pago" }).click();
  await expect(page).toHaveURL(/\/checkout\/#pago$/);
}

test.describe("transferencia sin JS", () => {
  skipIfRemote();
  test.use({ javaScriptEnabled: false });

  test("invitado: no se ofrece", async ({ page }) => {
    await toPayment(page);
    await expect(page.getByText("Transferencia bancaria", { exact: true })).toHaveCount(0);
  });

  test("con cuenta: pedido pendiente con IBAN y concepto (confirmación, cuenta y email)", async ({
    page,
  }) => {
    const email = testEmail("transferencia");
    await createAccountAndLogin(page, email);
    await toPayment(page, email);
    // Dos opciones de primer nivel (<details name>): sin JS también se abren y cierran.
    await page.getByText("Transferencia bancaria", { exact: true }).click();
    await page.getByRole("button", { name: /^Realizar pedido por transferencia/ }).click();

    await expect(page).toHaveURL(/\/pedido\/order_[A-Za-z0-9]+\/$/);
    await expect(
      page.getByText("Lo prepararemos en cuanto recibamos la transferencia."),
    ).toBeVisible();
    const box = page.getByRole("region", { name: "Datos para la transferencia" });
    await expect(box).toContainText(/ES\d{2}( \w{4}){5}/);
    const concept = (await box.locator("dd").nth(3).innerText()).trim();
    expect(concept).toMatch(/^Pedido \d+$/);

    await box.getByRole("link", { name: "tu pedido" }).click();
    await expect(
      page.getByRole("region", { name: "Pendiente de pago por transferencia" }),
    ).toContainText(concept);

    const text = await mailText(page, email, /Concepto/);
    expect(text).toContain(concept);
    expect(text).toMatch(/IBAN\s+ES\d{2}/);
    expect(text).toContain("en cuanto recibamos la transferencia");
  });
});
