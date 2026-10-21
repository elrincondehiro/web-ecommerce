// e2e de pedidos de invitado → cuenta (Fase G). Requisitos: los de checkout.spec.ts (Stripe
// test, `pnpm infra:stripe`) y cuenta.spec.ts (EMAIL_TRANSPORT=smtp → Mailpit). Solo en local.
// - G-1: pedido de invitado → crear la cuenta con el mismo email → sale en «Mis pedidos» con la
//   insignia «Añadido a tu cuenta».
// - G-2 (sin JS): pedido de invitado con OTRO email → «¿Hiciste un pedido sin iniciar sesión?»
//   (nº + email) → aviso genérico → email al email del pedido → /cuenta/transferir/ → aceptar →
//   el pedido sale en «Mis pedidos». Un nº que no existe da el mismo aviso.
import { expect, test, type Page } from "@playwright/test";
import { skipIfRemote, testEmail } from "./_remote";

const MAILPIT = process.env.MAILPIT_URL ?? "http://localhost:8025";
const PASSWORD = "Secreta-123";
const PRODUCT = "/producto/mock-clicker-esencial-018/";

async function mailText(page: Page, to: string, match: RegExp): Promise<string> {
  for (let i = 0; i < 40; i++) {
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
  throw new Error(`Sin email para ${to}`);
}

/** Pedido como invitado con Stripe test (necesita JS) → nº de pedido. */
async function guestOrder(page: Page, email: string): Promise<string> {
  await page.goto(PRODUCT);
  await page
    .locator("#comprar")
    .getByRole("button", { name: /^Añadir .* al carrito$/ })
    .click();
  await expect(page.locator("#carrito-added:target, .toast").first()).toBeVisible();
  await page.goto("/checkout/");
  const step = page.locator("#datos");
  const data: Record<string, string> = {
    Email: email,
    Teléfono: "600 123 456",
    Nombre: "Ana",
    Apellidos: "Pérez",
    Dirección: "Calle Mayor 1",
    "Código postal": "28001",
    Población: "Madrid",
  };
  for (const [label, value] of Object.entries(data)) {
    await step.getByLabel(label, { exact: true }).first().fill(value);
  }
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await page.getByRole("button", { name: "Continuar al pago" }).click();
  const pay = page.getByRole("button", { name: /^Pagar y realizar pedido/ });
  await expect(pay).toBeEnabled({ timeout: 30_000 });
  const frame = page
    .locator('#pago-element iframe[name^="__privateStripeFrame"]')
    .first()
    .contentFrame();
  await frame
    .getByRole("textbox", { name: /Número de (la )?tarjeta|Card number/i })
    .fill("4242 4242 4242 4242");
  await frame.getByRole("textbox", { name: /caducidad|Expiration/i }).fill("12 / 34");
  await frame.getByRole("textbox", { name: /Código de seguridad|CVC/i }).fill("123");
  await pay.click();
  await expect(page).toHaveURL(/\/pedido\/order_[A-Za-z0-9]+\/$/, { timeout: 30_000 });
  const text = (await page.getByText(/Pedido #\d+/).textContent()) ?? "";
  return /#(\d+)/.exec(text)![1]!;
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
  await expect(page.getByText("¡Email confirmado!")).toBeVisible();
  await page.goto("/cuenta/entrar/");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Contraseña").fill(PASSWORD);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/cuenta\/$/);
}

/** «Mis pedidos» hasta que salga el pedido (los subscribers corren en el worker). */
async function expectInMyOrders(page: Page, displayId: string) {
  const row = page.getByRole("link", { name: new RegExp(`Pedido #${displayId}\\b`) });
  await expect(async () => {
    await page.goto("/cuenta/pedidos/");
    await expect(row).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 20_000 });
  return row;
}

test.describe("pedidos de invitado → cuenta", () => {
  skipIfRemote();
  test.skip(({ isMobile }) => isMobile, "el pago se prueba en escritorio");
  test.setTimeout(150_000);

  test("G-1: mismo email → al crear la cuenta sale en «Mis pedidos» con la insignia", async ({
    page,
  }) => {
    const email = testEmail("g1");
    const displayId = await guestOrder(page, email);
    await page.context().clearCookies();
    await createAccountAndLogin(page, email);
    const row = await expectInMyOrders(page, displayId);
    await expect(row.getByText("Añadido a tu cuenta")).toBeVisible();
  });

  test("G-2 sin JS: reclamar con otro email → aceptar desde el email", async ({
    page,
    browser,
  }) => {
    const orderEmail = testEmail("g2-relay");
    const accountEmail = testEmail("g2-cuenta");
    const displayId = await guestOrder(page, orderEmail);

    const ctx = await browser.newContext({ javaScriptEnabled: false });
    const nojs = await ctx.newPage();
    await createAccountAndLogin(nojs, accountEmail);
    await nojs.goto("/cuenta/pedidos/");
    await expect(
      nojs.getByRole("link", { name: new RegExp(`Pedido #${displayId}\\b`) }),
    ).toHaveCount(0);

    const claim = async (id: string, email: string) => {
      const box = nojs.locator("#reclamar");
      // `open=""` es un string vacío: se mira si el atributo existe.
      if ((await box.getAttribute("open")) === null) {
        await box.getByText("¿Hiciste un pedido sin iniciar sesión?").click();
      }
      await box.getByLabel("N.º de pedido").fill(id);
      await box.getByLabel("Email del pedido").fill(email);
      await box.getByRole("button", { name: "Añadir el pedido" }).click();
      await expect(nojs).toHaveURL(/\/cuenta\/pedidos\/#reclamar$/);
      await expect(nojs.locator("#reclamar").getByRole("status")).toContainText(
        "Si el pedido existe",
      );
    };
    // Un nº que no existe: el mismo aviso.
    await claim("99999999", orderEmail);
    await claim(`#${displayId}`, orderEmail);

    // Email al email del pedido → página → aceptar (sin JS, sin sesión: otro contexto).
    const text = await mailText(nojs, orderEmail, /\/cuenta\/transferir\/\?pedido=/);
    expect(text).toContain(`n.º ${displayId}`);
    const link = /(\/cuenta\/transferir\/\?pedido=[\w]+&token=[\w-]+)/.exec(text)![1]!;
    const ownerCtx = await browser.newContext({ javaScriptEnabled: false });
    const owner = await ownerCtx.newPage();
    await owner.goto(link);
    await expect(owner.getByText(`n.º ${displayId}`)).toBeVisible();
    await owner.getByRole("button", { name: "Sí, añadirlo a esa cuenta" }).click();
    await expect(owner.locator("main").getByRole("status")).toContainText(
      "Pedido añadido a la cuenta",
    );
    // El enlace ya no vale.
    await owner.goto(link);
    await expect(owner.getByText(/ya no está pendiente/)).toBeVisible();

    const row = await expectInMyOrders(nojs, displayId);
    await expect(row.getByText("Añadido a tu cuenta")).toHaveCount(0); // aceptado, no automático
    await ownerCtx.close();
    await ctx.close();
  });
});
